import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const paidStates = new Set(["BUILDING", "VERIFYING", "READY", "BUILD_FAILED"]);
const requestRef = (db, id) => db.collection("apkForgeRequests").doc(id);
const fail = (status, code, message) => { const error = new Error(message); error.status = status; error.code = code; throw error; };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Forge credit checkout accepts POST requests only." });
  try {
    const user = await requireUser(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const forgeRequestId = String(body.forgeRequestId || "").trim();
    if (!REQUEST_ID_RE.test(forgeRequestId)) return json(res, 400, { code: "invalid_forge_request_id", message: "A valid Forge request ID is required." });
    const db = adminDb();
    const config = await getRuntimeProductConfig(db);
    const forgePricing = config.pricing.apkForge || {};
    if (forgePricing.enabled !== true) return json(res, 503, { code: "apk_forge_disabled", message: "APK Forge checkout is temporarily unavailable." });
    const creditCost = Number(forgePricing.creditCost);
    if (!Number.isInteger(creditCost) || creditCost < 1) return json(res, 503, { code: "invalid_credit_cost", message: "Forge credit pricing is not configured correctly." });

    const result = await db.runTransaction(async (tx) => {
      const ref = requestRef(db, forgeRequestId);
      const [requestSnap, userSnap] = await Promise.all([tx.get(ref), tx.get(db.collection("users").doc(user.uid))]);
      if (!requestSnap.exists) fail(404, "forge_request_not_found", "Forge request was not found.");
      const request = requestSnap.data() || {};
      if (request.uid !== user.uid) fail(403, "forge_request_forbidden", "Forge request does not belong to this account.");
      if (!request.previewAcceptedAt) fail(409, "forge_preview_not_accepted", "Review and accept the Forge preview before checkout.");
      if (paidStates.has(request.status) || request.paymentId) return { alreadyPaid: true, request };
      if (!["PREVIEW_ACCEPTED", "CREDIT_PENDING"].includes(request.status)) fail(409, "forge_request_not_payable", `Forge request is currently ${request.status}.`);
      if (request.creditCost !== undefined && Number(request.creditCost) !== creditCost) fail(409, "forge_credit_price_changed", "The Forge credit cost changed. Please start a new request.");
      const balance = Math.max(Number(userSnap.exists ? userSnap.data()?.credits || 0 : 0), 0);
      if (balance < creditCost) fail(402, "credits_required", `You need ${creditCost} credits for an APK Forge build. You currently have ${balance}.`);
      if (request.status !== "CREDIT_PENDING") tx.update(ref, { status: "CREDIT_PENDING", creditCost, equivalentInr: creditCost * 2, updatedAt: new Date() });
      return { alreadyPaid: false, request: { ...request, status: "CREDIT_PENDING", creditCost, equivalentInr: creditCost * 2 }, creditsAvailable: balance };
    });

    if (result.alreadyPaid) return json(res, 200, { ok: true, alreadyPaid: true, forgeRequestId, status: result.request.status, paymentMethod: "credits", creditCost: Number(result.request.creditCost || creditCost), creditsRemaining: null });
    return json(res, 200, { ok: true, forgeRequestId, checkoutType: "credits", paymentMethod: "credits", creditCost, equivalentInr: creditCost * 2, creditsRemaining: result.creditsAvailable });
  } catch (error) {
    console.error("APK Forge credit checkout preparation failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: error.code || "apk_forge_credit_checkout_failed", message: error.message || "Could not prepare Forge checkout." });
  }
}
