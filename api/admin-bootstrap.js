import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const getCredential = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = JSON.parse(raw);
    return cert({ projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: parsed.private_key.replace(/\\n/g, "\n") });
  }
  return cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n") });
};
const getAuthAdmin = () => getAuth(getApps().length ? getApps()[0] : initializeApp({ credential: getCredential() }));
const json = (res, status, payload) => { res.status(status).setHeader("Content-Type", "application/json").end(JSON.stringify(payload)); };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  const configuredAdminEmail = String(process.env.PROMPTSTUDIO_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!configuredAdminEmail) return json(res, 503, { message: "Founder admin email is not configured on the server." });
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json(res, 401, { message: "Authentication required." });

  try {
    const auth = getAuthAdmin();
    const decoded = await auth.verifyIdToken(idToken);
    if (!decoded.email || decoded.email.toLowerCase() !== configuredAdminEmail || decoded.email_verified !== true) return json(res, 403, { message: "This account is not eligible for founder admin access." });
    const user = await auth.getUser(decoded.uid);
    const currentClaims = user.customClaims || {};
    await auth.setCustomUserClaims(decoded.uid, { ...currentClaims, admin: true });
    return json(res, 200, { ok: true, message: "Founder admin access enabled. Refresh your session to continue." });
  } catch (error) {
    console.error("Admin bootstrap failed", { code: error?.code || "unknown" });
    return json(res, 500, { message: "Could not enable founder admin access." });
  }
}
