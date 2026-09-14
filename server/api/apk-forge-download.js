import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { downloadForgeArtifactApk } from "./_forgeStorage.js";
const fail = (status, code, message) => { const error = new Error(message); error.status = status; error.code = code; throw error; };
export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { code: "method_not_allowed", message: "Forge APK download accepts GET requests only." });
  try {
    const decoded = await requireUser(req); const forgeRequestId = String(req.query?.forgeRequestId || req.query?.id || "").trim(); if (!forgeRequestId) fail(400, "forge_request_id_required", "Forge request ID is required.");
    const db = adminDb(); const ref = db.collection("apkForgeRequests").doc(forgeRequestId); const snapshot = await ref.get(); if (!snapshot.exists) fail(404, "forge_request_not_found", "Forge request was not found.");
    const request = snapshot.data() || {}; if (String(request.uid || "") !== decoded.uid) fail(403, "forge_download_forbidden", "You do not own this Forge build."); if (request.status !== "READY") fail(409, "forge_apk_not_ready", "This APK is not ready for download yet."); if (!request.artifactId) fail(409, "forge_apk_artifact_missing", "This Forge build has no downloadable artifact.");
    const apk = await downloadForgeArtifactApk(request.artifactId); const safeId = forgeRequestId.replace(/[^A-Za-z0-9._-]/g, "-"); res.statusCode = 200; res.setHeader("Content-Type", "application/vnd.android.package-archive"); res.setHeader("Content-Length", String(apk.length)); res.setHeader("Content-Disposition", `attachment; filename="promptstudio-forge-${safeId}.apk"`); res.setHeader("Cache-Control", "private, no-store, max-age=0"); return res.end(apk);
  } catch (error) { console.error("APK Forge download failed", { code: error?.code || "unknown", status: error?.status }); return json(res, error.status || 500, { code: error.code || "apk_forge_download_failed", message: error.message || "Unable to download the APK." }); }
}
