import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase";
import "./nativeDiagnostic";

const createOrUpdateUserDoc = async (user, name = null) => {
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  const displayName = name || user.displayName || user.email.split("@")[0];
  const photoURL =
    user.photoURL ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0D8ABC&color=fff`;

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      name: displayName,
      email: user.email,
      photoURL,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp()
    });
  } else {
    await updateDoc(userRef, {
      lastLogin: serverTimestamp()
    });
  }
};

export const registerWithEmail = async (email, password, name) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, {
      displayName: name
    });
    await createOrUpdateUserDoc(userCredential.user, name);
    return userCredential.user;
  } catch (error) {
    console.error("REGISTER FIREBASE ERROR:", error);
    throw error;
  }
};

export const loginWithEmail = async (email, password) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  await createOrUpdateUserDoc(userCredential.user);
  return userCredential.user;
};

const nativeGoogleCallbacks = {};

window.__promptStudioNativeGoogleCallbacks = nativeGoogleCallbacks;
window.__promptStudioNativeGoogleResult = (rawPayload) => {
  try {
    const payload = JSON.parse(rawPayload);
    const callback = nativeGoogleCallbacks[payload.requestId];

    if (!callback) {
      window.__promptStudioNativeGoogleDiagnostic?.(
        `checkpoint 6 failed: no matching requestId (${payload.requestId || "missing"})`
      );
      console.error("Native Google bridge requestId mismatch:", payload.requestId);
      return;
    }

    window.__promptStudioNativeGoogleDiagnostic?.("checkpoint 6 passed: matching requestId received");
    delete nativeGoogleCallbacks[payload.requestId];

    if (payload.error) {
      callback.reject(new Error(payload.error));
    } else if (payload.idToken) {
      callback.resolve(payload.idToken);
    } else {
      callback.reject(new Error("Google did not return an ID token."));
    }
  } catch (error) {
    window.__promptStudioNativeGoogleDiagnostic?.(
      `checkpoint 6 failed: bridge payload error — ${error?.message || "invalid payload"}`
    );
    console.error("Native Google bridge response error:", error);
  }
};

const loginWithNativeGoogle = async () => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.__promptStudioNativeGoogleDiagnostic?.(`checkpoint 5: native sign-in requested (${requestId})`);

  const idToken = await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      delete nativeGoogleCallbacks[requestId];
      window.__promptStudioNativeGoogleDiagnostic?.("checkpoint 6 failed: native bridge timed out");
      reject(new Error("Native Google sign-in timed out."));
    }, 120000);

    nativeGoogleCallbacks[requestId] = {
      resolve: (token) => {
        window.clearTimeout(timeout);
        window.__promptStudioNativeGoogleDiagnostic?.("checkpoint 7: native ID token received");
        resolve(token);
      },
      reject: (error) => {
        window.clearTimeout(timeout);
        window.__promptStudioNativeGoogleDiagnostic?.(
          `checkpoint 7 failed: native sign-in rejected — ${error?.message || "unknown error"}`
        );
        reject(error);
      }
    };

    window.PromptStudioNativeGoogle.signIn(requestId);
  });

  window.__promptStudioNativeGoogleDiagnostic?.("checkpoint 7: exchanging ID token with Firebase");
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  window.__promptStudioNativeGoogleDiagnostic?.("checkpoint 7 passed: Firebase sign-in completed");
  return result;
};

export const loginWithGoogle = async () => {
  try {
    const userCredential = window.PromptStudioNativeGoogle?.isAvailable?.()
      ? await loginWithNativeGoogle()
      : await signInWithPopup(auth, googleProvider);

    window.__promptStudioNativeGoogleDiagnostic?.("checkpoint 8: updating Firestore user profile");
    await createOrUpdateUserDoc(userCredential.user);
    window.__promptStudioNativeGoogleDiagnostic?.("checkpoint 8 passed: Firestore user profile updated");
    return userCredential.user;
  } catch (error) {
    window.__promptStudioNativeGoogleDiagnostic?.(
      `checkpoint failed: ${error?.code || error?.name || "error"} — ${error?.message || "Google sign-in failed."}`
    );
    console.error("GOOGLE FIREBASE ERROR:", error);
    throw error;
  }
};

export const logout = async () => {
  await signOut(auth);
};

export const resetPassword = async (email) => {
  await sendPasswordResetEmail(auth, email);
};

export const getUserProfile = async (uid) => {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data();
  }
  return null;
};
