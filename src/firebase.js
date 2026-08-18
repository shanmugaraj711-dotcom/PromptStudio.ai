import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider
} from "firebase/auth";
import {
  getFirestore
} from "firebase/firestore";

// Firebase web configuration is intentionally public client configuration.
// Prefer Vercel environment variables, with the project's public Firebase
// configuration as a safe fallback so the client cannot fail to initialize
// when a Vite environment variable is missing from a preview build.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyB34-r9vGA1G-12YiHqt99PZ7AA8Ghzlmg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "promptstudio-ai-d31b8.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "promptstudio-ai-d31b8",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "promptstudio-ai-d31b8.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "768747699651",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:768747699651:web:c0ef3810e2fa53bbf65176"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
