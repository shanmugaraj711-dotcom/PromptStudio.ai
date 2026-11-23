/* sim-chrome.js — new simulation chrome around the untouched engine.
   Loaded AFTER /assets/sim.js. It only observes what the engine
   does (step-count text, terminal hint lines) and wires the new chrome:
   top progress bar, done flash, hint toggle, tap-to-insert command pill,
   quick keys (Tab / ArrowUp), and 100dvh + visualViewport keyboard
   handling. It never touches engine/sim.js or SIM_DATA.

   ORDER MATTERS: the terminal-output observer is registered BEFORE the
   step-count observer. The engine prints "— Step done." and only then
   advances the step count, in one synchronous block; observers fire in
   registration order, so the flash must read the step number first. */
(function () {
  'use strict';
  var term = document.getElementById('term');
  if (!term) return;
  var out = document.getElementById('term-out');
  var input = document.getElementById('term-input');
  var stepCard = document.getElementById('step-card');
  var stepText = document.getElementById('step-text');
  var stepCount = document.getElementById('step-count');
  var progFill = document.getElementById('sim-prog-fill');
  var doneBadge = document.getElementById('step-done-badge');
  var hintBtn = document.getElementById('btn-hint');
  var tabBtn = document.getElementById('btn-tab');
  var upBtn = document.getElementById('btn-up');
  if (!out || !input || !stepCard || !stepCount) return;

  var totalSteps = 0, currentStep = 1, freePlay = false;
  var m = /Step (\d+) of (\d+)/.exec(stepCount.textContent || '');
  if (m) { currentStep = parseInt(m[1], 10); totalSteps = parseInt(m[2], 10); }

  function setProgress() {
    if (!progFill) return;
    var pct = freePlay ? 100 : (totalSteps > 1
      ? Math.round(((currentStep - 1) / totalSteps) * 100) : 0);
    progFill.style.width = pct + '%';
  }
  function scrollBottom() { out.scrollTop = out.scrollHeight; }

  /* --- done flash: the engine prints "— Step done. Next: —" into the
         terminal right when a step completes. Flash the card green for
         900ms with a "✓ STEP N COMPLETE" badge. Skips print a different
         line, so they never flash. Registered FIRST (see note above). --- */
  function flashDone(n) {
    if (!doneBadge || !stepCard) return;
    doneBadge.textContent = '✓ STEP ' + n + ' COMPLETE';
    stepCard.classList.add('done-flash');
    setTimeout(function () { stepCard.classList.remove('done-flash'); }, 900);
  }
  if (out && 'MutationObserver' in window) {
    var outObs = new MutationObserver(function (records) {
      records.forEach(function (rec) {
        rec.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          var txt = node.textContent || '';
          if (txt.indexOf('— Step done.') === 0) {
            flashDone(currentStep);
            currentStep++;
            setProgress();
          } else if (txt.indexOf('— Skipped step ') === 0) {
            var sm = /Skipped step (\d+)/.exec(txt);
            if (sm) { currentStep = parseInt(sm[1], 10) + 1; setProgress(); }
          } else if (txt.indexOf('— Guided steps done.') === 0 ||
                     txt.indexOf('— Free play:') === 0) {
            freePlay = true;
            setProgress();
          }
        });
      });
    });
    outObs.observe(out, { childList: true });
  }

  /* --- progress bar follows the engine's step-count text --- */
  if (stepCount && 'MutationObserver' in window) {
    var countObs = new MutationObserver(function () {
      var t = stepCount.textContent || '';
      var mm = /Step (\d+) of (\d+)/.exec(t);
      if (mm) {
        currentStep = parseInt(mm[1], 10);
        totalSteps = parseInt(mm[2], 10);
        freePlay = false;
      } else if (t.indexOf('Guided steps done') === 0) {
        freePlay = true;
      }
      setProgress();
    });
    countObs.observe(stepCount, { childList: true, characterData: true, subtree: true });
  }
  setProgress();

  /* --- hint toggle: hide/show the step note (the engine re-renders the
         note on every step, but the state lives as a class on the card,
         so it survives re-renders) --- */
  if (hintBtn && stepCard) {
    hintBtn.addEventListener('click', function () {
      var hidden = stepCard.classList.toggle('hint-hidden');
      hintBtn.textContent = hidden ? 'Show hint' : 'Hide hint';
      hintBtn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    });
  }

  /* --- tap-to-insert: tapping the command pill fills the input --- */
  if (stepText) {
    stepText.addEventListener('click', function (e) {
      var pill = e.target.closest ? e.target.closest('.scmd') : null;
      if (!pill) return;
      input.value = pill.textContent.trim();
      input.focus();
    });
  }

  /* --- quick keys: dispatch the same keydown the engine listens for --- */
  function sendKey(key) {
    var ev = new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    input.focus();
  }
  if (tabBtn) tabBtn.addEventListener('click', function () { sendKey('Tab'); });
  if (upBtn) upBtn.addEventListener('click', function () { sendKey('ArrowUp'); });

  /* --- 100dvh + visualViewport: when the phone keyboard slides up,
         shrink the shell to the visible height and keep the output
         scrolled to the bottom, step card still visible above it. --- */
  function fitViewport() {
    var h = (window.visualViewport && window.visualViewport.height) ||
      window.innerHeight;
    document.documentElement.style.setProperty('--sim-h', h + 'px');
    scrollBottom();
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitViewport);
  }
  window.addEventListener('orientationchange', fitViewport);
  fitViewport();
})();
