/* lesson.js — lesson pages: scroll progress bar + Copy buttons on
   command blocks. Loaded at the end of each lesson page. */
(function () {
  'use strict';
  /* Sticky 4px progress bar under the lesson header, driven by scroll.
     When devops-app.js switches it to real completion (signed in), the
     scroll driver stands down: __DEVOPS_COMPLETION_BAR__ is true. */
  var fill = document.getElementById('lesson-progress-fill');
  if (fill) {
    var ticking = false;
    function update() {
      ticking = false;
      if (window.__DEVOPS_COMPLETION_BAR__) return;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
      fill.style.width = pct + '%';
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* Copy buttons on every command block. Copies the command text only
     (not the EXPECTED OUTPUT section). Button says "Copied ✓" for 1.5s. */
  document.querySelectorAll('.codeblock').forEach(function (block) {
    var btn = block.querySelector('.cb-copy');
    var pre = block.querySelector('pre');
    if (!btn || !pre) return;
    btn.addEventListener('click', function () {
      var text = pre.textContent || '';
      function done() {
        btn.textContent = 'Copied ✓';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else {
        fallbackCopy(text);
        done();
      }
    });
  });
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }
})();
