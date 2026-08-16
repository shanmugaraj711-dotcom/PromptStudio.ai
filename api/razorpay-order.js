import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest } from "./_razorpay.js";
import PRODUCT_CONFIG from "../src/config/product.config.js";

const getPack = (packId) => {
  const packs = PRODUCT_CONFIG.pricing.creditPacks;
  return packs[packId] || packs.creator;
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay test mode is not configured yet." });
  try {
    const decoded = await requireUser(req);
    const pack = getPack(req.body?.packId);
    const receipt = `ps_${Date.now()}_${decoded.uid.slice(0, 8)}`.slice(0, 40);
    const order = await razorpayRequest("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: pack.priceInr * 100,
        currency: "INR",
        receipt,
        notes: { uid: decoded.uid, type: "credit_topup", packId: pack.id, credits: String(pack.credits) },
        partial_payment: false,
      }),
    });
    await adminDb().collection("paymentOrders").doc(order.id).set({
      uid: decoded.uid,
      type: "credit_topup",
      packId: pack.id,
      credits: pack.credits,
      amountInr: pack.priceInr,
      status: "created",
      razorpayOrderId: order.id,
      createdAt: new Date(),
    });
    return json(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, packId: pack.id, credits: pack.credits });
  } catch (error) {
    console.error("Razorpay order creation failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: "payment_order_failed", message: error.message || "Could not start checkout." });
  }
}
