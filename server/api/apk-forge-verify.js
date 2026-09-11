import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest, verifyOrderSignature } from "./_razorpay.js";

const paidStates = new Set(["PAID", "PENDING_REVIEW", "APPROVED", "BUILDING", "VERIFYING", "READY"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Forge payment verification accepts POST requests only." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay is not configured." });
  try {
    const user = await requireUser(req); const body = req.body && typeof req.body === "object" ? req.body : {};
    const orderId = String(body.razorpay_order_id || body.orderId || "").trim(); const paymentId = String(body.razorpay_payment_id || body.paymentId || "").trim(); const signature = String(body.razorpay_signature || body.signature || "").trim();
    if (!orderId || !paymentId || !signature) return json(res, 400, { code: "incomplete_payment_response", message: "Incomplete payment response." });
    const db = adminDb(); const snap = await db.collection("apkForgeRequests").where("razorpayOrderId", "==", orderId).limit(1).get();
    if (snap.empty) return json(res, 404, { code: "forge_order_not_found", message: "Forge payment order was not found." });
    const ref = snap.docs[0].ref; const request = snap.docs[0].data() || {};
    if (request.uid !== user.uid) return json(res, 403, { code: "forge_order_forbidden", message: "Forge payment does not belong to this account." });
    if (!verifyOrderSignature({ orderId, paymentId, signature })) return json(res, 400, { code: "invalid_signature", message: "Payment verification failed." });
    const order = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}`);
    if (order.id !== orderId || order.currency !== "INR" || Number(order.amount) !== Number(request.amountPaise || Number(request.amountInr) * 100)) return json(res, 409, { code: "payment_amount_mismatch", message: "Payment amount does not match the Forge request." });
    if (order.status !== "paid") return json(res, 409, { code: "payment_not_captured", message: "Payment is not captured yet. Please wait a moment and retry." });
    const payments = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}/payments`); const payment = Array.isArray(payments?.items) ? payments.items.find((item) => item.id === paymentId) : null;
    if (!payment || payment.order_id !== orderId || payment.status !== "captured" || Number(payment.amount) !== Number(order.amount)) return json(res, 409, { code: "payment_not_captured", message: "The submitted payment is not a captured payment for this Forge order." });
    const result = await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(ref); if (!currentSnap.exists) throw Object.assign(new Error("Forge request was not found."), { status: 404 });
      const current = currentSnap.data() || {}; if (current.uid !== user.uid) throw Object.assign(new Error("Forge request does not belong to this account."), { status: 403 });
      if (paidStates.has(current.status)) return current;
      if (current.status !== "PAYMENT_PENDING") throw Object.assign(new Error(`Forge request is currently ${current.status}.`), { status: 409 });
      const ts = new Date(); tx.update(ref, { status: "PENDING_REVIEW", paymentId, paidAt: ts, paymentVerifiedAt: ts, razorpayOrderStatus: order.status, updatedAt: ts }); return { ...current, status: "PENDING_REVIEW", paymentId };
    });
    return json(res, 200, { ok: true, forgeRequestId: result.forgeRequestId, status: result.status, orderId, paymentId });
  } catch (error) { console.error("APK Forge payment verification failed", { code: error?.code || "unknown", status: error?.status }); return json(res, error.status || 500, { code: error.code || "apk_forge_payment_verification_failed", message: error.message || "Payment verification failed." }); }
}
