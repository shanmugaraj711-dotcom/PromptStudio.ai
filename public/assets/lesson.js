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

  /* Sidebar toggle (narrow widths): the lessons list opens as a drawer
     over the page. On desktop the sidebar is always visible and the
     button is hidden by CSS. Tapping a lesson link closes the drawer. */
  var sbBtn = document.getElementById('btn-sidebar');
  var sbNav = document.getElementById('lesson-sidebar');
  if (sbBtn && sbNav) {
    sbBtn.addEventListener('click', function () {
      var open = document.body.classList.toggle('sidebar-open');
      sbBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    sbNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        document.body.classList.remove('sidebar-open');
        sbBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();
