// =============================================================
// ai-assistant.js
//
// Frontend for the AstraeaOS AI Assistant (Chat + Report modes).
// Talks only to this project's own backend (/api/ai/chat,
// /api/ai/report) — it never calls Groq or any search provider
// directly, and never sees GROQ_API_KEY/TAVILY_API_KEY, which live
// only in Vercel's server-side environment.
//
// Loaded as a plain classic <script> after firebase-init.js and
// app.js, so it shares the same global scope — it reads `state` and
// `userContext` (both declared with `let` in app.js) defensively,
// via typeof checks, so this file degrades gracefully rather than
// throwing if AstraeaOS's internal variable names ever change.
// =============================================================

(function () {
    'use strict';

    const aiState = {
        mode: 'chat',
        messages: [], // {role:'user'|'assistant', content:string}
        streaming: false,
        initialized: false,
    };

    // ---------- small DOM helpers ----------
    function $(id) { return document.getElementById(id); }

    function escapeHtmlLocal(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function renderMarkdown(text) {
        try {
            if (window.marked && window.DOMPurify) {
                const raw = window.marked.parse(text, { breaks: true });
                return window.DOMPurify.sanitize(raw, { ALLOWED_ATTR: ['href', 'target', 'rel', 'class'] });
            }
        } catch (e) { /* fall through to plain-text fallback below */ }
        // If the markdown libs failed to load (e.g. offline / CDN blocked),
        // never fall back to raw innerHTML of AI output — escape it instead.
        return `<p>${escapeHtmlLocal(text).replace(/\n/g, '<br>')}</p>`;
    }

    // ---------- auth ----------
    function currentFirebaseUser() {
        return (window._fbAuth && window._fbAuth.currentUser) || window._fbUser || null;
    }

    function isSignedIn() {
        const guest = (typeof userContext !== 'undefined' && userContext) ? !!userContext.isGuest : false;
        return !guest && !!currentFirebaseUser();
    }

    async function getIdToken() {
        const u = currentFirebaseUser();
        if (!u) throw new Error('not-signed-in');
        return u.getIdToken();
    }

    // ---------- light, safe app-context summary ----------
    // Best-effort only: if AstraeaOS's internal state shape has changed,
    // this quietly returns '' rather than breaking the AI panel.
    function buildAppContext() {
        try {
            const parts = [];
            if (typeof userContext !== 'undefined' && userContext) {
                if (userContext.examTarget) parts.push(`Target exam: ${userContext.examTarget}`);
            }
            if (typeof state !== 'undefined' && state && state.focus) {
                const f = state.focus;
                if (typeof f.todayMins === 'number') parts.push(`Focus minutes logged today: ${Math.floor(f.todayMins)}`);
                if (typeof f.dayStreak === 'number') parts.push(`Current study streak: ${f.dayStreak} day(s)`);
                if (typeof f.dailyTarget === 'number') parts.push(`Daily focus target: ${f.dailyTarget} min`);
            }
            if (typeof state !== 'undefined' && state && Array.isArray(state.doubts)) {
                const open = state.doubts.filter((d) => !d.cleared).length;
                if (open) parts.push(`Open (unresolved) doubts logged: ${open}`);
            }
            return parts.join('. ');
        } catch (e) {
            return '';
        }
    }

    // ---------- UI: mode switching ----------
    window.aiSwitchMode = function (mode) {
        aiState.mode = mode;
        document.querySelectorAll('.ai-mode-tab').forEach((el) => el.classList.toggle('active', el.dataset.aimode === mode));
        const chatPanel = $('ai-chat-mode'), reportPanel = $('ai-report-mode');
        if (chatPanel) chatPanel.classList.toggle('active', mode === 'chat');
        if (reportPanel) reportPanel.classList.toggle('active', mode === 'report');
    };

    window.aiInitPanel = function () {
        if (aiState.initialized) return;
        aiState.initialized = true;
        if (!isSignedIn()) {
            const log = $('ai-chat-log');
            if (log) {
                log.innerHTML = `<div class="ai-empty-state"><i class="ph ph-lock-key" style="font-size:2rem;color:var(--text-dim);display:block;margin:0 auto 10px;"></i>Sign in with an AstraeaOS account to use the AI assistant — it needs to verify who's asking before it will talk to the backend.</div>`;
            }
            const sendBtn = $('ai-send-btn'), reportBtn = $('ai-report-btn');
            if (sendBtn) sendBtn.disabled = true;
            if (reportBtn) reportBtn.disabled = true;
        }
    };

    window.aiAutoGrow = function (el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 140) + 'px';
    };

    window.aiHandleInputKeydown = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window.aiSendMessage(e);
        }
    };

    window.aiNewChat = function () {
        if (aiState.streaming) return;
        aiState.messages = [];
        const log = $('ai-chat-log');
        if (log) {
            log.innerHTML = `<div class="ai-empty-state"><i class="ph ph-sparkle" style="font-size:2rem;color:var(--accent);display:block;margin:0 auto 10px;"></i>New chat started.</div>`;
        }
    };

    function appendBubble(role, html, opts) {
        const log = $('ai-chat-log');
        if (!log) return null;
        const empty = $('ai-empty-state');
        if (empty) empty.remove();
        const div = document.createElement('div');
        div.className = `ai-msg ${role}${opts && opts.error ? ' error' : ''}`;
        div.innerHTML = html;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
    }

    function renderSources(container, sources) {
        if (!sources || !sources.length) return;
        const box = document.createElement('div');
        box.className = 'ai-sources';
        box.innerHTML = '<div class="ai-sources-label">Sources from the web</div>' +
            sources.map((s) => `<a class="ai-source-link" href="${escapeHtmlLocal(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtmlLocal(s.title || s.url)}</a>`).join('');
        container.appendChild(box);
    }

    function decodeSourcesHeader(headerVal) {
        if (!headerVal) return [];
        try {
            return JSON.parse(decodeURIComponent(escape(atob(headerVal))));
        } catch {
            return [];
        }
    }

    window.aiSendMessage = async function (event) {
        if (event && event.preventDefault) event.preventDefault();
        if (aiState.streaming) return false;
        if (!isSignedIn()) { window.aiInitPanel(); return false; }

        const input = $('ai-chat-input');
        const text = (input.value || '').trim();
        if (!text) return false;
        if (text.length > 4000) { alert('That message is too long (max 4000 characters).'); return false; }

        input.value = '';
        input.style.height = 'auto';

        aiState.messages.push({ role: 'user', content: text });
        appendBubble('user', `<p>${escapeHtmlLocal(text)}</p>`);

        const typing = appendBubble('assistant', '<div class="ai-typing"><span></span><span></span><span></span></div>');
        const sendBtn = $('ai-send-btn');
        aiState.streaming = true;
        if (sendBtn) sendBtn.disabled = true;

        try {
            const token = await getIdToken();
            const allowWebSearch = !!($('ai-websearch-toggle') && $('ai-websearch-toggle').checked);

            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    messages: aiState.messages,
                    allowWebSearch,
                    appContext: buildAppContext(),
                }),
            });

            if (!res.ok) {
                let msg = 'The assistant hit an error. Please try again.';
                try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
                typing.remove();
                appendBubble('assistant', `<p>${escapeHtmlLocal(msg)}</p>`, { error: true });
                aiState.messages.pop();
                return false;
            }

            const sources = decodeSourcesHeader(res.headers.get('x-astra-sources'));
            typing.remove();
            const bubble = appendBubble('assistant', '');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let full = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                full += decoder.decode(value, { stream: true });
                bubble.innerHTML = renderMarkdown(full);
                const log = $('ai-chat-log');
                if (log) log.scrollTop = log.scrollHeight;
            }
            if (!full.trim()) full = "I wasn't able to generate a response. Please try again.";
            bubble.innerHTML = renderMarkdown(full);
            renderSources(bubble, sources);
            aiState.messages.push({ role: 'assistant', content: full });
        } catch (e) {
            typing.remove();
            const friendly = e && e.message === 'not-signed-in'
                ? 'Sign in to use the AI assistant.'
                : 'Could not reach the AI assistant. Check your connection and try again.';
            appendBubble('assistant', `<p>${escapeHtmlLocal(friendly)}</p>`, { error: true });
            aiState.messages.pop();
        } finally {
            aiState.streaming = false;
            if (sendBtn) sendBtn.disabled = false;
        }
        return false;
    };

    // ---------- Report mode ----------
    window.aiGenerateReport = async function () {
        if (!isSignedIn()) { window.aiInitPanel(); return; }
        const topicEl = $('ai-report-topic');
        const topic = (topicEl.value || '').trim();
        if (!topic) { alert('Enter a topic for the report.'); topicEl.focus(); return; }

        const startDate = $('ai-report-start').value || undefined;
        const endDate = $('ai-report-end').value || undefined;
        const btn = $('ai-report-btn');
        const output = $('ai-report-output');

        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-circle-notch" style="animation:spin 0.8s linear infinite;"></i> Generating…';
        output.innerHTML = '<div class="ai-empty-state" style="margin-top:20px;">Searching the web and building your report — this can take up to 20-30 seconds.</div>';

        try {
            const token = await getIdToken();
            const res = await fetch('/api/ai/report', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ topic, startDate, endDate }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                output.innerHTML = `<div class="ai-empty-state" style="margin-top:20px;color:var(--danger);">${escapeHtmlLocal(data.error || 'Report generation failed.')}</div>`;
                return;
            }

            const rangeLabel = (data.dateRange && (data.dateRange.startDate || data.dateRange.endDate))
                ? `${data.dateRange.startDate || 'earliest'} → ${data.dateRange.endDate || 'now'}`
                : 'no date range specified';

            output.innerHTML = `
                <div class="ai-report-card">
                    <div class="ai-report-meta">
                        <span><i class="ph ph-calendar-blank"></i> ${escapeHtmlLocal(rangeLabel)}</span>
                        <span><i class="ph ph-globe"></i> ${data.sources ? data.sources.length : 0} web sources<span class="ai-badge-web">LIVE</span></span>
                        <span><i class="ph ph-clock"></i> ${new Date(data.generatedAt).toLocaleString()}</span>
                    </div>
                    <div id="ai-report-body">${renderMarkdown(data.reportMarkdown)}</div>
                    <div class="ai-report-actions">
                        <button class="btn" onclick="window.aiCopyReport()"><i class="ph ph-copy"></i> Copy Markdown</button>
                        <button class="btn" onclick="window.aiDownloadReport()"><i class="ph ph-download-simple"></i> Download .md</button>
                    </div>
                </div>`;
            window._aiLastReportMarkdown = data.reportMarkdown;
            window._aiLastReportTopic = topic;
        } catch (e) {
            output.innerHTML = `<div class="ai-empty-state" style="margin-top:20px;color:var(--danger);">Could not reach the server. Check your connection and try again.</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-magic-wand"></i> Generate Report';
        }
    };

    window.aiCopyReport = function () {
        if (!window._aiLastReportMarkdown) return;
        navigator.clipboard.writeText(window._aiLastReportMarkdown).then(
            () => alert('Report copied as Markdown.'),
            () => alert('Could not copy — your browser may have blocked clipboard access.')
        );
    };

    window.aiDownloadReport = function () {
        if (!window._aiLastReportMarkdown) return;
        const blob = new Blob([window._aiLastReportMarkdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `astraeaos-report-${(window._aiLastReportTopic || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 50)}.md`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };
})();
