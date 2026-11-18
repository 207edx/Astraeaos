/* AstraeaOS layout refresh. Loaded after the legacy app bundle intentionally. */
(function () {
  'use strict';

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const mainNavKeys = new Set(['home', 'log', 'focus']);
  let activityExpanded = false;
  const initialActivityCount = 12;

  function originalNavLink(tab) {
    return $('.astraea-shell > nav .nav-link[data-tab="' + tab + '"]');
  }

  function openTab(tab) {
    const link = originalNavLink(tab);
    if (link) link.click();
  }

  function initFocusWorkspace() {
    const main = $('.astraea-shell > main');
    if (!main || $('#focus-workspace-tabs')) return;

    const tabs = document.createElement('div');
    tabs.id = 'focus-workspace-tabs';
    tabs.className = 'focus-workspace-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Focus workspace');
    const definitions = [
      { id: 'focus', label: 'Focus', icon: 'ph-timer' },
      { id: 'missions', label: 'Nexus Control', icon: 'ph-list-checks' },
      { id: 'summary', label: 'Session Report', icon: 'ph-chart-line-up' }
    ];
    definitions.forEach(function (item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'focus-workspace-tab';
      button.dataset.page = item.id;
      button.setAttribute('role', 'tab');
      const icon = document.createElement('i');
      icon.className = 'ph ' + item.icon;
      const label = document.createElement('span');
      label.textContent = item.label;
      button.append(icon, label);
      button.addEventListener('click', function () { openTab(item.id); });
      tabs.appendChild(button);
    });
    main.insertBefore(tabs, main.firstElementChild);

    const summaryTitle = $('#summary .section-header');
    if (summaryTitle) summaryTitle.textContent = 'Task & Focus Report';
    const reportJumps = $('#summary-jumps');
    if (reportJumps) reportJumps.setAttribute('aria-label', 'Choose report period');

    function sync() {
      const activeView = $('.view.active');
      const activeId = activeView ? activeView.id : 'home';
      const inWorkspace = ['focus', 'missions', 'summary'].includes(activeId);
      document.body.classList.toggle('focus-workspace-open', inWorkspace);
      tabs.querySelectorAll('[data-page]').forEach(function (button) {
        const active = button.dataset.page === activeId;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      });
      const home = originalNavLink('home');
      const log = originalNavLink('log');
      const focus = originalNavLink('focus');
      const more = $('#nav-more-toggle');
      if (home) home.classList.toggle('active', activeId === 'home');
      if (log) log.classList.toggle('active', activeId === 'log');
      if (focus) focus.classList.toggle('active', inWorkspace);
      if (more) more.classList.toggle('active', !inWorkspace && !mainNavKeys.has(activeId));
    }
    $$('.astraea-shell > nav .nav-link[data-tab]').forEach(function (link) {
      link.addEventListener('click', function () {
        window.setTimeout(sync, 0);
      }, true);
    });
    window.addEventListener('hashchange', sync);
    window._astraeaWorkspaceSync = sync;
    sync();
  }

  function initMoreMenu() {
    const nav = $('.astraea-shell > nav');
    if (!nav || $('#nav-more-toggle')) return;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'nav-more-toggle';
    toggle.className = 'nav-link nav-more-toggle';
    toggle.title = 'More sections';
    toggle.setAttribute('aria-label', 'More sections');
    toggle.setAttribute('aria-expanded', 'false');
    const icon = document.createElement('i');
    icon.className = 'ph ph-squares-four';
    const caption = document.createElement('span');
    caption.className = 'nav-caption';
    caption.textContent = 'More';
    toggle.append(icon, caption);
    nav.appendChild(toggle);

    const panel = document.createElement('section');
    panel.id = 'nav-more-panel';
    panel.className = 'nav-more-panel';
    panel.setAttribute('aria-label', 'More Astraea sections');
    const head = document.createElement('div');
    head.className = 'nav-more-head';
    const heading = document.createElement('strong');
    heading.textContent = 'Explore Astraea';
    const hint = document.createElement('span');
    hint.textContent = 'Other sections';
    head.append(heading, hint);
    const grid = document.createElement('div');
    grid.className = 'nav-more-grid';

    const labels = {
      aiassistant: 'AI Assistant', diary: 'Personal Diary', doubts: 'Doubt Diary',
      leaderboard: 'Leaderboard', tracker: 'Habit Tracker', events: 'Events',
      chapters: 'Chapter Tracker', astratest: 'Astra Test', timelinecal: 'Calendar',
      settings: 'Settings', admin: 'Admin'
    };
    Object.keys(labels).forEach(function (tab) {
      const source = originalNavLink(tab);
      if (!source) return;
      if (tab === 'admin' && (source.style.display === 'none' || source.hidden)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-more-item';
      const sourceIcon = $('i', source);
      const itemIcon = document.createElement('i');
      itemIcon.className = sourceIcon ? sourceIcon.className : 'ph ph-circle';
      const text = document.createElement('span');
      text.textContent = labels[tab];
      button.append(itemIcon, text);
      button.addEventListener('click', function () {
        panel.classList.remove('open');
        document.body.classList.remove('nav-more-open');
        toggle.setAttribute('aria-expanded', 'false');
        openTab(tab);
      });
      grid.appendChild(button);
    });
    panel.append(head, grid);
    document.body.appendChild(panel);

    function setOpen(open) {
      panel.classList.toggle('open', open);
      document.body.classList.toggle('nav-more-open', open);
      toggle.classList.toggle('active', open || toggle.classList.contains('active'));
      toggle.setAttribute('aria-expanded', String(open));
    }
    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      setOpen(!panel.classList.contains('open'));
    });
    document.addEventListener('pointerdown', function (event) {
      if (!panel.contains(event.target) && !toggle.contains(event.target)) {
        setOpen(false);
        if (window._astraeaWorkspaceSync) window._astraeaWorkspaceSync();
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });
    $$('.astraea-shell > nav .nav-link[data-tab]').forEach(function (link) {
      link.addEventListener('click', function () { setOpen(false); }, true);
    });
  }

  function initHomeExplore() {
    const home = $('#home');
    if (!home || $('#home-explore')) return;
    const section = document.createElement('section');
    section.id = 'home-explore';
    section.className = 'home-explore';
    const head = document.createElement('div');
    head.className = 'home-explore-head';
    const headingWrap = document.createElement('div');
    const kicker = document.createElement('div');
    kicker.className = 'home-explore-kicker';
    kicker.textContent = 'Your workspace';
    const title = document.createElement('div');
    title.className = 'home-explore-title';
    title.textContent = 'Jump into Astraea';
    headingWrap.append(kicker, title);
    const subtitle = document.createElement('span');
    subtitle.className = 'home-explore-sub';
    subtitle.textContent = 'Everything else is one tap away';
    head.append(headingWrap, subtitle);

    const cards = [
      ['focus', 'Focus session', 'ph-timer', 'Start or resume a session'],
      ['missions', 'Nexus Control', 'ph-list-checks', 'Plan and manage tasks'],
      ['summary', 'Session report', 'ph-chart-line-up', 'Review tasks and focus'],
      ['timelinecal', 'Calendar', 'ph-calendar-dots', 'See your timeline'],
      ['aiassistant', 'AI Assistant', 'ph-sparkle', 'Ask about your workspace'],
      ['tracker', 'Habit tracker', 'ph-chart-line-up', 'Check your routines']
    ];
    const grid = document.createElement('div');
    grid.className = 'home-explore-grid';
    cards.forEach(function (entry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'home-explore-card';
      const iconBox = document.createElement('span');
      iconBox.className = 'home-explore-icon';
      const icon = document.createElement('i');
      icon.className = 'ph ' + entry[2];
      iconBox.appendChild(icon);
      const copy = document.createElement('span');
      copy.className = 'home-explore-copy';
      const name = document.createElement('strong');
      name.textContent = entry[1];
      const description = document.createElement('small');
      description.textContent = entry[3];
      copy.append(name, description);
      button.append(iconBox, copy);
      button.addEventListener('click', function () { openTab(entry[0]); });
      grid.appendChild(button);
    });
    section.append(head, grid);
    home.appendChild(section);
  }

  function getApplicationState() {
    try {
      if (typeof state !== 'undefined' && state) return state;
    } catch (error) { /* global lexical state may not be initialized yet */ }
    return window.state || null;
  }

  function createCell(row, text, className) {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = text == null ? '' : String(text);
    row.appendChild(cell);
    return cell;
  }

  function insertDivider(body, className, text) {
    const row = document.createElement('tr');
    row.className = 'activity-divider ' + className;
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = text;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function weekStartKey(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0');
  }

  function formatDuration(ms) {
    try {
      if (typeof formatTimeDDHHMMSS === 'function') return formatTimeDDHHMMSS(ms);
    } catch (error) { /* use compact fallback */ }
    const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return (hours ? hours + 'h ' : '') + mins + 'm';
  }

  function formatStamp(log) {
    const date = new Date(Number(log.stamp) || 0);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return log.retro ? date.toLocaleDateString() + ' ' + time : time;
  }

  function addBadge(parent, text, style) {
    const badge = document.createElement('span');
    badge.className = 'activity-inline-badge';
    badge.textContent = text;
    badge.style.cssText = style;
    parent.appendChild(badge);
  }

  function renderGroupedActivityLogs() {
    const body = $('#sw-table-body');
    const appState = getApplicationState();
    if (!body || !appState || !appState.sw || !Array.isArray(appState.sw.logs)) return;

    const allLogs = appState.sw.logs.map(function (log, index) {
      return { log: log, index: index };
    }).sort(function (a, b) {
      return (Number(b.log.stamp) || 0) - (Number(a.log.stamp) || 0);
    });
    const visible = activityExpanded ? allLogs : allLogs.slice(0, initialActivityCount);
    const subjectMap = window.ch_SUBJECTS || {};
    const categoryMap = {
      productive: { label: 'Productive', color: '#10b981', emoji: '●' },
      unproductive: { label: 'Unproductive', color: '#ef4444', emoji: '●' },
      sleep: { label: 'Sleep', color: '#3b82f6', emoji: '●' },
      health: { label: 'Health', color: '#ec4899', emoji: '●' },
      coding: { label: 'Coding', color: '#8b5cf6', emoji: '●' }
    };
    const typeLabels = {
      lecture: 'Lecture', module: 'Module', dpp: 'DPP', test: 'Test',
      revision: 'Revision', wrongQ: 'Wrong Q', ncert: 'NCERT', pyq: 'PYQ',
      flash: 'Flash', writing: 'Writing', map: 'Map', current: 'Current'
    };
    const fragment = document.createDocumentFragment();
    let lastMonth = '';
    let lastWeek = '';
    let lastDay = '';
    visible.forEach(function (entry) {
      const log = entry.log || {};
      const stamp = Number(log.stamp) || 0;
      const date = new Date(stamp);
      const dayKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      const monthKey = dayKey.slice(0, 7);
      const weekKey = weekStartKey(date);
      if (monthKey !== lastMonth) {
        insertDivider(fragment, 'activity-divider-month', date.toLocaleDateString([], { month: 'long', year: 'numeric' }));
        lastMonth = monthKey;
        lastWeek = '';
        lastDay = '';
      }
      if (weekKey !== lastWeek) {
        insertDivider(fragment, 'activity-divider-week', 'Week of ' + new Date(weekKey + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }));
        lastWeek = weekKey;
        lastDay = '';
      }
      if (dayKey !== lastDay) {
        insertDivider(fragment, 'activity-divider-day', date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }));
        lastDay = dayKey;
      }

      const row = document.createElement('tr');
      const nameCell = createCell(row, log.desc || 'Activity');
      const subject = log.subject && subjectMap[log.subject];
      if (subject) addBadge(nameCell, subject.label || log.subject, 'margin-left:6px;padding:2px 6px;border-radius:99px;font-size:.58rem;background:' + (subject.color || '#64748b') + '20;color:' + (subject.color || '#64748b'));
      if (log.studyType) addBadge(nameCell, typeLabels[log.studyType] || log.studyType, 'margin-left:6px;padding:2px 6px;border-radius:99px;font-size:.58rem;background:rgba(251,191,36,.12);color:#b7791f');
      if (log.retro) addBadge(nameCell, 'Past entry', 'margin-left:6px;padding:2px 6px;border-radius:99px;font-size:.58rem;background:rgba(251,191,36,.14);color:#b7791f');

      const meta = categoryMap[log.type] || { label: log.type || 'Activity', color: '#64748b', emoji: '●' };
      const categoryCell = createCell(row, meta.emoji + ' ' + meta.label);
      categoryCell.style.color = meta.color;
      categoryCell.style.fontWeight = '700';
      createCell(row, formatDuration(log.duration), 'activity-duration');
      createCell(row, formatStamp(log), 'activity-stamp');
      const actionCell = document.createElement('td');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'activity-delete';
      remove.title = 'Delete activity';
      remove.setAttribute('aria-label', 'Delete ' + (log.desc || 'activity'));
      remove.textContent = '×';
      remove.addEventListener('click', function () {
        if (typeof window.deleteLog === 'function') window.deleteLog(entry.index);
      });
      actionCell.appendChild(remove);
      row.appendChild(actionCell);
      fragment.appendChild(row);
    });
    if (!visible.length) insertDivider(fragment, 'activity-divider-day', 'No activity logged yet');

    body.replaceChildren(fragment);

    const sums = { productive: 0, unproductive: 0, sleep: 0, health: 0, coding: 0 };
    appState.sw.logs.forEach(function (log) {
      if (Object.prototype.hasOwnProperty.call(sums, log.type)) sums[log.type] += Number(log.duration) || 0;
    });
    ['productive', 'unproductive', 'sleep', 'health'].forEach(function (key) {
      const target = $('#sum-' + key);
      if (!target) return;
      try {
        target.innerHTML = typeof renderTimeBlock === 'function' ? renderTimeBlock(sums[key]) : formatDuration(sums[key]);
      } catch (error) { target.textContent = formatDuration(sums[key]); }
    });

    const toolbar = $('#activity-history-toggle');
    const metaText = $('#activity-history-count');
    if (toolbar) {
      toolbar.textContent = activityExpanded ? 'Show recent only' : 'Show all logs';
      toolbar.setAttribute('aria-expanded', String(activityExpanded));
    }
    if (metaText) {
      metaText.textContent = activityExpanded
        ? 'Showing all ' + allLogs.length + ' entries'
        : 'Showing latest ' + visible.length + ' of ' + allLogs.length + ' entries';
    }
  }

  function initActivityHistory() {
    const table = $('#sw-table-body');
    const card = table && table.closest('.card');
    if (!table || !card || $('#activity-history-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'activity-history-toolbar';
    toolbar.className = 'activity-history-toolbar';
    const meta = document.createElement('div');
    meta.id = 'activity-history-count';
    meta.className = 'activity-history-meta';
    meta.textContent = 'Loading recent activity…';
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'activity-history-toggle';
    button.className = 'activity-history-toggle';
    button.addEventListener('click', function () {
      activityExpanded = !activityExpanded;
      renderGroupedActivityLogs();
    });
    toolbar.append(meta, button);
    card.parentNode.insertBefore(toolbar, card);
    window.renderLogs = renderGroupedActivityLogs;
    renderGroupedActivityLogs();
  }

  function initCalendarPolish() {
    const title = $('#timelinecal .section-header');
    if (title) title.textContent = 'Calendar & Timeline';
    const filter = $('#cal-filter-bar');
    if (filter) filter.setAttribute('aria-label', 'Filter calendar activities');
    const month = $('#view-month-container');
    if (month) month.setAttribute('aria-label', 'Monthly calendar');
    const week = $('#view-week-container');
    if (week) week.setAttribute('aria-label', 'Weekly timeline. Scroll horizontally to view each day.');
  }

  function init() {
    initMoreMenu();
    initFocusWorkspace();
    initHomeExplore();
    initActivityHistory();
    initCalendarPolish();
    if (window._astraeaWorkspaceSync) window._astraeaWorkspaceSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();