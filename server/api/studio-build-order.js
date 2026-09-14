import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest } from "./_razorpay.js";
import { getRuntimeProductConfig } from "./_productConfig.js";
import { reserveAcceptedCheckout, fail } from "../studio/acceptedRevision.js";

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const paidStates = new Set(["PAID", "BUILDING", "READY"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Studio build orders accept POST requests only." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay is not configured yet." });
  try {
    const user = await requireUser(req);
    const db = adminDb();
    const config = await getRuntimeProductConfig(db);
    const pricing = config.pricing.studioBuild || {};
    if (pricing.enabled !== true) return json(res, 503, { code: "studio_build_disabled", message: "Studio build payments are temporarily unavailable." });
    const amountInr = Number(pricing.buildPriceInr);
    const currency = String(pricing.currency || "INR").toUpperCase();
    if (!Number.isInteger(amountInr) || amountInr < 1 || currency !== "INR") return json(res, 503, { code: "invalid_studio_pricing", message: "Studio build pricing is not configured correctly." });
    const studioBuildRequestId = String(req.body?.studioBuildRequestId || "").trim();
    if (!REQUEST_ID_RE.test(studioBuildRequestId)) return json(res, 400, { code: "invalid_studio_build_request", message: "A valid Studio preview request is required before checkout." });

    // Commit the exact approved source and its payment binding BEFORE contacting Razorpay.
    const { payment, createOrder } = await reserveAcceptedCheckout({
      db, uid: user.uid, studioJobId: studioBuildRequestId, files: req.body?.acceptedFiles,
      pricing: { amountInr, amountPaise: amountInr * 100, currency },
    });
    const identity = { studioBuildRequestId, acceptedRevisionId: payment.acceptedRevisionId };
    if (paidStates.has(payment.status)) return json(res, 200, { ok: true, ...identity, alreadyPaid: true, status: payment.status });
    if (payment.razorpayOrderId) return json(res, 200, { ok: true, ...identity, orderId: payment.razorpayOrderId, amount: payment.amountPaise, currency: payment.currency, keyId: process.env.RAZORPAY_KEY_ID });
    // Do not issue another order after a timeout with an unknown provider outcome.
    if (!createOrder) fail(409, "studio_order_creating", "Your checkout is being prepared. If this persists, contact support before paying again.");
    const receipt = `studio_${studioBuildRequestId}`.slice(0, 40);
    const order = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({
      amount: payment.amountPaise, currency: payment.currency, receipt,
      notes: { ...identity, studioJobId: studioBuildRequestId, uid: user.uid, type: "studio_build", priceSource: "PRODUCT_CONFIG.pricing.studioBuild.buildPriceInr" },
      partial_payment: false,
    }) });
    const ref = db.collection("studioBuildPayments").doc(studioBuildRequestId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? snap.data() : {};
      if (current.uid !== user.uid || current.acceptedRevisionId !== payment.acceptedRevisionId || current.status !== "ORDER_CREATING") fail(409, "studio_order_conflict", "The Studio checkout changed while preparing payment.");
      tx.update(ref, { status: "PAYMENT_PENDING", razorpayOrderId: order.id, razorpayReceipt: order.receipt || receipt, razorpayOrderCreatedAt: new Date(), updatedAt: new Date() });
    });
    return json(res, 200, { ok: true, ...identity, orderId: order.id, amount: payment.amountPaise, currency: payment.currency, keyId: process.env.RAZORPAY_KEY_ID, amountInr: payment.amountInr });
  } catch (error) {
    console.error("Studio build Razorpay order creation failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: error.code || "studio_build_order_failed", message: error.message || "Could not start Studio checkout." });
  }
}
