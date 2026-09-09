import { useEffect, useState } from "react";

const PENDING_KEY = "promptstudio-native-google-state";
const ALLOWED_HOST = "prompt-studio-ai-forge-test.vercel.app";
const NATIVE_SCHEME = "promptstudio";
const NATIVE_HOST = "native-auth-callback";

function redirectToNative(params, state) {
  const next = new URLSearchParams(params);
  next.set("nativeAuth", "1");
  next.set("state", state);
  window.location.replace(`${NATIVE_SCHEME}://${NATIVE_HOST}?${next.toString()}`);
}

export default function NativeAuthCallback() {
  const [message, setMessage] = useState("Returning to PromptStudio AI…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (window.location.hostname !== ALLOWED_HOST) {
        setMessage("This sign-in callback is not available on this host.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const storedState = sessionStorage.getItem(PENDING_KEY);
      const state = params.get("state") || storedState;
      const hasOAuthResult = params.has("code") || params.has("error");

      if (hasOAuthResult) {
        if (!state) {
          setMessage("Google sign-in returned without a native state.");
          return;
        }
        sessionStorage.removeItem(PENDING_KEY);
        redirectToNative(params, state);
        return;
      }

      if (!state) {
        setMessage("Invalid native sign-in request.");
        return;
      }

      try {
        sessionStorage.setItem(PENDING_KEY, state);
        setMessage("Waiting for Google…");
        const { auth, googleProvider } = await import("../firebase");
        const { signInWithRedirect } = await import("firebase/auth");
        if (cancelled) return;
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
