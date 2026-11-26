/* hero.js — animated Patroni failover terminal mockup (landing only).
   Exact sequence from the Gemini spec: 11.5s loop, 55ms/char typing.
   Reduced motion: render the final state statically, no loop. */
(function () {
  'use strict';
  var body = document.getElementById('hero-term-body');
  var win = document.getElementById('hero-term');
  if (!body || !win) return;

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function line(cls, html) {
    var d = document.createElement('div');
    d.className = 'ht-line ' + (cls || '');
    d.innerHTML = html;
    body.appendChild(d);
    return d;
  }
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Final static state (also the reduced-motion rendering).
  function renderFinal() {
    body.innerHTML = '';
    line('', '<span class="ht-prompt">$</span> <span class="ht-cmd">docker exec pg-primary kill -9 1</span>');
    line('', '<span class="ht-muted">[!] Primary node pg-01 unreachable</span>');
    line('', '<span class="ht-amber">[~] Patroni election started (TTL: 10s)</span>');
    line('', '<span class="ht-green">[✓] pg-02 promoted to leader (0ms data loss)</span>');
    line('', '<span class="ht-prompt">$</span> <span class="ht-cmd">curl -s localhost:8008/role</span>');
    line('', '<span class="ht-white">{"role": "master", "state": "running"}</span>');
  }

  async function typeInto(el, text, msPerChar) {
    for (var i = 0; i < text.length; i++) {
      el.textContent += text[i];
      await sleep(msPerChar);
    }
  }

  async function playLoop() {
    for (;;) {
      body.innerHTML = '';
      win.classList.remove('fading');
      // 0.0s prompt + cursor
      var l1 = line('', '<span class="ht-prompt">$</span> <span class="ht-cmd"></span><span class="ht-cursor"></span>');
      var cmd1 = l1.querySelector('.ht-cmd');
      var cur1 = l1.querySelector('.ht-cursor');
      // 0.4s-1.8s type first command at 55ms/char
      await sleep(400);
      await typeInto(cmd1, 'docker exec pg-primary kill -9 1', 55);
      if (cur1) cur1.remove();
      // 2.1s / 2.7s / 3.4s outputs
      await sleep(300);
      line('', '<span class="ht-muted">[!] Primary node pg-01 unreachable</span>');
      await sleep(600);
      line('', '<span class="ht-amber">[~] Patroni election started (TTL: 10s)</span>');
      await sleep(700);
      line('', '<span class="ht-green">[✓] pg-02 promoted to leader (0ms data loss)</span>');
      // 4.2s second prompt + type at 45ms/char (lands ~5.5s)
      await sleep(800);
      var l2 = line('', '<span class="ht-prompt">$</span> <span class="ht-cmd"></span><span class="ht-cursor"></span>');
      var cmd2 = l2.querySelector('.ht-cmd');
      var cur2 = l2.querySelector('.ht-cursor');
      await typeInto(cmd2, 'curl -s localhost:8008/role', 45);
      if (cur2) cur2.remove();
      // 5.7s output, then hold for reading until 10.5s
      await sleep(200);
      line('', '<span class="ht-white">{"role": "master", "state": "running"}</span>');
      await sleep(4800);
      // 10.5s-11.2s fade, clear, restart (11.5s loop)
      win.classList.add('fading');
      await sleep(700);
    }
  }

  if (reduced) {
    renderFinal();
  } else {
    playLoop();
  }

  /* How-it-works rail: scroll-linked highlight (IntersectionObserver).
     A step's circle turns blue while the step sits in the centre 50%
     of the viewport. */
  var steps = document.querySelectorAll('.rail-step');
  if (steps.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          steps.forEach(function (s) { s.classList.remove('active'); });
          e.target.classList.add('active');
        }
      });
    }, { rootMargin: '-25% 0px -25% 0px' });
    steps.forEach(function (s) { io.observe(s); });
  } else if (steps.length) {
    steps[0].classList.add('active');
  }
})();
