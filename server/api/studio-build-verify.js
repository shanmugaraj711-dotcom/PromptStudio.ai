import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { finalizeCreditCheckout } from "../studio/paymentVerification.js";

const fail = (status, code, message) => { const error = new Error(message); error.status = status; error.code = code; throw error; };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Studio credit checkout confirmation accepts POST requests only." });
  try {
    const user = await requireUser(req);
    const studioBuildRequestId = String(req.body?.studioBuildRequestId || "").trim();
    if (!studioBuildRequestId) return json(res, 400, { code: "invalid_studio_build_request", message: "A Studio preview request is required." });

    const db = adminDb();
    const ref = db.collection("studioBuildPayments").doc(studioBuildRequestId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return json(res, 404, { code: "studio_build_not_found", message: "Studio build payment request was not found." });
    const request = snapshot.data() || {};
    if (request.uid !== user.uid) return json(res, 403, { code: "studio_build_forbidden", message: "Studio build payment does not belong to this account." });
    const revisionId = request.acceptedRevisionId;
    if (!/^[a-f0-9]{64}$/.test(revisionId || "")) return json(res, 409, { code: "accepted_revision_missing", message: "The approved Studio revision is missing. Please regenerate the preview." });
    const revisionSnap = await db.collection("studioAcceptedRevisions").doc(revisionId).get();
    if (!revisionSnap.exists) return json(res, 409, { code: "accepted_revision_missing", message: "The accepted Studio revision is no longer available." });

    const result = await finalizeCreditCheckout({ db, ref, uid: user.uid, revision: revisionSnap.data() });
    return json(res, 200, {
      ok: true,
      studioBuildRequestId,
      acceptedRevisionId: result.acceptedRevisionId,
      status: result.status,
      paymentMethod: "credits",
      creditCost: Number(result.creditCost || 0),
      creditsRemaining: Number(result.creditsRemaining ?? 0),
      equivalentInr: Number(result.equivalentInr || Number(result.creditCost || 0) * 2),
      paidAt: result.paidAt?.toDate?.()?.toISOString?.() || result.paidAt?.toISOString?.() || new Date().toISOString(),
    });
  } catch (error) {
    console.error("Studio credit checkout confirmation failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: error.code || "studio_credit_checkout_failed", message: error.message || "Studio credit checkout failed." });
  }
}
