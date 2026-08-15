import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const getCredential = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = JSON.parse(raw);
    return cert({ projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: parsed.private_key.replace(/\\n/g, "\n") });
  }
  return cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  });
};

const getApp = () => getApps().length ? getApps()[0] : initializeApp({ credential: getCredential() });
const json = (res, status, payload) => { res.status(status).setHeader("Content-Type", "application/json").end(JSON.stringify(payload)); };

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "Method not allowed." });
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json(res, 401, { message: "Authentication required." });

  try {
    const auth = getAuth(getApp());
    const decoded = await auth.verifyIdToken(idToken);
    if (decoded.admin !== true) return json(res, 403, { message: "Admin access required." });
    return json(res, 200, {
      ok: true,
      firebase: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin health check failed", { code: error?.code || "unknown" });
    return json(res, 503, { ok: false, firebase: false, geminiConfigured: Boolean(process.env.GEMINI_API_KEY), message: "Health check could not verify the backend." });
  }
}
