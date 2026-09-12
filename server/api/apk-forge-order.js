import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest } from "./_razorpay.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const ORDER_TTL_MS = 30 * 60 * 1000;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const fail = (status, code, message) => { const error = new Error(message); error.status = status; error.code = code; throw error; };
const now = () => new Date();
const requestRef = (db, id) => db.collection("apkForgeRequests").doc(id);
const receiptFor = (forgeRequestId) => `forge_${forgeRequestId}`.slice(0, 40);
const reserveOrderCreation = async ({ db, forgeRequestId, uid, amountInr, currency }) => {
  const ref = requestRef(db, forgeRequestId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) fail(404, "forge_request_not_found", "Forge request was not found.");
    const request = snap.data() || {};
    if (request.uid !== uid) fail(403, "forge_request_forbidden", "Forge request does not belong to this account.");
    if (!request.previewAcceptedAt && ["PAYMENT_REQUIRED", "ORDER_CREATING", "PAYMENT_PENDING"].includes(request.status)) fail(409, "forge_preview_not_accepted", "Review and accept the Forge preview before starting payment.");
    if (!["PAYMENT_REQUIRED", "ORDER_CREATING", "PAYMENT_PENDING"].includes(request.status)) {
      if (["PAID", "PENDING_REVIEW", "APPROVED", "BUILDING", "VERIFYING", "READY"].includes(request.status)) return { action: "already_paid", request };
      fail(409, "forge_request_not_payable", `Forge request is currently ${request.status}.`);
    }
    if (request.amountInr !== undefined && Number(request.amountInr) !== amountInr) fail(409, "forge_price_changed", "The Forge price for this request no longer matches the current server configuration. Please start a new request.");
    if (request.currency && request.currency !== currency) fail(409, "forge_currency_changed", "Forge payment currency no longer matches the request.");
    if (request.razorpayOrderId) return { action: "existing_order", request };
    const creatingAt = request.orderCreationStartedAt?.toDate?.()?.getTime?.() || 0;
    if (request.status === "ORDER_CREATING" && creatingAt && Date.now() - creatingAt < ORDER_TTL_MS) return { action: "in_progress", request };
    tx.update(ref, { status: "ORDER_CREATING", orderCreationStartedAt: now(), orderCreationAttempts: Number(request.orderCreationAttempts || 0) + 1, amountInr, currency, updatedAt: now() });
    return { action: "create", request: { ...request, status: "ORDER_CREATING" } };
  });
};
const attachOrder = async ({ db, forgeRequestId, uid, order, amountInr, currency }) => {
  const ref = requestRef(db, forgeRequestId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists || snap.data().uid !== uid) fail(404, "forge_request_not_found", "Forge request was not found.");
    const request = snap.data() || {};
    if (request.razorpayOrderId && request.razorpayOrderId !== order.id) fail(409, "forge_order_conflict", "A different Razorpay order is already linked to this Forge request.");
    tx.update(ref, { status: "PAYMENT_PENDING", razorpayOrderId: order.id, razorpayReceipt: order.receipt || receiptFor(forgeRequestId), razorpayOrderCreatedAt: now(), orderCreationCompletedAt: now(), amountInr, amountPaise: amountInr * 100, currency, updatedAt: now() });
  });
};
const recoverByReceipt = async ({ db, forgeRequestId, uid, amountInr, currency }) => {
  const receipt = receiptFor(forgeRequestId);
  const result = await razorpayRequest(`/orders?receipt=${encodeURIComponent(receipt)}&count=10`);
  const matches = Array.isArray(result?.items) ? result.items.filter((item) => item.receipt === receipt) : [];
  const valid = matches.find((item) => Number(item.amount) === amountInr * 100 && item.currency === currency && item.notes?.forgeRequestId === forgeRequestId && item.notes?.uid === uid);
  if (!valid) return null;
  await attachOrder({ db, forgeRequestId, uid, order: valid, amountInr, currency }); return valid;
};
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Forge order creation accepts POST requests only." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay is not configured yet." });
  try {
    const user = await requireUser(req); const body = req.body && typeof req.body === "object" ? req.body : {};
    const forgeRequestId = String(body.forgeRequestId || "").trim();
    if (!REQUEST_ID_RE.test(forgeRequestId)) return json(res, 400, { code: "invalid_forge_request_id", message: "A valid Forge request ID is required." });
    const db = adminDb(); const config = await getRuntimeProductConfig(db); const forgePricing = config.pricing.apkForge || {};
    if (forgePricing.enabled !== true) return json(res, 503, { code: "apk_forge_disabled", message: "APK Forge payments are temporarily unavailable." });
    const amountInr = Number(forgePricing.buildPriceInr); const currency = String(forgePricing.currency || "INR").toUpperCase();
    if (!Number.isInteger(amountInr) || amountInr < 1 || currency !== "INR") return json(res, 503, { code: "invalid_forge_pricing", message: "APK Forge pricing is not configured correctly." });
    const reservation = await reserveOrderCreation({ db, forgeRequestId, uid: user.uid, amountInr, currency });
    if (reservation.action === "already_paid") return json(res, 200, { ok: true, alreadyPaid: true, forgeRequestId, status: reservation.request.status, razorpayOrderId: reservation.request.razorpayOrderId || null });
    if (reservation.action === "existing_order") return json(res, 200, { ok: true, forgeRequestId, orderId: reservation.request.razorpayOrderId, amount: Number(reservation.request.amountPaise || amountInr * 100), currency, keyId: process.env.RAZORPAY_KEY_ID });
    if (reservation.action === "in_progress") return json(res, 409, { code: "order_creation_in_progress", message: "This payment order is already being created. Please retry shortly." });
    const recovered = await recoverByReceipt({ db, forgeRequestId, uid: user.uid, amountInr, currency });
    if (recovered) return json(res, 200, { ok: true, forgeRequestId, orderId: recovered.id, amount: recovered.amount, currency: recovered.currency, keyId: process.env.RAZORPAY_KEY_ID, recovered: true });
    const receipt = receiptFor(forgeRequestId);
    const order = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ amount: amountInr * 100, currency, receipt, notes: { forgeRequestId, uid: user.uid, type: "apk_forge_build", priceSource: "PRODUCT_CONFIG.pricing.apkForge.buildPriceInr" }, partial_payment: false }) });
    await attachOrder({ db, forgeRequestId, uid: user.uid, order, amountInr, currency });
    return json(res, 200, { ok: true, forgeRequestId, orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) { console.error("APK Forge Razorpay order creation failed", { code: error?.code || "unknown", status: error?.status }); return json(res, error.status || 500, { code: error.code || "apk_forge_order_failed", message: error.message || "Could not start Forge checkout." }); }
}
