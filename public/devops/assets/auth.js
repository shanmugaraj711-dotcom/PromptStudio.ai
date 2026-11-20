/* auth.js — Firebase Auth for the DevOps Kit site.
   Email + password and Google sign-in. Plain words everywhere.
   The Firebase config below is public client config (the apiKey is
   not a secret). Loaded after the Firebase compat scripts. */
(function () {
  'use strict';
  if (!window.firebase) { console.error('Firebase scripts did not load.'); return; }

  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyB34-r9vGA1G-12YiHqt99PZ7AA8Ghzlmg",
    authDomain: "promptstudio-ai-d31b8.firebaseapp.com",
    projectId: "promptstudio-ai-d31b8",
    storageBucket: "promptstudio-ai-d31b8.firebasestorage.app",
    messagingSenderId: "768747699651",
    appId: "1:768747699651:web:015d825846e4a005f65176"
  };

  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db = (firebase.firestore ? firebase.firestore() : null);

  var currentUser = null;
  var listeners = [];
  var stateReady = false;

  function plainError(err) {
    var code = (err && err.code) || '';
    if (code === 'auth/email-already-in-use') return 'That email already has an account. Try signing in instead.';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'Wrong email or password. Try again.';
    if (code === 'auth/user-not-found') return 'No account with that email. Create one below.';
    if (code === 'auth/weak-password') return 'Use a password with at least 6 characters.';
    if (code === 'auth/invalid-email') return 'That email does not look right. Check it and try again.';
    if (code === 'auth/popup-closed-by-user') return 'The Google window closed before signing in. Try again.';
    if (code === 'auth/cancelled-popup-request') return 'The Google window closed. Try again.';
    if (code === 'auth/unauthorized-domain') return 'Google sign-in is not allowed on this preview address yet. Use email sign-in for now.';
    if (code === 'auth/too-many-requests') return 'Too many tries. Wait a bit, then try again.';
    if (code === 'auth/network-request-failed') return 'No internet right now. Check your connection and try again.';
    if (code === 'auth/popup-blocked') return 'Your browser blocked the Google window. Allow popups for this site and try again.';
    return (err && err.message) || 'Something went wrong. Try again.';
  }

  function shortEmail(email) {
    if (!email) return '';
    var at = email.indexOf('@');
    if (at <= 0) return email;
    var name = email.slice(0, at);
    return name.length > 14 ? name.slice(0, 12) + '…' : name;
  }

  /* Header slot: "Sign in" when logged out, name + "Sign out" when in. */
  function renderSlot() {
    var slot = document.getElementById('auth-slot');
    if (!slot) return;
    if (!currentUser) {
      slot.innerHTML = '';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'auth-btn';
      btn.textContent = 'Sign in';
      btn.addEventListener('click', openModal);
      slot.appendChild(btn);
      return;
    }
    slot.innerHTML = '';
    var chip = document.createElement('span');
    chip.className = 'auth-chip';
    chip.textContent = shortEmail(currentUser.email);
    chip.title = currentUser.email || '';
    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'auth-signout';
    out.textContent = 'Sign out';
    out.addEventListener('click', function () { signOut(); });
    slot.appendChild(chip);
    slot.appendChild(out);
  }

  /* First sign-in: create the profile row the site rules allow.
     Exact keys only: uid, name, email, photoURL, createdAt, lastLogin. */
  function ensureProfile(user) {
    if (!db || !user) return Promise.resolve();
    var ref = db.collection('users').doc(user.uid);
    return ref.get().then(function (snap) {
      if (snap.exists) {
        return ref.update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
      }
      var name = user.displayName || (user.email ? user.email.split('@')[0] : 'Learner');
      return ref.set({
        uid: user.uid,
        name: name,
        email: user.email || '',
        photoURL: user.photoURL || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    }).catch(function () {});
  }

  function notify() {
    renderSlot();
    listeners.forEach(function (fn) { try { fn(currentUser); } catch (e) {} });
  }

  auth.onAuthStateChanged(function (user) {
    currentUser = user || null;
    stateReady = true;
    if (user) ensureProfile(user).then(notify, notify);
    else notify();
  });

  /* ---- login modal ---- */
  function modal() { return document.getElementById('auth-modal'); }
  function showError(msg) {
    var el = document.getElementById('auth-error');
    if (el) { el.textContent = msg || ''; el.hidden = !msg; }
  }
  function setBusy(busy) {
    var m = modal();
    if (!m) return;
    m.querySelectorAll('button').forEach(function (b) { b.disabled = busy; });
  }
  function openModal(mode) {
    var m = modal();
    if (!m) return;
    showError('');
    setTab(mode === 'signup' ? 'signup' : 'signin');
    m.hidden = false;
    document.body.classList.add('modal-open');
    var email = document.getElementById('auth-email');
    if (email) email.focus();
  }
  function closeModal() {
    var m = modal();
    if (!m) return;
    m.hidden = true;
    document.body.classList.remove('modal-open');
    showError('');
  }
  function setTab(tab) {
    var m = modal();
    if (!m) return;
    var signin = tab === 'signin';
    var tIn = document.getElementById('auth-tab-signin');
    var tUp = document.getElementById('auth-tab-signup');
    if (tIn) tIn.classList.toggle('active', signin);
    if (tUp) tUp.classList.toggle('active', !signin);
    var submit = document.getElementById('auth-submit');
    if (submit) submit.textContent = signin ? 'Sign in' : 'Create account';
    var note = document.getElementById('auth-switch-note');
    if (note) note.textContent = signin ? 'No account yet? ' : 'Already have an account? ';
    var link = document.getElementById('auth-switch-link');
    if (link) link.textContent = signin ? 'Create one' : 'Sign in';
    m.setAttribute('data-tab', signin ? 'signin' : 'signup');
  }

  function readForm() {
    var email = document.getElementById('auth-email');
    var pass = document.getElementById('auth-password');
    return {
      email: (email && email.value || '').trim(),
      password: (pass && pass.value || '')
    };
  }
  function submitForm() {
    var f = readForm();
    if (!f.email || !f.password) { showError('Type your email and password.'); return; }
    var m = modal();
    var isSignup = m && m.getAttribute('data-tab') === 'signup';
    setBusy(true);
    showError('');
    var p = isSignup
      ? auth.createUserWithEmailAndPassword(f.email, f.password)
      : auth.signInWithEmailAndPassword(f.email, f.password);
    p.then(function () {
      setBusy(false);
      closeModal();
    }).catch(function (err) {
      setBusy(false);
      showError(plainError(err));
    });
  }
  function signInWithGoogle() {
    setBusy(true);
    showError('');
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then(function () {
      setBusy(false);
      closeModal();
    }).catch(function (err) {
      setBusy(false);
      showError(plainError(err));
    });
  }

  function signOut() {
    return auth.signOut();
  }
  function getIdToken() {
    if (!currentUser) return Promise.resolve(null);
    return currentUser.getIdToken(false);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var m = modal();
    if (m) {
      var close = document.getElementById('auth-close');
      if (close) close.addEventListener('click', closeModal);
      m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
      var tIn = document.getElementById('auth-tab-signin');
      var tUp = document.getElementById('auth-tab-signup');
      if (tIn) tIn.addEventListener('click', function () { setTab('signin'); });
      if (tUp) tUp.addEventListener('click', function () { setTab('signup'); });
      var link = document.getElementById('auth-switch-link');
      if (link) link.addEventListener('click', function () {
        setTab(m.getAttribute('data-tab') === 'signin' ? 'signup' : 'signin');
      });
      var form = document.getElementById('auth-form');
      if (form) form.addEventListener('submit', function (e) { e.preventDefault(); submitForm(); });
      var g = document.getElementById('auth-google');
      if (g) g.addEventListener('click', signInWithGoogle);
    }
    renderSlot();
  });

  window.DevOpsAuth = {
    user: function () { return currentUser; },
    ready: function () { return stateReady; },
    onAuth: function (fn) { listeners.push(fn); if (stateReady) { try { fn(currentUser); } catch (e) {} } },
    openModal: openModal,
    closeModal: closeModal,
    signOut: signOut,
    getIdToken: getIdToken
  };
})();
