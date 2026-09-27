// =============================================================
// ASTROCORE — app.js
// Extracted from app.html. Concatenated in original execution order:
// [1] Main App Bundle (calendar/timeline, focus, nexus tasks, astratest, etc.)
// [2] Trial Mode
// [3] Calendar Filter + Circular Fix
// [4] New Features Bundle (checkpoints, bulk subtopics, diary/doubt reminders, timeskip)
// =============================================================

// ---- [1] Main App Bundle ----


// ============================================================
// [AI NOTE] CALENDAR & TIMELINE ENGINE
// Merges Focus Logs and Activity Logs into a unified timeline.
// Includes navigation state and clean modals.
// ============================================================

let currentCalMode = 'week';
let calCurrentDate = new Date(); // [AI NOTE] Tracks which week/month we are currently viewing

// [AI NOTE] Hook into the existing navigation to render calendar when opened.
document.querySelectorAll('.nav-link:not(.nav-logout)').forEach(link => {
    link.addEventListener('click', () => {
        if(link.dataset.tab === 'timelinecal') {
            calToday(); // Always snap to current day when opening tab
        }
    });
});

// --- NAVIGATION CONTROLS ---
window.calShift = function(dir) {
    if(currentCalMode === 'week') {
        calCurrentDate.setDate(calCurrentDate.getDate() + (dir * 7));
        renderWeekView();
    } else {
        calCurrentDate.setMonth(calCurrentDate.getMonth() + dir);
        renderMonthView();
    }
};

window.calToday = function() {
    calCurrentDate = new Date();
    if(currentCalMode === 'week') renderWeekView();
    else renderMonthView();
};

window.setCalMode = function(mode) {
    currentCalMode = mode;
    document.getElementById('btn-view-week').classList.toggle('active', mode === 'week');
    document.getElementById('btn-view-month').classList.toggle('active', mode === 'month');
    document.getElementById('view-week-container').style.display = mode === 'week' ? 'block' : 'none';
    document.getElementById('view-month-container').style.display = mode === 'month' ? 'block' : 'none';
    if(mode === 'week') renderWeekView(); else renderMonthView();
};

// --- MODAL CONTROLLER ---
window.openCalModal = function(logDataStr) {
    let l = JSON.parse(decodeURIComponent(logDataStr));
    
    // Resolve CSS variable colors to actual hex for the color bar
    const colorMap = {
        'var(--prod)': '#10b981',
        'var(--unprod)': '#ef4444',
        'var(--sleep)': '#3b82f6',
        'var(--health)': '#ec4899',
        'var(--accent)': '#4f6ef7',
        'var(--border)': '#94a3b8'
    };
    let resolvedColor = colorMap[l.color] || l.color || '#4f6ef7';

    // Color bar at top of modal
    const colorBar = document.getElementById('cem-colorbar');
    if(colorBar) colorBar.style.background = `linear-gradient(90deg, ${resolvedColor}, ${resolvedColor}88)`;

    document.getElementById('cem-title').textContent = l.name;
    document.getElementById('cem-title').style.color = 'var(--text)';
    
    // Tags as styled badges
    document.getElementById('cem-subject').innerHTML = (l.tags||[]).map(t => 
        `<span style="font-size:0.62rem;padding:4px 10px;border-radius:99px;background:${resolvedColor}18;color:${resolvedColor};border:1px solid ${resolvedColor}40;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;">${t}</span>`
    ).join('');
    
    document.getElementById('cem-date').textContent = l.date;
    
    let start = new Date(l.startStamp);
    let end = new Date(l.startStamp + (l.duration * 60000));
    let timeStr = `${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} — ${end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
    document.getElementById('cem-time').textContent = timeStr;

    const durEl = document.getElementById('cem-duration');
    durEl.textContent = l.duration + ' min';
    durEl.style.color = resolvedColor;
    
    document.getElementById('cal-event-modal').style.display = 'flex';
};

// --- UNIFIED DATA FETCHER ---
// Splits a [startMs, startMs+durationMs) span into one segment per calendar day it
// touches, so a session that crosses midnight is credited to BOTH days instead of
// being dumped entirely on whichever single day its start happened to fall on.
function _splitSpanAcrossDays(startMs, durationMs) {
    const segments = [];
    let curStart = startMs;
    const endMs = startMs + durationMs;
    let guard = 0;
    while (curStart < endMs && guard < 3660) { // safety cap against runaway loops
        guard++;
        const d = new Date(curStart);
        const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
        const segEnd = Math.min(endMs, nextMidnight);
        segments.push({ date: getLocalIsoDate(d), startStamp: curStart, durationMs: segEnd - curStart });
        curStart = segEnd;
    }
    return segments;
}

function getUnifiedCalendarLogs() {
    let calLogs = [];
    
    // 1. Process standard activity logger data
    if (state.sw && state.sw.logs) {
        state.sw.logs.forEach(l => {
            if (l.duration < 60000) return;
            let startMs = l.stamp - l.duration; 
            
            let color = 'var(--border)';
            if(l.type === 'productive') color = 'var(--prod)';
            if(l.type === 'unproductive') color = 'var(--unprod)';
            if(l.type === 'sleep') color = 'var(--sleep)';
            if(l.type === 'health') color = 'var(--health)';

            _splitSpanAcrossDays(startMs, l.duration).forEach(seg => {
                const durMins = Math.floor(seg.durationMs / 60000);
                if (durMins < 1) return;
                calLogs.push({
                    startStamp: seg.startStamp,
                    duration: durMins,
                    name: l.desc || 'Activity',
                    date: seg.date,
                    color: color,
                    tags: [l.type, l.subject, l.studyType].filter(Boolean)
                });
            });
        });
    }

    // 2. Process Deep Focus Data
    if (state.focus && state.focus.logs) {
        state.focus.logs.forEach(l => {
            if (l.duration < 1) return;
            const durationMs = l.duration * 60000;
            let startMs = l.stamp - durationMs; 
            
            // Extract extra data if available
            let tags = ['FOCUS'];
            if(l.linkedTaskId && gg_db) {
                // Find mission name if linked
                Object.values(gg_db).flat().forEach(t => {
                    if(t.id === l.linkedTaskId) tags.push(`Task: ${t.name}`);
                });
            }
            if(l.chapter) tags.push(`Ch: ${l.chapter}`);

            _splitSpanAcrossDays(startMs, durationMs).forEach(seg => {
                const durMins = seg.durationMs / 60000;
                if (durMins < 1) return;
                calLogs.push({
                    startStamp: seg.startStamp,
                    duration: durMins,
                    name: l.taskTitle || 'Deep Focus',
                    date: seg.date,
                    color: 'var(--accent)', 
                    tags: tags
                });
            });
        });
    }
    
    return calLogs;
}

// ------------------------------------------------------------
// WEEK VIEW RENDERER (24-Hour Timeline)
// ------------------------------------------------------------
function renderWeekView() {
    var header = document.getElementById('cal-header');
    var grid = document.getElementById('cal-grid');
    if (!header || !grid) return;

    var startOfWeek = new Date(calCurrentDate);
    startOfWeek.setDate(calCurrentDate.getDate() - calCurrentDate.getDay());
    var endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);

    // Date badge
    var badge = document.getElementById('cal-date-badge');
    if (badge) {
        var opts = {month:'short', day:'numeric'};
        badge.textContent = startOfWeek.toLocaleDateString('en-US',opts) + ' – ' + endOfWeek.toLocaleDateString('en-US',opts);
    }

    var headerHtml = '<div></div>';
    var gridHtml = '<div class="cal-time-labels">';
    for (var h = 0; h < 24; h++) {
        var lbl = h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h-12) + ' PM';
        gridHtml += '<div class="cal-time-label" style="top:' + (h*60) + 'px;">' + lbl + '</div>';
    }
    gridHtml += '</div>';

    var unifiedLogs = getUnifiedCalendarLogs();
    var todayStr = getLocalIsoDate(new Date());

    for (var i = 0; i < 7; i++) {
        var d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i);
        var dateStr = getLocalIsoDate(d);
        var dayName = d.toLocaleDateString('en-US', {weekday:'short'});
        var isToday = dateStr === todayStr;

        var dateNumHtml = isToday
            ? '<div class="cal-today-num">' + d.getDate() + '</div>'
            : '<div style="font-size:1.3rem;font-weight:800;line-height:1;margin-top:3px;color:var(--text);">' + d.getDate() + '</div>';

        headerHtml += '<div class="cal-day-label' + (isToday ? ' is-today' : '') + '">'
            + '<div style="font-size:0.58rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:' + (isToday ? 'var(--accent)' : 'var(--text-dim)') + ';opacity:' + (isToday ? 1 : 0.55) + ';">' + dayName + '</div>'
            + dateNumHtml
            + '</div>';

        var colHtml = '<div class="cal-day-col' + (isToday ? ' is-today-col' : '') + '">';

        // Sleep band (0–6h tint)
        colHtml += '<div class="cal-sleep-band" style="top:0;height:360px;"></div>';

        // Hour + half-hour lines
        for (var hh = 0; hh < 24; hh++) {
            colHtml += '<div class="cal-grid-line hour" style="top:' + (hh*60) + 'px;"></div>';
            colHtml += '<div class="cal-grid-line half" style="top:' + (hh*60+30) + 'px;"></div>';
        }

        // Now-line for today
        if (isToday) {
            var n = new Date();
            var nowMins = n.getHours()*60 + n.getMinutes();
            colHtml += '<div class="cal-now-line" style="top:' + nowMins + 'px;"><div class="cal-now-dot"></div></div>';
        }

        // Place events with column-overlap detection
        var dayLogs = unifiedLogs.filter(function(l){ return l.date === dateStr; });
        dayLogs.sort(function(a,b){ return a.startStamp - b.startStamp; });
        var columns = [];
        dayLogs.forEach(function(l) {
            var dObj = new Date(l.startStamp);
            var startM = dObj.getHours()*60 + dObj.getMinutes();
            var endM = startM + Math.max(24, l.duration);
            var placed = false;
            for (var c = 0; c < columns.length; c++) {
                if (startM >= columns[c]) { l._col = c; columns[c] = endM; placed = true; break; }
            }
            if (!placed) { l._col = columns.length; columns.push(endM); }
        });
        var maxCols = columns.length || 1;
        var widthPct = 100 / maxCols;

        // Resolve CSS color vars to real hex for bg
        var colorHex = {
            'var(--prod)':'#10b981','var(--unprod)':'#ef4444',
            'var(--sleep)':'#3b82f6','var(--health)':'#ec4899',
            'var(--accent)':'#4f6ef7','var(--border)':'#64748b'
        };

        dayLogs.forEach(function(l) {
            var dObj = new Date(l.startStamp);
            var topPx = dObj.getHours()*60 + dObj.getMinutes();
            var heightPx = Math.max(24, l.duration);
            var leftPos = 'calc(' + (l._col * widthPct) + '% + 2px)';
            var boxWidth = 'calc(' + widthPct + '% - 4px)';
            var det = encodeURIComponent(JSON.stringify(l));
            var timeStr = dObj.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
            var hex = colorHex[l.color] || l.color || '#4f6ef7';
            var tags = (l.tags||[]).join(' ').toLowerCase();

            colHtml += '<div class="cal-event-block" data-type="' + tags + '" onclick="openCalModal(\'' + det + '\')"'
                + ' style="top:' + topPx + 'px;height:' + heightPx + 'px;width:' + boxWidth + ';left:' + leftPos + ';'
                + 'background:' + hex + '30;border-left-color:' + hex + ';">'
                + '<div class="cal-event-title">' + l.name + '</div>'
                + '<div class="cal-event-meta" style="color:' + hex + ';">' + timeStr + ' · ' + l.duration + 'm</div>'
                + '</div>';
        });

        colHtml += '</div>';
        gridHtml += colHtml;
    }

    header.innerHTML = headerHtml;
    grid.innerHTML = gridHtml;

    // Re-apply active filter without lag (no full re-render)
    if (window._calActiveFilter && window._calActiveFilter !== 'all') {
        window.calFilterType(window._calActiveFilter, null);
    }
}

// ------------------------------------------------------------
// MONTH VIEW RENDERER
// ------------------------------------------------------------
function renderMonthView() {
    var y = calCurrentDate.getFullYear();
    var m = calCurrentDate.getMonth();
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('month-title').textContent = months[m] + ' ' + y;

    var badge = document.getElementById('cal-date-badge');
    if (badge) badge.textContent = months[m] + ' ' + y;

    var firstDay = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();

    var colorHex = {
        'var(--prod)':'#10b981','var(--unprod)':'#ef4444',
        'var(--sleep)':'#3b82f6','var(--health)':'#ec4899',
        'var(--accent)':'#4f6ef7','var(--border)':'#64748b'
    };

    var html = '<div class="month-grid">';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d) {
        html += '<div class="month-day-header">' + d + '</div>';
    });

    for (var i = 0; i < firstDay; i++) {
        html += '<div class="month-cell" style="opacity:0.3;"></div>';
    }

    var todayStr = getLocalIsoDate(new Date());
    var unifiedLogs = getUnifiedCalendarLogs();

    for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var isToday = dateStr === todayStr;
        var dayLogs = unifiedLogs.filter(function(l){ return l.date === dateStr; });

        var hdrHtml = isToday
            ? '<div style="display:flex;justify-content:flex-end;margin-bottom:3px;"><span class="month-today-badge">' + d + '</span></div>'
            : '<div class="month-cell-header">' + d + '</div>';

        var chipsHtml = dayLogs.slice(0,4).map(function(l) {
            var det = encodeURIComponent(JSON.stringify(l));
            var hex = colorHex[l.color] || l.color || '#4f6ef7';
            return '<div class="month-chip" style="border-left-color:' + hex + ';background:' + hex + '28;" onclick="openCalModal(\'' + det + '\')">'
                + l.name + '</div>';
        }).join('');

        var moreHtml = dayLogs.length > 4
            ? '<div style="font-size:0.58rem;color:var(--text-dim);font-weight:800;padding:1px 4px;opacity:0.7;">+' + (dayLogs.length-4) + ' more</div>'
            : '';

        html += '<div class="month-cell' + (isToday ? ' is-today' : '') + '">'
            + hdrHtml + chipsHtml + moreHtml + '</div>';
    }

    var totalCells = firstDay + daysInMonth;
    var remaining = Math.ceil(totalCells / 7) * 7 - totalCells;
    for (var i = 0; i < remaining; i++) {
        html += '<div class="month-cell" style="opacity:0.3;"></div>';
    }

    html += '</div>';
    document.getElementById('cal-month-wrapper').innerHTML = html;

    if (window._calActiveFilter && window._calActiveFilter !== 'all') {
        window.calFilterType(window._calActiveFilter, null);
    }
}


// ============================================================
// BOOT GUARD
// ============================================================
let userContext = {
    uid: sessionStorage.getItem('astraea2_uid') || null,
    username: sessionStorage.getItem('astraea2_name') || 'Operative',
    avatarUrl: sessionStorage.getItem('astraea2_photo') || '',
    email: '',
    isGuest: false
};
// Redirect to login if no session
if(!userContext.uid) { window.location.href='index.html'; }

// ============================================================
// STATE
// ============================================================
let state = {
    focus:{ staminaPoints:30, dayStreak:0, lastStreakDate:'', dailyTarget:60, todayMins:0, time:1500, running:false, mode:'work', workM:25, breakM:5, reps:4, currentRep:1, total:0, sessions:0, logs:[], lastTrackedDate:getLocalIsoDate(new Date()), targetMetToday:false, lastMonthChecked:'', staminaLog:{}, streakLog:{} },


    sw:{ elapsed:0, running:false, lastStart:0, marker:0, logs:[] },
    doubts:[], events:[], settings:{ accent:'#4f6ef7', theme:'dark', strictMode:false, volAmbient:0.5, volAlert:0.7, diaryPin:'' },
    diary: []
};
let gg_db = {};
let trk_weeklyTaskNames = {}, trk_sundayTaskNames = {}, trk_data = {};
let trk_charts = {}, trk_monthlyCharts = {}, trk_yearlyChart = null;
let chartObserver = null, trackerRendered = false;
let strictModeActive = false;
let isMuted = false;
let syncTimeout = null;

// --- FOCUS SUB-TIMER STATE ---
let subTimerActive = false;
let subTimerTaskId = null;
let subTimerChapterId = null; 
let subTimerStartTime = 0;

// ============================================================
// INCOMPLETE MISSIONS — filter state
// ============================================================
let _incompleteFilter = 'all'; // 'all' | 'YYYY-MM' e.g. '2025-06'


// --- FOCUS SUB-TIMER LOGIC ---
function startFocusSubTimer(taskId, chapterId) {
    subTimerActive = true;
    subTimerTaskId = taskId;
    subTimerChapterId = chapterId; 
    subTimerStartTime = Date.now();  
}

function switchFocusSubTimer(newTaskId, newChapterId) {
    if (subTimerActive && subTimerTaskId) {
        let timeSpentMs = Date.now() - subTimerStartTime;
        let timeSpentMinutes = Math.floor(timeSpentMs / 60000); 
        syncSubTimeToDatabase(subTimerTaskId, subTimerChapterId, timeSpentMinutes);
    }
    subTimerTaskId = newTaskId;
    subTimerChapterId = newChapterId;
    subTimerStartTime = Date.now(); 
}

function stopFocusSubTimer() {
    if (subTimerActive && subTimerTaskId) {
        let timeSpentMs = Date.now() - subTimerStartTime;
        let timeSpentMinutes = Math.floor(timeSpentMs / 60000);
        syncSubTimeToDatabase(subTimerTaskId, subTimerChapterId, timeSpentMinutes);
    }
    subTimerActive = false;
    subTimerTaskId = null;
    subTimerChapterId = null;
}

function syncSubTimeToDatabase(taskId, chapterId, minutes) {
    if (minutes <= 0) return; 
    console.log(`Syncing ${minutes} minutes to Task: ${taskId}, Chapter: ${chapterId}`);
    
    // Increment task time on the Nexus V2 task, if this session was linked to one
    if (window.nx2AddFocusSeconds && taskId) {
        window.nx2AddFocusSeconds(taskId, Math.round(minutes * 60));
    }
    // Trigger global save
    if (typeof window.triggerSave === 'function') window.triggerSave();
}

// ============================================================
// UTILS
// ============================================================
function getLocalIsoDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatMins(s){ const m=Math.floor(s/60),ss=s%60; return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }
function formatMinsToHM(m){ const h=Math.floor(m/60), mm=Math.floor(m%60); return h>0?`${h}h ${mm}m`:`${mm}m`; }
function formatTimeDDHHMMSS(ms) {
    const totalS=Math.floor(ms/1000), d=Math.floor(totalS/86400), h=Math.floor((totalS%86400)/3600), m=Math.floor((totalS%3600)/60), s=totalS%60;
    if(d>0) return `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function formatStopwatchFull(ms) { const t=Math.floor(ms/1000), d=Math.floor(t/86400), h=Math.floor((t%86400)/3600), m=Math.floor((t%3600)/60), s=t%60; return `${String(d).padStart(2,'0')}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function formatWithDays(diff) { return formatTimeDDHHMMSS(diff); }
function renderTimeBlock(ms) {
    const totalS=Math.floor(ms/1000), d=Math.floor(totalS/86400), h=Math.floor((totalS%86400)/3600), m=Math.floor((totalS%3600)/60), s=totalS%60;
    const V=(n)=>`<span style="font-size:1.5rem;font-weight:800;font-family:var(--font-mono);">${n}</span>`;
    const U=(u)=>`<span style="font-size:0.55rem;text-transform:uppercase;color:var(--text-dim);letter-spacing:0.06em;margin-left:1px;margin-right:4px;">${u}</span>`;
    return `${d>0?V(d)+U('d'):''}${V(String(h).padStart(2,'0'))}${U('h')}${V(String(m).padStart(2,'0'))}${U('m')}${V(String(s).padStart(2,'0'))}${U('s')}`;
}
function sendSystemNotification(title, body) {
    if("Notification" in window && Notification.permission==="granted") new Notification(title,{body,icon:"https://api.dicebear.com/7.x/shapes/svg?seed=astraea"});
}
function getSwStats() {
    let prod=0, unprod=0;
    if(state.sw && state.sw.logs) state.sw.logs.forEach(l => { if(l.type==='productive') prod+=l.duration; else if(l.type==='unproductive') unprod+=l.duration; });
    return { prodMins:Math.floor(prod/60000), unprodMins:Math.floor(unprod/60000) };
}
function escapeHTML(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(s) {
    return escapeHTML(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ============================================================
// SAVE / LOAD
// ============================================================
// Boot-time reads must never trust the on-device Firestore cache blindly —
// persistentLocalCache() can happily answer getDoc() from a stale local
// snapshot (e.g. a phone that's been idle for days), which is exactly what
// caused a device to boot into old data, let you edit on top of it, and then
// push that whole stale state back over newer progress from another device.
// getDocFromServer() forces a real network round-trip so boot always reflects
// what's actually in the cloud. If there's truly no connection, fall back to
// the cache so the app still opens offline.
async function _getDocFresh(fns, ref) {
    try {
        return await fns.getDocFromServer(ref);
    } catch (e) {
        console.warn('Fresh server read failed, falling back to local cache:', e);
        return await fns.getDoc(ref);
    }
}
function _buildSavePayload() {
    // ownerUid records WHO this local snapshot belongs to (or 'guest' when
    // browsing without an account). bootSystem() uses this to decide whether
    // a local backup is safe to restore — see the guest→account migration
    // fix there.
    return { identity: { callsign: userContext.username, avatar: userContext.avatarUrl, email: userContext.email }, core: state, nexus: gg_db, tracker: { weekly: trk_weeklyTaskNames, sunday: trk_sundayTaskNames, data: trk_data }, alarms: alarms_db, updatedAt: Date.now(), ownerUid: window._fbUid || 'guest' };
}
// Synchronous safety-net backup — survives even if the tab closes before the
// debounced cloud write below ever fires (this was the #1 cause of "sometimes
// my focus session doesn't save": a 1s debounce with nothing to catch an early exit).
function _localBackupSave() {
    try { localStorage.setItem('astraea2_local_backup', JSON.stringify(_buildSavePayload())); } catch(e) {}
}
// Each section of the app now lives in its own Firestore document
// (users2/{uid}/appdata/main|diary|nexus|tracker|alarms) instead of one giant
// combined document. A write failure, a size limit, or a partial network
// error on one section (say, a huge diary or a bloated Nexus history) can no
// longer corrupt or block the others — each section saves and loads
// independently. `appdata/chapters` already followed this pattern; this
// brings the rest of the app in line with it.
async function _doCloudSaveSplit() {
    const db = window._fbDb, uid = window._fbUid, fns = window._fbFns;
    if(!(db && uid && uid !== 'guest' && fns)) return { ok:false };
    const now = Date.now();
    const stateNoDiary = { ...state };
    delete stateNoDiary.diary;
    const writes = [
        fns.setDoc(fns.doc(db, 'users2', uid, 'appdata', 'main'), { identity: { callsign: userContext.username, avatar: userContext.avatarUrl, email: userContext.email }, core: stateNoDiary, updatedAt: now, splitFormat: true }, {merge:true}),
        (async()=>{ const dp = window.v7PrepareDiarySync ? await window.v7PrepareDiarySync() : {diary:state.diary||[],vault:null}; return fns.setDoc(fns.doc(db, 'users2', uid, 'appdata', 'diary'), { diary: dp.diary || [], vault: dp.vault || null, updatedAt: now }, {merge:true}); })(),
        fns.setDoc(fns.doc(db, 'users2', uid, 'appdata', 'nexus'), { nexus: gg_db, nexusV2: state.nexusV2 || null, updatedAt: now }, {merge:true}),
        fns.setDoc(fns.doc(db, 'users2', uid, 'appdata', 'tracker'), { tracker: { weekly: trk_weeklyTaskNames, sunday: trk_sundayTaskNames, data: trk_data }, updatedAt: now }, {merge:true}),
        fns.setDoc(fns.doc(db, 'users2', uid, 'appdata', 'alarms'), { alarms: alarms_db, updatedAt: now }, {merge:true}),
    ];
    const results = await Promise.allSettled(writes);
    const failures = results.filter(r => r.status === 'rejected');
    failures.forEach(f => console.warn('Firestore section save error:', f.reason));
    return { ok: failures.length === 0, partial: failures.length > 0 && failures.length < writes.length };
}
// FIX: previously ANY failure here — genuinely being signed out, OR a real
// write failure while fully signed in (network blip, transient Firestore
// error, a rejected write) — showed the exact same "ERROR / GUEST" label and
// then simply gave up with no retry. That's what made a logged-in user's
// data silently stop syncing while the status dot told them they looked
// like a guest. Now the two cases are told apart, and a genuine write
// failure keeps retrying with backoff instead of stopping after one try.
var _mainSyncRetryTimer = null;
var _mainSyncAttempt = 0;
async function _doCloudSave() {
    const dot=document.getElementById('sync-dot'), txt=document.getElementById('sync-text');
    const db = window._fbDb, uid = window._fbUid, fns = window._fbFns;
    const setOnline = () => { if(dot) dot.className='status-dot online'; if(txt) txt.innerText='CLOUD SAVED'; };
    const setPartial = () => { if(dot) dot.className='status-dot online'; if(txt) txt.innerText='PARTIAL SAVE'; };
    const setSyncError = () => { if(dot) dot.className='status-dot syncing'; if(txt) txt.innerText='SYNC PENDING...'; };
    const setSignedOut = () => { if(dot) dot.className='status-dot online'; if(txt) txt.innerText='NOT SIGNED IN'; };

    if(_mainSyncRetryTimer) { clearTimeout(_mainSyncRetryTimer); _mainSyncRetryTimer = null; }

    if(!(db && uid && uid !== 'guest' && fns)) {
        // No signed-in account/db handle at all — the real "nothing to save to"
        // case, kept distinct from a save that actually failed while signed in.
        setSignedOut();
        return;
    }
    try {
        const result = await _doCloudSaveSplit();
        if(result.ok) { _mainSyncAttempt = 0; setOnline(); }
        else if(result.partial) { _mainSyncAttempt = 0; setPartial(); }
        else { throw new Error('all section writes failed'); }
    } catch(e) {
        console.warn('Firestore save error:', e);
        _mainSyncAttempt++;
        setSyncError();
        // Retry with backoff (5s, 10s, 20s... capped at 60s) instead of leaving
        // the save permanently failed — mirrors the chapter tracker's retry logic.
        const delay = Math.min(60000, 5000 * Math.pow(2, Math.min(_mainSyncAttempt - 1, 3)));
        _mainSyncRetryTimer = setTimeout(_doCloudSave, delay);
    }
}
function triggerSave() {
    const dot=document.getElementById('sync-dot'), txt=document.getElementById('sync-text');
    if(dot) { dot.className='status-dot syncing'; if(txt) txt.innerText='SYNCING...'; }
    if(syncTimeout) clearTimeout(syncTimeout);
    state.diary = state.diary || [];
    _localBackupSave(); // immediate, synchronous — never lost even if the debounce below gets cut off
    syncTimeout = setTimeout(_doCloudSave, 1000);
}
// Flush immediately (skip the debounce) whenever the tab is about to disappear,
// so a focus session ending right before a close/refresh still reaches the cloud.
function _flushSaveNow() {
    if(syncTimeout) { clearTimeout(syncTimeout); syncTimeout = null; _doCloudSave(); }
}
// Whenever the tab is about to hide/close mid-session, credit whatever partial
// minutes have accumulated in the current segment BEFORE flushing the save —
// otherwise the elapsed time just sits in memory and can be lost if the app
// doesn't get a clean chance to resume (e.g. mobile browser kills the tab).
function _focusSafeguardBeforeFlush() {
    try {
        if(state.focus && state.focus.running && state.focus.mode === 'work') {
            _focusFinalizeActiveSegment('autosave');
        }
    } catch(e) { /* never let the safeguard itself block the save */ }
}
document.addEventListener('visibilitychange', () => { if(document.hidden) { _focusSafeguardBeforeFlush(); _flushSaveNow(); } });
window.addEventListener('pagehide', () => { _focusSafeguardBeforeFlush(); _flushSaveNow(); });
window.addEventListener('beforeunload', () => { _focusSafeguardBeforeFlush(); _flushSaveNow(); });
// Heartbeat: every 20s while a focus session is running, checkpoint progress
// even if the person never touches a button (switch/pause/refresh). This is
// the fix for "sometimes my focus session doesn't save" — previously nothing
// wrote to disk between the moment a segment started and whenever it ended.
setInterval(() => {
    if(state.focus && state.focus.running) triggerSave();
}, 20000);

// ============================================================
// EXPORT / IMPORT
// ============================================================
window.setNavLayout = function(mode) {
    const shell = document.getElementById('main-os');
    shell.classList.remove('nav-horizontal','nav-dock');
    if(mode === 'horizontal') {
        shell.classList.add('nav-horizontal');
    } else if(mode === 'dock') {
        shell.classList.add('nav-dock');
    }
    const vb = document.getElementById('nav-vertical-btn');
    const hb = document.getElementById('nav-horizontal-btn');
    const db = document.getElementById('nav-dock-btn');
    if(vb) vb.style.outline = mode==='vertical' ? '2px solid var(--accent)' : 'none';
    if(hb) hb.style.outline = mode==='horizontal' ? '2px solid var(--accent)' : 'none';
    if(db) db.style.outline = mode==='dock' ? '2px solid var(--accent)' : 'none';
    if(!state.settings) state.settings = {};
    state.settings.navLayout = mode;
    triggerSave();
};

// ============================================================
// DATA MANAGEMENT — consolidated Export All / Import All / Delete All
// Export All is PIN-gated (reuses the same Security PIN as the old diary PIN)
// and lets the user pick exactly which sections to include.
// ============================================================
window.dataMgmt_exportAll = function() {
    if(!state.settings) state.settings = {};
    if(!state.settings.diaryPinEnabled) {
        // PIN lock is off — skip straight to picking which sections to export.
        document.getElementById('dm-sections-modal').style.display = 'flex';
        return;
    }
    if(!state.settings.diaryPin) {
        alert('Set a Security PIN first — this protects your data exports.');
        window.diary_setPin();
        if(!state.settings.diaryPin) return; // user cancelled setting a PIN
    }
    document.getElementById('dm-pin-input').value = '';
    document.getElementById('dm-pin-msg').textContent = '';
    document.getElementById('dm-pin-modal').style.display = 'flex';
};
window.dataMgmt_confirmPin = function() {
    const pin = document.getElementById('dm-pin-input').value.trim();
    const stored = state.settings?.diaryPin;
    const msg = document.getElementById('dm-pin-msg');
    if(pin !== stored) { msg.textContent = 'Incorrect PIN. Try again.'; document.getElementById('dm-pin-input').value=''; return; }
    document.getElementById('dm-pin-modal').style.display = 'none';
    document.getElementById('dm-sections-modal').style.display = 'flex';
};
window.dataMgmt_toggleAllSections = function(checked) {
    document.querySelectorAll('.dm-sec').forEach(cb => cb.checked = checked);
};
window.dataMgmt_closeModals = function() {
    const a = document.getElementById('dm-pin-modal'); if(a) a.style.display='none';
    const b = document.getElementById('dm-sections-modal'); if(b) b.style.display='none';
};
window.dataMgmt_runExport = function() {
    const selected = new Set([...document.querySelectorAll('.dm-sec:checked')].map(cb => cb.value));
    if(selected.size === 0) { alert('Pick at least one section to export.'); return; }
    const testHist = (() => { try { return JSON.parse(localStorage.getItem(`atest2_hist_${window.userContext?.uid||'guest'}`) || '[]'); } catch(e){ return []; } })();
    const payload = { meta:{ version:'4.0', exportedAt:new Date().toISOString(), user:userContext?.username, type:'export_all', sections:[...selected] } };
    // A lean "core" state export that always excludes whichever big sections
    // the person didn't ask for, so an "only Nexus" export isn't bloated with
    // everything else.
    const coreCopy = { ...state };
    if(!selected.has('diary')) delete coreCopy.diary;
    if(!selected.has('focus')) { delete coreCopy.focus; delete coreCopy.sw; }
    if(!selected.has('settings')) delete coreCopy.settings;
    payload.core = coreCopy;
    if(selected.has('nexus')) payload.nexus = gg_db;
    if(selected.has('tracker')) payload.tracker = { weekly: trk_weeklyTaskNames, sunday: trk_sundayTaskNames, data: trk_data };
    if(selected.has('settings')) payload.alarms = alarms_db;
    if(selected.has('chapters')) payload.chapters = window.ch_db || {};
    if(selected.has('tests')) payload.testHistory = testHist;
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const label = selected.size >= 7 ? 'ALL' : [...selected].join('-');
    a.href=url; a.download=`astraea-export-${label}-${getLocalIsoDate()}.json`;
    a.click(); URL.revokeObjectURL(url);
    window.dataMgmt_closeModals();
};

window.exportFullBackup = function() {
    const testHist = (() => { try { return JSON.parse(localStorage.getItem(`atest2_hist_${window.userContext?.uid||'guest'}`) || '[]'); } catch(e){ return []; } })();
    const payload = {
        meta:{ version:'3.0', exportedAt:new Date().toISOString(), user:userContext?.username, type:'full_complete' },
        core: state,
        nexus: gg_db,
        tracker:{ weekly:trk_weeklyTaskNames, sunday:trk_sundayTaskNames, data:trk_data },
        alarms: alarms_db,
        chapters: window.ch_db || {},
        testHistory: testHist
    };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`astraea-FULL-backup-${getLocalIsoDate()}.json`;
    a.click(); URL.revokeObjectURL(url);
};

window.exportData = function() {
    const stateWithoutDiary = { ...state, diary: [] };
    const payload = { meta:{ version:'2.0', exportedAt:new Date().toISOString(), user:userContext?.username, type:'full_no_diary' }, core:stateWithoutDiary, nexus:gg_db, tracker:{ weekly:trk_weeklyTaskNames, sunday:trk_sundayTaskNames, data:trk_data } };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`astraea-backup-${getLocalIsoDate()}.json`;
    a.click(); URL.revokeObjectURL(url);
};
window._diaryExportPending = null;
window.exportDiaryOnly = function() {
    const doExport = () => {
        const payload = { meta:{ version:'2.0', exportedAt:new Date().toISOString(), user:userContext?.username, type:'diary_only' }, diary: state.diary||[] };
        const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href=url; a.download=`astraea-diary-${getLocalIsoDate()}.json`;
        a.click(); URL.revokeObjectURL(url);
    };
    if(!state.settings || !state.settings.diaryPinEnabled) { doExport(); return; }
    if(!state.settings.diaryPin) { doExport(); return; } // lock on but no PIN ever set — nothing to check
    const pin = prompt('Enter your Security PIN to export the diary:');
    if(pin === null) return; // cancelled
    if(pin.trim() !== state.settings.diaryPin) { alert('Incorrect PIN.'); return; }
    doExport();
};
window.importData = async function(event) {
    const file = event?.target?.files?.[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const rawText = String(e.target.result || '').replace(/^\uFEFF/, '').trim();
            if(!rawText) throw new Error('Empty file');

            let data;
            try { data = JSON.parse(rawText); }
            catch(parseErr) { throw new Error('The selected file is not valid JSON.'); }

            // Universal Astraea importer.
            // Accepts old v2/v3 exports, v4 section exports, current full backups,
            // diary-only files, and wrapped backups from older builds.
            if(Array.isArray(data)) data = { testHistory:data };
            if(!data || typeof data !== 'object') throw new Error('Backup root must be an object.');

            const unwrap = (obj) => {
                let cur = obj;
                for(let i=0;i<4;i++){
                    if(cur && cur.backup && typeof cur.backup === 'object') cur = cur.backup;
                    else if(cur && cur.payload && typeof cur.payload === 'object') cur = cur.payload;
                    else if(cur && cur.data && typeof cur.data === 'object' &&
                            !cur.core && !cur.nexus && !cur.tracker && !cur.chapters) cur = cur.data;
                    else break;
                }
                return cur;
            };
            data = unwrap(data);

            const hasAnyKnownSection =
                data.core || data.nexus || data.tracker || data.alarms ||
                data.chapters || data.testHistory || data.diary ||
                data.settings || data.focus || data.sw || data.events ||
                data.doubts || data.nexusV2;

            if(!hasAnyKnownSection) throw new Error('No Astraea data sections were found in this JSON.');

            // Diary-only export.
            if(data.meta?.type === 'diary_only' || (data.diary && !data.core && !data.nexus && !data.tracker && !data.chapters)) {
                if(Array.isArray(data.diary)) state.diary = data.diary;
            } else {
                // Current format: core contains the main application state.
                if(data.core && typeof data.core === 'object') {
                    state = { ...state, ...data.core };
                }

                // Also accept flat/root-level state from older/custom backups.
                const flatKeys = ['focus','sw','doubts','events','settings','diary','nexusV5',
                    'stamina','timeskips','activeTimeskip','phases','timeskipPaused',
                    'calEvents','nexusV2','dailyReviews'];
                const flatCore = {};
                flatKeys.forEach(k => {
                    if(Object.prototype.hasOwnProperty.call(data,k)) flatCore[k] = data[k];
                });
                if(Object.keys(flatCore).length) state = { ...state, ...flatCore };

                if(data.nexus && typeof data.nexus === 'object') gg_db = data.nexus;
                if(data.nexusV2 && typeof data.nexusV2 === 'object') state.nexusV2 = data.nexusV2;

                if(data.tracker && typeof data.tracker === 'object') {
                    if(data.tracker.weekly && typeof data.tracker.weekly === 'object') trk_weeklyTaskNames = data.tracker.weekly;
                    if(data.tracker.sunday && typeof data.tracker.sunday === 'object') trk_sundayTaskNames = data.tracker.sunday;
                    if(data.tracker.data && typeof data.tracker.data === 'object') trk_data = data.tracker.data;
                }

                if(Array.isArray(data.alarms)) alarms_db = data.alarms;

                if(data.chapters && typeof data.chapters === 'object') {
                    window.ch_db = data.chapters;
                    // ch_save writes the chapter section to the dedicated Firestore doc.
                    try { localStorage.setItem('astraea2_ch', JSON.stringify(window.ch_db)); } catch(e){}
                }

                if(Array.isArray(data.testHistory)) {
                    const key = `atest2_hist_${window.userContext?.uid||'guest'}`;
                    let existing = [];
                    try { existing = JSON.parse(localStorage.getItem(key)||'[]'); } catch(e){}
                    const merged = [...data.testHistory];
                    existing.forEach(t => {
                        if(t && !merged.some(x => String(x.id)===String(t.id))) merged.push(t);
                    });
                    merged.sort((a,b)=>(Number(b.id)||0)-(Number(a.id)||0));
                    try { localStorage.setItem(key, JSON.stringify(merged.slice(0,100))); } catch(e){}

                    // Mirror imported tests into the same Firestore collection used
                    // by normal test submissions, so they sync to other devices.
                    const fdb = window._fbDb, fuid = window._fbUid, ffns = window._fbFns;
                    if(fdb && fuid && fuid!=='guest' && ffns) {
                        await Promise.allSettled(data.testHistory.slice(0,100).map((t,i)=>{
                            if(!t || typeof t!=='object') return Promise.resolve();
                            const id = t.id != null ? String(t.id) : `import_${Date.now()}_${i}`;
                            return ffns.setDoc(ffns.doc(fdb,'users2',fuid,'astratest',`test_${id}`), t, {merge:true});
                        }));
                    }
                }

                // Imported focus data must not be reset by the monthly streak logic.
                if(state.focus && typeof state.focus === 'object') {
                    const now = new Date();
                    const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
                    state.focus.lastMonthChecked = month;
                    if(!state.focus.staminaLog || typeof state.focus.staminaLog !== 'object') state.focus.staminaLog = {};
                    if(!state.focus.streakLog || typeof state.focus.streakLog !== 'object') state.focus.streakLog = {};
                    if(typeof state.focus.staminaPoints === 'number') state.focus.staminaLog[month] = state.focus.staminaPoints;
                }
            }

            // Normalize essentials so a partial/older backup can never crash boot.
            state = state && typeof state === 'object' ? state : {};
            state.focus = state.focus || {};
            state.sw = state.sw || {elapsed:0,running:false,lastStart:0,marker:0,logs:[]};
            state.doubts = Array.isArray(state.doubts) ? state.doubts : [];
            state.events = Array.isArray(state.events) ? state.events : [];
            state.diary = Array.isArray(state.diary) ? state.diary : [];
            state.settings = state.settings && typeof state.settings==='object' ? state.settings : {};

            // Save locally first, then force a cloud write. Nothing depends on a
            // page reload completing successfully.
            _localBackupSave();
            if(typeof window.ch_save === 'function' && data.chapters) window.ch_save();

            const fuid = window._fbUid;
            if(window._fbDb && fuid && fuid !== 'guest' && window._fbFns) {
                const result = await _doCloudSaveSplit();
                if(!result.ok) console.warn('Import cloud sync is pending; local recovery backup was kept.');
            }

            // Re-render immediately, then reload to re-run all boot-time hydration.
            try {
                applySettings();
                initCoreUI();
                window.ch_render && window.ch_render();
                updateHomeStats && updateHomeStats();
                updateFocusStatsGrid && updateFocusStatsGrid();
            } catch(renderErr) { console.warn('Post-import render warning:', renderErr); }

            alert('Import successful! Your Astraea data was restored and synced where possible. Refreshing…');
            window.location.reload();
        } catch(err) {
            console.error('Astraea import failed:', err);
            alert('Import failed: ' + (err?.message || 'Unsupported/invalid Astraea JSON backup.'));
        } finally {
            try { event.target.value = ''; } catch(e){}
        }
    };
    reader.onerror = () => alert('Import failed: could not read the selected file.');
    reader.readAsText(file);
};
// toggleDiaryNav removed — the diary tab can no longer be hidden.
window.clearAllData = function() {
    if(confirm('This will erase ALL cloud and session data. Are you sure?')) {
        state = {}; gg_db = {}; trk_weeklyTaskNames = {}; trk_sundayTaskNames = {}; trk_data = {};
        triggerSave(); window.location.reload();
    }
};

// ============================================================
// THEME ENGINE
// ============================================================
window.setTheme = function(mode) {
    // Legacy themes retired — gracefully redirect anyone with an old save to Dark Space
    if(mode==='nature' || mode==='neon') mode = 'dark';
    document.body.classList.remove('theme-dark','theme-light','theme-softglass','theme-japandi','theme-synthwave','theme-aurora','theme-midnight','theme-nature','theme-neon');
    if(mode==='dark') document.body.classList.add('theme-dark');
    else if(mode==='light') document.body.classList.add('theme-light');
    else if(mode==='softglass') document.body.classList.add('theme-softglass');
    else if(mode==='japandi') document.body.classList.add('theme-japandi');
    else if(mode==='midnight') document.body.classList.add('theme-midnight');
    ['dark','light','softglass','japandi'].forEach(t => {
        const btn = document.getElementById('theme-'+t+'-btn');
        if(btn) btn.style.outline = (t===mode) ? '3px solid var(--accent)' : 'none';
    });
    if(!state.settings) state.settings={};
    state.settings.theme = mode; triggerSave();
    // Re-apply any custom accent color on top of the new theme — themes set
    // --accent on <body> via CSS class, which would otherwise silently wipe
    // out a custom accent pick every time the theme changes.
    if(state.settings.accent) window.applyAccentColor(state.settings.accent);
};

// ── ACCENT COLOR (custom, independent of theme) ────────────────────────────
// Themes define --accent directly on the <body> element via CSS class rules
// (e.g. "body.theme-japandi{--accent:#b5825a}"). A declaration on the element
// itself always wins over an inherited value, so setting --accent on
// <html>/documentElement (as older code did) was silently overridden the
// moment a theme class was active. Setting it as an inline style directly on
// <body> instead beats the class-based rule and actually sticks.
window.applyAccentColor = function(color) {
    if(!color) return;
    document.body.style.setProperty('--accent', color);
    document.querySelectorAll('.theme-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.color === color);
    });
};
window.setAccent = function(color, el) {
    if(!color) return;
    if(!state.settings) state.settings = {};
    state.settings.accent = color;
    window.applyAccentColor(color);
    triggerSave();
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:'+color+';color:#fff;padding:9px 22px;border-radius:99px;font-weight:700;font-size:0.8rem;z-index:99999;box-shadow:0 4px 18px rgba(0,0,0,0.35);white-space:nowrap;letter-spacing:0.06em;';
    t.textContent = '✦ Accent color updated';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
};

// ── LAYOUT MODE (Mobile / PC) ─────────────────────────────────────────────
window.setLayoutMode = function(mode) {
    if(mode === 'mobile') {
        document.body.classList.add('layout-mobile');
    } else {
        document.body.classList.remove('layout-mobile');
    }
    const label = document.getElementById('layout-mode-label');
    if(label) label.textContent = mode === 'mobile' ? 'Mobile' : 'PC / Desktop';
    const pcBtn = document.getElementById('layout-pc-btn');
    const mBtn  = document.getElementById('layout-mobile-btn');
    if(pcBtn) pcBtn.style.outline = mode === 'pc'     ? '3px solid var(--accent)' : 'none';
    if(mBtn)  mBtn.style.outline  = mode === 'mobile' ? '3px solid var(--warn)'   : 'none';
    if(!state.settings) state.settings = {};
    state.settings.layoutMode = mode;
    triggerSave();
    // Toast
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:10px 24px;border-radius:99px;font-weight:700;font-size:0.82rem;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.3);letter-spacing:0.06em;white-space:nowrap;';
    t.textContent = mode === 'mobile' ? '📱 Mobile layout activated' : '🖥 PC layout activated';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
};

// ── FONT STUDIO ───────────────────────────────────────────────────────────
const FONT_MAP = {
    display: {
        default:  { css: 'var(--font-head, inherit)', label: 'System Default' },
        rusty:    { css: "'RustyAttack', serif",       label: 'Rusty Attack' },
        oswald:   { css: "'Oswald', sans-serif",        label: 'Oswald' },
        serif:    { css: "'Georgia', serif",            label: 'Georgia Serif' },
        mono:     { css: "'Courier New', monospace",    label: 'Monospace' },
        cursive:  { css: "'Palatino Linotype', 'Book Antiqua', cursive", label: 'Palatino' },
    },
    body: {
        default:  { css: 'var(--font-sans, inherit)',  label: 'System Default' },
        oswald:   { css: "'Oswald', sans-serif",        label: 'Oswald' },
        serif:    { css: "'Georgia', serif",            label: 'Georgia Serif' },
        mono:     { css: "'Courier New', monospace",    label: 'Monospace' },
        humanist: { css: "'Trebuchet MS', sans-serif",  label: 'Trebuchet' },
        palatino: { css: "'Palatino Linotype', 'Book Antiqua', serif", label: 'Palatino' },
    }
};

window.setAppFont = function(target, key, btn) {
    const map = FONT_MAP[target];
    if (!map || !map[key]) return;
    const css = map[key].css;
    const root = document.documentElement;
    if (target === 'display') {
        root.style.setProperty('--font-display', css);
        root.style.setProperty('--font-head', css);
        // update preview
        const p = document.getElementById('font-preview-display');
        if (p) { p.style.fontFamily = css; }
    } else {
        root.style.setProperty('--font-sans', css);
        document.body.style.fontFamily = css;
        const p = document.getElementById('font-preview-body');
        if (p) { p.style.fontFamily = css; }
    }
    // highlight active btn
    document.querySelectorAll(`.font-pick-btn[data-target="${target}"]`).forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // persist
    if (!state.settings) state.settings = {};
    if (!state.settings.fonts) state.settings.fonts = {};
    state.settings.fonts[target] = key;
    triggerSave();
    // toast
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:9px 22px;border-radius:99px;font-weight:700;font-size:0.8rem;z-index:99999;box-shadow:0 4px 18px rgba(0,0,0,0.3);white-space:nowrap;letter-spacing:0.06em;';
    t.textContent = `✦ ${map[key].label} applied`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
};


window.renderDailyReviews = function() {
    const el = document.getElementById('daily-reviews-list');
    if(!el) return;
    const reviews = state.dailyReviews || [];
    if(!reviews.length) { el.innerHTML = '<div style="font-size:0.8rem;color:var(--text-dim);padding:10px 0;">No daily reviews yet. Use the <strong>Daily Review</strong> button on the Home tab each evening.</div>'; return; }
    el.innerHTML = `<div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-dim);margin-bottom:10px;"><i class="ph ph-moon-stars"></i> Daily Reviews</div>`
        + reviews.slice(0,20).map(r => `
        <div style="padding:12px 14px;border-radius:10px;border:1px solid var(--border);margin-bottom:8px;background:rgba(255,255,255,0.02);">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <span style="font-weight:700;color:var(--accent);font-size:0.82rem;">${r.date}</span>
                <button onclick="window.deleteReview(${r.stamp})" style="border:none;background:none;color:var(--text-dim);cursor:pointer;font-size:0.75rem;padding:0;"><i class="ph ph-trash"></i></button>
            </div>
            ${r.wrong ? `<div style="font-size:0.8rem;color:var(--danger);margin-bottom:4px;"><i class="ph ph-warning"></i> ${r.wrong}</div>` : ''}
            ${r.fix   ? `<div style="font-size:0.8rem;color:var(--prod);"><i class="ph ph-lightbulb"></i> Fix: ${r.fix}</div>` : ''}
        </div>`).join('');
};
window.deleteReview = function(stamp) {
    if(!state.dailyReviews) return;
    state.dailyReviews = state.dailyReviews.filter(r => r.stamp !== stamp);
    triggerSave(); window.renderDailyReviews();
};

// ============================================================
// NAVBAR CUSTOMIZATION — show/hide + drag reorder
// ============================================================
const NAV_ITEMS = [
    {key:'home', label:'System Status', icon:'ph-planet'},
    {key:'summary', label:'Day Summary', icon:'ph-chart-bar'},
    {key:'diary', label:'Personal Diary', icon:'ph-notebook'},
    {key:'log', label:'Activity Logger', icon:'ph-timer'},
    {key:'doubts', label:'Doubt Diary', icon:'ph-question'},
    {key:'focus', label:'Deep Focus', icon:'ph-crosshair'},
    {key:'leaderboard', label:'Global Ranks', icon:'ph-trophy'},
    {key:'tracker', label:'Strategic Timeline', icon:'ph-chart-line-up'},
    {key:'events', label:'Event Horizon', icon:'ph-rocket'},
    {key:'missions', label:'Nexus Control', icon:'ph-list-checks'},
    {key:'chapters', label:'Chapter Tracker', icon:'ph-books'},
    {key:'astratest', label:'Astra Test', icon:'ph-flask'},
    {key:'timelinecal', label:'Timeline Calendar', icon:'ph-calendar-blank'}
];
const NAV_ITEM_KEYS = NAV_ITEMS.map(i => i.key);
function navGetOrder() {
    const saved = (state.settings && Array.isArray(state.settings.navOrder)) ? state.settings.navOrder.slice() : [];
    const cleaned = saved.filter(k => NAV_ITEM_KEYS.includes(k));
    NAV_ITEM_KEYS.forEach(k => { if(!cleaned.includes(k)) cleaned.push(k); });
    return cleaned;
}
window.applyNavCustomization = function() {
    const nav = document.querySelector('.astraea-shell > nav');
    if(!nav) return;
    const order = navGetOrder();
    const hidden = (state.settings && state.settings.navHidden) || {};
    order.forEach(key => {
        const el = nav.querySelector('.nav-link[data-tab="'+key+'"]');
        if(!el) return;
        el.style.display = hidden[key] ? 'none' : '';
        nav.appendChild(el);
    });
    // Settings + Logout + brand stay pinned at the very end, always visible.
    ['settings'].forEach(key => {
        const el = nav.querySelector('.nav-link[data-tab="'+key+'"]');
        if(el) { el.style.display = ''; nav.appendChild(el); }
    });
    const logoutEl = nav.querySelector('.nav-logout');
    const brandEl = nav.querySelector('.nav-brand');
    if(logoutEl) nav.appendChild(logoutEl);
    if(brandEl) nav.appendChild(brandEl);
};
window.renderNavCustomizer = function() {
    const box = document.getElementById('nav-customizer-list');
    if(!box) return;
    const order = navGetOrder();
    const hidden = (state.settings && state.settings.navHidden) || {};
    const meta = {}; NAV_ITEMS.forEach(i => meta[i.key] = i);
    box.innerHTML = order.map(key => {
        const m = meta[key]; if(!m) return '';
        const checked = hidden[key] ? '' : 'checked';
        return `<div class="nav-cust-row" draggable="true" data-tab="${key}"
                    ondragstart="window.navCust_dragStart(event)"
                    ondragover="window.navCust_dragOver(event)"
                    ondragleave="window.navCust_dragLeave(event)"
                    ondrop="window.navCust_drop(event)"
                    ondragend="window.navCust_dragEnd(event)">
            <span class="nav-cust-handle" title="Drag to reorder"><i class="ph ph-dots-six-vertical"></i></span>
            <i class="ph ${m.icon}" style="width:20px;text-align:center;color:var(--accent);font-size:1.05rem;"></i>
            <span class="nav-cust-label">${m.label}</span>
            <label class="nav-cust-toggle">
                <input type="checkbox" ${checked} onchange="window.navCust_toggleVisible('${key}', this.checked)">
                <span>${hidden[key] ? 'Hidden' : 'Visible'}</span>
            </label>
        </div>`;
    }).join('');
};
let _navDragKey = null;
window.navCust_dragStart = function(e) {
    _navDragKey = e.currentTarget.dataset.tab;
    e.currentTarget.classList.add('dragging');
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', _navDragKey); } catch(err) {}
};
window.navCust_dragOver = function(e) {
    e.preventDefault();
    if(e.currentTarget.dataset.tab !== _navDragKey) e.currentTarget.classList.add('drag-over');
};
window.navCust_dragLeave = function(e) {
    e.currentTarget.classList.remove('drag-over');
};
window.navCust_drop = function(e) {
    e.preventDefault();
    const targetKey = e.currentTarget.dataset.tab;
    document.querySelectorAll('.nav-cust-row').forEach(r => r.classList.remove('drag-over'));
    if(!_navDragKey || targetKey === _navDragKey) return;
    let order = navGetOrder();
    const from = order.indexOf(_navDragKey);
    const to = order.indexOf(targetKey);
    if(from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, _navDragKey);
    if(!state.settings) state.settings = {};
    state.settings.navOrder = order;
    triggerSave();
    window.renderNavCustomizer();
    window.applyNavCustomization();
};
window.navCust_dragEnd = function() {
    document.querySelectorAll('.nav-cust-row').forEach(r => r.classList.remove('dragging','drag-over'));
    _navDragKey = null;
};
window.navCust_toggleVisible = function(key, isVisible) {
    if(!state.settings) state.settings = {};
    if(!state.settings.navHidden) state.settings.navHidden = {};
    if(isVisible) delete state.settings.navHidden[key];
    else state.settings.navHidden[key] = true;
    triggerSave();
    window.renderNavCustomizer();
    window.applyNavCustomization();
};
window.navCust_resetAll = function() {
    if(!confirm('Reset navbar to the default order and show all items?')) return;
    if(!state.settings) state.settings = {};
    state.settings.navOrder = NAV_ITEM_KEYS.slice();
    state.settings.navHidden = {};
    triggerSave();
    window.renderNavCustomizer();
    window.applyNavCustomization();
};

window.applyFonts = function() {
    const fonts = (state.settings || {}).fonts || {};
    ['display', 'body'].forEach(target => {
        const key = fonts[target];
        if (key) {
            const btn = document.querySelector(`.font-pick-btn[data-target="${target}"][data-font="${key}"]`);
            window.setAppFont(target, key, btn);
        }
    });
};
function applySettings() {
    if(!state.settings) return;
    if(state.settings.theme) window.setTheme(state.settings.theme);
    else {
        // Default: light theme — highlight the light button
        const lightBtn = document.getElementById('theme-light-btn');
        if(lightBtn) lightBtn.style.outline = '3px solid var(--accent)';
    }
    if(state.settings.accent) {
        window.applyAccentColor(state.settings.accent);
    }
    if(state.settings.strictMode) { strictModeActive=true; document.getElementById('strict-slider').value=1; document.getElementById('strict-label').textContent='ON'; document.getElementById('strict-label').style.color='var(--danger)'; }
    if(state.settings.volAmbient !== undefined) { const el=document.getElementById('vol-ambient'); if(el){el.value=state.settings.volAmbient; window.setVolume('ambient',state.settings.volAmbient);} }
    if(state.settings.volAlert !== undefined) { const el=document.getElementById('vol-alert'); if(el){el.value=state.settings.volAlert; window.setVolume('alert',state.settings.volAlert);} }
    // Diary is always visible now — no more hide/lock toggle. If an old save still
    // has the diary nav hidden from a previous version, force it back on.
    (function(){
        const diaryLink = document.querySelector('.nav-link[data-tab="diary"]');
        if(diaryLink) { diaryLink.style.display=''; diaryLink.title='Personal Diary'; }
    })();
    if(state.settings.navLayout) window.setNavLayout(state.settings.navLayout);
    if(state.settings.layoutMode) window.setLayoutMode(state.settings.layoutMode);
    window.applyFonts();
    window.applyNavCustomization && window.applyNavCustomization();
}

// ============================================================
// AUDIO
// ============================================================
window.setVolume = function(track, val) {
    const v = parseFloat(val);
    if(track==='ambient') {
        document.getElementById('audio-ambient').volume = v;
        document.getElementById('vol-ambient-val').textContent = Math.round(v*100)+'%';
        if(!state.settings) state.settings={};
        state.settings.volAmbient = v;
    } else {
        document.getElementById('audio-pika').volume = v;
        document.getElementById('audio-goku').volume = v;
        document.getElementById('vol-alert-val').textContent = Math.round(v*100)+'%';
        if(!state.settings) state.settings={};
        state.settings.volAlert = v;
    }
    triggerSave();
};
window.toggleMute = function() {
    isMuted = !isMuted;
    ['audio-ambient','audio-pika','audio-goku'].forEach(id => document.getElementById(id).muted = isMuted);
    document.getElementById('mute-toggle').innerHTML = isMuted ? '<i class="ph ph-speaker-slash"></i> Unmute All' : '<i class="ph ph-speaker-high"></i> Mute All';
};
window.setStrictMode = function(val) {
    strictModeActive = val==='1';
    if(!state.settings) state.settings={};
    state.settings.strictMode = strictModeActive;
    document.getElementById('strict-label').textContent = strictModeActive?'ON':'OFF';
    document.getElementById('strict-label').style.color = strictModeActive?'var(--danger)':'var(--text-dim)';
    triggerSave();
};

// ============================================================
// STRICT MODE
// ============================================================
document.addEventListener('visibilitychange', () => {
    if(strictModeActive && state.focus.running && document.hidden) {
        const warn = document.getElementById('tab-switch-warning');
        warn.style.display='block';
        if(state.focus.running && state.focus.mode==='work') {
            state.focus.running = false; delete state.focus.endTime;
            document.getElementById('audio-ambient').pause();
            document.getElementById('f-toggle').innerHTML="<i class='ph ph-power'></i> Initiate Mission";
            triggerSave();
        }
        setTimeout(() => { warn.style.display='none'; }, 5000);
    }
});

// ============================================================
// NO ESCAPE DURING EXAM
// ============================================================
window._atExamActive = false;
window.history.pushState(null,'',window.location.href);
window.addEventListener('popstate',()=>{
    if(window._atExamActive){
        window.history.pushState(null,'',window.location.href);
        _showExamEscapeWarning();
    }
});
document.addEventListener('keydown',(e)=>{
    if(!window._atExamActive)return;
    if(e.key==='Escape'||e.key==='F5'||(e.ctrlKey&&(e.key==='r'||e.key==='w'||e.key==='q'))){
        e.preventDefault();e.stopPropagation();
        _showExamEscapeWarning();
    }
});
window.addEventListener('beforeunload',(e)=>{
    if(window._atExamActive){e.preventDefault();e.returnValue='Exam in progress! You must submit or complete the test.';}
});
function _showExamEscapeWarning(){
    const overlay=document.getElementById('at-escape-warning');
    if(overlay)overlay.style.display='flex';
    setTimeout(()=>{if(overlay)overlay.style.display='none';},3000);
}

// ============================================================
// PROFILE
// ============================================================
window.logout = async function() {
    if(confirm("Terminate session?")) {
        sessionStorage.removeItem('astraea2_uid');
        if(window._fbAuth) { const { signOut } = window._fbAuthFns; await signOut(window._fbAuth).catch(()=>{}); }
        window.location.href='index.html';
    }
};

window.deleteAccount = async function() {
    const confirmed1 = confirm("⚠️ DELETE ACCOUNT\n\nThis will permanently erase ALL your data (logs, tasks, chapters, test history, everything) and delete your account.\n\nThis CANNOT be undone.\n\nAre you absolutely sure?");
    if(!confirmed1) return;
    const confirmed2 = confirm("Last warning — type OK to confirm deletion of your account and all Astraea OS data.");
    if(!confirmed2) return;
    try {
        const uid = window._fbUid || (window._fbAuth && window._fbAuth.currentUser && window._fbAuth.currentUser.uid);
        if(uid && window._fbDb && window._fbFns) {
            const { doc, setDoc, collection, getDocs } = window._fbFns;
            // Delete main appdata docs
            const colls = ['appdata','users2'];
            for(const coll of colls) {
                try {
                    const snap = await getDocs(collection(window._fbDb, coll));
                    for(const d of snap.docs) {
                        if(d.id === uid || d.ref.path.includes(uid)) {
                            await setDoc(d.ref, {__deleted:true,__deletedAt:Date.now()});
                        }
                    }
                } catch(e) {}
            }
            // Try to delete the user from Firebase Auth
            if(window._fbAuth && window._fbAuth.currentUser) {
                try { await window._fbAuth.currentUser.delete(); } catch(e) {
                    // Re-auth may be needed; just sign out if delete fails
                }
            }
        }
        sessionStorage.clear();
        localStorage.clear();
        alert("Account deleted. Goodbye.");
        window.location.href='index.html';
    } catch(e) {
        alert("Error deleting account: " + e.message + "\n\nPlease contact support if this persists.");
    }
};
function setupProfileUI() {
    const ava = userContext?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=operative&backgroundColor=transparent`;
    ['top-avatar','pm-avatar'].forEach(id => { const el=document.getElementById(id); if(el) el.src=ava; });
    const tg=document.getElementById('top-greeting'); if(tg) tg.innerText=userContext?.username||"GUEST";
    const pn=document.getElementById('pm-name'); if(pn) pn.innerText=userContext?.username||"GUEST";
    const pe=document.getElementById('pm-email'); if(pe) pe.innerText=userContext?.email||"";
    const adminLink=document.getElementById('nav-admin-link');
    if(adminLink) adminLink.style.display = window.isAdminUser && window.isAdminUser() ? '' : 'none';
}
window.ADMIN_EMAIL = '207edx@gmail.com';
window.isAdminUser = function(){
    const email = (userContext && userContext.email) || (window._fbUser && window._fbUser.email) || '';
    return String(email).trim().toLowerCase() === window.ADMIN_EMAIL;
};
window.unlockEdit = function(id) {
    const el = document.getElementById(id); if(!el) return;
    el.removeAttribute('readonly'); el.focus();
    document.getElementById('pm-save-btn').style.display='flex';
};
window.openProfile = function() {
    document.getElementById('pm-streak').innerText = state?.focus?.dayStreak||0;
    document.getElementById('pm-mins').innerText = Math.floor(state?.focus?.total||0);
    document.getElementById('pm-stamina').innerText = state?.focus?.staminaPoints||30;
    document.getElementById('pm-sessions').innerText = state?.focus?.sessions||0;
    document.getElementById('pm-edit-name').value = userContext?.username||"GUEST";
    document.getElementById('pm-edit-email').value = userContext?.email||"";
    document.getElementById('pm-edit-pass').value = "";
    ['pm-edit-name','pm-edit-email','pm-edit-pass'].forEach(id => document.getElementById(id).setAttribute('readonly','true'));
    document.getElementById('pm-save-btn').style.display='none';
    document.getElementById('profile-modal').style.display='flex';
};
window.closeProfile = function() { document.getElementById('profile-modal').style.display='none'; };
window.saveSystemIdentity = async function() {
    if(userContext.isGuest) return alert("Login to update identity.");
    const newName=document.getElementById('pm-edit-name').value.trim();
    const newPass=document.getElementById('pm-edit-pass').value.trim();
    const newEmail=document.getElementById('pm-edit-email').value.trim();
    if(!newName) return alert("Callsign cannot be empty.");
    // [SECURITY FIX] This is shown to every other user on the public
    // leaderboard (rendering side is now escaped too — defense in depth).
    if(newName.length > 60 || /[<>]/.test(newName)) {
        return alert("Callsign must be under 60 characters and cannot contain < or >.");
    }
    userContext.username=newName; userContext.email=newEmail;
    try {
        const { updateProfile, updatePassword } = window._fbAuthFns;
        const fbUser = window._fbAuth ? window._fbAuth.currentUser : null;
        if(fbUser) {
            await updateProfile(fbUser, { displayName: newName });
            if(newPass && newPass.length >= 6) await updatePassword(fbUser, newPass).catch(e=>alert('Password update failed: '+e.message));
        }
        triggerSave();
    } catch(e) { console.warn('Profile update error:', e); }
    setupProfileUI();
    document.getElementById('pm-save-btn').style.display='none';
    ['pm-edit-name','pm-edit-email','pm-edit-pass'].forEach(id => document.getElementById(id).setAttribute('readonly','true'));
    document.getElementById('pm-edit-pass').value="";
    alert("Identity updated.");
};
window.promptAvatarUrl = async function() {
    if(userContext.isGuest) return alert("Login to change your avatar.");
    const url = prompt("Enter image URL for your avatar:", userContext.avatarUrl || '');
    if(!url || !url.trim()) return;
    const trimmed = url.trim();
    // [SECURITY FIX] This value is later shown to every other user on the
    // public leaderboard and to the admin panel. The render side is now
    // escaped (defense in depth done there), but reject obviously-bad
    // input here too rather than silently accepting anything typed in.
    if(!/^https:\/\/[^\s"'<>]+$/i.test(trimmed) || trimmed.length > 500) {
        return alert("Please enter a valid https:// image URL (no spaces or quote characters).");
    }
    try {
        userContext.avatarUrl = trimmed;
        const { updateProfile } = window._fbAuthFns;
        const fbUser = window._fbAuth ? window._fbAuth.currentUser : null;
        if(fbUser) await updateProfile(fbUser, { photoURL: trimmed });
        triggerSave(); setupProfileUI(); alert("Avatar updated!");
    } catch(e) { alert("Failed to update avatar: " + e.message); }
};

// ============================================================
// PiP
// ============================================================
let pipOverlayActive=false, pipNativeActive=false;
const pipSizes=[{width:'280px',height:'140px',fontSize:'2rem'},{width:'340px',height:'170px',fontSize:'2.6rem'},{width:'420px',height:'200px',fontSize:'3.2rem'}];
let pipSizeIdx=0;
const pipOverlay=document.getElementById('pip-overlay');
const pipCanvas=document.getElementById('pip-canvas');
const pipCtx=pipCanvas.getContext('2d');
const pipVideo=document.getElementById('pip-video');
pipVideo.addEventListener('leavepictureinpicture',()=>{pipNativeActive=false;});
pipOverlay.style.bottom='100px'; pipOverlay.style.right='26px';
window.pipResetPosition=function(){pipOverlay.style.left='auto';pipOverlay.style.top='auto';pipOverlay.style.bottom='100px';pipOverlay.style.right='26px';};
(function makeDraggable(){
    const hdr=document.getElementById('pip-header'); let isDragging=false,startX=0,startY=0,startL=0,startT=0;
    hdr.addEventListener('mousedown',e=>{if(e.target.closest('.pip-ctrl'))return; isDragging=true; const r=pipOverlay.getBoundingClientRect(); startX=e.clientX;startY=e.clientY;startL=r.left;startT=r.top; pipOverlay.style.left=startL+'px';pipOverlay.style.top=startT+'px';pipOverlay.style.bottom='auto';pipOverlay.style.right='auto'; document.body.style.userSelect='none';});
    document.addEventListener('mousemove',e=>{if(!isDragging)return; pipOverlay.style.left=Math.max(0,Math.min(window.innerWidth-pipOverlay.offsetWidth,startL+(e.clientX-startX)))+'px'; pipOverlay.style.top=Math.max(0,Math.min(window.innerHeight-pipOverlay.offsetHeight,startT+(e.clientY-startY)))+'px';});
    document.addEventListener('mouseup',()=>{isDragging=false;document.body.style.userSelect='';});
})();
(function makeResizable(){
    const h=document.getElementById('pip-resize-handle'); let isRes=false,startX=0,startY=0,startW=0,startH=0;
    h.addEventListener('mousedown',e=>{isRes=true;startX=e.clientX;startY=e.clientY;startW=pipOverlay.offsetWidth;startH=pipOverlay.offsetHeight;document.body.style.userSelect='none';e.stopPropagation();});
    document.addEventListener('mousemove',e=>{if(!isRes)return;pipOverlay.style.width=Math.max(240,startW+(e.clientX-startX))+'px';pipOverlay.style.height=Math.max(110,startH+(e.clientY-startY))+'px';});
    document.addEventListener('mouseup',()=>{isRes=false;document.body.style.userSelect='';});
})();
window.pipCycleSize=function(){pipSizeIdx=(pipSizeIdx+1)%pipSizes.length; const sz=pipSizes[pipSizeIdx]; pipOverlay.style.width=sz.width;pipOverlay.style.height=sz.height;document.getElementById('pip-time').style.fontSize=sz.fontSize;};
window.togglePiPOverlay=function(){pipOverlayActive=!pipOverlayActive;pipOverlay.classList.toggle('active',pipOverlayActive);if(pipOverlayActive){const sz=pipSizes[pipSizeIdx];pipOverlay.style.width=sz.width;pipOverlay.style.height=sz.height;}};
window.initNativePiP=async function(){if(document.pictureInPictureElement){await document.exitPictureInPicture();pipNativeActive=false;return;}try{pipNativeActive=true;const stream=pipCanvas.captureStream(1);pipVideo.srcObject=stream;await pipVideo.play();await pipVideo.requestPictureInPicture();}catch(err){alert("Native PiP unavailable. Use the overlay.");pipNativeActive=false;}};
function updatePiPOverlay(){if(!pipOverlayActive)return;let label="GALACTIC CLOCK",timeText=document.getElementById('clock-main').textContent,color="var(--text)",barColor="var(--accent)",sub="";if(state.focus.running){label=`DEEP FOCUS · ${state.focus.mode.toUpperCase()}`;timeText=document.getElementById('focus-timer').textContent;color=state.focus.mode==='work'?'var(--prod)':'var(--sleep)';barColor=color;sub=`Rep ${state.focus.currentRep}/${state.focus.reps}`;}else if(state.sw.running){label="ACTIVITY LOGGER";timeText=document.getElementById('sw-display').textContent;color="var(--accent)";barColor=color;}document.getElementById('pip-label').textContent=label;document.getElementById('pip-time').textContent=timeText;document.getElementById('pip-time').style.color=color;document.getElementById('pip-sub').textContent=sub;pipOverlay.style.setProperty('--pip-accent',barColor);}
function renderNativePiP(){if(!pipNativeActive)return;pipCtx.fillStyle='#030712';pipCtx.fillRect(0,0,500,250);let label="GALACTIC CLOCK",timeText=document.getElementById('clock-main').textContent,color="#fff";if(state.focus.running){label=`DEEP FOCUS (${state.focus.mode.toUpperCase()})`;timeText=document.getElementById('focus-timer').textContent;color=state.focus.mode==='work'?'#00e5a0':'#38bdf8';}else if(state.sw.running){label="ACTIVITY LOGGER";timeText=document.getElementById('sw-display').textContent;color='#4f6ef7';}pipCtx.fillStyle='#8892a4';pipCtx.font='700 20px "DM Sans",sans-serif';pipCtx.textAlign='center';pipCtx.fillText(label,250,70);pipCtx.fillStyle=color;pipCtx.font='700 72px "JetBrains Mono",monospace';pipCtx.textAlign='center';pipCtx.fillText(timeText,250,175);}

// ============================================================
// NAV ROUTING
// ============================================================
document.querySelectorAll('.nav-link:not(.nav-logout)').forEach(link => {
    link.onclick = () => {
        document.querySelectorAll('.nav-link:not(.nav-logout),.view').forEach(el=>el.classList.remove('active'));
        link.classList.add('active');
        const tid=link.dataset.tab;
        document.getElementById(tid).classList.add('active');
        // Always explicitly hide AT fullscreen overlays when switching away from astratest
        if(tid !== 'astratest') {
            ['at-pg-exam','at-pg-result','at-pg-sol'].forEach(id=>{
                const el=document.getElementById(id);
                if(el) el.style.display='none';
            });
        }
        if(tid==='tracker'){if(!trackerRendered){window.trk_renderAll();trackerRendered=true;}window.trk_jumpToToday();}
        if(tid==='missions'){window.nx2Init&&window.nx2Init();}
        if(tid==='leaderboard') window.fetchLeaderboard();
        if(tid==='aiassistant') window.aiInitPanel && window.aiInitPanel();
        if(tid==='admin') window.renderAdminPanel && window.renderAdminPanel();
        if(tid==='focus') updateNexusTaskSelector();
        if(tid==='home'){window.updateHomeStats();}
        if(tid==='summary') window.renderSummary('today');
        if(tid==='diary') window.renderDailyReviews();
        if(tid==='diary') { window.diary_render(); }
        if(tid==='doubts') { window.v8MountDoubtHero && window.v8MountDoubtHero(); }
        // If this is the dedicated alarms nav link, switch to alarms sub-tab
        if(link.id === 'nav-alarms-link') {
            setTimeout(()=>window.ehSwitchTab('alarms'), 50);
        }
        if(tid==='settings'){ window.renderNavCustomizer && window.renderNavCustomizer(); }
    };
});

// ============================================================
// STAMINA SYSTEM
// ============================================================
function evaluateDailyStreak() {
    const today = getLocalIsoDate(new Date());
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if(!state.focus.staminaLog) state.focus.staminaLog={};
    if(!state.focus.streakLog) state.focus.streakLog={};
    // Only reset stamina to 30 if the month has genuinely changed AND the current stamina wasn't just imported
    // We check: if lastMonthChecked is blank (first ever run), or it's a different month key
    if(state.focus.lastMonthChecked && state.focus.lastMonthChecked !== thisMonthKey) {
        // Archive old month's stamina before resetting
        state.focus.staminaLog[state.focus.lastMonthChecked] = state.focus.staminaPoints;
        state.focus.lastMonthChecked = thisMonthKey;
        state.focus.staminaPoints = 30; // reset each new month
    } else if(!state.focus.lastMonthChecked) {
        // First run - set month key but DON'T reset stamina (keep imported value)
        state.focus.lastMonthChecked = thisMonthKey;
        // staminaPoints stays whatever was imported/defaulted
    }
    if(state.focus.lastTrackedDate !== today) {
        if(state.focus.lastTrackedDate) {
            const lastD = new Date(state.focus.lastTrackedDate);
            const todayD = new Date(today);
            const diffDays = Math.round((todayD - lastD) / 86400000);
            if(state.focus.targetMetToday) {
                // Previous day target was met — increase streak & stamina
                if(diffDays === 1) { state.focus.dayStreak = (state.focus.dayStreak||0) + 1; }
                else { state.focus.dayStreak = 1; } // reset streak but still reward the day
                // +2 stamina for completing target, no upper cap enforced here (cap is 60 absolute max)
                state.focus.staminaPoints = Math.min(60, (state.focus.staminaPoints||30) + 2);
            } else {
                // Previous day target NOT met — lose 5 stamina, break streak
                state.focus.staminaPoints = Math.max(0, (state.focus.staminaPoints||30) - 5);
                state.focus.dayStreak = 0;
            }
        }
        if(state.focus.lastTrackedDate){
            state.focus.streakLog[state.focus.lastTrackedDate] = state.focus.dayStreak||0;
        }
        state.focus.staminaLog[thisMonthKey] = state.focus.staminaPoints||30;
        state.focus.lastTrackedDate = today;
        state.focus.todayMins = 0;
        state.focus.targetMetToday = false;
        triggerSave();
    }
    // Always log today's current values
    state.focus.staminaLog[thisMonthKey] = state.focus.staminaPoints||30;
    state.focus.streakLog[today] = state.focus.dayStreak||0;
}
// ============================================================
// STREAK FREEZE (costs 5 streak, protects one day)
// ============================================================
window.freezeStreak = function() {
    const streak = state.focus.dayStreak || 0;
    if(streak < 5) {
        alert(`You need at least 5 streak days to freeze. Current streak: ${streak}`);
        return;
    }
    if(state.focus.streakFrozenDate === getLocalIsoDate(new Date())) {
        alert('Streak already frozen for today!');
        return;
    }
    if(!confirm(`Freeze your streak for today?\n\nThis will cost you 5 streak days.\nCurrent streak: ${streak} → ${streak - 5}\n\nYour streak won't break if you miss today's target.`)) return;
    state.focus.dayStreak = Math.max(0, streak - 5);
    state.focus.streakFrozenDate = getLocalIsoDate(new Date());
    state.focus.targetMetToday = true; // treat today as "met" so rollover doesn't penalize
    triggerSave();
    window.updateHomeStats();
    updateFocusStatsGrid();
    alert(`✅ Streak frozen! You lose 5 streak days (now ${state.focus.dayStreak}), but today's miss won't break your streak.`);
};

// ============================================================
// HOME STATS
// ============================================================
window.updateHomeStats = function() {
    const range=document.getElementById('home-summary-range').value;
    const {startTime,endTime} = getTimeRange(range);
    const sums={productive:0,unproductive:0,sleep:0,health:0,coding:0};
    if(window.updateNextMissionCard) window.updateNextMissionCard();
    if(state.sw&&state.sw.logs) state.sw.logs.forEach(l=>{if(l.stamp>=startTime&&l.stamp<=endTime&&sums[l.type]!==undefined)sums[l.type]+=l.duration;});
    let focusMins=0;
    if(state.focus&&state.focus.logs) state.focus.logs.forEach(l=>{if(l.stamp>=startTime&&l.stamp<=endTime)focusMins+=l.duration;});
    document.getElementById('home-prod').innerHTML=renderTimeBlock(sums.productive);
    document.getElementById('home-unprod').innerHTML=renderTimeBlock(sums.unproductive);
    document.getElementById('home-coding').innerHTML=renderTimeBlock(sums.coding);
    document.getElementById('home-sleep').innerHTML=renderTimeBlock(sums.sleep);
    document.getElementById('home-health').innerHTML=renderTimeBlock(sums.health);
    document.getElementById('home-streak').textContent=state.focus.staminaPoints||0;
    const dsDom=document.getElementById('home-day-streak');if(dsDom)dsDom.textContent=state.focus.dayStreak||0;
    document.getElementById('home-focus-mins').textContent=Math.floor(focusMins);
    const todayStr=getLocalIsoDate(new Date()),todayTasks=gg_db[todayStr]||[];
    document.getElementById('home-todos').textContent=todayTasks.filter(t=>!t.status||t.status===0||t.status===2).length;
    const sp=state.focus.staminaPoints||0;
    document.getElementById('home-stamina-val').textContent=`${sp} pts`;
    document.getElementById('home-stamina-bar').style.width=Math.min(100,Math.round(sp/60*100))+'%';
    document.getElementById('home-stamina-bar').style.background=sp<10?'linear-gradient(90deg,var(--danger),var(--unprod))':sp<20?'linear-gradient(90deg,var(--warn),#f97316)':'linear-gradient(90deg,var(--prod),var(--accent))';
    renderIntelHub(startTime,endTime);
    // extra home widgets
    updateHomeDiaryWidget();
    updateHomeNextEvent();
    checkBurnout();
    window.computeDPPStreaks();
    window.checkDailyReview();
    // Best hour widget
    const _bh = window.computeBestHour();
    const _bhEl = document.getElementById('home-best-hour');
    const _bhSub = document.getElementById('home-best-hour-sub');
    if(_bhEl) _bhEl.textContent = _bh ? _bh.label : 'Not enough data';
    if(_bhSub) _bhSub.textContent = _bh ? `~${_bh.mins} min avg productive` : 'Log more sessions';
};


// ── DPP STREAK TRACKER ────────────────────────────────────────────────────
window.computeDPPStreaks = function() {
    const subjects = ['physics','chemistry','maths'];
    const colors = {physics:'#4f6ef7', chemistry:'#00e5a0', maths:'#f472b6'};
    subjects.forEach(subj => {
        // Gather all dates where a productive log with subject+studyType=dpp exists
        const dppDates = new Set();
        // Also check Nexus tasks with studyType=dpp + subject + status=done
        if(state.sw && state.sw.logs) {
            state.sw.logs.forEach(l => {
                if(l.type==='productive' && l.subject===subj && l.studyType==='dpp') {
                    dppDates.add(getLocalIsoDate(new Date(l.stamp)));
                }
            });
        }
        Object.keys(gg_db||{}).forEach(dateStr => {
            (gg_db[dateStr]||[]).forEach(t => {
                if(t.subject===subj && t.studyType==='dpp' && t.status===1) {
                    dppDates.add(dateStr);
                }
            });
        });
        // Compute streak — count consecutive days ending today backwards
        let streak = 0, lastDate = null;
        const today = getLocalIsoDate(new Date());
        let cur = new Date(); cur.setHours(0,0,0,0);
        // allow today or yesterday as the "last" to avoid breaking streak at midnight
        const todayDone = dppDates.has(today);
        const yest = new Date(cur); yest.setDate(yest.getDate()-1);
        const yestStr = getLocalIsoDate(yest);
        // find most recent DPP date
        const sorted = Array.from(dppDates).sort().reverse();
        if(sorted.length) lastDate = sorted[0];
        // walk back from today
        if(dppDates.has(today) || dppDates.has(yestStr)) {
            let check = todayDone ? new Date(cur) : new Date(yest);
            while(true) {
                const ds = getLocalIsoDate(check);
                if(!dppDates.has(ds)) break;
                streak++;
                check.setDate(check.getDate()-1);
            }
        }
        const fireEmoji = streak >= 7 ? '🔥🔥🔥' : streak >= 3 ? '🔥🔥' : streak >= 1 ? '🔥' : '';
        const el = document.getElementById('dpp-streak-'+subj);
        const lastEl = document.getElementById('dpp-last-'+subj);
        if(el) el.innerHTML = `${streak}${fireEmoji?'<span style="font-size:1rem;"> '+fireEmoji+'</span>':''}`;
        if(lastEl) lastEl.textContent = lastDate ? 'Last: '+lastDate : 'none yet';
    });
};

// ── BEST HOUR OF DAY ──────────────────────────────────────────────────────
window.computeBestHour = function() {
    const hourBuckets = new Array(24).fill(0);
    if(state.sw && state.sw.logs) {
        state.sw.logs.forEach(l => {
            if(l.type !== 'productive') return;
            const h = new Date(l.stamp).getHours();
            hourBuckets[h] += l.duration;
        });
    }
    if(state.focus && state.focus.logs) {
        state.focus.logs.forEach(l => {
            const h = new Date(l.stamp || Date.now()).getHours();
            hourBuckets[h] += (l.duration||0) * 60000;
        });
    }
    const maxMs = Math.max(...hourBuckets);
    if(maxMs < 60000) return null; // less than 1 min in any hour — no data
    const bestH = hourBuckets.indexOf(maxMs);
    const fmt = h => { const ampm = h>=12?'PM':'AM'; const hh=h%12||12; return `${hh}${ampm}`; };
    return { hour: bestH, label: `${fmt(bestH)}–${fmt(bestH+1)}`, mins: Math.round(maxMs/60000) };
};

// ── DAILY REVIEW PROMPT ───────────────────────────────────────────────────
window.checkDailyReview = function() {
    const now = new Date();
    const h = now.getHours();
    if(h < 20) return; // only show from 8 PM onwards
    const todayStr = getLocalIsoDate(now);
    const lastReview = (state.settings && state.settings.lastReviewDate) || '';
    if(lastReview === todayStr) return; // already reviewed today
    // don't spam — show once per session after 8pm
    if(window._dailyReviewShown) return;
    window._dailyReviewShown = true;
    setTimeout(() => window.showDailyReviewPrompt(), 2000);
};

window.showDailyReviewPrompt = function() {
    if(document.getElementById('daily-review-modal')) return;
    const todayStr = getLocalIsoDate(new Date());
    const overlay = document.createElement('div');
    overlay.id = 'daily-review-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);';
    overlay.innerHTML = `
        <div style="background:var(--surface2);border:1px solid var(--border-bright);border-radius:18px;padding:32px;max-width:480px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.5);">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                <i class="ph ph-moon-stars" style="font-size:1.8rem;color:var(--accent);"></i>
                <h3 style="font-family:var(--font-display);font-size:1.4rem;letter-spacing:0.06em;margin:0;">Daily Review</h3>
            </div>
            <p style="font-size:0.8rem;color:var(--text-dim);margin-bottom:20px;">End-of-day check-in for ${todayStr}. What went wrong today? Be honest — this is just for you.</p>
            <textarea id="review-wrong" placeholder="What went wrong today? (missed DPP, distracted, started late...)" style="min-height:80px;margin-bottom:12px;"></textarea>
            <textarea id="review-fix" placeholder="What's one thing to fix tomorrow?" style="min-height:60px;margin-bottom:16px;"></textarea>
            <div style="display:flex;gap:10px;">
                <button class="btn btn-primary" style="flex:1;" onclick="window.saveDailyReview()"><i class="ph ph-check-circle"></i> Save Review</button>
                <button class="btn" onclick="document.getElementById('daily-review-modal').remove()"><i class="ph ph-x"></i> Skip</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
};

window.saveDailyReview = function() {
    const wrong = (document.getElementById('review-wrong').value||'').trim();
    const fix   = (document.getElementById('review-fix').value||'').trim();
    if(!wrong && !fix) { document.getElementById('daily-review-modal').remove(); return; }
    const todayStr = getLocalIsoDate(new Date());
    if(!state.dailyReviews) state.dailyReviews = [];
    state.dailyReviews.unshift({ date: todayStr, wrong, fix, stamp: Date.now() });
    if(!state.settings) state.settings = {};
    state.settings.lastReviewDate = todayStr;
    document.getElementById('daily-review-modal').remove();
    triggerSave();
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:10px 24px;border-radius:99px;font-weight:700;font-size:0.82rem;z-index:99999;white-space:nowrap;';
    t.textContent = '✓ Review saved';
    document.body.appendChild(t); setTimeout(()=>t.remove(), 2000);
};

// ── WEEKLY REPORT CARD ────────────────────────────────────────────────────
window.showWeeklyReport = function() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    // Build 7 days ending today
    const days = [];
    for(let i=6;i>=0;i--) {
        const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
        days.push({ str: getLocalIsoDate(d), start: d.getTime(), end: d.getTime()+86399999 });
    }
    // Hours logged
    let totalProdMs = 0, totalFocusMins = 0, dppsTotal = 0, testsTotal = 0;
    days.forEach(day => {
        if(state.sw && state.sw.logs) {
            state.sw.logs.forEach(l => {
                if(l.stamp >= day.start && l.stamp <= day.end) {
                    if(l.type==='productive') totalProdMs += l.duration;
                    if(l.studyType==='dpp') dppsTotal++;
                    if(l.studyType==='test') testsTotal++;
                }
            });
        }
        if(state.focus && state.focus.logs) {
            state.focus.logs.forEach(l => {
                if((l.stamp||0) >= day.start && (l.stamp||0) <= day.end) totalFocusMins += (l.duration||0);
            });
        }
        Object.values(gg_db[day.str]||[]).forEach(t => {
            if(t.studyType==='dpp' && t.status===1) dppsTotal++;
            if(t.studyType==='test' && t.status===1) testsTotal++;
        });
    });
    const totalHrs = ((totalProdMs/3600000) + totalFocusMins/60).toFixed(1);
    const dayStreak = state.focus.dayStreak || 0;
    // Best hour
    const bh = window.computeBestHour();
    // Worst subject (least DPPs by subject)
    const dppBySubj = {physics:0, chemistry:0, maths:0};
    if(state.sw && state.sw.logs) {
        state.sw.logs.forEach(l => {
            const inRange = days.some(d => l.stamp>=d.start && l.stamp<=d.end);
            if(inRange && l.studyType==='dpp' && l.subject && dppBySubj[l.subject]!==undefined) dppBySubj[l.subject]++;
        });
    }
    const worstSubj = Object.entries(dppBySubj).sort((a,b)=>a[1]-b[1])[0][0];
    // Review notes this week
    const weekReviews = (state.dailyReviews||[]).filter(r => days.some(d=>d.str===r.date));
    const oneThingToFix = weekReviews.length ? weekReviews[0].fix || 'Log your daily reviews to get suggestions.' : 'No reviews logged this week. Try the daily review each evening!';

    // Render modal
    if(document.getElementById('weekly-report-modal')) document.getElementById('weekly-report-modal').remove();
    const overlay = document.createElement('div');
    overlay.id = 'weekly-report-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);overflow-y:auto;padding:20px;';
    overlay.innerHTML = `
        <div style="background:var(--surface2);border:1px solid var(--border-bright);border-radius:20px;padding:32px;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6);">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
                <i class="ph ph-chart-bar" style="font-size:2rem;color:var(--accent);"></i>
                <div>
                    <h3 style="font-family:var(--font-display);font-size:1.5rem;letter-spacing:0.06em;margin:0;">Weekly Report Card</h3>
                    <div style="font-size:0.72rem;color:var(--text-dim);">${days[0].str} → ${days[6].str}</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
                <div class="stat-box" style="text-align:center;">
                    <label>⏱ Hours Logged</label>
                    <span style="font-size:1.8rem;color:var(--prod);">${totalHrs}</span>
                    <div style="font-size:0.65rem;color:var(--text-dim);">productive + focus</div>
                </div>
                <div class="stat-box" style="text-align:center;">
                    <label>📝 DPPs Done</label>
                    <span style="font-size:1.8rem;color:var(--warn);">${dppsTotal}</span>
                    <div style="font-size:0.65rem;color:var(--text-dim);">${testsTotal} tests taken</div>
                </div>
                <div class="stat-box" style="text-align:center;">
                    <label>🔥 Day Streak</label>
                    <span style="font-size:1.8rem;color:var(--warn);">${dayStreak}</span>
                    <div style="font-size:0.65rem;color:var(--text-dim);">days active</div>
                </div>
                <div class="stat-box" style="text-align:center;">
                    <label>⚡ Peak Hour</label>
                    <span style="font-size:1.3rem;color:var(--accent);">${bh ? bh.label : 'No data'}</span>
                    <div style="font-size:0.65rem;color:var(--text-dim);">${bh ? bh.mins+' min avg' : 'log more sessions'}</div>
                </div>
            </div>
            <div style="background:rgba(255,75,112,0.08);border:1px solid rgba(255,75,112,0.25);border-radius:12px;padding:14px;margin-bottom:12px;">
                <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--danger);margin-bottom:6px;"><i class="ph ph-warning"></i> Weakest Subject</div>
                <div style="font-size:0.9rem;font-weight:700;">${worstSubj.charAt(0).toUpperCase()+worstSubj.slice(1)} — only ${dppBySubj[worstSubj]} DPPs this week. Focus here next week.</div>
            </div>
            <div style="background:rgba(79,110,247,0.08);border:1px solid rgba(79,110,247,0.25);border-radius:12px;padding:14px;margin-bottom:20px;">
                <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent);margin-bottom:6px;"><i class="ph ph-lightbulb"></i> One Thing To Fix Next Week</div>
                <div style="font-size:0.88rem;font-style:italic;">"${oneThingToFix}"</div>
            </div>
            ${weekReviews.length ? `<div style="margin-bottom:16px;"><div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:8px;">Daily Review Notes This Week</div>${weekReviews.slice(0,4).map(r=>`<div style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);margin-bottom:6px;font-size:0.78rem;"><span style="font-weight:700;color:var(--accent);">${r.date}</span><span style="color:var(--text-dim);"> — </span>${r.wrong||'—'}</div>`).join('')}</div>` : ''}
            <button class="btn" style="width:100%;" onclick="document.getElementById('weekly-report-modal').remove()"><i class="ph ph-x"></i> Close</button>
        </div>`;
    document.body.appendChild(overlay);
};

// ============================================================
// HOME EXTRAS — Trend Chart, Diary Snippet, Next Event, Next Mission
// ============================================================
window.updateNextMissionCard = function() {
    const body = document.getElementById('home-next-mission-body');
    if(!body) return;
    const todayStr = getLocalIsoDate(new Date());
    const dates = Object.keys(gg_db || {}).filter(d => d >= todayStr).sort();
    let found = null;
    for(const d of dates) {
        const t = (gg_db[d] || []).find(t => t.status === 0);
        if(t) { found = { date: d, task: t }; break; }
    }
    if(!found) { body.innerHTML = 'No upcoming missions — add one on the Missions page.'; return; }
    const dLabel = found.date === todayStr ? 'Today' : new Date(found.date+'T00:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
    body.innerHTML = `${escapeHTML(found.task.name)} <span style="font-weight:600;color:var(--text-dim);font-size:0.78rem;">· ${dLabel}</span>`;
};

// ============================================================
// PAST FOCUS SESSIONS MODAL
// ============================================================
let _pfFilter = 'all';
window.pfSetFilter = function(filter, btn) {
    _pfFilter = filter;
    document.querySelectorAll('#past-focus-modal .lb-filter-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    window.renderPastFocusList();
};
window.openPastFocusModal = function() {
    _pfFilter = 'all';
    document.querySelectorAll('#past-focus-modal .lb-filter-btn').forEach((b,i) => b.classList.toggle('active', i===0));
    window.renderPastFocusList();
    document.getElementById('past-focus-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
};
window.closePastFocusModal = function() {
    document.getElementById('past-focus-modal').style.display = 'none';
    document.body.style.overflow = '';
};
window.renderPastFocusList = function() {
    const listEl = document.getElementById('pf-list');
    const sumEl = document.getElementById('pf-summary-line');
    if(!listEl) return;
    let logs = ((state.focus && state.focus.logs) || []).slice().sort((a,b) => b.stamp - a.stamp);
    if(_pfFilter !== 'all') {
        const r = getTimeRange(_pfFilter === 'today' ? 'today' : _pfFilter === 'week' ? 'this_week' : 'this_month');
        logs = logs.filter(l => l.stamp >= r.startTime && l.stamp <= r.endTime);
    }
    const totalMins = logs.reduce((a,l) => a + (l.duration||0), 0);
    if(sumEl) sumEl.textContent = `${logs.length} session${logs.length===1?'':'s'} · ${formatMinsToHM(totalMins)} total`;
    if(!logs.length) {
        listEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-dim);font-size:0.85rem;">No focus sessions logged in this range yet.</div>`;
        return;
    }
    listEl.innerHTML = logs.map(l => {
        const endD = new Date(l.stamp);
        const startD = new Date(l.stamp - (l.duration||0)*60000);
        const dateLbl = endD.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
        const timeLbl = startD.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}) + ' – ' + endD.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
        const h = Math.floor((l.duration||0)/60), m = Math.round((l.duration||0)%60);
        const durStr = h>0 ? `${h}h ${m}m` : `${m}m`;
        const taskLbl = (l.taskTitle && l.taskTitle !== 'General Focus') ? l.taskTitle : 'No task linked';
        const chapLbl = l.chapterTitle ? `<span style="color:var(--accent2);"> · ${escapeHTML(l.chapterTitle)}</span>` : '';
        return `<div style="display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:12px;background:rgba(0,0,0,0.03);border:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.82rem;font-weight:700;color:var(--text);">${escapeHTML(dateLbl)}</span>
                <span style="font-size:0.8rem;font-weight:800;color:var(--accent);">${durStr}</span>
            </div>
            <div style="font-size:0.7rem;color:var(--text-dim);">${escapeHTML(timeLbl)}</div>
            <div style="font-size:0.74rem;color:var(--text-dim);"><i class="ph ph-target" style="margin-right:4px;"></i>${escapeHTML(taskLbl)}${chapLbl}</div>
        </div>`;
    }).join('');
};

// ============================================================
// LOG PAST FOCUS SESSION (manual retro entry — mirrors the
// Activity Logger's "Log Past" flow, but for Deep Focus)
// ============================================================
window.rfPopulateChapters = function() {
    const sel = document.getElementById('rf-chapter');
    if(!sel) return;
    const prev = sel.value;
    let html = '<option value="">No chapter</option>';
    const db = window.ch_db || {};
    Object.keys(db).sort().forEach(sub => {
        const subLabel = (window.ch_SUBJECTS && window.ch_SUBJECTS[sub] && window.ch_SUBJECTS[sub].label) || sub;
        Object.keys(db[sub] || {}).sort().forEach(chapName => {
            const key = sub + '::' + chapName;
            html += `<option value="${escapeAttr(key)}">${escapeHTML(subLabel)}: ${escapeHTML(chapName)}</option>`;
        });
    });
    sel.innerHTML = html;
    if(prev) sel.value = prev;
};
window.rfPopulateTasksForDate = function() {
    const sel = document.getElementById('rf-task');
    const dateEl = document.getElementById('rf-date');
    if(!sel || !dateEl) return;
    const dateVal = dateEl.value || getLocalIsoDate(new Date());
    const tasks = (gg_db[dateVal] || []);
    let html = '<option value="">No task</option>';
    tasks.forEach((t, i) => {
        const id = String(t.id !== undefined ? t.id : `task_${dateVal}_${i}`);
        html += `<option value="${escapeAttr(id)}" data-title="${escapeAttr(t.name)}">${escapeHTML(t.name)}</option>`;
    });
    sel.innerHTML = html;
};
// Safe wrapper — the real _focusChapterLabel is defined further down in the
// file; this guarantees retro logging still works even if called early.
window._focusChapterLabelSafe = function(key) {
    try { return _focusChapterLabel(key); } catch(e) {
        const sep = String(key||'').indexOf('::');
        return sep === -1 ? key : key.slice(sep+2);
    }
};
window.openRetroFocusModal = function() {
    const dateEl = document.getElementById('rf-date');
    const startEl = document.getElementById('rf-start');
    if(dateEl && !dateEl.value) dateEl.value = getLocalIsoDate(new Date());
    if(startEl && !startEl.value) {
        const n = new Date();
        startEl.value = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    }
    window.rfPopulateChapters();
    window.rfPopulateTasksForDate();
    document.getElementById('retro-focus-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
};
window.closeRetroFocusModal = function() {
    document.getElementById('retro-focus-modal').style.display = 'none';
    document.body.style.overflow = '';
};
window.doRetroFocusLog = function() {
    const dateVal = document.getElementById('rf-date').value;
    const startVal = document.getElementById('rf-start').value;
    const durMins = parseInt(document.getElementById('rf-duration').value) || 0;
    if(!dateVal || !startVal || durMins <= 0) { alert('Please fill in date, start time, and total focus time.'); return; }

    const taskSel = document.getElementById('rf-task');
    const taskId = taskSel.value || '';
    const taskTitle = taskId ? (taskSel.options[taskSel.selectedIndex].dataset.title || '') : '';

    const chapterSel = document.getElementById('rf-chapter');
    const chapterKey = chapterSel.value || '';
    const chapterTitle = chapterKey ? window._focusChapterLabelSafe(chapterKey) : '';

    const [yr, mo, dy] = dateVal.split('-').map(Number);
    const [hh, mm] = startVal.split(':').map(Number);
    const startStamp = new Date(yr, mo-1, dy, hh, mm, 0).getTime();
    const endStamp = startStamp + durMins * 60000;

    if(!state.focus.logs) state.focus.logs = [];
    const log = {
        stamp: endStamp,
        duration: durMins,
        taskId,
        taskTitle: taskTitle || 'General Focus',
        chapter: chapterKey,
        date: dateVal,
        retro: true
    };
    if(chapterTitle) log.chapterTitle = chapterTitle;
    state.focus.logs.push(log);
    state.focus.logs.sort((a,b) => b.stamp - a.stamp);
    state.focus.total = (parseFloat(state.focus.total) || 0) + durMins;
    // Only bump "today's" minutes if the retro entry is actually for today
    if(dateVal === getLocalIsoDate(new Date())) {
        state.focus.todayMins = (parseFloat(state.focus.todayMins) || 0) + durMins;
        _focusCheckDailyTarget();
    }
    if(taskId) syncSubTimeToDatabase(taskId, chapterKey, durMins);
    triggerSave();

    // Refresh anything on screen that reflects focus totals
    updateFocusStatsGrid();
    window.updateHomeStats && window.updateHomeStats();
    if(document.getElementById('past-focus-modal').style.display === 'flex') window.renderPastFocusList();

    // Reset & close
    document.getElementById('rf-duration').value = '';
    window.closeRetroFocusModal();
    alert(`✅ Logged ${durMins}m of past focus on ${dateVal}.`);
};

function updateHomeTrendChart() {
    const canvas = document.getElementById('home-trend-chart');
    if(!canvas) return;
    const labelsEl = document.getElementById('home-trend-labels');
    // Build 7-day data
    const days = [];
    for(let i=6;i>=0;i--) {
        const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
        const start = d.getTime();
        const end = start + 86399999;
        let prod = 0;
        if(state.sw&&state.sw.logs) state.sw.logs.forEach(l=>{if(l.stamp>=start&&l.stamp<=end&&l.type==='productive')prod+=l.duration;});
        if(state.focus&&state.focus.logs) state.focus.logs.forEach(l=>{if(l.stamp>=start&&l.stamp<=end)prod+=l.duration*60000;});
        days.push({label:['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()], prodMs:prod, date:getLocalIsoDate(d)});
    }
    if(labelsEl) labelsEl.innerHTML=days.map(d=>`<span style="font-size:0.6rem;color:var(--text-dim);font-weight:700;">${d.label}</span>`).join('');
    const maxProd = Math.max(...days.map(d=>d.prodMs), 1);
    const data = days.map(d=>Math.round(d.prodMs/60000));
    const colors = data.map(v=>v===0?'rgba(255,255,255,0.1)':'rgba(79,110,247,0.7)');
    if(_homeTrendChart) { _homeTrendChart.destroy(); _homeTrendChart=null; }
    const ctx = canvas.getContext('2d');
    _homeTrendChart = new Chart(ctx, {
        type:'bar', data:{ labels:days.map(d=>d.label), datasets:[{data, backgroundColor:colors, borderRadius:6, borderSkipped:false}] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw}m prod`}}},
            scales:{ x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(255,255,255,0.35)',font:{size:10}}}, y:{display:false} } }
    });
}

function updateHomeDiaryWidget() {
    const el = document.getElementById('home-diary-today');
    if(!el) return;
    const todayStr = getLocalIsoDate(new Date());
    const entry = (state.diary||[]).find(e=>e.date===todayStr);
    if(entry) {
        const m = {excellent:'🌟 Excellent',good:'✅ Good Day',needwork:'💪 Need Work',shame:'😤 Shame On You'};
        el.innerHTML = `<span style="font-weight:700;color:var(--accent);">${m[entry.tag]||''}</span><br><span style="font-size:0.78rem;color:var(--text-dim);">${escapeHTML((entry.text||'').substring(0,80))}${entry.text&&entry.text.length>80?'…':''}</span>`;
    } else {
        el.innerHTML = `<span style="color:var(--text-dim);">No entry yet. <a onclick="document.querySelector('.nav-link[data-tab=diary]').click()" style="color:var(--accent);cursor:pointer;text-decoration:underline;">Write today's diary →</a></span>`;
    }
}

function updateHomeNextEvent() {
    const el = document.getElementById('home-next-event');
    if(!el) return;
    const todayStr = getLocalIsoDate(new Date());
    const upcoming = (state.events||[]).filter(e=>e.date && e.date >= todayStr).sort((a,b)=>a.date.localeCompare(b.date));
    if(upcoming.length) {
        const ev = upcoming[0];
        const evDate = new Date(ev.date + 'T00:00:00');
        const today = new Date(); today.setHours(0,0,0,0);
        const diff = Math.round((evDate - today) / 86400000);
        el.innerHTML = `<span style="font-weight:700;color:var(--warn);">${escapeHTML(ev.name||'Event')}</span><br><span style="font-size:0.78rem;color:var(--text-dim);">${diff===0?'Today!':diff===1?'Tomorrow':diff+' days away'} · ${escapeHTML(String(ev.date||''))}</span>`;
    } else {
        el.innerHTML = `<span style="color:var(--text-dim);">No upcoming events. <a onclick="document.querySelector('.nav-link[data-tab=events]').click()" style="color:var(--accent);cursor:pointer;text-decoration:underline;">Add one →</a></span>`;
    }
}

// ============================================================
// BURNOUT DETECTOR
// ============================================================
let _burnoutSnoozedUntil = 0;
let _burnoutChart = null;

function getDailyProdMins(dateStr) {
    const d = new Date(dateStr); d.setHours(0,0,0,0);
    const start=d.getTime(), end=start+86399999;
    let prod=0;
    // Only count activity logger productive logs (NOT focus — focus is separate)
    if(state.sw&&state.sw.logs) state.sw.logs.forEach(l=>{if(l.stamp>=start&&l.stamp<=end&&l.type==='productive')prod+=l.duration/60000;});
    return prod;
}

function checkBurnout() {
    // Collect last 7 days of prod data
    const days=[];
    for(let i=6;i>=0;i--) {
        const d=new Date(); d.setDate(d.getDate()-i);
        const ds=getLocalIsoDate(d);
        days.push({ds, mins:getDailyProdMins(ds)});
    }
    // Update home burnout status pill
    const statusEl = document.getElementById('home-burnout-status');
    const banner = document.getElementById('burnout-banner');
    if(!statusEl||!banner) return;

    // Check: baseline = average of first 4 days. Compare last 3.
    const baseline = days.slice(0,4).reduce((s,d)=>s+d.mins,0)/4;
    const last3 = days.slice(4);
    const allDropped40 = baseline>10 && last3.every(d=>d.mins<baseline*0.6);
    
    const snoozeActive = Date.now() < _burnoutSnoozedUntil;
    const dismissed = (state.settings||{}).burnoutDismissedDate === getLocalIsoDate(new Date());

    if(allDropped40 && !snoozeActive && !dismissed) {
        statusEl.textContent='⚠ BURNOUT RISK';
        statusEl.style.cssText='font-size:0.68rem;font-weight:700;padding:4px 12px;border-radius:99px;background:rgba(255,75,112,0.15);border:1px solid rgba(255,75,112,0.4);color:var(--danger);';
        banner.style.display='block';
        const pctDrop = Math.round((1-(last3.reduce((s,d)=>s+d.mins,0)/(3*baseline)))*100);
        document.getElementById('burnout-msg').textContent=`Your productive time has dropped ~${pctDrop}% over the last 3 days compared to your baseline. Rest is not laziness — it's maintenance. Take a short break, go outside, or just sleep well tonight.`;
        // Show mini trend in banner
        const tEl = document.getElementById('burnout-trend');
        if(tEl) {
            tEl.innerHTML=last3.map(d=>{const pct=Math.min(100,baseline>0?Math.round(d.mins/baseline*100):0);return `<div style="text-align:center;"><div style="font-family:var(--font-mono);font-size:1rem;color:${pct<60?'var(--danger)':'var(--warn)'};">${pct}%</div><div style="font-size:0.6rem;color:var(--text-dim);">${d.ds.slice(5)}</div></div>`;}).join('');
        }
    } else if(!allDropped40) {
        statusEl.textContent='● HEALTHY';
        statusEl.style.cssText='font-size:0.68rem;font-weight:700;padding:4px 12px;border-radius:99px;background:rgba(0,229,160,0.12);border:1px solid rgba(0,229,160,0.3);color:var(--prod);';
        banner.style.display='none';
    } else {
        banner.style.display='none';
        statusEl.textContent='● MONITORING';
        statusEl.style.cssText='font-size:0.68rem;font-weight:700;padding:4px 12px;border-radius:99px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);color:var(--warn);';
    }
    updateBurnoutSummaryCard(days);
}

function updateBurnoutSummaryCard(days) {
    const grid = document.getElementById('burnout-analysis-grid');
    const detailEl = document.getElementById('burnout-detail-msg');
    const burnoutCanvas = document.getElementById('burnout-chart');
    if(!grid) return;
    const baseline=days.slice(0,4).reduce((s,d)=>s+d.mins,0)/Math.max(1,days.slice(0,4).filter(d=>d.mins>0).length);
    const today=days[days.length-1].mins;
    const best=Math.max(...days.map(d=>d.mins));
    const avg=days.reduce((s,d)=>s+d.mins,0)/7;
    grid.innerHTML=`
        <div class="stat-box" style="border-bottom:3px solid var(--prod);"><label>Today Prod</label><span style="font-size:1.4rem;color:var(--prod);">${Math.round(today)}m</span></div>
        <div class="stat-box" style="border-bottom:3px solid var(--accent);"><label>7-Day Avg</label><span style="font-size:1.4rem;color:var(--accent);">${Math.round(avg)}m</span></div>
        <div class="stat-box" style="border-bottom:3px solid var(--warn);"><label>Baseline</label><span style="font-size:1.4rem;color:var(--warn);">${Math.round(baseline)}m</span></div>
        <div class="stat-box" style="border-bottom:3px solid var(--sleep);"><label>Best Day</label><span style="font-size:1.4rem;color:var(--sleep);">${Math.round(best)}m</span></div>
    `;
    if(detailEl) {
        const last3avg=days.slice(4).reduce((s,d)=>s+d.mins,0)/3;
        const pct=baseline>0?Math.round(last3avg/baseline*100):100;
        if(pct<60 && baseline>10) detailEl.innerHTML=`<span style="color:var(--danger);">⚠️ Last 3 days productivity at <strong>${pct}%</strong> of baseline. Burnout risk detected. Your brain needs recovery time.</span>`;
        else if(pct<80 && baseline>10) detailEl.innerHTML=`<span style="color:var(--warn);">📉 Slight productivity dip detected (${pct}% of baseline). Monitor closely. Take short breaks.</span>`;
        else detailEl.innerHTML=`<span style="color:var(--prod);">✅ Productivity looks stable. Keep up the consistent effort!</span>`;
    }
    if(burnoutCanvas) {
        if(_burnoutChart){_burnoutChart.destroy();_burnoutChart=null;}
        const ctx=burnoutCanvas.getContext('2d');
        _burnoutChart=new Chart(ctx,{
            type:'line',
            data:{labels:days.map(d=>d.ds.slice(5)),datasets:[
                {label:'Productive Mins',data:days.map(d=>Math.round(d.mins)),borderColor:'rgba(79,110,247,0.8)',backgroundColor:'rgba(79,110,247,0.1)',fill:true,tension:0.4,borderWidth:2,pointRadius:3},
                {label:'Baseline',data:Array(7).fill(Math.round(baseline)),borderColor:'rgba(255,75,112,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
            ]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'rgba(255,255,255,0.3)',font:{size:9}}},y:{display:false}}}
        });
    }
}

window.dismissBurnout = function() {
    if(!state.settings) state.settings={};
    state.settings.burnoutDismissedDate = getLocalIsoDate(new Date());
    triggerSave();
    document.getElementById('burnout-banner').style.display='none';
};
window.snoozeWhosNext = function() {
    _burnoutSnoozedUntil = Date.now() + 6*3600000; // 6 hours
    document.getElementById('burnout-banner').style.display='none';
};

function getTimeRange(range) {
    const now = new Date(); let startTime=0, endTime=now.getTime();
    if(range==='today'){const d=new Date(now);d.setHours(0,0,0,0);startTime=d.getTime();}
    else if(range==='yesterday'){const d=new Date(now);d.setDate(d.getDate()-1);d.setHours(0,0,0,0);startTime=d.getTime();const e=new Date(d);e.setHours(23,59,59,999);endTime=e.getTime();}
    else if(range==='this_week'){const d=new Date(now);d.setDate(d.getDate()-d.getDay());d.setHours(0,0,0,0);startTime=d.getTime();}
    else if(range==='last_week'){const d=new Date(now);d.setDate(d.getDate()-d.getDay()-7);d.setHours(0,0,0,0);startTime=d.getTime();const e=new Date(d);e.setDate(e.getDate()+6);e.setHours(23,59,59,999);endTime=e.getTime();}
    else if(range==='this_month'){startTime=new Date(now.getFullYear(),now.getMonth(),1).getTime();}
    else if(range==='this_year'){startTime=new Date(now.getFullYear(),0,1).getTime();}
    return {startTime,endTime};
}

function renderIntelHub(startTime=0,endTime=Date.now()){
    const list=document.getElementById('intel-list');if(!list)return;
    const logs=state.focus.logs||[];
    const taskStats={};
    logs.filter(l=>l.stamp>=startTime&&l.stamp<=endTime).forEach(log=>{
        const title=log.taskTitle||"General Focus";
        if(!taskStats[title])taskStats[title]={total:0,sessions:0,last:0};
        taskStats[title].total+=(log.duration||0);
        taskStats[title].sessions+=1;
        if(log.stamp>taskStats[title].last)taskStats[title].last=log.stamp;
    });
    const sorted=Object.entries(taskStats).sort((a,b)=>b[1].total-a[1].total);
    if(!sorted.length){list.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.8rem;">No focus data in this timeframe.</div>`;return;}
    list.innerHTML=sorted.map(([title,stats])=>`<div class="intel-row"><div><div class="intel-task">${escapeHTML(title)}</div><div class="intel-meta">${stats.sessions} Missions · Last: ${new Date(stats.last).toLocaleDateString()}</div></div><div class="intel-stats">${formatMinsToHM(stats.total)}</div></div>`).join('');
}

// ============================================================
// SUMMARY PAGE
// ============================================================
window.summaryJump = function(btn, range) {
    document.querySelectorAll('.jump-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    window.renderSummary(range);
};
window.summaryCustomDate = function() {
    const d = prompt("Enter date (YYYY-MM-DD):", getLocalIsoDate(new Date()));
    if(!d) return;
    window.renderSummary('custom', d);
};
window.renderSummary = function(range, customDate) {
    window.renderNexusDangerList && window.renderNexusDangerList();
    let startTime=0, endTime=Date.now(), label='';
    if(range==='custom' && customDate) {
        const d=new Date(customDate); d.setHours(0,0,0,0); startTime=d.getTime(); const e=new Date(d); e.setHours(23,59,59,999); endTime=e.getTime(); label=customDate;
        document.getElementById('summary-custom-btn').classList.add('active');
    } else {
        const r=getTimeRange(range); startTime=r.startTime; endTime=r.endTime;
        const names={today:'Today',yesterday:'Yesterday',this_week:'This Week',this_month:'This Month',last_week:'Last Week',this_year:'This Year',total:'Lifetime'};
        label=names[range]||range;
    }
    document.getElementById('summary-date-display').textContent=label;
    const sums={productive:0,unproductive:0,sleep:0,health:0,coding:0};
    if(state.sw&&state.sw.logs) state.sw.logs.forEach(l=>{if(l.stamp>=startTime&&l.stamp<=endTime&&sums[l.type]!==undefined)sums[l.type]+=l.duration;});
    document.getElementById('sum2-prod').innerHTML=renderTimeBlock(sums.productive);
    document.getElementById('sum2-unprod').innerHTML=renderTimeBlock(sums.unproductive);
    document.getElementById('sum2-coding').innerHTML=renderTimeBlock(sums.coding);
    document.getElementById('sum2-sleep').innerHTML=renderTimeBlock(sums.sleep);
    document.getElementById('sum2-health').innerHTML=renderTimeBlock(sums.health);
    let focusMins=0, sessions=0;
    const filteredFocus=(state.focus.logs||[]).filter(l=>l.stamp>=startTime&&l.stamp<=endTime);
    filteredFocus.forEach(l=>{focusMins+=l.duration;sessions++;});
    const d_=Math.floor(focusMins/1440),h_=Math.floor((focusMins%1440)/60),m_=Math.floor(focusMins%60);
    document.getElementById('sum2-focus').innerHTML=d_>0?`${d_}d ${h_}h ${m_}m`:h_>0?`${h_}h ${m_}m`:`${m_}m`;
    document.getElementById('sum2-sessions').textContent=sessions;
    
    const currentStreak = state.focus.dayStreak||0;
    const currentStamina = state.focus.staminaPoints||0;
    const streakLog = state.focus.streakLog||{};
    const staminaLog = state.focus.staminaLog||{};
    const sdsDom=document.getElementById('sum2-daystreak');
    const staminaDom=document.getElementById('sum2-stamina');

    // Helper: get month key from date
    function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}

    if(range==='today'){
        if(sdsDom) sdsDom.innerHTML=`${currentStreak}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">${state.focus.targetMetToday?'✅ Target met':'⏳ Target pending'}</span>`;
        if(staminaDom) staminaDom.innerHTML=`${currentStamina}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">of 30 this month</span>`;
    } else if(range==='yesterday'){
        const yd=new Date(); yd.setDate(yd.getDate()-1);
        const ydStr=getLocalIsoDate(yd);
        const ydStreak=streakLog[ydStr]!==undefined?streakLog[ydStr]:Math.max(0,currentStreak-1);
        if(sdsDom) sdsDom.innerHTML=`${ydStreak}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">Yesterday's streak</span>`;
        if(staminaDom) staminaDom.innerHTML=`${currentStamina}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">Current month pts</span>`;
    } else if(range==='this_month'){
        const mk=monthKey(new Date());
        const monthStamina=staminaLog[mk]!==undefined?staminaLog[mk]:currentStamina;
        if(sdsDom) sdsDom.innerHTML=`${currentStreak}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">Current streak</span>`;
        if(staminaDom) staminaDom.innerHTML=`${monthStamina}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">This month's pts</span>`;
    } else if(range==='last_week'){
        const lw=new Date(); lw.setDate(lw.getDate()-lw.getDay()-7);
        const lwStr=getLocalIsoDate(lw);
        const lwStreak=streakLog[lwStr]!==undefined?streakLog[lwStr]:currentStreak;
        if(sdsDom) sdsDom.innerHTML=`${lwStreak}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">Streak at end of last week</span>`;
        if(staminaDom) staminaDom.innerHTML=`${currentStamina}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">pts (current month)</span>`;
    } else if(range==='this_week'){
        if(sdsDom) sdsDom.innerHTML=`${currentStreak}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">Current streak</span>`;
        if(staminaDom) staminaDom.innerHTML=`${currentStamina}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">pts this month</span>`;
    } else if(range==='this_year'||range==='total'){
        // Best streak across all logged dates
        const bestStreak=Object.values(streakLog).length?Math.max(...Object.values(streakLog)):currentStreak;
        // Best stamina across all months
        const bestStamina=Object.values(staminaLog).length?Math.max(...Object.values(staminaLog)):currentStamina;
        if(sdsDom) sdsDom.innerHTML=`${bestStreak}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">Best streak ever</span>`;
        if(staminaDom) staminaDom.innerHTML=`${bestStamina}<span style="color:var(--text-dim);font-size:0.65rem;font-weight:700;display:block;">Highest month pts ever</span>`;
    } else {
        if(sdsDom) sdsDom.textContent=currentStreak;
        if(staminaDom) staminaDom.textContent=currentStamina;
    }
    document.getElementById('sum2-focus-log').innerHTML=filteredFocus.length?filteredFocus.map(l=>{const h2=Math.floor(l.duration/60),m2=Math.floor(l.duration%60);const dur=h2>0?`${h2}h ${m2}m`:`${m2}m`;return`<tr><td style="font-weight:600;">${escapeHTML(l.taskTitle||'General Focus')}</td><td style="font-family:var(--font-mono);">${dur}</td><td style="opacity:0.6;font-size:0.8rem;">${escapeHTML(String(l.date||new Date(l.stamp).toLocaleDateString()))}</td></tr>`}).join(''):`<tr><td colspan="3" style="text-align:center;color:var(--text-dim);">No focus sessions in range.</td></tr>`;
    const filteredSW=(state.sw&&state.sw.logs)?state.sw.logs.filter(l=>l.stamp>=startTime&&l.stamp<=endTime):[];
    document.getElementById('sum2-activity-log').innerHTML=filteredSW.length?filteredSW.map(l=>{const catMeta={productive:{bc:'badge-prod',emoji:'🟢',label:'Productive'},unproductive:{bc:'badge-unprod',emoji:'🔴',label:'Unproductive'},sleep:{bc:'badge-sleep',emoji:'🔵',label:'Sleep'},health:{bc:'badge-health',emoji:'🩷',label:'Health'},coding:{bc:'badge-coding',emoji:'💻',label:'Coding'}};const cm=catMeta[l.type]||{bc:'badge-prod',emoji:'🟢',label:l.type};return`<tr><td style="font-weight:600;">${escapeHTML(l.desc||'')}</td><td><span class="badge ${cm.bc}" style="display:inline-flex;align-items:center;gap:5px;">${cm.emoji} ${cm.label}</span></td><td style="font-family:var(--font-mono);font-size:0.82rem;">${formatTimeDDHHMMSS(l.duration)}</td></tr>`}).join(''):`<tr><td colspan="3" style="text-align:center;color:var(--text-dim);">No activity logs in range.</td></tr>`;
    
    renderIncompleteMissions();
    window.diary_updateSummaryCard();
    renderSummaryDonut(sums);
    renderSummaryDayBar(startTime, endTime);
    renderSummaryTaskCompletion(startTime, endTime);
    renderSummaryCoverageAndRevision(startTime, endTime);
    renderStaminaHistory();
    const burnoutDays=[];
    for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);burnoutDays.push({ds:getLocalIsoDate(d),mins:getDailyProdMins(getLocalIsoDate(d))});}
    updateBurnoutSummaryCard(burnoutDays);
    // Re-render active section 4 if visible
    if(window._sumActiveTab === 's4') {
        window.renderChapterReport && window.renderChapterReport();
        window.renderStudyPieCharts && window.renderStudyPieCharts();
        window.renderWeakChapters && window.renderWeakChapters();
    }
};

// ============================================================
// DOWNLOADABLE INTERACTIVE REPORT (Weekly / Monthly)
// ============================================================
window.downloadSummaryReport = function(period, customStartStr, customEndStr) {
    let startTime, endTime, periodLabel;
    if(period === 'custom') {
        if(!customStartStr || !customEndStr) {
            customStartStr = prompt('Report FROM date (YYYY-MM-DD):', getLocalIsoDate(new Date(Date.now()-6*86400000)));
            if(!customStartStr) return;
            customEndStr = prompt('Report TO date (YYYY-MM-DD):', getLocalIsoDate(new Date()));
            if(!customEndStr) return;
        }
        const sd = new Date(customStartStr+'T00:00:00'), ed = new Date(customEndStr+'T23:59:59');
        if(isNaN(sd.getTime()) || isNaN(ed.getTime()) || sd.getTime() > ed.getTime()) { alert('Invalid date range — use YYYY-MM-DD and make sure the start is before the end.'); return; }
        startTime = sd.getTime(); endTime = ed.getTime();
        periodLabel = `${customStartStr} → ${customEndStr}`;
    } else {
        const range = period === 'month' ? 'this_month' : 'this_week';
        ({startTime, endTime} = getTimeRange(range));
        periodLabel = period === 'month' ? 'Monthly' : 'Weekly';
    }

    // Time allocation (ms) from activity logs
    const sums = {productive:0, unproductive:0, sleep:0, health:0, coding:0};
    (state.sw && state.sw.logs ? state.sw.logs : []).forEach(l => {
        if(l.stamp >= startTime && l.stamp <= endTime && sums[l.type] !== undefined) sums[l.type] += l.duration;
    });

    // Focus sessions (minutes) from focus logs
    const focusLogs = (state.focus && state.focus.logs ? state.focus.logs : []).filter(l => l.stamp >= startTime && l.stamp <= endTime);
    const totalFocusMins = focusLogs.reduce((a,l) => a + (l.duration||0), 0);
    const totalFocusSessions = focusLogs.length;

    // Daily breakdown for the bar charts (7 days for week, all days-in-month for month)
    const dayCount = period === 'month' ? new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate() : (period === 'custom' ? Math.min(120, Math.round((endTime-startTime)/86400000)+1) : 7);
    const dayLabels = [], prodByDay = [], unprodByDay = [], focusByDay = [];
    for(let i = 0; i < dayCount; i++) {
        const d = new Date(startTime); d.setDate(d.getDate() + i);
        if(d.getTime() > endTime + 86400000) break;
        d.setHours(0,0,0,0);
        const dEnd = d.getTime() + 86399999;
        let prodMs = 0, unprodMs = 0, focusMins = 0;
        (state.sw && state.sw.logs ? state.sw.logs : []).forEach(l => {
            if(l.stamp >= d.getTime() && l.stamp <= dEnd) {
                if(l.type==='productive') prodMs += l.duration;
                else if(l.type==='unproductive') unprodMs += l.duration;
            }
        });
        focusLogs.forEach(l => { if(l.stamp >= d.getTime() && l.stamp <= dEnd) focusMins += l.duration; });
        dayLabels.push(period === 'month' ? (i+1).toString() : period === 'custom' ? d.toLocaleDateString(undefined,{month:'short',day:'numeric'}) : d.toLocaleDateString(undefined,{weekday:'short'}));
        prodByDay.push(Math.round(prodMs/60000));
        unprodByDay.push(Math.round(unprodMs/60000));
        focusByDay.push(Math.round(focusMins));
    }

    // Subject breakdown (pie) — from activity-logger entries tagged with a subject
    const subjectMins = {};
    (state.sw && state.sw.logs ? state.sw.logs : []).forEach(l => {
        if(l.stamp >= startTime && l.stamp <= endTime && l.type==='productive' && l.subject) {
            subjectMins[l.subject] = (subjectMins[l.subject]||0) + l.duration/60000;
        }
    });
    const subjectLabelsMap = {physics:'Physics', chemistry:'Chemistry', maths:'Maths', biology:'Biology'};
    const subjectPieLabels = Object.keys(subjectMins).map(s => subjectLabelsMap[s] || (s.charAt(0).toUpperCase()+s.slice(1)));
    const subjectPieData = Object.values(subjectMins).map(m => Math.round(m));

    // Study-type breakdown (pie) — lecture / module / dpp / test / revision
    const studyTypeMins = {};
    (state.sw && state.sw.logs ? state.sw.logs : []).forEach(l => {
        if(l.stamp >= startTime && l.stamp <= endTime && l.type==='productive' && l.studyType) {
            studyTypeMins[l.studyType] = (studyTypeMins[l.studyType]||0) + l.duration/60000;
        }
    });
    const studyTypeLabelsMap = {lecture:'Lecture', module:'Module', dpp:'DPP', test:'Test', revision:'Revision'};
    const studyTypePieLabels = Object.keys(studyTypeMins).map(s => studyTypeLabelsMap[s] || s);
    const studyTypePieData = Object.values(studyTypeMins).map(m => Math.round(m));

    // Chapter time (from focus logs' chapter field) — full list, not just top 8
    const chapterMins = {};
    focusLogs.forEach(l => {
        if(l.chapterTitle) chapterMins[l.chapterTitle] = (chapterMins[l.chapterTitle]||0) + (l.duration||0);
    });
    const allChapters = Object.entries(chapterMins).sort((a,b)=>b[1]-a[1]);
    const topChapters = allChapters.slice(0,8);

    // Mission (Nexus task) completion in period
    let missionsDone=0, missionsFailed=0, missionsPending=0;
    const taskLogRows = [];
    Object.keys(gg_db||{}).forEach(dateStr => {
        const dTime = new Date(dateStr+'T00:00:00').getTime();
        if(dTime < startTime || dTime > endTime) return;
        (gg_db[dateStr]||[]).forEach(t => {
            if(t.status===1) missionsDone++; else if(t.status===2) missionsFailed++; else missionsPending++;
            taskLogRows.push({date:dateStr, name:t.name, status:t.status, subject:t.subject||'', studyType:t.studyType||''});
        });
    });
    const missionsTotal = missionsDone+missionsFailed+missionsPending;

    // Full activity log for the period — every logged activity + every focus session,
    // merged and sorted chronologically, so the report shows exactly what happened.
    const activityRows = [];
    (state.sw && state.sw.logs ? state.sw.logs : []).forEach(l => {
        if(l.stamp >= startTime && l.stamp <= endTime) {
            activityRows.push({
                stamp: l.stamp, kind: l.type, desc: l.desc || (l.type==='productive'?'Study session':l.type),
                mins: Math.round((l.duration||0)/60000),
                subject: l.subject ? (subjectLabelsMap[l.subject]||l.subject) : '',
                studyType: l.studyType ? (studyTypeLabelsMap[l.studyType]||l.studyType) : ''
            });
        }
    });
    focusLogs.forEach(l => {
        activityRows.push({
            stamp: l.stamp, kind: 'focus', desc: `Deep Focus — ${l.taskTitle || 'General Focus'}`,
            mins: Math.round(l.duration||0),
            subject: '', studyType: '',
            chapter: l.chapterTitle || ''
        });
    });
    activityRows.sort((a,b) => b.stamp - a.stamp);
    const kindColor = {productive:'var(--prod)', unproductive:'var(--unprod)', sleep:'var(--sleep)', health:'var(--health)', focus:'var(--accent)'};
    const kindLabel = {productive:'PRODUCTIVE', unproductive:'UNPRODUCTIVE', sleep:'SLEEP', health:'HEALTH', focus:'DEEP FOCUS'};

    const fmt = ms => { const h=Math.floor(ms/3600000), m=Math.round((ms%3600000)/60000); return h>0?`${h}h ${m}m`:`${m}m`; };

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${periodLabel} Report — AstroCore</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"><\/script>
<style>
:root{--bg:#0b1020;--card:#131a30;--text:#eef2ff;--dim:#8892a4;--accent:#4f6ef7;--prod:#10b981;--unprod:#ef4444;--sleep:#3b82f6;--health:#ec4899;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:linear-gradient(135deg,#0b1020,#0e1530);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;padding:32px;}
h1{font-size:1.8rem;margin-bottom:4px;}
.sub{color:var(--dim);font-size:0.85rem;margin-bottom:28px;}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:24px;}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;}
.stat{background:var(--card);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px 18px;}
.stat .lbl{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--dim);margin-bottom:6px;}
.stat .val{font-size:1.4rem;font-weight:800;}
.card{background:var(--card);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px 22px;margin-bottom:22px;}
.card h2{font-size:1rem;margin-bottom:14px;color:#c7d2fe;}
canvas{max-height:280px;}
.chaprow{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.85rem;}
.logtable{width:100%;border-collapse:collapse;font-size:0.78rem;}
.logtable th{text-align:left;color:var(--dim);text-transform:uppercase;font-size:0.62rem;letter-spacing:0.06em;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.1);}
.logtable td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.05);}
.logscroll{max-height:480px;overflow-y:auto;}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.62rem;font-weight:700;letter-spacing:0.04em;}
footer{text-align:center;color:var(--dim);font-size:0.7rem;margin-top:20px;}
</style></head>
<body>
<h1>📊 ${periodLabel} Report</h1>
<div class="sub">Generated ${new Date().toLocaleString()} · AstroCore</div>
<div class="grid">
  <div class="stat"><div class="lbl">Productive</div><div class="val" style="color:var(--prod);">${fmt(sums.productive)}</div></div>
  <div class="stat"><div class="lbl">Unproductive</div><div class="val" style="color:var(--unprod);">${fmt(sums.unproductive)}</div></div>
  <div class="stat"><div class="lbl">Sleep</div><div class="val" style="color:var(--sleep);">${fmt(sums.sleep)}</div></div>
  <div class="stat"><div class="lbl">Health</div><div class="val" style="color:var(--health);">${fmt(sums.health)}</div></div>
  <div class="stat"><div class="lbl">Deep Focus</div><div class="val" style="color:var(--accent);">${formatMinsToHM(totalFocusMins)}</div></div>
  <div class="stat"><div class="lbl">Focus Sessions</div><div class="val">${totalFocusSessions}</div></div>
  <div class="stat"><div class="lbl">Tasks Done</div><div class="val" style="color:var(--prod);">${missionsDone} / ${missionsTotal}</div></div>
  <div class="stat"><div class="lbl">Tasks Not Done</div><div class="val" style="color:var(--unprod);">${missionsFailed+missionsPending} / ${missionsTotal}</div></div>
</div>
<div class="card"><h2>Productive vs Unproductive Minutes — Per Day</h2><canvas id="dayChart"></canvas></div>
<div class="grid2">
  <div class="card"><h2>Time Allocation</h2><canvas id="allocChart"></canvas></div>
  ${subjectPieData.length ? `<div class="card"><h2>Time by Subject</h2><canvas id="subjectChart"></canvas></div>` : ''}
  ${studyTypePieData.length ? `<div class="card"><h2>Time by Study Type</h2><canvas id="studyTypeChart"></canvas></div>` : ''}
</div>
${allChapters.length ? `<div class="card"><h2>Chapters Covered (${allChapters.length})</h2><div class="logscroll">${allChapters.map(([name,mins])=>`<div class="chaprow"><span>${name}</span><strong>${formatMinsToHM(mins)}</strong></div>`).join('')}</div></div>` : ''}
<div class="card">
  <h2>Task Log (${missionsTotal} total — ${missionsDone} done, ${missionsFailed} missed, ${missionsPending} pending)</h2>
  <div class="logscroll"><table class="logtable"><thead><tr><th>Date</th><th>Task</th><th>Subject</th><th>Type</th><th>Status</th></tr></thead><tbody>
  ${taskLogRows.sort((a,b)=>a.date<b.date?1:-1).map(r=>`<tr><td>${r.date}</td><td>${r.name}</td><td>${r.subject}</td><td>${r.studyType}</td><td><span class="badge" style="background:${r.status===1?'rgba(16,185,129,0.15);color:var(--prod)':r.status===2?'rgba(239,68,68,0.15);color:var(--unprod)':'rgba(255,255,255,0.08);color:var(--dim)'}">${r.status===1?'DONE':r.status===2?'MISSED':'PENDING'}</span></td></tr>`).join('')}
  </tbody></table></div>
</div>
<div class="card">
  <h2>Full Activity Log (${activityRows.length} entries)</h2>
  <div class="logscroll"><table class="logtable"><thead><tr><th>When</th><th>Type</th><th>Description</th><th>Subject</th><th>Study Type</th><th>Duration</th></tr></thead><tbody>
  ${activityRows.map(r=>`<tr><td>${new Date(r.stamp).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td><span class="badge" style="background:${kindColor[r.kind]}22;color:${kindColor[r.kind]}">${kindLabel[r.kind]||r.kind}</span></td><td>${r.desc}${r.chapter?` <span style="color:var(--dim);">(${r.chapter})</span>`:''}</td><td>${r.subject||'—'}</td><td>${r.studyType||'—'}</td><td>${r.mins}m</td></tr>`).join('')}
  </tbody></table></div>
</div>
<footer>Exported from AstroCore · Keep this file to compare progress over time.</footer>
<script>
new Chart(document.getElementById('dayChart'), {
  type:'bar',
  data:{ labels:${JSON.stringify(dayLabels)}, datasets:[
    {label:'Productive (min)', data:${JSON.stringify(prodByDay)}, backgroundColor:'rgba(16,185,129,0.75)', borderRadius:5},
    {label:'Unproductive (min)', data:${JSON.stringify(unprodByDay)}, backgroundColor:'rgba(239,68,68,0.75)', borderRadius:5},
    {label:'Deep Focus (min)', data:${JSON.stringify(focusByDay)}, backgroundColor:'rgba(79,110,247,0.75)', borderRadius:5}
  ]},
  options:{ responsive:true, plugins:{legend:{labels:{color:'#eef2ff'}}}, scales:{ x:{ticks:{color:'#8892a4'},grid:{color:'rgba(255,255,255,0.05)'}}, y:{ticks:{color:'#8892a4'},grid:{color:'rgba(255,255,255,0.05)'}} } }
});
new Chart(document.getElementById('allocChart'), {
  type:'doughnut',
  data:{ labels:['Productive','Unproductive','Sleep','Health'], datasets:[{ data:[${sums.productive},${sums.unproductive},${sums.sleep},${sums.health}], backgroundColor:['#10b981','#ef4444','#3b82f6','#ec4899'] }] },
  options:{ plugins:{legend:{labels:{color:'#eef2ff'}}} }
});
${subjectPieData.length ? `new Chart(document.getElementById('subjectChart'), {
  type:'pie',
  data:{ labels:${JSON.stringify(subjectPieLabels)}, datasets:[{ data:${JSON.stringify(subjectPieData)}, backgroundColor:['#4f6ef7','#f59e0b','#10b981','#ec4899','#8b5cf6','#06b6d4'] }] },
  options:{ plugins:{legend:{labels:{color:'#eef2ff'}}} }
});` : ''}
${studyTypePieData.length ? `new Chart(document.getElementById('studyTypeChart'), {
  type:'pie',
  data:{ labels:${JSON.stringify(studyTypePieLabels)}, datasets:[{ data:${JSON.stringify(studyTypePieData)}, backgroundColor:['#f59e0b','#4f6ef7','#10b981','#ec4899','#8b5cf6'] }] },
  options:{ plugins:{legend:{labels:{color:'#eef2ff'}}} }
});` : ''}
<\/script>
</body></html>`;

    const blob = new Blob([html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AstroCore-${periodLabel.replace(/[^a-zA-Z0-9]+/g,'-')}-Report-${getLocalIsoDate(new Date())}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
var _sumDonutChart = null, _sumDayBarChart = null;
function renderSummaryDonut(sums){
    const canvas=document.getElementById('sum-donut-chart');
    const emptyEl=document.getElementById('sum-donut-empty');
    if(!canvas)return;
    const total=sums.productive+sums.unproductive+sums.sleep+sums.health+sums.coding;
    if(_sumDonutChart){_sumDonutChart.destroy();_sumDonutChart=null;}
    if(total===0){if(emptyEl)emptyEl.style.display='flex';return;}
    if(emptyEl)emptyEl.style.display='none';
    const ctx=canvas.getContext('2d');
    _sumDonutChart=new Chart(ctx,{
        type:'doughnut',
        data:{labels:['Productive','Unproductive','Coding','Sleep','Health'],
            datasets:[{data:[Math.round(sums.productive/60000),Math.round(sums.unproductive/60000),Math.round(sums.coding/60000),Math.round(sums.sleep/60000),Math.round(sums.health/60000)],
            backgroundColor:['rgba(0,229,160,0.75)','rgba(255,75,112,0.75)','rgba(129,140,248,0.75)','rgba(56,189,248,0.75)','rgba(244,114,182,0.75)'],
            borderColor:['rgba(0,229,160,1)','rgba(255,75,112,1)','rgba(129,140,248,1)','rgba(56,189,248,1)','rgba(244,114,182,1)'],
            borderWidth:2,hoverOffset:6}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'65%',
            plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw}m`}}}}
    });
}

function renderSummaryDayBar(startTime, endTime) {
    const canvas = document.getElementById('sum-day-bar-chart');
    if(!canvas) return;
    const MS_DAY = 86400000;
    let dayCount = Math.max(1, Math.round((endTime - startTime) / MS_DAY) + 1);
    if(dayCount > 31) dayCount = 31; // cap so the chart & loop stay fast/readable
    const labels=[], prodData=[], unprodData=[], codingData=[], focusData=[];
    for(let i=dayCount-1;i>=0;i--) {
        const d = new Date(endTime - i*MS_DAY);
        const ds = getLocalIsoDate(d);
        const dayStart = new Date(ds); dayStart.setHours(0,0,0,0);
        const dS = dayStart.getTime(), dE = dS + (MS_DAY-1);
        let prod=0, unprod=0, coding=0, focus=0;
        (state.sw && state.sw.logs || []).forEach(l=>{
            if(l.stamp>=dS && l.stamp<=dE) {
                if(l.type==='productive') prod += (l.duration||0)/60000;
                else if(l.type==='unproductive') unprod += (l.duration||0)/60000;
                else if(l.type==='coding') coding += (l.duration||0)/60000;
            }
        });
        (state.focus && state.focus.logs || []).forEach(l=>{
            if(l.stamp>=dS && l.stamp<=dE) focus += (l.duration||0);
        });
        labels.push(d.toLocaleDateString('en-US',{month:'short',day:'numeric'}));
        prodData.push(Math.round(prod)); unprodData.push(Math.round(unprod)); codingData.push(Math.round(coding)); focusData.push(Math.round(focus));
    }
    if(_sumDayBarChart){_sumDayBarChart.destroy();_sumDayBarChart=null;}
    const ctx=canvas.getContext('2d');
    _sumDayBarChart=new Chart(ctx,{
        type:'bar',
        data:{labels,datasets:[
            {label:'Productive (min)',data:prodData,backgroundColor:'rgba(0,229,160,0.75)',borderRadius:4},
            {label:'Unproductive (min)',data:unprodData,backgroundColor:'rgba(255,75,112,0.75)',borderRadius:4},
            {label:'Coding (min)',data:codingData,backgroundColor:'rgba(129,140,248,0.75)',borderRadius:4},
            {label:'Deep Focus (min)',data:focusData,backgroundColor:'rgba(79,110,247,0.75)',borderRadius:4}
        ]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'var(--text-dim)',font:{size:10}}}},
            scales:{x:{ticks:{color:'var(--text-dim)',font:{size:9}},grid:{display:false}},y:{ticks:{color:'var(--text-dim)',font:{size:10}},beginAtZero:true}}}
    });
}

function renderSummaryTaskCompletion(startTime, endTime) {
    const doneEl=document.getElementById('sum2-tasks-done'), carryEl=document.getElementById('sum2-tasks-carry'),
        pendingEl=document.getElementById('sum2-tasks-pending'), pctEl=document.getElementById('sum2-tasks-pct');
    if(!doneEl) return;
    const todayStr = getLocalIsoDate(new Date());
    let done=0, carry=0, pending=0, total=0;
    Object.keys(gg_db||{}).forEach(dateStr=>{
        const dTime = new Date(dateStr).getTime();
        if(dTime < startTime || dTime > endTime) return;
        (gg_db[dateStr]||[]).forEach(t=>{
            if(t._carryFrozen) return; // historical marker only — don't double-count alongside its live copy
            total++;
            if(t.status===1) done++;
            else if(dateStr < todayStr) carry++;
            else pending++;
        });
    });
    doneEl.textContent = done;
    carryEl.textContent = carry;
    pendingEl.textContent = pending;
    pctEl.textContent = total>0 ? Math.round((done/total)*100)+'%' : '0%';
    window.renderSummaryChapterReport(startTime, endTime);
}

// Per subject+chapter: how many missions were entered (Add Mission, tagged with a
// subject/chapter) in this date range vs how many of those are marked done.
window.renderSummaryChapterReport = function(startTime, endTime) {
    const body = document.getElementById('sum2-chapter-report');
    if(!body) return;
    const S = window.ch_SUBJECTS || {};
    const rows = {}; // "sub::chapter" -> {sub,chapter,entered,done}
    Object.keys(gg_db||{}).forEach(dateStr=>{
        const dTime = new Date(dateStr).getTime();
        if(dTime < startTime || dTime > endTime) return;
        (gg_db[dateStr]||[]).forEach(t=>{
            if(!t.subject || !t.chapter) return;
            if(t._carryFrozen) return; // historical marker only — the live copy is what's still "entered"
            const key = t.subject + '::' + t.chapter;
            if(!rows[key]) rows[key] = { sub:t.subject, chapter:t.chapter, entered:0, done:0 };
            rows[key].entered++;
            if(t.status===1) rows[key].done++;
        });
    });
    const list = Object.values(rows).sort((a,b)=> (S[a.sub]?.label||a.sub).localeCompare(S[b.sub]?.label||b.sub) || a.chapter.localeCompare(b.chapter));
    if(!list.length) {
        body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-dim);">No missions tagged with a subject/chapter in this range.</td></tr>`;
        return;
    }
    body.innerHTML = list.map(r => {
        const subLabel = (S[r.sub] && S[r.sub].label) || r.sub;
        const complete = r.done === r.entered;
        return `<tr><td style="font-weight:600;">${escapeHTML(subLabel)}</td><td>${escapeHTML(r.chapter)}</td><td style="font-family:var(--font-mono);">${r.entered}</td><td style="font-family:var(--font-mono);color:${complete?'var(--prod)':'var(--warn)'};font-weight:700;">${r.done}</td></tr>`;
    }).join('');
};

function renderSummaryCoverageAndRevision(startTime, endTime) {
    // Chapter coverage — aggregate across every subject in ch_SUBJECTS/ch_db
    const covDoneEl=document.getElementById('sum2-cov-done'), covTotalEl=document.getElementById('sum2-cov-total'),
        covPctEl=document.getElementById('sum2-cov-pct'), covBarEl=document.getElementById('sum2-cov-bar');
    if(covDoneEl) {
        const S = window.ch_SUBJECTS||{}, DB = window.ch_db||{};
        let total=0, done=0;
        Object.keys(S).forEach(sub=>{
            const canonical = (S[sub].chapters)||[];
            const subData = DB[sub]||{};
            const custom = Object.keys(subData).filter(n=>subData[n].custom && !canonical.includes(n));
            const names = canonical.filter(n=>subData[n]).concat(custom);
            names.forEach(n=>{ total++; if(subData[n].done) done++; });
        });
        const pct = total ? Math.round(done/total*100) : 0;
        covDoneEl.textContent = done;
        covTotalEl.textContent = total;
        covPctEl.textContent = pct+'%';
        if(covBarEl) covBarEl.style.width = pct+'%';
    }

    // Revision statistics — from Activity Logger productive logs tagged studyType='revision'
    const revMinsEl=document.getElementById('sum2-rev-mins'), revSessEl=document.getElementById('sum2-rev-sessions'),
        revChapEl=document.getElementById('sum2-rev-chapters');
    if(revMinsEl) {
        let mins=0, sessions=0;
        const revisedChapters = new Set();
        (state.sw && state.sw.logs || []).forEach(l=>{
            if(l.stamp>=startTime && l.stamp<=endTime && l.type==='productive' && l.studyType==='revision') {
                mins += (l.duration||0)/60000; sessions++;
            }
        });
        // Also count chapters explicitly marked "revision done" in the chapter tracker
        const S = window.ch_SUBJECTS||{}, DB = window.ch_db||{};
        Object.keys(S).forEach(sub=>{
            const subData = DB[sub]||{};
            Object.keys(subData).forEach(n=>{ if(subData[n].revision) revisedChapters.add(sub+'::'+n); });
        });
        revMinsEl.textContent = formatMinsToHM(Math.round(mins));
        revSessEl.textContent = sessions;
        revChapEl.textContent = revisedChapters.size;
    }
}

function renderStaminaHistory(){
    const listEl=document.getElementById('stamina-history-list');
    const bestEl=document.getElementById('stamina-history-best');
    if(!listEl)return;
    const log=state.focus.staminaLog||{};
    const now=new Date();
    const curMonthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    // Always include current month
    const allLogs={...log,[curMonthKey]:state.focus.staminaPoints||0};
    const keys=Object.keys(allLogs).sort().reverse();
    if(!keys.length){listEl.innerHTML='<div style="text-align:center;padding:18px;color:var(--text-dim);font-size:0.82rem;">No stamina history yet. Start using the Focus timer!</div>';return;}
    const best=Math.max(...Object.values(allLogs));
    const bestMonth=keys.find(k=>allLogs[k]===best);
    if(bestEl){
        const [yr,mo]=bestMonth.split('-');
        const mName=new Date(parseInt(yr),parseInt(mo)-1,1).toLocaleString('default',{month:'long'});
        bestEl.innerHTML=`<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,rgba(79,110,247,0.1),rgba(0,0,0,0.2));border:1px solid rgba(79,110,247,0.25);">
            <div style="font-size:1.8rem;">🏆</div>
            <div><div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);">Highest Month</div>
            <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--accent);">${mName} ${yr} — ${best} pts</div></div>
        </div>`;
    }
    listEl.innerHTML=keys.map(k=>{
        const [yr,mo]=k.split('-');
        const mName=new Date(parseInt(yr),parseInt(mo)-1,1).toLocaleString('default',{month:'long'});
        const pts=allLogs[k];
        const pct=Math.round(pts/30*100);
        const isCur=k===curMonthKey;
        const barColor=pts>=25?'var(--prod)':pts>=15?'var(--accent)':pts>=8?'var(--warn)':'var(--danger)';
        return `<div style="margin-bottom:10px;padding:12px 16px;border-radius:10px;background:rgba(0,0,0,0.2);border:1px solid var(--border);${isCur?'border-color:var(--accent);':''}" >
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="font-size:0.82rem;font-weight:700;color:var(--text);">${mName} ${yr}${isCur?' <span style="font-size:0.6rem;color:var(--accent);font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid rgba(79,110,247,0.4);background:rgba(79,110,247,0.1);">CURRENT</span>':''}</div>
                <div style="font-family:var(--font-mono);font-size:1rem;font-weight:800;color:${barColor};">${pts}/30 pts</div>
            </div>
            <div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width 0.6s ease;"></div>
            </div>
        </div>`;
    }).join('');
}

window.incomplete_setFilter = function(filter, btn) {
    _incompleteFilter = filter;
    document.querySelectorAll('#incomplete-month-nav .lb-filter-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    renderIncompleteMissions();
};

function renderIncompleteMissions() {
    const today = getLocalIsoDate(new Date());
    const byMonth = {}; 
    let totalDone=0, totalFailed=0, totalPending=0;

    Object.keys(gg_db).sort().forEach(dateStr => {
        if(dateStr > today) return; 
        const tasks = gg_db[dateStr] || [];
        tasks.forEach(task => {
            if(task.status === 1) { totalDone++; return; } 
            if(task._carryFrozen) return; // historical marker only — the live copy is counted wherever it currently sits
            const monthKey = dateStr.slice(0,7); 
            if(!byMonth[monthKey]) byMonth[monthKey] = [];
            byMonth[monthKey].push({ dateStr, task });
            if(task.status === 2) totalFailed++;
            else totalPending++;
        });
    });

    totalDone = 0;
    Object.keys(gg_db).forEach(dateStr => {
        if(dateStr > today) return;
        (gg_db[dateStr]||[]).forEach(t => { if(t.status===1) totalDone++; });
    });

    const totalAll = totalDone + totalFailed + totalPending;
    const pct = totalAll > 0 ? Math.round(totalDone/totalAll*100) : 0;

    const ef=document.getElementById('inc-cnt-failed');if(ef)ef.textContent=totalFailed;
    const ep=document.getElementById('inc-cnt-pending');if(ep)ep.textContent=totalPending;
    const ed=document.getElementById('inc-cnt-done');if(ed)ed.textContent=totalDone;
    const epct=document.getElementById('inc-pct');if(epct)epct.textContent=pct+'%';

    const nav = document.getElementById('incomplete-month-nav');
    if(nav) {
        const months = Object.keys(byMonth).sort().reverse();
        let navHTML = `<button class="lb-filter-btn${_incompleteFilter==='all'?' active':''}" onclick="window.incomplete_setFilter('all',this)">All Months</button>`;
        months.forEach(m => {
            const [yr, mo] = m.split('-');
            const label = `${MONTH_NAMES[parseInt(mo)-1]} ${yr}`;
            navHTML += `<button class="lb-filter-btn${_incompleteFilter===m?' active':''}" onclick="window.incomplete_setFilter('${m}',this)">${label}</button>`;
        });
        nav.innerHTML = navHTML;
    }

    const list = document.getElementById('nexus-incomplete-list');
    if(!list) return;

    const filteredMonths = _incompleteFilter === 'all' ? Object.keys(byMonth).sort().reverse() : (_incompleteFilter in byMonth ? [_incompleteFilter] : []);

    if(!filteredMonths.length) {
        list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-dim);font-weight:600;">🎉 No incomplete or failed missions! All caught up.</div>`;
        return;
    }

    let html = '';
    filteredMonths.forEach(monthKey => {
        const items = byMonth[monthKey];
        const [yr, mo] = monthKey.split('-');
        const monthLabel = `${MONTH_NAMES[parseInt(mo)-1]} ${yr}`;
        const failedCount = items.filter(i=>i.task.status===2).length;
        const pendingCount = items.filter(i=>i.task.status===0).length;

        html += `<div class="incomplete-month-section">
            <div class="incomplete-month-label">
                <span>${monthLabel}</span>
                <span style="font-size:0.7rem;font-weight:700;color:var(--danger);font-family:var(--font-mono);">${failedCount} failed</span>
                <span style="font-size:0.7rem;font-weight:700;color:var(--warn);font-family:var(--font-mono);">${pendingCount} pending</span>
            </div>`;

        const sorted = [...items].sort((a,b) => {
            if(a.task.status !== b.task.status) return b.task.status - a.task.status; 
            return b.dateStr.localeCompare(a.dateStr);
        });

        sorted.forEach(({dateStr, task}) => {
            const isFailed = task.status === 2;
            const pClass = task.priority==='high'?'priority-high':task.priority==='low'?'priority-low':'priority-med';
            const pLabel = task.priority==='high'?'HIGH':task.priority==='low'?'LOW':'MED';
            const statusIcon = isFailed
                ? `<span style="color:var(--danger);font-size:1.1rem;"><i class="ph ph-x-circle"></i></span>`
                : `<span style="color:var(--warn);font-size:1.1rem;"><i class="ph ph-clock"></i></span>`;
            const rowClass = isFailed ? 'incomplete-mission-row status-failed' : 'incomplete-mission-row';
            html += `<div class="${rowClass}">
                ${statusIcon}
                <div style="flex:1;">
                    <div class="incomplete-mission-name">${escapeHTML(task.name)}</div>
                    ${task.notes?`<div style="font-size:0.72rem;color:var(--text-dim);margin-top:3px;">${escapeHTML(task.notes)}</div>`:''}
                </div>
                <span class="incomplete-mission-priority ${pClass}">${pLabel}</span>
                <div class="incomplete-mission-date">${dateStr}</div>
                <button class="gg-delete-btn" title="Stop carrying forward — freeze it here, keep as record" style="padding:5px 9px;border-radius:8px;border:1px solid var(--border-bright);background:rgba(255,255,255,0.05);cursor:pointer;font-size:0.8rem;" onclick="window.gg_stopCarryingFromIncomplete('${dateStr}',${task.id})"><i class="ph ph-hand-palm"></i></button>
                <button class="gg-delete-btn" title="Delete this task entirely" style="padding:5px 9px;border-radius:8px;border:1px solid rgba(255,75,112,0.3);background:rgba(255,75,112,0.1);color:var(--danger);cursor:pointer;font-size:0.8rem;" onclick="window.gg_deleteFromIncomplete('${dateStr}',${task.id})"><i class="ph ph-trash"></i></button>
            </div>`;
        });
        html += `</div>`;
    });
    list.innerHTML = html;
}
// Minimal standalone handlers for the historical "Incomplete Missions"
// archive above — it still reads old gg_db records, so these keep its
// two action buttons working without needing the rest of the old
// Nexus/Missions engine that was removed.
window.gg_deleteFromIncomplete = function(dateStr, taskId) {
    const arr = gg_db[dateStr]; if(!arr) return;
    const idx = arr.findIndex(t => String(t.id) === String(taskId));
    if(idx === -1) return;
    if(!confirm("Delete this task? This can't be undone.")) return;
    arr.splice(idx, 1);
    triggerSave();
    window.renderIncompleteMissions && window.renderIncompleteMissions();
};
window.gg_stopCarryingFromIncomplete = function(dateStr, taskId) {
    const arr = gg_db[dateStr]; if(!arr) return;
    const task = arr.find(t => String(t.id) === String(taskId));
    if(!task) return;
    if(!confirm(`Stop "${task.name}" from carrying forward? It'll stay right here and never copy to today again.`)) return;
    task._carryStopped = true;
    task._carriedForward = false;
    triggerSave();
    window.renderIncompleteMissions && window.renderIncompleteMissions();
};

// ============================================================
// DIARY
// ============================================================
let _diarySelectedTag = '';
let _diaryFilterTag = 'all';
let _diarySumMode = 'week';
let _diarySumMonthIdx = new Date().getMonth();
let _diarySumWeekNum = (() => { const n=new Date(), j=new Date(n.getFullYear(),0,1); return Math.ceil(((n-j)/86400000+j.getDay()+1)/7); })();
const DIARY_TAG_META = {
    excellent: { label: '🌟 Excellent',    color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.4)' },
    good:      { label: '✅ Good Day',     color: '#00e5a0', bg: 'rgba(0,229,160,0.15)',   border: 'rgba(0,229,160,0.4)' },
    needwork:  { label: '💪 Need Work',    color: '#818cf8', bg: 'rgba(129,140,248,0.15)', border: 'rgba(129,140,248,0.4)' },
    shame:     { label: '😤 Shame On You', color: '#ff4b70', bg: 'rgba(255,75,112,0.15)',  border: 'rgba(255,75,112,0.4)' }
};
window.diary_selectTag = (tag, btn) => {
    _diarySelectedTag = tag;
    document.querySelectorAll('.diary-tag-btn').forEach(b => { b.classList.remove('active'); b.style.background = 'transparent'; });
    if (btn) { btn.classList.add('active'); btn.style.background = DIARY_TAG_META[tag] ? DIARY_TAG_META[tag].bg : ''; }
};
window.diary_filter = (tag, btn) => {
    _diaryFilterTag = tag;
    document.querySelectorAll('#diary .lb-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window.diary_render();
};
window._legacyDiarySave = () => {
    const text = document.getElementById('diary-text').value.trim();
    if (!text) { alert('Write something first!'); return; }
    const tag = _diarySelectedTag || 'good';
    const dateEl = document.getElementById('diary-date');
    const date = dateEl ? dateEl.value : getLocalIsoDate(new Date());
    let entries = state.diary || [];
    const existIdx = entries.findIndex(e => e.date === date);
    const entry = { id: Date.now(), date: date, text: text, tag: tag, stamp: Date.now() };
    if (existIdx >= 0) {
        if (!confirm(`You already have an entry for ${date}. Overwrite it?`)) return;
        entries[existIdx] = entry;
    } else entries.push(entry);
    state.diary = entries;
    triggerSave();
    document.getElementById('diary-text').value = '';
    _diarySelectedTag = '';
    if (dateEl) dateEl.value = getLocalIsoDate(new Date());
};
window._legacyDiaryDelete = (id) => {
    if (!confirm('Delete this diary entry?')) return;
    state.diary = (state.diary || []).filter(e => e.id !== id);
    triggerSave();
};
window.diary_togglePinLock = function(checked) {
    if (!state.settings) state.settings = {};
    if (checked && !state.settings.diaryPin) {
        // Turning it on with no PIN set yet — make them set one now, otherwise the
        // toggle would be "on" but have nothing to check against.
        window.diary_setPin();
        if (!state.settings.diaryPin) {
            const cb = document.getElementById('diary-pin-toggle'); if (cb) cb.checked = false;
            return;
        }
    }
    state.settings.diaryPinEnabled = checked;
    triggerSave();
};
window._diaryUnlocked = false; // resets each page load — locked view re-asks for the PIN
window.diary_toggleViewPinLock = function(checked) {
    if (!state.settings) state.settings = {};
    if (checked && !state.settings.diaryPin) {
        window.diary_setPin();
        if (!state.settings.diaryPin) {
            const cb = document.getElementById('diary-view-pin-toggle'); if (cb) cb.checked = false;
            return;
        }
    }
    state.settings.diaryViewPinEnabled = checked;
    triggerSave();
};
window.diary_checkLock = function() {}; // superseded by the diary vault (below)
window.diary_unlockView = function() { window._diaryUnlocked = true; window.diary_render(); };
// ============================================================
// PRIVATE DIARY (Nexus V2 UI) — replaces the old diary view.
// Adds an optional client-side AES-GCM "vault": when enabled, diary
// entries are encrypted with a passphrase before they're ever synced
// to the cloud, and the plaintext only exists locally after unlocking.
// The passphrase itself is never stored anywhere.
// ============================================================
let _diaryVaultPass = '';
async function _diaryDeriveKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function _diaryB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function _diaryUb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
async function _diaryEncryptForSync() {
    const s = state.settings || {};
    if (!_diaryVaultPass) return null;
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await _diaryDeriveKey(_diaryVaultPass, salt);
    const data = new TextEncoder().encode(JSON.stringify(state.diary || []));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    s.diaryVault = { salt: _diaryB64(salt), iv: _diaryB64(iv), ciphertext: _diaryB64(ct) };
    return s.diaryVault;
}
function _diaryToast(msg) {
    let t = document.getElementById('diary-toast');
    if (!t) { t = document.createElement('div'); t.id = 'diary-toast'; t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface,#1c1e2e);border:1px solid var(--border,rgba(255,255,255,.12));color:var(--text,#fff);padding:10px 18px;border-radius:10px;font-size:.75rem;z-index:9999;transition:opacity .25s'; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}
window.v7VaultEnable = async function() {
    const s = state.settings || (state.settings = {});
    if (s.diaryVaultEnabled) { _diaryToast('Vault already enabled — use Unlock vault.'); return; }
    const p = prompt('Create a diary vault passphrase (never stored):');
    if (!p || p.length < 6) { alert('Use at least 6 characters.'); return; }
    s.diaryVaultEnabled = true;
    _diaryVaultPass = p;
    await _diaryEncryptForSync();
    triggerSave();
    _diaryToast('Diary AES-GCM vault enabled');
    window.diary_render();
};
window.v7VaultUnlock = async function(pass) {
    const s = state.settings || {}, v = s.diaryVault;
    if (!v) return false;
    try {
        const key = await _diaryDeriveKey(pass, _diaryUb64(v.salt));
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _diaryUb64(v.iv) }, key, _diaryUb64(v.ciphertext));
        state.diary = JSON.parse(new TextDecoder().decode(pt));
        _diaryVaultPass = pass;
        window._diaryUnlocked = true;
        window.diary_render();
        return true;
    } catch (e) { return false; }
};
window.v7PrepareDiarySync = async function() {
    const s = state.settings || {};
    if (!s.diaryVaultEnabled) return { diary: state.diary || [], vault: null };
    if (!_diaryVaultPass) return { diary: [], vault: s.diaryVault || null }; // still locked: don't overwrite the cloud vault
    const v = await _diaryEncryptForSync();
    triggerSave();
    return { diary: [], vault: v };
};
window.v7DiarySetVault = async function() {
    const p = document.getElementById('v7-vault-pass')?.value || '';
    if (p.length < 6) { alert('Use at least 6 characters.'); return; }
    (state.settings || (state.settings = {})).diaryVaultEnabled = true;
    _diaryVaultPass = p;
    await _diaryEncryptForSync();
    triggerSave();
    document.getElementById('v7-vault-pass').value = '';
    window.diary_render();
    _diaryToast('AES-GCM vault configured');
};
window.v7DiaryUnlock = async function() {
    if (!state.settings?.diaryVaultEnabled) { _diaryToast('Vault is not enabled'); return; }
    const p = prompt('Enter diary vault passphrase');
    if (!p) return;
    const ok = await window.v7VaultUnlock(p);
    if (!ok) alert('Incorrect passphrase or corrupted vault data.');
    else _diaryToast('Diary unlocked');
};
window.diary_save = function() {
    if (state.settings?.diaryVaultEnabled && !_diaryVaultPass) { alert('Unlock the Diary Vault before saving entries.'); return; }
    window._legacyDiarySave();
    window.diary_render();
};
window.diary_delete = function(id) {
    if (state.settings?.diaryVaultEnabled && !_diaryVaultPass) { alert('Unlock the Diary Vault before editing entries.'); return; }
    window._legacyDiaryDelete(id);
    window.diary_render();
};
window.diary_render = function() {
    const v = document.getElementById('diary');
    if (!v) return;
    const locked = !!(state.settings && state.settings.diaryVaultEnabled) && !window._diaryUnlocked;
    v.innerHTML = `<div class="section-header">Private Diary <span class="v7-pill">${locked ? 'VAULT LOCKED' : 'ENCRYPTION READY'}</span></div>
    <div class="v7-diary">
        <section class="v7-diary-editor">
            <div style="font-size:.55rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.14em">Daily log</div>
            <h2 style="font-family:var(--font-display);margin:5px 0 14px">Write without clutter.</h2>
            ${locked ? `<div style="padding:14px;border:1px dashed var(--border,rgba(255,255,255,.15));border-radius:10px;font-size:.75rem;color:var(--text-dim);margin-bottom:14px"><i class="ph ph-lock-key"></i> Your diary vault is locked. Unlock it to write or read entries.</div>` :
            `<input id="diary-date" type="date" value="${getLocalIsoDate(new Date())}">
            <textarea id="diary-text" placeholder="What happened today? What should tomorrow know?"></textarea>`}
            <div class="v7-vault">
                <button class="btn btn-primary" onclick="window.diary_save()" ${locked ? 'disabled' : ''}>Save entry</button>
                <button class="btn" onclick="window.v7DiaryUnlock()">${locked ? 'Unlock vault' : (state.settings?.diaryVaultEnabled ? 'Re-lock' : 'Unlock vault')}</button>
            </div>
            <div class="v7-vault">
                <input id="v7-vault-pass" type="password" placeholder="Vault passphrase">
                <button class="btn" onclick="window.v7DiarySetVault()">Set / enable AES-GCM</button>
            </div>
            <div id="v7-vault-info" style="font-size:.55rem;color:var(--text-dim);margin-top:8px">${state.settings?.diaryVaultEnabled ? '🔐 AES-GCM vault enabled. Passphrase is not stored.' : 'Vault off — diary uses normal cloud storage.'}</div>
        </section>
        <section>
            <div class="v7-report-grid" style="margin-bottom:12px">
                <div class="v7-report-card"><small>Entries</small><strong id="v7-diary-count">0</strong></div>
                <div class="v7-report-card"><small>This week</small><strong id="v7-diary-week">0</strong></div>
                <div class="v7-report-card"><small>Vault</small><strong id="v7-diary-vault">${state.settings?.diaryVaultEnabled ? 'ON' : 'OFF'}</strong></div>
                <div class="v7-report-card"><small>Streak</small><strong>${state.focus?.dayStreak || 0}</strong></div>
            </div>
            <div id="v7-diary-list" class="v7-diary-list"></div>
        </section>
    </div>`;
    if (!locked) _diaryListRender();
    else { const list = document.getElementById('v7-diary-list'); if (list) list.innerHTML = '<div class="card" style="padding:30px;text-align:center;color:var(--text-dim)">Unlock the vault to view entries.</div>'; }
};
function _diaryListRender() {
    const list = document.getElementById('v7-diary-list');
    if (!list) return;
    const arr = (state.diary || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const countEl = document.getElementById('v7-diary-count'); if (countEl) countEl.textContent = arr.length;
    const wk = new Date(); wk.setDate(wk.getDate() - 6);
    const weekEl = document.getElementById('v7-diary-week'); if (weekEl) weekEl.textContent = arr.filter(e => new Date(e.date + 'T00:00:00') >= wk).length;
    list.innerHTML = arr.length ? arr.map(e => {
        const m = DIARY_TAG_META[e.tag] || DIARY_TAG_META.good;
        return `<article class="v7-diary-entry"><div style="display:flex;justify-content:space-between;gap:8px">
            <span class="v7-pill" style="color:${m.color}">${escapeHTML(e.date)}</span>
            <span class="v7-pill">${escapeHTML(m.label || e.tag || 'note')}</span>
        </div><p>${escapeHTML(e.text)}</p><button class="btn" onclick="window.diary_delete(${e.id})">Delete</button></article>`;
    }).join('') : '<div class="card" style="padding:30px;text-align:center;color:var(--text-dim)">Your new diary timeline starts here.</div>';
}
// ============================================================
// DYNAMIC SUBJECT / STUDY-TYPE DROPDOWN SYNC
// ============================================================
window.populateAllSubjectDropdowns = function() {
    var S = window.ch_SUBJECTS || {};
    var subKeys = Object.keys(S);
    if(!subKeys.length) return; // onboarding not done yet

    var ob = window._obIdentity;
    var studyTypes = (ob && ob.studyTypes && ob.studyTypes.length > 0)
        ? ob.studyTypes
        : ['lecture','dpp','module','revision','test','wrongQ'];

    var ALL_ST_MAP = {
        lecture:{icon:'\u{1F3AC}',label:'Lecture'}, dpp:{icon:'\u{1F4DD}',label:'DPP'},
        module:{icon:'\u{1F4DA}',label:'Module'}, wrongQ:{icon:'\u274C',label:'Wrong Q'},
        revision:{icon:'\u{1F501}',label:'Revision'}, test:{icon:'\u2705',label:'Test'},
        ncert:{icon:'\u{1F4D7}',label:'NCERT'}, pyq:{icon:'\u{1F5C2}\uFE0F',label:'PYQ'},
        flash:{icon:'\u26A1',label:'Flashcards'}, writing:{icon:'\u270D\uFE0F',label:'Writing'},
        map:{icon:'\u{1F5FA}\uFE0F',label:'Map'}, current:{icon:'\u{1F4F0}',label:'Curr. Affairs'}
    };

    // 1 — Doubt subject select
    var dSel = document.getElementById('doubt-subject');
    if(dSel) {
        dSel.innerHTML = subKeys.map(function(k){
            return '<option value="' + S[k].label + '">' + S[k].label + '</option>';
        }).join('') + '<option value="General">General</option>';
    }

    // 2 — Activity log subject select
    var sSel = document.getElementById('sw-log-subject');
    if(sSel) {
        sSel.innerHTML = '<option value="">No Subject</option>' +
            subKeys.map(function(k){
                return '<option value="' + k + '">' + S[k].label + '</option>';
            }).join('');
    }

    // 3 — Activity log study type select
    var tSel = document.getElementById('sw-log-type');
    if(tSel) {
        tSel.innerHTML = '<option value="">No Type</option>' +
            studyTypes.map(function(k) {
                var st = ALL_ST_MAP[k] || {icon:'\u{1F4CC}', label:k};
                return '<option value="' + k + '">' + st.icon + ' ' + st.label + '</option>';
            }).join('');
    }

    // 4 — Focus chapter subject select
    var fcSel = document.getElementById('f-chapter-subject-select');
    if(fcSel) {
        fcSel.innerHTML = '<option value="">Subject&hellip;</option>' +
            subKeys.map(function(k){
                return '<option value="' + k + '">' + S[k].label + '</option>';
            }).join('');
    }

    // 5 — Add chapter subject select (chapter tracker)
    var cnSel = document.getElementById('ch-new-sub');
    if(cnSel) {
        cnSel.innerHTML = subKeys.map(function(k){
            return '<option value="' + k + '">' + S[k].label + '</option>';
        }).join('');
    }

    // 6 — Summary chapter subject filter buttons
    var sumRow = document.getElementById('sum-subj-filter-row');
    if(sumRow) {
        sumRow.innerHTML = '<span style="font-size:0.7rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;">Subject:</span>' +
            '<button class="lb-filter-btn active" onclick="window.sumChapSubjFilter(\'all\',this)">All</button>' +
            subKeys.map(function(k){
                var c = S[k].color || 'var(--accent)';
                return '<button class="lb-filter-btn" onclick="window.sumChapSubjFilter(\'' + k + '\',this)" style="border-color:' + c + '44;color:' + c + ';">' + S[k].label + '</button>';
            }).join('');
    }

    // 7 — Mistake Bank subject filter buttons
    var mbRow = document.getElementById('mb-subj-filter-row');
    if(mbRow) {
        mbRow.innerHTML = '<span style="font-size:0.7rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;">Filter:</span>' +
            '<button class="at-hist-chart-btn active" onclick="AT.filterMistakes(\'all\',this)">All Subjects</button>' +
            subKeys.map(function(k){
                var c = S[k].color || 'var(--accent)';
                return '<button class="at-hist-chart-btn" onclick="AT.filterMistakes(\'' + S[k].label + '\',this)" style="border-color:' + c + '44;color:' + c + ';">' + S[k].label + '</button>';
            }).join('') +
            '<input id="mb-search" type="text" placeholder="Search chapter..." style="flex:1;min-width:160px;max-width:280px;padding:8px 14px;font-size:0.82rem;margin-bottom:0;height:36px;">';
        // Re-attach mb-search events
        var newSearch = document.getElementById('mb-search');
        if(newSearch) newSearch.oninput = function(){ AT && AT.renderMistakesFiltered && AT.renderMistakesFiltered(); };
    }
};

function populateDiarySelects() {
    const wsEl = document.getElementById('diary-sum-week-sel');
    if (wsEl) {
        let opts = '';
        for (let w = 1; w <= 53; w++) opts += `<option value="${w}">Week ${w}</option>`;
        wsEl.innerHTML = opts; wsEl.value = _diarySumWeekNum;
    }
    const msEl = document.getElementById('diary-sum-month-sel');
    if (msEl) msEl.value = _diarySumMonthIdx;
}
window.diary_sumView = (mode, btn) => {
    _diarySumMode = mode;
    document.querySelectorAll('#diary-sum-nav .lb-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window.diary_updateSummaryCard();
};
window.diary_sumViewMonth = (idx) => {
    _diarySumMode = 'monthsel'; _diarySumMonthIdx = parseInt(idx);
    document.querySelectorAll('#diary-sum-nav .lb-filter-btn').forEach(b => b.classList.remove('active'));
    window.diary_updateSummaryCard();
};
window.diary_sumViewWeek = (num) => {
    _diarySumMode = 'weeksel'; _diarySumWeekNum = parseInt(num);
    document.querySelectorAll('#diary-sum-nav .lb-filter-btn').forEach(b => b.classList.remove('active'));
    window.diary_updateSummaryCard();
};
window.diary_updateSummaryCard = () => {
    const now = new Date(), yr = now.getFullYear();
    let sd, ed;
    if (_diarySumMode === 'week') {
        const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay());
        sd = new Date(d); ed = new Date(d); ed.setDate(ed.getDate() + 6);
    } else if (_diarySumMode === 'month') {
        sd = new Date(yr, now.getMonth(), 1); ed = new Date(yr, now.getMonth()+1, 0);
    } else if (_diarySumMode === 'year') {
        sd = new Date(yr, 0, 1); ed = new Date(yr, 11, 31);
    } else if (_diarySumMode === 'monthsel') {
        sd = new Date(yr, _diarySumMonthIdx, 1); ed = new Date(yr, _diarySumMonthIdx+1, 0);
    } else if (_diarySumMode === 'weeksel') {
        const jan1 = new Date(yr, 0, 1); const firstSun = new Date(jan1); firstSun.setDate(jan1.getDate() - jan1.getDay());
        sd = new Date(firstSun); sd.setDate(firstSun.getDate() + (_diarySumWeekNum-1)*7);
        ed = new Date(sd); ed.setDate(sd.getDate() + 6);
    }
    const sds = sd.toISOString().slice(0,10), eds = ed.toISOString().slice(0,10);
    const entries = (state.diary || []).filter(e => e.date >= sds && e.date <= eds);
    const counts = { excellent:0, good:0, needwork:0, shame:0 };
    entries.forEach(e => { if (counts[e.tag] !== undefined) counts[e.tag]++; });
    Object.keys(counts).forEach(k => { const el = document.getElementById(`diary-cnt-${k}`); if (el) el.textContent = counts[k]; });
    const streakDiv = document.getElementById('diary-streak-summary');
    if (streakDiv && state.focus) {
        streakDiv.innerHTML = `<span style="margin-right:12px;">🔥 Streak: <strong style="color:var(--warn);">${state.focus.dayStreak||0} days</strong></span><span>⚡ Stamina: <strong style="color:var(--accent);">${state.focus.staminaPoints||0} pts</strong></span>`;
    }
};

// NOTE: the diary is no longer hidden or PIN-locked — it's always visible.
// The PIN itself is kept (state.settings.diaryPin) because Data Management's
// "Export All" reuses this same PIN as a security confirmation step.
window.diary_setPin = function() {
    if (!state.settings) state.settings = {};
    const current = state.settings.diaryPin;
    if(current) {
        const old = prompt('Enter current PIN to change it:');
        if(old !== current) { alert('Incorrect current PIN.'); return; }
    }
    const newPin = prompt('Set your Security PIN (numbers/letters, min 4 chars).\nThis PIN is required whenever you Export All Data.');
    if(!newPin || newPin.trim().length < 4) { alert('PIN must be at least 4 characters.'); return; }
    const confirmPin = prompt('Confirm new PIN:');
    if(newPin.trim() !== confirmPin) { alert("PINs don't match."); return; }
    state.settings.diaryPin = newPin.trim();
    triggerSave();
    alert('Security PIN set successfully!');
};

// ============================================================
// ACTIVITY LOGGER
// ============================================================
const swBtn=document.getElementById('sw-toggle');
swBtn.onclick=()=>{
    if(!state.sw.running){state.sw.lastStart=Date.now();state.sw.running=true;swBtn.innerHTML="<i class='ph ph-pause'></i> Pause";}
    else{state.sw.elapsed+=(Date.now()-state.sw.lastStart);state.sw.running=false;swBtn.innerHTML="<i class='ph ph-play'></i> Resume";}
    triggerSave();
};
document.getElementById('sw-lap') && (document.getElementById('sw-lap').onclick = null); // legacy guard
window.showLogForm = function() {
    const f = document.getElementById('sw-log-form');
    if(!f) return;
    f.style.display = f.style.display === 'none' || !f.style.display ? 'block' : 'none';
    window.toggleLogSubjectFields();
};
window.toggleLogSubjectFields = function() {
    const cat = (document.getElementById('sw-log-cat') || {}).value;
    const wrap = document.getElementById('sw-log-subject-wrap');
    if(wrap) wrap.style.display = cat === 'productive' ? 'grid' : 'none';
};
window.doLogActivity = function() {
    const desc = (document.getElementById('sw-log-desc').value || '').trim() || 'Activity';
    const cat = document.getElementById('sw-log-cat').value || 'productive';
    const subject = (document.getElementById('sw-log-subject') || {}).value || '';
    const studyType = (document.getElementById('sw-log-type') || {}).value || '';
    const cur = state.sw.elapsed + (state.sw.running ? (Date.now() - state.sw.lastStart) : 0);
    const duration = cur - state.sw.marker;
    if(duration <= 0) { alert('No time elapsed since last log!'); return; }
    const logEntry = {desc, type: cat, duration, stamp: Date.now()};
    if(cat === 'productive') {
        if(subject) logEntry.subject = subject;
        if(studyType) logEntry.studyType = studyType;
    }
    state.sw.logs.unshift(logEntry);
    state.sw.marker = cur;
    document.getElementById('sw-log-desc').value = '';
    document.getElementById('sw-log-cat').value = 'productive';
    if(document.getElementById('sw-log-subject')) document.getElementById('sw-log-subject').value = '';
    if(document.getElementById('sw-log-type')) document.getElementById('sw-log-type').value = '';
    document.getElementById('sw-log-form').style.display = 'none';
    renderLogs(); triggerSave(); window.updateHomeStats();
};
document.getElementById('sw-reset').onclick=()=>{
    if(confirm("Purge all logs?")){state.sw={elapsed:0,running:false,lastStart:0,marker:0,logs:[]};document.getElementById('sw-display').textContent="00d 00:00:00";document.getElementById('sw-toggle').innerHTML="<i class='ph ph-play'></i> Start Session";renderLogs();triggerSave();window.updateHomeStats();}
};
function renderLogs(){
    const body=document.getElementById('sw-table-body');if(!body)return;
    // Build subject colors/labels from ch_SUBJECTS dynamically
    const _S = window.ch_SUBJECTS || {};
    const subjectColors = {};
    const subjectLabels = {};
    Object.keys(_S).forEach(k => { subjectColors[k]=_S[k].color||'var(--accent)'; subjectLabels[k]=_S[k].label||k; });
    // fallbacks
    if(!subjectColors.physics){subjectColors.physics='#38bdf8';subjectLabels.physics='Physics';}
    if(!subjectColors.chemistry){subjectColors.chemistry='#f472b6';subjectLabels.chemistry='Chemistry';}
    if(!subjectColors.maths){subjectColors.maths='#a855f7';subjectLabels.maths='Maths';}
    const typeLabels={lecture:'🎬 LEC',module:'📚 MOD',dpp:'📝 DPP',test:'✅ TEST',revision:'🔁 REV',wrongQ:'❌ WRONG',ncert:'📗 NCERT',pyq:'🗂️ PYQ',flash:'⚡ FLASH',writing:'✍️ WRITE',map:'🗺️ MAP',current:'📰 CURR'};
    body.innerHTML=state.sw.logs.map((l,i)=>{
        const catMeta={productive:{bc:'badge-prod',emoji:'🟢',label:'Productive'},unproductive:{bc:'badge-unprod',emoji:'🔴',label:'Unproductive'},sleep:{bc:'badge-sleep',emoji:'🔵',label:'Sleep'},health:{bc:'badge-health',emoji:'🩷',label:'Health'},coding:{bc:'badge-coding',emoji:'💻',label:'Coding'}};
        const cm=catMeta[l.type]||{bc:'badge-prod',emoji:'🟢',label:l.type};
        const subTag=l.subject?`<span style="font-size:0.58rem;font-weight:700;padding:1px 6px;border-radius:99px;background:${subjectColors[l.subject]||'var(--accent)'}22;color:${subjectColors[l.subject]||'var(--accent)'};border:1px solid ${subjectColors[l.subject]||'var(--accent)'}44;margin-left:4px;">${subjectLabels[l.subject]||l.subject.toUpperCase()}</span>`:'';
        const typeTag=l.studyType?`<span style="font-size:0.58rem;font-weight:700;padding:1px 6px;border-radius:99px;background:rgba(251,191,36,0.12);color:var(--warn);border:1px solid rgba(251,191,36,0.3);margin-left:4px;">${typeLabels[l.studyType]||l.studyType.toUpperCase()}</span>`:'';
        const retroTag = l.retro ? `<span style="font-size:0.55rem;font-weight:700;padding:1px 6px;border-radius:99px;background:rgba(251,191,36,0.15);color:var(--warn);border:1px solid rgba(251,191,36,0.35);margin-left:4px;">⏳ PAST</span>` : '';
        const stampDisplay = l.retro ? new Date(l.stamp).toLocaleDateString()+' '+new Date(l.stamp).toLocaleTimeString() : new Date(l.stamp).toLocaleTimeString();
        return`<tr><td>${l.desc}${subTag}${typeTag}${retroTag}</td><td><span class="badge ${cm.bc}" style="display:inline-flex;align-items:center;gap:5px;font-size:0.72rem;">${cm.emoji} ${cm.label}</span></td><td style="font-family:var(--font-mono);font-size:0.85rem;">${formatTimeDDHHMMSS(l.duration)}</td><td style="text-align:right;opacity:0.4;font-size:0.8rem;">${stampDisplay}</td><td><button style="padding:5px 9px;border-radius:8px;border:1px solid rgba(255,75,112,0.3);background:rgba(255,75,112,0.1);color:var(--danger);cursor:pointer;font-size:0.8rem;" onclick="window.deleteLog(${i})"><i class='ph ph-trash'></i></button></td></tr>`;
    }).join('');
    const sums={productive:0,unproductive:0,sleep:0,health:0,coding:0};
    state.sw.logs.forEach(l=>{if(sums[l.type]!==undefined)sums[l.type]+=l.duration;});
    document.getElementById('sum-prod').innerHTML=renderTimeBlock(sums.productive);
    document.getElementById('sum-unprod').innerHTML=renderTimeBlock(sums.unproductive);
    document.getElementById('sum-sleep').innerHTML=renderTimeBlock(sums.sleep);
    document.getElementById('sum-health').innerHTML=renderTimeBlock(sums.health);
}
window.deleteLog=function(idx){state.sw.logs.splice(idx,1);renderLogs();triggerSave();window.updateHomeStats();};

// ── ACTIVITY LOGGER: FILTER POPUP ──────────────────────────────────────────
window.logFilter_open = function() {
    const s = document.getElementById('logfilter-search'); if(s) s.value = '';
    const c = document.getElementById('logfilter-cat'); if(c) c.value = 'all';
    document.getElementById('logfilter-modal').style.display = 'flex';
    window.logFilter_run();
};
window.logFilter_close = function() {
    document.getElementById('logfilter-modal').style.display = 'none';
};
window.logFilter_run = function() {
    const query = (document.getElementById('logfilter-search').value || '').trim().toLowerCase();
    const cat = document.getElementById('logfilter-cat').value || 'all';
    const logs = (state.sw && state.sw.logs) ? state.sw.logs : [];

    const matches = logs.filter(l => {
        if(cat !== 'all' && l.type !== cat) return false;
        if(query && !(l.desc||'').toLowerCase().includes(query)) return false;
        return true;
    });

    // Group by activity name (case-insensitive) and sum total duration for each
    const byName = {};
    matches.forEach(l => {
        const key = (l.desc || 'Activity').trim().toLowerCase();
        if(!byName[key]) byName[key] = { name: l.desc || 'Activity', total: 0, count: 0, type: l.type };
        byName[key].total += l.duration || 0;
        byName[key].count += 1;
    });

    const rows = Object.values(byName).sort((a,b) => b.total - a.total);
    const grandTotal = matches.reduce((sum,l) => sum + (l.duration||0), 0);

    const catMeta={productive:{emoji:'🟢',label:'Productive'},unproductive:{emoji:'🔴',label:'Unproductive'},sleep:{emoji:'🔵',label:'Sleep'},health:{emoji:'🩷',label:'Health'},coding:{emoji:'💻',label:'Coding'}};

    const totalDiv = document.getElementById('logfilter-total');
    totalDiv.textContent = matches.length ? `Total time: ${formatTimeDDHHMMSS(grandTotal)} across ${matches.length} log${matches.length===1?'':'s'}` : 'No matching logs.';

    const resultsDiv = document.getElementById('logfilter-results');
    if(!rows.length) { resultsDiv.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.8rem;">Nothing matches that search.</div>`; return; }
    resultsDiv.innerHTML = rows.map(r => {
        const cm = catMeta[r.type] || {emoji:'⚪',label:r.type||''};
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;">
            <div>
                <div style="font-size:0.82rem;font-weight:700;color:var(--text);">${escapeHTML(r.name)}</div>
                <div style="font-size:0.65rem;color:var(--text-dim);margin-top:2px;">${cm.emoji} ${cm.label} · ${r.count} log${r.count===1?'':'s'}</div>
            </div>
            <div style="font-family:var(--font-mono);font-size:0.85rem;font-weight:700;color:var(--accent);">${formatTimeDDHHMMSS(r.total)}</div>
        </div>`;
    }).join('');
};

// ── RETRO LOG (past activity) ──────────────────────────────────────────────
window.showRetroLogForm = function() {
    const f = document.getElementById('sw-retro-form');
    if(!f) return;
    // Set default date to today and a sensible start time
    const now = new Date();
    if(!document.getElementById('retro-date').value){
        document.getElementById('retro-date').value = now.toISOString().split('T')[0];
    }
    if(!document.getElementById('retro-start').value){
        const hh = String(now.getHours()).padStart(2,'0');
        const mm = String(now.getMinutes()).padStart(2,'0');
        document.getElementById('retro-start').value = `${hh}:${mm}`;
    }
    f.style.display = f.style.display === 'none' || !f.style.display ? 'block' : 'none';
    window.toggleRetroSubjectFields();
    // close the normal form if open
    const nf = document.getElementById('sw-log-form');
    if(nf) nf.style.display = 'none';
};
window.toggleRetroSubjectFields = function() {
    const cat = (document.getElementById('retro-cat')||{}).value;
    const wrap = document.getElementById('retro-subject-wrap');
    if(wrap) wrap.style.display = cat === 'productive' ? 'grid' : 'none';
};
window.doRetroLog = function() {
    const desc = (document.getElementById('retro-desc').value||'').trim() || 'Activity';
    const cat  = document.getElementById('retro-cat').value || 'productive';
    const subject   = (document.getElementById('retro-subject')||{}).value || '';
    const studyType = (document.getElementById('retro-type')||{}).value || '';
    const dateVal   = document.getElementById('retro-date').value;
    const startVal  = document.getElementById('retro-start').value;
    const durMins   = parseInt(document.getElementById('retro-duration').value) || 0;
    if(!dateVal || !startVal || durMins <= 0) { alert('Please fill in date, start time, and duration.'); return; }
    // Build timestamp from date + start time
    const [yr,mo,dy] = dateVal.split('-').map(Number);
    const [hh,mm]    = startVal.split(':').map(Number);
    const startStamp = new Date(yr, mo-1, dy, hh, mm, 0).getTime();
    const duration   = durMins * 60 * 1000;
    if(!state.sw) state.sw = {elapsed:0, running:false, lastStart:0, marker:0, logs:[]};
    if(!state.sw.logs) state.sw.logs = [];
    const logEntry = {desc, type:cat, duration, stamp:startStamp, retro:true};
    if(cat === 'productive') {
        if(subject) logEntry.subject = subject;
        if(studyType) logEntry.studyType = studyType;
    }
    // Insert in chronological order
    state.sw.logs.push(logEntry);
    state.sw.logs.sort((a,b) => b.stamp - a.stamp);
    // Reset form
    document.getElementById('retro-desc').value = '';
    document.getElementById('retro-cat').value = 'productive';
    document.getElementById('retro-duration').value = '';
    if(document.getElementById('retro-subject')) document.getElementById('retro-subject').value = '';
    if(document.getElementById('retro-type')) document.getElementById('retro-type').value = '';
    document.getElementById('sw-retro-form').style.display = 'none';
    renderLogs(); triggerSave(); window.updateHomeStats();
    // Toast
    const t=document.createElement('div');
    t.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(251,191,36,0.92);color:#000;padding:10px 24px;border-radius:99px;font-weight:700;font-size:0.82rem;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.25);letter-spacing:0.06em;';
    t.textContent='⏳ Past activity logged!';
    document.body.appendChild(t);
    setTimeout(()=>t.remove(),2500);
};

// ============================================================
// DOUBTS
// ============================================================
let currentDoubtFilter='all';
window.addDoubt=function(){
    const text=document.getElementById('doubt-input').value.trim();
    const subject=document.getElementById('doubt-subject').value;
    let date=document.getElementById('doubt-date').value;
    const resolution=document.getElementById('doubt-resolution-input').value.trim();
    if(!text)return;
    if(!date)date=getLocalIsoDate(new Date());
    if(!state.doubts)state.doubts=[];
    state.doubts.push({id:Date.now(),text,subject,date,cleared:false,resolution});
    document.getElementById('doubt-input').value='';
    document.getElementById('doubt-resolution-input').value='';
    triggerSave();window.renderDoubts();
};
window.toggleDoubt=function(id){const d=state.doubts.find(x=>x.id===id);if(d){d.cleared=!d.cleared;triggerSave();window.renderDoubts();}};
window.deleteDoubt=function(id){if(confirm("Erase this doubt?")){state.doubts=state.doubts.filter(x=>x.id!==id);triggerSave();window.renderDoubts();}};
window.updateDoubtResolution=function(id,val){const d=state.doubts.find(x=>x.id===id);if(d){d.resolution=val;triggerSave();}};
window.filterDoubts=function(filter,btn){currentDoubtFilter=filter;document.querySelectorAll('#doubts .lb-filter-btn').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');window.renderDoubts();};
window.renderDoubts=function(){
    const list=document.getElementById('doubt-list');if(!list)return;
    let filtered=[...(state.doubts||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
    if(currentDoubtFilter==='pending')filtered=filtered.filter(d=>!d.cleared);
    if(currentDoubtFilter==='cleared')filtered=filtered.filter(d=>d.cleared);
    if(!filtered.length){list.innerHTML=`<div style="text-align:center;color:var(--text-dim);padding:24px;font-weight:600;">No doubts on record.</div>`;return;}
    list.innerHTML=filtered.map(d=>`<div class="doubt-item${d.cleared?' cleared':''}">
        <div style="display:flex;align-items:flex-start;gap:14px;">
            <div class="check" onclick="window.toggleDoubt(${d.id})" style="cursor:pointer;margin-top:2px;flex-shrink:0;">${d.cleared?'<i class="ph ph-check"></i>':''}</div>
            <div style="flex:1;">
                <div style="font-weight:600;margin-bottom:4px;">${escapeHTML(d.text||'')}</div>
                <div style="display:flex;gap:9px;font-size:0.68rem;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">
                    <span style="color:#818cf8;">${escapeHTML(d.subject||'')}</span><span>·</span><span>${escapeHTML(String(d.date||''))}</span>
                </div>
                ${d.resolution?`<div class="doubt-resolution"><i class="ph ph-check-circle"></i> ${escapeHTML(d.resolution)}</div>`:`<input type="text" placeholder="Add resolution..." style="margin-top:8px;font-size:0.8rem;padding:8px 12px;" onblur="window.updateDoubtResolution(${d.id},this.value)">`}
            </div>
            <button style="padding:9px;border-radius:10px;border:none;cursor:pointer;background:rgba(255,75,112,0.15);color:var(--danger);font-size:1rem;flex-shrink:0;" onclick="window.deleteDoubt(${d.id})"><i class="ph ph-trash"></i></button>
        </div>
    </div>`).join('');
};
// ============================================================
// DOUBT LAB hero (search + quick context banner for the Doubts tab)
// ============================================================
window.v8MountDoubtHero = function() {
    const host = document.getElementById('doubts');
    if (!host || document.getElementById('v8-doubt-tools')) return;
    const header = host.querySelector('.section-header');
    if (header) header.textContent = '🧠 Doubt Lab';
    const hero = document.createElement('div');
    hero.id = 'v8-doubt-tools';
    hero.className = 'v8-section-hero';
    hero.innerHTML = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <i class="ph ph-brain" style="font-size:1.7rem;color:var(--accent)"></i>
        <div style="flex:1;min-width:180px">
            <b>Doubt command board</b>
            <div style="font-size:.67rem;color:var(--text-dim);margin-top:3px">Find unresolved concepts fast and turn them into focused review.</div>
        </div>
        <input id="v8-doubt-search" class="v8-search" placeholder="Search doubts…" style="max-width:280px">
    </div>`;
    host.insertBefore(hero, host.children[1] || null);
    document.getElementById('v8-doubt-search').addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        document.querySelectorAll('#doubts .doubt-item').forEach(item => {
            item.style.display = !q || item.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
};
// ============================================================
// FOCUS TIMER
// ============================================================
function resetFocusUI(){
    const m = state.focus.mode;
    let mins = m === 'work' ? state.focus.workM : m === 'longbreak' ? (state.focus.longBreakM||15) : state.focus.breakM;
    state.focus.time = mins * 60;
    const ft=document.getElementById('focus-timer');if(ft)ft.textContent=formatMins(Math.max(0,state.focus.time));
    // sync circular display too
    _updateCircularDisplay();
    if(state.focus.running)state.focus.endTime=Date.now()+(state.focus.time*1000);else delete state.focus.endTime;
}

// ─── CIRCULAR FOCUS MODE ───
window._focusDisplayMode = localStorage.getItem('focusDisplayMode') || 'normal';
window.setFocusDisplayMode = function(mode) {
    window._focusDisplayMode = mode;
    localStorage.setItem('focusDisplayMode', mode);
    const focusEl = document.getElementById('focus');
    const normalBtn = document.getElementById('fsp-normal-btn');
    const circularBtn = document.getElementById('fsp-circular-btn');
    if (mode === 'circular') {
        focusEl.classList.add('focus-circular-active');
        if(normalBtn) normalBtn.classList.remove('active');
        if(circularBtn) circularBtn.classList.add('active');
    } else {
        focusEl.classList.remove('focus-circular-active');
        if(normalBtn) normalBtn.classList.add('active');
        if(circularBtn) circularBtn.classList.remove('active');
    }
    _updateCircularDisplay();
};
function _updateCircularDisplay() {
    const cfDisp = document.getElementById('cf-timer-display');
    const cfModeLbl = document.getElementById('cf-mode-lbl');
    const ring = document.getElementById('cf-progress-ring');
    const ft = document.getElementById('focus-timer');
    if (!cfDisp || !ring) return;
    // mirror time
    const timeStr = ft ? ft.textContent : '25:00';
    cfDisp.textContent = timeStr;
    // mirror mode label
    if (cfModeLbl && document.getElementById('f-mode')) {
        cfModeLbl.textContent = document.getElementById('f-mode').textContent.split('—')[0].trim();
    }
    // arc progress
    const m = state.focus ? state.focus.mode : 'work';
    const totalSecs = (() => {
        if (!state.focus) return 25*60;
        const s = m === 'work' ? state.focus.workM : m === 'longbreak' ? (state.focus.longBreakM||15) : state.focus.breakM;
        return (s||25)*60;
    })();
    const remaining = state.focus ? state.focus.time : totalSecs;
    const circum = 2 * Math.PI * 112; // r=112 (new 260px wrap)
    const pct = totalSecs > 0 ? remaining / totalSecs : 1;
    ring.style.strokeDasharray = circum;
    ring.style.strokeDashoffset = circum * (1 - pct);
    // colour by mode
    const modeColors = { work:'url(#cfGrad)', break:'#38bdf8', longbreak:'#a78bfa' };
    ring.style.stroke = modeColors[m] || 'url(#cfGrad)';
}
// hook into the existing timer tick — patch after page load
(function() {
    const _origUpdate = window.updateFocusUI || null;
    const _patch = function() {
        if(typeof _origUpdate === 'function') _origUpdate.call(this);
        _updateCircularDisplay();
    };
    // We override by wrapping with a setter on updateFocusUI after it's defined
    // Instead, just call _updateCircularDisplay in the tick interval below
})();
// ═══ Focus live date/day/month/clock strip ═══
(function(){
    const dayEl = () => document.getElementById('focus-live-day');
    const dateEl = () => document.getElementById('focus-live-date');
    const monthEl = () => document.getElementById('focus-live-month');
    const clockEl = () => document.getElementById('focus-live-clock');
    const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function _tick(){
        const now=new Date();
        if(dayEl()) dayEl().textContent = DAYS[now.getDay()];
        if(dateEl()) dateEl().textContent = String(now.getDate()).padStart(2,'0');
        if(monthEl()) monthEl().textContent = MONTHS[now.getMonth()];
        if(clockEl()) clockEl().textContent = now.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
    _tick();
    setInterval(_tick,1000);
})();
// Apply saved mode on page load
document.addEventListener('DOMContentLoaded', function() {
    if (window._focusDisplayMode === 'circular') {
        window.setFocusDisplayMode('circular');
    } else {
        const normalBtn = document.getElementById('fsp-normal-btn');
        if(normalBtn) normalBtn.classList.add('active');
    }
});
// Patch _updateCircularDisplay into the tick — find the main setInterval
// We monkeypatch formatMins display so cf stays in sync:
const _cfOrigReset = resetFocusUI;

function fmtMinsHDM(m){
    const d=Math.floor(m/1440),h=Math.floor((m%1440)/60),mm=Math.floor(m%60);
    if(d>0)return `<span style="font-size:1.8rem;font-weight:800;">${d}</span><span style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">d</span> <span style="font-size:1.8rem;font-weight:800;">${h}</span><span style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">h</span> <span style="font-size:1.8rem;font-weight:800;">${mm}</span><span style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">m</span>`;
    if(h>0)return `<span style="font-size:1.8rem;font-weight:800;">${h}</span><span style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">h</span> <span style="font-size:1.8rem;font-weight:800;">${mm}</span><span style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">m</span>`;
    return `<span style="font-size:1.8rem;font-weight:800;">${mm}</span><span style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">m</span>`;
}
function updateFocusStatsGrid(){
    if(!state.focus.logs)state.focus.logs=[];
    const now=new Date();let today=0,yest=0,week=0,month=0,year=0;
    const tStart=new Date(now).setHours(0,0,0,0);
    const yStart=new Date(now);yStart.setDate(now.getDate()-1);yStart.setHours(0,0,0,0);
    const yEnd=new Date(now);yEnd.setDate(now.getDate()-1);yEnd.setHours(23,59,59,999);
    const wStart=new Date(now);wStart.setDate(now.getDate()-now.getDay());wStart.setHours(0,0,0,0);
    const mStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
    const yrStart=new Date(now.getFullYear(),0,1).getTime();
    state.focus.logs.forEach(l=>{
        if(l.stamp>=tStart)today+=l.duration;
        if(l.stamp>=yStart&&l.stamp<=yEnd)yest+=l.duration;
        if(l.stamp>=wStart)week+=l.duration;
        if(l.stamp>=mStart)month+=l.duration;
        if(l.stamp>=yrStart)year+=l.duration;
    });
    const setH=(id,v)=>{const el=document.getElementById(id);if(el)el.innerHTML=fmtMinsHDM(v);};
    setH('f-stat-today',today);setH('f-stat-yesterday',yest);setH('f-stat-week',week);
    setH('f-stat-month',month);setH('f-stat-year',year);
    const fl=document.getElementById('f-stat-life');if(fl)fl.innerHTML=fmtMinsHDM(state.focus.total||0);
}
function _focusSelectedTaskTitle() {
    const title = (state.focus.activeTaskTitle || '').trim();
    return (!title || title === 'General Focus') ? '' : title;
}
function _focusChapterLabel(chapterKey) {
    const value = String(chapterKey || '');
    if(!value) return '';
    const sep = value.indexOf('::');
    if(sep === -1) return value;
    const sub = value.slice(0, sep);
    const chapName = value.slice(sep + 2);
    const subInfo = window.ch_SUBJECTS && window.ch_SUBJECTS[sub];
    const subLabel = (subInfo && subInfo.label) || sub;
    return chapName ? `${subLabel}: ${chapName}` : subLabel;
}
function _focusDisplayTitle() {
    const task = _focusSelectedTaskTitle();
    const chapter = _focusChapterLabel(state.focus.activeChapter);
    if(task && chapter) return `${task} • ${chapter}`;
    if(task) return task;
    if(chapter) return `Chapter: ${chapter}`;
    return '';
}
function _focusLogTitle() {
    const task = _focusSelectedTaskTitle();
    if(task) return task;
    const chapter = _focusChapterLabel(state.focus.activeChapter);
    return chapter ? `Chapter: ${chapter}` : 'General Focus';
}
function _focusTargetSnapshot() {
    const chapter = state.focus.activeChapter || '';
    return {
        taskId: state.focus.activeTaskId || '',
        taskTitle: _focusLogTitle(),
        chapter,
        chapterLabel: _focusChapterLabel(chapter)
    };
}
function _focusCheckDailyTarget() {
    if(state.focus.todayMins >= state.focus.dailyTarget && !state.focus.targetMetToday) {
        state.focus.targetMetToday = true;
        state.focus.staminaPoints = Math.min(60, (state.focus.staminaPoints || 30) + 2);
        const today2 = getLocalIsoDate(new Date());
        if(state.focus.lastStreakDate !== today2) {
            state.focus.lastStreakDate = today2;
            state.focus.dayStreak = (state.focus.dayStreak || 0) + 1;
        }
        const nowM = new Date();
        const mk = `${nowM.getFullYear()}-${String(nowM.getMonth()+1).padStart(2,'0')}`;
        if(!state.focus.staminaLog) state.focus.staminaLog = {};
        state.focus.staminaLog[mk] = state.focus.staminaPoints;
    }
}
// Single-session logging: a continuous sitting on the SAME task/chapter must
// stay ONE calendar entry, even though we checkpoint it many times (every 20s
// heartbeat, every tab-hide/refresh, every pause/resume). We only ever start a
// genuinely NEW log line when the target (task/chapter) changes, or the
// session itself is reset/ended (see _focusToggle / _focusAbort / full-cycle
// completion, which manage state.focus.sessionId).
function _focusCreditFocusMinutes(minutes, target, reason) {
    const duration = Math.round((parseFloat(minutes) || 0) * 100) / 100;
    if(duration <= 0) return false;
    if(!state.focus.logs) state.focus.logs = [];
    state.focus.total = (parseFloat(state.focus.total) || 0) + duration;
    state.focus.todayMins = (parseFloat(state.focus.todayMins) || 0) + duration;
    const key = (state.focus.sessionId||'') + '|' + (target.taskId||'') + '|' + (target.chapter||'') + '|' + (target.taskTitle||'');
    const existing = state.focus._openLogId ? state.focus.logs.find(l => l._logId === state.focus._openLogId) : null;
    if(existing && state.focus._openLogKey === key) {
        existing.duration = Math.round((existing.duration + duration) * 100) / 100;
        existing.stamp = Date.now();
        if(reason) existing.reason = reason;
    } else {
        const logId = 'l_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
        const log = {
            stamp: Date.now(),
            duration,
            taskId: target.taskId || '',
            taskTitle: target.taskTitle || 'General Focus',
            chapter: target.chapter || '',
            date: getLocalIsoDate(),
            _logId: logId
        };
        if(target.chapterLabel) log.chapterTitle = target.chapterLabel;
        if(reason) log.reason = reason;
        state.focus.logs.push(log);
        state.focus._openLogId = logId;
        state.focus._openLogKey = key;
    }
    if(target.taskId) syncSubTimeToDatabase(target.taskId, target.chapter || '', duration);
    _focusCheckDailyTarget();
    return true;
}
function _focusStartSegment() {
    if(state.focus && state.focus.running && state.focus.mode === 'work') {
        state.focus.segmentStartedAt = Date.now();
        _focusItemSegmentsStart(); // also start per-item timers
    }
    else if(state.focus) {
        delete state.focus.segmentStartedAt;
        _focusItemSegmentsPause(); // pause per-item timers during break
    }
}
function _focusFinalizeActiveSegment(reason) {
    if(!state.focus || !state.focus.running || state.focus.mode !== 'work') {
        if(state.focus) delete state.focus.segmentStartedAt;
        return 0;
    }
    const start = state.focus.segmentStartedAt || (state.focus.endTime ? state.focus.endTime - ((state.focus.workM || 0) * 60000) : Date.now());
    let minutes = Math.round(((Date.now() - start) / 60000) * 100) / 100;
    // Safety clamp: a single uninterrupted work segment can never legitimately
    // exceed its configured length (+ a short grace period for normal timer
    // drift). Without this, a tab left open/suspended for hours (laptop sleep,
    // backgrounded browser, etc.) would credit that whole real-world gap as
    // "focus time" the moment the tab woke back up — e.g. a 25-min session
    // showing up as 12+ hours of focus on the linked task/chapter and in the
    // daily total.
    const capMinutes = (Number(state.focus.workM) || 25) + 2;
    if(minutes > capMinutes) minutes = capMinutes;
    if(minutes >= 0.01) _focusCreditFocusMinutes(minutes, _focusTargetSnapshot(), reason || 'segment');
    state.focus.segmentStartedAt = Date.now();
    return minutes;
}
function _renderFtpCurrentTarget() {
    const el = document.getElementById('ftp-current-target');
    if(!el || !state.focus) return;
    const task = _focusSelectedTaskTitle();
    const chapter = _focusChapterLabel(state.focus.activeChapter);
    if(!task && !chapter) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }
    el.style.display = 'block';
    el.innerHTML = `
        <div style="font-size:0.62rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.45);margin-bottom:6px;">Current Focus</div>
        <div style="display:flex;flex-direction:column;gap:4px;font-size:0.78rem;color:#fff;">
            <div><strong>Task:</strong> ${escapeHTML(task || 'No task selected')}</div>
            <div><strong>Chapter:</strong> ${escapeHTML(chapter || 'No chapter linked')}</div>
        </div>`;
}
function _focusRefreshCurrentTarget() {
    _setFocusTaskBadge(_focusDisplayTitle());
    _renderFtpCurrentTarget();
    updateChapterFocusDisplay();
}
function _focusApplyTarget(changes) {
    const wasRunningWork = state.focus.running && state.focus.mode === 'work';
    if(wasRunningWork) _focusFinalizeActiveSegment('target-switch');
    if(Object.prototype.hasOwnProperty.call(changes, 'taskTitle')) state.focus.activeTaskTitle = (changes.taskTitle || '').trim();
    if(Object.prototype.hasOwnProperty.call(changes, 'taskId')) state.focus.activeTaskId = changes.taskId || '';
    if(Object.prototype.hasOwnProperty.call(changes, 'chapter')) state.focus.activeChapter = changes.chapter || '';
    if(wasRunningWork) _focusStartSegment();
    // Update task badge text
    const tbt = document.getElementById('focus-task-badge-text');
    if(tbt) tbt.textContent = state.focus.activeTaskTitle || '—';
    _focusRefreshCurrentTarget();
    _focusItemBadgesTick();
    updateFocusUI();
    updateFocusStatsGrid();
    if(window.gg_renderDayTasks && currentGGDay) window.gg_renderDayTasks(currentGGDay);
    triggerSave();
}
document.getElementById('f-work-in').onchange=(e)=>{if(!state.focus.running){state.focus.workM=parseFloat(e.target.value)||25;resetFocusUI();}triggerSave();};
document.getElementById('f-break-in').onchange=(e)=>{if(!state.focus.running){state.focus.breakM=parseFloat(e.target.value)||5;resetFocusUI();}triggerSave();};
document.getElementById('f-reps-in').onchange=(e)=>{if(!state.focus.running){state.focus.reps=parseInt(e.target.value);}triggerSave();};
document.getElementById('f-target-in').onchange=(e)=>{
    const wasRunning = state.focus.running;
    if(!wasRunning){
        state.focus.dailyTarget=parseInt(e.target.value);
        if(state.focus.todayMins>=state.focus.dailyTarget&&!state.focus.targetMetToday){state.focus.targetMetToday=true;state.focus.staminaPoints=Math.min(60,(state.focus.staminaPoints||30)+2);alert("Daily Target Secured! +2 Stamina Points!");}
        updateFocusUI();triggerSave();
    }
};
function lockFocusInputs(lock) {
    ['f-work-in','f-break-in','f-reps-in','f-target-in','f-longbreak-in'].forEach(id=>{
        const el=document.getElementById(id); if(el){el.disabled=lock;}
    });
    // Visual feedback: dim settings button when locked
    const sb = document.getElementById('focus-settings-btn');
    if(sb) sb.style.opacity = lock ? '0.45' : '1';
    // Task/chapter can ONLY be changed via their pencil (focusChangeTask), never by
    // re-opening the picker directly, while a session is running.
    const whatBtn = document.getElementById('focus-what-btn');
    if(whatBtn) whatBtn.style.pointerEvents = lock ? 'none' : '';
    const chBtn = document.getElementById('focus-chapter-btn');
    if(chBtn) chBtn.style.pointerEvents = lock ? 'none' : '';
}
document.getElementById('f-toggle').onclick=()=>{ window._focusToggle(); };
window._focusToggle = function() {
    if("Notification" in window && Notification.permission!=="granted"&&Notification.permission!=="denied") Notification.requestPermission();
    const wasRunning = state.focus.running;
    if(!wasRunning){
        if(!state.focus.sessionId) state.focus.sessionId = 'fs_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
        state.focus.workM=parseFloat(document.getElementById('f-work-in').value)||25;
        state.focus.breakM=parseFloat(document.getElementById('f-break-in').value)||5;
        state.focus.longBreakM=parseFloat(document.getElementById('f-longbreak-in').value)||15;
        state.focus.reps=parseInt(document.getElementById('f-reps-in').value)||4;
        state.focus.dailyTarget=parseInt(document.getElementById('f-target-in').value)||60;
        lockFocusInputs(true);
        _focusRefreshCurrentTarget();
        // Update task from new UI
        const badge = { textContent: state.focus.activeTaskTitle || 'General Focus' };
        state.focus.activeTaskTitle = (badge && badge.textContent && badge.textContent !== '—') ? badge.textContent : 'General Focus';
        // Focus bg into work mode
        _setFocusBgMode(state.focus.mode || 'work');
        // Pattern cycle
        if(state.focus.customPattern && state.focus.customPattern.length > 0) {
            state.focus._patternIdx = 0;
            _applyPatternStep(state.focus._patternIdx);
        }
    } else {
        _focusFinalizeActiveSegment('pause');
        _focusItemSegmentsPause(); // pause per-item timers
        _setFocusBgMode('idle');
    }
    state.focus.running=!wasRunning;
    const ambient=document.getElementById('audio-ambient');
    if(state.focus.running){
        state.focus.endTime=Date.now()+(state.focus.time*1000);
        if(state.focus.mode==='work'){
            _focusStartSegment();
            _focusItemSegmentsStart(); // start per-item timers
            ambient.play().catch(()=>{});
        }
    }
    else{delete state.focus.endTime;delete state.focus.segmentStartedAt;ambient.pause();}
    _updateFocusToggleBtn();
    _updateFocusRepDots();
    updateFocusStatsGrid();
    _focusItemBadgesTick();
    triggerSave();
};
window._focusAbort = function() {
    _focusFinalizeActiveSegment('reset');
    _focusItemSegmentsFlush('abort'); // credit remaining per-item time then reset
    state.focus.running=false; delete state.focus.endTime;
    delete state.focus.segmentStartedAt;
    delete state.focus.sessionId; delete state.focus._openLogId; delete state.focus._openLogKey;
    state.focus.currentRep=1; state.focus.mode='work';
    state.focus._patternIdx=0;
    lockFocusInputs(false);
    _setFocusBgMode('idle');
    document.getElementById('audio-ambient').pause();
    _updateFocusToggleBtn();
    _updateFocusRepDots();
    resetFocusUI();updateFocusUI();updateFocusStatsGrid();
    _focusItemBadgesTick();
    triggerSave();
};
document.getElementById('f-abort').onclick=()=>{ window._focusAbort(); };

function _updateFocusToggleBtn() {
    const btn = document.getElementById('f-toggle');
    if(!btn) return;
    if(state.focus.running) {
        btn.innerHTML = "<i class='ph ph-pause'></i> Pause";
        btn.classList.add('running');
    } else {
        btn.innerHTML = "<i class='ph ph-play'></i> Start";
        btn.classList.remove('running');
    }
}

function _setFocusBgMode(mode) {
    const bg = document.getElementById('focus-bg');
    if(!bg) return;
    bg.className = 'focus-bg';
    if(mode === 'break') bg.classList.add('mode-break');
    else if(mode === 'longbreak') bg.classList.add('mode-longbreak');
}

function _updateFocusRepDots() {
    const dots = document.getElementById('focus-rep-dots');
    if(!dots) return;
    const reps = state.focus.reps || 4;
    const cur  = state.focus.currentRep || 1;
    let html = '';
    for(let i=1; i<=reps; i++) {
        if(i > 1) html += '<div class="frd-sep"></div>';
        let cls = i < cur ? 'done' : i === cur ? 'current' : '';
        html += `<div class="frd-dot ${cls}"></div>`;
    }
    dots.innerHTML = html;
}

function updateFocusUI(){
    const fm=document.getElementById('f-mode');
    if(fm){
        const modeLabel = state.focus.mode==='work' ? 'FOCUS' : state.focus.mode==='longbreak' ? 'LONG BREAK' : 'SHORT BREAK';
        fm.textContent=`${modeLabel} — REP ${state.focus.currentRep}/${state.focus.reps}`;
        fm.style.color='rgba(255,255,255,0.45)';
    }
    const fds=document.getElementById('f-day-streak-val');if(fds)fds.textContent=state.focus.staminaPoints||0;
    const fdsd=document.getElementById('f-day-streak-display');if(fdsd)fdsd.textContent=state.focus.dayStreak||0;
    const ftm=document.getElementById('f-today-mins');if(ftm)ftm.textContent=Math.floor(state.focus.todayMins||0);
    const ftmc=document.getElementById('f-today-mins-center');if(ftmc)ftmc.textContent=Math.floor(state.focus.todayMins||0);
    const ftd=document.getElementById('f-target-display');if(ftd)ftd.textContent=state.focus.dailyTarget||60;
    const st=document.getElementById('f-target-status');
    if(st){if(state.focus.targetMetToday){st.textContent="TARGET SECURED!";st.style.color="var(--success)";}else{st.textContent="TARGET PENDING";st.style.color="var(--danger)";}}
    // Update mode tab active state from state
    if(state.focus.mode) {
        document.querySelectorAll('.fmt-tab').forEach(t=>t.classList.remove('active'));
        const modeToTab = {work:'fmt-focus', break:'fmt-short', longbreak:'fmt-long'};
        const activeTab = document.getElementById(modeToTab[state.focus.mode]);
        if(activeTab) activeTab.classList.add('active');
    }
    _updateFocusRepDots();
    _updateFocusToggleBtn();
    // Sync BG mode
    if(state.focus.running) _setFocusBgMode(state.focus.mode);
}
function updateNexusTaskSelector(){
    const selector=document.getElementById('f-nexus-task-select');if(!selector)return;
    const today=getLocalIsoDate();const tasks=(gg_db[today]||[]).filter(t => !t._carryFrozen);
    let html=`<option value="">-- No Task Linked --</option>`;
    tasks.forEach((t,index)=>{const id=`task_${today}_${index}`;html+=`<option value="${id}" data-title="${escapeHTML(t.name)}">${escapeHTML(t.name)} (${t.status===1?'DONE':'ACTIVE'})</option>`;});
    const prevVal=selector.value;
    selector.innerHTML=html;
    // Restore previously selected value if still running
    if(state.focus.activeTaskId && state.focus.running){
        // Try to match by id first, then by title
        let matched=false;
        for(let i=0;i<selector.options.length;i++){
            if(selector.options[i].value===state.focus.activeTaskId){
                selector.value=state.focus.activeTaskId;matched=true;break;
            }
        }
        if(!matched && state.focus.activeTaskTitle){
            for(let i=0;i<selector.options.length;i++){
                const t=selector.options[i].getAttribute('data-title')||selector.options[i].text;
                if(t===state.focus.activeTaskTitle){selector.value=selector.options[i].value;matched=true;break;}
            }
        }
        if(matched){
            selector.disabled=true;
            document.getElementById('nexus-linker-container').classList.add('active');
        }
    } else if(prevVal){
        selector.value=prevVal;
    }
    // Show pinned task display if focus is running
    _updateNexusPinnedDisplay();
}

function _updateNexusPinnedDisplay(){
    let pin=document.getElementById('nexus-pinned-display');
    const container=document.getElementById('nexus-linker-container');if(!container)return;
    if(state.focus.running && state.focus.activeTaskTitle && state.focus.activeTaskTitle!=='General Focus'){
        if(!pin){
            pin=document.createElement('div');
            pin.id='nexus-pinned-display';
            pin.style.cssText='margin-top:10px;padding:8px 14px;border-radius:10px;background:rgba(79,110,247,0.15);border:1px solid rgba(79,110,247,0.4);font-size:0.8rem;font-weight:700;color:var(--accent);display:flex;align-items:center;gap:8px;';
            pin.innerHTML=`<i class="ph ph-push-pin"></i> <span id="nexus-pin-text"></span>`;
            container.appendChild(pin);
        }
        const pinText=document.getElementById('nexus-pin-text');
        if(pinText) pinText.textContent=`Pinned: ${state.focus.activeTaskTitle}`;
        pin.style.display='flex';
    } else {
        if(pin) pin.style.display='none';
    }
}

// ============================================================
// EVENTS
// ============================================================
document.getElementById('ev-add').onclick=()=>{
    const name=document.getElementById('ev-input-name').value;
    const date=document.getElementById('ev-input-date').value;
    if(!name||!date)return;
    state.events.push({id:Date.now(),name,target:new Date(date).getTime()});
    document.getElementById('ev-input-name').value='';triggerSave();
};
window.delEvent=(id)=>{state.events=state.events.filter(e=>e.id!==id);triggerSave();};
let lastEventsHtml="";
function updateEvents(now){
    if(!state.events)state.events=[];
    const future=state.events.filter(e=>e.target>now).sort((a,b)=>a.target-b.target);
    const body=document.getElementById('ev-list-body');
    let topName="No Scheduled Launches",topTime="00d 00:00:00",newHtml="";
    if(future.length>0){
        topName=future[0].name;topTime=formatWithDays(future[0].target-now);
        newHtml=future.map(e=>`<tr><td style="font-weight:600;">${e.name}</td><td style="font-family:var(--font-mono);">${formatWithDays(e.target-now)}</td><td style="text-align:right"><button style="padding:5px 11px;border-radius:8px;cursor:pointer;background:rgba(255,75,112,0.15);border:1px solid rgba(255,75,112,0.3);color:var(--danger);" onclick="window.delEvent(${e.id})"><i class="ph ph-trash"></i></button></td></tr>`).join('');
    }
    const tn=document.getElementById('ev-top-name');const tt=document.getElementById('ev-top-time');
    if(tn)tn.textContent=topName;if(tt)tt.textContent=topTime;
    if(newHtml!==lastEventsHtml&&body){body.innerHTML=newHtml;lastEventsHtml=newHtml;}
}

// ============================================================
// LEADERBOARD
// ============================================================
let globalLbData=[],currentLbSort='focus';
function parseTimeForLB(ts){if(!ts)return 0;if(typeof ts==='number')return ts;const s=String(ts),days=s.match(/(\d+)d/),hours=s.match(/(\d+)h/),mins=s.match(/(\d+)m/);let t=0;if(days)t+=parseInt(days[1])*1440;if(hours)t+=parseInt(hours[1])*60;if(mins)t+=parseInt(mins[1]);if(!days&&!hours&&!mins)return parseInt(s)||0;return t;}
window.fetchLeaderboard=async function(){
    const c=document.getElementById('lb-container');
    c.innerHTML=`<div style="text-align:center;color:var(--accent);"><i class="ph ph-spinner ph-spin" style="font-size:2rem;"></i></div>`;
    const db=window._fbDb, uid=window._fbUid;
    if(db && uid && uid!=='guest') {
        try {
            const { doc, setDoc, collection, getDocs } = window._fbFns;
            const sw=getSwStats();
            const safeAva = userContext?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userContext?.username||'op')}&backgroundColor=transparent`;
            // Only push to leaderboard if user opted in
            if(!state?.settings?.leaderboardPrivate) {
                await setDoc(doc(db,'leaderboard2',uid),{
                    username:userContext?.username||'Operative', avatarUrl:safeAva,
                    email: userContext?.email || '',
                    streak:state?.focus?.dayStreak||0,
                    stamina:state?.focus?.staminaPoints||0,
                    totalMins:state?.focus?.total||0,
                    prodMins:formatTimeDDHHMMSS(sw.prodMins*60000), unprodMins:formatTimeDDHHMMSS(sw.unprodMins*60000),
                    exam: window._obIdentity?.examLabel || 'JEE',
                    updatedAt: Date.now()
                },{merge:true});
            }
            const snap = await getDocs(collection(db,'leaderboard2'));
            globalLbData = [];
            const cutoff = Date.now() - (30*24*60*60*1000);
            snap.forEach(d => {
                const rec = d.data();
                rec._uid = d.id;
                // Hide operatives who haven't touched the app in 30+ days. Records
                // from before this field existed have no updatedAt — treat those
                // as active rather than mass-hiding everyone on rollout day.
                if(rec.updatedAt && rec.updatedAt < cutoff) return;
                // Admin-hidden accounts never show up on the public leaderboard.
                if(rec.hidden) return;
                globalLbData.push(rec);
            });
            if(!globalLbData.length) throw new Error('empty');
        } catch(e) {
            const sw=getSwStats();
            globalLbData=[{username:userContext?.username||"GUEST",avatarUrl:userContext?.avatarUrl||"",streak:state?.focus?.dayStreak||0,stamina:state?.focus?.staminaPoints||0,totalMins:state?.focus?.total||0,prodMins:formatTimeDDHHMMSS(sw.prodMins*60000),unprodMins:formatTimeDDHHMMSS(sw.unprodMins*60000)}];
        }
    } else {
        const sw=getSwStats();
        globalLbData=[{username:userContext?.username||"GUEST",avatarUrl:userContext?.avatarUrl||"",streak:state?.focus?.dayStreak||0,stamina:state?.focus?.staminaPoints||0,totalMins:state?.focus?.total||0,prodMins:formatTimeDDHHMMSS(sw.prodMins*60000),unprodMins:formatTimeDDHHMMSS(sw.unprodMins*60000)}];
    }
    window.renderLeaderboard(currentLbSort);
};
window.sortLeaderboard=function(cat,btn){currentLbSort=cat;if(btn){document.querySelectorAll('#leaderboard .lb-filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}window.renderLeaderboard(cat);};
window.renderLeaderboard=function(sortBy){
    const c=document.getElementById('lb-container');if(!globalLbData||!globalLbData.length){c.innerHTML=`<div style="text-align:center;color:var(--text-dim);">No operatives found.</div>`;return;}
    let sorted=[...globalLbData];
    sorted.sort((a,b)=>{
        if(sortBy==='streak') return (parseInt(b.streak)||0)-(parseInt(a.streak)||0);
        if(sortBy==='stamina') return (parseInt(b.stamina)||parseInt(b.streak)||0)-(parseInt(a.stamina)||parseInt(a.streak)||0);
        if(sortBy==='focus') return parseTimeForLB(b.totalMins)-parseTimeForLB(a.totalMins);
        if(sortBy==='prod') return parseTimeForLB(b.prodMins)-parseTimeForLB(a.prodMins);
        if(sortBy==='unprod') return parseTimeForLB(b.unprodMins)-parseTimeForLB(a.unprodMins);
        return 0;
    });
    const medals=['🥇','🥈','🥉'];
    const topClass=['lb-top1','lb-top2','lb-top3'];
    c.innerHTML=sorted.map((u,i)=>{
        // [SECURITY FIX] u.username and u.avatarUrl come from OTHER users'
        // Firestore documents (leaderboard2/{uid}), set via a free-text
        // prompt() with no validation. Rendering them unescaped into
        // innerHTML let any signed-in user inject HTML/JS that would run
        // in every viewer's browser (including the admin account) just by
        // opening this tab. escapeHTML/escapeAttr already exist in this
        // file and are used correctly elsewhere (e.g. the admin panel) —
        // this just applies the same treatment here.
        const rawAva=u.avatarUrl||`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.username)}&backgroundColor=transparent`;
        const ava=escapeAttr(rawAva);
        const safeName=escapeHTML(u.username||'Operative');
        const oStr=sortBy==='streak'?'1':'0.45',oSta=sortBy==='stamina'?'1':'0.45',oFoc=sortBy==='focus'?'1':'0.45',oPro=sortBy==='prod'?'1':'0.45',oUnp=sortBy==='unprod'?'1':'0.45';
        const badgeClass=i===0?'gold':i===1?'silver':i===2?'bronze':'';
        const rank=i<3?`<div class="lb-rank"><span class="lb-rank-badge ${badgeClass}">${medals[i]}</span></div>`:`<div class="lb-rank"><span class="lb-rank-badge">#${i+1}</span></div>`;
        const staminaVal = u.stamina !== undefined ? u.stamina : (u.streak||0);
        const streakVal = u.streak || 0;
        const rowClass = i<3 ? topClass[i] : '';
        return`<div class="lb-row ${rowClass}" style="animation-delay:${Math.min(i*0.04,0.6)}s;"><div class="lb-info-group">${rank}<img src="${ava}" class="animated-pfp" style="width:44px;height:44px;" onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=op&backgroundColor=transparent';this.onerror=null;"><div class="lb-name">${safeName}</div></div><div class="lb-stats-group"><div class="lb-stats" style="opacity:${oStr};transition:0.3s;"><label>🔥 Streak</label><span style="color:var(--warn);">${streakVal}d</span></div><div class="lb-stats" style="opacity:${oSta};transition:0.3s;"><label>⚡ Stamina</label><span style="color:var(--accent);">${staminaVal}pt</span></div><div class="lb-stats" style="opacity:${oFoc};transition:0.3s;"><label>Focus</label><span>${Math.floor(u.totalMins)||0}m</span></div><div class="lb-stats" style="opacity:${oPro};transition:0.3s;"><label>Prod</label><span style="color:var(--prod);">${u.prodMins||"0m"}</span></div><div class="lb-stats" style="opacity:${oUnp};transition:0.3s;"><label>Unprod</label><span style="color:var(--unprod);">${u.unprodMins||"0m"}</span></div></div></div>`;
    }).join('');
};

// ============================================================
// ADMIN PANEL — visible only to window.ADMIN_EMAIL
// Moderation only: hide accounts from the public leaderboard, adjust the
// leaderboard-facing streak/stamina numbers, or remove a leaderboard entry.
// This never reads or edits a user's private appdata (diary, tasks, etc.) —
// it only touches their leaderboard2/{uid} document.
// ============================================================
let adminRosterCache = [];
window.renderAdminPanel = async function(forceRefresh){
    const box = document.getElementById('admin-container');
    if(!box) return;
    if(!window.isAdminUser || !window.isAdminUser()){
        box.innerHTML = `<div style="text-align:center;color:var(--text-dim);">Not authorized.</div>`;
        return;
    }
    const db = window._fbDb, fns = window._fbFns;
    if(!db || !fns){ box.innerHTML = `<div style="text-align:center;color:var(--text-dim);">Firebase not ready.</div>`; return; }
    if(forceRefresh || !adminRosterCache.length){
        box.innerHTML = `<div style="text-align:center;color:var(--text-dim);"><i class="ph ph-spinner ph-spin"></i> Loading roster...</div>`;
        try {
            const snap = await fns.getDocs(fns.collection(db,'leaderboard2'));
            const roster = [];
            snap.forEach(d => roster.push({ uid: d.id, ...d.data() }));
            roster.sort((a,b)=>(a.username||'').localeCompare(b.username||''));
            adminRosterCache = roster;
        } catch(e) {
            console.error('Admin roster load failed:', e);
            box.innerHTML = `<div style="text-align:center;color:var(--danger,#f87171);">Couldn't load roster: ${escapeHTML(e.message||String(e))}</div>`;
            return;
        }
    }
    const q = (document.getElementById('admin-search')?.value || '').trim().toLowerCase();
    const list = !q ? adminRosterCache : adminRosterCache.filter(u =>
        String(u.username||'').toLowerCase().includes(q) || String(u.email||'').toLowerCase().includes(q));
    if(!list.length){ box.innerHTML = `<div style="text-align:center;color:var(--text-dim);">No matching operatives.</div>`; return; }
    box.innerHTML = list.map(u => {
        // [SECURITY FIX] avatarUrl is attacker-controllable (see
        // renderLeaderboard above) and this admin view is exactly the
        // place a malicious avatarUrl was most dangerous — escapeAttr()
        // it before it goes into the src="" attribute.
        const ava = escapeAttr(u.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.username||'op')}&backgroundColor=transparent`);
        const isSelf = String(u.email||'').toLowerCase() === window.ADMIN_EMAIL;
        return `<div class="lb-row" style="flex-wrap:wrap;gap:10px;">
            <div class="lb-info-group" style="min-width:220px;">
                <img src="${ava}" class="animated-pfp" style="width:40px;height:40px;" onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=op&backgroundColor=transparent';this.onerror=null;">
                <div><div class="lb-name">${escapeHTML(u.username||'Operative')}${u.hidden?' <span style="font-size:0.62rem;color:var(--warn);">HIDDEN</span>':''}${isSelf?' <span style="font-size:0.62rem;color:var(--accent);">ADMIN</span>':''}</div>
                <div style="font-size:0.68rem;color:var(--text-dim);">${escapeHTML(u.email||'—')}</div></div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span style="font-size:0.7rem;color:var(--text-dim);">🔥</span>
                <input type="number" min="0" max="9999" value="${parseInt(u.streak)||0}" id="admin-streak-${escapeAttr(u.uid)}" style="width:64px;padding:6px 8px;font-size:0.75rem;margin-bottom:0;">
                <button class="btn" style="padding:6px 10px;font-size:0.68rem;" onclick="window.adminSetStreak('${escapeAttr(u.uid)}')">Set</button>
                <button class="btn" style="padding:6px 10px;font-size:0.68rem;" onclick="window.adminToggleHide('${escapeAttr(u.uid)}',${!u.hidden})">${u.hidden?'Unhide':'Hide from leaderboard'}</button>
                <button class="btn btn-danger" style="padding:6px 10px;font-size:0.68rem;" onclick="window.adminDeleteEntry('${escapeAttr(u.uid)}','${escapeAttr(u.username||'this operative')}')" ${isSelf?'disabled title="Can\'t remove your own admin account"':''}><i class="ph ph-trash"></i></button>
            </div>
        </div>`;
    }).join('');
};
window.adminSetStreak = async function(uid){
    if(!window.isAdminUser || !window.isAdminUser()) return;
    const input = document.getElementById('admin-streak-'+uid);
    const val = Math.max(0, parseInt(input?.value)||0);
    try {
        const db=window._fbDb, fns=window._fbFns;
        await fns.setDoc(fns.doc(db,'leaderboard2',uid), { streak: val }, {merge:true});
        const rec = adminRosterCache.find(u=>u.uid===uid); if(rec) rec.streak = val;
        alert(`Streak set to ${val}.`);
    } catch(e) { alert('Failed: '+(e.message||e)); }
};
window.adminToggleHide = async function(uid, hidden){
    if(!window.isAdminUser || !window.isAdminUser()) return;
    try {
        const db=window._fbDb, fns=window._fbFns;
        await fns.setDoc(fns.doc(db,'leaderboard2',uid), { hidden: !!hidden }, {merge:true});
        const rec = adminRosterCache.find(u=>u.uid===uid); if(rec) rec.hidden = !!hidden;
        window.renderAdminPanel();
    } catch(e) { alert('Failed: '+(e.message||e)); }
};
window.adminDeleteEntry = async function(uid, name){
    if(!window.isAdminUser || !window.isAdminUser()) return;
    if(!confirm(`Remove ${name} from the leaderboard roster?\n\nThis only deletes their public leaderboard entry — their own account, tasks and diary are untouched.`)) return;
    try {
        const db=window._fbDb, fns=window._fbFns;
        await fns.deleteDoc(fns.doc(db,'leaderboard2',uid));
        adminRosterCache = adminRosterCache.filter(u=>u.uid!==uid);
        window.renderAdminPanel();
    } catch(e) { alert('Failed: '+(e.message||e)); }
};

// ============================================================
// NEXUS CONTROL V2 (task system) — replaces the old Missions
// engine. Tasks now live in state.nexusV2 instead of gg_db.
// gg_db is kept (unused) only so older synced data isn't lost.
// ============================================================
(function NexusV3(){
  const DAY=86400000;
  const safe=v=>v==null?'':String(v);
  const iso=d=>getLocalIsoDate(d||new Date());
  const uid=()=>`nx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const esc=s=>typeof escapeHTML==='function'?escapeHTML(safe(s)):safe(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const save=()=>typeof triggerSave==='function'&&triggerSave();
  const fmtMin=m=>{m=Math.max(0,Math.round(Number(m)||0));const h=Math.floor(m/60),r=m%60;return h?`${h}h ${r?`${r}m`:''}`.trim():`${r}m`;};
  const dayLabel=d=>new Date(d+'T00:00:00').toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});
  const addDays=(s,n)=>{const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return iso(d)};
  const startOfWeek=d=>{d=new Date(d);d.setHours(0,0,0,0);const x=(d.getDay()+6)%7;d.setDate(d.getDate()-x);return d};
  function ensure(){
    if(!state.nexusV2||typeof state.nexusV2!=='object')state.nexusV2={};
    const n=state.nexusV2;
    if(!Array.isArray(n.tasks))n.tasks=[];
    if(!Array.isArray(n.projects))n.projects=[];
    if(!n._migratedV5 && Array.isArray(state.nexusV2?.tasks) && state.nexusV2.tasks.length){
      n.tasks=state.nexusV2.tasks.map(t=>JSON.parse(JSON.stringify(t)));
      n._migratedV5=true;
    }
    n.ui=n.ui||{view:'overview',selectedDate:iso(),weekOffset:0,project:'all',search:''};
    if(!['overview','tasks','projects'].includes(n.ui.view))n.ui.view='overview';
    return n;
  }
  function normalize(){
    const n=ensure();
    n.tasks.forEach((t,i)=>{
      t.id ||= uid(); t.title=safe(t.title||t.name||'Untitled task').trim()||'Untitled task';
      t.status=['todo','doing','done'].includes(t.status)?t.status:(t.status===1?'done':'todo');
      t.priority=['high','med','low'].includes(t.priority)?t.priority:'med';
      t.createdAt ||= Date.now(); t.order ||= i+1; t.focusSeconds=Number(t.focusSeconds)||0; t.estimateMins=Number(t.estimateMins)||0;
      t.subtasks=Array.isArray(t.subtasks)?t.subtasks:[];
      if(t.dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate))t.dueDate='';
      if(t.startTime&&!/^\d{2}:\d{2}$/.test(t.startTime))t.startTime='';
      t.durationMins=Number(t.durationMins)||t.estimateMins||0;
    });
    advanceCarries();
  }
  // ── 7-DAY CARRY-FORWARD ─────────────────────────────────────────────────
  // A task with a due date that goes unfinished, with zero Focus time logged
  // against it, rolls forward one day at a time (catching up on however many
  // days were missed) for up to 7 days. It stays the SAME task object the
  // whole way — only t.dueDate moves — so edits/completion always apply
  // everywhere it's shown. tasksForDate() re-shows it on its original day as
  // a linked "anchor" card even after the live copy has moved on. The moment
  // any Focus time is logged against it, or it's completed, it freezes and
  // never moves again. If it's still incomplete after 7 days it stops and is
  // flagged as a dangerous/at-risk task.
  function advanceCarries(){
    const n=ensure(); const today=iso(); let changed=false;
    n.tasks.forEach(t=>{
      if(!t.dueDate) return;
      if(t.status==='done') return;
      if(!t.carry) { t.carry={originalDate:t.dueDate, day:1, stopped:false, frozen:false}; changed=true; }
      if((Number(t.focusSeconds)||0) > 0 && !t.carry.frozen) { t.carry.frozen=true; changed=true; }
      if(t.carry.frozen || t.carry.stopped) return;
      while(t.dueDate < today && t.carry.day < 7) {
        t.dueDate = addDays(t.dueDate, 1);
        t.carry.day += 1;
        changed = true;
      }
      if(t.dueDate < today && t.carry.day >= 7 && !t.carry.stopped) {
        t.carry.stopped = true;
        changed = true;
      }
    });
    if(changed) save();
  }
  function migrateLegacy(){normalize();}
  function task(id){return ensure().tasks.find(t=>t.id===id)||null;}
  function isOverdue(t){return t.status!=='done'&&t.dueDate&&t.dueDate<iso()}
  function weekDays(offset=0){const s=startOfWeek(new Date());s.setDate(s.getDate()+offset*7);return Array.from({length:7},(_,i)=>{const d=new Date(s);d.setDate(s.getDate()+i);return iso(d)})}
  function tasksForDate(date){
    const n=ensure();
    const real = n.tasks.filter(t=>t.dueDate===date);
    // Anchor: a carried task still shows on the day it was ORIGINALLY due,
    // even though the live copy has moved to a later date.
    const anchors = n.tasks.filter(t=>t.carry && t.carry.day>1 && t.carry.originalDate===date && t.dueDate!==date);
    return [...real, ...anchors].sort((a,b)=>(a.startTime||'99:99').localeCompare(b.startTime||'99:99')||(a.order||0)-(b.order||0));
  }
  function focusForDate(date){return (state.focus?.logs||[]).filter(l=>{const d=l.date||iso(new Date(Number(l.startStamp)||Number(l.stamp)||0));return d===date}).reduce((s,l)=>s+(Number(l.duration)||0),0);}
  function taskFocus(t){return Math.round((Number(t.focusSeconds)||0)/60)}
  function weeklyMetrics(days){
    const ts=ensure().tasks.filter(t=>days.includes(t.dueDate));
    const planned=ts.reduce((s,t)=>s+(Number(t.estimateMins)||Number(t.durationMins)||0),0);
    const focused=days.reduce((s,d)=>s+focusForDate(d),0);
    const done=ts.filter(t=>t.status==='done').length;
    return {tasks:ts.length,done,planned,focused,rate:ts.length?Math.round(done/ts.length*100):0};
  }
  function progressForDay(date){const ts=tasksForDate(date);return ts.length?Math.round(ts.filter(t=>t.status==='done').length/ts.length*100):0}
  function timeToMins(s){if(!s)return null;const [h,m]=s.split(':').map(Number);return h*60+m}
  function render(){
    normalize(); const root=document.getElementById('nx2-root'); if(!root)return;
    const n=ensure(); const date=n.ui.selectedDate||iso(); const days=weekDays(n.ui.weekOffset||0); const metrics=weeklyMetrics(days); const today=iso();
    root.innerHTML=`<div class="nx3-shell">
      <header class="nx3-hero">
        <div class="nx3-hero-copy"><div class="nx3-eyebrow"><i class="ph ph-orbit"></i> NEXUS CONTROL</div><h1>Plan. Focus. See the day.</h1><p>Your tasks, projects and real Focus time in one clean system. No duplicate carry-forward tasks.</p></div>
        <div class="nx3-hero-actions"><button class="btn" onclick="window.nx3Today()"><i class="ph ph-crosshair"></i> Today</button><button class="btn btn-primary" onclick="window.nx3OpenTask()"><i class="ph ph-plus"></i> New task</button></div>
      </header>
      <section class="nx3-weekbar"><button class="nx3-nav" onclick="window.nx3Week(-1)"><i class="ph ph-caret-left"></i></button>${days.map((d,i)=>{const cnt=tasksForDate(d).length,fp=focusForDate(d),active=d===date,td=d===today;return `<button class="nx3-day ${active?'active':''} ${td?'today':''}" onclick="window.nx3Date('${d}')"><span>${new Date(d+'T00:00:00').toLocaleDateString([], {weekday:'short'})}</span><strong>${new Date(d+'T00:00:00').getDate()}</strong><small>${cnt} task${cnt===1?'':'s'} · ${fmtMin(fp)}</small></button>`}).join('')}<button class="nx3-nav" onclick="window.nx3Week(1)"><i class="ph ph-caret-right"></i></button></section>
      <nav class="nx3-navtabs">${[['overview','Overview','ph-squares-four'],['tasks','Tasks','ph-check-square'],['projects','Projects','ph-folders']].map(x=>`<button class="${n.ui.view===x[0]?'active':''}" onclick="window.nx3View('${x[0]}')"><i class="ph ${x[2]}"></i>${x[1]}</button>`).join('')}</nav>
      ${n.ui.view==='overview'?overview(date,days,metrics):n.ui.view==='projects'?projects():tasks()}
    </div>`;
  }
  function overview(date,days,m){
    const ts=tasksForDate(date), focus=focusForDate(date), planned=ts.reduce((s,t)=>s+(Number(t.estimateMins)||Number(t.durationMins)||0),0), pct=progressForDay(date);
    return `<section class="nx3-content"><div class="nx3-section-head"><div><span class="nx3-kicker">${dayLabel(date)}</span><h2>Daily command center</h2></div><button class="btn btn-sm" onclick="window.nx3View('tasks')">View all tasks <i class="ph ph-arrow-right"></i></button></div>
      <div class="nx3-metrics"><div class="nx3-metric"><span class="icon"><i class="ph ph-check-circle"></i></span><div><strong>${ts.filter(t=>t.status==='done').length}/${ts.length}</strong><small>Tasks complete</small></div></div><div class="nx3-metric"><span class="icon"><i class="ph ph-timer"></i></span><div><strong>${fmtMin(focus)}</strong><small>Focus today</small></div></div><div class="nx3-metric"><span class="icon"><i class="ph ph-calendar-check"></i></span><div><strong>${fmtMin(planned)}</strong><small>Planned today</small></div></div><div class="nx3-metric"><span class="icon"><i class="ph ph-chart-line-up"></i></span><div><strong>${pct}%</strong><small>Completion</small></div></div></div>
      <div class="nx3-grid-main"><div class="nx3-panel"><div class="nx3-panel-head"><h3>Today</h3><button class="icon-btn" onclick="window.nx3OpenTask()"><i class="ph ph-plus"></i></button></div>${ts.length?ts.slice(0,7).map(t=>card(t,date)).join(''):`<div class="nx3-empty"><i class="ph ph-sun"></i><h3>Nothing planned yet</h3><p>Add tasks to build your day.</p><button class="btn btn-primary" onclick="window.nx3OpenTask()">Plan a task</button></div>`}</div>
      <div class="nx3-panel nx3-week-summary"><div class="nx3-panel-head"><h3>This week</h3><span class="nx3-live">LIVE</span></div><div class="nx3-week-score"><strong>${m.rate}%</strong><span>completion</span></div><div class="nx3-bar"><i style="width:${m.rate}%"></i></div><div class="nx3-summary-row"><span>Tasks</span><b>${m.done}/${m.tasks}</b></div><div class="nx3-summary-row"><span>Planned</span><b>${fmtMin(m.planned)}</b></div><div class="nx3-summary-row"><span>Focused</span><b>${fmtMin(m.focused)}</b></div><div class="nx3-mini-week">${days.map(d=>`<button onclick="window.nx3Date('${d}')" class="${d===date?'selected':''}"><span>${new Date(d+'T00:00:00').toLocaleDateString([], {weekday:'narrow'})}</span><i style="height:${Math.max(6,Math.min(100,progressForDay(d)))}%"></i></button>`).join('')}</div></div></div>
      <div class="nx3-panel nx3-insight"><span class="insight-icon"><i class="ph ph-sparkle"></i></span><div><small>PRODUCTIVITY INSIGHT</small><p>${focus?`You have focused <b>${fmtMin(focus)}</b> today. Keep the next session tied to a task so your timeline stays accurate.`:'No Focus time logged today yet. Start a session from a task to build your daily timeline.'}</p></div></div></section>`;
  }
  function card(t,viewDate){
    const sub=t.subtasks||[],done=sub.filter(x=>x.done).length,f=taskFocus(t),over=isOverdue(t);
    const isAnchor = t.carry && t.carry.originalDate===viewDate && t.dueDate!==viewDate;
    let carryBadge='', anchorNote='';
    if(t.carry && t.carry.day>1){
      if(t.status==='done'){
        carryBadge = `<span class="nx3-carry-badge done"><i class="ph ph-check-circle"></i> Completed · Day ${t.carry.completedOnDay||t.carry.day}/7</span>`;
      } else if(t.carry.stopped){
        carryBadge = `<span class="nx3-carry-badge danger"><i class="ph ph-warning"></i> 7/7 — Not completed</span>`;
      } else {
        carryBadge = `<span class="nx3-carry-badge"><i class="ph ph-arrows-clockwise"></i> Carried · Day ${t.carry.day}/7</span>`;
      }
      if(isAnchor){
        anchorNote = `<div class="nx3-anchor-note"><i class="ph ph-arrow-right"></i> ${t.status==='done'?'Completed':'Now'} on ${dayLabel(t.dueDate)} <a onclick="window.nx3Date('${t.dueDate}')" style="cursor:pointer;color:var(--accent);text-decoration:underline;">Jump →</a></div>`;
      } else {
        anchorNote = `<div class="nx3-anchor-note"><i class="ph ph-arrow-left"></i> Originally due ${dayLabel(t.carry.originalDate)} <a onclick="window.nx3Date('${t.carry.originalDate}')" style="cursor:pointer;color:var(--accent);text-decoration:underline;">Jump →</a></div>`;
      }
    }
    return `<article class="nx3-task ${t.status==='done'?'done':''} ${over?'overdue':''}"><button class="nx3-check ${t.status==='done'?'checked':''}" onclick="window.nx3Toggle('${esc(t.id)}')">${t.status==='done'?'<i class="ph ph-check"></i>':''}</button><div class="nx3-task-body" style="cursor:pointer;" onclick="window.nx3ViewTask('${esc(t.id)}')"><div class="nx3-task-title"><h3>${esc(t.title)}</h3><span class="nx3-priority ${t.priority}">${t.priority}</span>${carryBadge}</div><div class="nx3-task-meta"><span><i class="ph ph-clock"></i>${t.startTime||'Any time'}</span><span><i class="ph ph-hourglass"></i>${fmtMin(t.durationMins||t.estimateMins)}</span>${t.project?`<span><i class="ph ph-folder"></i>${esc(t.project)}</span>`:''}<span class="focus"><i class="ph ph-timer"></i>${fmtMin(f)}</span>${sub.length?`<span><i class="ph ph-list-checks"></i>${done}/${sub.length}</span>`:''}</div>${anchorNote}</div><div class="nx3-task-actions"><button onclick="event.stopPropagation();window.nx3Focus('${esc(t.id)}')" title="Focus"><i class="ph ph-play"></i></button><button onclick="event.stopPropagation();window.nx3OpenTask('${esc(t.id)}')" title="Edit"><i class="ph ph-pencil-simple"></i></button></div></article>`;
  }
  function tasks(){const n=ensure(),q=safe(n.ui.search).toLowerCase(),arr=n.tasks.filter(t=>!q||[t.title,t.project,t.notes].join(' ').toLowerCase().includes(q)).sort((a,b)=>(a.status==='done')-(b.status==='done')||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));return `<section class="nx3-content"><div class="nx3-section-head"><div><span class="nx3-kicker">ALL TASKS</span><h2>Your task database</h2></div><button class="btn btn-primary btn-sm" onclick="window.nx3OpenTask()"><i class="ph ph-plus"></i> New task</button></div><div class="nx3-search"><i class="ph ph-magnifying-glass"></i><input placeholder="Search tasks, projects, notes…" value="${esc(n.ui.search)}" oninput="window.nx3Search(this.value)"></div><div class="nx3-task-list">${arr.length?arr.map(t=>card(t,t.dueDate)).join(''):`<div class="nx3-empty"><i class="ph ph-magnifying-glass"></i><h3>No matching tasks</h3><p>Try another search or create a new task.</p></div>`}</div></section>`}
  function projects(){
    const n=ensure(),map={};n.tasks.forEach(t=>{const p=t.project||'Unassigned';(map[p]??=[]).push(t)});
    const openProj=n.ui.project&&n.ui.project!=='all'?n.ui.project:null;
    if(openProj){
      const ts=(map[openProj]||[]).sort((a,b)=>(a.status==='done')-(b.status==='done')||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
      const done=ts.filter(t=>t.status==='done').length,focus=ts.reduce((s,t)=>s+taskFocus(t),0);
      return `<section class="nx3-content"><div class="nx3-section-head"><div><button class="btn btn-sm" onclick="window.nx3CloseProject()"><i class="ph ph-arrow-left"></i> Projects</button><span class="nx3-kicker" style="margin-left:10px;">PROJECT FOLDER</span><h2><i class="ph ph-folder-open"></i> ${esc(openProj)}</h2></div><button class="btn btn-primary btn-sm" onclick="window.nx3OpenTaskInProject('${esc(openProj)}')"><i class="ph ph-plus"></i> New task</button></div>
        <div class="nx3-metrics"><div class="nx3-metric"><span class="icon"><i class="ph ph-check-circle"></i></span><div><strong>${done}/${ts.length}</strong><small>Tasks complete</small></div></div><div class="nx3-metric"><span class="icon"><i class="ph ph-timer"></i></span><div><strong>${fmtMin(focus)}</strong><small>Total Focus</small></div></div></div>
        <div class="nx3-task-list">${ts.length?ts.map(t=>card(t,t.dueDate)).join(''):`<div class="nx3-empty"><i class="ph ph-folder-open"></i><h3>No tasks in this folder yet</h3></div>`}</div></section>`;
    }
    const entries=Object.entries(map).sort((a,b)=>b[1].length-a[1].length);
    return `<section class="nx3-content"><div class="nx3-section-head"><div><span class="nx3-kicker">PROJECTS</span><h2>Work grouped by direction</h2></div><button class="btn btn-primary btn-sm" onclick="window.nx3OpenTask()"><i class="ph ph-plus"></i> New task</button></div><div class="nx3-project-grid">${entries.length?entries.map(([p,ts])=>{const done=ts.filter(t=>t.status==='done').length,focus=ts.reduce((s,t)=>s+taskFocus(t),0),pct=Math.round(done/ts.length*100);return `<article class="nx3-project" style="cursor:pointer;" onclick="window.nx3OpenProject('${esc(p)}')"><div class="project-top"><span class="project-icon"><i class="ph ph-folder-simple"></i></span><span class="project-pct">${pct}%</span></div><h3>${esc(p)}</h3><p>${done}/${ts.length} tasks · ${fmtMin(focus)} Focus</p><div class="nx3-bar"><i style="width:${pct}%"></i></div><div class="project-foot"><span>${ts.filter(t=>t.status!=='done').length} open</span><span>${fmtMin(ts.reduce((s,t)=>s+(Number(t.estimateMins)||0),0))} planned</span></div></article>`}).join(''):`<div class="nx3-empty"><i class="ph ph-folders"></i><h3>No projects yet</h3><p>Add a project while creating a task.</p></div>`}</div></section>`}
  window.nx3OpenProject=function(p){ensure().ui.project=p;render()};
  window.nx3CloseProject=function(){ensure().ui.project='all';render()};
  window.nx3OpenTaskInProject=function(p){window.nx3OpenTask();setTimeout(()=>{const el=document.getElementById('nx3-project');if(el)el.value=p;},60)};
  function modal(){if(document.getElementById('nx3-modal'))return;const el=document.createElement('div');el.id='nx3-modal';el.className='nx3-modal';el.innerHTML=`<div class="nx3-modal-card"><button class="nx3-close" onclick="window.nx3CloseTask()"><i class="ph ph-x"></i></button><div class="nx3-eyebrow">NEXUS TASK</div><h2 id="nx3-modal-title">New task</h2><input type="hidden" id="nx3-id"><label>Task title<input id="nx3-title" maxlength="160" placeholder="What needs to get done?"></label><div class="nx3-form-grid"><label>Date<input id="nx3-date" type="date"></label><label>Start time<input id="nx3-time" type="time"></label></div><div class="nx3-form-grid"><label>Duration (min)<input id="nx3-duration" type="number" min="0" max="1440" placeholder="45"></label><label>Priority<select id="nx3-priority"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select></label></div><label>Project<input id="nx3-project" maxlength="60" placeholder="e.g. JEE Physics"></label><label>Repeat<select id="nx3-repeat"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option></select></label><label>Subtasks<input id="nx3-subtasks" placeholder="Separate with commas"></label><label>Notes<textarea id="nx3-notes" maxlength="1200" placeholder="Optional context…"></textarea></label><div class="nx3-modal-actions"><button class="btn btn-danger" id="nx3-delete-btn" style="display:none;margin-right:auto;" onclick="window.nx3DeleteTask()"><i class="ph ph-trash"></i> Delete</button><button class="btn" onclick="window.nx3CloseTask()">Cancel</button><button class="btn btn-primary" onclick="window.nx3SaveTask()">Save task</button></div></div>`;document.body.appendChild(el);el.addEventListener('click',e=>{if(e.target===el)window.nx3CloseTask()})}
  // ── Task detail popup (view mode) ──────────────────────────────────────
  // Opens when a task card is tapped/clicked. Shows subtasks as a live
  // checklist plus other task info, and links out to the project folder,
  // Focus, and the full edit form.
  function viewModal(){
    if(document.getElementById('nx3-view-modal'))return;
    const el=document.createElement('div');el.id='nx3-view-modal';el.className='nx3-modal';
    document.body.appendChild(el);
    el.addEventListener('click',e=>{if(e.target===el)window.nx3CloseView()});
  }
  window.nx3CloseView=function(){document.getElementById('nx3-view-modal')?.classList.remove('show')};
  window.nx3ViewTask=function(id){
    const t=task(id);if(!t)return;
    viewModal();
    const el=document.getElementById('nx3-view-modal');
    el.dataset.taskId=id;
    _renderViewModal(t);
    el.classList.add('show');
  };
  function _renderViewModal(t){
    const el=document.getElementById('nx3-view-modal');if(!el)return;
    const sub=t.subtasks||[],done=sub.filter(x=>x.done).length,f=taskFocus(t);
    el.innerHTML=`<div class="nx3-modal-card">
      <button class="nx3-close" onclick="window.nx3CloseView()"><i class="ph ph-x"></i></button>
      <div class="nx3-eyebrow">NEXUS TASK</div>
      <h2 style="display:flex;align-items:center;gap:10px;">
        <button class="nx3-check ${t.status==='done'?'checked':''}" style="position:static;" onclick="window.nx3Toggle('${esc(t.id)}');window.nx3ViewTask('${esc(t.id)}')">${t.status==='done'?'<i class="ph ph-check"></i>':''}</button>
        <span style="${t.status==='done'?'text-decoration:line-through;opacity:0.6;':''}">${esc(t.title)}</span>
      </h2>
      <div class="nx3-task-meta" style="margin-bottom:14px;">
        <span class="nx3-priority ${t.priority}">${t.priority}</span>
        <span><i class="ph ph-clock"></i> ${t.dueDate?dayLabel(t.dueDate):'No date'} ${t.startTime||''}</span>
        <span><i class="ph ph-hourglass"></i> ${fmtMin(t.durationMins||t.estimateMins)} planned</span>
        <span class="focus"><i class="ph ph-timer"></i> ${fmtMin(f)} focused</span>
        ${t.project?`<span style="cursor:pointer;text-decoration:underline;" onclick="window.nx3CloseView();window.nx3View('projects');window.nx3OpenProject('${esc(t.project)}')"><i class="ph ph-folder"></i> ${esc(t.project)}</span>`:''}
      </div>
      ${t.notes?`<div style="margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.05);font-size:0.85rem;line-height:1.5;">${esc(t.notes).replace(/\n/g,'<br>')}</div>`:''}
      <div class="nx3-eyebrow" style="margin-top:4px;">CHECKLIST ${sub.length?`(${done}/${sub.length})`:''}</div>
      ${sub.length?`<div class="nx3-bar" style="margin:6px 0 12px;"><i style="width:${Math.round(done/sub.length*100)}%"></i></div>
      <div class="nx3-subtask-list">${sub.map((s,i)=>`<label style="display:flex;align-items:center;gap:10px;padding:8px 4px;cursor:pointer;">
        <input type="checkbox" ${s.done?'checked':''} onchange="window.nx3ToggleSubtask('${esc(t.id)}',${i})" style="width:18px;height:18px;">
        <span style="${s.done?'text-decoration:line-through;opacity:0.55;':''}">${esc(s.text)}</span>
      </label>`).join('')}</div>`:`<div style="padding:14px 4px;color:var(--text-dim);font-size:0.82rem;">No subtasks yet — add some from Edit.</div>`}
      <div class="nx3-modal-actions">
        <button class="btn btn-danger" style="margin-right:auto;" onclick="window.nx3CloseView();window.nx3OpenTask('${esc(t.id)}');setTimeout(()=>window.nx3DeleteTask(),50)"><i class="ph ph-trash"></i> Delete</button>
        <button class="btn" onclick="window.nx3CloseView();window.nx3Focus('${esc(t.id)}')"><i class="ph ph-play"></i> Focus this</button>
        <button class="btn btn-primary" onclick="window.nx3CloseView();window.nx3OpenTask('${esc(t.id)}')"><i class="ph ph-pencil-simple"></i> Edit</button>
      </div>
    </div>`;
  }
  window.nx3ToggleSubtask=function(id,idx){
    const t=task(id);if(!t||!Array.isArray(t.subtasks)||!t.subtasks[idx])return;
    t.subtasks[idx].done=!t.subtasks[idx].done;
    save();
    _renderViewModal(t);
    render();
  };
  window.nx3OpenTask=function(id){modal();const t=id?task(id):null;document.getElementById('nx3-modal-title').textContent=t?'Edit task':'New task';document.getElementById('nx3-id').value=t?.id||'';document.getElementById('nx3-title').value=t?.title||'';document.getElementById('nx3-date').value=t?.dueDate||ensure().ui.selectedDate||iso();document.getElementById('nx3-time').value=t?.startTime||'';document.getElementById('nx3-duration').value=t?.durationMins||t?.estimateMins||'';document.getElementById('nx3-priority').value=t?.priority||'med';document.getElementById('nx3-project').value=t?.project||'';document.getElementById('nx3-repeat').value=t?.repeat||'none';document.getElementById('nx3-subtasks').value=(t?.subtasks||[]).map(x=>x.text).join(', ');document.getElementById('nx3-notes').value=t?.notes||'';const delBtn=document.getElementById('nx3-delete-btn');if(delBtn)delBtn.style.display=t?'':'none';document.getElementById('nx3-modal').classList.add('show');setTimeout(()=>document.getElementById('nx3-title')?.focus(),50)};
  window.nx3DeleteTask=function(){
    const id=document.getElementById('nx3-id').value; if(!id) return;
    const t=task(id); if(!t) return;
    if(!confirm(`Delete "${t.title}"? This can't be undone.`)) return;
    const n=ensure();
    n.tasks=n.tasks.filter(x=>x.id!==id);
    save();
    window.nx3CloseTask();
    render();
  };
  window.nx3CloseTask=()=>document.getElementById('nx3-modal')?.classList.remove('show');
  window.nx3SaveTask=function(){const n=ensure(),id=document.getElementById('nx3-id').value,title=document.getElementById('nx3-title').value.trim();if(!title)return;const old=id?task(id):null,t=old||{id:uid(),createdAt:Date.now(),order:Date.now(),status:'todo',focusSeconds:0};const raw=document.getElementById('nx3-subtasks').value.split(',').map(x=>x.trim()).filter(Boolean);Object.assign(t,{title,dueDate:document.getElementById('nx3-date').value||'',startTime:document.getElementById('nx3-time').value||'',durationMins:Math.max(0,parseInt(document.getElementById('nx3-duration').value)||0),estimateMins:Math.max(0,parseInt(document.getElementById('nx3-duration').value)||0),priority:document.getElementById('nx3-priority').value,project:document.getElementById('nx3-project').value.trim(),repeat:document.getElementById('nx3-repeat').value,notes:document.getElementById('nx3-notes').value.trim(),subtasks:raw.map(x=>({text:x,done:(old?.subtasks||[]).find(y=>y.text===x)?.done||false}))});if(!old)n.tasks.push(t);n.ui.selectedDate=t.dueDate||n.ui.selectedDate;save();window.nx3CloseTask();render()};
  window.nx3Toggle=function(id){const t=task(id);if(!t)return;if(t.status!=='done'){t.status='done';t.completedAt=Date.now();t.completedDate=iso();t.completedCount=(Number(t.completedCount)||0)+1;if(t.carry){t.carry.completedOnDay=t.carry.day;t.carry.completedOnDate=t.completedDate;}if(t.repeat&&t.repeat!=='none'){t.completionHistory=Array.isArray(t.completionHistory)?t.completionHistory:[];t.completionHistory.push({date:t.completedDate,at:t.completedAt});let d=new Date((t.dueDate||iso())+'T00:00:00');do{d.setDate(d.getDate()+1)}while(t.repeat==='weekdays'&&[0,6].includes(d.getDay()));if(t.repeat==='weekly')d.setDate(d.getDate()+7);t.dueDate=iso(d);t.status='todo';delete t.completedAt;delete t.completedDate;delete t.carry}}else{t.status='todo';delete t.completedAt;delete t.completedDate;if(t.carry){delete t.carry.completedOnDay;delete t.carry.completedOnDate;}}save();render()};
  window.nx3Focus=function(id){const t=task(id);if(!t)return;document.querySelector('[data-tab="focus"]')?.click();setTimeout(()=>{window.openFocusTaskPopup?.('task');setTimeout(()=>window.ftpSelectTask?.(t.title,t.id),80)},120)};
  window.nx3Date=d=>{ensure().ui.selectedDate=d;ensure().ui.view='overview';render()};
  window.nx3Today=()=>{ensure().ui.selectedDate=iso();ensure().ui.weekOffset=0;ensure().ui.view='overview';render()};
  window.nx3Week=x=>{ensure().ui.weekOffset=(ensure().ui.weekOffset||0)+x;render()};
  window.nx3View=v=>{ensure().ui.view=v;render()};
  window.nx3Search=v=>{ensure().ui.search=v;render()};
  window.nx2Init=()=>{ensure();migrateLegacy();render()}; window.nx2Render=render;
  window.nx2GetTasks=()=>ensure().tasks;window.nx2FindTask=task;window.nx2GetTaskForFocus=task;window.nx2FocusTasks=()=>ensure().tasks.filter(t=>t.status!=='done');
  window.nx2AddFocusSeconds=function(id,sec){const t=task(id);if(!t||sec<=0)return;t.focusSeconds=(Number(t.focusSeconds)||0)+Number(sec);if(t.carry&&!t.carry.frozen){t.carry.frozen=true;}if(typeof triggerSave==='function')triggerSave();render()};
  window.nx2Focus=window.nx3Focus; window.nx2OpenFocusPicker=id=>{const t=task(id);window.openFocusTaskPopup?.('task');setTimeout(()=>t&&window.ftpSelectTask?.(t.title,t.id),80)};
  // ── Carry-forward: external hooks (used at app boot and by the Summary tab) ──
  window.nxAdvanceCarries=function(){ ensure(); normalize(); };
  window.nxGetDangerousTasks=function(){
    ensure();
    return ensure().tasks.filter(t=>t.carry && t.carry.stopped && t.status!=='done')
      .sort((a,b)=>(a.carry.originalDate||'').localeCompare(b.carry.originalDate||''));
  };
  window.nxJumpToTask=function(id){
    const t=task(id); if(!t) return;
    document.querySelector('.nav-link[data-tab="missions"]')?.click();
    setTimeout(()=>{ window.nx3Date(t.dueDate||iso()); }, 60);
  };
  // Old Nexus hooks become harmless compatibility shims.
  window.processRecurringTasks=()=>{};window._cleanupDuplicateCarriedTasks=()=>{};
  document.addEventListener('keydown',e=>{const tag=e.target?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;if((e.key==='n'||e.key==='N')&&document.querySelector('#missions.active')){e.preventDefault();window.nx3OpenTask()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&document.querySelector('#missions.active')){e.preventDefault();document.querySelector('.nx3-search input')?.focus()}});
})();

window.renderNexusDangerList = function() {
    const box = document.getElementById('sum2-danger-list');
    if(!box) return;
    window.nxAdvanceCarries && window.nxAdvanceCarries();
    const list = window.nxGetDangerousTasks ? window.nxGetDangerousTasks() : [];
    if(!list.length) {
        box.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.85rem;">✅ No dangerous tasks — nothing has hit the 7-day carry limit.</div>`;
        return;
    }
    box.innerHTML = list.map(t => `
        <div class="danger-task-row" onclick="window.nxJumpToTask('${t.id}')">
            <div class="dt-icon"><i class="ph ph-warning-circle"></i></div>
            <div class="dt-body">
                <div class="dt-title">${(typeof escapeHTML==='function'?escapeHTML(t.title||'Untitled task'):(t.title||'Untitled task'))}</div>
                <div class="dt-meta">Originally due ${t.carry.originalDate} · stuck at Day 7/7 · never finished</div>
            </div>
            <i class="ph ph-arrow-right" style="color:var(--text-dim);"></i>
        </div>
    `).join('');
};

// ============================================================
// TRACKER (Strategic Timeline)
// ============================================================
function trk_getNames(wn,isSun,yr){
    const key=`y${yr}_w${wn}${isSun?'_sun':''}`;
    const defaults=isSun?['Revision','Prayer','Family','Nature','Reading','Creative','Plan Week','Review','Sports','Hobbies']:['Physics','Chemistry','Math','Biology','English','Coding','Revision','Mock Test','Exercise','Sleep 8h'];
    if(!trk_weeklyTaskNames[key]){trk_weeklyTaskNames[key]=[...defaults];return trk_weeklyTaskNames[key];}
    return trk_weeklyTaskNames[key];
}
window.trk_handleRename=function(wn,ti,isSun,yr){
    const key=`y${yr}_w${wn}${isSun?'_sun':''}`;
    if(!trk_weeklyTaskNames[key])trk_weeklyTaskNames[key]=trk_getNames(wn,isSun,yr);
    const cur=trk_weeklyTaskNames[key][ti];
    const nexusNames=new Set();
    Object.values(gg_db).forEach(dayTasks=>{if(Array.isArray(dayTasks))dayTasks.forEach(t=>{if(t.name)nexusNames.add(t.name);});});
    let promptMsg="Rename habit:\n(Current: "+cur+")";
    if(nexusNames.size>0){promptMsg+="\n\nNexus tasks (copy one):\n"+ [...nexusNames].slice(0,8).join('\n');}
    const nu=prompt(promptMsg,cur);if(nu&&nu.trim()){trk_weeklyTaskNames[key][ti]=nu.trim();triggerSave();window.trk_renderAll();}
};
window.trk_toggleStatus=function(id,wn,cm,yr){
    const cur=trk_data[id]||0;
    trk_data[id]=(cur===0?1:cur===1?2:0);
    triggerSave();
    const btn=document.getElementById(id);if(btn){btn.className=`status-btn${trk_data[id]===1?' done':trk_data[id]===2?' failed':''}`;btn.textContent=trk_data[id]===1?'✓':trk_data[id]===2?'✕':'';}
    window.trk_updateWeekStats(wn,yr);window.trk_updateMonthChart(cm,yr);window.trk_updateYearlyChart(yr);
};
window.trk_syncNexusTasks=function(){
    const yr=parseInt(document.getElementById('trk-year-select').value);
    const today=new Date();
    let pos=new Date(yr,0,1);let weekNum=1;
    while(pos<=today&&pos.getFullYear()===yr){
        let end=new Date(pos);end.setDate(pos.getDate()+(pos.getDay()===0?0:7-pos.getDay()));
        if(today>=pos&&today<=end){break;}
        pos=new Date(end);pos.setDate(pos.getDate()+1);weekNum++;
    }
    const key=`y${yr}_w${weekNum}`;
    if(!trk_weeklyTaskNames[key])trk_weeklyTaskNames[key]=trk_getNames(weekNum,false,yr);
    const nexusNames=[...new Set(Object.values(gg_db).flat().filter(t=>t&&t.name).map(t=>t.name))].slice(0,10);
    if(nexusNames.length===0){alert('No Nexus tasks found. Add tasks in Nexus Control first.');return;}
    nexusNames.forEach((name,i)=>{if(i<10)trk_weeklyTaskNames[key][i]=name;});
    triggerSave();window.trk_renderAll();
    alert('Synced '+nexusNames.length+' Nexus tasks to this week\'s tracker!');
};
window.trk_jumpToToday = function(){
    const yr=parseInt(document.getElementById('trk-year-select').value);
    const today=new Date();
    if(today.getFullYear()!==yr){
        document.getElementById('trk-year-select').value=today.getFullYear();
        trackerRendered=false;
        window.trk_renderAll(); trackerRendered=true;
        setTimeout(()=>window.trk_jumpToToday(), 300);
        return;
    }
    if(!trackerRendered){ window.trk_renderAll(); trackerRendered=true; }
    // Find the week card whose date range contains today
    const allCards = document.querySelectorAll('[id^="week-card-"]');
    let found=false;
    allCards.forEach(card=>{
        const wn=parseInt(card.id.replace('week-card-',''));
        // Get start/end from the card's data attributes if present, else compute
        const ds=card.getAttribute('data-start');
        const de=card.getAttribute('data-end');
        if(ds&&de){
            const s=new Date(ds),e=new Date(de);
            e.setHours(23,59,59,999);
            if(today>=s&&today<=e){
                found=true;
                setTimeout(()=>{
                    card.scrollIntoView({behavior:'smooth',block:'center'});
                    card.style.transition='border-color 0.4s';
                    card.style.borderColor='var(--accent)';
                    card.style.boxShadow='0 0 20px var(--accent-glow)';
                    setTimeout(()=>{card.style.borderColor='';card.style.boxShadow='';},1500);
                },100);
            }
        }
    });
    // Fallback: use week number calculation
    if(!found){
        const jan1=new Date(yr,0,1);
        const dayOfYear=Math.floor((today-jan1)/86400000)+1;
        // Determine week number (weeks start Monday in the tracker)
        let wNum=1;
        let pos=new Date(yr,0,1);
        while(pos.getDay()!==1&&pos.getDay()!==0)pos.setDate(pos.getDate()+1); // skip to first Mon/Sun
        let w=1;
        while(pos<=today&&pos.getFullYear()===yr){
            const end=new Date(pos);end.setDate(pos.getDate()+6);
            if(today>=pos&&today<=end){wNum=w;break;}
            pos.setDate(pos.getDate()+7);w++;
        }
        const card=document.getElementById(`week-card-${wNum}`);
        if(card){
            setTimeout(()=>{
                card.scrollIntoView({behavior:'smooth',block:'center'});
                card.style.transition='border-color 0.4s';
                card.style.borderColor='var(--accent)';
                setTimeout(()=>{card.style.borderColor='';},1500);
            },100);
        }
    }
};
window.trk_copyToNextWeek = function(currentWeek, year) {
    if (currentWeek >= 53) { alert("You've reached the end of the year!"); return; }
    const nextWeek = currentWeek + 1;
    const mainNames = trk_getNames(currentWeek, false, year);
    const sunNames = trk_getNames(currentWeek, true, year);
    trk_weeklyTaskNames[`y${year}_w${nextWeek}`] = [...mainNames];
    trk_weeklyTaskNames[`y${year}_w${nextWeek}_sun`] = [...sunNames];
    triggerSave(); window.trk_renderAll();
    setTimeout(() => { const nextCard = document.getElementById(`week-card-${nextWeek}`); if(nextCard) nextCard.scrollIntoView({behavior: 'smooth', block: 'center'}); }, 100);
};
window.trk_updateWeekStats=function(weekNum,year){
    const canvas=document.getElementById(`chart-${weekNum}`);if(!canvas)return;
    const names=trk_getNames(weekNum,false,year);
    const doneC=new Array(10).fill(0),failC=new Array(10).fill(0);
    Object.keys(trk_data).forEach(id=>{const parts=id.split('-');const td=new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);const wPart=parts[3]?.replace('w','');const tPart=parts[4]?.replace('t','');if(wPart==weekNum&&td.getFullYear()==year&&!id.includes('-sun')){if(trk_data[id]===1)doneC[parseInt(tPart)]++;else if(trk_data[id]===2)failC[parseInt(tPart)]++;}});
    if(trk_charts[weekNum]){trk_charts[weekNum].data.datasets[0].data=doneC;trk_charts[weekNum].data.datasets[1].data=failC;trk_charts[weekNum].update();}
    else{trk_charts[weekNum]=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:names.map(n=>n.substring(0,6)),datasets:[{label:'Done',data:doneC,backgroundColor:'rgba(0,229,160,0.6)',borderRadius:4},{label:'Failed',data:failC,backgroundColor:'rgba(255,75,112,0.6)',borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:false,scales:{x:{beginAtZero:true,max:6,ticks:{stepSize:1,color:'#475569'}},y:{ticks:{color:'#f0f4ff',font:{size:10,weight:'600'}}}},plugins:{legend:{display:true,labels:{color:'#f0f4ff',font:{size:10}}}}}});}
};
window.trk_updateMonthChart=function(monthIdx,year){
    const canvas=document.getElementById(`month-pie-${monthIdx}`);if(!canvas)return;let agg={};
    Object.keys(trk_data).forEach(id=>{if(trk_data[id]===1){const parts=id.split('-');const td=new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);if(td.getMonth()==monthIdx&&td.getFullYear()==year){const wn=parts[3].replace('w','');const ti=parts[4].replace('t','');const is=parts.length>5;const tn=trk_getNames(wn,is,year)[ti];agg[tn]=(agg[tn]||0)+1;}}});
    const labels=Object.keys(agg),data=Object.values(agg);
    if(trk_monthlyCharts[monthIdx]){trk_monthlyCharts[monthIdx].data.labels=labels;trk_monthlyCharts[monthIdx].data.datasets[0].data=data;trk_monthlyCharts[monthIdx].update();}
    else{trk_monthlyCharts[monthIdx]=new Chart(canvas.getContext('2d'),{type:'pie',data:{labels,datasets:[{data,backgroundColor:['#ff4b70','#00e5a0','#38bdf8','#fbbf24','#a855f7','#ec4899','#14b8a6','#4f6ef7','#f97316','#06b6d4'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},plugins:{legend:{position:'right',labels:{color:'#f0f4ff',font:{size:11}}}}}});}
};
window.trk_updateYearlyChart=function(year){
    const canvas=document.getElementById(`year-pie-chart`);if(!canvas)return;let agg={};
    Object.keys(trk_data).forEach(id=>{if(trk_data[id]===1){const parts=id.split('-');const td=new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);if(td.getFullYear()==year){const wn=parts[3].replace('w','');const ti=parts[4].replace('t','');const is=parts.length>5;const tn=trk_getNames(wn,is,year)[ti];agg[tn]=(agg[tn]||0)+1;}}});
    if(trk_yearlyChart){trk_yearlyChart.data.labels=Object.keys(agg);trk_yearlyChart.data.datasets[0].data=Object.values(agg);trk_yearlyChart.update();}
    else{trk_yearlyChart=new Chart(canvas.getContext('2d'),{type:'pie',data:{labels:Object.keys(agg),datasets:[{data:Object.values(agg),backgroundColor:['#ff4b70','#00e5a0','#38bdf8','#fbbf24','#a855f7','#ec4899','#14b8a6','#4f6ef7','#f97316','#06b6d4'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},plugins:{legend:{position:'right',labels:{color:'#f0f4ff',font:{size:11}}}}}});}
};
window.trk_renderAll=function(){
    let html="";const currentYear=parseInt(document.getElementById('trk-year-select').value);
    let pos=new Date(currentYear,0,1);const yearEnd=new Date(currentYear,11,31,23,59,59);
    let weekNum=1,lastMonth=-1;
    trk_charts={};trk_monthlyCharts={};if(trk_yearlyChart){trk_yearlyChart.destroy();trk_yearlyChart=null;}
    while(pos<=yearEnd){
        const cm=pos.getMonth();
        if(cm!==lastMonth){if(lastMonth!==-1){html+=`<div class="month-divider"><div class="month-label-large">${MONTH_NAMES[lastMonth]}<br><span style="font-size:0.9rem;opacity:0.55;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;">Monthly Focus</span></div><div style="height:280px;"><canvas id="month-pie-${lastMonth}" class="lazy-chart" data-type="month" data-id="${lastMonth}" data-year="${currentYear}"></canvas></div></div>`;}lastMonth=cm;}
        const wn=trk_getNames(weekNum,false,currentYear),sn=trk_getNames(weekNum,true,currentYear);
        let sow=new Date(pos),eow=new Date(pos);eow.setDate(sow.getDate()+(sow.getDay()===0?0:7-sow.getDay()));
        let mainRows="",sunRow="",td=new Date(sow);
        while(td<=eow&&td<=yearEnd){
            const isSun=td.getDay()===0,dStr=getLocalIsoDate(td),dn=td.toLocaleDateString('en-US',{weekday:'short'}),idPfx=`${dStr}-w${weekNum}`;
            let row=`<tr class="${isSun?'sunday-row':''}"><td class="trk-day-label">${dn}<span class="trk-day-num">${td.getDate()}</span></td>`;
            for(let i=0;i<10;i++){const id=`${idPfx}-t${i}${isSun?'-sun':''}`;const st=trk_data[id]||0;const ic=st===1?"✓":st===2?"✕":"";row+=`<td><button id="${id}" data-task-idx="${i}" class="status-btn${st===1?' done':st===2?' failed':''}" onclick="window.trk_toggleStatus('${id}',${weekNum},${cm},${currentYear})">${ic}</button></td>`;}
            row+=`</tr>`;if(isSun)sunRow=row;else mainRows+=row;td.setDate(td.getDate()+1);
        }
        html+=`<div class="trk-week-card" id="week-card-${weekNum}" data-start="${getLocalIsoDate(sow)}" data-end="${getLocalIsoDate(eow)}">
            <div class="trk-week-header">
                <div class="trk-week-title-wrap">
                    <span class="trk-date-range">${sow.toLocaleDateString('en-US',{month:'short',day:'numeric'})} — ${eow.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                    <div class="trk-week-title-row">
                        <h2>Week ${weekNum}</h2>
                        <button class="btn btn-sm" style="padding: 6px 14px; font-size: 0.7rem; background: rgba(79,110,247,0.15); border-color: rgba(79,110,247,0.4); color: var(--accent);" onclick="window.trk_copyToNextWeek(${weekNum}, ${currentYear})">
                            <i class="ph ph-copy"></i> Copy to Next Week
                        </button>
                    </div>
                </div>
            </div>
            <div class="trk-content-layout">
                <div class="trk-table-container">
                    <table class="main-table">
                        <thead><tr><th></th>${wn.map((n,i)=>`<th title="${n}" style="cursor:pointer;" onclick="window.trk_handleRename(${weekNum},${i},false,${currentYear})">${n.substring(0,6)}</th>`).join('')}</tr></thead>
                        <tbody>${mainRows}</tbody>
                    </table>
                    <table class="sunday-table" style="margin-top:8px;border-top:1px solid var(--border)">
                        <thead><tr><th class="trk-day-label" style="color:var(--sleep);">Sun</th>${sn.map((n,i)=>`<th title="${n}" style="cursor:pointer;" onclick="window.trk_handleRename(${weekNum},${i},true,${currentYear})">${n.substring(0,6)}</th>`).join('')}</tr></thead>
                        <tbody>${sunRow}</tbody>
                    </table>
                </div>
                <div class="chart-box">
                    <p class="chart-label">Weekly Performance</p>
                    <div style="flex-grow:1; position:relative; height:100%; min-height: 200px;">
                        <canvas id="chart-${weekNum}" class="lazy-chart" data-type="week" data-id="${weekNum}" data-year="${currentYear}"></canvas>
                    </div>
                </div>
            </div>
        </div>`;
        pos=new Date(eow);pos.setDate(pos.getDate()+1);weekNum++;
    }
    html+=`<div class="month-divider"><div class="month-label-large">December<br><span style="font-size:0.9rem;opacity:0.55;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;">Monthly Focus</span></div><div style="height:280px;"><canvas id="month-pie-11" class="lazy-chart" data-type="month" data-id="11" data-year="${currentYear}"></canvas></div></div><div class="year-divider"><div class="year-label-large">${currentYear}<br><span style="font-size:1rem;opacity:0.8;color:var(--prod);text-transform:uppercase;font-weight:800;letter-spacing:0.3em;">Annual Mastery</span></div><div style="height:380px;"><canvas id="year-pie-chart" class="lazy-chart" data-type="year" data-year="${currentYear}"></canvas></div></div>`;
    document.getElementById("weeks-grid").innerHTML=html;trackerRendered=true;
    if(chartObserver)chartObserver.disconnect();
    chartObserver=new IntersectionObserver((entries)=>{
        entries.forEach(entry=>{
            if(entry.isIntersecting){
                const c=entry.target,type=c.dataset.type,id=c.dataset.id,year=c.dataset.year;
                if(type==='week')window.trk_updateWeekStats(id,year);
                else if(type==='month')window.trk_updateMonthChart(id,year);
                else if(type==='year')window.trk_updateYearlyChart(year);
                chartObserver.unobserve(c);
            }
        });
    },{rootMargin:'300px'});
    document.querySelectorAll('.lazy-chart').forEach(c=>chartObserver.observe(c));
};

// ============================================================
// MAIN TICK & BOOT SYSTEM
// ============================================================
let focusAlertPending = false;
setInterval(() => {
    const now = Date.now();
    const d=new Date(now); const timeStr=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    const clk=document.getElementById('clock-main'); if(clk) clk.textContent=timeStr;
    const dm=document.getElementById('date-main'); if(dm) dm.textContent=d.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    if(state.sw.running) {
        const elapsed=state.sw.elapsed+(now-state.sw.lastStart);
        const swEl=document.getElementById('sw-display'); if(swEl) swEl.textContent=formatStopwatchFull(elapsed);
    }
    if(state.focus.running && state.focus.endTime) {
        state.focus.time = Math.round((state.focus.endTime - now) / 1000);
        if(state.focus.time <= 0 && !focusAlertPending) {
            if(state.focus.mode === 'work') {
                _focusFinalizeActiveSegment('complete');
                _focusItemSegmentsPause(); // pause per-item timers — break time
            }
            focusAlertPending = true; state.focus.running = false; delete state.focus.endTime; delete state.focus.segmentStartedAt;
            const ambient=document.getElementById('audio-ambient'), pika=document.getElementById('audio-pika'), goku=document.getElementById('audio-goku');
            const overlay=document.getElementById('focus-alert-overlay'), msg=document.getElementById('focus-alert-msg'), btn=document.getElementById('focus-alert-btn');
            if(state.focus.mode==='work') {
                ambient.pause(); pika.currentTime=0; pika.play().catch(()=>{});
                sendSystemNotification("MISSION ACCOMPLISHED","Break time!");
                msg.innerHTML="SESSION ACCOMPLISHED!<br><span style='font-size:0.95rem;color:var(--text-dim);'>Time for a Break.</span>";
                btn.innerHTML="BEGIN BREAK";
                btn.onclick = () => {
                    overlay.style.display='none'; focusAlertPending=false;
                    state.focus.sessions++;
                    _focusCheckDailyTarget();
                    // Long break every N reps
                    const isLongBreak = (state.focus.currentRep % (state.focus.reps||4)) === 0;
                    state.focus.mode = isLongBreak ? 'longbreak' : 'break';
                    _setFocusBgMode(state.focus.mode);
                    resetFocusUI(); state.focus.running=true;
                    state.focus.endTime=Date.now()+(state.focus.time*1000);
                    triggerSave(); updateFocusUI(); updateFocusStatsGrid(); window.updateHomeStats();
                    _updateFocusRepDots();
                    updateChapterFocusDisplay();
                };
            } else {
                goku.currentTime=0; goku.play().catch(()=>{});
                sendSystemNotification("BREAK OVER","Focus time!");
                msg.innerHTML="BREAK OVER!<br><span style='font-size:0.95rem;color:var(--text-dim);'>Prepare for Deep Focus.</span>";
                btn.innerHTML="INITIATE MISSION";
                btn.onclick = () => {
                    goku.pause(); overlay.style.display='none'; focusAlertPending=false;
                    state.focus.currentRep++;
                    // Decide next mode: long break after N reps, else work
                    if(state.focus.currentRep > state.focus.reps) {
                        state.focus.running=false; state.focus.currentRep=1;
                        state.focus._patternIdx=0;
                        delete state.focus.sessionId; delete state.focus._openLogId; delete state.focus._openLogKey;
                        _updateFocusToggleBtn();
                        _setFocusBgMode('idle');
                    } else {
                        state.focus.mode='work';
                        ambient.play().catch(()=>{});state.focus.running=true;
                        _setFocusBgMode('work');
                    }
                    resetFocusUI(); if(state.focus.running) { state.focus.endTime=Date.now()+(state.focus.time*1000); _focusStartSegment(); }
                    triggerSave(); updateFocusUI(); _updateFocusRepDots();
                };
            }
            overlay.style.display='flex';
        }
        if(!focusAlertPending){const ft=document.getElementById('focus-timer');if(ft)ft.textContent=formatMins(Math.max(0,state.focus.time));updateFocusUI();}
    }
    updateEvents(now); updatePiPOverlay(); renderNativePiP();
    _focusItemBadgesTick();
    // Sync circular timer display every tick
    if(typeof _updateCircularDisplay === 'function') _updateCircularDisplay();
}, 1000);

// ══════════════════════════════════════════════════
// FOCUS PAGE — New UI Functions
// ══════════════════════════════════════════════════

// Settings popup toggle
window.toggleFocusSettings = function() {
    const p = document.getElementById('focus-settings-popup');
    if(!p) return;
    const isOpen = p.style.display !== 'none';
    p.style.display = isOpen ? 'none' : 'block';
    if(!isOpen) _renderFspCycleVisual();
};

// Close popups when clicking outside
document.addEventListener('click', function(e) {
    const sp = document.getElementById('focus-settings-popup');
    const sb = document.getElementById('focus-settings-btn');
    const tp = document.getElementById('focus-task-popup');
    const wb = document.getElementById('focus-what-btn');
    if(sp && sp.style.display !== 'none' && !sp.contains(e.target) && !sb.contains(e.target)) sp.style.display='none';
    if(tp && tp.style.display !== 'none' && !tp.contains(e.target) && wb && !wb.contains(e.target)) tp.style.display='none';
}, true);

// Settings changed → update cycle visual
window.focusSettingChanged = function() {
    _renderFspCycleVisual();
    // Persist to state (only if not running)
    if(!state.focus.running) {
        state.focus.workM     = parseFloat(document.getElementById('f-work-in').value)||25;
        state.focus.breakM    = parseFloat(document.getElementById('f-break-in').value)||5;
        state.focus.longBreakM= parseFloat(document.getElementById('f-longbreak-in').value)||15;
        state.focus.reps      = parseInt(document.getElementById('f-reps-in').value)||4;
        state.focus.dailyTarget= parseInt(document.getElementById('f-target-in').value)||60;
        _updateFocusRepDots();
        resetFocusUI();
        updateFocusUI();
    }
    triggerSave();
};

// Render cycle preview pills
function _renderFspCycleVisual() {
    const cv = document.getElementById('fsp-cycle-visual');
    if(!cv) return;
    const reps = parseInt(document.getElementById('f-reps-in')?.value)||4;
    const w = document.getElementById('f-work-in')?.value||25;
    const b = document.getElementById('f-break-in')?.value||5;
    const lb= document.getElementById('f-longbreak-in')?.value||15;
    let html = '';
    for(let i=1; i<=reps; i++) {
        html += `<div class="fsp-cv-pill">F·${w}m</div>`;
        if(i < reps) html += `<div class="fsp-cv-pill break">S·${b}m</div>`;
        else html += `<div class="fsp-cv-pill longbreak">L·${lb}m</div>`;
    }
    cv.innerHTML = html;
}

// Custom pattern builder
let _focusPattern = []; // [{type:'focus'|'short'|'long'}]
window.fspAddStep = function(type) {
    if(_focusPattern.length >= 16) return;
    _focusPattern.push({type});
    _renderPatternPills();
};
window.fspClearPattern = function() {
    _focusPattern = [];
    _renderPatternPills();
};
window.fspRemoveStep = function(idx) {
    _focusPattern.splice(idx,1);
    _renderPatternPills();
};
function _renderPatternPills() {
    const el = document.getElementById('fsp-pattern-pills');
    if(!el) return;
    if(!_focusPattern.length) { el.innerHTML = '<span style="font-size:0.7rem;color:rgba(255,255,255,0.2);">Use buttons below to build a custom cycle</span>'; state.focus.customPattern=null; return; }
    const labels = {focus:'🎯 Focus', short:'☕ Short', long:'🌙 Long'};
    const cls    = {focus:'', short:'break', long:'longbreak'};
    el.innerHTML = _focusPattern.map((s,i) =>
        `<div class="fsp-pp ${cls[s.type]}">${labels[s.type]}<button onclick="window.fspRemoveStep(${i})">×</button></div>`
    ).join('');
    state.focus.customPattern = _focusPattern.map(s=>s.type);
}
function _applyPatternStep(idx) {
    if(!state.focus.customPattern || !state.focus.customPattern.length) return;
    const step = state.focus.customPattern[idx % state.focus.customPattern.length];
    state.focus.mode = step === 'focus' ? 'work' : step === 'short' ? 'break' : 'longbreak';
    resetFocusUI();
}

// Mode tab switching (manual)
window.setFocusModeTab = function(mode) {
    if(state.focus.running) return; // can't switch while running
    state.focus.mode = mode;
    document.querySelectorAll('.fmt-tab').forEach(t=>t.classList.remove('active'));
    const tabMap = {work:'fmt-focus', break:'fmt-short', longbreak:'fmt-long'};
    const tab = document.getElementById(tabMap[mode]);
    if(tab) tab.classList.add('active');
    resetFocusUI();
    _setFocusBgMode(mode);
};

// ══════════════════════════════════════════════════════
// PER-TASK/CHAPTER TIMER  (independent countdown clocks)
// Each linked item has its own accumulated seconds stored in:
//   state.focus.taskAccSecs   — seconds credited to current task
//   state.focus.chapterAccSecs — seconds credited to current chapter
//   state.focus.taskSegStart  — Date.now() when current task segment began
//   state.focus.chapterSegStart — Date.now() when current chapter segment began
// ══════════════════════════════════════════════════════

function _fmtSecs(s) {
    s = Math.round(s);
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    if(h) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
}

// Elapsed time since a segment-start timestamp, clamped to a sane ceiling.
// A per-item (task/chapter) segment is only ever "live" while a work session
// is running, so it can never legitimately exceed that session's configured
// length. Without this clamp, a device sleeping/tab being suspended while a
// session was left running would show that entire real-world gap as elapsed
// focus time the moment it woke up (e.g. "12:06:11" on a 25‑minute session).
function _focusClampedElapsedSecs(startTs) {
    if(!startTs) return 0;
    const raw = (Date.now() - startTs) / 1000;
    const capSecs = ((Number(state.focus && state.focus.workM) || 25) * 60) + 120;
    return Math.max(0, Math.min(raw, capSecs));
}

// Start per-item segment timers (called when task/chapter locked OR session resumes)
function _focusItemSegmentsStart() {
    const now = Date.now();
    if(state.focus.activeTaskId || (state.focus.activeTaskTitle && state.focus.activeTaskTitle !== 'General Focus')) {
        if(!state.focus.taskSegStart) state.focus.taskSegStart = now;
    }
    if(state.focus.activeChapter) {
        if(!state.focus.chapterSegStart) state.focus.chapterSegStart = now;
    }
}

// Pause / snapshot per-item segment timers (called before switching or pausing)
function _focusItemSegmentsPause() {
    const now = Date.now();
    if(state.focus.taskSegStart) {
        const elapsed = _focusClampedElapsedSecs(state.focus.taskSegStart);
        state.focus.taskAccSecs = (state.focus.taskAccSecs || 0) + elapsed;
        delete state.focus.taskSegStart;
    }
    if(state.focus.chapterSegStart) {
        const elapsed = _focusClampedElapsedSecs(state.focus.chapterSegStart);
        state.focus.chapterAccSecs = (state.focus.chapterAccSecs || 0) + elapsed;
        delete state.focus.chapterSegStart;
    }
}

// Reset the per-item display accumulators (badge timers). Actual crediting to
// the task/chapter's stored focus time is handled exclusively by the
// segment-based system (_focusFinalizeActiveSegment / _focusCreditFocusMinutes),
// which the caller (e.g. _focusAbort) already runs before this. Crediting here
// too used to double-count every abort/switch into the task's total focus time.
function _focusItemSegmentsFlush(reason) {
    _focusItemSegmentsPause();
    state.focus.taskAccSecs = 0;
    state.focus.chapterAccSecs = 0;
}

// Render per-item timers into badges every tick
function _focusItemBadgesTick() {
    const now = Date.now();
    // Task timer
    const taskBadge = document.getElementById('focus-task-badge');
    const taskTimerEl = document.getElementById('focus-task-timer-display');
    const taskOngoing = document.getElementById('focus-task-ongoing');
    const hasTask = !!(state.focus.activeTaskId || (state.focus.activeTaskTitle && state.focus.activeTaskTitle !== 'General Focus'));
    if(taskBadge) taskBadge.style.display = hasTask ? 'flex' : 'none';
    if(hasTask && taskTimerEl) {
        let secs = (state.focus.taskAccSecs || 0);
        if(state.focus.taskSegStart && state.focus.running && state.focus.mode === 'work') {
            secs += _focusClampedElapsedSecs(state.focus.taskSegStart);
        }
        taskTimerEl.textContent = _fmtSecs(secs);
    }
    if(taskOngoing) taskOngoing.style.display = (state.focus.running && state.focus.mode === 'work' && state.focus.taskSegStart) ? 'inline-block' : 'none';

    // Chapter timer
    const chapBadge = document.getElementById('focus-chapter-badge');
    const chapTimerEl = document.getElementById('focus-chapter-timer-display');
    const chapOngoing = document.getElementById('focus-chapter-ongoing');
    const hasChap = !!state.focus.activeChapter;
    if(chapBadge) chapBadge.style.display = hasChap ? 'flex' : 'none';
    if(hasChap && chapTimerEl) {
        let secs = (state.focus.chapterAccSecs || 0);
        if(state.focus.chapterSegStart && state.focus.running && state.focus.mode === 'work') {
            secs += _focusClampedElapsedSecs(state.focus.chapterSegStart);
        }
        chapTimerEl.textContent = _fmtSecs(secs);
    }
    if(chapOngoing) chapOngoing.style.display = (state.focus.running && state.focus.mode === 'work' && state.focus.chapterSegStart) ? 'inline-block' : 'none';

    // Chapter badge text
    const chapTextEl = document.getElementById('focus-chapter-badge-text');
    if(chapTextEl && hasChap) chapTextEl.textContent = _focusChapterLabel(state.focus.activeChapter) || state.focus.activeChapter;
}

// ── Task Popup ──
// _ftpMode = 'task' | 'chapter' — which slot the popup is filling
let _ftpMode = 'task';

window.openFocusTaskPopup = function(mode) {
    _ftpMode = mode || 'task';
    const p = document.getElementById('focus-task-popup');
    if(!p) return;
    const titleEl = document.getElementById('ftp-popup-title');
    if(titleEl) titleEl.textContent = _ftpMode === 'chapter' ? 'Add Chapter to Focus' : 'Add Task to Focus';
    p.style.display = 'block';
    window.populateAllSubjectDropdowns && window.populateAllSubjectDropdowns();
    // Auto-open correct tab
    if(_ftpMode === 'chapter') {
        window.ftpSwitchTab('chapter', document.getElementById('ftp-tab-chapter'));
        _syncFocusChapterSelect();
    } else {
        window.ftpSwitchTab('task', document.getElementById('ftp-tab-task'));
        _renderFtpTaskList();
    }
    _renderFtpCurrentTarget();
};
window.ftpSwitchTab = function(tab, btn) {
    ['task','chapter','custom'].forEach(t=>{
        const pane = document.getElementById(`ftp-pane-${t}`);
        if(pane) pane.style.display = t===tab ? 'block' : 'none';
    });
    document.querySelectorAll('.ftp-tab').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    if(tab==='task') _renderFtpTaskList();
    if(tab==='chapter') _syncFocusChapterSelect();
};
function _syncFocusChapterSelect() {
    const subSel = document.getElementById('f-chapter-subject-select');
    const chSel = document.getElementById('f-chapter-select');
    if(!subSel || !chSel) return;
    const active = state.focus.activeChapter || '';
    if(active && active.indexOf('::') !== -1) {
        subSel.value = active.split('::')[0];
        window.updateChapterList && window.updateChapterList();
        chSel.value = active;
        updateChapterFocusDisplay();
        return;
    }
    if(!subSel.value) {
        const keys = Object.keys(window.ch_SUBJECTS || {});
        if(keys.length) subSel.value = keys[0];
    }
    window.updateChapterList && window.updateChapterList();
}
function _renderFtpTaskList() {
    const list = document.getElementById('ftp-task-list');
    if(!list) return;
    const tasks = (window.nx2FocusTasks ? window.nx2FocusTasks() : []);
    if(!tasks.length) { list.innerHTML='<div style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.8rem;padding:20px;">No Nexus tasks for today</div>'; return; }
    list.innerHTML = tasks.map((t)=>{
        const id = String(t.id);
        const isActive = id === String(state.focus.activeTaskId || '');
        return `
        <div class="ftp-task-item${isActive?' ftp-task-item-active':''}" data-task-title="${escapeAttr(t.title)}" data-task-id="${escapeAttr(id)}" onclick="window.ftpSelectTaskFromNode(this)">
            <i class="ph ph-circle" style="color:rgba(255,255,255,0.3)"></i>
            ${escapeHTML(t.title)}
            ${isActive ? '<span style="font-size:0.62rem;color:#34d399;margin-left:auto;">● Linked</span>' : '<span style="font-size:0.62rem;color:rgba(255,255,255,0.3);margin-left:auto;">Add to Focus →</span>'}
        </div>`;
    }).join('');
}
window.ftpSelectTaskFromNode = function(node) {
    if(!node) return;
    window.ftpSelectTask(node.dataset.taskTitle || '', node.dataset.taskId || '');
};
window.ftpSelectTask = function(title, id) {
    // Pause previous task segment, flush time to it
    if(state.focus.activeTaskId && state.focus.activeTaskId !== id) {
        // Snapshot old task time before switching
        if(state.focus.taskSegStart) {
            const elapsed = _focusClampedElapsedSecs(state.focus.taskSegStart);
            state.focus.taskAccSecs = (state.focus.taskAccSecs || 0) + elapsed;
            delete state.focus.taskSegStart;
            // NOTE: do NOT credit here — _focusApplyTarget() below already finalizes
            // and credits the outgoing segment via the segment-based timer. Crediting
            // here too was double-counting every task switch into the task's total
            // focus time (taskAccSecs is display-only for the "this session" badge).
            state.focus.taskAccSecs = 0;
        }
    }
    _focusApplyTarget({ taskTitle: title, taskId: id });
    // Resume new task segment immediately if session running
    if(state.focus.running && state.focus.mode === 'work') {
        state.focus.taskSegStart = Date.now();
    }
    document.getElementById('focus-task-popup').style.display='none';
    _focusItemBadgesTick();
};
window.ftpConfirmChapter = function() {
    const ch = document.getElementById('f-chapter-select');
    if(!ch || !ch.value) { document.getElementById('focus-task-popup').style.display='none'; return; }
    const newChap = ch.value;
    // Flush old chapter time if switching
    if(state.focus.activeChapter && state.focus.activeChapter !== newChap) {
        if(state.focus.chapterSegStart) {
            const elapsed = _focusClampedElapsedSecs(state.focus.chapterSegStart);
            state.focus.chapterAccSecs = (state.focus.chapterAccSecs || 0) + elapsed;
            delete state.focus.chapterSegStart;
            // NOTE: crediting happens via _focusApplyTarget()'s segment finalize below —
            // see the matching note in ftpSelectTask.
            state.focus.chapterAccSecs = 0;
        }
    }
    _focusApplyTarget({ chapter: newChap });
    // Resume chapter segment if session running
    if(state.focus.running && state.focus.mode === 'work') {
        state.focus.chapterSegStart = Date.now();
    }
    document.getElementById('focus-task-popup').style.display='none';
    _focusItemBadgesTick();
};
window.ftpConfirmCustom = function() {
    const inp = document.getElementById('ftp-custom-input');
    if(!inp || !inp.value.trim()) return;
    _focusApplyTarget({ taskTitle:inp.value.trim(), taskId:'' });
    if(state.focus.running && state.focus.mode === 'work') {
        state.focus.taskSegStart = Date.now();
    }
    document.getElementById('focus-task-popup').style.display='none';
    _focusItemBadgesTick();
};

// Remove a linked item
window.focusRemoveLinked = function(type) {
    if(type === 'task') {
        // Flush task time first
        if(state.focus.taskSegStart) {
            const elapsed = _focusClampedElapsedSecs(state.focus.taskSegStart);
            state.focus.taskAccSecs = (state.focus.taskAccSecs || 0) + elapsed;
            delete state.focus.taskSegStart;
            // Credited via _focusApplyTarget()'s segment finalize below — see note in ftpSelectTask.
            state.focus.taskAccSecs = 0;
        }
        _focusApplyTarget({ taskTitle:'', taskId:'' });
    } else {
        // Flush chapter time
        if(state.focus.chapterSegStart) {
            const elapsed = _focusClampedElapsedSecs(state.focus.chapterSegStart);
            state.focus.chapterAccSecs = (state.focus.chapterAccSecs || 0) + elapsed;
            delete state.focus.chapterSegStart;
            // Credited via _focusApplyTarget()'s segment finalize below — see note in ftpSelectTask.
            state.focus.chapterAccSecs = 0;
        }
        _focusApplyTarget({ chapter:'' });
    }
    _focusItemBadgesTick();
};

function _setFocusTaskBadge(text) {
    // Legacy compat — kept for other callers
    const whatBtn = document.getElementById('focus-what-text');
    if(whatBtn) whatBtn.textContent = text || 'What do you want to focus on?';
    const whatBtnEl = document.getElementById('focus-what-btn');
    if(whatBtnEl) { if(text) whatBtnEl.classList.add('has-task'); else whatBtnEl.classList.remove('has-task'); }
    _focusItemBadgesTick();
}

// Change task/chapter mid-session via pencil button
window.focusChangeTask = function(type) {
    // Pause the item segment (don't flush — just snapshot, keep accumulating after new selection)
    if(type === 'chapter') {
        if(state.focus.chapterSegStart) {
            const elapsed = _focusClampedElapsedSecs(state.focus.chapterSegStart);
            state.focus.chapterAccSecs = (state.focus.chapterAccSecs || 0) + elapsed;
            delete state.focus.chapterSegStart;
        }
        window.openFocusTaskPopup('chapter');
    } else {
        if(state.focus.taskSegStart) {
            const elapsed = _focusClampedElapsedSecs(state.focus.taskSegStart);
            state.focus.taskAccSecs = (state.focus.taskAccSecs || 0) + elapsed;
            delete state.focus.taskSegStart;
        }
        window.openFocusTaskPopup('task');
    }
};

// Populate boot state into new inputs
function _focusBootNewUI() {
    const wi = document.getElementById('f-work-in'), bi = document.getElementById('f-break-in');
    const li = document.getElementById('f-longbreak-in'), ri = document.getElementById('f-reps-in'), ti = document.getElementById('f-target-in');
    if(wi) wi.value = state.focus.workM || 25;
    if(bi) bi.value = state.focus.breakM || 5;
    if(li) li.value = state.focus.longBreakM || 15;
    if(ri) ri.value = state.focus.reps || 4;
    if(ti) ti.value = state.focus.dailyTarget || 60;
    _renderFspCycleVisual();
    _updateFocusRepDots();
    _updateFocusToggleBtn();
    if(state.focus.activeTaskTitle || state.focus.activeChapter) _focusRefreshCurrentTarget();
    if(state.focus.running) {
        _setFocusBgMode(state.focus.mode);
        _focusStartSegment();
    }
    updateFocusUI();
    _focusItemBadgesTick();
}

window.bootSystem = async function bootSystem() {
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
    const yrSelect = document.getElementById('trk-year-select');
    const nexusYr = document.getElementById('nexus-year-select');
    if(yrSelect) yrSelect.value = new Date().getFullYear();
    if(nexusYr) nexusYr.value = new Date().getFullYear();

    // Always keep a local recovery snapshot. It is only promoted to cloud when
    // it belongs to this account (or the account has no cloud data yet).
    let _localBackup = null;
    try {
        const raw = localStorage.getItem('astraea2_local_backup');
        if(raw) _localBackup = JSON.parse(raw);
    } catch(e) { console.warn('Local backup read failed:', e); }

    const uid = window._fbUid, db = window._fbDb, fns = window._fbFns;

    if(uid && uid !== 'guest' && db && fns) {
        const readDoc = async (path) => {
            try {
                const snap = await _getDocFresh(fns, fns.doc(db, ...path));
                return { ok:true, snap };
            } catch(e) {
                console.warn('Firestore section read failed:', path.join('/'), e);
                return { ok:false, snap:null, error:e };
            }
        };

        // IMPORTANT: one broken/denied/oversized section must never hide the
        // other sections. The old Promise.all() aborted the entire boot.
        const sections = await Promise.all([
            readDoc(['users2',uid,'appdata','main']),
            readDoc(['users2',uid,'appdata','diary']),
            readDoc(['users2',uid,'appdata','nexus']),
            readDoc(['users2',uid,'appdata','tracker']),
            readDoc(['users2',uid,'appdata','alarms'])
        ]);

        const mainSnap = sections[0].snap;
        const diarySnap = sections[1].snap;
        const nexusSnap = sections[2].snap;
        const trackerSnap = sections[3].snap;
        const alarmsSnap = sections[4].snap;

        const mainData = mainSnap && mainSnap.exists() ? mainSnap.data() : null;
        const diaryData = diarySnap && diarySnap.exists() ? diarySnap.data() : null;
        const nexusData = nexusSnap && nexusSnap.exists() ? nexusSnap.data() : null;
        const trackerData = trackerSnap && trackerSnap.exists() ? trackerSnap.data() : null;
        const alarmsData = alarmsSnap && alarmsSnap.exists() ? alarmsSnap.data() : null;

        const latestCloudUpdatedAt = Math.max(
            Number((mainData||{}).updatedAt)||0,
            Number((diaryData||{}).updatedAt)||0,
            Number((nexusData||{}).updatedAt)||0,
            Number((trackerData||{}).updatedAt)||0,
            Number((alarmsData||{}).updatedAt)||0
        );

        const cloudExists = !!(mainData || diaryData || nexusData || trackerData || alarmsData);
        const backupIsMine = _localBackup &&
            (!_localBackup.ownerUid || _localBackup.ownerUid === 'guest' || _localBackup.ownerUid === uid);
        const accountIsFresh = !cloudExists;

        // Recover a newer local snapshot instead of overwriting it with an
        // older Firestore copy.
        if(_localBackup && (backupIsMine || accountIsFresh) &&
           ((_localBackup.updatedAt||0) > latestCloudUpdatedAt || !cloudExists)) {
            if(_localBackup.identity) {
                if(_localBackup.identity.callsign) userContext.username = _localBackup.identity.callsign;
                if(_localBackup.identity.avatar) userContext.avatarUrl = _localBackup.identity.avatar;
                if(_localBackup.identity.email) userContext.email = _localBackup.identity.email;
            }
            if(_localBackup.core) state = { ...state, ..._localBackup.core };
            if(_localBackup.nexus) gg_db = _localBackup.nexus;
            if(_localBackup.tracker) {
                if(_localBackup.tracker.weekly) trk_weeklyTaskNames = _localBackup.tracker.weekly;
                if(_localBackup.tracker.sunday) trk_sundayTaskNames = _localBackup.tracker.sunday;
                if(_localBackup.tracker.data) trk_data = _localBackup.tracker.data;
            }
            if(Array.isArray(_localBackup.alarms)) alarms_db = _localBackup.alarms;
            if(_localBackup.chapters) window.ch_db = _localBackup.chapters;
            if(_localBackup.testHistory) {
                try { localStorage.setItem(`atest2_hist_${uid}`, JSON.stringify(_localBackup.testHistory)); } catch(e){}
            }
            triggerSave();
        }

        // Legacy v1/v2/v3/v4 single-document format.
        if(mainData && !mainData.splitFormat &&
           (mainData.core || mainData.nexus || mainData.tracker || mainData.alarms)) {
            const p = mainData;
            if(p.identity) {
                if(p.identity.callsign) userContext.username = p.identity.callsign;
                if(p.identity.avatar) userContext.avatarUrl = p.identity.avatar;
                if(p.identity.email) userContext.email = p.identity.email;
            }
            if(p.core) state = { ...state, ...p.core };
            if(p.nexus) gg_db = p.nexus;
            if(p.nexusV2 && typeof p.nexusV2 === 'object') state.nexusV2 = p.nexusV2;
            if(p.tracker) {
                if(p.tracker.weekly) trk_weeklyTaskNames = p.tracker.weekly;
                if(p.tracker.sunday) trk_sundayTaskNames = p.tracker.sunday;
                if(p.tracker.data) trk_data = p.tracker.data;
            }
            if(Array.isArray(p.alarms)) alarms_db = p.alarms;
            if(p.chapters) window._loadedChaptersFromFS = p.chapters;
            const dot=document.getElementById('sync-dot'), txt=document.getElementById('sync-text');
            if(dot){ dot.className='status-dot online'; if(txt) txt.innerText='CLOUD LOADED'; }
            triggerSave(); // migrate legacy data into split documents
        } else if(mainData) {
            // Current split format.
            if(mainData.identity) {
                if(mainData.identity.callsign) userContext.username = mainData.identity.callsign;
                if(mainData.identity.avatar) userContext.avatarUrl = mainData.identity.avatar;
                if(mainData.identity.email) userContext.email = mainData.identity.email;
            }
            if(mainData.core) state = { ...state, ...mainData.core };

            if(diaryData) {
                if(diaryData.vault) {
                    state.settings = state.settings || {};
                    state.settings.diaryVaultEnabled = true;
                    state.settings.diaryVault = diaryData.vault;
                    state.diary = [];
                } else if(Array.isArray(diaryData.diary)) state.diary = diaryData.diary;
            }
            if(nexusData) {
                if(nexusData.nexus) gg_db = nexusData.nexus;
                if(nexusData.nexusV2 && typeof nexusData.nexusV2 === 'object') state.nexusV2 = nexusData.nexusV2;
            }
            if(trackerData && trackerData.tracker) {
                const t = trackerData.tracker;
                if(t.weekly) trk_weeklyTaskNames = t.weekly;
                if(t.sunday) trk_sundayTaskNames = t.sunday;
                if(t.data) trk_data = t.data;
            }
            if(alarmsData && Array.isArray(alarmsData.alarms)) alarms_db = alarmsData.alarms;

            const dot=document.getElementById('sync-dot'), txt=document.getElementById('sync-text');
            if(dot){ dot.className='status-dot online'; if(txt) txt.innerText='CLOUD LOADED'; }
        } else if(!cloudExists && _localBackup && backupIsMine) {
            // No cloud documents and a matching local snapshot: keep it.
            if(_localBackup.core) state = { ...state, ..._localBackup.core };
            if(_localBackup.nexus) gg_db = _localBackup.nexus;
            if(_localBackup.tracker) {
                if(_localBackup.tracker.weekly) trk_weeklyTaskNames = _localBackup.tracker.weekly;
                if(_localBackup.tracker.sunday) trk_sundayTaskNames = _localBackup.tracker.sunday;
                if(_localBackup.data) Object.assign(window, _localBackup.data);
            }
            if(Array.isArray(_localBackup.alarms)) alarms_db = _localBackup.alarms;
            triggerSave();
        }

        // Test history has historically lived in its own collection.
        // Load it during every normal boot so another device sees it too.
        try {
            const testSnap = await fns.getDocs(fns.collection(db,'users2',uid,'astratest'));
            if(testSnap && !testSnap.empty) {
                const cloudTests = [];
                testSnap.forEach(d => {
                    const v = d.data();
                    if(v) cloudTests.push(v);
                });
                const localKey = `atest2_hist_${uid}`;
                let localTests = [];
                try { localTests = JSON.parse(localStorage.getItem(localKey)||'[]'); } catch(e){}
                const merged = [...cloudTests];
                localTests.forEach(t => {
                    if(t && !merged.some(x => String(x.id)===String(t.id))) merged.push(t);
                });
                merged.sort((a,b)=>(Number(b.id)||0)-(Number(a.id)||0));
                localStorage.setItem(localKey, JSON.stringify(merged.slice(0,100)));
            }
        } catch(e) { console.warn('Test history cloud load failed:', e); }
    }

    setupProfileUI();
    if(!state.focus) state.focus={staminaPoints:30,dayStreak:0,lastStreakDate:'',dailyTarget:60,todayMins:0,time:1500,running:false,mode:'work',workM:25,breakM:5,reps:4,currentRep:1,total:0,sessions:0,logs:[],lastTrackedDate:getLocalIsoDate(new Date()),targetMetToday:false,lastMonthChecked:''};
    if(state.focus.dayStreak===undefined)state.focus.dayStreak=0;
    if(!state.sw) state.sw={elapsed:0,running:false,lastStart:0,marker:0,logs:[]};
    if(!state.doubts) state.doubts=[];
    if(!state.events) state.events=[];
    if(!state.settings) state.settings={accent:'#4f6ef7',theme:'dark',strictMode:false,volAmbient:0.5,volAlert:0.7,diaryPin:'',tourCompleted:false};
    if(!state.diary) state.diary=[];
    if(!state.focus.staminaPoints) state.focus.staminaPoints=30;
    if(!state.focus.logs) state.focus.logs=[];
    if(!state.focus.lastMonthChecked) state.focus.lastMonthChecked='';
    if(state.sw&&state.sw.logs) state.sw.logs=state.sw.logs.filter(l=>l.type!=='other');
    if(state.focus.running) document.getElementById('f-toggle').innerHTML="<i class='ph ph-pause'></i> Pause";
    if(state.sw.running) { document.getElementById('sw-toggle').innerHTML="<i class='ph ph-pause'></i> Pause"; }
    else { document.getElementById('sw-display').textContent=formatStopwatchFull(state.sw.elapsed); }
    applySettings();
    evaluateDailyStreak();
    processRecurringTasks();
    _cleanupDuplicateCarriedTasks();
    window.nxAdvanceCarries && window.nxAdvanceCarries();
    initCoreUI();
    // Old Nexus engine was removed; NexusV2 renders itself when its tab opens.
    window.updateHomeStats();
    updateFocusStatsGrid();
    updateNexusTaskSelector();
    // Init new focus UI
    _focusBootNewUI();
    // Restore focus session state
    if(state.focus.running){
        lockFocusInputs(true);
    }
    const dd = document.getElementById('diary-date');
    if (dd) dd.value = getLocalIsoDate(new Date());
    populateDiarySelects();
    if(!state.settings.tourCompleted && !userContext.isGuest) {
        setTimeout(() => { window.startTour(); state.settings.tourCompleted = true; triggerSave(); }, 1500);
    }
    setTimeout(function(){ window.ch_init && window.ch_init(); }, 800);
    setTimeout(function(){ window.populateAllSubjectDropdowns && window.populateAllSubjectDropdowns(); }, 900);
    // Init quote
    // Init alarms
    alarmsLoad();
    renderAlarms();
    updateHomeNextAlarm();
    checkAlarms(); // check immediately on load
    updateJEECountdown();
    updateHomePieChart();
    // Check alarms every 10 seconds — tight enough to never miss a minute even in background
    if(_alarmCheckInterval) clearInterval(_alarmCheckInterval);
    _alarmCheckInterval = setInterval(function(){
        checkAlarms();
        updateHomeNextAlarm();
        updateJEECountdown();
    }, 10000);
    // Request notification permission so alarms fire in background tabs
    if('Notification' in window && Notification.permission === 'default') {
        setTimeout(()=>{ Notification.requestPermission(); }, 3000);
    }
}

function initCoreUI() {
    renderLogs();
    const fw=document.getElementById('f-work-in'), fb=document.getElementById('f-break-in'), fr=document.getElementById('f-reps-in'), ft=document.getElementById('f-target-in');
    if(fw) fw.value=state.focus.workM;
    if(fb) fb.value=state.focus.breakM;
    if(fr) fr.value=state.focus.reps;
    if(ft) ft.value=state.focus.dailyTarget;
    const dd=document.getElementById('doubt-date'); if(dd) dd.value=getLocalIsoDate(new Date());
    window.renderDoubts();
    if(!state.focus.running) resetFocusUI();
    updateFocusUI();
}

// ============================================================
// GUIDED TOUR
// ============================================================
const tourSteps=[
    {target:'.nav-link[data-tab="home"]',title:'System Status',desc:'Your mission command center. Tracks productive time, stamina, and today\'s tasks at a glance.'},
    {target:'.nav-link[data-tab="summary"]',title:'Day Summary',desc:'Full detailed summaries including your Incomplete & Failed Missions card. Jump between timeframes and export data.'},
    {target:'.nav-link[data-tab="diary"]',title:'Personal Diary',desc:'Log your daily thoughts, mistakes, and wins here. Secured with a PIN.'},
    {target:'.nav-link[data-tab="focus"]',title:'Deep Focus',desc:'The Pomodoro engine. Lock inputs before starting, set Strict Mode to block tab-switching, and control audio volume.'},
    {target:'.nav-link[data-tab="missions"]',title:'Nexus Control',desc:'3-state tasks: click once → ✅ Done (green), click again → ❌ Failed (red), click again → reset. Double-click card to delete.'},
    {target:'.nav-link[data-tab="doubts"]',title:'Doubt Diary',desc:'Log every Physics/Chemistry/Math doubt. Write the resolution once cleared.'},
    {target:'.nav-link[data-tab="tracker"]',title:'Strategic Timeline',desc:'Your year-long habit tracker. Click headers to rename habits. Track 10 daily + 10 Sunday habits per week.'},
    {target:'.top-bar',title:'Your Profile',desc:'Click your avatar to view stats, export data, or update your identity. You\'re all set, Operator!'}
];
window.startTour=function(){tourStep=0;document.getElementById('tour-overlay').classList.add('active');renderTourStep();};
window.closeTour=function(){document.getElementById('tour-overlay').classList.remove('active');};
window.tourNext=function(){if(tourStep<tourSteps.length-1){tourStep++;renderTourStep();}else{window.closeTour();}};
window.tourPrev=function(){if(tourStep>0){tourStep--;renderTourStep();}};
let tourStep = 0;
function renderTourStep(){
    const step=tourSteps[tourStep];
    const el=document.querySelector(step.target);
    const overlay=document.getElementById('tour-overlay');
    const spotlight=document.getElementById('tour-spotlight');
    const box=document.getElementById('tour-box');
    document.getElementById('tour-title').textContent=step.title;
    document.getElementById('tour-desc').textContent=step.desc;
    document.getElementById('tour-progress').textContent=`Step ${tourStep+1} of ${tourSteps.length}`;
    document.getElementById('tour-prev').style.display=tourStep===0?'none':'flex';
    document.getElementById('tour-next').textContent=tourStep===tourSteps.length-1?'Finish ✓':'Next →';
    if(el){
        const r=el.getBoundingClientRect();
        spotlight.style.top=(r.top-8)+'px';spotlight.style.left=(r.left-8)+'px';spotlight.style.width=(r.width+16)+'px';spotlight.style.height=(r.height+16)+'px';
        const bw=320,bh=180;
        let bx=r.right+20,by=r.top;
        if(bx+bw>window.innerWidth)bx=r.left-bw-20;
        if(by+bh>window.innerHeight)by=window.innerHeight-bh-20;
        box.style.left=Math.max(10,bx)+'px';box.style.top=Math.max(10,by)+'px';
    }
    overlay.style.pointerEvents='all';
}

// ============================================================
// JEE STRATEGIC ROADMAP
// ============================================================
window.renderJeeRoadmap = function() {
    const today = new Date();
    const jeeDate = new Date('2028-01-20');
    const startDate = new Date('2025-01-01');
    const totalDays = Math.round((jeeDate - startDate) / 86400000);
    const daysLeft = Math.max(0, Math.round((jeeDate - today) / 86400000));
    const daysElapsed = totalDays - daysLeft;
    const overallPct = Math.min(100, Math.round((daysElapsed / totalDays) * 100));

    const daysLeftEl = document.getElementById('jee-days-left');
    const pctEl = document.getElementById('jee-overall-pct');
    const masterBar = document.getElementById('jee-master-bar');
    const grid = document.getElementById('jee-phases-grid');
    if(!grid) return;

    if(daysLeftEl) daysLeftEl.textContent = daysLeft;
    if(pctEl) pctEl.textContent = overallPct + '%';
    if(masterBar) masterBar.style.width = overallPct + '%';

    const phases = [
        { name:'Foundation', icon:'🏗', start:'2025-01-01', end:'2025-06-30', color:'#4f6ef7', desc:'Basics — NCERT mastery, concept clarity' },
        { name:'Intermediate', icon:'⚡', start:'2025-07-01', end:'2025-12-31', color:'#9333ea', desc:'Module practice, formula drilling, PYQs' },
        { name:'Intensive', icon:'🔥', start:'2026-01-01', end:'2026-12-31', color:'#f97316', desc:'Full syllabus revision, mock tests' },
        { name:'Advanced Drill', icon:'🎯', start:'2027-01-01', end:'2027-09-30', color:'#ef4444', desc:'Weak topic annihilation, speed drills' },
        { name:'Mock Wars', icon:'🧪', start:'2027-10-01', end:'2027-12-31', color:'#fbbf24', desc:'Daily full mocks, detailed analysis' },
        { name:'Final Assault', icon:'🚀', start:'2028-01-01', end:'2028-01-20', color:'#10b981', desc:'Revision only, confidence build, rest' },
    ];

    grid.innerHTML = phases.map(p => {
        const pStart = new Date(p.start);
        const pEnd = new Date(p.end);
        const pTotal = Math.round((pEnd - pStart) / 86400000);
        let status, pct, statusLabel;
        if(today < pStart) {
            status='upcoming'; pct=0; statusLabel='Upcoming';
        } else if(today > pEnd) {
            status='done'; pct=100; statusLabel='Complete ✓';
        } else {
            status='active';
            pct = Math.min(100, Math.round(((today - pStart) / 86400000 / pTotal)*100));
            statusLabel='In Progress';
        }
        const borderStyle = status==='active' ? `border:2px solid ${p.color};box-shadow:0 0 18px ${p.color}33;` : 'border:1px solid var(--border-bright);';
        return `<div style="background:var(--surface);${borderStyle}border-radius:var(--radius-sm);padding:18px;position:relative;overflow:hidden;transition:transform 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform=''">
            <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${p.color};width:${pct}%;transition:width 0.8s;"></div>
            <div style="font-size:1.5rem;margin-bottom:8px;">${p.icon}</div>
            <div style="font-family:var(--font-display);font-size:1.05rem;letter-spacing:0.08em;color:var(--text);margin-bottom:4px;">${p.name.toUpperCase()}</div>
            <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:10px;">${p.desc}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:0.62rem;font-weight:700;color:${p.color};text-transform:uppercase;letter-spacing:0.08em;">${statusLabel}</span>
                <span style="font-family:var(--font-display);font-size:1.1rem;color:${p.color};">${pct}%</span>
            </div>
            <div style="height:3px;background:var(--border);border-radius:99px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${p.color};border-radius:99px;transition:width 0.8s;"></div>
            </div>
            <div style="font-size:0.58rem;color:var(--text-dim);margin-top:8px;">${p.start} → ${p.end}</div>
        </div>`;
    }).join('');
};

// ============================================================
// ASTRA TEST ENGINE
// ============================================================
window.AT = (function() {
    'use strict';
    const LTR = ['A','B','C','D','E'];
    let ED=null, curSI=0, curQI=0, uAns={}, qStat={}, qTime={}, qAnnotations={}, timerIv=null, qStart=null, tLeft=0, done=false, RES=null, solSIcur=0, solSecCur='', solFilt='all';

    function p2(n){return String(n).padStart(2,'0');}

    function showAtPage(id) {
        const fixed=['at-pg-exam','at-pg-result','at-pg-sol'];
        const normal=['at-pg-land','at-pg-hist','at-pg-review','at-pg-mistakes','at-pg-notes'];
        [...fixed,...normal].forEach(pid=>{
            const el=document.getElementById(pid);
            if(el){el.style.display='none'; el.style.visibility='visible';}
        });
        if(fixed.includes(id)){
            const el=document.getElementById(id);
            if(el){el.style.display='flex'; el.style.visibility='visible';}
        } else {
            const el=document.getElementById(id);
            if(el){el.style.display='block'; el.style.visibility='visible';}
        }
        if(id==='at-pg-land') loadLandStats();
        if(id==='at-pg-hist') buildHistPage();
        if(id==='at-pg-notes') buildNotesPage();
    }

    function loadLandStats(){
        const h=getHist();
        const e=document.getElementById('at-st-tests');
        if(e)e.textContent=h.length;
        const eb=document.getElementById('at-st-best');
        const ea=document.getElementById('at-st-acc');
        const ep=document.getElementById('at-st-best-pct');
        if(h.length){
            if(eb)eb.textContent=Math.max(...h.map(x=>x.score));
            if(ea)ea.textContent=Math.round(h.reduce((a,x)=>a+x.acc,0)/h.length)+'%';
            if(ep)ep.textContent=Math.max(...h.map(x=>x.pct||0))+'%';
        }
        const sk=JSON.parse(localStorage.getItem('atest_sk')||'{"c":0,"d":""}');
        const td=new Date().toDateString();
        const esk=document.getElementById('at-st-streak');
        if(esk)esk.textContent=(sk.d===td?sk.c:sk.d===new Date(Date.now()-86400000).toDateString()?sk.c:0)+'🔥';
        _drawLandChart(h);
    }
    let _landChart=null;
    function _drawLandChart(h){
        const canvas=document.getElementById('at-land-chart');
        const noData=document.getElementById('at-land-no-data');
        if(!canvas)return;
        if(!h.length){canvas.style.display='none';if(noData)noData.style.display='block';return;}
        canvas.style.display='block';if(noData)noData.style.display='none';
        if(_landChart){_landChart.destroy();_landChart=null;}
        const labels=h.slice(0,10).reverse().map(x=>x.examName+' '+x.year);
        const scores=h.slice(0,10).reverse().map(x=>x.score);
        const maxes=h.slice(0,10).reverse().map(x=>x.max);
        _landChart=new Chart(canvas,{type:'line',data:{labels,datasets:[
            {label:'Score',data:scores,borderColor:'#4f6ef7',backgroundColor:'rgba(79,110,247,0.12)',tension:0.4,fill:true,pointBackgroundColor:'#4f6ef7',pointRadius:4},
            {label:'Max',data:maxes,borderColor:'rgba(255,255,255,0.15)',borderDash:[4,4],tension:0,fill:false,pointRadius:0}
        ]},options:{responsive:true,plugins:{legend:{labels:{color:'rgba(255,255,255,0.5)',font:{size:10}}}},scales:{x:{ticks:{color:'rgba(255,255,255,0.4)',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}},y:{ticks:{color:'rgba(255,255,255,0.4)',font:{size:10}},grid:{color:'rgba(255,255,255,0.07)'}}}}});
    }

    function handleDrop(e){const f=e.dataTransfer.files[0];if(f)handleFile(f);}
    function handleFile(f){
        if(!f)return;
        const n=f.name.toLowerCase();
        if(!n.endsWith('.astrotest')&&!n.endsWith('.json')){showErr('Unsupported file. Please upload a .astrotest or .json file.');return;}
        const pb=document.getElementById('at-progBox'),pf=document.getElementById('at-progFill'),pt=document.getElementById('at-progText');
        if(pb)pb.style.display='block';
        const steps=[[10,'Reading file...'],[30,'Parsing JSON...'],[60,'Validating structure...'],[80,'Extracting questions...'],[100,'Loading exam engine...']];
        let si=0;
        const go=()=>{if(si<steps.length){if(pf)pf.style.width=steps[si][0]+'%';if(pt)pt.textContent=steps[si][1];si++;setTimeout(go,220);}};go();
        const r=new FileReader();
        r.onload=ev=>{setTimeout(()=>{
            try{
                const d=JSON.parse(ev.target.result);
                const validation = validateTestFile(d);
                if (!validation.ok) {
                    if(pb) pb.style.display = 'none';
                    const errorMsg = 'Invalid test file format. Issues found:\n\n' + validation.errors.map(e => `• ${e}`).join('\n');
                    showErr(errorMsg);
                    return;
                }
                if (validation.warnings && validation.warnings.length) {
                    console.warn('AstraTest import warnings ('+validation.warnings.length+'):\n'+validation.warnings.map(w=>'• '+w).join('\n'));
                }
                normalizeTestData(d);
                ED=d;if(pb)pb.style.display='none';initExam();
            }catch(ex){if(pb)pb.style.display='none';showErr('JSON parse error: '+ex.message);}
        },1400);};
        r.onerror=()=>{if(pb)pb.style.display='none';showErr('Failed to read file.');};
        r.readAsText(f);
    }

    /*
    ============================================================
    ASTRA TEST — NEW DATA STRUCTURE & VALIDATION
    ============================================================
    A .astrotest or .json file should follow this structure.

    {
      "testId": "UNIQUE_TEST_ID_STRING",
      "examName": "JEE Main 2026 Mock 1",
      "year": 2026,
      "duration": 180, // in minutes
      "totalMarks": 300,
      "subjects": [
        {
          "name": "Physics",
          "sections": ["Section A: SCQ", "Section B: Numerical"],
          "questions": [
            {
              "questionId": "PHY_CH1_T1_001", // Unique ID for the question
              "testId": "UNIQUE_TEST_ID_STRING", // Must match root testId
              "subject": "Physics",
              "chapter": "Kinematics",
              "topic": "Projectile Motion",
              "subtopic": "Horizontal Projection",
              "difficulty": "medium", // easy, medium, hard
              "type": "mcq", // mcq, multi-correct, numerical, para, assert-reason, linked, matrix
              "question": "A ball is thrown...",
              "images": ["url1.png", "url2.png"], // Optional
              "marks": 4,
              "negative": -1,
              "partialMarking": false, // For multi-correct only. true = selecting only
              // some correct options (and no wrong ones) earns proportional partial
              // credit — marks * (correct options selected / total options), rounded,
              // matching JEE Advanced-style rules. false = any selection short of the
              // full correct set is scored as wrong (negative marking applies). Set
              // this per-question to match exactly what the source paper specifies.
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correctAnswer": "B", // or ["A", "C"] for multi-correct
              "solution": "Detailed text/HTML solution...",
              "explanation": "Conceptual explanation...", // Optional
              "formulas": ["v = u + at"], // Optional
              "hints": ["Consider the vertical motion..."], // Optional
              "tags": ["jee-main-2024", "conceptual"], // Optional
              "metadata": { "source": "Astraea Bank" } // Optional
            }
          ]
        }
      ]
    }
    */
    function validateTestFile(data) {
        const errors = [];
        const warnings = [];
        const requiredTestFields = ['testId', 'examName', 'duration', 'totalMarks', 'subjects'];
        requiredTestFields.forEach(f => { if (data[f] === undefined) errors.push(`Missing required test field: "${f}"`); });

        if (!Array.isArray(data.subjects) || data.subjects.length === 0) {
            errors.push('Test must have a non-empty "subjects" array.');
            return { ok: false, errors, warnings };
        }

        data.subjects.forEach((subject, s_idx) => {
            if (!subject.name) errors.push(`Subject #${s_idx+1} is missing a "name".`);
            if (!Array.isArray(subject.questions) || subject.questions.length === 0) {
                errors.push(`Subject "${subject.name || s_idx+1}" must have a non-empty "questions" array.`);
                return;
            }

            subject.questions.forEach((q, q_idx) => {
                const q_label = `(Subject: ${subject.name}, Q #${q_idx+1})`;
                // Hard-required: the fields the engine cannot score or display without.
                const requiredQFields = [
                    'questionId', 'testId', 'subject', 'chapter', 'type',
                    'question', 'marks', 'negative', 'correctAnswer', 'solution'
                ];
                requiredQFields.forEach(f => { if (q[f] === undefined) errors.push(`Question ${q_label} is missing required field: "${f}"`); });

                // Soft-required: recommended metadata for full analytics (topic/chapter drill-down,
                // difficulty analysis, hints, tags) — reported but does not block import, so existing
                // simpler test banks keep working.
                ['topic', 'subtopic', 'difficulty', 'hints', 'tags', 'metadata'].forEach(f => {
                    if (q[f] === undefined) warnings.push(`Question ${q_label} is missing recommended field: "${f}"`);
                });

                if (q.testId !== data.testId) errors.push(`Question ${q_label} "testId" does not match the root testId.`);
                if (q.subject !== subject.name) errors.push(`Question ${q_label} "subject" does not match its parent subject.`);

                const validTypes = ['mcq', 'multi-correct', 'numerical', 'integer', 'para', 'assert-reason', 'linked', 'matrix'];
                if (q.type && !validTypes.includes(q.type)) errors.push(`Question ${q_label} has an invalid "type": ${q.type}`);

                // Effective answer type: para/linked/assert-reason questions can declare an
                // underlying answerType (mcq/multi-correct/numerical); assert-reason defaults to
                // mcq with standard A/B/C/D reasoning options if none are supplied.
                const extendedTypes = ['para', 'assert-reason', 'linked'];
                const effType = extendedTypes.includes(q.type) ? (q.answerType || 'mcq') : q.type;

                if (q.type === 'matrix') {
                    warnings.push(`Question ${q_label} is type "matrix" — Matrix Match scoring UI is schema-ready but not yet active, so this question won't be auto-scored.`);
                } else if (effType !== 'numerical' && effType !== 'integer') {
                    const optionsOptionalDefault = q.type === 'assert-reason' && (!q.options || !q.options.length);
                    if (!optionsOptionalDefault && (!Array.isArray(q.options) || q.options.length < 2)) {
                        errors.push(`Question ${q_label} must have at least 2 "options".`);
                    }
                }

                if (effType === 'multi-correct' && !Array.isArray(q.correctAnswer)) {
                    errors.push(`Question ${q_label} (multi-correct) "correctAnswer" must be an array.`);
                }
                if (effType === 'multi-correct' && q.partialMarking === undefined) {
                    warnings.push(`Question ${q_label} (multi-correct) doesn't declare "partialMarking" — defaulting to false (no partial credit; any incomplete selection scores as wrong). Set it explicitly to match the source paper's rule.`);
                }
                if (effType === 'mcq' && typeof q.correctAnswer !== 'string') {
                    errors.push(`Question ${q_label} (mcq) "correctAnswer" must be a string.`);
                }
                if (q.type === 'assert-reason' && (!q.assertion || !q.reason)) {
                    warnings.push(`Question ${q_label} is type "assert-reason" but is missing "assertion" and/or "reason" text.`);
                }
                if (q.type === 'para' && !q.passage) {
                    warnings.push(`Question ${q_label} is type "para" but is missing a shared "passage".`);
                }
                if (q.type === 'linked' && !q.passage && !q.linkedContext) {
                    warnings.push(`Question ${q_label} is type "linked" but is missing shared context ("passage" or "linkedContext").`);
                }
            });
        });

        return { ok: errors.length === 0, errors, warnings };
    }

    // Bridges the documented .astrotest schema (correctAnswer, marks, negative,
    // partialMarking) onto the internal fields the exam/scoring engine actually
    // reads (q.correct, q.marks, q.negative, q.partialMarking). Every uploaded
    // paper's own marking scheme — full marks, negative marking, and whether
    // partial credit applies — is preserved exactly as specified per question,
    // instead of a hardcoded assumption.
    function normalizeTestData(data){
        (data.subjects||[]).forEach(sub=>{
            (sub.questions||[]).forEach(q=>{
                if(q.correct===undefined && q.correctAnswer!==undefined) q.correct=q.correctAnswer;
                if(q.marks===undefined) q.marks=4;
                if(q.negative===undefined) q.negative=-1;
                if(q.partialMarking===undefined) q.partialMarking=false;
            });
        });
        return data;
    }

    function showErr(m){
        const b=document.getElementById('at-errBackdrop'),msg=document.getElementById('at-errMsg');
        if(msg)msg.textContent=m;
        if(b)b.style.display='flex';
    }
    function closeErr(){const b=document.getElementById('at-errBackdrop');if(b)b.style.display='none';}

    function getDemoData(){
        return{exam:'JEE Main',year:'2025',shift:'01',duration:60,totalMarks:120,subjects:[
            {name:'Physics',sections:['SCQ: Section A','FIB: Section B'],questions:[
                {id:1,section:'SCQ: Section A',chapter:'Current Electricity',topic:"Kirchhoff's Laws",difficulty:'medium',type:'mcq',question:'A battery of EMF 12V and internal resistance 2Ω is connected to an external resistance of 4Ω. What is the current flowing through the circuit?',options:['1 A','2 A','3 A','4 A'],correct:'B',marks:4,negative:-1,solution:"Using Ohm's Law: I = EMF/(R+r) = 12/(4+2) = 12/6 = 2 A"},
                {id:2,section:'SCQ: Section A',chapter:'Electrostatics',topic:"Coulomb's Law",difficulty:'easy',type:'mcq',question:'The force between two point charges is F. If the distance between them is halved, the new force becomes:',options:['F/4','F/2','2F','4F'],correct:'D',marks:4,negative:-1,solution:'F ∝ 1/r². If r → r/2, then F → 4F.'},
                {id:3,section:'SCQ: Section A',chapter:'Thermodynamics',topic:'First Law',difficulty:'hard',type:'mcq',question:'An ideal gas undergoes an isothermal expansion. Which statement is correct?',options:['Internal energy increases','Internal energy decreases','Internal energy remains constant','Work done is zero'],correct:'C',marks:4,negative:-1,solution:'For an ideal gas, internal energy depends only on temperature. In isothermal process ΔT=0, so ΔU=0.'},
                {id:4,section:'SCQ: Section A',chapter:'Waves',topic:'Interference',difficulty:'medium',type:'multi-correct',question:'Select ALL correct statements about constructive interference:',options:['Path difference = nλ','Phase difference = 2nπ','Amplitude is maximum','Energy is conserved'],correct:['A','B','C','D'],marks:4,negative:-1,solution:'All four statements are correct.'},
                {id:5,section:'FIB: Section B',chapter:'Optics',topic:'Refraction',difficulty:'medium',type:'numerical',question:'A ray of light passes from glass (μ = 1.5) to air. The critical angle in degrees is approximately:',options:[],correct:'42',marks:4,negative:-1,solution:'sin(C) = 1/μ = 1/1.5 = 0.667. C = arcsin(0.667) ≈ 42°'}
            ]},
            {name:'Chemistry',sections:['SCQ: Section A','FIB: Section B'],questions:[
                {id:1,section:'SCQ: Section A',chapter:'Chemical Bonding',topic:'Hybridization',difficulty:'easy',type:'mcq',question:'The hybridization of carbon in ethyne (C₂H₂) is:',options:['sp³','sp²','sp','sp³d'],correct:'C',marks:4,negative:-1,solution:'In ethyne, carbon forms a triple bond. Each carbon has 2 sigma bonds, giving sp hybridization.'},
                {id:2,section:'SCQ: Section A',chapter:'Equilibrium',topic:"Le Chatelier's Principle",difficulty:'medium',type:'mcq',question:'For the reaction N₂ + 3H₂ ⇌ 2NH₃ (ΔH = −92 kJ/mol), increasing temperature will:',options:['Shift equilibrium to the right','Shift equilibrium to the left','Have no effect','Increase Kp'],correct:'B',marks:4,negative:-1,solution:'The reaction is exothermic. Increasing temperature shifts equilibrium left.'},
                {id:3,section:'SCQ: Section A',chapter:'Organic Chemistry',topic:'Reduction',difficulty:'easy',type:'mcq',question:'Which reagent converts an aldehyde to a primary alcohol?',options:['NaBH₄','KMnO₄','Br₂/CCl₄',"Tollens' reagent"],correct:'A',marks:4,negative:-1,solution:'NaBH₄ selectively reduces aldehydes and ketones to alcohols.'},
                {id:4,section:'SCQ: Section A',chapter:'p-Block Elements',topic:'Nitrogen',difficulty:'easy',type:'mcq',question:'The molecular geometry of NH₃ is:',options:['Trigonal planar','Tetrahedral','Trigonal pyramidal','Linear'],correct:'C',marks:4,negative:-1,solution:'NH₃ has sp³ hybridized N with one lone pair, giving trigonal pyramidal geometry.'},
                {id:5,section:'FIB: Section B',chapter:'Electrochemistry',topic:'Cell EMF',difficulty:'hard',type:'numerical',question:'Calculate the standard cell potential (in V) for Zn–Cu cell given E°Zn = −0.76V and E°Cu = +0.34V:',options:[],correct:'1.10',marks:4,negative:-1,solution:'E°cell = +0.34 − (−0.76) = 1.10 V'}
            ]},
            {name:'Mathematics',sections:['SCQ: Section A','FIB: Section B'],questions:[
                {id:1,section:'SCQ: Section A',chapter:'Calculus',topic:'Derivatives',difficulty:'easy',type:'mcq',question:'Find the derivative of y = x sin x.',options:['x cos x − sin x','cos x + sin x','x sin x + cos x','x cos x + sin x'],correct:'D',marks:4,negative:-1,solution:'Using product rule: d/dx(x·sinx) = sinx + x cosx.'},
                {id:2,section:'SCQ: Section A',chapter:'Algebra',topic:'Quadratic Equations',difficulty:'easy',type:'mcq',question:'If α and β are roots of x² − 5x + 6 = 0, then α + β = ?',options:['5','6','−5','−6'],correct:'A',marks:4,negative:-1,solution:"By Vieta's formulas: α + β = −b/a = 5."},
                {id:3,section:'SCQ: Section A',chapter:'Trigonometry',topic:'Identities',difficulty:'easy',type:'mcq',question:'The value of sin²θ + cos²θ is:',options:['0','1','2','−1'],correct:'B',marks:4,negative:-1,solution:'Fundamental Pythagorean identity: sin²θ + cos²θ = 1.'},
                {id:4,section:'SCQ: Section A',chapter:'Probability',topic:'Basic Properties',difficulty:'medium',type:'multi-correct',question:'Which of the following are valid properties of probability? (Select all correct)',options:['0 ≤ P(A) ≤ 1','P(S) = 1','P(A∪B) = P(A)+P(B) if A,B mutually exclusive','P(∅) = 0'],correct:['A','B','C','D'],marks:4,negative:-1,solution:'All four are Kolmogorov axioms of probability.'},
                {id:5,section:'FIB: Section B',chapter:'Coordinate Geometry',topic:'Circles',difficulty:'medium',type:'numerical',question:'Find the radius of the circle x² + y² − 6x + 8y − 11 = 0:',options:[],correct:'6',marks:4,negative:-1,solution:'Complete the square: (x−3)² + (y+4)² = 36. Radius = 6.'}
            ]}
        ]};
    }

    function startDemo(){ED=getDemoData();initExam();}

    function initExam(){
        curSI=0;curQI=0;uAns={};qStat={};qTime={};qAnnotations={};done=false;RES=null;solSIcur=0;solSecCur='';solFilt='all';
        ED.subjects.forEach((s,si)=>s.questions.forEach((_,qi)=>{const k=si+'_'+qi;qStat[k]='nv';qTime[k]=0;}));
        tLeft=(ED.duration||180)*60;
        showAtPage('at-pg-exam');
        const nameBar=document.getElementById('at-examNameBar');
        if(nameBar)nameBar.textContent=`${ED.exam||'JEE'} ${ED.year||''} - ${String(ED.shift||'01').padStart(2,'0')}`;
        const dd=document.getElementById('at-sectionDropdown');
        if(dd)dd.innerHTML=ED.subjects.map((s,i)=>`<option value="${i}">${s.name}</option>`).join('');
        const av=document.getElementById('at-pal-avatar');
        const un=document.getElementById('at-pal-username');
        if(av)av.src=window.userContext?.avatarUrl||`https://api.dicebear.com/7.x/bottts/svg?seed=test`;
        if(un)un.textContent=window.userContext?.username||'Operative';
        buildSubjectBar();
        renderQ();
        startTimer();
        window._atExamActive = true;
        try{document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();}catch(e){}
    }

    function buildSubjectBar(){
        const bar=document.getElementById('at-examSubjectBar');
        if(!bar)return;
        bar.innerHTML=ED.subjects.map((s,i)=>`<button class="at-subj-tab${i===curSI?' active':''}" onclick="AT.switchSubject(${i})">${s.name}</button>`).join('');
    }

    function switchSubject(idx){saveQTime();curSI=idx;curQI=0;const dd=document.getElementById('at-sectionDropdown');if(dd)dd.value=idx;buildSubjectBar();renderQ();renderPal();}
    function switchSubjectDropdown(idx){idx=parseInt(idx);saveQTime();curSI=idx;curQI=0;buildSubjectBar();renderQ();renderPal();}

    function startTimer(){
        if(timerIv)clearInterval(timerIv);
        qStart=Date.now();
        timerIv=setInterval(()=>{tLeft--;updateTimerUI();if(tLeft<=0){clearInterval(timerIv);doSubmit();}},1000);
    }

    function updateTimerUI(){
        const h=Math.floor(tLeft/3600),m=Math.floor((tLeft%3600)/60),s=tLeft%60;
        const tv=document.getElementById('at-timerVal');
        if(tv)tv.textContent=`${p2(h)}:${p2(m)}:${p2(s)}`;
        const chip=document.getElementById('at-timerChip');
        if(chip){
            chip.className='';
            chip.style.cssText='display:flex;align-items:center;gap:6px;padding:7px 16px;border:1px solid;border-radius:99px;font-family:var(--font-mono);font-size:0.9rem;font-weight:700;';
            if(tLeft<=300){chip.style.color='var(--danger)';chip.style.borderColor='rgba(255,75,112,0.4)';chip.style.background='rgba(255,75,112,0.1)';}
            else if(tLeft<=600){chip.style.color='var(--warn)';chip.style.borderColor='rgba(251,191,36,0.4)';chip.style.background='rgba(251,191,36,0.08)';}
            else{chip.style.color='var(--text)';chip.style.borderColor='var(--border-bright)';chip.style.background='rgba(0,0,0,0.5)';}
        }
    }

    function saveQTime(){
        if(!qStart)return;
        const k=curSI+'_'+curQI;
        qTime[k]=(qTime[k]||0)+Math.round((Date.now()-qStart)/1000);
        qStart=Date.now();
    }

    function renderQ(){
        const sub=ED.subjects[curSI];
        const q=sub.questions[curQI];
        const k=curSI+'_'+curQI;
        if(qStat[k]==='nv')qStat[k]='ua';
        qStart=Date.now();
        const ans=uAns[k];
        const elapsed=qTime[k]||0;
        const diffColors={easy:'var(--prod)',medium:'var(--warn)',hard:'var(--unprod)'};
        const diffColor=diffColors[q.difficulty||'medium'];

        let inputHTML='';
        // Extended question types (Assertion-Reason, Paragraph-Based, Linked) reuse
        // whatever underlying answer type they declare via q.answerType — defaulting
        // sensibly per type — so scoring/input logic below stays a single code path.
        const AR_DEFAULT_OPTIONS = [
            'Both Assertion and Reason are true, and Reason is the correct explanation of Assertion',
            'Both Assertion and Reason are true, but Reason is NOT the correct explanation of Assertion',
            'Assertion is true, but Reason is false',
            'Assertion is false, but Reason is true'
        ];
        let effType = q.type;
        if(q.type==='assert-reason') effType = q.answerType || 'mcq';
        else if(q.type==='para' || q.type==='linked') effType = q.answerType || 'mcq';
        else if(q.type==='matrix') effType = 'matrix'; // scaffolded, not yet scorable in UI

        if(effType==='mcq'){
            const optList = (q.type==='assert-reason' && (!q.options || !q.options.length)) ? AR_DEFAULT_OPTIONS : q.options;
            inputHTML='<div>'+optList.map((o,i)=>{
                const l=LTR[i];
                const sel=ans===l?'at-selected':'';
                return `<button class="at-option ${sel}" onclick="AT._selOpt('${l}',this)"><div class="at-opt-circle">${l}</div><span>${o}</span></button>`;
            }).join('')+'</div>';
        }else if(effType==='multi-correct'){
            const arr=Array.isArray(ans)?ans:[];
            inputHTML='<div>'+q.options.map((o,i)=>{
                const l=LTR[i];
                const sel=arr.includes(l)?'at-multi-sel':'';
                return `<button class="at-option ${sel}" onclick="AT._togMulti('${l}',this)"><div class="at-opt-circle">${l}</div><span>${o}</span></button>`;
            }).join('')+'</div>';
        }else if(effType==='matrix'){
            inputHTML=`<div style="padding:16px;border:1px dashed var(--border-bright);border-radius:12px;color:var(--text-dim);font-size:0.8rem;">Matrix Match rendering is not yet available — this question type is schema-ready but the grid input UI is still in development.</div>`;
        }else{
            inputHTML=`<div style="margin-top:8px;">
                <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:10px;">Enter numerical answer:</div>
                <input type="number" step="any" placeholder="Type answer..." value="${ans||''}" id="at-numInp"
                    oninput="AT._saveNum(this.value)"
                    style="max-width:260px;text-align:center;font-size:1.2rem;font-family:var(--font-mono);font-weight:700;margin-bottom:0;">
                <div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Use decimal if needed.</div>
            </div>`;
        }

        const qScroll=document.getElementById('at-qScroll');
        if(!qScroll)return;
        qScroll.innerHTML=`
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <div style="font-family:var(--font-display);font-size:1.4rem;letter-spacing:0.08em;">Que. ${curQI+1}</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-family:var(--font-mono);font-size:0.78rem;background:rgba(0,0,0,0.4);padding:4px 10px;border-radius:8px;border:1px solid var(--border-bright);">⏱ ${p2(Math.floor(elapsed/60))}:${p2(elapsed%60)}</span>
                    <span class="badge badge-prod" style="font-size:0.68rem;">+${q.marks||4}</span>
                    ${q.negative!==undefined?`<span class="badge badge-unprod" style="font-size:0.68rem;">${q.negative}</span>`:''}
                    ${effType==='multi-correct'&&q.partialMarking?`<span class="badge" style="font-size:0.68rem;background:rgba(251,191,36,0.15);color:var(--warn);" title="Selecting only some correct options (with no wrong ones) earns proportional partial credit on this question">◐ Partial OK</span>`:''}
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
                ${q.chapter?`<span style="background:rgba(255,255,255,0.08);padding:3px 10px;border-radius:6px;font-size:0.72rem;color:var(--text-dim);">${q.chapter}</span>`:''}
                ${q.topic?`<span style="background:rgba(255,255,255,0.08);padding:3px 10px;border-radius:6px;font-size:0.72rem;color:var(--text-dim);">${q.topic}</span>`:''}
                ${q.difficulty?`<span style="background:rgba(0,0,0,0.3);padding:3px 10px;border-radius:6px;font-size:0.72rem;color:${diffColor};border:1px solid ${diffColor}44;">${q.difficulty}</span>`:''}
                <span style="background:rgba(79,110,247,0.12);padding:3px 10px;border-radius:6px;font-size:0.72rem;color:var(--accent);border:1px solid rgba(79,110,247,0.3);">${q.type}</span>
            </div>
            <div style="font-size:0.95rem;line-height:1.85;color:var(--text);margin-bottom:20px;">
                ${q.passage?`<div style="background:rgba(255,255,255,0.04);border-left:3px solid var(--accent);border-radius:8px;padding:14px 16px;margin-bottom:16px;font-size:0.86rem;color:var(--text-dim);line-height:1.7;">${q.passage}</div>`:''}
                ${q.type==='assert-reason'?`<div style="margin-bottom:12px;"><div><strong>Assertion (A):</strong> ${q.assertion||''}</div><div style="margin-top:6px;"><strong>Reason (R):</strong> ${q.reason||''}</div></div>`:''}
                ${q.question}
            </div>
            ${inputHTML}
            <div style="margin-top:16px;font-size:0.72rem;color:var(--text-dim);text-align:center;text-transform:uppercase;letter-spacing:0.08em;">${sub.name} · Question ${curQI+1} of ${sub.questions.length}</div>
        `;
        renderPal();
    }

    function _selOpt(l,btn){
        const k=curSI+'_'+curQI;
        uAns[k]=l;
        if(qStat[k]!=='ra')qStat[k]='ans';
        document.querySelectorAll('#at-qScroll .at-option').forEach(b=>{b.classList.remove('at-selected');b.querySelector('.at-opt-circle').style.background='';b.querySelector('.at-opt-circle').style.color='';b.querySelector('.at-opt-circle').style.borderColor='';});
        btn.classList.add('at-selected');
        const oc=btn.querySelector('.at-opt-circle');
        if(oc){oc.style.background='var(--accent)';oc.style.color='#fff';oc.style.borderColor='var(--accent)';}
        renderPal();
    }

    function _togMulti(l,btn){
        const k=curSI+'_'+curQI;
        let cur=Array.isArray(uAns[k])?[...uAns[k]]:[];
        if(cur.includes(l)){cur=cur.filter(x=>x!==l);btn.classList.remove('at-multi-sel');}
        else{cur.push(l);btn.classList.add('at-multi-sel');}
        uAns[k]=cur.length?cur:undefined;
        if(qStat[k]!=='ra')qStat[k]=cur.length?'ans':'ua';
        renderPal();
    }

    function _saveNum(v){
        const k=curSI+'_'+curQI;
        if(v.trim()){uAns[k]=v.trim();if(qStat[k]!=='ra')qStat[k]='ans';}
        else{delete uAns[k];if(qStat[k]!=='ra')qStat[k]='ua';}
        renderPal();
    }

    function clearResponse(){
        const k=curSI+'_'+curQI;
        delete uAns[k];
        qStat[k]=qStat[k]==='ra'?'rev':'ua';
        renderQ();
    }

    function markReview(){
        saveQTime();
        const k=curSI+'_'+curQI;
        qStat[k]=uAns[k]!==undefined?'ra':'rev';
        renderPal();
        nextQ();
    }

    function saveNext(){saveQTime();renderPal();nextQ();}

    function nextQ(){
        const sub=ED.subjects[curSI];
        if(curQI<sub.questions.length-1){curQI++;}
        else if(curSI<ED.subjects.length-1){curSI++;curQI=0;buildSubjectBar();const dd=document.getElementById('at-sectionDropdown');if(dd)dd.value=curSI;}
        renderQ();
    }

    function prevQ(){
        saveQTime();
        if(curQI>0){curQI--;}
        else if(curSI>0){curSI--;curQI=ED.subjects[curSI].questions.length-1;buildSubjectBar();const dd=document.getElementById('at-sectionDropdown');if(dd)dd.value=curSI;}
        renderQ();
    }

    function gotoQ(si,qi){saveQTime();curSI=si;curQI=qi;buildSubjectBar();const dd=document.getElementById('at-sectionDropdown');if(dd)dd.value=si;renderQ();}

    function renderPal(){
        const sub=ED.subjects[curSI];
        let html='';let ans=0,nv=0;
        sub.questions.forEach((_,qi)=>{
            const k=curSI+'_'+qi,st=qStat[k],isCur=qi===curQI;
            let cls='';
            if(st==='ans'){cls='at-pq-answered';ans++;}
            else if(st==='rev')cls='at-pq-review';
            else if(st==='ra'){cls='at-pq-review-ans';ans++;}
            else if(st==='nv')nv++;
            if(isCur)cls+=' at-pq-current';
            html+=`<button class="${cls}" onclick="AT.gotoQ(${curSI},${qi})">${qi+1}</button>`;
        });
        const pg=document.getElementById('at-palGrid');if(pg)pg.innerHTML=html;
        const pc=document.getElementById('at-palCounts');
        if(pc)pc.innerHTML=`<span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:var(--prod);"></span>${ans} Attempted</span><span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.2);"></span>${sub.questions.length-ans} Unattempted</span>`;
        const pnv=document.getElementById('at-palNotVisited');
        if(pnv)pnv.textContent=`${nv} Not Visited`;
    }

    function openSubModal(){
        const tot=ED.subjects.reduce((a,s)=>a+s.questions.length,0);
        let ans=0,rev=0,na=0;
        ED.subjects.forEach((s,si)=>s.questions.forEach((_,qi)=>{const k=si+'_'+qi,st=qStat[k];if(st==='ans')ans++;else if(st==='ra'){ans++;rev++;}else if(st==='rev')rev++;else na++;}));
        const g=document.getElementById('at-subModalGrid');
        if(g)g.innerHTML=`
            <div class="stat-box" style="text-align:center;padding:16px;"><label>Total</label><span style="font-size:1.4rem;">${tot}</span></div>
            <div class="stat-box" style="text-align:center;padding:16px;"><label>Answered</label><span style="font-size:1.4rem;color:var(--prod);">${ans}</span></div>
            <div class="stat-box" style="text-align:center;padding:16px;"><label>For Review</label><span style="font-size:1.4rem;color:var(--warn);">${rev}</span></div>
            <div class="stat-box" style="text-align:center;padding:16px;"><label>Not Answered</label><span style="font-size:1.4rem;color:var(--danger);">${na}</span></div>
        `;
        const b=document.getElementById('at-subBackdrop');if(b)b.style.display='flex';
    }

    function closeSubModal(){const b=document.getElementById('at-subBackdrop');if(b)b.style.display='none';}
    function confirmSubmit(){closeSubModal();doSubmit();}

    function doSubmit(){
        if(done)return;done=true;
        clearInterval(timerIv);saveQTime();
        _updateStreak();
        RES=calcResults();
        _saveHist(RES);
        _saveHistFirestore(RES);
        buildResultPage(RES);
        showAtPage('at-pg-result');
        try{document.exitFullscreen&&document.exitFullscreen();}catch(e){}
        window._atExamActive = false;
    }

    // FIX: this previously failed with zero visible feedback and no retry —
    // a network blip or transient Firestore error meant the test attempt was
    // saved to localStorage only and quietly never reached the account, with
    // nothing telling the person it hadn't synced. Now it retries with
    // backoff (5s, 10s, 20s... capped at 60s) until the write actually
    // confirms, same as the rest of the app's cloud saves.
    async function _saveHistFirestore(r, _attempt){
        const db=window._fbDb, uid=window._fbUid, fns=window._fbFns;
        if(!db||!uid||uid==='guest'||!fns) return;
        const attempt = _attempt || 0;
        try {
            const record = {
                id: Date.now(),
                examName: r.examName, year: r.year, shift: r.shift,
                score: r.score, maxScore: r.maxScore,
                accuracy: r.accuracy, pct: r.rank.pct,
                correct: r.cor, wrong: r.wr, skipped: r.sk,
                timeUsed: r.timeUsed,
                date: new Date().toISOString(),
                dateStr: new Date().toLocaleDateString(),
                subs: r.subs,
                annotations: qAnnotations || {}
            };
            const docId = `test_${Date.now()}`;
            await fns.setDoc(fns.doc(db,'users2',uid,'astratest',docId), record);
        } catch(e){
            console.warn('Firestore astratest save error:',e);
            const delay = Math.min(60000, 5000 * Math.pow(2, Math.min(attempt, 3)));
            setTimeout(() => _saveHistFirestore(r, attempt + 1), delay);
        }
    }

    function exitExam(){
        if(!done && timerIv){
            openSubModal();
            return;
        }
        if(timerIv)clearInterval(timerIv);
        try{document.exitFullscreen&&document.exitFullscreen();}catch(e){}
        window._atExamActive = false;
        showAtPage('at-pg-land');
        loadLandStats();
    }

    function calcResults(){
        let score=0,maxS=0,cor=0,wr=0,sk=0,pt=0,att=0;
        const subs=[],allQ=[];
        ED.subjects.forEach((sub,si)=>{
            let ss=0,sm=0,sc=0,sw=0,ssk=0,spt=0,st=0;
            const secs={};
            sub.questions.forEach((q,qi)=>{
                const k=si+'_'+qi,ua=uAns[k],tm=qTime[k]||0;
                st+=tm;
                const mk=q.marks||4,ng=q.negative!==undefined?q.negative:-1;
                sm+=mk;maxS+=mk;
                let status='skipped',em=0;
                if(ua!==undefined&&ua!==''&&!(Array.isArray(ua)&&!ua.length)){
                    att++;
                    const ok=chkAns(q,ua);
                    if(ok===true){em=mk;ss+=mk;score+=mk;cor++;sc++;status='correct';}
                    else if(ok&&typeof ok==='object'&&ok.partial){em=ok.marks;ss+=em;score+=em;pt++;spt++;status='partial';}
                    else{em=ng;ss+=ng;score+=ng;wr++;sw++;status='wrong';}
                }else{sk++;ssk++;}
                const sec=q.section||'Section A';
                if(!secs[sec])secs[sec]={cor:0,wr:0,sk:0,pt:0,tot:0,score:0,max:0,time:0};
                secs[sec].tot++;secs[sec].max+=mk;secs[sec].time+=tm;
                if(status==='correct'){secs[sec].cor++;secs[sec].score+=mk;}
                else if(status==='wrong'){secs[sec].wr++;secs[sec].score+=ng;}
                else if(status==='partial'){secs[sec].pt++;secs[sec].score+=em;}
                else secs[sec].sk++;
                allQ.push({sn:sub.name,si,qi,q,ua,status,em,tm});
            });
            subs.push({name:sub.name,score:ss,max:sm,cor:sc,wr:sw,sk:ssk,pt:spt,time:st,secs});
        });
        const acc=att>0?Math.round((cor+pt)/att*100):0;
        const timeUsed=(ED.duration||180)*60-tLeft;
        const rk=predRank(score,maxS);
        return{score,maxScore:maxS,cor,wr,sk,pt,att,accuracy:acc,timeUsed,subs,allQ,rank:rk,examName:ED.exam||'JEE',year:ED.year||'2025',shift:ED.shift||'01',testId:ED.testId||''};
    }

    function _effAnswerType(q){
        if(q.type==='assert-reason'||q.type==='para'||q.type==='linked') return q.answerType||'mcq';
        return q.type;
    }
    // Returns true (full marks), false (wrong — negative marking applies),
    // or {partial:true, marks:N} (partial credit, using the question's own
    // marks/options count so the award matches whatever scheme the source
    // paper specifies via marks/partialMarking — nothing hardcoded per-paper).
    function chkAns(q,ua){
        const et=_effAnswerType(q);
        if(et==='multi-correct'){
            const ca=Array.isArray(q.correct)?q.correct.map(x=>x.toUpperCase()).sort():[];
            const uaaRaw=Array.isArray(ua)?ua.map(x=>x.toUpperCase()):[];
            const uaa=[...new Set(uaaRaw)].sort();
            if(!uaa.length)return false;
            if(JSON.stringify(ca)===JSON.stringify(uaa))return true;
            const anyWrongSelected=uaa.some(u=>!ca.includes(u));
            if(anyWrongSelected)return false; // any incorrect option chosen -> full negative marking, per standard JEE Advanced rule
            // Only correct (but incomplete) options selected. Whether that earns
            // partial credit — and how much — depends entirely on this question's
            // own partialMarking flag, exactly as declared in the uploaded paper.
            if(q.partialMarking){
                const mk=q.marks||4;
                const nOptions=(q.options&&q.options.length)||4;
                const awarded=Math.min(mk,Math.round(uaa.length*(mk/nOptions)));
                if(awarded>0)return{partial:true,marks:awarded};
            }
            return false; // no partial marking on this paper for this question -> incomplete selection scores as wrong
        }
        if(et==='numerical'||et==='integer')return Math.abs(parseFloat(q.correct)-parseFloat(ua))<0.02;
        return String(ua).toUpperCase()===String(q.correct).toUpperCase();
    }

    function predRank(score,maxScore){
        const s=Math.max(score,0);
        const bands=[
            {minS:285, pct:99.99, airMin:1,    airMax:50},
            {minS:260, pct:99.95, airMin:50,   airMax:600},
            {minS:240, pct:99.9,  airMin:600,  airMax:1300},
            {minS:220, pct:99.7,  airMin:1300, airMax:4000},
            {minS:200, pct:99.2,  airMin:4000, airMax:10000},
            {minS:180, pct:98,    airMin:10000,airMax:26000},
            {minS:160, pct:96,    airMin:26000,airMax:52000},
            {minS:140, pct:93,    airMin:52000,airMax:91000},
            {minS:120, pct:88,    airMin:91000,airMax:156000},
            {minS:100, pct:82,    airMin:156000,airMax:234000},
            {minS:80,  pct:74,    airMin:234000,airMax:338000},
            {minS:60,  pct:64,    airMin:338000,airMax:468000},
            {minS:40,  pct:54,    airMin:468000,airMax:598000},
            {minS:20,  pct:46,    airMin:598000,airMax:702000},
            {minS:1,   pct:38,    airMin:702000,airMax:858000},
            {minS:0,   pct:25,    airMin:858000,airMax:1200000},
        ];
        const scaled = maxScore>0 ? Math.round((s/maxScore)*300) : 0;
        if(score<0) return{pct:8,airMin:1000000,airMax:1300000,scaled:score,note:'Negative score'};
        const band=bands.find(b=>scaled>=b.minS)||bands[bands.length-1];
        return{pct:band.pct,airMin:band.airMin,airMax:band.airMax,scaled,note:''};
    }
    function fmtIndian(n){
        if(n<1000)return String(n);
        const s=String(n);
        const last3=s.slice(-3);
        const rest=s.slice(0,-3);
        if(!rest)return last3;
        const groups=[];
        let r=rest;
        while(r.length>2){groups.unshift(r.slice(-2));r=r.slice(0,-2);}
        if(r)groups.unshift(r);
        return groups.join(',')+','+last3;
    }

    let _resCharts={};
    function buildResultPage(r){
        Object.values(_resCharts).forEach(c=>{try{c.destroy();}catch(e){}});
        _resCharts={};
        const timeTxt=`${p2(Math.floor(r.timeUsed/3600))}:${p2(Math.floor((r.timeUsed%3600)/60))}:${p2(r.timeUsed%60)}`;
        const rb=document.getElementById('at-resultNameBar'),rt=document.getElementById('at-resultTime'),st=document.getElementById('at-solTime'),sb=document.getElementById('at-solNameBar');
        if(rb)rb.textContent=`${r.examName} ${r.year} - ${String(r.shift||'01').padStart(2,'0')}`;
        if(rt)rt.textContent=timeTxt;if(st)st.textContent=timeTxt;
        if(sb)sb.textContent=`${r.examName} ${r.year} - ${String(r.shift||'01').padStart(2,'0')}`;
        const pct=r.maxScore>0?Math.round(Math.max(0,r.score)/r.maxScore*100):0;
        const totColor=pct>=70?'var(--prod)':pct>=40?'var(--warn)':'var(--unprod)';

        let secRows='';
        r.subs.forEach(sub=>{
            Object.entries(sub.secs).forEach(([sec,d])=>{
                const a=d.max>0?Math.round(Math.max(0,d.score)/d.max*100):0;
                const aColor=a>=70?'var(--prod)':a>=40?'var(--warn)':'var(--unprod)';
                const tm=`${p2(Math.floor(d.time/3600))}:${p2(Math.floor((d.time%3600)/60))}:${p2(d.time%60)}`;
                secRows+=`<tr><td><strong>${sub.name}</strong><div style="font-size:0.7rem;color:var(--text-dim);">${sec}</div></td><td style="font-family:var(--font-mono);">${d.score} / ${d.max}</td><td>${d.cor} / ${d.tot}</td><td><span style="color:${aColor};font-weight:700;">${a}%</span></td><td style="font-family:var(--font-mono);font-size:0.8rem;">${tm}</td></tr>`;
            });
        });
        secRows+=`<tr style="background:rgba(79,110,247,0.06);"><td><strong>Overall</strong></td><td><strong style="font-family:var(--font-mono);">${r.score} / ${r.maxScore}</strong></td><td><strong>${r.att} / ${r.cor+r.wr+r.sk+(r.pt||0)}</strong></td><td><span style="color:${totColor};font-weight:800;">${pct}%</span></td><td style="font-family:var(--font-mono);font-size:0.8rem;">${timeTxt}</td></tr>`;

        const body=document.getElementById('at-resultBody');
        if(!body)return;
        body.innerHTML=`
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
            <div class="card" style="padding:20px;text-align:center;border-bottom:3px solid var(--accent);">
                <div style="font-family:var(--font-mono);font-size:2.2rem;font-weight:700;color:var(--accent);">${r.score}<span style="font-size:1rem;color:var(--text-dim);">/${r.maxScore}</span></div>
                <div style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-top:6px;">Total Score</div>
            </div>
            <div class="card" style="padding:20px;text-align:center;border-bottom:3px solid ${totColor};">
                <div style="font-family:var(--font-mono);font-size:2.2rem;font-weight:700;color:${totColor};">${pct}%</div>
                <div style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-top:6px;">Percentage</div>
            </div>
            <div class="card" style="padding:20px;text-align:center;border-bottom:3px solid var(--prod);">
                <div style="font-family:var(--font-mono);font-size:2.2rem;font-weight:700;color:var(--prod);">${r.rank.pct}%</div>
                <div style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-top:6px;">Percentile</div>
            </div>
        </div>

        <div class="card" style="padding:18px 22px;margin-bottom:16px;display:flex;align-items:center;gap:20px;background:linear-gradient(135deg,rgba(79,110,247,0.1),rgba(124,58,237,0.08));">
            <div style="font-size:2.8rem;">🎯</div>
            <div style="flex:1;">
                <div style="font-family:var(--font-display);font-size:1rem;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:6px;">RANK PREDICTION · JEE MAIN</div>
                <div style="font-size:0.88rem;line-height:1.8;">
                    Expected AIR: <strong style="color:var(--warn);font-family:var(--font-mono);">${fmtIndian(r.rank.airMin)} – ${fmtIndian(r.rank.airMax)}</strong>
                    &nbsp;&nbsp;|&nbsp;&nbsp;
                    Percentile: <strong style="color:var(--prod);font-family:var(--font-mono);">${r.rank.pct}%ile</strong>
                </div>
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <span class="badge badge-prod">✓ ${r.cor} Correct</span>
                    ${r.pt?`<span class="badge" style="background:rgba(251,191,36,0.15);color:var(--warn);">◐ ${r.pt} Partial</span>`:''}
                    <span class="badge badge-unprod">✗ ${r.wr} Wrong</span>
                    <span class="badge">○ ${r.sk} Skipped</span>
                    <span class="badge" style="background:rgba(79,110,247,0.15);">Acc: ${r.accuracy}%</span>
                </div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:16px;">
            <div class="card" style="padding:16px;">
                <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Correct / Wrong / Skipped</div>
                <canvas id="at-res-donut" height="160"></canvas>
            </div>
            <div class="card" style="padding:16px;">
                <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Subject Performance</div>
                <canvas id="at-res-bar" height="160"></canvas>
            </div>
            <div class="card" style="padding:16px;">
                <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Time Spent per Subject</div>
                <canvas id="at-res-time" height="160"></canvas>
            </div>
        </div>

        <div class="card" style="padding:18px;margin-bottom:16px;">
            <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:12px;">PERCENTILE SCALE — WHERE YOU STAND AMONG ~12.5 LAKH CANDIDATES</div>
            <div style="position:relative;height:10px;background:linear-gradient(to right,rgba(255,75,112,0.7),rgba(251,191,36,0.7),rgba(79,110,247,0.7),rgba(0,229,160,0.9));border-radius:99px;margin-bottom:6px;">
                <div style="position:absolute;top:-5px;left:${Math.min(Math.max(r.rank.pct,0),99.9)}%;transform:translateX(-50%);width:20px;height:20px;background:white;border-radius:50%;box-shadow:0 0 10px rgba(255,255,255,0.8);border:2px solid rgba(79,110,247,0.8);"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-dim);margin-top:6px;">
                <span>0%ile (Bottom)</span>
                <span style="color:var(--accent);font-weight:700;font-size:0.75rem;">▲ You: ${r.rank.pct}%ile &nbsp;·&nbsp; Scaled ${r.rank.scaled||'—'}/300 &nbsp;·&nbsp; AIR ~${fmtIndian(r.rank.airMin)}–${fmtIndian(r.rank.airMax)}</span>
                <span>99.9%ile (Top)</span>
            </div>
            ${r.score<=0?`<div style="margin-top:10px;padding:8px 12px;background:rgba(255,75,112,0.08);border:1px solid rgba(255,75,112,0.25);border-radius:var(--radius-sm);font-size:0.75rem;color:var(--unprod);">⚠ Score is ${r.score<=0?'zero or negative':'very low'} — rank prediction assumes no marks scored. Focus on attempting more questions correctly.</div>`:''}
        </div>

        <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px;">
            <div style="padding:14px 18px;border-bottom:1px solid var(--border);font-family:var(--font-display);font-size:1rem;letter-spacing:0.1em;color:var(--text-dim);">SECTION BREAKDOWN</div>
            <div style="overflow-x:auto;"><table><thead><tr><th>Section</th><th>Score</th><th>Attempted</th><th>Accuracy</th><th>Time</th></tr></thead><tbody>${secRows}</tbody></table></div>
        </div>

        <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px;" id="at-res-mistakes">
            <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;">
                <div style="font-family:var(--font-display);font-size:1rem;letter-spacing:0.1em;color:var(--text-dim);">MISTAKE ANALYSIS</div>
                <span class="badge badge-unprod" style="font-size:0.65rem;">${r.wr} Wrong Answers</span>
            </div>
            <div style="padding:16px 18px;" id="at-res-mistake-body">
                ${r.wr===0?`<div style="text-align:center;padding:20px;color:var(--prod);font-size:0.9rem;">🎉 No wrong answers! Perfect accuracy on attempted questions.</div>`:''}
            </div>
        </div>
        `;

        setTimeout(()=>{
            const dc=document.getElementById('at-res-donut');
            if(dc)_resCharts.donut=new Chart(dc,{type:'doughnut',data:{labels:['Correct','Partial','Wrong','Skipped'],datasets:[{data:[r.cor,r.pt||0,r.wr,r.sk],backgroundColor:['rgba(0,229,160,0.8)','rgba(251,191,36,0.8)','rgba(255,75,112,0.8)','rgba(255,255,255,0.15)'],borderColor:['#00e5a0','#fbbf24','#ff4b70','rgba(255,255,255,0.1)'],borderWidth:1}]},options:{cutout:'65%',plugins:{legend:{position:'bottom',labels:{color:'rgba(255,255,255,0.5)',font:{size:10},padding:6}}}}});
            const bc=document.getElementById('at-res-bar');
            if(bc)_resCharts.bar=new Chart(bc,{type:'bar',data:{labels:r.subs.map(s=>s.name),datasets:[{label:'Scored',data:r.subs.map(s=>Math.max(0,s.score)),backgroundColor:'rgba(79,110,247,0.8)',borderRadius:3},{label:'Max',data:r.subs.map(s=>s.max),backgroundColor:'rgba(255,255,255,0.08)',borderRadius:3}]},options:{responsive:true,plugins:{legend:{labels:{color:'rgba(255,255,255,0.45)',font:{size:10}}}},scales:{x:{ticks:{color:'rgba(255,255,255,0.4)'},grid:{display:false}},y:{ticks:{color:'rgba(255,255,255,0.4)'},grid:{color:'rgba(255,255,255,0.06)'}}}}});
            const tc=document.getElementById('at-res-time');
            if(tc)_resCharts.time=new Chart(tc,{type:'bar',data:{labels:r.subs.map(s=>s.name),datasets:[{label:'Time (min)',data:r.subs.map(s=>Math.round(s.time/60)),backgroundColor:['rgba(0,229,160,0.7)','rgba(251,191,36,0.7)','rgba(124,58,237,0.7)'],borderRadius:3}]},options:{responsive:true,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{ticks:{color:'rgba(255,255,255,0.4)'},grid:{color:'rgba(255,255,255,0.06)'}},y:{ticks:{color:'rgba(255,255,255,0.4)'},grid:{display:false}}}}});
            if(r.wr>0){
                const mb=document.getElementById('at-res-mistake-body');
                if(mb){
                    const wrongs=r.allQ.filter(x=>x.status==='wrong');
                    const byChapter={};
                    wrongs.forEach(item=>{
                        const ch=item.q.chapter||'Unknown';
                        if(!byChapter[ch])byChapter[ch]=[];
                        byChapter[ch].push(item);
                    });
                    const chRows=Object.entries(byChapter).sort((a,b)=>b[1].length-a[1].length).map(([ch,qs])=>`
                        <div style="margin-bottom:16px;">
                            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                                <span style="font-weight:700;font-size:0.82rem;color:var(--text);">${escapeHTML(ch)}</span>
                                <span class="badge badge-unprod" style="font-size:0.6rem;">${qs.length} mistake${qs.length>1?'s':''}</span>
                                <span style="font-size:0.7rem;color:var(--text-dim);">${qs[0].sn||''}</span>
                            </div>
                            ${qs.map(item=>{
                                const ca=Array.isArray(item.q.correct)?item.q.correct.join(', '):item.q.correct;
                                const ua=Array.isArray(item.ua)?item.ua.join(', '):(item.ua||'—');
                                return `<div style="padding:10px 14px;background:rgba(255,75,112,0.05);border:1px solid rgba(255,75,112,0.2);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.8rem;">
                                    <div style="color:var(--text);margin-bottom:6px;line-height:1.5;">${escapeHTML(item.q.question||'').slice(0,180)}${(item.q.question||'').length>180?'…':''}</div>
                                    <div style="display:flex;gap:16px;font-size:0.72rem;">
                                        <span>✗ You: <strong style="color:var(--unprod);">${escapeHTML(String(ua))}</strong></span>
                                        <span>✓ Correct: <strong style="color:var(--prod);">${escapeHTML(String(ca))}</strong></span>
                                        ${item.q.difficulty?`<span style="color:var(--text-dim);">Diff: ${item.q.difficulty}</span>`:''}
                                        <span style="color:var(--text-dim);">⏱ ${p2(Math.floor((item.tm||0)/60))}:${p2((item.tm||0)%60)}</span>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`).join('');
                    mb.innerHTML=`
                        <div style="margin-bottom:14px;padding:10px 14px;background:rgba(255,75,112,0.06);border:1px solid rgba(255,75,112,0.2);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--text-dim);">
                            <strong style="color:var(--unprod);">-${Math.abs(r.wr)} marks lost</strong> to wrong answers (${r.wr} × negative marking) &nbsp;·&nbsp; Focus on: ${Object.keys(byChapter).slice(0,3).join(', ')}
                        </div>
                        ${chRows}`;
                }
            }
        },100);
    }

    function buildSolutionPage(){
        if(!RES)return;
        buildSolSubjBar();
        renderSolQuestions();
        renderSolPalette();
    }

    function buildSolSubjBar(){
        const bar=document.getElementById('at-solSubjBar');
        if(!bar)return;
        bar.innerHTML=ED.subjects.map((s,i)=>`<button class="at-subj-tab${i===0?' active':''}" onclick="AT._switchSolSubj(${i},this)">${s.name}</button>`).join('');
    }

    function _switchSolSubj(i,btn){
        solSIcur=i;solSecCur='';
        document.querySelectorAll('#at-solSubjBar .at-subj-tab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        renderSolQuestions();renderSolPalette();
    }

    function filterSolQuestions(filt){solFilt=filt;renderSolQuestions();renderSolPalette();}

    function renderSolQuestions(){
        if(!RES)return;
        let qs=RES.allQ.filter(x=>x.si===solSIcur);
        if(solFilt==='correct')qs=qs.filter(x=>x.status==='correct');
        else if(solFilt==='partial')qs=qs.filter(x=>x.status==='partial');
        else if(solFilt==='wrong')qs=qs.filter(x=>x.status==='wrong');
        else if(solFilt==='skipped')qs=qs.filter(x=>x.status==='skipped');
        const fsel=document.getElementById('at-solFilterSel');if(fsel)fsel.value=solFilt;

        let html='';
        qs.forEach((item)=>{
            const{q,ua,status,tm}=item;
            const elapsed=`${p2(Math.floor(tm/60))}:${p2(tm%60)}`;
            let optsHtml='';
            if(_effAnswerType(q)==='mcq'||_effAnswerType(q)==='multi-correct'){
                const ca=Array.isArray(q.correct)?q.correct.map(x=>x.toUpperCase()):[String(q.correct).toUpperCase()];
                const uaa=Array.isArray(ua)?ua.map(x=>x.toUpperCase()):(ua?[String(ua).toUpperCase()]:[]);
                optsHtml='<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">'+q.options.map((o,i)=>{
                    const l=LTR[i];const isC=ca.includes(l),isU=uaa.includes(l);
                    let style='';let label='';
                    if(isC){style='border-color:var(--prod);background:rgba(0,229,160,0.08);color:var(--prod);';label=`<span style="margin-left:auto;font-size:0.7rem;font-weight:700;color:var(--prod);">✓ Right Answer</span>`;}
                    if(isU&&!isC)style='border-color:var(--unprod);background:rgba(255,75,112,0.08);color:var(--unprod);';
                    return `<div class="at-option" style="${style}pointer-events:none;"><div class="at-opt-circle" style="${isC?'background:var(--prod);border-color:var(--prod);color:#000;':isU&&!isC?'background:var(--unprod);border-color:var(--unprod);color:#fff;':''}">${isC?'✓':isU?'✗':l}</div><span>${o}</span>${label}</div>`;
                }).join('')+'</div>';
            }else{
                optsHtml=`<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
                    <div class="at-option" style="${status==='correct'?'border-color:var(--prod);background:rgba(0,229,160,0.08);':'border-color:var(--unprod);background:rgba(255,75,112,0.08);'}pointer-events:none;"><div class="at-opt-circle">${status==='correct'?'✓':'✗'}</div><span>Your answer: ${ua||'—'}</span></div>
                    <div class="at-option" style="border-color:var(--prod);background:rgba(0,229,160,0.08);pointer-events:none;"><div class="at-opt-circle" style="background:var(--prod);border-color:var(--prod);color:#000;">✓</div><span>Correct: ${q.correct}</span><span style="margin-left:auto;font-size:0.7rem;color:var(--prod);font-weight:700;">Right Answer</span></div>
                </div>`;
            }

            html+=`<div class="at-sol-q-item" id="at-solq-${item.si}-${item.qi}">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                    <div style="font-family:var(--font-display);font-size:1.1rem;letter-spacing:0.08em;">Que. ${item.qi+1}</div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-family:var(--font-mono);font-size:0.72rem;background:rgba(0,0,0,0.4);padding:3px 10px;border-radius:8px;">⏱ ${elapsed}</span>
                        <span class="badge" style="font-size:0.65rem;background:${item.em>0?'rgba(0,229,160,0.15)':item.em<0?'rgba(255,75,112,0.15)':'rgba(255,255,255,0.08)'};color:${item.em>0?'var(--prod)':item.em<0?'var(--unprod)':'var(--text-dim)'};">${item.em>0?'+':''}${item.em} / ${q.marks||4}${status==='partial'?' (partial)':''}</span>
                    </div>
                </div>
                <div style="font-size:0.9rem;line-height:1.75;color:var(--text);margin-bottom:14px;">${q.question}</div>
                ${optsHtml}
                ${q.solution?`<div class="at-solution-box">
                    <div style="font-size:0.65rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">💡 Explanation</div>
                    <div style="font-size:0.72rem;color:var(--text-dim);font-weight:700;margin-bottom:6px;">Correct Answer: <strong style="color:var(--text);">${Array.isArray(q.correct)?q.correct.join(', '):q.correct}</strong></div>
                    <div style="font-size:0.85rem;line-height:1.65;color:var(--text);">${q.solution}</div>
                </div>`:''}
                <div class="at-annotation-box" style="margin-top:14px;background:rgba(79,110,247,0.07);border:1px solid rgba(79,110,247,0.2);border-radius:12px;padding:14px;">
                    <div style="font-size:0.65rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">📝 My Review Notes</div>
                    <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px;">
                        ${['Calculation Mistake','Silly Mistake','Concept Gap','Time Issue','Careless Read','Good Attempt','Guessed'].map(tag=>{
                            const annKey=item.si+'_'+item.qi;
                            const ann=qAnnotations[annKey]||{};
                            const selected=(ann.tags||[]).includes(tag);
                            return `<button class="at-ann-tag${selected?' selected':''}" onclick="AT._toggleAnnotationTag(${item.si},${item.qi},'${tag}',this)">${tag}</button>`;
                        }).join('')}
                    </div>
                    <textarea class="at-ann-note" placeholder="Add personal note for this question..." style="width:100%;min-height:55px;font-size:0.8rem;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:var(--text);resize:vertical;margin:0;" onblur="AT._saveAnnotationNote(${item.si},${item.qi},this.value)">${(qAnnotations[item.si+'_'+item.qi]||{}).note||''}</textarea>
                </div>
            </div>`;
        });
        const ql=document.getElementById('at-solQList');
        if(ql)ql.innerHTML=html||`<div style="text-align:center;padding:40px;color:var(--text-dim);">No questions match this filter.</div>`;
    }

    function renderSolPalette(){
        if(!RES)return;
        const sub=ED.subjects[solSIcur];
        let corC=0,ptC=0,wrC=0,skC=0;let html='';
        sub.questions.forEach((_,qi)=>{
            const item=RES.allQ.find(x=>x.si===solSIcur&&x.qi===qi);
            if(!item){skC++;html+=`<button class="at-spq-skip" onclick="AT._scrollToSolQ(${solSIcur},${qi})">${qi+1}</button>`;return;}
            const{status}=item;
            let cls='';
            if(status==='correct'){cls='at-spq-correct';corC++;}
            else if(status==='partial'){cls='at-spq-partial';ptC++;}
            else if(status==='wrong'){cls='at-spq-wrong';wrC++;}
            else{cls='at-spq-skip';skC++;}
            html+=`<button class="${cls}" onclick="AT._scrollToSolQ(${solSIcur},${qi})">${qi+1}</button>`;
        });
        const pg=document.getElementById('at-solPalGrid');if(pg)pg.innerHTML=html;
        const pl=document.getElementById('at-solPalLegend');
        if(pl)pl.innerHTML=`
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.78rem;color:var(--text-dim);"><span style="width:14px;height:14px;border-radius:50%;background:var(--prod);display:inline-block;"></span>Correct <span style="margin-left:auto;font-family:var(--font-mono);font-size:0.7rem;">${corC}</span></div>
            ${ptC?`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.78rem;color:var(--text-dim);"><span style="width:14px;height:14px;border-radius:50%;background:var(--warn);display:inline-block;"></span>Partial <span style="margin-left:auto;font-family:var(--font-mono);font-size:0.7rem;">${ptC}</span></div>`:''}
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.78rem;color:var(--text-dim);"><span style="width:14px;height:14px;border-radius:50%;background:var(--unprod);display:inline-block;"></span>Wrong <span style="margin-left:auto;font-family:var(--font-mono);font-size:0.7rem;">${wrC}</span></div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.78rem;color:var(--text-dim);"><span style="width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,0.15);display:inline-block;border:1px solid var(--border-bright);"></span>Skipped <span style="margin-left:auto;font-family:var(--font-mono);font-size:0.7rem;">${skC}</span></div>
        `;
    }

    function _scrollToSolQ(si,qi){
        const el=document.getElementById(`at-solq-${si}-${qi}`);
        if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
    }

    function _getHistKey(){
        const uid=window.userContext?.uid||'guest';
        return `atest2_hist_${uid}`;
    }
    function getHist(){return JSON.parse(localStorage.getItem(_getHistKey())||'[]');}
    function _saveHist(r){
        const h=getHist();
        h.unshift({id:Date.now(),testId:r.testId||'',examName:r.examName,year:r.year,shift:r.shift,score:r.score,max:r.maxScore,acc:r.accuracy,cor:r.cor,wr:r.wr,sk:r.sk,pct:r.rank.pct,airMin:r.rank.airMin,airMax:r.rank.airMax,date:new Date().toLocaleDateString(),subs:r.subs,allQ:r.allQ,timeUsed:r.timeUsed});
        localStorage.setItem(_getHistKey(),JSON.stringify(h.slice(0,50)));
    }
    function _updateStreak(){
        const td=new Date().toDateString();
        const sk=JSON.parse(localStorage.getItem('atest_sk')||'{"c":0,"d":""}');
        if(sk.d===td)return;
        sk.c=sk.d===new Date(Date.now()-86400000).toDateString()?sk.c+1:1;
        sk.d=td;
        localStorage.setItem('atest_sk',JSON.stringify(sk));
    }

    let _histChart=null; let _histChartMetric='score'; let _currentReviewData=null;

    function buildHistPage(){
        const h=getHist();
        const body=document.getElementById('at-histBody');
        if(!body)return;
        _buildHistChart(h,'score');
        if(!h.length){
            body.innerHTML=`<div style="text-align:center;padding:60px 20px;"><div style="font-size:3rem;margin-bottom:16px;">📊</div><div style="font-family:var(--font-display);font-size:1.6rem;letter-spacing:0.1em;margin-bottom:8px;color:var(--text-dim);">NO TEST HISTORY</div><div style="font-size:0.85rem;color:var(--text-dim);">Complete a test to see your results here.</div></div>`;
            return;
        }
        body.innerHTML=h.map((x,i)=>{
            const pct=Math.round(x.score/x.max*100);
            const color=pct>=70?'var(--prod)':pct>=40?'var(--warn)':'var(--unprod)';
            const hasFull=!!(x.allQ&&x.allQ.length);
            return `<div class="at-hist-item" onclick="AT.openReview(${i})">
                <div style="min-width:54px;text-align:center;">
                    <div style="font-family:var(--font-mono);font-size:1.8rem;font-weight:700;color:${color};">${x.score}</div>
                    <div style="font-size:0.55rem;color:var(--text-dim);">/${x.max}</div>
                </div>
                <div style="flex:1;">
                    <div style="font-weight:700;font-size:0.88rem;margin-bottom:4px;">${x.examName} ${x.year} — Shift ${x.shift}</div>
                    <div style="font-size:0.7rem;color:var(--text-dim);">${x.date} &nbsp;·&nbsp; ✓${x.cor} ✗${x.wr} ○${x.sk} &nbsp;·&nbsp; Acc: ${x.acc}%</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <div style="text-align:center;">
                        <div style="font-size:0.62rem;color:var(--text-dim);">Percentile</div>
                        <div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:var(--accent);">${x.pct}%</div>
                    </div>
                    <span class="badge" style="background:rgba(255,255,255,0.06);color:${color};border:1px solid ${color}44;">${pct}%</span>
                    <button class="btn btn-sm" style="font-size:0.65rem;" onclick="event.stopPropagation();AT.downloadSingleJSON(${i})" title="Download"><i class="ph ph-download"></i></button>
                    ${hasFull?`<button class="btn btn-sm" style="font-size:0.65rem;border-color:rgba(0,229,160,0.4);color:var(--prod);" onclick="event.stopPropagation();AT.reattemptTest(${i})" title="Reattempt this test"><i class="ph ph-arrow-clockwise"></i> Reattempt</button>`:''}
                    <button class="btn btn-sm btn-danger" style="font-size:0.65rem;" onclick="event.stopPropagation();AT.deleteHistEntry(${i})" title="Delete this attempt"><i class="ph ph-trash"></i></button>
                    ${hasFull?`<span style="font-size:0.6rem;color:var(--prod);font-weight:700;">Full Review</span>`:`<span style="font-size:0.6rem;color:var(--text-dim);">Basic</span>`}
                </div>
            </div>`;
        }).join('');
    }

    function deleteHistEntry(idx) {
        if(!confirm('Delete this test attempt? This cannot be undone.')) return;
        const h = getHist();
        if(idx<0||idx>=h.length) return;
        h.splice(idx,1);
        localStorage.setItem(_getHistKey(), JSON.stringify(h));
        buildHistPage();
        loadLandStats();
    }

    function reattemptTest(idx) {
        const h = getHist();
        const x = h[idx];
        if(!x || !x.allQ || !x.allQ.length) { showErr('This attempt has no stored questions to reattempt (older/basic record).'); return; }
        // Rebuild subjects/questions from the stored per-question records (q holds the
        // full original question object, since allQ stores a reference to it at submit time).
        const bySI = {};
        x.allQ.forEach(item => {
            if(!bySI[item.si]) bySI[item.si] = { name: item.sn, questions: [] };
            bySI[item.si].questions[item.qi] = item.q;
        });
        const subjects = Object.keys(bySI).sort((a,b)=>a-b).map(k => ({
            name: bySI[k].name,
            questions: bySI[k].questions.filter(Boolean)
        }));
        if(!subjects.length || !subjects.some(s=>s.questions.length)) { showErr('Could not reconstruct this test — question data is incomplete.'); return; }
        ED = {
            exam: x.examName, year: x.year, shift: x.shift, testId: x.testId||'',
            duration: x.timeUsed ? Math.max(10, Math.ceil(x.timeUsed/60)) : 180,
            totalMarks: x.max, subjects
        };
        initExam();
    }

    function _buildHistChart(h,metric){
        _histChartMetric=metric;
        const canvas=document.getElementById('at-hist-chart');
        if(!canvas||!h.length)return;
        if(_histChart){_histChart.destroy();_histChart=null;}
        const rev=[...h].reverse();
        const labels=rev.map(x=>x.examName.replace('JEE ','')+'\''+String(x.year).slice(2)+' S'+x.shift);
        let data,label,color;
        if(metric==='score'){data=rev.map(x=>x.score);label='Score';color='#4f6ef7';}
        else if(metric==='pct'){data=rev.map(x=>x.pct||0);label='Percentile %';color='#00e5a0';}
        else{data=rev.map(x=>x.acc||0);label='Accuracy %';color='#fbbf24';}
        _histChart=new Chart(canvas,{type:'bar',data:{labels,datasets:[{label,data,backgroundColor:data.map(v=>{
            if(metric==='score')return 'rgba(79,110,247,0.7)';
            return v>=90?'rgba(0,229,160,0.7)':v>=70?'rgba(251,191,36,0.7)':'rgba(255,75,112,0.7)';
        }),borderColor:'transparent',borderRadius:4}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'rgba(255,255,255,0.4)',font:{size:9},maxRotation:45},grid:{display:false}},y:{ticks:{color:'rgba(255,255,255,0.4)',font:{size:10}},grid:{color:'rgba(255,255,255,0.06)'}}}}});
    }

    function switchHistChart(metric,btn){
        document.querySelectorAll('.at-hist-chart-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        _buildHistChart(getHist(),metric);
    }

    let _mistakeFilter = 'all';
    let _mistakeData = [];
    let _mistakeExtFilters = { testId: 'all', difficulty: 'all', qType: 'all', date: '' };

    function buildMistakesPage() {
        const h = getHist();
        _mistakeData = [];
        const testsSeen = new Set();

        h.forEach(function(test) {
            if (!test.allQ || !test.allQ.length) return;
            testsSeen.add(test.id);
            test.allQ.forEach(function(item) {
                if (item.status === 'wrong') {
                    _mistakeData.push({
                        examName: test.examName,
                        year: test.year,
                        shift: test.shift,
                        date: test.dateStr || test.date,
                        sn: item.sn || '',
                        chapter: (item.q && item.q.chapter) || 'Unknown Chapter',
                        topic: (item.q && item.q.topic) || '',
                        qType: (item.q && item.q.type) || '',
                        testId: test.testId || test.id || '',
                        question: (item.q && item.q.question) || '',
                        correct: item.q ? (Array.isArray(item.q.correct) ? item.q.correct.join(', ') : item.q.correct) : '',
                        ua: item.ua ? (Array.isArray(item.ua) ? item.ua.join(', ') : item.ua) : '—',
                        marks: item.q ? (item.q.negative !== undefined ? item.q.negative : -1) : -1,
                        difficulty: (item.q && item.q.difficulty) || '',
                        tm: item.tm || 0
                    });
                }
            });
        });

        // Update stats
        const el = function(id) { return document.getElementById(id); };
        if (el('mb-total')) el('mb-total').textContent = _mistakeData.length;
        const chapSet = new Set(_mistakeData.map(m => m.chapter));
        if (el('mb-chapters')) el('mb-chapters').textContent = chapSet.size;
        if (el('mb-tests')) el('mb-tests').textContent = testsSeen.size;
        const marksLost = _mistakeData.reduce(function(s,m){ return s + Math.abs(m.marks||1); }, 0);
        if (el('mb-marks')) el('mb-marks').textContent = marksLost;

        // Populate Test ID dropdown from what's actually in the mistake data
        const testSel = document.getElementById('mb-filter-test');
        if (testSel) {
            const testIds = Array.from(new Set(_mistakeData.map(m => m.testId).filter(Boolean)));
            testSel.innerHTML = '<option value="all">All Tests</option>' + testIds.map(id => `<option value="${escapeHTML(id)}">${escapeHTML(id)}</option>`).join('');
        }
        _mistakeExtFilters = { testId: 'all', difficulty: 'all', qType: 'all', date: '' };

        _mistakeFilter = 'all';
        document.querySelectorAll('#at-pg-mistakes .at-hist-chart-btn').forEach(b => b.classList.remove('active'));
        const firstBtn = document.querySelector('#at-pg-mistakes .at-hist-chart-btn');
        if (firstBtn) firstBtn.classList.add('active');

        renderMistakesBody();

        // Setup search
        const searchEl = document.getElementById('mb-search');
        if (searchEl) {
            searchEl.oninput = renderMistakesBody;
        }
    }

    function renderMistakesBody() {
        const body = document.getElementById('at-mistakes-body');
        if (!body) return;

        const search = (document.getElementById('mb-search') ? document.getElementById('mb-search').value.trim().toLowerCase() : '');
        let filtered = _mistakeData.filter(function(m) {
            if (_mistakeFilter !== 'all' && m.sn !== _mistakeFilter) return false;
            if (search && !m.chapter.toLowerCase().includes(search) && !m.question.toLowerCase().includes(search)) return false;
            if (_mistakeExtFilters.testId !== 'all' && m.testId !== _mistakeExtFilters.testId) return false;
            if (_mistakeExtFilters.difficulty !== 'all' && m.difficulty !== _mistakeExtFilters.difficulty) return false;
            if (_mistakeExtFilters.qType !== 'all' && m.qType !== _mistakeExtFilters.qType) return false;
            if (_mistakeExtFilters.date) {
                let mDateIso = '';
                try { mDateIso = getLocalIsoDate(new Date(m.date)); } catch(e) {}
                if (mDateIso !== _mistakeExtFilters.date) return false;
            }
            return true;
        });

        if (!filtered.length) {
            body.innerHTML = `<div style="text-align:center;padding:60px 20px;">
                <div style="font-size:3rem;margin-bottom:16px;">🎯</div>
                <div style="font-family:var(--font-display);font-size:1.6rem;letter-spacing:0.1em;color:var(--text-dim);">NO MISTAKES FOUND</div>
                <div style="font-size:0.85rem;color:var(--text-dim);margin-top:8px;">${_mistakeData.length===0?'Take tests to populate the mistake bank.':'No mistakes match the current filter.'}</div>
            </div>`;
            return;
        }

        // Group by chapter
        const byChapter = {};
        filtered.forEach(function(m) {
            const key = m.sn + ' · ' + m.chapter;
            if (!byChapter[key]) byChapter[key] = { sn: m.sn, chapter: m.chapter, items: [] };
            byChapter[key].items.push(m);
        });

        // Sort by mistake count desc
        const sortedKeys = Object.keys(byChapter).sort(function(a,b){ return byChapter[b].items.length - byChapter[a].items.length; });

        body.innerHTML = sortedKeys.map(function(key) {
            const grp = byChapter[key];
            // Dynamic color: find subject in ch_SUBJECTS by label match
            const _S = window.ch_SUBJECTS || {};
            const matchedSub = Object.values(_S).find(function(s){ return s.label === grp.sn; });
            const subColor = matchedSub ? matchedSub.color : (grp.sn==='Physics' ? 'var(--sleep)' : grp.sn==='Chemistry' ? 'var(--health)' : '#a855f7');
            const items = grp.items.map(function(m) {
                const p2 = function(n){ return String(n).padStart(2,'0'); };
                return `<div class="at-rev-q-item wrong" style="margin-bottom:10px;">
                    <div style="font-size:0.8rem;line-height:1.6;color:var(--text);margin-bottom:8px;">${escapeHTML((m.question||'').slice(0,220))}${m.question&&m.question.length>220?'…':''}</div>
                    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.72rem;">
                        <span>✗ You: <strong style="color:var(--unprod);">${escapeHTML(String(m.ua))}</strong></span>
                        <span>✓ Ans: <strong style="color:var(--prod);">${escapeHTML(String(m.correct))}</strong></span>
                        <span style="color:var(--text-dim);">📅 ${m.examName} ${m.year} S${m.shift}</span>
                        ${m.difficulty?`<span style="color:var(--text-dim);">Diff: ${m.difficulty}</span>`:''}
                        <span style="color:var(--text-dim);">⏱ ${p2(Math.floor((m.tm||0)/60))}:${p2((m.tm||0)%60)}</span>
                    </div>
                </div>`;
            }).join('');
            return `<div style="margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 16px;background:rgba(255,75,112,0.07);border:1px solid rgba(255,75,112,0.2);border-radius:var(--radius-sm);">
                    <span style="font-size:0.65rem;font-weight:800;color:${subColor};text-transform:uppercase;letter-spacing:0.1em;">${escapeHTML(grp.sn)}</span>
                    <span style="font-weight:700;font-size:0.9rem;color:var(--text);">${escapeHTML(grp.chapter)}</span>
                    <span class="badge badge-unprod" style="font-size:0.6rem;margin-left:auto;">${grp.items.length} mistake${grp.items.length>1?'s':''}</span>
                </div>
                ${items}
            </div>`;
        }).join('');
    }

    function filterMistakes(subj, btn) {
        _mistakeFilter = subj;
        document.querySelectorAll('#at-pg-mistakes .at-hist-chart-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderMistakesBody();
    }

    function applyMistakeFilters() {
        const testSel = document.getElementById('mb-filter-test');
        const diffSel = document.getElementById('mb-filter-difficulty');
        const typeSel = document.getElementById('mb-filter-type');
        const dateInp = document.getElementById('mb-filter-date');
        _mistakeExtFilters = {
            testId: testSel ? testSel.value : 'all',
            difficulty: diffSel ? diffSel.value : 'all',
            qType: typeSel ? typeSel.value : 'all',
            date: dateInp ? dateInp.value : ''
        };
        renderMistakesBody();
    }

    function clearMistakeFilters() {
        const testSel = document.getElementById('mb-filter-test');
        const diffSel = document.getElementById('mb-filter-difficulty');
        const typeSel = document.getElementById('mb-filter-type');
        const dateInp = document.getElementById('mb-filter-date');
        if (testSel) testSel.value = 'all';
        if (diffSel) diffSel.value = 'all';
        if (typeSel) typeSel.value = 'all';
        if (dateInp) dateInp.value = '';
        _mistakeExtFilters = { testId: 'all', difficulty: 'all', qType: 'all', date: '' };
        renderMistakesBody();
    }

    // ── REVIEW NOTES SUMMARY ──────────────────────────────────
    let _notesFilter = 'all';
    let _allNotesCache = [];

    function buildNotesPage() {
        _allNotesCache = [];
        const h = getHist();
        h.forEach((test) => {
            const anns = test.annotations || {};
            const allQ = test.allQ || [];
            // Build a lookup from si_qi -> question info
            const qMap = {};
            allQ.forEach(item => {
                const key = `${item.si}_${item.qi}`;
                qMap[key] = item;
            });
            // Also build from subjects if allQ is empty (older format)
            if(allQ.length === 0 && test.subs) {
                // No per-question data in older saves
            }
            // Iterate all annotation keys
            Object.keys(anns).forEach(key => {
                const ann = anns[key] || {};
                const tags = ann.tags || [];
                const note = (ann.note || '').trim();
                if(!tags.length && !note) return;
                const qInfo = qMap[key];
                const [siStr, qiStr] = key.split('_');
                const si = parseInt(siStr), qi = parseInt(qiStr);
                // Get subject name from subs array if available
                let subjectName = '';
                if(test.subs && test.subs[si]) subjectName = test.subs[si].name || '';
                const qText = qInfo && qInfo.q ? (qInfo.q.question || '').substring(0, 140) : '';
                const status = qInfo ? qInfo.status : '';
                _allNotesCache.push({
                    testName: (test.examName || 'Test') + (test.year ? ' ' + test.year : '') + (test.shift ? ' S' + test.shift : ''),
                    testDate: test.date || '',
                    testId: test.id,
                    subject: subjectName,
                    qNum: qi + 1,
                    qText,
                    tags,
                    note,
                    status, // 'correct', 'wrong', 'skipped', 'partial'
                });
            });
        });

        // Update stat counters
        function setEl(id, v) { const el = document.getElementById(id); if(el) el.textContent = v; }
        setEl('notes-total', _allNotesCache.length);
        setEl('notes-silly', _allNotesCache.filter(n => n.tags.includes('Silly Mistake')).length);
        setEl('notes-time',  _allNotesCache.filter(n => n.tags.includes('Time Issue')).length);
        setEl('notes-concept', _allNotesCache.filter(n => n.tags.includes('Concept Gap')).length);
        setEl('notes-good',  _allNotesCache.filter(n => n.tags.includes('Good Attempt')).length);
        setEl('notes-hasnote', _allNotesCache.filter(n => n.note).length);

        _notesFilter = 'all';
        document.querySelectorAll('#at-pg-notes .at-hist-chart-btn').forEach(b => {
            b.classList.toggle('active', b.textContent.trim() === 'All');
        });
        renderNotesBody('all', '');
    }

    function renderNotesBody(filter, search) {
        const body = document.getElementById('at-notes-body');
        if (!body) return;
        search = (search || '').toLowerCase().trim();
        let items = _allNotesCache.slice();
        if (filter && filter !== 'all') {
            if (filter === 'has_note') items = items.filter(n => n.note);
            else items = items.filter(n => n.tags.includes(filter));
        }
        if (search) {
            items = items.filter(n =>
                n.note.toLowerCase().includes(search) ||
                n.qText.toLowerCase().includes(search) ||
                n.testName.toLowerCase().includes(search) ||
                n.subject.toLowerCase().includes(search)
            );
        }
        if (!items.length) {
            body.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim);font-size:0.9rem;">
                <div style="font-size:3rem;margin-bottom:16px;">📭</div>
                <div style="font-weight:700;margin-bottom:8px;">No review notes found</div>
                <div style="font-size:0.8rem;max-width:340px;margin:0 auto;line-height:1.6;">After completing a test, go to <strong>Test History → Open Review → click any question</strong> to add mistake tags (Silly Mistake, Time Issue, etc.) or write a personal note.</div>
            </div>`;
            return;
        }
        const tagColors = {
            'Silly Mistake': 'var(--danger)',
            'Time Issue':    'var(--warn)',
            'Concept Gap':   'var(--sleep)',
            'Good Attempt':  'var(--health)',
            'Needs Revision':'#a855f7'
        };
        const statusIcon = { correct:'✅', wrong:'❌', skipped:'○', partial:'⚡' };
        // Group by test
        const byTest = {};
        items.forEach(n => {
            if (!byTest[n.testName]) byTest[n.testName] = { date: n.testDate, items: [] };
            byTest[n.testName].items.push(n);
        });
        body.innerHTML = Object.entries(byTest).map(([testName, group]) => `
            <div class="card" style="margin-bottom:20px;padding:0;overflow:hidden;border:1px solid var(--border);">
                <div style="padding:14px 20px;background:linear-gradient(135deg,rgba(79,110,247,0.12),rgba(0,0,0,0));border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div style="font-weight:700;font-size:1rem;color:var(--accent);">${escapeHTML(testName)}</div>
                    <div style="font-size:0.7rem;color:var(--text-dim);">${group.date} &nbsp;·&nbsp; ${group.items.length} annotated question${group.items.length!==1?'s':''}</div>
                </div>
                ${group.items.map((n,idx) => `
                <div style="padding:16px 20px;${idx < group.items.length-1 ? 'border-bottom:1px solid var(--border);':''}" >
                    <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                        <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:6px;">
                            <div style="font-family:var(--font-mono);font-size:0.7rem;padding:4px 10px;border-radius:6px;background:rgba(0,0,0,0.3);border:1px solid var(--border);color:var(--text-dim);white-space:nowrap;">${escapeHTML(n.subject||'Q')} #${n.qNum}</div>
                            <div style="font-size:1.1rem;" title="${n.status}">${statusIcon[n.status]||'○'}</div>
                        </div>
                        <div style="flex:1;min-width:0;">
                            ${n.qText ? `<div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:10px;line-height:1.55;border-left:3px solid var(--border);padding-left:10px;">${escapeHTML(n.qText)}${n.qText.length>=140?'…':''}</div>` : ''}
                            ${n.tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${n.note?'10px':'0'};">
                                ${n.tags.map(t=>`<span style="padding:4px 12px;border-radius:99px;font-size:0.7rem;font-weight:700;background:${tagColors[t]||'rgba(255,255,255,0.08)'}22;border:1px solid ${tagColors[t]||'var(--border)'};color:${tagColors[t]||'var(--text-dim)'};">${escapeHTML(t)}</span>`).join('')}
                            </div>` : ''}
                            ${n.note ? `<div style="font-size:0.85rem;line-height:1.65;color:var(--text);padding:12px 16px;background:rgba(79,110,247,0.06);border-radius:10px;border-left:3px solid var(--accent);white-space:pre-wrap;">${escapeHTML(n.note)}</div>` : ''}
                        </div>
                    </div>
                </div>`).join('')}
            </div>`).join('');
    }

    function filterNotes(filter, btn, search) {
        _notesFilter = filter || 'all';
        document.querySelectorAll('#at-pg-notes .at-hist-chart-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const s = search !== undefined ? search : ((document.getElementById('notes-search') || {}).value || '');
        renderNotesBody(_notesFilter, s);
    }

    function exportNotes() {
        if (!_allNotesCache.length) { alert('No review notes found. Please add notes/tags after reviewing a test.'); return; }
        const lines = _allNotesCache.map(n =>
            `[${n.testName}] ${n.subject} Q${n.qNum} (${n.status||'?'})\nTags: ${n.tags.join(', ')||'None'}\nNote: ${n.note||'(no note)'}`
        ).join('\n\n---\n\n');
        const blob = new Blob([lines], {type: 'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `review_notes_${Date.now()}.txt`;
        a.click();
    }

    function exportAllHistJSON(){
        const h=getHist();
        if(!h.length){alert('No test history to export.');return;}
        const blob=new Blob([JSON.stringify(h,null,2)],{type:'application/json'});
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);
        a.download=`astratest_history_${Date.now()}.json`;a.click();
    }

    function downloadSingleJSON(idx){
        const h=getHist();const x=h[idx];if(!x)return;
        const blob=new Blob([JSON.stringify(x,null,2)],{type:'application/json'});
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);
        a.download=`${x.examName}_${x.year}_S${x.shift}_${x.date.replace(/\//g,'-')}.json`;a.click();
    }

    function downloadReviewJSON(){
        if(!_currentReviewData)return;
        const blob=new Blob([JSON.stringify(_currentReviewData,null,2)],{type:'application/json'});
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);
        a.download=`review_${_currentReviewData.examName}_${Date.now()}.json`;a.click();
    }

    function downloadSampleJSON(){
        const sample=getDemoData();
        const blob=new Blob([JSON.stringify(sample,null,2)],{type:'application/json'});
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);
        a.download='sample_jee_main.astrotest';a.click();
    }

    let _revFilt='all'; let _revCharts={};
    function openReview(idx){
        const h=getHist();const x=h[idx];if(!x)return;
        _currentReviewData=x;_revFilt='all';
        const t=document.getElementById('at-rev-title');
        if(t)t.textContent=`${x.examName} ${x.year} — Shift ${x.shift}`;
        const s=document.getElementById('at-rev-subtitle');
        if(s)s.textContent=`${x.date} · Score: ${x.score}/${x.max} · Accuracy: ${x.acc}% · Percentile: ${x.pct}%`;
        
        // NEW: Inject the View Solutions button dynamically
        const actionsDiv = document.querySelector('#at-pg-review > div:first-child > div:last-child');
        if(actionsDiv) {
            actionsDiv.innerHTML = `
                <button class="btn btn-sm btn-primary" onclick="AT.buildSolutionPageFromHistory()">View Solutions</button>
                <button class="btn btn-sm" onclick="AT.downloadReviewJSON()" style="background:rgba(0,229,160,0.1);border-color:rgba(0,229,160,0.3);"><i class="ph ph-download"></i> JSON</button>
                <button class="btn btn-sm" onclick="AT.showAtPage('at-pg-hist')">← History</button>
            `;
        }

        const pct=Math.round(x.score/x.max*100);
        const pc=pct>=70?'var(--prod)':pct>=40?'var(--warn)':'var(--unprod)';
        const sc=document.getElementById('at-rev-summary-cards');
        if(sc)sc.innerHTML=[
            {l:'Score',v:`${x.score}<span style="font-size:0.7rem;color:var(--text-dim);">/${x.max}</span>`,c:'var(--accent)'},
            {l:'Percentage',v:pct+'%',c:pc},
            {l:'Percentile',v:(x.pct||0)+'%',c:'var(--prod)'},
            {l:'✓ Correct',v:x.cor,c:'var(--prod)'},
            {l:'✗ Wrong',v:x.wr,c:'var(--unprod)'},
            {l:'○ Skipped',v:x.sk,c:'var(--text-dim)'},
            {l:'AIR Est.',v:`${fmtIndian(x.airMin||0)}–${fmtIndian(x.airMax||0)}`,c:'var(--warn)'},
            {l:'Accuracy',v:x.acc+'%',c:'var(--sleep)'}
        ].map(item=>`<div class="stat-box" style="border-bottom:3px solid ${item.c};text-align:center;">
            <label>${item.l}</label>
            <span style="color:${item.c};font-size:1rem;">${item.v}</span>
        </div>`).join('');
        const rc=document.getElementById('at-rev-rank-card');
        if(rc)rc.innerHTML=`
            <div style="font-size:3rem;">🎯</div>
            <div style="flex:1;">
                <div style="font-family:var(--font-display);font-size:1.1rem;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:8px;">RANK PREDICTION</div>
                <div style="font-size:1.4rem;font-weight:700;color:var(--accent);font-family:var(--font-mono);">${x.pct}th Percentile</div>
                <div style="font-size:0.82rem;color:var(--text-dim);margin-top:4px;">Expected AIR: <strong style="color:var(--warn);">${fmtIndian(x.airMin||0)} – ${fmtIndian(x.airMax||0)}</strong></div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.1em;">Score Band</div>
                <div style="font-family:var(--font-mono);font-size:2rem;font-weight:700;color:${pc};">${pct}%</div>
            </div>`;
        _drawRevCharts(x);
        _renderRevQuestions(x,_revFilt);
        showAtPage('at-pg-review');
    }

    // NEW: Function to load the solutions page for past tests
    function buildSolutionPageFromHistory() {
        if(!_currentReviewData) return;
        RES = _currentReviewData; 
        qAnnotations = RES.annotations || {}; 
        solSIcur = 0; solFilt = 'all';
        
        const st=document.getElementById('at-solTime'),sb=document.getElementById('at-solNameBar');
        if(st)st.textContent=`${p2(Math.floor(RES.timeUsed/3600))}:${p2(Math.floor((RES.timeUsed%3600)/60))}:${p2(RES.timeUsed%60)}`;
        if(sb)sb.textContent=`${RES.examName} ${RES.year} - Shift ${RES.shift}`;
        
        buildSolSubjBar();
        renderSolQuestions();
        renderSolPalette();
        showAtPage('at-pg-sol');
    }

    function _drawRevCharts(x){
        Object.values(_revCharts).forEach(c=>{try{c.destroy();}catch(e){}});
        _revCharts={};
        const dc=document.getElementById('at-rev-donut');
        if(dc)_revCharts.donut=new Chart(dc,{type:'doughnut',data:{labels:['Correct','Wrong','Skipped'],datasets:[{data:[x.cor,x.wr,x.sk],backgroundColor:['rgba(0,229,160,0.8)','rgba(255,75,112,0.8)','rgba(255,255,255,0.15)'],borderColor:['#00e5a0','#ff4b70','rgba(255,255,255,0.1)'],borderWidth:1}]},options:{cutout:'68%',plugins:{legend:{position:'bottom',labels:{color:'rgba(255,255,255,0.5)',font:{size:10},padding:8}}}}});
        const bc=document.getElementById('at-rev-bar');
        if(bc&&x.subs&&x.subs.length){
            const labels=x.subs.map(s=>s.name);
            const scored=x.subs.map(s=>Math.max(0,s.score));
            const maxed=x.subs.map(s=>s.max);
            _revCharts.bar=new Chart(bc,{type:'bar',data:{labels,datasets:[
                {label:'Scored',data:scored,backgroundColor:'rgba(79,110,247,0.8)',borderRadius:4},
                {label:'Max',data:maxed,backgroundColor:'rgba(255,255,255,0.08)',borderRadius:4}
            ]},options:{responsive:true,plugins:{legend:{labels:{color:'rgba(255,255,255,0.5)',font:{size:10}}}},scales:{x:{ticks:{color:'rgba(255,255,255,0.4)'},grid:{display:false}},y:{ticks:{color:'rgba(255,255,255,0.4)'},grid:{color:'rgba(255,255,255,0.06)'}}}}});
        }
        const tc=document.getElementById('at-rev-time');
        if(tc&&x.subs&&x.subs.length){
            _revCharts.time=new Chart(tc,{type:'bar',data:{labels:x.subs.map(s=>s.name),datasets:[{label:'Time (min)',data:x.subs.map(s=>Math.round((s.time||0)/60)),backgroundColor:['rgba(0,229,160,0.7)','rgba(251,191,36,0.7)','rgba(124,58,237,0.7)'],borderRadius:4}]},options:{responsive:true,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{ticks:{color:'rgba(255,255,255,0.4)'},grid:{color:'rgba(255,255,255,0.06)'}},y:{ticks:{color:'rgba(255,255,255,0.4)'},grid:{display:false}}}}});
        }
    }

    function filterReview(filt,btn){
        _revFilt=filt;
        document.querySelectorAll('#at-pg-review .at-hist-chart-btn').forEach(b=>b.classList.remove('active'));
        if(btn)btn.classList.add('active');
        if(_currentReviewData)_renderRevQuestions(_currentReviewData,filt);
    }

    function _renderRevQuestions(x,filt){
        const body=document.getElementById('at-rev-qbody');
        if(!body)return;
        if(!x.allQ||!x.allQ.length){
            body.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-dim);">
                <div style="font-size:2rem;margin-bottom:12px;">📝</div>
                <div>Full question review not available for this test.</div>
                <div style="font-size:0.78rem;margin-top:8px;">Run a new test to get complete Q&A review.</div>
            </div>`;return;
        }
        let qs=x.allQ;
        if(filt==='correct')qs=qs.filter(q=>q.status==='correct');
        else if(filt==='partial')qs=qs.filter(q=>q.status==='partial');
        else if(filt==='wrong')qs=qs.filter(q=>q.status==='wrong');
        else if(filt==='skipped')qs=qs.filter(q=>q.status==='skipped');
        if(!qs.length){body.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-dim);">No questions in this category.</div>`;return;}
        body.innerHTML=qs.map((item,i)=>{
            const{q,ua,status,tm,sn}=item;
            const scolor=status==='correct'?'var(--prod)':status==='partial'?'var(--warn)':status==='wrong'?'var(--unprod)':'var(--text-dim)';
            const sicon=status==='correct'?'✓':status==='partial'?'◐':status==='wrong'?'✗':'○';
            const elapsed=tm?`${p2(Math.floor(tm/60))}:${p2(tm%60)}`:'—';
            let optsHtml='';
            if(_effAnswerType(q)==='mcq'||_effAnswerType(q)==='multi-correct'){
                const ca=Array.isArray(q.correct)?q.correct.map(v=>v.toUpperCase()):[String(q.correct).toUpperCase()];
                const uaa=Array.isArray(ua)?ua.map(v=>v.toUpperCase()):(ua?[String(ua).toUpperCase()]:[]);
                optsHtml='<div style="display:flex;flex-direction:column;gap:7px;margin:10px 0;">'+
                q.options.map((o,idx)=>{
                    const l=LTR[idx],isC=ca.includes(l),isU=uaa.includes(l);
                    const bg=isC?'rgba(0,229,160,0.08)':isU&&!isC?'rgba(255,75,112,0.08)':'rgba(0,0,0,0.2)';
                    const bc=isC?'rgba(0,229,160,0.4)':isU&&!isC?'rgba(255,75,112,0.4)':'var(--border-bright)';
                    const lc=isC?'var(--prod)':isU&&!isC?'var(--unprod)':'var(--text-dim)';
                    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border:1px solid ${bc};border-radius:var(--radius-sm);background:${bg};font-size:0.84rem;">
                        <span style="width:22px;height:22px;border-radius:50%;border:1px solid ${bc};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:${lc};flex-shrink:0;">${isC?'✓':isU&&!isC?'✗':l}</span>
                        <span style="color:${isC?'var(--prod)':isU&&!isC?'var(--unprod)':'var(--text)'};">${escapeHTML(o)}</span>
                        ${isC?`<span style="margin-left:auto;font-size:0.65rem;color:var(--prod);font-weight:700;">Correct</span>`:''}
                        ${isU&&!isC?`<span style="margin-left:auto;font-size:0.65rem;color:var(--unprod);font-weight:700;">Your Answer</span>`:''}
                    </div>`;
                }).join('')+'</div>';
            } else {
                const correct=q.correct||'—';
                const given=ua!==undefined&&ua!==''?ua:'Not Attempted';
                optsHtml=`<div style="display:flex;gap:12px;margin:10px 0;flex-wrap:wrap;">
                    <div style="padding:10px 16px;border:1px solid rgba(0,229,160,0.3);border-radius:var(--radius-sm);background:rgba(0,229,160,0.06);font-family:var(--font-mono);">✓ <span style="color:var(--prod);">${escapeHTML(String(correct))}</span></div>
                    <div style="padding:10px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font-mono);">Your: <span style="color:${status==='correct'?'var(--prod)':status==='wrong'?'var(--unprod)':'var(--text-dim)'};">${escapeHTML(String(given))}</span></div>
                </div>`;
            }
            return `<div class="at-rev-q-item ${status}">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <span style="font-family:var(--font-mono);font-size:0.7rem;font-weight:700;padding:3px 8px;border-radius:99px;background:${scolor}22;color:${scolor};border:1px solid ${scolor}44;">${sicon} ${status.toUpperCase()}</span>
                    <span style="font-size:0.7rem;color:var(--text-dim);">${escapeHTML(sn||'')} · ${escapeHTML(q.chapter||'')} · ${escapeHTML(q.topic||'')}</span>
                    <span style="margin-left:auto;font-size:0.68rem;color:var(--text-dim);">⏱ ${elapsed}</span>
                    <span class="badge" style="font-size:0.6rem;background:${q.difficulty==='easy'?'rgba(0,229,160,0.1)':q.difficulty==='hard'?'rgba(255,75,112,0.1)':'rgba(251,191,36,0.1)'};">${q.difficulty||'—'}</span>
                </div>
                <div style="font-size:0.88rem;line-height:1.65;margin-bottom:8px;color:var(--text);">Q${i+1}. ${escapeHTML(q.question||'')}</div>
                ${optsHtml}
                ${q.solution?`<div style="margin-top:10px;padding:12px 14px;background:rgba(79,110,247,0.07);border:1px solid rgba(79,110,247,0.25);border-radius:var(--radius-sm);font-size:0.8rem;line-height:1.6;color:var(--text-dim);"><span style="color:var(--accent);font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;">Solution</span><br>${escapeHTML(q.solution)}</div>`:''}
            </div>`;
        }).join('');
    }

    function _showAnnSaving(indicator) {
        if(!indicator) return;
        indicator.textContent = '💾 Saving…';
        indicator.style.color = 'var(--warn)';
        indicator.style.opacity = '1';
    }
    function _showAnnSaved(indicator) {
        if(!indicator) return;
        indicator.textContent = '✓ Saved';
        indicator.style.color = 'var(--prod)';
        indicator.style.opacity = '1';
        setTimeout(() => { if(indicator) indicator.style.opacity = '0.4'; }, 1800);
    }
    function _toggleAnnotationTag(si,qi,tag,btn){
        const k=si+'_'+qi;
        if(!qAnnotations[k])qAnnotations[k]={tags:[],note:''};
        const tags=qAnnotations[k].tags;
        const idx=tags.indexOf(tag);
        if(idx>=0){tags.splice(idx,1);btn.classList.remove('selected');}
        else{tags.push(tag);btn.classList.add('selected');}
        const ind = document.getElementById(`ann-save-ind-${si}-${qi}`);
        _showAnnSaving(ind);
        _saveAnnotationsFirestore(()=>_showAnnSaved(ind));
    }
    function _saveAnnotationNote(si,qi,val){
        const k=si+'_'+qi;
        if(!qAnnotations[k])qAnnotations[k]={tags:[],note:''};
        qAnnotations[k].note=val;
        const ind = document.getElementById(`ann-save-ind-${si}-${qi}`);
        _showAnnSaving(ind);
        _saveAnnotationsFirestore(()=>_showAnnSaved(ind));
    }
    let _annSaveTimer=null;
    function _saveAnnotationsFirestore(cb){
        if(RES){
            const h=getHist();
            if(h.length){const k=_getHistKey();const arr=JSON.parse(localStorage.getItem(k)||'[]');if(arr.length){arr[0].annotations=qAnnotations;localStorage.setItem(k,JSON.stringify(arr));}}
        }
        if(_annSaveTimer)clearTimeout(_annSaveTimer);
        _annSaveTimer=setTimeout(async()=>{
            if(!RES)return;
            const db=window._fbDb,uid=window._fbUid,fns=window._fbFns;
            if(!db||!uid||uid==='guest'||!fns){ cb&&cb(); return; }
            try{
                const h=getHist();
                if(!h.length){ cb&&cb(); return; }
                const docId=`test_${h[0].id}`;
                await fns.setDoc(fns.doc(db,'users2',uid,'astratest',docId),{annotations:qAnnotations},{merge:true});
                cb&&cb();
            }catch(e){console.warn('Annotation save error:',e); cb&&cb();}
        },900);
    }

    async function _loadHistFirestore(){
        const db=window._fbDb,uid=window._fbUid,fns=window._fbFns;
        if(!db||!uid||uid==='guest'||!fns)return;
        try{
            const snap=await fns.getDocs(fns.collection(db,'users2',uid,'astratest'));
            if(!snap||snap.empty)return;
            const fbTests=[];
            snap.forEach(d=>{const data=d.data();if(data&&data.examName)fbTests.push(data);});
            fbTests.sort((a,b)=>b.id-a.id);
            const localH=getHist();
            const merged=[...fbTests];
            localH.forEach(lh=>{if(!merged.find(x=>x.id===lh.id))merged.push(lh);});
            merged.sort((a,b)=>b.id-a.id);
            localStorage.setItem(_getHistKey(),JSON.stringify(merged.slice(0,50)));
        }catch(e){console.warn('Firestore astratest load error:',e);}
    }

    return {
        showAtPage, loadLandStats, handleDrop, handleFile, startDemo, initExam,
        switchSubject, switchSubjectDropdown, renderQ, renderPal,
        saveNext, prevQ, nextQ, gotoQ, clearResponse, markReview,
        openSubModal, closeSubModal, confirmSubmit, doSubmit, exitExam,
        buildSolutionPage, filterSolQuestions, buildSolutionPageFromHistory,
        closeErr,
        _toggleAnnotationTag, _saveAnnotationNote,
        _selOpt, _togMulti, _saveNum, _switchSolSubj, _scrollToSolQ,
        switchHistChart, openReview, filterReview,
        exportAllHistJSON, downloadSingleJSON, downloadReviewJSON, downloadSampleJSON,
        deleteHistEntry, reattemptTest,
        buildMistakesPage, filterMistakes, applyMistakeFilters, clearMistakeFilters,
        buildNotesPage, filterNotes, exportNotes,
        onTabActivate: function() {
            ['at-pg-hist','at-pg-review','at-pg-mistakes','at-pg-notes'].forEach(id=>{
                const el=document.getElementById(id);if(el)el.style.display='none';
            });
            const land=document.getElementById('at-pg-land');if(land)land.style.display='block';
            _loadHistFirestore().then(()=>loadLandStats());
        }
    };
})();

(function(){
    const origSwitchTab = window.switchTab;
    window.switchTab = function(tab) {
        origSwitchTab && origSwitchTab(tab);
        if(tab === 'astratest') {
            window.AT && window.AT.onTabActivate();
        }
    };
    document.addEventListener('DOMContentLoaded', function() {
        const navLinks = document.querySelectorAll('.nav-link[data-tab="astratest"]');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                setTimeout(() => { window.AT && window.AT.onTabActivate(); }, 50);
            });
        });
    });
})();

// ============================================================
// ALARMS / REMINDERS SYSTEM — REBUILT
// ============================================================
let alarms_db = [];
let _alarmCheckInterval = null;
let _currentFiringAlarm = null;
let _alarmSelectedDays = new Set();
let _alarmCurrentRepeat = 'once';

function alarmsLoad() {
    try { alarms_db = JSON.parse(localStorage.getItem('astraea_alarms') || '[]'); } catch(e){ alarms_db=[]; }
}
function alarmsSave() {
    try { localStorage.setItem('astraea_alarms', JSON.stringify(alarms_db)); } catch(e){}
    triggerSave();
}

// ── Repeat pill selector ──────────────────────────────────────
window._alarmSelectRepeat = function(val) {
    _alarmCurrentRepeat = val;
    document.getElementById('alarm-rep-once').checked = val === 'once';
    document.getElementById('alarm-rep-daily').checked = val === 'daily';
    document.getElementById('alarm-rep-weekly').checked = val === 'weekly';
    ['once','daily','weekly'].forEach(v => {
        const lbl = document.getElementById('alrep-lbl-'+v);
        if(lbl) lbl.classList.toggle('selected', v === val);
    });
    const dp = document.getElementById('alarm-days-picker');
    const ddp = document.getElementById('alarm-date-picker-wrap');
    if(dp) dp.style.display = val === 'weekly' ? 'block' : 'none';
    if(ddp) ddp.style.display = val === 'once' ? 'block' : 'none';
    if(val !== 'weekly') _alarmSelectedDays.clear();
};

// ── Day pill toggle ───────────────────────────────────────────
window._alarmToggleDay = function(el) {
    const d = parseInt(el.dataset.day);
    if(_alarmSelectedDays.has(d)) { _alarmSelectedDays.delete(d); el.classList.remove('active'); }
    else { _alarmSelectedDays.add(d); el.classList.add('active'); }
};

// ── Notification permission ───────────────────────────────────
window._requestAlarmNotifPerm = function() {
    if(!('Notification' in window)) return;
    Notification.requestPermission().then(p => {
        if(p === 'granted') {
            document.getElementById('alarm-notif-banner').style.display = 'none';
            _showAlarmNotifBanner();
        }
    });
};
function _showAlarmNotifBanner() {
    const b = document.getElementById('alarm-notif-banner');
    if(!b) return;
    if(!('Notification' in window) || Notification.permission === 'granted') {
        b.style.display = 'none';
    } else {
        b.style.display = 'flex';
    }
}

// ── EVENT HORIZON TAB SWITCHER ────────────────────────────────
window.ehSwitchTab = function(tab) {
    const evSec = document.getElementById('eh-section-events');
    const alSec = document.getElementById('eh-section-alarms');
    const evBtn = document.getElementById('eh-tab-events');
    const alBtn = document.getElementById('eh-tab-alarms');
    if(!evSec || !alSec) return;
    if(tab === 'alarms') {
        evSec.style.display = 'none'; alSec.style.display = 'block';
        if(alBtn){ alBtn.style.background='linear-gradient(135deg,var(--accent),var(--accent2))'; alBtn.style.color='#fff'; alBtn.style.boxShadow='0 4px 14px rgba(79,110,247,0.35)'; }
        if(evBtn){ evBtn.style.background='transparent'; evBtn.style.color='var(--text-dim)'; evBtn.style.boxShadow='none'; }
        renderAlarms();
        _showAlarmNotifBanner();
    } else {
        evSec.style.display = 'block'; alSec.style.display = 'none';
        if(evBtn){ evBtn.style.background='linear-gradient(135deg,var(--accent),var(--accent2))'; evBtn.style.color='#fff'; evBtn.style.boxShadow='0 4px 14px rgba(79,110,247,0.35)'; }
        if(alBtn){ alBtn.style.background='transparent'; alBtn.style.color='var(--text-dim)'; alBtn.style.boxShadow='none'; }
    }
};

// ── Alarm sound engine (synth) ────────────────────────────────
window._alarmAudioCtx = null;
window._alarmAnodes = [];
window._alarmPrevAud = null;
window._alarmLoopTimeouts = []; // FIX: track all loop timeouts so they can be cleared
window._alarmStopped = false;   // FIX: flag to prevent new loops after stop

function _alarmActx() {
    if(!window._alarmAudioCtx) window._alarmAudioCtx = new (window.AudioContext||window.webkitAudioContext)();
    return window._alarmAudioCtx;
}
function _alarmStopAll() {
    // FIX: Set stopped flag FIRST to prevent any pending setTimeout from re-firing
    window._alarmStopped = true;
    // Clear all pending loop timeouts
    window._alarmLoopTimeouts.forEach(t => clearTimeout(t));
    window._alarmLoopTimeouts = [];
    window._alarmAnodes.forEach(n=>{try{n.stop&&n.stop();n.disconnect&&n.disconnect();}catch(e){}});
    window._alarmAnodes=[];
    if(window._alarmPrevAud){window._alarmPrevAud.pause();window._alarmPrevAud.currentTime=0;window._alarmPrevAud=null;}
    // FIX: Also close the AudioContext to kill any still-playing nodes
    if(window._alarmAudioCtx){try{window._alarmAudioCtx.close();}catch(e){}window._alarmAudioCtx=null;}
}
function _alarmTone(ctx,dst,freq,type,t,dur,v=1){
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g);g.connect(dst);o.start(t);o.stop(t+dur);window._alarmAnodes.push(o);
}
function _alarmGenSound(id,vol,loop){
    // FIX: Don't start if alarm was stopped
    if(window._alarmStopped) return;
    const ctx=_alarmActx(),g=ctx.createGain();g.gain.value=vol;g.connect(ctx.destination);
    const t=ctx.currentTime;
    const scheduleLoop=(delay)=>{
        if(!loop) return;
        const tid=setTimeout(()=>{ if(!window._alarmStopped) _alarmGenSound(id,vol,true); }, delay);
        window._alarmLoopTimeouts.push(tid);
    };
    const fns={
        lofi:()=>{[261,329,392,493].forEach((f,i)=>_alarmTone(ctx,g,f,'sine',t+i*.05,2,.35));scheduleLoop(5000);},
        bells:()=>{[523,659,784,1047].forEach((f,i)=>_alarmTone(ctx,g,f,'sine',t+i*.3,.8,.7));scheduleLoop(3000);},
        digital:()=>{for(let i=0;i<6;i++){_alarmTone(ctx,g,880,'square',t+i*.2,.12,.4);_alarmTone(ctx,g,1100,'square',t+i*.2+.1,.08,.35);}scheduleLoop(2000);},
        birds:()=>{[800,1000,1200,900,1100].forEach((f,i)=>_alarmTone(ctx,g,f+(Math.random()*80),'sine',t+i*.22,.18,.5));scheduleLoop(2500);},
        piano:()=>{[261,329,392,523].forEach((f,i)=>_alarmTone(ctx,g,f,'sine',t+i*.1,1.2,.5));scheduleLoop(4000);},
        ocean:()=>{const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*.3;const s=ctx.createBufferSource(),f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=500;s.buffer=buf;s.loop=loop;s.connect(f);f.connect(g);s.start(t);window._alarmAnodes.push(s);},
        chime:()=>{[1109,988,1319,1245,1568].forEach((f,i)=>_alarmTone(ctx,g,f,'sine',t+i*.4,1.5,.6));scheduleLoop(4000);},
        pulse:()=>{for(let i=0;i<4;i++)_alarmTone(ctx,g,660,'sawtooth',t+i*.5,.3,.4);scheduleLoop(3000);},
        classic:()=>{_alarmTone(ctx,g,480,'sine',t,.25,.6);_alarmTone(ctx,g,480,'sine',t+.5,.25,.6);_alarmTone(ctx,g,620,'sine',t+1,.35,.7);scheduleLoop(2500);},
        marimba:()=>{[523,659,784,659,523,784,659,523].forEach((f,i)=>_alarmTone(ctx,g,f,'sine',t+i*.15,.3,.65));scheduleLoop(2500);},
        custom:()=>{
            // Custom music URL: play via HTMLAudio
            const a=new Audio(window._alarmCustomUrl||'');
            a.volume=vol; a.loop=true;
            a.play().catch(()=>{ (fns.bells||fns.bells)(); });
            window._alarmPrevAud=a;
        }
    };
    (fns[id]||fns.bells)();
}

window._alarmSoundChanged = function(val) {
    const wrap = document.getElementById('alarm-custom-url-wrap');
    if(wrap) wrap.style.display = (val === 'custom') ? 'block' : 'none';
};

window._previewCustomUrl = function() {
    const url = (document.getElementById('alarm-custom-url')||{}).value || '';
    if(!url) { alert('Please enter a music URL first!'); return; }
    if(window._alarmPrevAud) { window._alarmPrevAud.pause(); window._alarmPrevAud = null; }
    const a = new Audio(url);
    const vol = ((document.getElementById('alarm-volume')||{}).value || 80) / 100;
    a.volume = vol;
    a.play().then(()=>{ window._alarmPrevAud = a; setTimeout(()=>{ a.pause(); window._alarmPrevAud=null; }, 6000); }).catch(()=>alert('Could not play that URL. Make sure it\'s a direct link to an audio file (MP3/OGG/WAV) and the server allows cross-origin playback.'));
};

window._previewAlarmSound = function() {
    _alarmStopAll();
    window._alarmStopped = false;
    const sid = (document.getElementById('alarm-sound')||{}).value || 'bells';
    const vol = ((document.getElementById('alarm-volume')||{}).value || 80) / 100;
    if(sid === 'custom') {
        window._previewCustomUrl();
    } else {
        _alarmGenSound(sid, vol, false);
        const tid = setTimeout(_alarmStopAll, 5000);
        window._alarmLoopTimeouts.push(tid);
    }
};

// ── Add alarm ─────────────────────────────────────────────────
window.addAlarm = function() {
    const label = (document.getElementById('alarm-label').value || '').trim() || 'Alarm';
    const time = document.getElementById('alarm-time').value;
    if(!time) { alert('Please set a time!'); return; }
    const repeat = _alarmCurrentRepeat;
    let days = [];
    if(repeat === 'weekly') {
        days = [..._alarmSelectedDays].map(Number).sort();
        if(!days.length) { alert('Select at least one day for weekly repeat!'); return; }
    }
    const alarmDate = repeat === 'once' ? document.getElementById('alarm-date').value : '';
    if(repeat === 'once' && !alarmDate) { alert('Please pick a date for this one-time alarm!'); return; }
    const sound = (document.getElementById('alarm-sound')||{}).value || 'bells';
    const customUrl = sound === 'custom' ? ((document.getElementById('alarm-custom-url')||{}).value || '').trim() : '';
    const snooze = parseInt((document.getElementById('alarm-snooze')||{}).value) || 10;
    const volume = parseInt((document.getElementById('alarm-volume')||{}).value || 80) / 100;
    const alarm = { id: Date.now(), label, time, repeat, days, date: alarmDate, active: true, lastFired: '', sound, customUrl, snooze, volume };
    alarms_db.push(alarm);
    alarmsSave();
    // Reset form
    document.getElementById('alarm-label').value = '';
    document.getElementById('alarm-time').value = '';
    document.getElementById('alarm-date').value = '';
    const curlEl = document.getElementById('alarm-custom-url');
    if(curlEl) curlEl.value = '';
    const curlWrap = document.getElementById('alarm-custom-url-wrap');
    if(curlWrap) curlWrap.style.display = 'none';
    const soundSel = document.getElementById('alarm-sound');
    if(soundSel) soundSel.value = 'bells';
    document.querySelectorAll('.alarm-day-pill').forEach(p => p.classList.remove('active'));
    _alarmSelectedDays.clear();
    window._alarmSelectRepeat('once');
    renderAlarms();
    updateHomeNextAlarm();
};

window.deleteAlarm = function(id) {
    alarms_db = alarms_db.filter(a => a.id !== id);
    alarmsSave(); renderAlarms(); updateHomeNextAlarm();
};

window.toggleAlarm = function(id) {
    const a = alarms_db.find(x => x.id === id);
    if(a) { a.active = !a.active; alarmsSave(); renderAlarms(); updateHomeNextAlarm(); }
};

// ── Render alarm list ─────────────────────────────────────────
function renderAlarms() {
    const list = document.getElementById('alarm-list'); if(!list) return;
    // Update hero display
    _updateAlarmHero();
    if(!alarms_db.length) {
        list.innerHTML = `<div class="alarm-empty">
            <div style="font-size:3.5rem;margin-bottom:14px;opacity:0.5;">🔕</div>
            <div style="font-family:var(--font-display);font-size:1.1rem;letter-spacing:0.08em;margin-bottom:6px;">No Alarms Set</div>
            <div style="font-size:0.78rem;">Configure an alarm above and it will ring even when you're on another tab.</div>
        </div>`;
        return;
    }
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const soundNames = {lofi:'🎵 Lofi',bells:'🔔 Bells',digital:'📟 Digital',birds:'🐦 Birds',piano:'🎹 Piano',ocean:'🌊 Ocean',chime:'🎐 Chime',pulse:'💫 Pulse',classic:'📞 Classic',marimba:'🎼 Marimba',custom:'🎶 Custom'};
    list.innerHTML = alarms_db.map(a => {
        const [hh,mm] = (a.time||'00:00').split(':');
        const h = parseInt(hh), ampm = h>=12?'PM':'AM', h12 = h%12||12;
        const scheduleText = a.repeat === 'daily' ? '🔁 Every Day' :
            a.repeat === 'weekly' ? `📅 ${(a.days||[]).map(d=>dayNames[d]).join(' · ')}` :
            `📌 ${a.date||'One-time'}`;
        const sndLabel = soundNames[a.sound||'bells'] || '🔔 Bells';
        const snzLabel = `💤 ${a.snooze||10}m`;
        return `<div class="alarm-item ${a.active?'active-alarm':''}">
            ${a.active ? '<div class="alarm-accent-bar"></div>' : ''}
            <div style="flex-shrink:0;font-size:2.2rem;opacity:${a.active?1:0.35};">${a.active?'🔔':'🔕'}</div>
            <div style="flex:1;min-width:0;">
                <div class="alarm-item-time ${a.active?'':'off'}">${String(h12).padStart(2,'0')}:${mm}<span class="alarm-item-ampm">${ampm}</span></div>
                <div class="alarm-item-label">${escapeHTML(a.label)}</div>
                <div class="alarm-item-schedule">${scheduleText} &nbsp;·&nbsp; ${sndLabel} &nbsp;·&nbsp; ${snzLabel}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:7px;align-items:flex-end;flex-shrink:0;">
                <button class="alarm-toggle ${a.active?'on':''}" onclick="window.toggleAlarm(${a.id})">${a.active?'● ON':'○ OFF'}</button>
                <button class="alarm-del" onclick="window.deleteAlarm(${a.id})"><i class="ph ph-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

// ── ALARM HERO: Shows next active alarm wake time ──────────────
function _updateAlarmHero() {
    const heroTime = document.getElementById('alarm-hero-sleep-time');
    const heroSub  = document.getElementById('alarm-hero-sub');
    if(!heroTime || !heroSub) return;
    const active = alarms_db.filter(a => a.active);
    if(!active.length) {
        heroTime.textContent = '—';
        heroSub.textContent = 'Set an alarm to start tracking';
        return;
    }
    // Find the next alarm
    const now = new Date();
    let next = null, minDiff = Infinity;
    active.forEach(a => {
        const [hh, mm] = (a.time || '00:00').split(':');
        const candidate = new Date(now);
        candidate.setHours(parseInt(hh), parseInt(mm), 0, 0);
        if(candidate <= now) candidate.setDate(candidate.getDate() + 1);
        const diff = candidate - now;
        if(diff < minDiff) { minDiff = diff; next = a; }
    });
    if(next) {
        const [hh, mm] = (next.time || '00:00').split(':');
        const h = parseInt(hh), ampm = h>=12?'PM':'AM', h12 = h%12||12;
        heroTime.textContent = `${String(h12).padStart(2,'0')}:${mm} ${ampm}`;
        const totalMins = Math.round(minDiff / 60000);
        const hrs = Math.floor(totalMins / 60), mins = totalMins % 60;
        heroSub.textContent = `${next.label ? '"' + next.label + '" · ' : ''}Rings in ${hrs > 0 ? hrs + 'h ' : ''}${mins}m`;
    }
}

// ── STARFIELD INIT ──────────────────────────────────────────────
(function initAlarmStars() {
    const container = document.getElementById('alarm-stars-canvas');
    if(!container) return;
    const stars = 28;
    for(let i = 0; i < stars; i++) {
        const s = document.createElement('div');
        s.className = 'alarm-star';
        const size = Math.random() * 2.5 + 0.8;
        s.style.cssText = `
            width:${size}px; height:${size}px;
            top:${Math.random() * 100}%;
            left:${Math.random() * 100}%;
            animation-delay:${Math.random() * 3}s;
            animation-duration:${1.5 + Math.random() * 2}s;
            opacity:${Math.random() * 0.4 + 0.1};
        `;
        container.appendChild(s);
    }
})();

// ── CORE ALARM CHECK — works in background tabs ───────────────
// Strategy: check every 10s via setInterval + on visibilitychange + on storage event
// Store "last check minute" in localStorage so cross-tab fire doesn't repeat
function checkAlarms() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const todayStr = getLocalIsoDate(now);
    const todayDay = now.getDay();
    // Reload from storage in case another tab updated
    alarmsLoad();
    let changed = false;
    alarms_db.forEach(alarm => {
        if(!alarm.active) return;
        if(alarm.time !== hhmm) return;
        const firedKey = todayStr + '_' + hhmm;
        if(alarm.lastFired === firedKey) return;
        let shouldFire = false;
        if(alarm.repeat === 'daily') shouldFire = true;
        else if(alarm.repeat === 'weekly') {
            shouldFire = (alarm.days||[]).map(Number).includes(todayDay);
        }
        else if(alarm.repeat === 'once') {
            shouldFire = alarm.date === todayStr;
        }
        if(shouldFire) {
            alarm.lastFired = firedKey;
            changed = true;
            _fireAlarm(alarm);
        }
    });
    if(changed) alarmsSave();
}

// Re-check immediately when tab becomes visible
document.addEventListener('visibilitychange', function() {
    if(!document.hidden) { checkAlarms(); updateHomeNextAlarm(); }
});

// Also re-check on storage changes (another tab saved alarms)
window.addEventListener('storage', function(e) {
    if(e.key === 'astraea_alarms') { alarmsLoad(); renderAlarms(); }
});

// ── Fire alarm ────────────────────────────────────────────────
function _fireAlarm(alarm) {
    _currentFiringAlarm = alarm;
    // FIX: Reset stopped flag so sound can play
    window._alarmStopped = false;
    // Update overlay content
    const lbl = document.getElementById('alarm-ring-label');
    const timeEl = document.getElementById('alarm-ring-time');
    const repEl = document.getElementById('alarm-ring-repeat');
    const snzBtn = document.getElementById('alarm-ring-snooze-btn');
    if(lbl) lbl.textContent = alarm.label || 'ALARM!';
    if(timeEl) {
        const [hh,mm] = (alarm.time||'00:00').split(':');
        const h = parseInt(hh), ampm = h>=12?'PM':'AM', h12 = h%12||12;
        timeEl.textContent = `${String(h12).padStart(2,'0')}:${mm} ${ampm}`;
    }
    if(repEl) {
        const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        repEl.textContent = alarm.repeat==='daily' ? 'Daily Alarm' :
            alarm.repeat==='weekly' ? `Weekly · ${(alarm.days||[]).map(d=>dayNames[d]).join(', ')}` :
            `One-time · ${alarm.date||''}`;
    }
    if(snzBtn) snzBtn.textContent = `💤 Snooze ${alarm.snooze||10}m`;
    const overlay = document.getElementById('alarm-ring-overlay');
    if(overlay) overlay.classList.add('show');
    // Stop any previously playing alarm sound first
    _alarmStopAll();
    window._alarmStopped = false; // Reset again after stopAll
    const vol = alarm.volume !== undefined ? alarm.volume : 1;
    // Check for custom music URL
    if(alarm.sound === 'custom' && alarm.customUrl) {
        window._alarmCustomUrl = alarm.customUrl;
        _alarmGenSound('custom', vol, true);
    } else {
        _alarmGenSound(alarm.sound || 'bells', vol, true);
    }
    // Web Notification (fires even if tab is in background)
    if('Notification' in window && Notification.permission === 'granted') {
        try {
            const n = new Notification('⏰ ' + (alarm.label||'Alarm'), {
                body: 'Tap to open · ' + (alarm.time||''),
                icon: '', tag: 'astraea-alarm-' + alarm.id, requireInteraction: true
            });
            n.onclick = function() { window.focus(); n.close(); };
        } catch(e){}
    }
}

function _playAlarmBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        function beep(freq, start, dur) {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = freq; osc.type = 'sine';
            gain.gain.setValueAtTime(0.6, ctx.currentTime+start);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+start+dur);
            osc.start(ctx.currentTime+start); osc.stop(ctx.currentTime+start+dur);
        }
        beep(880,0,0.3); beep(1100,0.4,0.3); beep(880,0.8,0.3);
        beep(880,1.4,0.3); beep(1100,1.8,0.3); beep(880,2.2,0.3);
        window._alarmBeepCtx = ctx;
    } catch(e){}
}

window.dismissAlarm = function() {
    const overlay = document.getElementById('alarm-ring-overlay');
    if(overlay) overlay.classList.remove('show');
    _alarmStopAll(); // This now also closes AudioContext and clears all timeouts
    const goku = document.getElementById('audio-goku');
    if(goku) { goku.pause(); goku.currentTime=0; }
    _currentFiringAlarm = null;
    // Reset stopped flag after a short delay (allows new alarms to fire later)
    setTimeout(()=>{ window._alarmStopped = false; }, 500);
};

window.snoozeAlarm = function() {
    const overlay = document.getElementById('alarm-ring-overlay');
    if(overlay) overlay.classList.remove('show');
    _alarmStopAll(); // Stops all sounds + clears loop timeouts
    const goku = document.getElementById('audio-goku');
    if(goku) { goku.pause(); goku.currentTime=0; }
    if(_currentFiringAlarm) {
        const alarm = _currentFiringAlarm;
        _currentFiringAlarm = null;
        // Clear lastFired so it can re-fire after snooze
        const a = alarms_db.find(x=>x.id===alarm.id);
        if(a) { a.lastFired=''; alarmsSave(); }
        const snoozeMs = (alarm.snooze || 10) * 60 * 1000;
        // FIX: Reset stopped flag before scheduling snooze re-fire
        setTimeout(()=>{ window._alarmStopped = false; }, 500);
        setTimeout(()=>{ _fireAlarm(alarm); }, snoozeMs);
    } else {
        setTimeout(()=>{ window._alarmStopped = false; }, 500);
    }
};

function updateHomeNextAlarm() {
    const el = document.getElementById('home-next-alarm');
    if(!el) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const todayStr = getLocalIsoDate(now);
    const todayDay = now.getDay();
    const upcoming = alarms_db.filter(a => {
        if(!a.active) return false;
        if(a.repeat === 'daily') return a.time > hhmm;
        if(a.repeat === 'weekly') return (a.days||[]).includes(todayDay) && a.time > hhmm;
        if(a.repeat === 'once') return a.date === todayStr && a.time > hhmm;
        return false;
    }).sort((a,b) => a.time.localeCompare(b.time));
    if(upcoming.length) {
        el.innerHTML = `<i class="ph ph-bell" style="color:var(--accent);"></i> Next: <strong style="color:var(--accent);">${upcoming[0].time}</strong> — ${escapeHTML(upcoming[0].label)}`;
    } else {
        el.innerHTML = `<i class="ph ph-bell-slash" style="opacity:0.4;"></i> No more alarms today`;
    }
}

// ============================================================
// CHAPTER ↔ FOCUS LINKING
// ============================================================
window.updateChapterList = function() {
    const sub = document.getElementById('f-chapter-subject-select').value;
    const sel = document.getElementById('f-chapter-select');
    sel.innerHTML = '<option value="">-- No Chapter Linked --</option>';
    if(!sub) return;
    const chapters = (window.ch_SUBJECTS[sub] || {}).chapters || [];
    const customChapters = Object.keys((window.ch_db[sub]||{})).filter(n => window.ch_db[sub][n].custom);
    [...chapters, ...customChapters].forEach(c => {
        const opt = document.createElement('option');
        opt.value = sub + '::' + c;
        opt.textContent = c;
        sel.appendChild(opt);
    });
    window.filterChapterList();
    updateChapterFocusDisplay();
};

window.filterChapterList = function() {
    const search = document.getElementById('f-chapter-search').value.toLowerCase();
    const sel = document.getElementById('f-chapter-select');
    Array.from(sel.options).forEach(opt => {
        if(!opt.value) { opt.style.display = ''; return; }
        opt.style.display = opt.textContent.toLowerCase().includes(search) ? '' : 'none';
    });
};

function updateChapterFocusDisplay() {
    const sel = document.getElementById('f-chapter-select');
    const disp = document.getElementById('f-chapter-focus-display');
    if(!sel || !disp) return;
    const val = sel.value;
    if(!val) { disp.style.display='none'; return; }
    const [sub, chapName] = val.split('::');
    // Sum focus time for this chapter from focus logs
    let totalMins = 0;
    (state.focus.logs||[]).forEach(l => {
        if(l.chapter === val) totalMins += (l.duration||0);
    });
    if(totalMins > 0) {
        const d=Math.floor(totalMins/1440),h=Math.floor((totalMins%1440)/60),m=Math.floor(totalMins%60);
        const fmt = d>0?`${String(d).padStart(2,'0')}:${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        disp.style.display='block';
        disp.innerHTML = `<i class="ph ph-clock"></i> Focus on this chapter: <strong>${fmt}</strong>`;
    } else {
        disp.style.display='none';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const chSel = document.getElementById('f-chapter-select');
    if(chSel) chSel.addEventListener('change', updateChapterFocusDisplay);
});

// ============================================================
// HOME PIE CHART (study method + subject)
// ============================================================
let _homePieChart = null;
function updateHomePieChart() {
    const canvas = document.getElementById('home-pie-chart');
    const legend = document.getElementById('home-pie-legend');
    const empty = document.getElementById('home-pie-empty');
    if(!canvas || !legend) return;
    const today = getLocalIsoDate(new Date());
    const todayStart = new Date(today).setHours(0,0,0,0);
    // Count study types from today's tasks
    const typeCounts = {};
    const subjectCounts = {physics:0, chemistry:0, maths:0};
    const todayTasks = gg_db[today] || [];
    todayTasks.forEach(t => {
        if(t.status === 1) { // done tasks
            if(t.studyType) typeCounts[t.studyType] = (typeCounts[t.studyType]||0)+1;
            if(t.subject) subjectCounts[t.subject] = (subjectCounts[t.subject]||0)+1;
        }
    });
    // Also count from focus logs (subject-tagged)
    (state.focus.logs||[]).filter(l=>l.stamp>=todayStart).forEach(l=>{
        if(l.chapter) {
            const sub = l.chapter.split('::')[0];
            if(sub) subjectCounts[sub]=(subjectCounts[sub]||0)+Math.round((l.duration||0)/60);
        }
    });
    const typeColors = {lecture:'#4f6ef7',module:'#7c3aed',dpp:'#10b981',test:'#f59e0b',revision:'#38bdf8'};
    const typeLabels = {lecture:'🎬 Lecture',module:'📚 Module',dpp:'📝 DPP',test:'✅ Test',revision:'🔁 Revision'};
    // Build subject colors/labels dynamically from ch_SUBJECTS
    const _S = window.ch_SUBJECTS || {};
    const subColors = Object.fromEntries(Object.entries(_S).map(([k,v])=>[k,v.color||'#888']));
    const subLabels = Object.fromEntries(Object.entries(_S).map(([k,v])=>[k,v.label||k]));
    // Fallback defaults in case ch_SUBJECTS not yet populated
    if(!subColors.physics) subColors.physics='#38bdf8';
    if(!subColors.chemistry) subColors.chemistry='#f472b6';
    if(!subColors.maths) subColors.maths='#a855f7';
    if(!subLabels.physics) subLabels.physics='Physics';
    if(!subLabels.chemistry) subLabels.chemistry='Chemistry';
    if(!subLabels.maths) subLabels.maths='Maths';

    // Build pie data from subject counts
    const pieData = Object.entries(subjectCounts).filter(([k,v])=>v>0);
    if(_homePieChart){_homePieChart.destroy();_homePieChart=null;}
    if(!pieData.length) {
        if(empty) { empty.style.display='flex'; canvas.style.display='none'; }
        legend.innerHTML = '<div style="color:var(--text-dim);font-size:0.72rem;">Log tasks to see your study breakdown.</div>';
        return;
    }
    if(empty) empty.style.display='none';
    canvas.style.display='block';
    const ctx = canvas.getContext('2d');
    _homePieChart = new Chart(ctx, {
        type:'doughnut',
        data:{
            labels: pieData.map(([k])=>subLabels[k]||k),
            datasets:[{data:pieData.map(([k,v])=>v),backgroundColor:pieData.map(([k])=>subColors[k]||'#888'),borderWidth:2}]
        },
        options:{responsive:false,cutout:'60%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw}`}}}}
    });
    // Build legend with both subject and type
    let legendHtml = pieData.map(([k,v])=>`<div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:${subColors[k]||'#888'};flex-shrink:0;"></span><span>${subLabels[k]||k}: <strong>${v}</strong></span></div>`).join('');
    const typeEntries = Object.entries(typeCounts).filter(([k,v])=>v>0);
    if(typeEntries.length) {
        legendHtml += `<div style="margin-top:6px;border-top:1px solid var(--border);padding-top:5px;">`;
        legendHtml += typeEntries.map(([k,v])=>`<div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:3px;background:${typeColors[k]||'#888'};flex-shrink:0;"></span><span>${typeLabels[k]||k}: <strong>${v}</strong></span></div>`).join('');
        legendHtml += '</div>';
    }
    legend.innerHTML = legendHtml;
}

// ============================================================
// JEE COUNTDOWN on Home
// ============================================================
function updateJEECountdown() {
    const el = document.getElementById('jee-countdown');
    const labelEl = document.getElementById('jee-countdown-label');
    if(!el) return;

    // A manually pinned event (chosen via the target button's popup) always wins —
    // goals differ per person, so this overrides the onboarding-derived default.
    const pinnedId = state.settings && state.settings.pinnedEventId;
    if(pinnedId) {
        const pinned = (state.events||[]).find(e => e.id === pinnedId);
        if(pinned) {
            if(labelEl) labelEl.textContent = `🎯 ${pinned.name} Countdown`;
            const target = new Date(pinned.target);
            const now = new Date();
            const diff = target - now;
            if(diff <= 0) { el.textContent = pinned.name + ' — Day is here!'; return; }
            const days = Math.floor(diff/86400000);
            const hours = Math.floor((diff%86400000)/3600000);
            el.innerHTML = `<span style="font-size:1.3rem;color:var(--accent);">${days}</span><span style="font-size:0.7rem;color:var(--text-dim);"> days</span> <span style="font-size:0.9rem;">${hours}h</span> <span style="font-size:0.62rem;color:var(--text-dim);">remaining</span>`;
            return;
        } else {
            // Pinned event got deleted from Event Horizon — fall back to default silently.
            if(state.settings) state.settings.pinnedEventId = null;
        }
    }

    const ob = window._obIdentity;
    // Adapt label
    const examName = (ob && ob.examLabel) ? ob.examLabel : 'JEE Main 2028';
    if(labelEl) labelEl.textContent = `🚀 ${examName} Countdown`;
    // JEE Main 2028 approximate date: January 15, 2028 (default)
    // For other exams, use state.events if any, else show generic
    if(ob && ob.exam && ob.exam !== 'jee') {
        // Look for an event that matches exam name
        const examEvent = (state.events||[]).find(e=>e.name && e.name.toLowerCase().includes(ob.exam));
        if(examEvent) {
            const target = new Date(examEvent.target);
            const now = new Date();
            const diff = target - now;
            if(diff <= 0) { el.textContent = examName + ' Day is here!'; return; }
            const days = Math.floor(diff/86400000);
            const hours = Math.floor((diff%86400000)/3600000);
            el.innerHTML = `<span style="font-size:1.3rem;color:var(--accent);">${days}</span><span style="font-size:0.7rem;color:var(--text-dim);"> days</span> <span style="font-size:0.9rem;">${hours}h</span> <span style="font-size:0.62rem;color:var(--text-dim);">remaining</span>`;
        } else {
            el.innerHTML = `<span style="font-size:0.8rem;color:var(--text-dim);">Add your exam date in <b style="color:var(--accent);">Event Horizon →</b></span>`;
        }
        return;
    }
    const target = new Date('2028-01-15T00:00:00');
    const now = new Date();
    const diff = target - now;
    if(diff <= 0) { el.textContent = 'JEE Day is here!'; return; }
    const days = Math.floor(diff/86400000);
    const hours = Math.floor((diff%86400000)/3600000);
    el.innerHTML = `<span style="font-size:1.3rem;color:var(--accent);">${days}</span><span style="font-size:0.7rem;color:var(--text-dim);"> days</span> <span style="font-size:0.9rem;">${hours}h</span> <span style="font-size:0.62rem;color:var(--text-dim);">remaining</span>`;
}

// Popup checklist letting the person pick which Event Horizon entry the
// countdown card on Home should track.
window.homeCountdown_openPicker = function() {
    window.homeCountdown_renderPickerList();
    document.getElementById('countdown-picker-modal').style.display = 'flex';
};
window.homeCountdown_closePicker = function() {
    document.getElementById('countdown-picker-modal').style.display = 'none';
};
window.homeCountdown_renderPickerList = function() {
    const list = document.getElementById('countdown-picker-list');
    if(!list) return;
    const events = (state.events||[]).slice().sort((a,b)=>a.target-b.target);
    if(!events.length) {
        list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-dim);font-size:0.82rem;">No events yet. Add goals in <b>Event Horizon</b> first.</div>`;
        return;
    }
    const pinnedId = state.settings && state.settings.pinnedEventId;
    list.innerHTML = events.map(e => {
        const daysLeft = Math.ceil((e.target - Date.now())/86400000);
        const isPinned = e.id === pinnedId;
        return `<label style="display:flex;align-items:center;gap:10px;font-size:0.82rem;padding:8px 10px;border-radius:8px;border:1px solid ${isPinned?'var(--accent)':'var(--border)'};background:${isPinned?'rgba(79,110,247,0.08)':'transparent'};cursor:pointer;">
            <input type="radio" name="countdown-pick" ${isPinned?'checked':''} onchange="window.homeCountdown_selectEvent(${e.id})">
            <span style="flex:1;">${escapeHTML(e.name||'Event')}</span>
            <span style="font-size:0.68rem;color:var(--text-dim);font-family:var(--font-mono);">${daysLeft>=0?daysLeft+'d left':'past'}</span>
        </label>`;
    }).join('');
};
window.homeCountdown_selectEvent = function(id) {
    if(!state.settings) state.settings = {};
    state.settings.pinnedEventId = id || null;
    triggerSave();
    window.homeCountdown_renderPickerList();
    updateJEECountdown();
    if(id === null) window.homeCountdown_closePicker();
};

// ============================================================
// CHAPTER TRACKER
// ============================================================
// ch_SUBJECTS: populated dynamically from onboarding data (no hardcoded JEE defaults)
window.ch_SUBJECTS = {};
// Will be filled by obApplyFromFirestore → onboarding subjects + chapters from users2 collection
window.ch_TASKS = [
    {key:'lecture',label:'Lecture',icon:'🎬'},
    {key:'dpp',label:'DPP',icon:'📝'},
    {key:'module',label:'Module',icon:'📚'},
    {key:'wrongQ',label:'Wrong Q',icon:'❌'},
    {key:'revision',label:'Revision',icon:'🔁'},
    {key:'test',label:'Test Done',icon:'✅'}
];
// Runtime patch: if onboarding selected custom study types, extend ch_TASKS
(function() {
    const ob = window._obIdentity;
    if(ob && ob.studyTypes && ob.studyTypes.length > 0) {
        const ALL_ST = [{key:'lecture',label:'Lecture',icon:'🎬'},{key:'dpp',label:'DPP',icon:'📝'},{key:'module',label:'Module',icon:'📚'},{key:'wrongQ',label:'Wrong Q',icon:'❌'},{key:'revision',label:'Revision',icon:'🔁'},{key:'test',label:'Test Done',icon:'✅'},{key:'ncert',label:'NCERT',icon:'📗'},{key:'pyq',label:'PYQ',icon:'🗂️'},{key:'flash',label:'Flashcards',icon:'⚡'},{key:'writing',label:'Writing',icon:'✍️'},{key:'map',label:'Map',icon:'🗺️'},{key:'current',label:'Curr. Affairs',icon:'📰'}];
        window.ch_TASKS = ob.studyTypes.map(k => ALL_ST.find(t=>t.key===k)||{key:k,label:k,icon:'📌'});
    }
})();
window.ch_db = {};  // populated from onboarding + Firestore
window.ch_activeSub = null; // set after onboarding loads subjects

// Chapter-checklist save now drives the same sync-dot indicator the rest of
// the app uses, and keeps retrying in the background until a save actually
// confirms — previously this saved silently with no visible status, so a
// failed/slow write looked identical to a successful one.
var _chSyncRetryTimer = null;
var _chSyncAttempt = 0;
function _chSetDot(cls, text) {
    var dot=document.getElementById('sync-dot'), txt=document.getElementById('sync-text');
    if(dot) dot.className = 'status-dot ' + cls;
    if(txt) txt.innerText = text;
}
window.ch_save = function() {
    try { localStorage.setItem('astraea2_ch', JSON.stringify(window.ch_db)); } catch(e){}
    var db=window._fbDb, uid=window._fbUid, fns=window._fbFns;
    if(_chSyncRetryTimer) { clearTimeout(_chSyncRetryTimer); _chSyncRetryTimer = null; }
    _chSyncAttempt = 0;
    // Same fix as the main save pipeline: this branch only means "no signed-in
    // account/db handle yet" — an actual failed write below (which retries)
    // used to show this identical label, which is what made a signed-in
    // user's chapter progress look like it was stuck on "guest".
    if(!(db && uid && uid!=='guest' && fns)) { _chSetDot('online', 'NOT SIGNED IN'); return; }
    _chDoSave(db, uid, fns);
};
function _chDoSave(db, uid, fns) {
    _chSetDot('syncing', 'SYNCING...');
    // FIX: Store as a JSON string inside a wrapper to prevent Firestore field name issues
    // (chapter names contain special chars like '&', ',' that can confuse Firestore dot-notation)
    var safePayload = { chaptersJSON: JSON.stringify(window.ch_db), updatedAt: Date.now() };
    fns.setDoc(fns.doc(db,'users2',uid,'appdata','chapters'), safePayload, {merge:false}).then(function(){
        _chSyncAttempt = 0;
        _chSetDot('online', 'CLOUD SAVED');
    }).catch(function(e){
        // Fallback: try raw object (backward compat)
        console.warn('ch save safe err, trying raw:', e);
        fns.setDoc(fns.doc(db,'users2',uid,'appdata','chapters'), window.ch_db, {merge:true}).then(function(){
            _chSyncAttempt = 0;
            _chSetDot('online', 'CLOUD SAVED');
        }).catch(function(e2){
            console.warn('ch save raw err', e2);
            _chSyncAttempt++;
            _chSetDot('syncing', 'SYNC PENDING...');
            // Keep the indicator "not synced" and retry with backoff (5s, 10s, 20s... capped at 60s)
            // instead of failing silently — the checklist is only marked synced once a write confirms.
            var delay = Math.min(60000, 5000 * Math.pow(2, Math.min(_chSyncAttempt - 1, 3)));
            _chSyncRetryTimer = setTimeout(function(){ _chDoSave(db, uid, fns); }, delay);
        });
    });
}

window.ch_init = async function() {
    // Apply onboarding subjects to ch_SUBJECTS if available
    var ob = window._obIdentity;
    if(ob && ob.subjects && ob.subjects.length > 0) {
        ob.subjects.forEach(function(s) {
            if(!window.ch_SUBJECTS[s.key]) {
                window.ch_SUBJECTS[s.key] = { label: s.label, color: s.color, chapters: [] };
            }
        });
        // patch ch_TASKS if custom study types
        if(ob.studyTypes && ob.studyTypes.length > 0) {
            var ALL_ST = [{key:'lecture',label:'Lecture',icon:'🎬'},{key:'dpp',label:'DPP',icon:'📝'},{key:'module',label:'Module',icon:'📚'},{key:'wrongQ',label:'Wrong Q',icon:'❌'},{key:'revision',label:'Revision',icon:'🔁'},{key:'test',label:'Test Done',icon:'✅'},{key:'ncert',label:'NCERT',icon:'📗'},{key:'pyq',label:'PYQ',icon:'🗂️'},{key:'flash',label:'Flashcards',icon:'⚡'},{key:'writing',label:'Writing',icon:'✍️'},{key:'map',label:'Map',icon:'🗺️'},{key:'current',label:'Curr. Affairs',icon:'📰'}];
            window.ch_TASKS = ob.studyTypes.map(function(k){ return ALL_ST.find(function(t){return t.key===k;})||{key:k,label:k,icon:'📌'}; });
        }
    }

    var db=window._fbDb, uid=window._fbUid, fns=window._fbFns;
    var loadedFromFirebase = false;
    // Build dynamic base from ch_SUBJECTS
    function _makeBase() {
        var base = {};
        Object.keys(window.ch_SUBJECTS||{}).forEach(function(k){ base[k]={}; });
        if(!base.physics) base.physics={};
        if(!base.chemistry) base.chemistry={};
        if(!base.maths) base.maths={};
        return base;
    }
    if(db && uid && uid!=='guest' && fns) {
        try {
            // First check for chapters stored in appdata/main (new onboarding format)
            if(window._loadedChaptersFromFS) {
                var fsCh = window._loadedChaptersFromFS;
                var baseDb = _makeBase();
                if(ob && ob.subjects) { ob.subjects.forEach(function(s){ baseDb[s.key] = {}; }); }
                Object.keys(fsCh).forEach(function(sub){ baseDb[sub] = Object.assign({}, baseDb[sub]||{}, fsCh[sub]); });
                window.ch_db = Object.assign(baseDb, window.ch_db);
                loadedFromFirebase = true;
            }
            // Also check dedicated chapters collection
            var snap = await _getDocFresh(fns, fns.doc(db,'users2',uid,'appdata','chapters'));
            if(snap.exists()) {
                var fbData = snap.data();
                if(fbData.chaptersJSON) {
                    try {
                        var parsed = JSON.parse(fbData.chaptersJSON);
                        window.ch_db = Object.assign(_makeBase(), window.ch_db, parsed);
                    } catch(pe) {
                        window.ch_db = Object.assign(_makeBase(), window.ch_db, fbData);
                    }
                } else {
                    window.ch_db = Object.assign(_makeBase(), window.ch_db, fbData);
                }
                loadedFromFirebase = true;
                try { localStorage.setItem('astraea2_ch', JSON.stringify(window.ch_db)); } catch(e){}
            }
        } catch(e){ console.warn('ch load err',e); }
    }
    if(!loadedFromFirebase) {
        try {
            var raw=localStorage.getItem('astraea2_ch');
            var baseDb2 = _makeBase();
            if(ob && ob.subjects) { ob.subjects.forEach(function(s){ baseDb2[s.key] = {}; }); }
            if(raw) { window.ch_db = Object.assign(baseDb2, JSON.parse(raw)); }
        } catch(e){}
    }
    // Ensure first subject tab is from user's exam if onboarded
    if(ob && ob.subjects && ob.subjects.length > 0) {
        window.ch_activeSub = ob.subjects[0].key;
    }
    window.ch_render();
};

window.ch_ensure = function(sub) {
    if(!window.ch_db[sub]) window.ch_db[sub]={};
    var emptyTask = {};
    window.ch_TASKS.forEach(function(t){ emptyTask[t.key]=false; });
    emptyTask.done = false; emptyTask.custom = false;
    if(window.ch_SUBJECTS[sub]) {
        window.ch_SUBJECTS[sub].chapters.forEach(function(name){
            if(!window.ch_db[sub][name]) window.ch_db[sub][name]=Object.assign({},emptyTask);
        });
    }
};

// Track which chapters have their subtopic panel expanded
window._ch_expanded = {};

window.ch_render = function() {
    var sub = window.ch_activeSub;
    var S = window.ch_SUBJECTS;
    window.ch_ensure(sub);
    var tabEl=document.getElementById('ch-tabs');
    if(!tabEl) return;
    
    tabEl.innerHTML = Object.keys(S).map(function(k){
        return `<div class="ch-subject-tab${sub===k?' active':''}" onclick="window.ch_switchSub('${k}')"><span style="color:${S[k].color};margin-right:5px;">●</span>${S[k].label}</div>`;
    }).join('');
    
    var subData = window.ch_db[sub];
    var canonicalChapters = S[sub].chapters;
    var customChapters = Object.keys(subData).filter(function(n){ return subData[n].custom && !canonicalChapters.includes(n); });
    var orderedNames = canonicalChapters.filter(function(n){ return subData[n]; }).concat(customChapters);
    
    var total = orderedNames.length;
    var completed = orderedNames.filter(function(n){ return subData[n].done; }).length;
    var pct = total ? Math.round(completed/total*100) : 0;
    
    var pl=document.getElementById('ch-prog-label'), pp=document.getElementById('ch-prog-pct'), pb=document.getElementById('ch-prog-bar');
    if(pl) pl.textContent = S[sub].label+' — '+completed+' / '+total+' Complete';
    if(pp) pp.textContent = pct+'%';
    if(pb) pb.style.width = pct+'%';
    
    // Build focus time map per chapter key (sub::name)
    var focusMap = {};
    var taskMap = {}; // chapKey -> {taskTitle, slots}
    (state.focus && state.focus.logs || []).forEach(function(l) {
        if(l.chapter) {
            var key = l.chapter;
            focusMap[key] = (focusMap[key]||0) + (l.duration||0);
            // Track task title linked with this chapter
            if(l.taskTitle && l.taskTitle !== 'General Focus') {
                if(!taskMap[key]) taskMap[key] = { tasks: new Set(), slots: 0 };
                taskMap[key].tasks.add(l.taskTitle);
                taskMap[key].slots++;
            } else {
                if(!taskMap[key]) taskMap[key] = { tasks: new Set(), slots: 0 };
                taskMap[key].slots++;
            }
        }
    });
    
    // Build Nexus mission counts per chapter key (sub::name) — planned vs done,
    // sourced from tasks created via Add Mission with a subject+chapter selected.
    var nexusMissionMap = {};
    Object.keys(gg_db||{}).forEach(function(dateKey){
        (gg_db[dateKey]||[]).forEach(function(t){
            if(!t.subject || !t.chapter) return;
            if(t._carryFrozen) return; // historical marker only — don't double-count with the live copy
            var key = t.subject + '::' + t.chapter;
            if(!nexusMissionMap[key]) nexusMissionMap[key] = { planned: 0, done: 0 };
            nexusMissionMap[key].planned++;
            if(t.status === 1) nexusMissionMap[key].done++;
        });
    });

    var listEl=document.getElementById('ch-list');
    if(!listEl) return;
    
    // Sort: done first, then in-progress, then not started
    var sorted = orderedNames.slice().sort(function(a, b) {
        var da = subData[a], db = subData[b];
        var scoreA = da.done ? 2 : (window.ch_TASKS.some(function(t){return da[t.key];}) ? 1 : 0);
        var scoreB = db.done ? 2 : (window.ch_TASKS.some(function(t){return db[t.key];}) ? 1 : 0);
        return scoreB - scoreA;
    });
    
    listEl.innerHTML = sorted.map(function(name){
        var d=subData[name];
        var tasksDone=window.ch_TASKS.filter(function(t){return d[t.key];}).length;
        var miniPct=Math.round(tasksDone/window.ch_TASKS.length*100);
        var statusBadge = d.done ? '<span class="ch-complete-badge">✓ COMPLETE</span>' : tasksDone>0 ? '<span class="ch-inprog-badge">IN PROGRESS</span>' : '';
        var encodedName=encodeURIComponent(name);
        var chapKey = sub + '::' + name;
        var isExpanded = !!window._ch_expanded[chapKey];
        
        // Focus time badge + linked task inline
        var focusMins = focusMap[chapKey] || 0;
        var taskInfo = taskMap[chapKey];
        var focusBadge = '';
        if(focusMins > 0) {
            var fh=Math.floor(focusMins/60), fm=Math.floor(focusMins%60);
            var fmtFocus = fh>0 ? fh+'h '+fm+'m' : fm+'m';
            focusBadge = `<span style="font-size:0.62rem;font-weight:800;color:var(--prod);background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);padding:2px 8px;border-radius:99px;display:inline-flex;align-items:center;gap:4px;margin-left:6px;"><i class="ph ph-timer"></i> ${fmtFocus}</span>`;
            if(taskInfo && taskInfo.tasks.size > 0) {
                var _tNames = Array.from(taskInfo.tasks).slice(0,2).join(', ');
                if(taskInfo.tasks.size > 2) _tNames += ' +' + (taskInfo.tasks.size-2) + ' more';
                focusBadge += `<span style="font-size:0.62rem;font-weight:700;color:var(--accent);background:rgba(79,110,247,0.1);border:1px solid rgba(79,110,247,0.25);padding:2px 8px;border-radius:99px;display:inline-flex;align-items:center;gap:4px;margin-left:4px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_tNames}"><i class="ph ph-link"></i> ${_tNames}</span>`;
            }
        }

        // Subtopic count badge
        var subtopics = d.subtopics || [];
        var stDone = subtopics.filter(function(s){ return s.done; }).length;
        var stBadge = subtopics.length > 0 ? `<span style="font-size:0.62rem;font-weight:800;color:var(--accent2);background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.25);padding:2px 8px;border-radius:99px;margin-left:4px;">${stDone}/${subtopics.length} subtopics</span>` : '';

        var taskLinkHtml = '';
        var nm = nexusMissionMap[chapKey];
        if(nm && nm.planned > 0) {
            taskLinkHtml = `<div style="margin-top:8px;font-size:0.68rem;font-weight:700;color:${nm.done===nm.planned?'var(--prod)':'var(--warn)'};background:${nm.done===nm.planned?'rgba(0,229,160,0.08)':'rgba(251,191,36,0.08)'};border:1px solid ${nm.done===nm.planned?'rgba(0,229,160,0.25)':'rgba(251,191,36,0.25)'};padding:5px 10px;border-radius:8px;display:inline-flex;align-items:center;gap:5px;"><i class="ph ph-target"></i> ${nm.done}/${nm.planned} missions done for this chapter</div>`;
        }

        // Expand arrow
        var expandArrow = `<span style="margin-left:auto;font-size:0.75rem;color:var(--text-dim);transition:transform 0.2s;display:inline-block;transform:rotate(${isExpanded?'90deg':'0deg'});">›</span>`;
        
        var tasksHtml=window.ch_TASKS.map(function(t){
            var isDone=!!d[t.key];
            return `<div class="ch-task-item${isDone?' done':''}" onclick="window.ch_toggle('${sub}','${encodedName}','${t.key}')">
                <div class="ch-chk">${isDone?'✓':''}</div>
                <div class="ch-task-label">${t.icon} ${t.label}</div>
            </div>`;
        }).join('');
        
        var remarkVal = d.remark || '';
        var remarkArea = `<textarea class="ch-remark" placeholder="Questions to review, remarks, or formulas..." onblur="window.ch_saveRemark('${sub}','${encodedName}',this.value)" style="width:100%; min-height:50px; margin-top:12px; font-size:0.75rem; background:rgba(0,0,0,0.2); border:1px solid var(--border-bright); border-radius:8px; color:var(--text);">${escapeHTML(remarkVal)}</textarea>`;
        
        var deleteBtn = d.custom ? `<button onclick="window.ch_del('${sub}','${encodedName}')" style="background:transparent;border:1px solid rgba(255,75,112,0.3);color:rgba(255,75,112,0.6);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:0.7rem;" title="Delete">🗑</button>` : '';

        // Subtopic panel HTML
        var subtopicPanelHtml = '';
        if(isExpanded) {
            var stListHtml = subtopics.length > 0 ? subtopics.map(function(st, idx){
                return `<div class="ch-subtopic-item${st.done?' done':''}">
                    <div class="ch-subtopic-chk" onclick="window.ch_stToggle('${sub}','${encodedName}',${idx})">${st.done?'✓':''}</div>
                    <span class="ch-subtopic-name">${escapeHTML(st.name)}</span>
                    <button class="ch-subtopic-del" onclick="window.ch_stDel('${sub}','${encodedName}',${idx})" title="Remove">✕</button>
                </div>`;
            }).join('') : `<div class="ch-subtopic-empty">No subtopics yet — add your first one below</div>`;

            var stProg = subtopics.length > 0 ? `<span class="ch-subtopic-progress">${stDone}/${subtopics.length} done</span>` : '';

            subtopicPanelHtml = `<div class="ch-subtopic-panel">
                <div class="ch-subtopic-header">
                    <span class="ch-subtopic-label"><i class="ph ph-list-bullets" style="color:var(--accent2);"></i> Subtopics ${stProg}</span>
                    <button class="ch-subtopic-add-btn" onclick="window.ch_stAdd('${sub}','${encodedName}')"><i class="ph ph-plus"></i> Add Subtopic</button>
                </div>
                <div class="ch-subtopic-list">${stListHtml}</div>
            </div>`;
        }
        
        return `<div class="ch-chapter-card${d.done?' ch-complete':tasksDone>0?' ch-inprogress':''}" data-sub="${sub}" data-enc="${encodedName}" ondblclick="if(!event.target.closest('textarea,button,.ch-task-item,.ch-subtopic-panel')){window.ch_openDetail('${sub}','${encodedName}');}" title="Double-click anywhere on the card to view all focus sessions logged against this chapter">
            <div class="ch-chapter-title" onclick="window.ch_toggleExpand('${sub}','${encodedName}')" ondblclick="window.ch_openDetail('${sub}','${encodedName}');event.stopPropagation();" style="cursor:pointer;user-select:none;">
                <span>${escapeHTML(name)}</span>${focusBadge}${stBadge}${statusBadge}${d.custom?'<span style="font-size:0.6rem;color:var(--text-dim);border:1px solid var(--border);padding:2px 8px;border-radius:99px;">CUSTOM</span>':''}${expandArrow}
            </div>
            <div class="ch-tasks-grid">${tasksHtml}</div>
            ${remarkArea}
            ${taskLinkHtml}
            ${subtopicPanelHtml}
            <div class="ch-footer" style="margin-top:10px;">
                <div class="ch-mini-bar"><div class="ch-mini-bar-fill" style="width:${miniPct}%;${d.done?'background:var(--success)':''}"></div></div>
                <span style="font-size:0.7rem;color:var(--text-dim);font-weight:700;flex-shrink:0;">${tasksDone}/${window.ch_TASKS.length}</span>
                <button class="btn btn-sm" style="font-size:0.65rem;padding:4px 10px;flex-shrink:0;border-color:rgba(79,110,247,0.3);color:var(--accent);" onclick="window.ch_openDetail('${sub}','${encodedName}')" title="Full Details"><i class="ph ph-info"></i></button>
                <button class="btn btn-sm${d.done?'':' btn-success'}" style="font-size:0.7rem;padding:5px 12px;flex-shrink:0;" onclick="window.ch_markDone('${sub}','${encodedName}')">${d.done?'↩ Undo':'✓ Mark Done'}</button>
                ${deleteBtn}
            </div>
        </div>`;
    }).join('');
};
window.ch_switchSub = function(sub) { window.ch_activeSub=sub; window.ch_render(); };

// ── Toggle subtopic panel expand ──
window.ch_toggleExpand = function(sub, enc) {
    var chapKey = sub + '::' + decodeURIComponent(enc);
    window._ch_expanded[chapKey] = !window._ch_expanded[chapKey];
    window.ch_render();
};

// ── Subtopic: add ──
window.ch_stAdd = function(sub, enc) {
    var name = window.prompt('Subtopic name:');
    if(!name || !name.trim()) return;
    var chapName = decodeURIComponent(enc);
    if(!window.ch_db[sub][chapName].subtopics) window.ch_db[sub][chapName].subtopics = [];
    window.ch_db[sub][chapName].subtopics.push({ name: name.trim(), done: false, addedAt: Date.now() });
    window.ch_save(); window.ch_render();
};

// ── Subtopic: toggle done ──
window.ch_stToggle = function(sub, enc, idx) {
    var chapName = decodeURIComponent(enc);
    var st = window.ch_db[sub][chapName].subtopics;
    if(!st || !st[idx]) return;
    st[idx].done = !st[idx].done;
    if(st[idx].done) st[idx].doneAt = Date.now();
    else delete st[idx].doneAt;
    window.ch_save(); window.ch_render();
};

// ── Subtopic: delete ──
window.ch_stDel = function(sub, enc, idx) {
    var chapName = decodeURIComponent(enc);
    var st = window.ch_db[sub][chapName].subtopics;
    if(!st) return;
    st.splice(idx, 1);
    window.ch_save(); window.ch_render();
};

// ── Chapter Detail Modal ──
window.ch_openDetail = function(sub, enc) {
    var name = decodeURIComponent(enc);
    var d = (window.ch_db[sub] || {})[name];
    if(!d) return;

    var S = window.ch_SUBJECTS;
    var modal = document.getElementById('ch-detail-modal');
    var titleEl = document.getElementById('cdm-title');
    var metaEl = document.getElementById('cdm-meta');
    var bodyEl = document.getElementById('cdm-body');
    if(!modal || !titleEl || !bodyEl) return;

    // Title & meta badges
    titleEl.textContent = name;
    var subColor = (S[sub]||{}).color || 'var(--accent)';
    var subLabel = (S[sub]||{}).label || sub;
    var statusBadge = d.done 
        ? '<span style="padding:3px 12px;border-radius:99px;font-size:0.65rem;font-weight:800;background:rgba(16,185,129,0.15);color:var(--success);border:1px solid rgba(16,185,129,0.3);">✓ COMPLETE</span>'
        : '<span style="padding:3px 12px;border-radius:99px;font-size:0.65rem;font-weight:800;background:rgba(79,110,247,0.1);color:var(--accent);border:1px solid rgba(79,110,247,0.25);">IN PROGRESS</span>';
    metaEl.innerHTML = `<span style="padding:3px 12px;border-radius:99px;font-size:0.65rem;font-weight:800;background:rgba(0,0,0,0.06);border:1px solid var(--border);color:${subColor};">${subLabel}</span>${statusBadge}${d.custom?'<span style="padding:3px 12px;border-radius:99px;font-size:0.65rem;font-weight:800;background:rgba(0,0,0,0.05);border:1px solid var(--border);color:var(--text-dim);">CUSTOM</span>':''}`;

    // Focus time total
    var chapKey = sub + '::' + name;
    var focusMins = 0;
    var focusByDate = {};
    (state.focus && state.focus.logs || []).forEach(function(l) {
        if(l.chapter === chapKey) {
            focusMins += (l.duration||0);
            var dt = l.date || (l.ts ? new Date(l.ts).toISOString().slice(0,10) : null);
            if(dt) focusByDate[dt] = (focusByDate[dt]||0) + (l.duration||0);
        }
    });
    var focusHr = Math.floor(focusMins/60), focusMin = Math.round(focusMins%60);
    var focusStr = focusHr > 0 ? focusHr+'h '+focusMin+'m' : focusMin+'m';

    // Tasks done count
    var tasksDone = window.ch_TASKS.filter(function(t){ return d[t.key]; }).length;

    // Subtopics
    var subtopics = d.subtopics || [];
    var stDone = subtopics.filter(function(s){ return s.done; }).length;

    // --- Stats row ---
    var statsHtml = `<div class="cdm-section">
        <div class="cdm-section-title"><i class="ph ph-chart-bar"></i> Stats</div>
        <div class="cdm-stat-row">
            <div class="cdm-stat"><div class="cdm-stat-val">${focusMins>0?focusStr:'—'}</div><div class="cdm-stat-lbl">Focus Time</div></div>
            <div class="cdm-stat"><div class="cdm-stat-val">${tasksDone}/${window.ch_TASKS.length}</div><div class="cdm-stat-lbl">Tasks Done</div></div>
            <div class="cdm-stat"><div class="cdm-stat-val">${subtopics.length>0?stDone+'/'+subtopics.length:'—'}</div><div class="cdm-stat-lbl">Subtopics</div></div>
        </div>
    </div>`;

    // --- Task chips ---
    var taskChipsHtml = `<div class="cdm-section">
        <div class="cdm-section-title"><i class="ph ph-check-square"></i> Study Tasks</div>
        <div class="cdm-task-chips">${window.ch_TASKS.map(function(t){
            return `<span class="cdm-task-chip${d[t.key]?' done':''}">${t.icon} ${t.label}</span>`;
        }).join('')}</div>
    </div>`;

    // --- Focus timeline (last 7 sessions by date) ---
    var focusDates = Object.keys(focusByDate).sort();
    var focusTimelineHtml = '';
    if(focusDates.length > 0) {
        var maxMins = Math.max.apply(null, focusDates.map(function(d){ return focusByDate[d]; }));
        var rows = focusDates.slice(-7).map(function(dt){
            var mins = focusByDate[dt];
            var barPct = maxMins > 0 ? Math.round(mins/maxMins*100) : 0;
            var h=Math.floor(mins/60), m=Math.round(mins%60);
            var label = dt.slice(5); // MM-DD
            return `<div class="cdm-focus-bar-row">
                <span class="cdm-focus-bar-label">${label}</span>
                <div class="cdm-focus-bar"><div class="cdm-focus-bar-fill" style="width:${barPct}%;"></div></div>
                <span class="cdm-focus-bar-val">${h>0?h+'h ':''  }${m}m</span>
            </div>`;
        }).join('');
        focusTimelineHtml = `<div class="cdm-section">
            <div class="cdm-section-title"><i class="ph ph-timer"></i> Focus Sessions (recent)</div>
            <div class="cdm-focus-bar-wrap">${rows}</div>
        </div>`;
    }

    // --- Individual focus sessions (date, time, duration, linked task) ---
    var chapSessions = (state.focus && state.focus.logs || []).filter(function(l){ return l.chapter === chapKey; }).sort(function(a,b){ return b.stamp - a.stamp; });
    var sessionsHtml = '';
    if(chapSessions.length > 0) {
        var sessRows = chapSessions.map(function(l){
            var endD = new Date(l.stamp);
            var startD = new Date(l.stamp - (l.duration||0)*60000);
            var dateLbl = endD.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
            var timeLbl = startD.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}) + ' – ' + endD.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
            var h=Math.floor((l.duration||0)/60), m=Math.round((l.duration||0)%60);
            var durStr = h>0 ? h+'h '+m+'m' : m+'m';
            var taskLbl = (l.taskTitle && l.taskTitle !== 'General Focus') ? l.taskTitle : 'No task linked';
            return `<div style="display:flex;flex-direction:column;gap:2px;padding:8px 12px;border-radius:9px;background:rgba(0,0,0,0.03);border:1px solid var(--border);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:0.78rem;font-weight:700;color:var(--text);">${escapeHTML(dateLbl)}</span>
                    <span style="font-size:0.75rem;font-weight:800;color:var(--accent);">${durStr}</span>
                </div>
                <div style="font-size:0.68rem;color:var(--text-dim);">${escapeHTML(timeLbl)}</div>
                <div style="font-size:0.7rem;color:var(--text-dim);"><i class="ph ph-target" style="margin-right:4px;"></i>${escapeHTML(taskLbl)}</div>
            </div>`;
        }).join('');
        sessionsHtml = `<div class="cdm-section">
            <div class="cdm-section-title"><i class="ph ph-list-checks"></i> All Focus Sessions (${chapSessions.length})</div>
            <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;padding-right:4px;">${sessRows}</div>
        </div>`;
    }

    // --- Subtopics list ---
    var subtopicsHtml = '';
    if(subtopics.length > 0) {
        var stItems = subtopics.map(function(st, idx){
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:9px;background:${st.done?'rgba(16,185,129,0.07)':'rgba(0,0,0,0.03)'};border:1px solid ${st.done?'rgba(16,185,129,0.25)':'var(--border)'};">
                <span style="font-size:0.75rem;">${st.done?'✅':'⬜'}</span>
                <span style="font-size:0.8rem;font-weight:600;flex:1;color:var(--text);${st.done?'text-decoration:line-through;opacity:0.65;':''}">${escapeHTML(st.name)}</span>
                ${st.doneAt?'<span style="font-size:0.65rem;color:var(--text-dim);">'+new Date(st.doneAt).toLocaleDateString()+'</span>':''}
            </div>`;
        }).join('');
        subtopicsHtml = `<div class="cdm-section">
            <div class="cdm-section-title"><i class="ph ph-list-bullets"></i> Subtopics (${stDone}/${subtopics.length})</div>
            <div style="display:flex;flex-direction:column;gap:6px;">${stItems}</div>
        </div>`;
    }

    // --- Notes / remarks ---
    var encodedName = encodeURIComponent(name);
    var notesHtml = `<div class="cdm-section">
        <div class="cdm-section-title"><i class="ph ph-note-pencil"></i> Notes & Remarks</div>
        <textarea id="cdm-notes-ta" class="cdm-notes-area" placeholder="Add notes, formulas, key points, doubts to revisit...">${escapeHTML(d.remark||d.notes||'')}</textarea>
        <button class="cdm-save-note-btn" onclick="window.ch_detailSaveNotes('${sub}','${encodedName}')"><i class="ph ph-floppy-disk"></i> Save Notes</button>
    </div>`;

    // --- Links ---
    var links = d.links || [];
    var linksListHtml = links.map(function(lk, i){
        var display = lk.replace(/^https?:\/\//,'').slice(0,55)+(lk.length>55?'…':'');
        return `<div class="cdm-link-item">
            <i class="ph ph-link" style="color:var(--accent);font-size:0.85rem;flex-shrink:0;"></i>
            <a href="${escapeHTML(lk)}" target="_blank" rel="noopener">${escapeHTML(display)}</a>
            <button class="cdm-link-del" onclick="window.ch_detailDelLink('${sub}','${encodedName}',${i})">✕</button>
        </div>`;
    }).join('');
    var linksHtml = `<div class="cdm-section">
        <div class="cdm-section-title"><i class="ph ph-link"></i> Resource Links</div>
        <div class="cdm-link-row">
            <input id="cdm-link-input" class="cdm-link-input" type="url" placeholder="https://youtube.com/...">
            <button class="cdm-link-add" onclick="window.ch_detailAddLink('${sub}','${encodedName}')">+ Add</button>
        </div>
        <div class="cdm-link-list" id="cdm-link-list">${linksListHtml}</div>
    </div>`;

    // --- Remark quick preview (use existing remark area, don't show separately) ---

    bodyEl.innerHTML = statsHtml + taskChipsHtml + (focusTimelineHtml||'') + (sessionsHtml||'') + subtopicsHtml + notesHtml + linksHtml;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

window.ch_closeDetail = function() {
    var modal = document.getElementById('ch-detail-modal');
    if(modal) modal.style.display = 'none';
    document.body.style.overflow = '';
};

window.ch_detailSaveNotes = function(sub, enc) {
    var name = decodeURIComponent(enc);
    var ta = document.getElementById('cdm-notes-ta');
    if(!ta || !window.ch_db[sub][name]) return;
    window.ch_db[sub][name].remark = ta.value;
    window.ch_db[sub][name].notes = ta.value;
    window.ch_save();
    // Flash save feedback
    var btn = document.querySelector('.cdm-save-note-btn');
    if(btn) { btn.textContent = '✓ Saved!'; setTimeout(function(){ btn.innerHTML='<i class="ph ph-floppy-disk"></i> Save Notes'; }, 1500); }
};

window.ch_detailAddLink = function(sub, enc) {
    var name = decodeURIComponent(enc);
    var inp = document.getElementById('cdm-link-input');
    if(!inp || !inp.value.trim()) return;
    var url = inp.value.trim();
    if(!/^https?:\/\//.test(url)) url = 'https://' + url;
    if(!window.ch_db[sub][name].links) window.ch_db[sub][name].links = [];
    window.ch_db[sub][name].links.push(url);
    inp.value = '';
    window.ch_save();
    // Re-open to refresh link list
    window.ch_openDetail(sub, enc);
};

window.ch_detailDelLink = function(sub, enc, idx) {
    var name = decodeURIComponent(enc);
    var links = window.ch_db[sub][name].links;
    if(!links) return;
    links.splice(idx, 1);
    window.ch_save();
    window.ch_openDetail(sub, enc);
};

// Close detail on Escape key
document.addEventListener('keydown', function(e) {
    if(e.key === 'Escape') {
        var modal = document.getElementById('ch-detail-modal');
        if(modal && modal.style.display !== 'none') window.ch_closeDetail();
    }
});

window.ch_toggle = function(sub, enc, key) {
    var name=decodeURIComponent(enc);
    if(!window.ch_db[sub][name]) window.ch_db[sub][name]={lecture:false,dpp:false,module:false,wrongQ:false,revision:false,test:false,done:false,custom:false};
    window.ch_db[sub][name][key] = !window.ch_db[sub][name][key];
    window.ch_save(); window.ch_render();
};
window.ch_saveRemark = function(sub, enc, val) {
    var name = decodeURIComponent(enc);
    if(!window.ch_db[sub][name]) return;
    window.ch_db[sub][name].remark = val;
    window.ch_save();
};

window.ch_markDone = function(sub, enc) {
    var name=decodeURIComponent(enc);
    if(!window.ch_db[sub][name]) window.ch_db[sub][name]={lecture:false,dpp:false,module:false,wrongQ:false,revision:false,test:false,done:false,custom:false};
    var isDone = !window.ch_db[sub][name].done;
    window.ch_db[sub][name].done = isDone;
    if(isDone) window.ch_TASKS.forEach(function(t){ window.ch_db[sub][name][t.key]=true; });
    window.ch_save(); window.ch_render();
};

window.ch_add = function() {
    var nameEl=document.getElementById('ch-new-name'), subEl=document.getElementById('ch-new-sub');
    var name=(nameEl&&nameEl.value.trim())||'';
    var sub=(subEl&&subEl.value)||(Object.keys(window.ch_SUBJECTS||{})[0]||'physics');
    if(!name){if(nameEl)nameEl.focus();return;}
    if(!window.ch_db[sub]) window.ch_db[sub]={};
    if(window.ch_db[sub][name]){alert('Already exists!');return;}
    // Build task object from current ch_TASKS dynamically
    var taskObj = {done:false, custom:true};
    (window.ch_TASKS||[]).forEach(function(t){ taskObj[t.key]=false; });
    // Fallback defaults
    ['lecture','dpp','module','wrongQ','revision','test'].forEach(function(k){ if(taskObj[k]===undefined) taskObj[k]=false; });
    window.ch_db[sub][name] = taskObj;
    // Also add to ch_SUBJECTS chapters list if not present
    if(window.ch_SUBJECTS[sub] && !window.ch_SUBJECTS[sub].chapters.includes(name)) {
        window.ch_SUBJECTS[sub].chapters.push(name);
    }
    if(nameEl) nameEl.value='';
    window.ch_activeSub=sub;
    window.ch_save(); window.ch_render();
};

window.ch_del = function(sub, enc) {
    var name=decodeURIComponent(enc);
    if(!confirm('Delete "'+name+'"?')) return;
    delete window.ch_db[sub][name];
    window.ch_save(); window.ch_render();
};

document.addEventListener('DOMContentLoaded', function(){
    var tab = document.querySelector('.nav-link[data-tab="chapters"]');
    if(tab) tab.addEventListener('click', function(){ setTimeout(function(){ window.ch_render(); }, 50); });
});

// ============================================================
// SUMMARY PAGE — TAB SWITCHING
// ============================================================
var _sumActiveTab = 's1';
var _sumChapDateFilter = 'all';
var _sumChapSubjFilter = 'all';
var _sumChapSubMode = 'report';
var _crWeeklyChart = null, _crMonthlyChart = null;
var _pieSubjectChart = null, _pieStudyTypeChart = null, _pieNestedChart = null;

window.sumSwitchTab = function(tab, btn) {
    _sumActiveTab = tab;
    document.querySelectorAll('.sum-tab-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    document.querySelectorAll('.sum-section').forEach(s=>s.classList.remove('active'));
    var sec = document.getElementById('sum-'+tab);
    if(sec) sec.classList.add('active');
    if(tab === 's4') { window.renderChapterReport(); window.renderStudyPieCharts(); window.renderWeakChapters(); }
    if(tab === 's3') { renderStaminaHistory(); }
    if(tab === 's2') {
        renderIncompleteMissions();
        var burnoutDays=[];
        for(var i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);burnoutDays.push({ds:getLocalIsoDate(d),mins:getDailyProdMins(getLocalIsoDate(d))});}
        updateBurnoutSummaryCard(burnoutDays);
    }
};

window.sumChapSub = function(mode, btn) {
    _sumChapSubMode = mode;
    document.querySelectorAll('#sum-s4 > div:nth-child(2) .lb-filter-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    document.getElementById('sum-chap-report').style.display = (mode==='report') ? 'block' : 'none';
    document.getElementById('sum-chap-charts').style.display = (mode==='charts') ? 'block' : 'none';
    document.getElementById('sum-chap-weak').style.display = (mode==='weakchap') ? 'block' : 'none';
    if(mode === 'charts') window.renderStudyPieCharts();
    if(mode === 'weakchap') window.renderWeakChapters();
    if(mode === 'report') window.renderChapterReport();
};

window.sumChapFilter = function(range, btn) {
    _sumChapDateFilter = range;
    document.querySelectorAll('#sum-s4 > div:nth-child(3) .lb-filter-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    window.renderChapterReport();
    window.renderStudyPieCharts();
};

window.sumChapSubjFilter = function(subj, btn) {
    _sumChapSubjFilter = subj;
    document.querySelectorAll('#sum-chap-report > div:first-child .lb-filter-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    window.renderChapterReport();
};

// Show the month picker input
window.sumChapPickMonth = function(btn) {
    var mp = document.getElementById('chap-month-picker');
    var wp = document.getElementById('chap-week-picker');
    var mi = document.getElementById('chap-month-input');
    if(!mp) return;
    var isVisible = mp.style.display === 'flex';
    // Hide week picker
    if(wp) wp.style.display = 'none';
    if(isVisible) {
        mp.style.display = 'none';
        // Revert to 'all' if no value chosen
        if(!mi || !mi.value) { _sumChapDateFilter='all'; window.renderChapterReport(); window.renderStudyPieCharts(); }
    } else {
        mp.style.display = 'flex';
        if(mi && mi.value) window.sumChapFilterMonth(mi.value);
    }
};

// Show the week picker input
window.sumChapPickWeek = function(btn) {
    var mp = document.getElementById('chap-month-picker');
    var wp = document.getElementById('chap-week-picker');
    var wi = document.getElementById('chap-week-input');
    if(!wp) return;
    var isVisible = wp.style.display === 'flex';
    // Hide month picker
    if(mp) mp.style.display = 'none';
    if(isVisible) {
        wp.style.display = 'none';
        if(!wi || !wi.value) { _sumChapDateFilter='all'; window.renderChapterReport(); window.renderStudyPieCharts(); }
    } else {
        wp.style.display = 'flex';
        if(wi && wi.value) window.sumChapFilterWeek(wi.value);
    }
};

// Filter by a specific YYYY-MM month
window.sumChapFilterMonth = function(val) {
    if(!val) return;
    _sumChapDateFilter = 'month_' + val;
    // Remove active from all date range buttons
    document.querySelectorAll('#sum-s4 > div:nth-child(3) .lb-filter-btn').forEach(b=>b.classList.remove('active'));
    var btn = document.getElementById('chap-pick-month-btn');
    if(btn) btn.classList.add('active');
    window.renderChapterReport();
    window.renderStudyPieCharts();
};

// Filter by a specific ISO week string YYYY-Www
window.sumChapFilterWeek = function(val) {
    if(!val) return;
    _sumChapDateFilter = 'week_' + val;
    document.querySelectorAll('#sum-s4 > div:nth-child(3) .lb-filter-btn').forEach(b=>b.classList.remove('active'));
    var btn = document.getElementById('chap-pick-week-btn');
    if(btn) btn.classList.add('active');
    window.renderChapterReport();
    window.renderStudyPieCharts();
};

function _getChapDateRange() {
    var now = new Date();
    var f = _sumChapDateFilter;
    if(f==='all') return {start:0, end:Date.now()};
    if(f==='2026') return {start:new Date('2026-01-01').getTime(), end:new Date('2026-12-31T23:59:59').getTime()};
    if(f==='2027') return {start:new Date('2027-01-01').getTime(), end:new Date('2027-12-31T23:59:59').getTime()};
    if(f==='2028') return {start:new Date('2028-01-01').getTime(), end:new Date('2028-12-31T23:59:59').getTime()};
    if(f==='this_week') {
        var w=new Date(now);w.setDate(now.getDate()-now.getDay());w.setHours(0,0,0,0);
        return {start:w.getTime(), end:Date.now()};
    }
    if(f==='this_month') {
        return {start:new Date(now.getFullYear(),now.getMonth(),1).getTime(), end:Date.now()};
    }
    // Specific month picker: "month_YYYY-MM"
    if(f.startsWith('month_')) {
        var parts = f.replace('month_','').split('-');
        var yr = parseInt(parts[0]), mo = parseInt(parts[1]) - 1;
        return {start: new Date(yr,mo,1).getTime(), end: new Date(yr,mo+1,0,23,59,59,999).getTime()};
    }
    // Specific ISO week picker: "week_YYYY-Www"
    if(f.startsWith('week_')) {
        var wStr = f.replace('week_',''); // e.g. "2026-W22"
        var wParts = wStr.split('-W');
        var wYr = parseInt(wParts[0]), wNum = parseInt(wParts[1]);
        // Find Monday of that ISO week
        var jan4 = new Date(wYr, 0, 4); // Jan 4 is always in week 1
        var weekStart = new Date(jan4);
        weekStart.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (wNum - 1) * 7);
        weekStart.setHours(0,0,0,0);
        var weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23,59,59,999);
        return {start: weekStart.getTime(), end: weekEnd.getTime()};
    }
    return {start:0, end:Date.now()};
}

// Build chapter focus time map from focus logs
function _buildChapFocusMap(start, end) {
    var map = {};
    (state.focus.logs||[]).filter(l=>l.stamp>=start&&l.stamp<=end).forEach(l=>{
        if(l.chapter) {
            map[l.chapter] = (map[l.chapter]||0) + (l.duration||0);
        }
    });
    return map;
}

window.renderChapterReport = function() {
    var el = document.getElementById('cr-chapter-list'); if(!el) return;
    var range = _getChapDateRange();
    var focusMap = _buildChapFocusMap(range.start, range.end);
    var subjects = Object.keys(window.ch_SUBJECTS);
    if(_sumChapSubjFilter !== 'all') subjects = [_sumChapSubjFilter];

    var allCards = [];
    var totalFocus = 0, strongCount = 0, weakCount = 0, tasksDoneTotal = 0;

    subjects.forEach(function(sub) {
        window.ch_ensure(sub);
        var subData = window.ch_db[sub];
        var canonicals = window.ch_SUBJECTS[sub].chapters;
        var allChaps = canonicals.filter(function(n){ return subData[n]; });
        var customs = Object.keys(subData).filter(function(n){ return subData[n].custom; });
        allChaps = allChaps.concat(customs);
        var subInfo = window.ch_SUBJECTS[sub];

        allChaps.forEach(function(chap) {
            var chapKey = sub + '::' + chap;
            var focusMins = focusMap[chapKey] || 0;
            totalFocus += focusMins;
            var d = subData[chap] || {};
            var tasksDone = window.ch_TASKS.filter(function(t){ return d[t.key]; }).length;
            tasksDoneTotal += tasksDone;
            var isStrong = (d.done || (tasksDone >= 4 && focusMins >= 60));
            // Only mark weak if there's been SOME activity but not enough
            var hasActivity = focusMins > 0 || tasksDone > 0;
            var isWeak = hasActivity && !isStrong && (focusMins < 30 || tasksDone <= 1);
            if(isStrong) strongCount++;
            else if(isWeak) weakCount++;
            // Only include in report if there's some activity (has focus or tasks)
            if(hasActivity || d.done) {
                allCards.push({sub, subInfo, chap, chapKey, focusMins, tasksDone, d, isStrong, isWeak});
            }
        });
    });

    // Update stats
    var crStrong=document.getElementById('cr-strong'); if(crStrong) crStrong.textContent=strongCount;
    var crWeak=document.getElementById('cr-weak'); if(crWeak) crWeak.textContent=weakCount;
    var crFocus=document.getElementById('cr-focus');
    if(crFocus) {
        var h=Math.floor(totalFocus/60),m=Math.floor(totalFocus%60);
        crFocus.textContent=(h>0?h+'h ':'') + m + 'm';
    }
    var crTasks=document.getElementById('cr-tasks'); if(crTasks) crTasks.textContent=tasksDoneTotal;

    // Render bar charts
    _renderChapWeeklyChart();
    _renderChapMonthlyChart();

    // Render chapter cards
    if(!allCards.length) {
        el.innerHTML='<div style="text-align:center;padding:48px 20px;color:var(--text-dim);"><div style="font-size:2.5rem;margin-bottom:12px;">📭</div><div style="font-weight:700;margin-bottom:6px;">No chapter activity yet</div><div style="font-size:0.78rem;">Start a focus session linked to a chapter, or mark tasks in Chapter Tracker to see your report here.</div></div>';
        return;
    }
    // Sort: weak first, then by focus desc
    allCards.sort(function(a,b){
        if(a.isWeak && !b.isWeak) return -1;
        if(!a.isWeak && b.isWeak) return 1;
        return b.focusMins - a.focusMins;
    });
    el.innerHTML = allCards.map(function(c) {
        var fh=Math.floor(c.focusMins/1440),fm=Math.floor((c.focusMins%1440)/60),fs=Math.floor(c.focusMins%60);
        var focusStr = fh>0?String(fh).padStart(2,'0')+':'+String(fm).padStart(2,'0')+':'+String(fs).padStart(2,'0'):String(fm).padStart(2,'0')+':'+String(fs).padStart(2,'0');
        var badge = c.isStrong ? '<span style="font-size:0.6rem;padding:2px 8px;border-radius:99px;background:rgba(0,229,160,0.12);color:var(--prod);border:1px solid rgba(0,229,160,0.3);font-weight:700;">💪 STRONG</span>' :
            c.isWeak ? '<span style="font-size:0.6rem;padding:2px 8px;border-radius:99px;background:rgba(255,75,112,0.1);color:var(--danger);border:1px solid rgba(255,75,112,0.3);font-weight:700;">⚠️ WEAK</span>' : '';
        var tasksHtml = window.ch_TASKS.map(function(t){
            return '<span style="font-size:0.62rem;padding:2px 7px;border-radius:5px;margin-right:4px;background:'+
                (c.d[t.key]?'rgba(0,229,160,0.12)':'rgba(0,0,0,0.1)')+';color:'+
                (c.d[t.key]?'var(--prod)':'var(--text-dim)')+
                ';">'+t.icon+' '+t.label+'</span>';
        }).join('');
        return '<div class="ch-report-card'+(c.isStrong?' ch-report-strong':c.isWeak?' ch-report-weak':'')+'">'+
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">'+
            '<span style="font-size:0.75rem;font-weight:700;color:var(--text);">'+escapeHTML(c.chap)+'</span>'+
            '<span style="font-size:0.6rem;color:'+c.subInfo.color+';border:1px solid '+c.subInfo.color+'44;padding:2px 7px;border-radius:99px;">'+c.subInfo.label+'</span>'+
            badge+
            '<span style="margin-left:auto;font-family:var(--font-mono);font-size:0.72rem;color:var(--accent);">⏱ '+focusStr+'</span>'+
            '</div>'+
            '<div style="display:flex;flex-wrap:wrap;gap:4px;">'+tasksHtml+'</div>'+
            '</div>';
    }).join('');
};

function _renderChapWeeklyChart() {
    var canvas = document.getElementById('cr-weekly-chart'); if(!canvas) return;
    // Last 7 days productive mins from sw logs
    var labels=[], data=[];
    for(var i=6;i>=0;i--) {
        var d=new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
        var e=new Date(d); e.setHours(23,59,59,999);
        labels.push(d.toLocaleDateString('en-US',{weekday:'short'}));
        var mins=getDailyProdMins(getLocalIsoDate(d));
        data.push(Math.round(mins));
    }
    if(_crWeeklyChart){_crWeeklyChart.destroy();_crWeeklyChart=null;}
    var ctx=canvas.getContext('2d');
    _crWeeklyChart=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Productive Mins',data,backgroundColor:'rgba(79,110,247,0.65)',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'var(--text-dim)',font:{size:10}}},y:{ticks:{color:'var(--text-dim)',font:{size:10}},beginAtZero:true}}}});
}

function _renderChapMonthlyChart() {
    var canvas = document.getElementById('cr-monthly-chart'); if(!canvas) return;
    var labels=[], data=[];
    for(var i=5;i>=0;i--) {
        var d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);
        var mStart=new Date(d.getFullYear(),d.getMonth(),1).getTime();
        var mEnd=new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999).getTime();
        labels.push(d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2));
        var mins=0;
        (state.sw&&state.sw.logs?state.sw.logs:[]).filter(l=>l.stamp>=mStart&&l.stamp<=mEnd&&l.type==='productive').forEach(l=>mins+=l.duration/60000);
        data.push(Math.round(mins));
    }
    if(_crMonthlyChart){_crMonthlyChart.destroy();_crMonthlyChart=null;}
    var ctx=canvas.getContext('2d');
    _crMonthlyChart=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Productive Mins',data,backgroundColor:'rgba(0,229,160,0.65)',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'var(--text-dim)',font:{size:10}}},y:{ticks:{color:'var(--text-dim)',font:{size:10}},beginAtZero:true}}}});
}

// ============================================================
// 3 PIE CHARTS — Study Analytics
// ============================================================
window.renderStudyPieCharts = function() {
    var range = _getChapDateRange();
    var start = range.start, end = range.end;

    // Build dynamic subject lists from ch_SUBJECTS
    var _S = window.ch_SUBJECTS || {};
    var subKeys = Object.keys(_S).length > 0 ? Object.keys(_S) : ['physics','chemistry','maths'];

    // ONLY SOURCE: Activity Logger productive logs with subject/studyType tags
    var subjectMins = {};
    var typeCounts = {};
    var subjectTypeCounts = {};
    subKeys.forEach(function(k){ subjectMins[k]=0; subjectTypeCounts[k]={}; });

    (state.sw && state.sw.logs || []).filter(function(l){
        return l.stamp>=start && l.stamp<=end && l.type==='productive';
    }).forEach(function(l) {
        var durMins = (l.duration||0) / 60000; // ms -> minutes
        if(l.subject && subjectMins[l.subject]!==undefined) {
            subjectMins[l.subject] += durMins;
        } else if(l.subject) {
            subjectMins[l.subject] = (subjectMins[l.subject]||0) + durMins;
        }
        if(l.studyType) {
            typeCounts[l.studyType] = (typeCounts[l.studyType]||0) + durMins;
            if(l.subject) {
                if(!subjectTypeCounts[l.subject]) subjectTypeCounts[l.subject]={};
                subjectTypeCounts[l.subject][l.studyType] = (subjectTypeCounts[l.subject][l.studyType]||0) + durMins;
            }
        }
    });

    // NOTE: Focus session time intentionally NOT included here —
    // Study Analytics shows only tagged productive Activity Logger sessions.

    // Build subject colors/labels dynamically
    var subColors = {};
    var subLabels = {};
    subKeys.forEach(function(k){
        subColors[k] = (_S[k]&&_S[k].color) || '#888';
        subLabels[k] = (_S[k]&&_S[k].label) || k;
    });
    // fallbacks for legacy data
    if(!subColors.physics) subColors.physics='#38bdf8';
    if(!subColors.chemistry) subColors.chemistry='#f472b6';
    if(!subColors.maths) subColors.maths='#a855f7';
    if(!subLabels.physics) subLabels.physics='Physics';
    if(!subLabels.chemistry) subLabels.chemistry='Chemistry';
    if(!subLabels.maths) subLabels.maths='Maths';
    var typeColors = {lecture:'#4f6ef7', module:'#7c3aed', dpp:'#10b981', test:'#f59e0b', revision:'#38bdf8'};
    var typeLabels = {lecture:'🎬 Lecture', module:'📚 Module', dpp:'📝 DPP', test:'✅ Test', revision:'🔁 Revision'};

    // PIE 1: Time by Subject
    _renderSimplePie('pie-subject', 'pie-subject-legend', 'pie-subject-empty',
        Object.entries(subjectMins).filter(([k,v])=>v>0).map(([k,v])=>({label:subLabels[k]||k, value:Math.round(v), color:subColors[k]||'#888'})),
        function(val){ var h=Math.floor(val/60),m=Math.floor(val%60); return (h>0?h+'h ':'') + m+'m'; }
    );

    // PIE 2: Time by Study Type (from activity logs - duration in mins)
    _renderSimplePie('pie-studytype', 'pie-studytype-legend', 'pie-studytype-empty',
        Object.entries(typeCounts).filter(([k,v])=>v>0).map(([k,v])=>({label:typeLabels[k]||k, value:Math.round(v), color:typeColors[k]||'#888'})),
        function(val){ var h=Math.floor(val/60),m=Math.floor(val%60); return (h>0?h+'h ':'') + m+'m'; }
    );

    // PIE 3: Subject × Type (grouped bar chart)
    _renderNestedBar('pie-nested', 'pie-nested-legend', 'pie-nested-empty', subjectTypeCounts, typeColors, typeLabels, subColors, subLabels);

    // PIE 4: Time by Chapter (from Deep Focus sessions with a linked chapter)
    var chapterMins = {};
    (state.focus && state.focus.logs || []).filter(function(l){
        return l.stamp>=start && l.stamp<=end && l.chapter;
    }).forEach(function(l){
        chapterMins[l.chapter] = (chapterMins[l.chapter]||0) + (l.duration||0);
    });
    var chapColors = ['#4f6ef7','#f59e0b','#10b981','#ec4899','#8b5cf6','#06b6d4','#f43f5e','#84cc16','#38bdf8','#a855f7'];
    var chapEntries = Object.entries(chapterMins).filter(function(kv){return kv[1]>0;}).sort(function(a,b){return b[1]-a[1];});
    _renderSimplePie('pie-chapter', 'pie-chapter-legend', 'pie-chapter-empty',
        chapEntries.map(function(kv,i){return {label:kv[0], value:Math.round(kv[1]), color:chapColors[i%chapColors.length]};}),
        function(val){ var h=Math.floor(val/60),m=Math.floor(val%60); return (h>0?h+'h ':'') + m+'m'; }
    );
};

function _renderSimplePie(canvasId, legendId, emptyId, items, fmtFn) {
    var canvas=document.getElementById(canvasId);
    var legend=document.getElementById(legendId);
    var empty=document.getElementById(emptyId);
    if(!canvas||!legend) return;

    // Destroy existing chart on canvas
    if(canvas._chart){canvas._chart.destroy();canvas._chart=null;}
    if(!items.length) {
        if(empty)empty.style.display='flex';canvas.style.display='none';
        legend.innerHTML='<div style="color:var(--text-dim);">No data in this range.</div>';
        return;
    }
    if(empty)empty.style.display='none';canvas.style.display='block';
    var ctx=canvas.getContext('2d');
    canvas._chart=new Chart(ctx,{
        type:'doughnut',
        data:{labels:items.map(i=>i.label),datasets:[{data:items.map(i=>i.value),backgroundColor:items.map(i=>i.color),borderWidth:2}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.label+': '+(fmtFn?fmtFn(c.raw):c.raw);}}}}}
    });
    legend.innerHTML=items.map(i=>'<div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:'+i.color+';flex-shrink:0;"></span><span>'+i.label+': <strong>'+(fmtFn?fmtFn(i.value):i.value)+'</strong></span></div>').join('');
}

function _renderNestedBar(canvasId, legendId, emptyId, subjectTypeCounts, typeColors, typeLabels, subColors, subLabels) {
    var canvas=document.getElementById(canvasId);
    var legend=document.getElementById(legendId);
    var empty=document.getElementById(emptyId);
    if(!canvas||!legend) return;
    if(canvas._chart){canvas._chart.destroy();canvas._chart=null;}
    // Use dynamic subjects from ch_SUBJECTS if available
    var _S = window.ch_SUBJECTS || {};
    var subjects = Object.keys(_S).length > 0 ? Object.keys(_S) : ['physics','chemistry','maths'];
    // Collect all study types from data too
    var allTypes = new Set();
    subjects.forEach(function(s){ Object.keys(subjectTypeCounts[s]||{}).forEach(function(t){ allTypes.add(t); }); });
    var types = allTypes.size > 0 ? Array.from(allTypes) : ['lecture','dpp','module','test','revision'];
    var hasData=false;
    subjects.forEach(s=>{types.forEach(t=>{ if((subjectTypeCounts[s]||{})[t]>0) hasData=true; });});
    if(!hasData) {
        if(empty)empty.style.display='flex';canvas.style.display='none';
        legend.innerHTML='<div style="color:var(--text-dim);">No tagged task data.</div>';
        return;
    }
    if(empty)empty.style.display='none';canvas.style.display='block';
    var ctx=canvas.getContext('2d');
    var datasets=types.filter(t=>subjects.some(s=>(subjectTypeCounts[s]||{})[t]>0)).map(t=>({
        label:typeLabels[t]||t,
        data:subjects.map(s=>(subjectTypeCounts[s]||{})[t]||0),
        backgroundColor:typeColors[t]||'#888',
        borderRadius:3
    }));
    canvas._chart=new Chart(ctx,{
        type:'bar',
        data:{labels:subjects.map(s=>subLabels[s]||(_S[s]&&_S[s].label)||s), datasets},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'var(--text-dim)',font:{size:10},padding:4}}},scales:{x:{stacked:true,ticks:{color:'var(--text-dim)',font:{size:10}}},y:{stacked:true,ticks:{color:'var(--text-dim)',font:{size:10}},beginAtZero:true}}}
    });
    legend.innerHTML=datasets.map(d=>'<div style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:'+d.backgroundColor+';flex-shrink:0;"></span><span style="font-size:0.68rem;">'+d.label+'</span></div>').join('');
}

// ============================================================
// WEAK CHAPTERS FROM TESTS
// ============================================================
window.renderWeakChapters = function() {
    var el = document.getElementById('cr-weak-chapters-list'); if(!el) return;
    // Gather wrong questions by chapter from AT history
    var byChapter = {};
    try {
        var histRaw = localStorage.getItem('astraea2_at_history');
        var hist = histRaw ? JSON.parse(histRaw) : [];
        hist.forEach(function(test) {
            var allQ = test.allQ || [];
            allQ.filter(q=>q.status==='wrong').forEach(function(item) {
                var ch = (item.q&&item.q.chapter) ? item.q.chapter : 'Unknown';
                var sub = (item.q&&item.q.subject) ? item.q.subject : (item.sn||'Unknown');
                if(!byChapter[ch]) byChapter[ch]={chapter:ch, subject:sub, count:0, questions:[]};
                byChapter[ch].count++;
                byChapter[ch].questions.push({
                    text:(item.q&&item.q.question)||'',
                    testName:test.examName||'Test',
                    date:test.date||'',
                    correct:(item.q&&item.q.correct)||'',
                    ua:item.ua||'',
                });
            });
        });
    } catch(e){}
    var sorted = Object.values(byChapter).sort(function(a,b){return b.count-a.count;});
    if(!sorted.length) {
        el.innerHTML='<div style="text-align:center;padding:28px;color:var(--text-dim);">No wrong question data found. Take and review tests to populate this list.</div>';
        return;
    }
    el.innerHTML = sorted.slice(0,20).map(function(c) {
        // Dynamic color lookup
        const _S = window.ch_SUBJECTS || {};
        const matchedSub = Object.values(_S).find(function(s){ return s.label === c.subject; });
        var subColor = matchedSub ? matchedSub.color : (c.subject==='Physics'?'#38bdf8':c.subject==='Chemistry'?'#f472b6':c.subject==='Mathematics'?'#a855f7':'var(--accent)');
        return '<div class="ch-report-card ch-report-weak" style="margin-bottom:12px;">'+
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">'+
            '<span style="font-weight:700;font-size:0.82rem;color:var(--text);">'+escapeHTML(c.chapter)+'</span>'+
            '<span style="font-size:0.62rem;color:'+subColor+';border:1px solid '+subColor+'44;padding:2px 8px;border-radius:99px;">'+escapeHTML(c.subject)+'</span>'+
            '<span style="margin-left:auto;font-family:var(--font-mono);font-size:0.8rem;color:var(--danger);font-weight:800;">'+c.count+' ✗</span>'+
            '</div>'+
            c.questions.slice(0,3).map(function(q) {
                return '<div style="padding:8px 12px;margin-top:6px;background:rgba(255,75,112,0.04);border:1px solid rgba(255,75,112,0.15);border-radius:8px;font-size:0.75rem;">'+
                    '<div style="color:var(--text);margin-bottom:4px;line-height:1.5;">'+escapeHTML((q.text||'').slice(0,140))+(q.text&&q.text.length>140?'…':'')+'</div>'+
                    '<div style="display:flex;gap:12px;color:var(--text-dim);">'+
                    '<span>📋 '+escapeHTML(q.testName)+'</span>'+
                    '<span>📅 '+escapeHTML(q.date)+'</span>'+
                    '</div>'+
                    '</div>';
            }).join('')+
            (c.questions.length>3?'<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;padding-left:4px;">...and '+(c.questions.length-3)+' more questions</div>':'')+
            '</div>';
    }).join('');
};


// ============================================================
// ONBOARDING WIZARD
// ============================================================
window._obData = {
    step: 0,
    exam: '',           // 'jee' | 'neet' | 'upsc' | 'mpsc' | 'cuet' | 'boards' | 'custom'
    examLabel: '',
    subjects: [],       // [{key, label, color}]
    chapters: {},       // {subjectKey: [chapName, ...]}
    studyTypes: [],     // e.g. ['lecture','dpp','module','revision','test','wrongQ']
    leaderboard: true,
    customExamName: ''
};

const OB_EXAMS = [
    { key:'jee',    icon:'⚛️',  name:'JEE',      desc:'Main & Advanced' },
    { key:'neet',   icon:'🧬',  name:'NEET',     desc:'UG Medical' },
    { key:'upsc',   icon:'🏛️',  name:'UPSC',     desc:'Civil Services' },
    { key:'mpsc',   icon:'📜',  name:'MPSC',     desc:'Maharashtra PSC' },
    { key:'cuet',   icon:'🎓',  name:'CUET',     desc:'Central UG Test' },
    { key:'boards', icon:'📚',  name:'Boards',   desc:'10th / 12th' },
    { key:'custom', icon:'✨',  name:'Custom',   desc:'Any other exam' }
];

const OB_DEFAULT_SUBJECTS = {
    jee:    [{key:'physics',   label:'Physics',    color:'#38bdf8'},{key:'chemistry', label:'Chemistry',  color:'#f472b6'},{key:'maths',     label:'Maths',      color:'#a855f7'}],
    neet:   [{key:'physics',   label:'Physics',    color:'#38bdf8'},{key:'chemistry', label:'Chemistry',  color:'#f472b6'},{key:'biology',   label:'Biology',    color:'#4ade80'}],
    upsc:   [{key:'gs1',       label:'GS Paper I', color:'#fb923c'},{key:'gs2',       label:'GS Paper II',color:'#f472b6'},{key:'gs3',       label:'GS Paper III',color:'#a855f7'},{key:'gs4',label:'GS Paper IV',color:'#38bdf8'},{key:'essay',label:'Essay',color:'#4ade80'}],
    mpsc:   [{key:'rajyaseva', label:'Rajyaseva',  color:'#fb923c'},{key:'combine',   label:'Combined',   color:'#f472b6'},{key:'psi',       label:'PSI',        color:'#a855f7'}],
    cuet:   [{key:'domain1',   label:'Domain 1',   color:'#38bdf8'},{key:'domain2',   label:'Domain 2',   color:'#f472b6'},{key:'general',   label:'General Test',color:'#4ade80'}],
    boards: [{key:'maths',     label:'Maths',      color:'#a855f7'},{key:'science',   label:'Science',    color:'#38bdf8'},{key:'english',   label:'English',    color:'#f472b6'},{key:'social',label:'Social Studies',color:'#4ade80'},{key:'hindi',label:'Hindi',color:'#fb923c'}],
    custom: []
};

const OB_ALL_STUDY_TYPES = [
    {key:'lecture',  icon:'🎬', label:'Lecture / Video'},
    {key:'dpp',      icon:'📝', label:'DPP / Daily Practice'},
    {key:'module',   icon:'📖', label:'Module / Notes'},
    {key:'revision', icon:'🔁', label:'Revision'},
    {key:'test',     icon:'📋', label:'Mock Test'},
    {key:'wrongQ',   icon:'❌', label:'Wrong Questions'},
    {key:'ncert',    icon:'📗', label:'NCERT Reading'},
    {key:'pyq',      icon:'🗂️', label:'PYQ Practice'},
    {key:'flash',    icon:'⚡', label:'Flashcards'},
    {key:'writing',  icon:'✍️', label:'Answer Writing'},
    {key:'map',      icon:'🗺️', label:'Map Practice'},
    {key:'current',  icon:'📰', label:'Current Affairs'},
];

const OB_STEPS = ['Exam','Subjects','Chapters','Study Types','Leaderboard','Review'];
const OB_TOTAL = OB_STEPS.length;

window.obShow = function() {
    document.getElementById('onboarding-overlay').classList.add('active');
    window._obData.step = 0;
    obRender();
};
window.obOpen = window.obShow; // alias for settings button
window.obHide = function() {
    document.getElementById('onboarding-overlay').classList.remove('active');
};

function obStepDots() {
    return OB_STEPS.map((_,i) => {
        const s = window._obData.step;
        const cls = i < s ? 'done' : i === s ? 'active' : '';
        return `<div class="ob-dot ${cls}"></div>`;
    }).join('');
}

function obRender() {
    const d = window._obData;
    document.getElementById('ob-steps').innerHTML = obStepDots();
    const content = document.getElementById('ob-content');
    if(d.step === 0) content.innerHTML = obStep0();
    else if(d.step === 1) content.innerHTML = obStep1();
    else if(d.step === 2) content.innerHTML = obStep2();
    else if(d.step === 3) content.innerHTML = obStep3();
    else if(d.step === 4) content.innerHTML = obStep4();
    else if(d.step === 5) content.innerHTML = obStep5();
    // bind events after render
    obBindStep(d.step);
}

// ---- STEP 0: Choose Exam ----
function obStep0() {
    const d = window._obData;
    const cards = OB_EXAMS.map(e => `
        <div class="ob-exam-card${d.exam===e.key?' selected':''}" onclick="obPickExam('${e.key}')">
            <div class="ob-exam-icon">${e.icon}</div>
            <div class="ob-exam-name">${e.name}</div>
            <div class="ob-exam-desc">${e.desc}</div>
        </div>`).join('');
    const customField = d.exam === 'custom' ? `
        <div style="margin-bottom:16px;">
            <input id="ob-custom-exam-name" type="text" placeholder="Enter your exam name..."
                style="width:100%;padding:10px 14px;background:rgba(0,0,0,0.35);border:1px solid rgba(79,110,247,0.4);border-radius:10px;color:#f0f4ff;font-size:0.88rem;font-family:var(--font-body);"
                value="${escapeHTML(d.customExamName||'')}">
        </div>` : '';
    return `
        <div class="ob-title">What are you preparing for?</div>
        <div class="ob-sub">Astraea will personalize your OS — chapters, subjects & countdown — based on your goal.</div>
        <div class="ob-exam-grid">${cards}</div>
        ${customField}
        <div class="ob-actions">
            <button class="ob-btn-next" id="ob-next-0" ${d.exam?'':'disabled'} onclick="obNext()">Continue →</button>
        </div>`;
}
window.obPickExam = function(key) {
    window._obData.exam = key;
    window._obData.examLabel = OB_EXAMS.find(e=>e.key===key)?.name || key;
    // Load default subjects for exam
    const defaults = (OB_DEFAULT_SUBJECTS[key]||[]).map(s=>({...s, selected:true}));
    window._obData.subjects = defaults;
    obRender();
};

// ---- STEP 1: Subjects ----
function obStep1() {
    const d = window._obData;
    const chips = d.subjects.map((s,i) => `
        <div class="ob-subj-chip${s.selected?' selected':''}" onclick="obToggleSubj(${i})" style="--chip-color:${s.color}">
            <span class="ob-chip-dot" style="background:${s.color};"></span>
            ${escapeHTML(s.label)}
            ${d.subjects.length > 1 ? `<span onclick="obRemoveSubj(event,${i})" style="margin-left:4px;opacity:0.5;font-size:0.9em;cursor:pointer;">✕</span>` : ''}
        </div>`).join('');
    return `
        <div class="ob-title">Your Subjects</div>
        <div class="ob-sub">Select the subjects you'll study. You can add custom ones too.</div>
        <div class="ob-subject-grid" id="ob-subj-grid">${chips}</div>
        <div class="ob-add-subj">
            <input id="ob-subj-input" type="text" placeholder="Add custom subject..." onkeydown="if(event.key==='Enter') obAddSubj()">
            <button onclick="obAddSubj()">+ Add</button>
        </div>
        <div class="ob-actions">
            <button class="ob-btn-back" onclick="obBack()">← Back</button>
            <button class="ob-btn-next" id="ob-next-1" onclick="obNext()">Continue →</button>
        </div>`;
}
window.obToggleSubj = function(i) {
    window._obData.subjects[i].selected = !window._obData.subjects[i].selected;
    obRender();
};
window.obRemoveSubj = function(e, i) {
    e.stopPropagation();
    window._obData.subjects.splice(i, 1);
    obRender();
};
window.obAddSubj = function() {
    const inp = document.getElementById('ob-subj-input');
    const val = (inp?.value||'').trim();
    if(!val) return;
    const colors = ['#38bdf8','#f472b6','#a855f7','#4ade80','#fb923c','#fbbf24','#e879f9','#34d399'];
    const key = val.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    window._obData.subjects.push({ key: key||('subj'+Date.now()), label:val, color: colors[window._obData.subjects.length%colors.length], selected:true });
    obRender();
};

// ---- STEP 2: Chapter Lists ----
function obStep2() {
    const d = window._obData;
    const activeSubjs = d.subjects.filter(s=>s.selected);
    if(!activeSubjs.length) return obStep1();
    const blocks = activeSubjs.map(s => `
        <div class="ob-chapter-block">
            <div class="ob-chapter-label">
                <span style="background:${s.color};"></span>
                ${escapeHTML(s.label)} chapters
            </div>
            <textarea class="ob-chapter-input" id="ob-chap-${s.key}"
                placeholder="Kinematics, Laws of Motion, Work Energy Power, ..."
                oninput="obSaveChaps('${s.key}',this.value)">${escapeHTML((d.chapters[s.key]||[]).join(', '))}</textarea>
        </div>`).join('');
    return `
        <div class="ob-title">Paste Your Chapter Lists</div>
        <div class="ob-sub">Paste chapters separated by commas. You can always edit them later in Chapter Tracker.</div>
        ${blocks}
        <div class="ob-actions">
            <button class="ob-btn-back" onclick="obBack()">← Back</button>
            <button class="ob-btn-next" onclick="obNext()">Continue →</button>
        </div>`;
}
window.obSaveChaps = function(key, val) {
    window._obData.chapters[key] = val.split(',').map(c=>c.trim()).filter(Boolean);
};

// ---- STEP 3: Study Types ----
function obStep3() {
    const d = window._obData;
    const chips = OB_ALL_STUDY_TYPES.map(t => `
        <div class="ob-stype-chip${d.studyTypes.includes(t.key)?' selected':''}" onclick="obToggleStype('${t.key}')">
            <span>${t.icon}</span> ${t.label}
        </div>`).join('');
    return `
        <div class="ob-title">Study Session Types</div>
        <div class="ob-sub">What kinds of study sessions do you want to track? These will appear as options in Focus & Activity Logger.</div>
        <div class="ob-studytype-grid">${chips}</div>
        <div class="ob-actions">
            <button class="ob-btn-back" onclick="obBack()">← Back</button>
            <button class="ob-btn-next" id="ob-next-3" onclick="obNext()">Continue →</button>
        </div>`;
}
window.obToggleStype = function(key) {
    const arr = window._obData.studyTypes;
    const idx = arr.indexOf(key);
    if(idx === -1) arr.push(key); else arr.splice(idx,1);
    obRender();
};

// ---- STEP 4: Leaderboard ----
function obStep4() {
    const d = window._obData;
    return `
        <div class="ob-title">Global Leaderboard</div>
        <div class="ob-sub">Compete with all Astraea users globally — JEE, NEET, UPSC, everyone's on the same board.</div>
        <div class="ob-lb-toggle${d.leaderboard?' selected':''}" onclick="obToggleLb()">
            <div class="ob-lb-icon">🏆</div>
            <div class="ob-lb-text">
                <h4>${d.leaderboard ? '✅ Yes, share my progress' : 'No, keep it private'}</h4>
                <p>Your focus time, streak & stamina will be visible to other users. Your data is always yours.</p>
            </div>
        </div>
        <div class="ob-lb-toggle${!d.leaderboard?' selected':''}" onclick="obToggleLb()">
            <div class="ob-lb-icon">🔒</div>
            <div class="ob-lb-text">
                <h4>${!d.leaderboard ? '✅ Stay private' : 'Private mode'}</h4>
                <p>You can still see the leaderboard but your data won't appear for others.</p>
            </div>
        </div>
        <div class="ob-actions">
            <button class="ob-btn-back" onclick="obBack()">← Back</button>
            <button class="ob-btn-next" onclick="obNext()">Continue →</button>
        </div>`;
}
window.obToggleLb = function() {
    window._obData.leaderboard = !window._obData.leaderboard;
    obRender();
};

// ---- STEP 5: Finalize / Review ----
function obStep5() {
    const d = window._obData;
    const exam = OB_EXAMS.find(e=>e.key===d.exam) || {icon:'✨',name:d.customExamName||'Custom'};
    const activeSubjs = d.subjects.filter(s=>s.selected);
    const totalChaps = activeSubjs.reduce((n,s)=>{
        return n + (d.chapters[s.key]||[]).length;
    },0);
    const stypes = d.studyTypes.map(k=>OB_ALL_STUDY_TYPES.find(t=>t.key===k)?.label||k).join(', ');
    return `
        <div class="ob-title">Your Astraea OS is Ready 🚀</div>
        <div class="ob-sub">Review your configuration before we launch.</div>
        <div class="ob-final-card">
            <div class="ob-final-card-label">🎯 Exam</div>
            <div class="ob-final-card-value">${exam.icon} ${d.exam==='custom'?(d.customExamName||'Custom'):exam.name}</div>
        </div>
        <div class="ob-final-card">
            <div class="ob-final-card-label">📚 Subjects</div>
            <div class="ob-final-card-value">${activeSubjs.map(s=>`<span style="color:${s.color};margin-right:8px;">● ${s.label}</span>`).join('')}</div>
        </div>
        <div class="ob-final-card">
            <div class="ob-final-card-label">📖 Chapters loaded</div>
            <div class="ob-final-card-value">${totalChaps > 0 ? totalChaps + ' chapters across ' + activeSubjs.length + ' subjects' : 'None pasted — you can add them later'}</div>
        </div>
        ${stypes ? `<div class="ob-final-card">
            <div class="ob-final-card-label">🛠 Study types</div>
            <div class="ob-final-card-value" style="font-size:0.8rem;">${stypes}</div>
        </div>` : ''}
        <div class="ob-final-card">
            <div class="ob-final-card-label">🏆 Leaderboard</div>
            <div class="ob-final-card-value">${d.leaderboard ? '✅ Public' : '🔒 Private'}</div>
        </div>
        <div class="ob-actions">
            <button class="ob-btn-back" onclick="obBack()">← Back</button>
            <button class="ob-btn-next" id="ob-launch-btn" onclick="obLaunch()">🚀 Launch Astraea OS</button>
        </div>`;
}

function obBindStep(step) {
    // nothing extra needed currently — all via onclick
}

window.obNext = function() {
    const d = window._obData;
    if(d.step === 0 && d.exam === 'custom') {
        const inp = document.getElementById('ob-custom-exam-name');
        d.customExamName = (inp?.value||'').trim() || 'My Exam';
        d.examLabel = d.customExamName;
    }
    if(d.step === 2) {
        // save all textareas
        d.subjects.filter(s=>s.selected).forEach(s=>{
            const ta = document.getElementById('ob-chap-'+s.key);
            if(ta) d.chapters[s.key] = ta.value.split(',').map(c=>c.trim()).filter(Boolean);
        });
    }
    // auto-select common study types if none chosen and moving past step 3
    if(d.step === 3 && d.studyTypes.length === 0) {
        d.studyTypes = ['lecture','dpp','module','revision','test','wrongQ'];
    }
    d.step = Math.min(d.step + 1, OB_TOTAL - 1);
    obRender();
};
window.obBack = function() {
    window._obData.step = Math.max(0, window._obData.step - 1);
    obRender();
};

window.obLaunch = async function() {
    const btn = document.getElementById('ob-launch-btn');
    if(btn) { btn.disabled = true; btn.textContent = '⏳ Setting up...'; }
    const d = window._obData;
    const uid = window._fbUid, db = window._fbDb, fns = window._fbFns;
    const activeSubjs = d.subjects.filter(s=>s.selected);
    const studyTypes = d.studyTypes.length > 0 ? d.studyTypes : ['lecture','dpp','module','revision','test','wrongQ'];

    // Build onboarding identity payload
    const obIdentity = {
        exam: d.exam,
        examLabel: d.exam === 'custom' ? (d.customExamName||'Custom') : (OB_EXAMS.find(e=>e.key===d.exam)?.name || d.exam),
        subjects: activeSubjs,
        studyTypes: studyTypes,
        leaderboard: d.leaderboard,
        onboardingComplete: true,
        onboardedAt: new Date().toISOString()
    };

    // Build chapters data — each chapter gets flags for selected study types
    const emptyTask = {};
    studyTypes.forEach(k => { emptyTask[k] = false; });
    emptyTask.done = false; emptyTask.custom = false;

    const chapDb = {};
    activeSubjs.forEach(s => {
        chapDb[s.key] = {};
        (d.chapters[s.key]||[]).forEach(name => {
            chapDb[s.key][name] = Object.assign({}, emptyTask);
        });
    });

    // Save to Firestore users2
    if(uid && db && fns) {
        try {
            await fns.setDoc(fns.doc(db, 'users2', uid, 'appdata', 'main'), {
                identity: {
                    callsign: userContext.username,
                    avatar: userContext.avatarUrl,
                    email: userContext.email,
                    onboarding: obIdentity
                },
                chapters: chapDb,
                updatedAt: Date.now()
            }, { merge: true });
        } catch(e) { console.warn('Onboarding save error:', e); }
    }

    // Apply to app state immediately
    window._obIdentity = obIdentity;

    // Set ch_TASKS from study types
    const ALL_ST = [{key:'lecture',label:'Lecture',icon:'🎬'},{key:'dpp',label:'DPP',icon:'📝'},{key:'module',label:'Module',icon:'📚'},{key:'wrongQ',label:'Wrong Q',icon:'❌'},{key:'revision',label:'Revision',icon:'🔁'},{key:'test',label:'Test Done',icon:'✅'},{key:'ncert',label:'NCERT',icon:'📗'},{key:'pyq',label:'PYQ',icon:'🗂️'},{key:'flash',label:'Flashcards',icon:'⚡'},{key:'writing',label:'Writing',icon:'✍️'},{key:'map',label:'Map',icon:'🗺️'},{key:'current',label:'Curr. Affairs',icon:'📰'}];
    window.ch_TASKS = studyTypes.map(k => ALL_ST.find(t=>t.key===k)||{key:k,label:k,icon:'📌'});

    // Populate ch_SUBJECTS and ch_db
    activeSubjs.forEach(s => {
        const chapNames = Object.keys(chapDb[s.key]||{});
        window.ch_SUBJECTS[s.key] = { label: s.label, color: s.color, chapters: chapNames };
        window.ch_db[s.key] = chapDb[s.key] || {};
    });
    if(activeSubjs.length > 0) window.ch_activeSub = activeSubjs[0].key;

    // Update leaderboard preference
    if(!d.leaderboard) {
        if(!state.settings) state.settings = {};
        state.settings.leaderboardPrivate = true;
    }

    obAdaptUI(obIdentity);
    window.populateAllSubjectDropdowns && window.populateAllSubjectDropdowns();
    window.obHide();

    // Boot the main system now
    if(!window._hasBooted) {
        window._hasBooted = true;
        window.bootSystem();
    } else {
        window.ch_render && window.ch_render();
        setTimeout(function(){ window.populateAllSubjectDropdowns && window.populateAllSubjectDropdowns(); }, 200);
    }
};

window.obAdaptUI = function(ob) {
    if(!ob) return;
    // Update the JEE countdown card label
    const jeeCard = document.querySelector('#home .card [style*="JEE Main 2028"]');
    if(jeeCard && ob.examLabel && ob.exam !== 'jee') {
        jeeCard.textContent = `🚀 ${ob.examLabel} Countdown`;
    }
    // Update countdown function label
    window._examLabel = ob.examLabel || 'Your Exam';
    window._examKey = ob.exam;
};

// Load onboarding data from Firestore and apply
window.obApplyFromFirestore = async function(uid, db, fns) {
    const snap = await _getDocFresh(fns, fns.doc(db, 'users2', uid, 'appdata', 'main'));
    if(!snap.exists()) {
        return null; // 🆕 Truly new user — no doc at all
    }
    const p = snap.data();
    // Load chapters if present
    if(p.chapters) window._loadedChaptersFromFS = p.chapters;
    // Load identity/onboarding
    const ob = p.identity && p.identity.onboarding;
    if(ob) {
        window._obIdentity = ob;
        window.obAdaptUI && window.obAdaptUI(ob);
        // Rebuild ch_SUBJECTS from onboarding subjects + saved chapter names
        if(ob.subjects) {
            ob.subjects.forEach(s => {
                const chapterNames = p.chapters && p.chapters[s.key]
                    ? Object.keys(p.chapters[s.key])
                    : [];
                window.ch_SUBJECTS[s.key] = { label: s.label, color: s.color, chapters: chapterNames };
            });
            // Set first subject as active
            if(ob.subjects.length > 0 && !window.ch_activeSub) {
                window.ch_activeSub = ob.subjects[0].key;
            }
        }
        // Apply study types to ch_TASKS
        if(ob.studyTypes && ob.studyTypes.length > 0) {
            const ALL_ST = [{key:'lecture',label:'Lecture',icon:'🎬'},{key:'dpp',label:'DPP',icon:'📝'},{key:'module',label:'Module',icon:'📚'},{key:'wrongQ',label:'Wrong Q',icon:'❌'},{key:'revision',label:'Revision',icon:'🔁'},{key:'test',label:'Test Done',icon:'✅'},{key:'ncert',label:'NCERT',icon:'📗'},{key:'pyq',label:'PYQ',icon:'🗂️'},{key:'flash',label:'Flashcards',icon:'⚡'},{key:'writing',label:'Writing',icon:'✍️'},{key:'map',label:'Map',icon:'🗺️'},{key:'current',label:'Curr. Affairs',icon:'📰'}];
            window.ch_TASKS = ob.studyTypes.map(k => ALL_ST.find(t=>t.key===k)||{key:k,label:k,icon:'📌'});
        }
    }
    // true = completed onboarding, false = existing user without onboarding
    const completed = !!(p.identity && p.identity.onboarding && p.identity.onboarding.onboardingComplete);
    // Populate subject dropdowns now that ch_SUBJECTS is built
    setTimeout(function(){ window.populateAllSubjectDropdowns && window.populateAllSubjectDropdowns(); }, 100);
    return completed ? true : false;
};



// ---- [2] Trial Mode ----

// ── TRIAL MODE ────────────────────────────────────────────────────────────
(function(){
  var isTrial = sessionStorage.getItem('astraea_trial')==='1' || new URLSearchParams(location.search).get('trial')==='1';
  if(!isTrial) return;
  sessionStorage.setItem('astraea_trial','1');
  var expires = parseInt(sessionStorage.getItem('astraea_trial_expires'))||0;
  if(!expires){ expires = Date.now()+61000; sessionStorage.setItem('astraea_trial_expires',expires); }
  var banner = document.getElementById('trial-banner');
  var expiredEl = document.getElementById('trial-expired');
  if(banner){ banner.style.display='flex'; document.body.style.paddingTop='44px'; }
  // Block Firebase saves in trial mode — override triggerSave
  window._trialMode = true;
  var _origTriggerSave = window.triggerSave;
  Object.defineProperty(window,'triggerSave',{get:function(){return window._trialMode ? function(){} : _origTriggerSave;},set:function(v){_origTriggerSave=v;}});
  function tick(){
    var left = Math.max(0, Math.ceil((expires - Date.now())/1000));
    var m = Math.floor(left/60), s = left%60;
    var txt = m+':'+(s<10?'0':'')+s;
    var el = document.getElementById('trial-banner-time');
    if(el) el.textContent = txt;
    if(left<=0){
      if(expiredEl){ expiredEl.style.display='flex'; }
      clearInterval(trialInterval);
    }
  }
  tick();
  var trialInterval = setInterval(tick,1000);
})();


// ---- [3] Calendar Filter + Circular Fix ----

/* ═══════════════════════════════════════════
   ASTRAEA V3 — Calendar Filter + Circular Fix
═══════════════════════════════════════════ */

// ── CALENDAR FILTER — visual only, no re-render ──
window._calActiveFilter = 'all';
window.calFilterType = function(type, btn) {
    window._calActiveFilter = type;
    document.querySelectorAll('.cal-filter-chip').forEach(c => c.classList.remove('active'));
    if(btn) btn.classList.add('active');
    // Apply filter visually without re-rendering
    document.querySelectorAll('.cal-event-block').forEach(el => {
        if(type === 'all') { el.style.opacity = ''; el.style.pointerEvents = ''; return; }
        const tags = (el.dataset.type || '').toLowerCase();
        const title = (el.querySelector('.cal-event-title')?.textContent || '').toLowerCase();
        const matches = tags.includes(type) || title.includes(type);
        el.style.opacity = matches ? '' : '0.08';
        el.style.pointerEvents = matches ? '' : 'none';
    });
    document.querySelectorAll('.month-chip').forEach(el => {
        if(type === 'all') { el.style.opacity = ''; return; }
        const text = (el.textContent || '').toLowerCase();
        el.style.opacity = text.includes(type) ? '' : '0.1';
    });
};

// ── TIMESTAMP FIX — ensure cal-time-label shows full HH:MM ──
(function patchCalTimeLabels() {
    var _observerBusy = false;
    function fixLabels() {
        if (_observerBusy) return;
        _observerBusy = true;
        observer.disconnect(); // Stop observing before DOM changes to prevent infinite loop
        document.querySelectorAll('.cal-time-label').forEach(el => {
            // Use textContent to avoid triggering MutationObserver via innerHTML
            var raw = el.textContent || '';
            var cleaned = raw.replace(/:/g, ':').replace(/\s+/g, ' ').trim();
            if (el.textContent !== cleaned) el.textContent = cleaned;
            el.style.whiteSpace = 'nowrap';
        });
        // Re-attach observer after changes are done
        const calGrid = document.getElementById('cal-grid');
        if (calGrid) observer.observe(calGrid, { childList: true, subtree: false });
        _observerBusy = false;
    }
    const calGrid = document.getElementById('cal-grid');
    const observer = new MutationObserver(fixLabels);
    if(calGrid) observer.observe(calGrid, { childList: true, subtree: false });
    setTimeout(fixLabels, 800);
    setTimeout(fixLabels, 2000);
})();

// ── CIRCULAR FOCUS: sync eye icon visibility ──
document.addEventListener('DOMContentLoaded', function() {
    // Restore saved display mode
    const saved = localStorage.getItem('focusDisplayMode');
    if(saved === 'circular') {
        setTimeout(() => {
            if(typeof window.setFocusDisplayMode === 'function') {
                window.setFocusDisplayMode('circular');
            }
        }, 600);
    }

    // Patch _updateCircularDisplay to use new circumference
    const origUpdate = window._updateCircularDisplay;
    if(typeof origUpdate === 'function') {
        window._updateCircularDisplay = function() {
            origUpdate();
            // Override dasharray with new radius
            const ring = document.getElementById('cf-progress-ring');
            if(ring) {
                const r = 112;
                const circum = 2 * Math.PI * r;
                const m = (window.state && window.state.focus) ? window.state.focus.mode : 'work';
                const totalSecs = (() => {
                    if(!window.state || !window.state.focus) return 25*60;
                    const s = m === 'work' ? window.state.focus.workM : m === 'longbreak' ? (window.state.focus.longBreakM||15) : window.state.focus.breakM;
                    return (s||25)*60;
                })();
                const remaining = (window.state && window.state.focus) ? window.state.focus.time : totalSecs;
                const pct = totalSecs > 0 ? remaining / totalSecs : 1;
                ring.style.strokeDasharray = circum;
                ring.style.strokeDashoffset = circum * (1 - pct);
                // Amber/orange/blue by mode
                const modeColors = {
                    work: 'url(#cfGrad)',
                    break: '#38bdf8',
                    longbreak: '#f59e0b'
                };
                ring.style.stroke = modeColors[m] || 'url(#cfGrad)';
            }
        };
    }
});

// ── Calendar filter bar: hide in month view ──
(function() {
    function updateFilterBar() {
        const bar = document.getElementById('cal-filter-bar');
        if(!bar) return;
        const weekContainer = document.getElementById('view-week-container');
        const monthContainer = document.getElementById('view-month-container');
        if(monthContainer && monthContainer.style.display !== 'none') {
            bar.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        }
    }
    // Patch setCalMode
    const origSetCalMode = window.setCalMode;
    if(typeof origSetCalMode === 'function') {
        window.setCalMode = function(mode) {
            origSetCalMode(mode);
            updateFilterBar();
        };
    }
})();


// ---- [4] New Features Bundle ----

/* =============================================================
   ASTRAEA — NEW FEATURES BUNDLE
   1. Phase Checkpoints
   2. Bulk Subtopics
   3. Diary Reminder
   4. Doubt 7-Day Reminders
   5. Timeskip
============================================================= */

// ══════════════════════════════
// HELPERS
// ══════════════════════════════
function _fmtDuration(ms) {
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60), rm = m % 60;
    return h > 0 ? `${h}h ${rm}m` : `${rm}m`;
}
function _fmtDate(ts) {
    return new Date(ts).toLocaleDateString([], {day:'numeric',month:'short',year:'numeric'});
}
function _fmtDateShort(ts) {
    return new Date(ts).toLocaleDateString([], {day:'numeric',month:'short'});
}
function _fmtDateTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString([],{day:'numeric',month:'short'}) + ' ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}
function _getPhases() {
    if(!state) return [];
    if(!state.phases) state.phases = [];
    return state.phases;
}
function _getTimeskips() {
    if(!state) return [];
    if(!state.timeskips) state.timeskips = [];
    return state.timeskips;
}

// ══════════════════════════════════════════════
// FEATURE 1: PHASE CHECKPOINTS
// ══════════════════════════════════════════════
window.openPhaseModal = function() {
    window.renderPhaseCards();
    // Prefill end with now, start with 7 days ago
    const now = new Date();
    const week = new Date(now); week.setDate(now.getDate()-7);
    const toLocal = d => {
        const pad = n => String(n).padStart(2,'0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const si = document.getElementById('phase-start-input');
    const ei = document.getElementById('phase-end-input');
    if(si && !si.value) si.value = toLocal(week);
    if(ei && !ei.value) ei.value = toLocal(now);
    document.getElementById('phase-modal-backdrop').style.display = 'flex';
};
window.closePhaseModal = function() {
    document.getElementById('phase-modal-backdrop').style.display = 'none';
};
window.addPhase = function() {
    const name = (document.getElementById('phase-name-input').value||'').trim();
    const start = document.getElementById('phase-start-input').value;
    const end = document.getElementById('phase-end-input').value;
    if(!name || !start || !end) { alert('Please fill phase name, start, and end.'); return; }
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if(endMs <= startMs) { alert('End must be after start.'); return; }
    const phases = _getPhases();
    phases.push({ id: Date.now(), name, startMs, endMs });
    triggerSave();
    document.getElementById('phase-name-input').value = '';
    window.renderPhaseCards();
};
window.deletePhase = function(id) {
    if(!confirm('Delete this phase?')) return;
    state.phases = (state.phases||[]).filter(p => p.id !== id);
    triggerSave();
    window.renderPhaseCards();
};
window.renderPhaseCards = function() {
    const list = document.getElementById('phase-cards-list');
    if(!list) return;
    const phases = _getPhases();
    if(!phases.length) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:24px;font-size:0.82rem;">No phases yet. Add one above.</div>`;
        return;
    }
    list.innerHTML = phases.slice().reverse().map(p => {
        const dur = p.endMs - p.startMs;
        const days = Math.round(dur / 86400000);
        return `<div class="card" style="padding:16px 18px;border-left:3px solid var(--accent2);cursor:pointer;transition:0.2s;" onclick="window.openPhaseDetail(${p.id})">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="flex:1;">
                    <div style="font-weight:800;font-size:0.9rem;margin-bottom:3px;">${p.name}</div>
                    <div style="font-size:0.68rem;color:var(--text-dim);">${_fmtDate(p.startMs)} &rarr; ${_fmtDate(p.endMs)} &nbsp;·&nbsp; ${days} days</div>
                </div>
                <span style="font-size:0.62rem;padding:4px 10px;border-radius:99px;background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.25);color:#a78bfa;font-weight:700;">View</span>
                <button onclick="event.stopPropagation();window.deletePhase(${p.id})" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--danger);border-radius:8px;padding:5px 9px;cursor:pointer;font-size:0.75rem;"><i class="ph ph-trash"></i></button>
            </div>
        </div>`;
    }).join('');
};
window.openPhaseDetail = function(id) {
    const phases = _getPhases();
    const phase = phases.find(p => p.id === id);
    if(!phase) return;
    // Get all activity logs in range
    const logs = (state && state.sw && state.sw.logs || [])
        .filter(l => l.stamp >= phase.startMs && l.stamp <= phase.endMs);
    // Get focus logs in range
    const fLogs = (state && state.focus && state.focus.logs || [])
        .filter(l => l.stamp >= phase.startMs && l.stamp <= phase.endMs);
    // Category breakdown
    const cats = {productive:0, unproductive:0, sleep:0, health:0, coding:0};
    let totalMs = 0;
    logs.forEach(l => {
        const ms = (l.duration||0);
        if(cats[l.type] !== undefined) cats[l.type] += ms;
        totalMs += ms;
    });
    const focusMs = fLogs.reduce((s, l) => s + (l.duration||0) * 60000, 0);
    const days = Math.round((phase.endMs - phase.startMs) / 86400000);
    // Render
    document.getElementById('phase-detail-title').textContent = phase.name;
    document.getElementById('phase-detail-dates').textContent = `${_fmtDate(phase.startMs)} → ${_fmtDate(phase.endMs)} · ${days} days`;
    document.getElementById('phase-detail-stats').innerHTML = `
        <div style="background:rgba(79,110,247,0.08);border:1px solid rgba(79,110,247,0.2);border-radius:14px;padding:12px;text-align:center;">
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:var(--accent);font-weight:800;">${logs.length}</div>
            <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-top:3px;">Activity Logs</div>
        </div>
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:14px;padding:12px;text-align:center;">
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:var(--prod);font-weight:800;">${_fmtDuration(totalMs)}</div>
            <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-top:3px;">Total Logged</div>
        </div>
        <div style="background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:14px;padding:12px;text-align:center;">
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:#a78bfa;font-weight:800;">${_fmtDuration(focusMs)}</div>
            <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-top:3px;">Deep Focus</div>
        </div>
        <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:14px;padding:12px;text-align:center;">
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:var(--warn);font-weight:800;">${days}</div>
            <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-top:3px;">Days</div>
        </div>`;
    const catMeta = {
        productive:{label:'Productive',color:'var(--prod)'},
        unproductive:{label:'Unproductive',color:'var(--unprod)'},
        sleep:{label:'Sleep',color:'var(--sleep)'},
        health:{label:'Health',color:'var(--health)'},
        coding:{label:'Coding',color:'#818cf8'}
    };
    document.getElementById('phase-detail-cats').innerHTML = Object.entries(catMeta).map(([k, m]) =>
        `<div style="background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center;border-bottom:2px solid ${m.color};">
            <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">${m.label}</div>
            <div style="font-family:var(--font-mono);font-size:1rem;font-weight:800;color:${m.color};">${_fmtDuration(cats[k])}</div>
        </div>`
    ).join('');
    // Logs list
    const sortedLogs = logs.slice().sort((a,b) => b.stamp - a.stamp);
    document.getElementById('phase-detail-logs').innerHTML = sortedLogs.length ? sortedLogs.map(l => {
        const cm = {productive:{emoji:'📗',color:'var(--prod)'},unproductive:{emoji:'📕',color:'var(--unprod)'},sleep:{emoji:'💤',color:'var(--sleep)'},health:{emoji:'💚',color:'var(--health)'}};
        const c = cm[l.type] || {emoji:'⬜',color:'var(--text-dim)'};
        return `<div style="padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.1rem;">${c.emoji}</span>
            <div style="flex:1;">
                <div style="font-size:0.82rem;font-weight:700;">${l.desc||'Activity'}</div>
                <div style="font-size:0.65rem;color:var(--text-dim);">${_fmtDateTime(l.stamp)}</div>
            </div>
            <div style="font-family:var(--font-mono);font-size:0.8rem;font-weight:700;color:${c.color};">${_fmtDuration(l.duration||0)}</div>
        </div>`;
    }).join('') : `<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:0.82rem;">No activity logs in this phase.</div>`;
    document.getElementById('phase-detail-backdrop').style.display = 'flex';
    document.getElementById('phase-modal-backdrop').style.display = 'none';
};

// ══════════════════════════════════════════════
// FEATURE 2: BULK SUBTOPICS
// ══════════════════════════════════════════════
window._bulkSubtopicChapterId = null;
window.ch_openBulkSubtopic = function() {
    const sel = document.getElementById('ch-bulk-target');
    if(!sel || !sel.value) { alert('Please select a chapter first.'); return; }
    const [sub, idx] = sel.value.split('::');
    const chapIdx = parseInt(idx);
    if(isNaN(chapIdx)) return;
    const subj = window.ch_SUBJECTS && window.ch_SUBJECTS[sub];
    if(!subj) return;
    const chap = subj.chapters && subj.chapters[chapIdx];
    if(!chap) return;
    window._bulkSubtopicChapterId = {sub, idx:chapIdx};
    document.getElementById('bulk-subtopic-chapter-label').textContent = `Adding to: ${typeof chap === 'string' ? chap : chap.name}`;
    document.getElementById('bulk-subtopic-input').value = '';
    document.getElementById('bulk-subtopic-modal').style.display = 'flex';
};
window.ch_closeBulkSubtopic = function() {
    document.getElementById('bulk-subtopic-modal').style.display = 'none';
};
window.ch_doBulkSubtopic = function() {
    const raw = (document.getElementById('bulk-subtopic-input').value||'').trim();
    if(!raw) { alert('Please enter subtopics.'); return; }
    const ref = window._bulkSubtopicChapterId;
    if(!ref) return;
    const subj = window.ch_SUBJECTS && window.ch_SUBJECTS[ref.sub];
    if(!subj || !subj.chapters) return;
    const chapRef = subj.chapters[ref.idx];
    // Normalize chapter to object form if it's a string
    if(typeof chapRef === 'string') {
        subj.chapters[ref.idx] = { name: chapRef, done: false, subtopics: [] };
    }
    const chap = subj.chapters[ref.idx];
    if(!chap.subtopics) chap.subtopics = [];
    // Check for commas
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if(parts.length > 1) {
        // Multiple: add each as separate subtopic
        parts.forEach(p => { chap.subtopics.push({ name: p, done: false }); });
    } else {
        // No comma: add as one subtopic
        chap.subtopics.push({ name: raw, done: false });
    }
    triggerSave();
    if(window.ch_renderChapters) window.ch_renderChapters();
    window.ch_closeBulkSubtopic();
    // Toast
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(124,58,237,0.92);color:#fff;padding:10px 24px;border-radius:99px;font-weight:700;font-size:0.82rem;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.25);letter-spacing:0.06em;';
    t.textContent = `✅ ${parts.length > 1 ? parts.length + ' subtopics' : '1 subtopic'} added!`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
};
// Populate chapter select in bulk panel when chapters tab opens
function _refreshBulkChapterSelect() {
    const sel = document.getElementById('ch-bulk-target');
    if(!sel || !window.ch_SUBJECTS) return;
    sel.innerHTML = '<option value="">Select a chapter...</option>';
    Object.entries(window.ch_SUBJECTS).forEach(([sub, subj]) => {
        if(!subj || !subj.chapters) return;
        subj.chapters.forEach((chap, idx) => {
            const name = typeof chap === 'string' ? chap : (chap && chap.name) || 'Chapter';
            const opt = document.createElement('option');
            opt.value = `${sub}::${idx}`;
            opt.textContent = `${subj.label||sub}: ${name}`;
            sel.appendChild(opt);
        });
    });
}
// Hook into nav click to refresh
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if(link.dataset.tab === 'chapters') {
                setTimeout(_refreshBulkChapterSelect, 300);
            }
        });
    });
    setTimeout(_refreshBulkChapterSelect, 1500);
});

// ══════════════════════════════════════════════
// FEATURE 3 & 4: REMINDERS (Diary + Doubt)
// ══════════════════════════════════════════════
window._reminderQueue = [];
window._reminderActive = null;
window.saveReminderSettings = function() {
    if(!state) return;
    if(!state.settings) state.settings = {};
    state.settings.diaryReminder = document.getElementById('setting-diary-reminder')?.checked || false;
    state.settings.doubtReminder = document.getElementById('setting-doubt-reminder')?.checked || false;
    triggerSave();
};
function _loadReminderSettings() {
    const s = (state && state.settings) || {};
    const dr = document.getElementById('setting-diary-reminder');
    const qr = document.getElementById('setting-doubt-reminder');
    if(dr) dr.checked = s.diaryReminder !== false;
    if(qr) qr.checked = s.doubtReminder !== false;
}
function _showReminderPopup(icon, title, body, actions) {
    document.getElementById('reminder-icon').textContent = icon;
    document.getElementById('reminder-title').textContent = title;
    document.getElementById('reminder-body').textContent = body;
    const actEl = document.getElementById('reminder-actions');
    actEl.innerHTML = '';
    actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.style.cssText = `font-size:0.72rem;padding:6px 14px;border-radius:99px;${a.style||''}`;
        btn.textContent = a.label;
        btn.onclick = () => { if(a.action) a.action(); window.dismissReminder(); };
        actEl.appendChild(btn);
    });
    const popup = document.getElementById('reminder-popup');
    popup.style.display = 'block';
    window._reminderActive = setTimeout(() => { popup.style.display = 'none'; }, 30000);
}
window.dismissReminder = function() {
    document.getElementById('reminder-popup').style.display = 'none';
    if(window._reminderActive) { clearTimeout(window._reminderActive); window._reminderActive = null; }
    if(window._reminderQueue.length) {
        const next = window._reminderQueue.shift();
        setTimeout(() => _showReminderPopup(next.icon, next.title, next.body, next.actions), 800);
    }
};
function _checkReminders() {
    const s = (state && state.settings) || {};
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    // 1. Diary reminder (after 8 PM if no entry today)
    if(s.diaryReminder !== false) {
        const lastDiaryReminder = localStorage.getItem('astraea_last_diary_reminder');
        if(lastDiaryReminder !== todayStr && now.getHours() >= 20) {
            const entries = (state && state.diary) || [];
            const hasToday = entries.some(e => e.date === todayStr);
            if(!hasToday) {
                localStorage.setItem('astraea_last_diary_reminder', todayStr);
                window._reminderQueue.push({
                    icon: '📓',
                    title: 'Daily Diary Reminder',
                    body: "You haven't written today's diary entry yet. Reflect on your day!",
                    actions: [
                        { label: '📓 Open Diary', style:'background:rgba(244,114,182,0.15);border-color:rgba(244,114,182,0.4);color:var(--health);', action: () => document.querySelector('.nav-link[data-tab=diary]')?.click() },
                        { label: 'Snooze 1h', action: () => setTimeout(() => { localStorage.removeItem('astraea_last_diary_reminder'); _checkReminders(); }, 3600000) }
                    ]
                });
            }
        }
    }
    // 2. Doubt 7-day reminders
    if(s.doubtReminder !== false) {
        const doubts = (state && state.doubts) || [];
        const oldPending = doubts.filter(d => {
            if(d.cleared) return false;
            const dDate = new Date(d.date);
            const diffDays = (now - dDate) / 86400000;
            return diffDays >= 7;
        });
        if(oldPending.length) {
            const lastDoubtReminder = localStorage.getItem('astraea_last_doubt_reminder');
            if(lastDoubtReminder !== todayStr) {
                localStorage.setItem('astraea_last_doubt_reminder', todayStr);
                window._reminderQueue.push({
                    icon: '❓',
                    title: `${oldPending.length} Doubt${oldPending.length>1?'s':''} Need Attention`,
                    body: `"${oldPending[0].text.slice(0,60)}${oldPending[0].text.length>60?'…':''}" and ${oldPending.length-1} more have been pending for 7+ days.`,
                    actions: [
                        { label: '🔍 Review Doubts', style:'background:rgba(124,58,237,0.15);border-color:rgba(124,58,237,0.4);color:#a78bfa;', action: () => document.querySelector('.nav-link[data-tab=doubts]')?.click() },
                        { label: 'Snooze', action: () => {} },
                        { label: '⏹ Stop', action: () => { localStorage.setItem('astraea_last_doubt_reminder', todayStr); } }
                    ]
                });
            }
        }
    }
    // Show first in queue
    if(window._reminderQueue.length && document.getElementById('reminder-popup').style.display === 'none') {
        const r = window._reminderQueue.shift();
        _showReminderPopup(r.icon, r.title, r.body, r.actions);
    }
}
// Run reminder check every 10 minutes after page load
setTimeout(function startReminderLoop() {
    _loadReminderSettings();
    _checkReminders();
    setInterval(_checkReminders, 600000);
}, 5000);

// ══════════════════════════════════════════════
// FEATURE 5: TIMESKIP BUTTON ON HOME + LOGIC
// ══════════════════════════════════════════════
window._timeskipActive = false;
window.openTimeskipModal = function() {
    window._refreshTimeskipModal();
    document.getElementById('timeskip-modal').style.display = 'flex';
};
window._refreshTimeskipModal = function() {
    const ts = state && state.activeTimeskip;
    const cards = document.getElementById('timeskip-cards-list');
    // Show/hide panels
    if(ts) {
        window._timeskipActive = true;
        document.getElementById('timeskip-start-panel').style.display = 'none';
        document.getElementById('timeskip-end-panel').style.display = '';
        document.getElementById('timeskip-active-banner').style.display = '';
        document.getElementById('timeskip-active-since').textContent = `Started: ${_fmtDateTime(ts.startMs)} · Reason: ${ts.reason||'Not specified'}`;
    } else {
        window._timeskipActive = false;
        document.getElementById('timeskip-start-panel').style.display = '';
        document.getElementById('timeskip-end-panel').style.display = 'none';
        document.getElementById('timeskip-active-banner').style.display = 'none';
    }
    // Past timeskip cards
    const timeskips = _getTimeskips();
    if(!cards) return;
    if(!timeskips.length && !ts) { cards.innerHTML = ''; return; }
    cards.innerHTML = `<div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-dim);margin-bottom:8px;">Past Timeskips</div>` +
        timeskips.slice().reverse().map(sk => {
            const dur = sk.endMs - sk.startMs;
            const days = Math.ceil(dur / 86400000);
            return `<div class="card" style="padding:14px 16px;border-left:3px solid var(--warn);cursor:pointer;" onclick="window.viewTimeskipDetail(${sk.id})">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:1.2rem;">&#9197;</span>
                    <div style="flex:1;">
                        <div style="font-weight:700;font-size:0.85rem;">${sk.reason||'Timeskip'}</div>
                        <div style="font-size:0.65rem;color:var(--text-dim);">${_fmtDate(sk.startMs)} &rarr; ${_fmtDate(sk.endMs)} · ${days}d · Study: ${sk.studyHrs||0}h</div>
                    </div>
                    <span style="font-size:0.6rem;padding:4px 10px;border-radius:99px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);color:var(--warn);font-weight:700;">View</span>
                </div>
            </div>`;
        }).join('');
};
window.startTimeskip = function() {
    const reason = (document.getElementById('timeskip-reason').value||'').trim();
    if(!state) return;
    state.activeTimeskip = { startMs: Date.now(), reason };
    // Pause streak accumulation flag
    state.timeskipPaused = true;
    triggerSave();
    // Update home button
    const btn = document.getElementById('timeskip-home-btn');
    if(btn) { btn.style.borderColor = 'rgba(251,191,36,0.7)'; btn.style.background = 'rgba(251,191,36,0.1)'; }
    window._refreshTimeskipModal();
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(245,158,11,0.92);color:#000;padding:10px 24px;border-radius:99px;font-weight:700;font-size:0.82rem;z-index:99999;';
    t.textContent = '⏸ Timeskip started — progress paused';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
};
window.endTimeskip = function() {
    if(!state || !state.activeTimeskip) return;
    const ts = state.activeTimeskip;
    const notes = (document.getElementById('timeskip-return-notes')?.value||'').trim();
    const studyHrs = parseFloat(document.getElementById('timeskip-study-hrs')?.value) || 0;
    const chapCount = parseInt(document.getElementById('timeskip-chapters')?.value) || 0;
    const record = {
        id: Date.now(),
        startMs: ts.startMs,
        endMs: Date.now(),
        reason: ts.reason,
        notes,
        studyHrs,
        chapCount
    };
    if(!state.timeskips) state.timeskips = [];
    state.timeskips.push(record);
    // Log as a retro activity if study hours > 0
    if(studyHrs > 0 && state.sw) {
        if(!state.sw.logs) state.sw.logs = [];
        state.sw.logs.push({
            desc: `Timeskip: ${ts.reason||'Break'} — ${notes||'Offline work'}`,
            type: 'productive',
            duration: studyHrs * 3600000,
            stamp: ts.startMs,
            retro: true
        });
    }
    delete state.activeTimeskip;
    state.timeskipPaused = false;
    triggerSave();
    // Reset form
    if(document.getElementById('timeskip-return-notes')) document.getElementById('timeskip-return-notes').value = '';
    if(document.getElementById('timeskip-study-hrs')) document.getElementById('timeskip-study-hrs').value = '';
    if(document.getElementById('timeskip-chapters')) document.getElementById('timeskip-chapters').value = '';
    window._refreshTimeskipModal();
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(16,185,129,0.92);color:#fff;padding:10px 24px;border-radius:99px;font-weight:700;font-size:0.82rem;z-index:99999;';
    t.textContent = '▶ Timeskip ended — progress resumed!';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
};
window.viewTimeskipDetail = function(id) {
    const sk = _getTimeskips().find(s => s.id === id);
    if(!sk) return;
    const dur = sk.endMs - sk.startMs;
    const days = Math.ceil(dur / 86400000);
    // Show detail inside timeskip modal — overlay the cards list
    const cards = document.getElementById('timeskip-cards-list');
    if(!cards) return;
    cards.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(251,191,36,0.08),rgba(245,158,11,0.04));border:1px solid rgba(251,191,36,0.25);border-radius:16px;padding:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <div style="font-family:var(--font-display);font-size:1.1rem;letter-spacing:0.08em;color:var(--warn);">${sk.reason||'Timeskip'}</div>
                <button class="btn" onclick="window._refreshTimeskipModal()" style="font-size:0.65rem;padding:5px 12px;border-radius:99px;">← Back</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
                <div style="background:rgba(0,0,0,0.06);border-radius:10px;padding:12px;">
                    <div style="font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:4px;">From</div>
                    <div style="font-size:0.82rem;font-weight:700;">${_fmtDateTime(sk.startMs)}</div>
                </div>
                <div style="background:rgba(0,0,0,0.06);border-radius:10px;padding:12px;">
                    <div style="font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:4px;">To</div>
                    <div style="font-size:0.82rem;font-weight:700;">${_fmtDateTime(sk.endMs)}</div>
                </div>
                <div style="background:rgba(0,0,0,0.06);border-radius:10px;padding:12px;">
                    <div style="font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:4px;">Duration</div>
                    <div style="font-size:1.1rem;font-weight:800;color:var(--warn);">${days}d</div>
                </div>
                <div style="background:rgba(0,0,0,0.06);border-radius:10px;padding:12px;">
                    <div style="font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:4px;">Study Hours</div>
                    <div style="font-size:1.1rem;font-weight:800;color:var(--prod);">${sk.studyHrs||0}h</div>
                </div>
            </div>
            ${sk.chapCount ? `<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:10px;">📖 ${sk.chapCount} chapter${sk.chapCount!==1?'s':''} covered</div>` : ''}
            ${sk.notes ? `<div style="background:rgba(0,0,0,0.06);border-radius:10px;padding:12px;"><div style="font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:6px;">Notes</div><div style="font-size:0.8rem;line-height:1.55;white-space:pre-wrap;">${sk.notes}</div></div>` : ''}
        </div>`;
};
// Inject btn after state loads — retry loop for reliability
function _injectTimeskipBtnRetry(attempts) {
    attempts = attempts || 0;
    const quickRow = document.querySelector('#home .btn.home-quick-btn')?.closest('div');
    if(!quickRow) { if(attempts < 10) setTimeout(() => _injectTimeskipBtnRetry(attempts+1), 500); return; }
    if(document.getElementById('timeskip-home-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'timeskip-home-btn';
    btn.className = 'btn home-quick-btn';
    btn.style.cssText = 'border-color:rgba(251,191,36,0.4);';
    btn.innerHTML = '<i class="ph ph-fast-forward" style="font-size:1.2rem;color:var(--warn);"></i><span>Timeskip</span>';
    btn.onclick = window.openTimeskipModal;
    quickRow.appendChild(btn);
}
setTimeout(() => { _injectTimeskipBtnRetry(); _loadReminderSettings(); }, 1500);
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        if(link.dataset.tab === 'home') setTimeout(() => _injectTimeskipBtnRetry(), 200);
    });
});