import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest, verifyOrderSignature } from "./_razorpay.js";

import { assertRevisionBinding } from "../studio/acceptedRevision.js";

import { enqueueDelivery } from "../studio/deliveryQueue.js";

const paidStates = new Set(["PAID", "BUILDING", "READY"]);
const fail = (status, code, message) => { const error = new Error(message); error.status = status; error.code = code; throw error; };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Studio payment verification accepts POST requests only." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay is not configured." });
  try {
    const user = await requireUser(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const orderId = String(body.razorpay_order_id || body.orderId || "").trim();
    const paymentId = String(body.razorpay_payment_id || body.paymentId || "").trim();
    const signature = String(body.razorpay_signature || body.signature || "").trim();
    const studioBuildRequestId = String(body.studioBuildRequestId || "").trim();
    if (!orderId || !paymentId || !signature || !studioBuildRequestId) return json(res, 400, { code: "incomplete_payment_response", message: "Incomplete Studio payment response." });

    const db = adminDb();
    const ref = db.collection("studioBuildPayments").doc(studioBuildRequestId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return json(res, 404, { code: "studio_build_not_found", message: "Studio build payment request was not found." });
    const request = snapshot.data() || {};
    if (request.uid !== user.uid) return json(res, 403, { code: "studio_build_forbidden", message: "Studio build payment does not belong to this account." });
    const revisionId = request.acceptedRevisionId;
    if (!/^[a-f0-9]{64}$/.test(revisionId || "")) return json(res, 409, { code: "accepted_revision_missing", message: "This checkout predates saved previews. Please contact support; do not pay again." });
    const revisionSnap = await db.collection("studioAcceptedRevisions").doc(revisionId).get();
    assertRevisionBinding(request, revisionSnap.exists ? revisionSnap.data() : null, user.uid);
    if (request.razorpayOrderId !== orderId) return json(res, 409, { code: "studio_order_mismatch", message: "The submitted Razorpay order does not match this Studio build request." });
    if (!verifyOrderSignature({ orderId, paymentId, signature })) return json(res, 400, { code: "invalid_signature", message: "Studio payment verification failed." });

    const order = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}`);
    if (order.id !== orderId || order.currency !== request.currency || Number(order.amount) !== Number(request.amountPaise)) return json(res, 409, { code: "payment_amount_mismatch", message: "Payment amount or currency does not match the Studio build request." });
    if (order.status !== "paid") return json(res, 409, { code: "payment_not_captured", message: "Payment is not captured yet. Please wait a moment and retry." });

    const payments = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}/payments`);
    const payment = Array.isArray(payments?.items) ? payments.items.find((item) => item.id === paymentId) : null;
    if (!payment || payment.order_id !== orderId || payment.status !== "captured" || Number(payment.amount) !== Number(order.amount) || payment.currency !== order.currency) return json(res, 409, { code: "payment_not_captured", message: "The submitted payment is not a captured payment for this Studio order." });

    const result = await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(ref);
      if (!currentSnap.exists) fail(404, "studio_build_not_found", "Studio build payment request was not found.");
      const current = currentSnap.data() || {};
      if (current.uid !== user.uid) fail(403, "studio_build_forbidden", "Studio build payment does not belong to this account.");
      assertRevisionBinding(current, revisionSnap.data(), user.uid);
      if (current.razorpayOrderId !== orderId) fail(409, "studio_order_mismatch", "The checkout order changed during verification.");
      if (!paidStates.has(current.status) && current.status !== "PAYMENT_PENDING") fail(409, "studio_payment_state_invalid", "Studio payment is not ready for delivery.");
      await enqueueDelivery(tx, db, current, revisionSnap.data());
      if (paidStates.has(current.status)) return current;
      if (current.status !== "PAYMENT_PENDING") fail(409, "studio_payment_state_invalid", `Studio build request is currently ${current.status}.`);
      tx.update(ref, { status: "PAID", paymentId, paidAt: new Date(), paymentVerifiedAt: new Date(), razorpayOrderStatus: order.status, razorpayPaymentStatus: payment.status, updatedAt: new Date() });
      return { ...current, status: "PAID", paymentId };
    });

    console.info("Studio build payment verified", { studioBuildRequestId, uid: user.uid, orderId, paymentId, amountInr: request.amountInr });
    return json(res, 200, { ok: true, studioBuildRequestId, acceptedRevisionId: result.acceptedRevisionId, status: result.status, orderId, paymentId, amountInr: request.amountInr, paidAt: result.paidAt?.toDate?.()?.toISOString?.() || new Date().toISOString() });
  } catch (error) {
    console.error("Studio build payment verification failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: error.code || "studio_payment_verification_failed", message: error.message || "Studio payment verification failed." });
  }
}
