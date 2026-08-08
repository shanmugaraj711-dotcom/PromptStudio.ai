import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider 
} from "firebase/auth";
import { 
  getFirestore 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Basic runtime check to help developers catch missing environment variables
const requiredKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const missing = requiredKeys.filter((k) => !import.meta.env[k]);

if (missing.length) {
  // Friendly warning (do not log secret values)
  // Developers should provide these via a local `.env` (not committed) or CI env vars.
  // Example: create a `.env` file from `.env.example` and fill in values.
  // Note: If Firebase is not configured the app will not be able to authenticate.
  // For security, if these keys were accidentally committed, rotate them in the
  // Firebase Console and remove them from the repository.
  // eslint-disable-next-line no-console
  console.warn(
    "Missing Firebase environment variables:",
    missing.join(", "),
    "— see .env.example and README.md"
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

export default app;
