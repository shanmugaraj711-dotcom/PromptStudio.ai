import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
const serializeDate = (value) => value?.toDate?.()?.toISOString?.() || value || null;
const view = (doc) => { const data = doc.data() || {}; return { forgeRequestId: doc.id, appName: data.appName || "PromptStudio AI", status: data.status || "UNKNOWN", amountInr: data.amountInr ?? null, currency: data.currency || "INR", createdAt: serializeDate(data.createdAt), paidAt: serializeDate(data.paidAt), buildStartedAt: serializeDate(data.buildStartedAt), buildFinishedAt: serializeDate(data.buildFinishedAt), verifiedAt: serializeDate(data.verifiedAt), buildId: data.buildId || null, apkReady: data.status === "READY" && Boolean(data.apkStoragePath || data.artifactId) }; };
export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { code: "method_not_allowed", message: "Forge build history accepts GET requests only." });
  try { const decoded = await requireUser(req); const snapshot = await adminDb().collection("apkForgeRequests").where("uid", "==", decoded.uid).limit(100).get(); const builds = snapshot.docs.map(view).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); return json(res, 200, { ok: true, builds }); }
  catch (error) { console.error("APK Forge history failed", { code: error?.code || "unknown", status: error?.status }); return json(res, error.status || 500, { code: error.code || "apk_forge_history_failed", message: error.message || "Unable to load Forge builds." }); }
}
