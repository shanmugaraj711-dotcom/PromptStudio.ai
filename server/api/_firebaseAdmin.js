import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const parseServiceAccount = (raw) => {
  if (!raw) return null;

  let parsed = raw;
  for (let attempt = 0; attempt < 2 && typeof parsed === "string"; attempt += 1) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") return null;

  const projectId = typeof parsed.project_id === "string" ? parsed.project_id.trim() : "";
  const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
  const privateKey = typeof parsed.private_key === "string" ? parsed.private_key.replace(/\\n/g, "\n").trim() : "";

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
};

const getCredential = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const serviceAccount = parseServiceAccount(raw);

  if (serviceAccount) return cert(serviceAccount);

  const projectId = String(process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  const error = new Error(
    "Firebase server credentials are not configured correctly. Provide a service-account JSON containing project_id, client_email, and private_key, or provide FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
  );
  error.status = 503;
  error.code = "server_configuration_error";
  throw error;
};

export const getAdminApp = () => getApps().length ? getApps()[0] : initializeApp({ credential: getCredential() });
export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());

export const requireUser = async (req) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) { const error = new Error("Authentication required."); error.status = 401; throw error; }
  const decoded = await adminAuth().verifyIdToken(token);
  if (decoded.admin === true) return decoded;
  const profile = await adminDb().collection("users").doc(decoded.uid).get();
  if (profile.exists && profile.data()?.suspended === true) { const error = new Error("This account is suspended. Please contact PromptStudio support."); error.status = 403; throw error; }
  return decoded;
};

export const json = (res, status, payload) => { res.status(status).setHeader("Content-Type", "application/json").end(JSON.stringify(payload)); };
