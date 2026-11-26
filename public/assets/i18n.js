/* i18n.js — in-browser language switcher for DevOps Kit.
   English | हिन्दी | తెలుగు | தமிழ்
   How it works: the pages stay in English. When a learner picks a language,
   /i18n/<lang>.json (a dictionary: English text -> translation) is loaded and
   matching text on the page is swapped in place. Commands and code are never
   translated. Anything without a translation stays in English, so a page is
   never blank. No reload, so a running simulation keeps its state.
   Add translations by editing the JSON files; no page needs to change. */
(function () {
  'use strict';
  var LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు'], ['ta', 'தமிழ்']];
  var FONTS = {
    hi: 'Noto+Sans+Devanagari:wght@400;600;700',
    te: 'Noto+Sans+Telugu:wght@400;600;700',
    ta: 'Noto+Sans+Tamil:wght@400;600;700'
  };
  var STORE = 'dk_lang';
  var INLINE = { A: 1, B: 1, STRONG: 1, EM: 1, I: 1, CODE: 1, BR: 1, SPAN: 1, SMALL: 1, KBD: 1, U: 1, SUP: 1, SUB: 1, MARK: 1 };
  var SKIP_TAG = { SCRIPT: 1, STYLE: 1, PRE: 1, CODE: 1, KBD: 1, SAMP: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, SVG: 1, NOSCRIPT: 1 };
  /* NOT translated: terminal commands/output, and text the app itself reads back
     (#step-count drives progress saving; .scmd pills are the command to type). */
  var SKIP_SEL = '[translate="no"],.notranslate,.tline.cmd,.tline.out,.tline.err,.tprompt,.lang-switch,.container-name,#step-count,.scmd';
  function isSystemLine(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    var line = el && el.closest ? el.closest('.tline.hint') : null;
    return !!(line && /^\s*—/.test(line.textContent || ''));
  }
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  var dict = null, lang = 'en', records = [], busy = false, observer = null, pending = false;
  var cache = {};

  function store(v) { try { if (v === undefined) return localStorage.getItem(STORE); localStorage.setItem(STORE, v); } catch (e) { return null; } }
  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function valid(l) { return LANGS.some(function (x) { return x[0] === l; }); }

  /* ---- lookup (with number placeholders: "Step 3 of 16" -> "Step {n} of {n}") ---- */
  function lookup(key) {
    if (!dict || !key) return null;
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    if (/\d/.test(key)) {
      var nums = [];
      var k2 = key.replace(/\d+/g, function (m) { nums.push(m); return '{n}'; });
      if (Object.prototype.hasOwnProperty.call(dict, k2)) {
        var i = 0;
        return dict[k2].replace(/\{n\}/g, function () { return nums[i++] || ''; });
      }
    }
    return null;
  }

  function isLeaf(el) {
    for (var i = 0; i < el.children.length; i++) if (!INLINE[el.children[i].tagName]) return false;
    return true;
  }

  function skipped(el) {
    if (SKIP_TAG[el.tagName]) return true;
    return !!(el.matches && el.matches(SKIP_SEL));
  }

  function setText(node, tr) {
    var v = node.nodeValue, lead = (v.match(/^\s*/) || [''])[0], trail = (v.match(/\s*$/) || [''])[0];
    records.push({ t: 'n', node: node, en: v });
    node.nodeValue = lead + tr + trail;
  }

  function walk(el) {
    if (el.nodeType === 3) {
      var p = el.parentElement;
      if (!p || skipped(p) || (p.closest && p.closest(SKIP_SEL)) || isSystemLine(el)) return;
      var tr = lookup(norm(el.nodeValue));
      if (tr) setText(el, tr);
      return;
    }
    if (el.nodeType !== 1) return;
    if (!(el.matches && el.matches(SKIP_SEL))) ATTRS.forEach(function (a) {
      var v = el.getAttribute(a);
      if (v) { var t = lookup(norm(v)); if (t) { records.push({ t: 'a', el: el, a: a, en: v }); el.setAttribute(a, t); } }
    });
    if (skipped(el) || isSystemLine(el)) return;
    if (el.children.length && isLeaf(el) && norm(el.textContent)) {
      var tr2 = lookup(norm(el.innerHTML));
      if (tr2) { records.push({ t: 'h', el: el, en: el.innerHTML }); el.innerHTML = tr2; return; }
    } else if (!el.children.length && norm(el.textContent)) {
      var tr3 = lookup(norm(el.textContent));
      if (tr3) { records.push({ t: 'h', el: el, en: el.innerHTML }); el.textContent = tr3; return; }
    }
    var kids = Array.prototype.slice.call(el.childNodes);
    for (var c = 0; c < kids.length; c++) { if (kids[c].nodeType === 1 || kids[c].nodeType === 3) walk(kids[c]); }
  }

  function restore() {
    busy = true;
    for (var i = records.length - 1; i >= 0; i--) {
      var r = records[i];
      try {
        if (r.t === 'n') { if (r.node.isConnected) r.node.nodeValue = r.en; }
        else if (r.t === 'a') { if (r.el.isConnected) r.el.setAttribute(r.a, r.en); }
        else if (r.el.isConnected) r.el.innerHTML = r.en;
      } catch (e) { /* node gone */ }
    }
    records = [];
    busy = false;
  }

  function applyAll() {
    if (!dict) return;
    busy = true;
    try { walk(document.body); document.title = lookup(norm(document.title)) || document.title; } finally { busy = false; }
  }

  function startObserver() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(function (muts) {
      if (busy || lang === 'en' || !dict) return;
      if (pending) return;
      pending = true;
      var targets = [];
      muts.forEach(function (m) {
        if (m.type === 'childList') m.addedNodes.forEach(function (n) { targets.push(n); });
        else if (m.type === 'characterData') targets.push(m.target);
        if (m.type === 'childList' && m.target && m.target.nodeType === 1) targets.push(m.target);
      });
      (window.requestAnimationFrame || setTimeout)(function () {
        pending = false;
        busy = true;
        try { targets.forEach(function (n) { if (n.isConnected || n.nodeType === 3) walk(n); }); } finally { busy = false; }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function loadFont(l) {
    if (!FONTS[l] || document.getElementById('dk-font-' + l)) return;
    var link = document.createElement('link');
    link.id = 'dk-font-' + l; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + FONTS[l] + '&display=swap';
    document.head.appendChild(link);
  }

  function fetchDict(l) {
    if (cache[l]) return Promise.resolve(cache[l]);
    return fetch('/i18n/' + l + '.json', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('i18n ' + r.status); return r.json(); })
      .then(function (d) { cache[l] = d; return d; });
  }

  function setLang(l, remember) {
    if (!valid(l)) l = 'en';
    if (remember !== false) store(l);
    document.querySelectorAll('.lang-switch').forEach(function (s) { s.value = l; });
    if (l === 'en') {
      lang = 'en'; restore(); dict = null;
      document.documentElement.lang = 'en';
      return Promise.resolve();
    }
    loadFont(l);
    return fetchDict(l).then(function (d) {
      restore();
      lang = l; dict = d;
      document.documentElement.lang = l;
      startObserver();
      applyAll();
    }).catch(function () { /* offline or file missing: stay in English */ });
  }

  function buildSwitcher() {
    var s = document.createElement('select');
    s.className = 'lang-switch';
    s.setAttribute('aria-label', 'Language');
    s.setAttribute('translate', 'no');
    LANGS.forEach(function (x) { var o = document.createElement('option'); o.value = x[0]; o.textContent = x[1]; s.appendChild(o); });
    s.addEventListener('change', function () { setLang(s.value); });
    return s;
  }

  function mount() {
    var host = document.querySelector('.site-header, .lh-row, .sim-topbar');
    var sw = buildSwitcher();
    if (host) {
      var slot = host.querySelector('.auth-slot');
      host.insertBefore(sw, slot || null);
    } else {
      sw.className += ' lang-floating';
      document.body.appendChild(sw);
    }
    var q = new URLSearchParams(location.search).get('lang');
    var want = (q && valid(q)) ? q : store();
    if (!want || !valid(want)) want = 'en';
    sw.value = want;
    if (want !== 'en') setLang(want, !!q);
    else if (!store() && document.body.getAttribute('data-page') === 'landing') suggest();
  }

  /* one-time, dismissible hint for visitors whose browser is set to an Indian language */
  function suggest() {
    var prefs = (navigator.languages || [navigator.language || '']).map(function (x) { return String(x).slice(0, 2).toLowerCase(); });
    var hit = ['hi', 'te', 'ta'].filter(function (l) { return prefs.indexOf(l) >= 0; })[0];
    if (!hit) return;
    var names = { hi: 'हिन्दी में देखें', te: 'తెలుగులో చూడండి', ta: 'தமிழில் பார்க்க' };
    var bar = document.createElement('div');
    bar.className = 'lang-suggest';
    bar.setAttribute('translate', 'no');
    var b = document.createElement('button'); b.type = 'button'; b.textContent = names[hit];
    var x = document.createElement('button'); x.type = 'button'; x.className = 'ls-x'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
    b.addEventListener('click', function () { setLang(hit); bar.remove(); });
    x.addEventListener('click', function () { store('en'); bar.remove(); });
    bar.appendChild(b); bar.appendChild(x);
    document.body.insertBefore(bar, document.body.firstChild.nextSibling);
  }

  /* developer helper: list every text the translator would look up on this page */
  function probe() {
    var seen = [];
    dict = new Proxy({}, { getOwnPropertyDescriptor: function (t, k) { if (typeof k === 'string' && seen.indexOf(k) < 0) seen.push(k); return undefined; } });
    var prev = lang; lang = 'probe';
    try { applyAll(); } finally { dict = null; lang = prev; }
    return seen;
  }
  window.DevOpsI18n = { set: setLang, get: function () { return lang; }, probe: probe };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
