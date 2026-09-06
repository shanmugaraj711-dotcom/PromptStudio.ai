import crypto from "node:crypto";
import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest } from "./_razorpay.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const now = () => new Date();
const requestRef = (db, id) => db.collection("studioBuildPayments").doc(id);
const receiptFor = (id) => `studio_${id}`.slice(0, 40);
const fail = (status, code, message) => { const error = new Error(message); error.status = status; error.code = code; throw error; };

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

    const forgeRequestId = String(req.body?.studioBuildRequestId || "").trim();
    const studioBuildRequestId = REQUEST_ID_RE.test(forgeRequestId) ? forgeRequestId : `studio_${crypto.randomUUID().replace(/-/g, "")}`;
    const ref = requestRef(db, studioBuildRequestId);
    const existing = await ref.get();
    if (existing.exists) {
      const current = existing.data() || {};
      if (current.uid !== user.uid) return json(res, 403, { code: "studio_build_forbidden", message: "Studio build request does not belong to this account." });
      if (current.status === "PAID") return json(res, 200, { ok: true, alreadyPaid: true, studioBuildRequestId, status: current.status, razorpayOrderId: current.razorpayOrderId || null });
      if (current.razorpayOrderId) return json(res, 200, { ok: true, studioBuildRequestId, orderId: current.razorpayOrderId, amount: current.amountPaise, currency: current.currency, keyId: process.env.RAZORPAY_KEY_ID });
    }

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const current = snap.data() || {};
        if (current.uid !== user.uid) fail(403, "studio_build_forbidden", "Studio build request does not belong to this account.");
        if (current.razorpayOrderId || current.status === "PAID") return;
      }
      tx.set(ref, { studioBuildRequestId, uid: user.uid, status: "ORDER_CREATING", amountInr, amountPaise: amountInr * 100, currency, createdAt: snap.exists ? (snap.data()?.createdAt || now()) : now(), updatedAt: now() }, { merge: true });
    });

    const receipt = receiptFor(studioBuildRequestId);
    const order = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ amount: amountInr * 100, currency, receipt, notes: { studioBuildRequestId, uid: user.uid, type: "studio_build", priceSource: "PRODUCT_CONFIG.pricing.studioBuild.buildPriceInr" }, partial_payment: false }) });
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data()?.uid !== user.uid) fail(404, "studio_build_not_found", "Studio build payment request was not found.");
      const current = snap.data() || {};
      if (current.razorpayOrderId && current.razorpayOrderId !== order.id) fail(409, "studio_order_conflict", "A different Razorpay order is already linked to this Studio build request.");
      tx.update(ref, { status: "PAYMENT_PENDING", razorpayOrderId: order.id, razorpayReceipt: order.receipt || receipt, razorpayOrderCreatedAt: now(), amountInr, amountPaise: amountInr * 100, currency, updatedAt: now() });
    });
    console.info("Studio build payment order created", { studioBuildRequestId, uid: user.uid, amountInr, currency, razorpayOrderId: order.id });
    return json(res, 200, { ok: true, studioBuildRequestId, orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, amountInr });
  } catch (error) {
    console.error("Studio build Razorpay order creation failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: error.code || "studio_build_order_failed", message: error.message || "Could not start Studio checkout." });
  }
}
