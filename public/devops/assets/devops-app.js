/* devops-app.js — DevOps Kit login, payment (Razorpay + UPI), progress
   and resume. Runs on every page of the site.
   Rules: prices come from the server, never from this file. The secret
   key never appears here. Lessons and sims are locked on the page until
   the server says the phase is owned. */
(function () {
  'use strict';

  var LESSON_TITLES = {
    "lesson-0": "Lesson 0 — Before the Terminal",
    "error-decoder": "Error Decoder",
    "p1-start": "Start Here — Phase 1", "p1-kafka": "Kafka Lab",
    "p1-postgresql": "PostgreSQL Lab", "p1-redis": "Redis Lab",
    "p1-object-store": "Object Store Lab", "p1-load-balancer": "Load Balancer Lab",
    "p1-end-to-end": "End-to-End Lab", "p2-start": "Start Here — Phase 2",
    "p2-zero-cost": "Zero-Cost Lab", "p2-kubernetes": "Kubernetes Lab",
    "p2-break-fix": "Break-and-Fix Labs", "p2-cheat-sheets": "Cheat Sheets",
    "p2-interview": "Interview Pack", "p2-portfolio": "Portfolio Projects",
    "p2-resume": "Resume Bullets", "p2-best-sites": "Best Sites"
  };
  var PHASE1_LESSONS = ["p1-start", "p1-kafka", "p1-postgresql", "p1-redis", "p1-object-store", "p1-load-balancer", "p1-end-to-end"];
  var PHASE2_LESSONS = ["p2-start", "p2-zero-cost", "p2-kubernetes", "p2-break-fix", "p2-cheat-sheets", "p2-interview", "p2-portfolio", "p2-resume", "p2-best-sites"];
  var FREE_SIMS = { kafka: true, 'lesson-0': true, 'error-decoder': true };
  var FREE_LESSONS = { "lesson-0": true, "error-decoder": true };
  var PHASE_NAMES = { phase1: "Phase 1", phase2: "Phase 2" };
  var PHASE_PRICES = { phase1: "₹399", phase2: "₹799" };

  var state = null; /* { entitlements, progress } from /api/devops-state */
  var stateLoaded = false;
  var currentUser = null;
  /* While either is true, the page must not show signed-out UI:
     no "Sign in" button, no locked buy buttons, no lock screen text.
     authPending = Firebase has not said who is signed in yet.
     statePending = signed in, but ownership/progress not loaded yet. */
  var authPending = true;
  var statePending = false;
  function isPending() { return authPending || statePending; }
  function updatePending() {
    document.body.classList.toggle('app-pending', isPending());
  }

  function page() { return (document.body && document.body.getAttribute('data-page')) || ''; }
  function pagePhase() { return (document.body && document.body.getAttribute('data-phase')) || ''; }
  function pageLesson() { return (document.body && document.body.getAttribute('data-lesson')) || ''; }
  function pageSim() { return (document.body && document.body.getAttribute('data-sim')) || ''; }
  function owns(phase) { return !!(state && state.entitlements && state.entitlements[phase]); }
  function isLocked(phase) { return !owns(phase); }

  /* ---- toast ---- */
  var toastEl = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.hidden = true; }, 5000);
  }

  /* ---- API ---- */
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    function run(token) {
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch(path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var err = new Error(data.message || ('Request failed (' + res.status + ')'));
            err.status = res.status;
            err.code = data.code;
            throw err;
          }
          return data;
        });
      });
    }
    if (opts.auth === false) return run(null);
    if (!window.DevOpsAuth) return Promise.reject(new Error('Sign-in did not load.'));
    return window.DevOpsAuth.getIdToken().then(function (token) {
      if (!token) throw new Error('Sign in first.');
      return run(token);
    });
  }

  function refreshState() {
    if (!currentUser) { state = null; stateLoaded = false; statePending = false; applyPage(); return Promise.resolve(null); }
    statePending = true;
    updatePending();
    return api('/api/devops-state', { method: 'GET' }).then(function (data) {
      state = data;
      stateLoaded = true;
      statePending = false;
      applyPage();
      return data;
    }).catch(function (err) {
      /* Keep the last good state: a failed load must never flash the
         page back to locked for someone who owns the phase. */
      statePending = false;
      applyPage();
      throw err;
    });
  }

  function saveProgress(body) {
    if (!currentUser) return Promise.resolve(null);
    return api('/api/devops-state', { method: 'POST', body: body }).then(function (data) {
      if (data && data.progress && state) state.progress = data.progress;
      return data;
    }).catch(function () { return null; });
  }

  /* ---- gating ---- */
  function applyPage() {
    updatePending();
    var p = page();
    if (p === 'landing') applyLanding();
    else if (p === 'lesson') applyLesson();
    else if (p === 'sim') applySim();
    /* pay buttons everywhere: show the right label for the state.
       Buttons inside a lock screen are managed by applyLesson/applySim
       (sign-in first when logged out), so skip them here.
       While the sign-in state is unknown, buttons stay visible but
       unclickable — never a buy button for an owner, never a dead
       button for a buyer. */
    document.querySelectorAll('.pay-btn').forEach(function (btn) {
      if (btn.closest('#lock-screen')) return;
      var ph = btn.getAttribute('data-phase');
      if (owns(ph)) { btn.hidden = true; }
      else { btn.hidden = false; btn.disabled = isPending(); }
    });
    document.querySelectorAll('.owned-download').forEach(function (btn) {
      var ph = btn.getAttribute('data-phase');
      btn.hidden = !owns(ph);
    });
    document.querySelectorAll('.owned-note').forEach(function (el) {
      var ph = el.getAttribute('data-phase');
      el.hidden = !owns(ph);
    });
  }

  function applyLanding() {
    /* curriculum rows: lock / done / continue marks */
    document.querySelectorAll('.lesson-row').forEach(function (row) {
      var slug = row.getAttribute('data-lesson');
      var ph = row.getAttribute('data-phase');
      var main = row.querySelector('.lr-main');
      if (!main || !slug || !ph) return;
      var old = row.querySelector('.row-flag');
      if (old) old.remove();
      var prog = state && state.progress && state.progress.lessons ? state.progress.lessons[slug] : null;
      var flag = document.createElement('span');
      flag.className = 'row-flag';
      if (prog && prog.completed) {
        flag.textContent = ' ✓ Done';
        flag.classList.add('done');
        row.classList.add('row-done');
      } else if (state && state.progress && state.progress.lastLesson === slug) {
        flag.textContent = ' ← Continue here';
        flag.classList.add('continue');
        row.classList.add('row-continue');
      } else if (!FREE_LESSONS[slug] && isLocked(ph) && !isPending()) {
        flag.textContent = ' 🔒 ' + PHASE_PRICES[ph];
        flag.classList.add('locked');
        row.classList.add('row-locked');
      } else {
        return;
      }
      main.appendChild(flag);
    });
    /* sim cards: gated sims show the lock (never while still loading) */
    document.querySelectorAll('.simcard').forEach(function (card) {
      var sim = card.getAttribute('data-sim');
      var ph = card.getAttribute('data-phase');
      var btn = card.querySelector('.btn');
      if (!sim || !btn) return;
      if (FREE_SIMS[sim]) return;
      if (isPending()) return;
      if (isLocked(ph)) {
        btn.textContent = '🔒 ' + PHASE_NAMES[ph] + ' — ' + PHASE_PRICES[ph];
      } else {
        btn.textContent = 'Launch Terminal →';
      }
    });
    /* continue banner */
    var banner = document.getElementById('continue-banner');
    if (banner) {
      var last = state && state.progress ? state.progress.lastLesson : null;
      var lessons = state && state.progress ? state.progress.lessons : {};
      var paidList = PHASE1_LESSONS.concat(PHASE2_LESSONS);
      var done = paidList.filter(function (k) { return lessons[k] && lessons[k].completed; }).length;
      if (currentUser && last && LESSON_TITLES[last]) {
        banner.hidden = false;
        banner.innerHTML = '';
        var b = document.createElement('b');
        b.textContent = 'Welcome back — ';
        var a = document.createElement('a');
        a.href = '/devops/lessons/' + last + '.html';
        a.textContent = 'Continue: ' + LESSON_TITLES[last];
        var s = document.createElement('span');
        s.textContent = '  ·  ' + done + ' of 16 lessons done';
        banner.appendChild(b);
        banner.appendChild(a);
        banner.appendChild(s);
      } else if (currentUser) {
        banner.hidden = false;
        banner.innerHTML = '';
        var b2 = document.createElement('b');
        b2.textContent = 'You are signed in. ';
        var a2 = document.createElement('a');
        a2.href = '/devops/lessons/p1-start.html';
        a2.textContent = 'Start Lesson 1';
        banner.appendChild(b2);
        banner.appendChild(a2);
      } else {
        banner.hidden = true;
      }
    }
    /* sticky bar: buy button becomes "Continue" when owned.
       While the sign-in state is unknown, show neither. */
    var stickyBuy = document.getElementById('sticky-buy');
    var stickyGo = document.getElementById('sticky-continue');
    if (stickyBuy && stickyGo) {
      if (isPending()) {
        stickyBuy.hidden = true;
        stickyGo.hidden = true;
      } else if (owns('phase1')) {
        stickyBuy.hidden = true;
        var last2 = state && state.progress ? state.progress.lastLesson : null;
        stickyGo.hidden = false;
        stickyGo.href = last2 ? '/devops/lessons/' + last2 + '.html' : '/devops/lessons/p1-start.html';
        stickyGo.textContent = 'Continue learning →';
      } else {
        stickyBuy.hidden = false;
        stickyGo.hidden = true;
      }
    }
  }

  function applyLesson() {
    var slug = pageLesson();
    var ph = pagePhase();
    var locked = !FREE_LESSONS[slug] && isLocked(ph);
    var pending = isPending();
    document.body.classList.toggle('locked', locked);
    var lock = document.getElementById('lock-screen');
    if (lock) {
      /* While the sign-in state is unknown AND the phase looks locked,
         show "Checking your sign-in…" — never the locked message or a
         buy button. An owned phase never shows a lock screen, even
         while a state load is still in flight. */
      var loadingEl = lock.querySelector('.lock-loading');
      if (pending && locked) {
        lock.hidden = false;
        lock.classList.add('loading');
        if (loadingEl) loadingEl.hidden = false;
      } else {
        lock.classList.remove('loading');
        if (loadingEl) loadingEl.hidden = true;
        lock.hidden = !locked;
        var signinBtn = lock.querySelector('.lock-signin');
        var buyBtn = lock.querySelector('.pay-btn');
        if (signinBtn) signinBtn.hidden = !!currentUser;
        if (buyBtn) buyBtn.hidden = !currentUser;
      }
    }
    /* progress bar: real completion when signed in, scroll when not */
    var fill = document.getElementById('lesson-progress-fill');
    if (fill && currentUser && stateLoaded) {
      var list = ph === 'phase1' ? PHASE1_LESSONS : (ph === 'phase2' ? PHASE2_LESSONS : [slug]);
      var lessons = state.progress.lessons || {};
      var done = list.filter(function (s) { return lessons[s] && lessons[s].completed; }).length;
      window.__DEVOPS_COMPLETION_BAR__ = true;
      fill.style.width = Math.round((done / list.length) * 100) + '%';
    } else if (fill) {
      window.__DEVOPS_COMPLETION_BAR__ = false;
    }
    /* mark-as-done button */
    var doneBtn = document.getElementById('btn-mark-done');
    if (doneBtn) {
      var prog = state && state.progress && state.progress.lessons ? state.progress.lessons[slug] : null;
      if (!currentUser || locked) {
        doneBtn.hidden = true;
      } else if (prog && prog.completed) {
        doneBtn.hidden = false;
        doneBtn.disabled = true;
        doneBtn.textContent = '✓ Done';
      } else {
        doneBtn.hidden = false;
        doneBtn.disabled = false;
        doneBtn.textContent = 'Mark this lesson as done';
      }
    }
    /* record the visit once, when signed in and unlocked */
    if (currentUser && !locked && slug && !applyLesson._recorded) {
      applyLesson._recorded = true;
      saveProgress({ lesson: slug });
    }
  }

  function applySim() {
    var sim = pageSim();
    var ph = pagePhase();
    var locked = !FREE_SIMS[sim] && isLocked(ph);
    var pending = isPending();
    document.body.classList.toggle('locked', locked);
    /* Belt-and-braces lock: hide the sim content itself with inline
       styles, not only through the body.locked CSS rule. A locked
       page has been seen rendering the step card with an empty white
       space where the terminal should be, so the lock must not
       depend on one stylesheet rule taking effect. Only elements
       this block hid are restored, so sim.js keeps owning the
       free-play banner and the step card in free play. */
    var simBits = [
      document.querySelector('.sim-topbar'),
      document.querySelector('.sim-about'),
      document.getElementById('step-card'),
      document.getElementById('free-banner'),
      document.getElementById('term')
    ];
    for (var i = 0; i < simBits.length; i++) {
      var bit = simBits[i];
      if (!bit) continue;
      if (locked) {
        if (bit.style.display !== 'none') bit.setAttribute('data-lock-hidden', '1');
        bit.style.display = 'none';
      } else if (bit.getAttribute('data-lock-hidden')) {
        bit.removeAttribute('data-lock-hidden');
        bit.style.display = '';
      }
    }
    var lock = document.getElementById('lock-screen');
    if (lock) {
      /* While the sign-in state is unknown AND the sim looks locked,
         show "Checking your sign-in…" — never the locked message or a
         buy button. An owned phase never shows a lock screen, even
         while a state load is still in flight. */
      var loadingEl = lock.querySelector('.lock-loading');
      if (pending && locked) {
        lock.hidden = false;
        lock.classList.add('loading');
        if (loadingEl) loadingEl.hidden = false;
      } else {
        lock.classList.remove('loading');
        if (loadingEl) loadingEl.hidden = true;
        lock.hidden = !locked;
        var signinBtn = lock.querySelector('.lock-signin');
        var buyBtn = lock.querySelector('.pay-btn');
        if (signinBtn) signinBtn.hidden = !!currentUser;
        if (buyBtn) buyBtn.hidden = !currentUser;
      }
    }
    /* resume note: show where they stopped */
    var note = document.getElementById('sim-resume-note');
    if (note) {
      var sp = state && state.progress && state.progress.sims ? state.progress.sims[sim] : null;
      if (!locked && currentUser && sp && sp.step > 1 && !sp.completed) {
        note.hidden = false;
        note.textContent = 'Last time you reached step ' + sp.step + '. The terminal starts fresh — use Skip to jump back, or run the steps again.';
      } else if (!locked && currentUser && sp && sp.completed) {
        note.hidden = false;
        note.textContent = 'You finished this simulation before. Run it again for practice, or use Skip all for free play.';
      } else {
        note.hidden = true;
      }
    }
  }

  /* ---- payment ---- */
  function pay(phase) {
    if (!window.DevOpsAuth) { toast('Sign-in did not load. Check your connection and refresh.'); return; }
    if (!currentUser) {
      toast('Sign in first, then buy.');
      window.DevOpsAuth.openModal('signin');
      return;
    }
    if (typeof Razorpay === 'undefined') {
      toast('Payment window did not load. Check your connection and try again.');
      return;
    }
    var btns = document.querySelectorAll('.pay-btn[data-phase="' + phase + '"]');
    btns.forEach(function (b) { b.disabled = true; });
    toast('Starting payment…');
    api('/api/devops-order', { method: 'POST', body: { phase: phase } }).then(function (data) {
      btns.forEach(function (b) { b.disabled = false; });
      var user = window.DevOpsAuth.user() || {};
      var rzp = new Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'PromptStudio — DevOps Kit',
        description: phase === 'phase1' ? 'Phase 1: The Data Tier' : 'Phase 2: The Rest of DevOps',
        order_id: data.orderId,
        prefill: { name: user.displayName || '', email: user.email || '' },
        theme: { color: '#0b5fff' },
        method: { upi: true, card: true, netbanking: true, wallet: true, emi: false },
        config: {
          display: {
            blocks: {
              upi: { name: 'UPI', instruments: [{ method: 'upi' }] },
              card: { name: 'Card', instruments: [{ method: 'card' }] },
              netbanking: { name: 'Netbanking', instruments: [{ method: 'netbanking' }] },
              wallet: { name: 'Wallets', instruments: [{ method: 'wallet' }] }
            },
            sequence: ['block.upi', 'block.card', 'block.netbanking', 'block.wallet'],
            preferences: { show_default_blocks: true }
          }
        },
        modal: {
          ondismiss: function () {
            toast('Payment not done. No money was taken. Try again when ready.');
          }
        },
        handler: function (resp) { verifyPayment(resp, phase); }
      });
      rzp.on('payment.failed', function (resp) {
        var why = (resp && resp.error && resp.error.description) || 'Try again.';
        toast('Payment failed — no money was taken. ' + why);
      });
      rzp.open();
    }).catch(function (err) {
      btns.forEach(function (b) { b.disabled = false; });
      if (err && err.code === 'already_owned') {
        toast('You already own this phase.');
        refreshState();
      } else {
        toast((err && err.message) || 'Could not start payment. Try again.');
      }
    });
  }

  /* Re-fetch ownership until the phase shows as owned (or retries run
     out). Covers the settle delay between "payment done" and the
     entitlement being readable, without ever asking for a reload. */
  function refreshStateWithRetry(phase) {
    var tries = 0;
    function one() {
      tries += 1;
      return refreshState().then(function () {
        if (phase && !owns(phase) && tries < 4) {
          return new Promise(function (r) { setTimeout(r, 1500); }).then(one);
        }
      }).catch(function (err) {
        if (tries < 3) {
          return new Promise(function (r) { setTimeout(r, 1500); }).then(one);
        }
        throw err;
      });
    }
    return one();
  }

  function verifyPayment(resp, phase) {
    toast('Checking your payment…');
    var attempts = 0;
    function attempt() {
      attempts += 1;
      api('/api/devops-verify', {
        method: 'POST',
        body: {
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_signature: resp.razorpay_signature
        }
      }).then(function (data) {
        var donePhase = data.phase || phase;
        /* Unlock on the page at once — then confirm it from the
           server. No reload, no sign-in again, for the unlock to show. */
        if (!state) state = { entitlements: {}, progress: { lessons: {}, lastLesson: null, sims: {} } };
        state.entitlements = state.entitlements || {};
        state.entitlements[donePhase] = true;
        stateLoaded = true;
        applyPage();
        return refreshStateWithRetry(donePhase).then(function () {
          toast('Payment done — ' + PHASE_NAMES[donePhase] + ' is yours. Enjoy learning.');
        });
      }).catch(function (err) {
        /* The payment can land a moment before Razorpay reports the
           order as paid. Retry the check instead of giving up. */
        if (err && err.code === 'payment_not_captured' && attempts < 5) {
          toast('Payment done — waiting for it to settle…');
          setTimeout(attempt, 2000);
          return;
        }
        toast('Payment went through but we could not unlock it yet. ' + ((err && err.message) || 'Try refreshing the page.'));
      });
    }
    attempt();
  }

  /* ---- download ---- */
  function downloadKit(phase) {
    if (!window.DevOpsAuth) { toast('Sign-in did not load. Check your connection and refresh.'); return; }
    if (!currentUser) {
      toast('Sign in first, then download.');
      window.DevOpsAuth.openModal('signin');
      return;
    }
    toast('Getting your kit…');
    window.DevOpsAuth.getIdToken().then(function (token) {
      if (!token) throw new Error('Sign in first.');
      var n = phase === 'phase1' ? 1 : 2;
      return fetch('/api/devops-download?phase=' + n, { headers: { Authorization: 'Bearer ' + token } });
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(data.message || ('Download failed (' + res.status + ')'));
        });
      }
      return res.blob();
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = phase === 'phase1' ? 'devops-kit-phase1-v4.zip' : 'devops-kit-phase2-v4.zip';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Download started.');
    }).catch(function (err) {
      toast((err && err.message) || 'Download failed. Try again.');
    });
  }

  /* ---- wiring ---- */
  function wire() {
    document.addEventListener('click', function (e) {
      var payBtn = e.target.closest ? e.target.closest('.pay-btn') : null;
      if (payBtn && !payBtn.disabled) { pay(payBtn.getAttribute('data-phase')); return; }
      var dlBtn = e.target.closest ? e.target.closest('.owned-download') : null;
      if (dlBtn) { downloadKit(dlBtn.getAttribute('data-phase')); return; }
      var signinBtn = e.target.closest ? e.target.closest('.lock-signin') : null;
      if (signinBtn && window.DevOpsAuth) { window.DevOpsAuth.openModal('signin'); return; }
    });
    var doneBtn = document.getElementById('btn-mark-done');
    if (doneBtn) {
      doneBtn.addEventListener('click', function () {
        var slug = pageLesson();
        if (!slug) return;
        doneBtn.disabled = true;
        saveProgress({ lesson: slug, completed: true }).then(function () {
          doneBtn.textContent = '✓ Done';
          applyLesson();
        });
      });
    }
    /* sim step recording: watch the step count the engine updates */
    var stepCount = document.getElementById('step-count');
    if (stepCount && page() === 'sim') {
      var sim = pageSim();
      var lastStep = 0;
      var totalSteps = 0;
      var saveStep = function () {
        var t = stepCount.textContent || '';
        var m = /Step (\d+) of (\d+)/.exec(t);
        if (m) {
          var n = parseInt(m[1], 10);
          totalSteps = parseInt(m[2], 10);
          if (n > lastStep) { lastStep = n; saveProgress({ sim: sim, step: n }); }
        } else if (t.indexOf('Guided steps done') === 0) {
          if (totalSteps > 0 && lastStep < totalSteps) {
            lastStep = totalSteps;
            saveProgress({ sim: sim, step: totalSteps, completed: true });
          }
        }
      };
      if ('MutationObserver' in window) {
        var obs = new MutationObserver(saveStep);
        obs.observe(stepCount, { childList: true, characterData: true, subtree: true });
      }
      saveStep();
    }
  }

  function boot() {
    wire();
    applyPage();
    if (window.DevOpsAuth) {
      /* If sign-in state never resolves (scripts blocked, storage
         off), do not leave the page in "checking" forever: after
         20 seconds, fall back to the signed-out view. */
      setTimeout(function () {
        if (authPending) { authPending = false; applyPage(); }
      }, 20000);
      window.DevOpsAuth.onAuth(function (user) {
        currentUser = user || null;
        authPending = false;
        applyLesson._recorded = false;
        refreshState().catch(function () {});
      });
    } else {
      /* sign-in scripts failed: keep the page locked-safe, pay asks to retry */
      authPending = false;
      applyPage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.DevOpsApp = {
    refreshState: refreshState,
    pay: pay,
    downloadKit: downloadKit,
    state: function () { return state; }
  };
})();
