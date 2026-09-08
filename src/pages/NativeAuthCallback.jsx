import { useEffect, useState } from "react";
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithRedirect,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const PENDING_KEY = "promptstudio-native-google-state";
const ALLOWED_HOST = "prompt-studio-ai-forge-test.vercel.app";

export default function NativeAuthCallback() {
  const [message, setMessage] = useState("Opening secure Google sign-in…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (window.location.hostname !== ALLOWED_HOST) {
        setMessage("This sign-in callback is not available on this host.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const state = params.get("state");
      const nativeAuth = params.get("nativeAuth") === "1";
      if (!nativeAuth || !state) {
        setMessage("Invalid native sign-in request.");
        return;
      }

      try {
        const result = await getRedirectResult(auth);
        if (cancelled) return;

        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          const idToken = credential?.idToken;
          if (!idToken) throw new Error("Google returned no ID token.");

          sessionStorage.removeItem(PENDING_KEY);
          const callback = `${window.location.origin}/native-auth-callback#state=${encodeURIComponent(state)}&idToken=${encodeURIComponent(idToken)}`;
          window.location.replace(callback);
          return;
        }

        const pendingState = sessionStorage.getItem(PENDING_KEY);
        if (pendingState) {
          throw new Error("Google sign-in returned without a redirect result.");
        }

        sessionStorage.setItem(PENDING_KEY, state);
        setMessage("Waiting for Google…");
        await signInWithRedirect(auth, googleProvider);
      } catch (error) {
        sessionStorage.removeItem(PENDING_KEY);
        if (!cancelled) {
          const detail = error?.message || "Google sign-in could not be completed.";
          setMessage(`Google sign-in failed: ${detail}`);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#080b10", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <section style={{ width: "min(420px, 100%)", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 16 }}>PromptStudio AI</div>
        <div style={{ fontSize: 17, lineHeight: 1.5, opacity: 0.82 }}>{message}</div>
      </section>
    </main>
  );
}
