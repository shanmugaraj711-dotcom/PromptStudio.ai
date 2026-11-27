/* boot.js — loads sign-in (Firebase) and the app script WITHOUT ever blocking the page.
   Why: on office networks (Zscaler and similar) third-party hosts like gstatic.com are
   often blocked or silently dropped. Pages and free simulations must still open
   instantly, so these scripts load in the background with a short timeout. If sign-in
   cannot load, the app starts in signed-out mode instead of waiting forever. */
(function () {
  'use strict';
  var BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var SDK = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'].map(function (f) { return BASE + f; });

  function load(src, ms, cb) {
    var s = document.createElement('script'), done = false, t;
    function fin(ok) { if (done) return; done = true; clearTimeout(t); cb(ok); }
    s.src = src; s.async = false;
    s.onload = function () { fin(true); };
    s.onerror = function () { fin(false); };
    t = setTimeout(function () { fin(false); }, ms);
    document.head.appendChild(s);
  }
  function chain(list, i, ms, cb) {
    if (i >= list.length) return cb(true);
    load(list[i], ms, function (ok) { if (!ok) return cb(false); chain(list, i + 1, ms, cb); });
  }

  if (window.__DK_OFFLINE__) return; // offline kit: everything is local, no sign-in, no network

  chain(SDK, 0, 5000, function (ok) {
    chain(ok ? ['/assets/auth.js', '/assets/devops-app.js'] : ['/assets/devops-app.js'], 0, 8000, function () {});
  });

  /* Offline / blocked-network support: keep the free pages on this device after the first visit. */
  try {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
    }
  } catch (e) { /* ignore */ }
})();
