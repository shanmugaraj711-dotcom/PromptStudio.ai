import { adminDb, json, requireUser } from "./_firebaseAdmin.js";

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const ACCEPTABLE = new Set(["PAYMENT_REQUIRED"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Forge preview acceptance accepts POST requests only." });
  try {
    const user = await requireUser(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const forgeRequestId = String(body.forgeRequestId || "").trim();
    if (!REQUEST_ID_RE.test(forgeRequestId)) return json(res, 400, { code: "invalid_forge_request_id", message: "A valid Forge request ID is required." });
    const db = adminDb();
    const ref = db.collection("apkForgeRequests").doc(forgeRequestId);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: [404, "forge_request_not_found", "Forge request was not found."] };
      const request = snap.data() || {};
      if (request.uid !== user.uid) return { error: [403, "forge_request_forbidden", "Forge request does not belong to this account."] };
      if (request.previewAcceptedAt) return { forgeRequestId, status: request.status, alreadyAccepted: true, acceptedAt: request.previewAcceptedAt };
      if (!ACCEPTABLE.has(request.status)) return { error: [409, "forge_preview_not_accepting", `This Forge request is currently ${request.status}. Generate a new preview before purchasing a different version.`] };
      const acceptedAt = new Date();
      tx.update(ref, { status: "PREVIEW_ACCEPTED", previewAcceptedAt: acceptedAt, previewAcceptedBy: user.uid, updatedAt: acceptedAt });
      return { forgeRequestId, status: "PREVIEW_ACCEPTED", alreadyAccepted: false, acceptedAt };
    });
    if (result.error) return json(res, result.error[0], { code: result.error[1], message: result.error[2] });
    return json(res, 200, { ok: true, ...result, acceptedAt: result.acceptedAt?.toISOString?.() || null });
  } catch (error) {
    console.error("APK Forge preview acceptance failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: error.code || "apk_forge_accept_failed", message: error.message || "Could not accept the Forge preview." });
  }
}
