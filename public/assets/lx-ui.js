/* lx-ui.js — the learning screen for the Linux Server Lab: module map, mission card, terminal, editor, XP.
   Runs 100% in the browser. Progress is kept in this browser (localStorage). */
(function () {
  'use strict';
  var cfg = window.LX_CONFIG || { demo: false };
  var root = document.getElementById('lx-root');
  if (!root || !window.LX) return;
  var LX = window.LX, CAT = window.LX_CATALOG || [];
  var KEY = 'dk_lx_v1';
  var BASE = location.protocol === 'file:' ? 'https://promptstudioai.in' : ''; // offline kit: links to the live site

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmt(s) { return esc(s).replace(/\u0001(\w)\u0002([\s\S]*?)\u0003/g, '<span class="c-$1">$2</span>'); }
  function h(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }

  // ---------------------------------------------------------------- progress (this browser only)
  var P = { done: {}, xp: 0, streak: { last: '', n: 0 }, seenGuide: false };
  try { var raw = localStorage.getItem(KEY); if (raw) P = Object.assign(P, JSON.parse(raw)); } catch (e) { /* private mode */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* ignore */ } }
  function today() { return new Date().toISOString().slice(0, 10); }
  function touchStreak() {
    var t = today();
    if (P.streak.last === t) return;
    var y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    P.streak.n = P.streak.last === y ? P.streak.n + 1 : 1; P.streak.last = t; save();
  }
  function doneCount() { var n = 0; Object.keys(P.done).forEach(function (k) { n += P.done[k].length; }); return n; }

  // ---------------------------------------------------------------- state
  var modIdx = 0, m = null, attempt = {}, since = 0, hintLvl = 0, cardState = 'task', cardDoneText = '', histPos = -1, tabCount = 0;
  function MOD(id) { return (LX.MODULES || []).filter(function (x) { return x.id === id; })[0]; }
  function catEntry(i) { return CAT[i]; }
  function totalMissions() { return CAT.reduce(function (a, c) { return a + c.count; }, 0); }
  function isUnlocked(c) { return !cfg.demo || c.free; }

  // ---------------------------------------------------------------- layout
  root.innerHTML = '';
  var shell = h('div', { 'class': 'lx' });
  var side = h('aside', { 'class': 'lx-side', id: 'lx-side', 'aria-label': 'Course map' });
  var main = h('section', { 'class': 'lx-main' });
  var top = h('div', { 'class': 'lx-top' });
  var guide = h('details', { 'class': 'lx-guide', id: 'lx-guide' });
  var card = h('div', { 'class': 'lx-card', id: 'lx-card', 'aria-live': 'polite' });
  var term = h('div', { 'class': 'lx-term', id: 'lx-term', role: 'region', 'aria-label': 'Practice Linux server terminal' });
  main.appendChild(top); main.appendChild(guide); main.appendChild(card); main.appendChild(term);
  shell.appendChild(side); shell.appendChild(main); root.appendChild(h('h1', { 'class': 'lx-sr' }, 'Linux Server Lab — practice a real Linux server in your browser')); root.appendChild(shell);

  guide.innerHTML = '<summary>New to Linux? Read this first (30 seconds)</summary><div class="lx-guide-body"><p><b>A server</b> is just a computer that runs all day to serve websites and apps. Most servers run <b>Linux</b> and have no mouse or windows — you control them by typing commands in a <b>terminal</b>.</p><p><b>This lab is a real-feeling Linux server inside your browser.</b> Nothing you type can harm anything. If you get stuck, press <b>Hint</b> — or <b>Run it for me</b> to watch the answer.</p><p>Useful keys: <kbd>Tab</kbd> completes names, <kbd>↑</kbd> repeats the last command, <kbd>Ctrl</kbd>+<kbd>C</kbd> cancels.</p></div>';
  if (!P.seenGuide && window.innerWidth > 700) guide.setAttribute('open', ''); guide.addEventListener('toggle', function () { if (!guide.open) { P.seenGuide = true; save(); } });

  term.innerHTML = '<div class="lx-chrome"><span class="lx-dot"></span><span class="lx-dot"></span><span class="lx-dot"></span><span class="lx-title" translate="no">learner@devkit-server — bash</span><button type="button" class="lx-mini" id="lx-reset">Reset server</button></div>' +
    '<div class="lx-out" id="lx-out" role="log" aria-live="polite" aria-relevant="additions"></div>' +
    '<div class="lx-inrow"><span class="lx-prompt" id="lx-prompt" translate="no"></span><input id="lx-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Type a command" placeholder="type a command, press Enter"></div>' +
    '<div class="lx-keys" id="lx-keys"><button type="button" data-k="tab">Tab</button><button type="button" data-k="up">↑</button><button type="button" data-k="ctrlc">Ctrl+C</button><button type="button" data-k="clear">Clear</button></div>';
  var out = document.getElementById('lx-out'), input = document.getElementById('lx-input'), promptEl = document.getElementById('lx-prompt');

  // editor overlay
  var ed = h('div', { 'class': 'lx-editor', id: 'lx-editor', hidden: '' });
  ed.innerHTML = '<div class="lx-ed-box" role="dialog" aria-modal="true" aria-label="Text editor"><div class="lx-ed-head"><b id="lx-ed-title" translate="no">GNU nano</b><span id="lx-ed-note">practice editor</span></div><textarea id="lx-ed-text" spellcheck="false" aria-label="File contents"></textarea><div class="lx-ed-status" id="lx-ed-status" role="status"></div><div class="lx-ed-btns"><button type="button" class="btn amber" id="lx-ed-save">Save &amp; exit (Ctrl+S)</button><button type="button" class="btn secondary" id="lx-ed-cancel">Cancel (Ctrl+X)</button></div></div>';
  document.body.appendChild(ed);

  // ---------------------------------------------------------------- terminal
  function addLine(kind, s, raw) {
    var d = h('div', { 'class': 'lx-l lx-' + kind });
    d.innerHTML = raw ? s : (fmt(s) || '&nbsp;');
    out.appendChild(d);
  }
  function scroll() { out.scrollTop = out.scrollHeight; }
  function echoCmd(line) { addLine('cmd', '<span class="lx-p" translate="no">' + esc(m.prompt()) + '</span>' + esc(line), true); }
  function render(res) {
    res.forEach(function (e) { if (e.k === 'clear') out.innerHTML = ''; else addLine(e.k === 'err' ? 'err' : 'out', e.s); });
    promptEl.textContent = m.prompt(); scroll();
  }
  function exec(line) {
    echoCmd(line);
    var res = m.run(line); touchStreak();
    render(res);
    if (m.editor) openEditor();
    afterRun();
  }
  function motd() {
    ['Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)', '', ' * Documentation:  https://help.ubuntu.com', ' * This is a PRACTICE server inside your browser — nothing here can break anything.', '', 'Last login: Fri Nov 27 10:40:02 2026 from 10.0.2.2', 'Type  help  to begin, or follow the mission above ↑'].forEach(function (l) { addLine('msg', l); });
    promptEl.textContent = m.prompt();
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { var v = input.value; input.value = ''; histPos = -1; tabCount = 0; exec(v); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { if (m.hist.length) { histPos = histPos < 0 ? m.hist.length - 1 : Math.max(0, histPos - 1); input.value = m.hist[histPos]; } e.preventDefault(); }
    else if (e.key === 'ArrowDown') { if (histPos >= 0) { histPos++; input.value = histPos >= m.hist.length ? '' : m.hist[histPos]; if (histPos >= m.hist.length) histPos = -1; } e.preventDefault(); }
    else if (e.key === 'Tab') { e.preventDefault(); doTab(); }
    else if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); ctrlC(); }
    else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); out.innerHTML = ''; }
    else if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); input.value = ''; }
    else tabCount = 0;
  });
  function doTab() {
    var r = m.complete(input.value);
    if (!r.matches.length) return;
    function common(a) { var p = a[0]; a.forEach(function (x) { while (x.indexOf(p) !== 0) p = p.slice(0, -1); }); return p; }
    if (r.matches.length === 1) { input.value = r.before + r.matches[0] + (/\/$/.test(r.matches[0]) ? '' : ' '); return; }
    var c = common(r.matches);
    if (c.length > r.word.length) { input.value = r.before + c; return; }
    tabCount++;
    if (tabCount >= 2) { echoCmd(input.value); addLine('out', r.matches.map(function (x) { return x; }).join('  ')); scroll(); }
  }
  function ctrlC() { echoCmd(input.value + '^C'); input.value = ''; scroll(); }
  document.getElementById('lx-keys').addEventListener('click', function (e) {
    var k = e.target.getAttribute('data-k'); if (!k) return;
    if (k === 'tab') doTab(); else if (k === 'up') { if (m.hist.length) { histPos = histPos < 0 ? m.hist.length - 1 : Math.max(0, histPos - 1); input.value = m.hist[histPos]; } } else if (k === 'ctrlc') ctrlC(); else if (k === 'clear') out.innerHTML = '';
    input.focus();
  });
  term.addEventListener('click', function (e) { if (!window.getSelection || String(window.getSelection()) === '') input.focus(); });
  document.getElementById('lx-reset').addEventListener('click', function () { startModule(modIdx); });

  // ---------------------------------------------------------------- editor
  var edOpen = null;
  function openEditor() {
    var e = m.editor; if (!e) return; m.editor = null; edOpen = e;
    document.getElementById('lx-ed-title').textContent = 'GNU nano — ' + e.shown + (e.isNew ? ' (new file)' : '');
    document.getElementById('lx-ed-text').value = e.text;
    document.getElementById('lx-ed-status').textContent = e.uid === 0 ? 'Editing as root.' : 'Editing as ' + m.user.name + '. Protected files need  sudo nano …';
    ed.hidden = false; setTimeout(function () { document.getElementById('lx-ed-text').focus(); }, 30);
  }
  function closeEditor() { ed.hidden = true; edOpen = null; input.focus(); }
  function saveEditor() {
    if (!edOpen) return;
    var text = document.getElementById('lx-ed-text').value, err;
    if (edOpen.crontab) err = m.saveCrontab(edOpen.crontab, text); else err = m.saveEditor(edOpen.path, text, edOpen.uid);
    if (err) { document.getElementById('lx-ed-status').textContent = 'Error writing ' + edOpen.shown + ': ' + err + ' — close and reopen with  sudo nano ' + edOpen.shown; return; }
    var name = edOpen.shown; closeEditor(); addLine('out', '[ Wrote ' + (text.split('\n').length) + ' lines to ' + name + ' ]'); scroll(); afterRun();
  }
  document.getElementById('lx-ed-save').addEventListener('click', saveEditor);
  document.getElementById('lx-ed-cancel').addEventListener('click', closeEditor);
  ed.addEventListener('keydown', function (e) {
    if (e.ctrlKey && (e.key === 's' || e.key === 'o' || e.key === 'S' || e.key === 'O')) { e.preventDefault(); saveEditor(); }
    else if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); closeEditor(); }
    else if (e.key === 'Escape') closeEditor();
  });

  // ---------------------------------------------------------------- missions
  function curIdx() { var mod = MOD(CAT[modIdx].id); if (!mod) return -1; for (var i = 0; i < mod.missions.length; i++) if (!attempt[mod.missions[i].id]) return i; return -1; }
  function afterRun() {
    if (cardState !== 'task') return;
    var mod = MOD(CAT[modIdx].id), i = curIdx(); if (i < 0) return;
    var ms = mod.missions[i], ok = false;
    try { ok = !!ms.ok(m, since); } catch (e) { ok = false; }
    if (ok) completeMission(mod, i, false);
  }
  function completeMission(mod, i, skipped) {
    var ms = mod.missions[i]; attempt[ms.id] = true;
    var gained = 0;
    if (!skipped) {
      var list = P.done[mod.id] = P.done[mod.id] || [];
      if (list.indexOf(ms.id) < 0) { list.push(ms.id); gained = Math.max(4, 10 - 2 * hintLvl); P.xp += gained; }
      touchStreak(); save(); celebrate(gained ? 8 : 4);
    }
    cardState = 'done'; cardDoneText = skipped ? 'Skipped. (The next missions may expect this step — use “Run it for me” if something looks different.)' : ms.done; cardGain = gained;
    renderCard(); renderStats(); renderSide();
  }
  var cardGain = 0;
  function nextMission() { cardState = 'task'; hintLvl = 0; since = m.lineLog.length; renderCard(); input.focus({ preventScroll: true }); }
  function renderCard() {
    var mod = MOD(CAT[modIdx].id), c = CAT[modIdx];
    if (!mod) return;
    var i = cardState === 'done' ? Math.max(0, mod.missions.findIndex(function (x) { return !!attempt[x.id] && x === lastDone(mod); })) : curIdx();
    var allDone = curIdx() < 0 && cardState === 'task';
    var total = mod.missions.length, doneN = mod.missions.filter(function (x) { return attempt[x.id]; }).length;
    var segs = ''; for (var s = 0; s < total; s++) segs += '<i class="' + (attempt[mod.missions[s].id] ? 'on' : '') + '"></i>';
    var head = '<div class="lx-card-head"><span class="lx-chip">' + c.icon + ' ' + esc(mod.t) + '</span><span class="lx-count">Mission ' + Math.min(total, doneN + (cardState === 'done' ? 0 : 1)) + ' / ' + total + '</span></div><div class="lx-seg" aria-hidden="true">' + segs + '</div>';
    var html = head;
    if (allDone) {
      var nxt = nextModuleIdx();
      html += '<h2 class="lx-h">🎉 Module complete!</h2><p class="lx-why">You finished all ' + total + ' missions of “' + esc(mod.t) + '”. Great work.</p><div class="lx-btns">' + (nxt >= 0 ? '<button type="button" class="btn amber" id="lx-nextmod">Next module: ' + esc(CAT[nxt].t) + ' →</button>' : '') + '<button type="button" class="btn secondary" id="lx-again">Practice this module again</button></div>';
    } else if (cardState === 'done') {
      var dm = lastDone(mod);
      html += '<h2 class="lx-h lx-ok">✅ ' + esc(dm.t) + '</h2><p class="lx-why">' + esc(cardDoneText) + '</p><div class="lx-btns"><span class="lx-xp">' + (cardGain ? '+' + cardGain + ' XP' : '') + '</span><button type="button" class="btn amber" id="lx-next">Next mission →</button></div>';
    } else {
      var ms = mod.missions[i];
      html += '<h2 class="lx-h">' + esc(ms.t) + '</h2><p class="lx-why"><b>Why it matters:</b> ' + esc(ms.why) + '</p><div class="lx-task"><b>Your task:</b> ' + esc(ms.task) + '</div>';
      var hintHtml = '';
      if (hintLvl >= 1) hintHtml += '<div class="lx-hint">💡 ' + esc(ms.hints[0]) + '</div>';
      if (hintLvl >= 2) hintHtml += '<div class="lx-hint">💡 ' + esc(ms.hints[1]) + '</div>';
      if (hintLvl >= 3) hintHtml += '<div class="lx-hint lx-ans">✅ Answer: <code translate="no">' + esc(ms.ans.join('  ;  ')) + '</code></div>';
      html += hintHtml + '<div class="lx-btns"><button type="button" class="btn amber" id="lx-hint">' + (hintLvl >= 3 ? 'Run it for me' : (hintLvl === 2 ? 'Show the answer' : 'Hint')) + '</button><button type="button" class="btn secondary" id="lx-skip">Skip</button></div>';
    }
    card.className = 'lx-card' + (cardState === 'done' ? ' is-done' : '');
    card.innerHTML = html;
    var b;
    if ((b = document.getElementById('lx-hint'))) b.addEventListener('click', function () { if (hintLvl < 3) { hintLvl++; renderCard(); } else runAnswer(); });
    if ((b = document.getElementById('lx-skip'))) b.addEventListener('click', function () { var md = MOD(CAT[modIdx].id); completeMission(md, curIdx(), true); });
    if ((b = document.getElementById('lx-next'))) b.addEventListener('click', nextMission);
    if ((b = document.getElementById('lx-nextmod'))) b.addEventListener('click', function () { startModule(nextModuleIdx()); });
    if ((b = document.getElementById('lx-again'))) b.addEventListener('click', function () { startModule(modIdx); });
  }
  var lastDoneId = null;
  function lastDone(mod) { var last = null; mod.missions.forEach(function (x) { if (attempt[x.id]) last = x; }); return last; }
  function runAnswer() {
    var mod = MOD(CAT[modIdx].id), ms = mod.missions[curIdx()];
    if (!ms) return;
    ms.ans.forEach(function (c) { exec(c); });
  }
  function nextModuleIdx() { for (var j = modIdx + 1; j < CAT.length; j++) if (isUnlocked(CAT[j])) return j; return -1; }

  // ---------------------------------------------------------------- side / stats
  function renderStats() {
    top.innerHTML = '<div class="lx-stats"><span class="lx-stat" title="Experience points">⭐ <b>' + P.xp + '</b> XP</span><span class="lx-stat" title="Days in a row">🔥 <b>' + P.streak.n + '</b> day streak</span><span class="lx-stat">✅ <b>' + doneCount() + '</b> / ' + totalMissions() + ' missions</span></div><button type="button" class="btn secondary lx-modbtn" id="lx-modbtn" aria-expanded="false" aria-controls="lx-side">☰ Modules</button>';
    var mb = document.getElementById('lx-modbtn'); if (mb) mb.addEventListener('click', function () { var open = side.classList.toggle('open'); mb.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  }
  function renderSide() {
    var html = '<div class="lx-side-h">Linux Server Lab</div><ol class="lx-mods">';
    CAT.forEach(function (c, i) {
      var d = (P.done[c.id] || []).length, locked = !isUnlocked(c);
      html += '<li><button type="button" class="lx-mod' + (i === modIdx ? ' cur' : '') + (locked ? ' locked' : '') + '" data-i="' + i + '"><span class="lx-mi">' + c.icon + '</span><span class="lx-mt"><b>' + (i + 1) + '. ' + esc(c.t) + '</b><small>' + (locked ? '🔒 Full lab' : d + ' / ' + c.count + ' done') + '</small></span></button></li>';
    });
    html += '</ol>' + (cfg.demo ? '<a class="btn amber lx-unlock" href="' + BASE + '/#plans">🔓 Unlock all 12 modules</a>' : '') + '<a class="lx-roadlink" href="' + BASE + '/roadmap.html">🗺️ DevOps A–Z roadmap</a>';
    side.innerHTML = html;
    Array.prototype.forEach.call(side.querySelectorAll('.lx-mod'), function (b) { b.addEventListener('click', function () { var i = +b.getAttribute('data-i'); side.classList.remove('open'); var mb = document.getElementById('lx-modbtn'); if (mb) mb.setAttribute('aria-expanded', 'false'); if (!isUnlocked(CAT[i])) showUpsell(i); else startModule(i); }); });
  }
  function showUpsell(i) {
    var c = CAT[i];
    card.className = 'lx-card lx-upsell';
    card.innerHTML = '<div class="lx-card-head"><span class="lx-chip">' + c.icon + ' ' + esc(c.t) + '</span><span class="lx-count">🔒 Full Linux Server Lab</span></div><h2 class="lx-h">' + esc(c.t) + '</h2><p class="lx-why">' + esc(c.desc) + ' (' + c.count + ' missions)</p><p class="lx-why">The free demo has the first 2 modules. <b>Unlock all 12 modules — 124 missions</b> covering text tools, users &amp; sudo, processes, services &amp; web servers, a real outage to fix, networking, logs, automation (cron), security and disk management.</p><div class="lx-btns"><a class="btn amber" href="' + BASE + '/#plans">See plans (Phase 2 — ₹799)</a><button type="button" class="btn secondary" id="lx-back">Back to the free modules</button></div>';
    document.getElementById('lx-back').addEventListener('click', function () { renderCard(); });
    renderSide(); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------------------------------------------------------------- confetti (respects reduced motion)
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function celebrate(n) {
    if (reduce) return;
    var box = card.getBoundingClientRect(), E = ['🎉', '✨', '🔥', '💜', '⚡', '🚀'];
    for (var i = 0; i < n; i++) {
      var s = h('span', { 'class': 'confetti', 'aria-hidden': 'true' }, E[(Math.random() * E.length) | 0]);
      s.style.left = Math.min(window.innerWidth - 30, Math.max(10, box.left + box.width / 2)) + 'px'; s.style.top = Math.max(60, box.top + 30) + 'px';
      s.style.setProperty('--dx', ((Math.random() - 0.5) * 320) + 'px'); s.style.setProperty('--dy', (-40 - Math.random() * 160) + 'px'); s.style.setProperty('--rot', ((Math.random() - 0.5) * 540) + 'deg');
      document.body.appendChild(s); setTimeout(function (el) { el.remove(); }, 1300, s);
    }
  }

  // ---------------------------------------------------------------- start
  function startModule(i) {
    var c = CAT[i], mod = MOD(c.id);
    if (!mod) { showUpsell(i); return; }
    modIdx = i; m = new LX.Machine({ demo: !!cfg.demo }); if (mod.setup) mod.setup(m);
    attempt = {}; hintLvl = 0; cardState = 'task'; since = 0; histPos = -1;
    out.innerHTML = ''; motd(); renderStats(); renderSide(); renderCard();
    try { var u = new URL(location.href); u.searchParams.set('m', c.id); history.replaceState(null, '', u.toString()); } catch (e) { /* ignore */ }
  }
  var wanted = 0;
  try { var q = new URL(location.href).searchParams.get('m'); if (q) { CAT.forEach(function (c, i) { if (c.id === q && isUnlocked(c)) wanted = i; }); } } catch (e) { /* ignore */ }
  window.LXApp = { exec: exec, start: startModule, machine: function () { return m; }, state: function () { return { mod: CAT[modIdx].id, card: cardState, attempt: attempt }; }, progress: function () { return P; } };
  startModule(wanted);
})();
