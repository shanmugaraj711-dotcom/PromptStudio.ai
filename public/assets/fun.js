/* fun.js — small celebration when a learner clears a step or finishes a lab.
   Purely visual: it only watches the step counter, changes nothing in the sim. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var count = document.getElementById('step-count');
  if (!count || reduce) return;
  var EMOJI = ['🎉', '✨', '🔥', '💜', '⚡', '🚀'];
  var last = 0, finished = false;

  function burst(n, big) {
    var box = count.getBoundingClientRect();
    var x0 = Math.min(Math.max(box.left + 40, 30), window.innerWidth - 30);
    var y0 = Math.min(Math.max(box.top + 10, 60), window.innerHeight - 60);
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span');
      s.className = 'confetti';
      s.textContent = EMOJI[(Math.random() * EMOJI.length) | 0];
      s.style.left = x0 + 'px'; s.style.top = y0 + 'px';
      s.style.setProperty('--dx', ((Math.random() - 0.5) * (big ? 520 : 240)) + 'px');
      s.style.setProperty('--dy', (-60 - Math.random() * (big ? 320 : 150)) + 'px');
      s.style.setProperty('--rot', ((Math.random() - 0.5) * 540) + 'deg');
      s.setAttribute('aria-hidden', 'true');
      document.body.appendChild(s);
      setTimeout(function (el) { el.remove(); }, 1300, s);
    }
  }

  function banner(msg) {
    var b = document.createElement('div');
    b.className = 'win-banner'; b.setAttribute('role', 'status'); b.textContent = msg;
    document.body.appendChild(b);
    setTimeout(function () { b.remove(); }, 4200);
  }

  new MutationObserver(function () {
    var t = count.textContent || '';
    var m = /Step (\d+) of (\d+)/.exec(t);
    if (m) {
      var n = parseInt(m[1], 10);
      if (last && n > last) burst(7, false);
      last = n;
    } else if (/Guided steps done/.test(t) && !finished) {
      finished = true;
      burst(26, true);
      banner('Lab cleared! 🎉 You finished every step.');
    }
  }).observe(count, { childList: true, characterData: true, subtree: true });
})();
