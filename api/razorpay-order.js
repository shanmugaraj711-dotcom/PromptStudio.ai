import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest } from "./_razorpay.js";
import PRODUCT_CONFIG from "../src/config/product.config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay test mode is not configured yet." });
  try {
    const decoded = await requireUser(req);
    const packSize = PRODUCT_CONFIG.pricing.creditPackSize;
    const amountInr = PRODUCT_CONFIG.pricing.creditPackInr;
    const receipt = `ps_${Date.now()}_${decoded.uid.slice(0, 8)}`.slice(0, 40);
    const order = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ amount: amountInr * 100, currency: "INR", receipt, notes: { uid: decoded.uid, type: "credit_topup", credits: String(packSize) }, partial_payment: false }) });
    await adminDb().collection("paymentOrders").doc(order.id).set({ uid: decoded.uid, type: "credit_topup", credits: packSize, amountInr, status: "created", razorpayOrderId: order.id, createdAt: new Date() });
    return json(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("Razorpay order creation failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: "payment_order_failed", message: error.message || "Could not start checkout." });
  }
}
