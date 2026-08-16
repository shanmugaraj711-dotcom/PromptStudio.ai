import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest } from "./_razorpay.js";
import PRODUCT_CONFIG from "../src/config/product.config.js";

const getPack = (packId) => {
  const packs = PRODUCT_CONFIG.pricing.creditPacks;
  return packs[packId] || packs.creator;
};

const getCreditPurchase = (body) => {
  if (body?.customAmountInr !== undefined && body?.customAmountInr !== null) {
    const amount = Number(body.customAmountInr);
    const { minInr, maxInr, inrPerCredit } = PRODUCT_CONFIG.pricing.customCredits;
    if (!Number.isInteger(amount) || amount < minInr || amount > maxInr) {
      throw Object.assign(new Error(`Choose a custom amount between ₹${minInr} and ₹${maxInr}.`), { status: 400 });
    }
    const credits = Math.floor(amount / inrPerCredit);
    if (credits < 1) throw Object.assign(new Error("The custom amount is too small for credits."), { status: 400 });
    return { id: `custom_${amount}`, name: "Custom Creator Credits", priceInr: amount, credits, custom: true };
  }
  const pack = getPack(body?.packId);
  return { ...pack, custom: false };
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay test mode is not configured yet." });
  try {
    const decoded = await requireUser(req);
    const purchase = getCreditPurchase(req.body);
    const receipt = `ps_${Date.now()}_${decoded.uid.slice(0, 8)}`.slice(0, 40);
    const order = await razorpayRequest("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: purchase.priceInr * 100,
        currency: "INR",
        receipt,
        notes: { uid: decoded.uid, type: "credit_topup", packId: purchase.id, credits: String(purchase.credits), custom: String(purchase.custom) },
        partial_payment: false,
      }),
    });
    await adminDb().collection("paymentOrders").doc(order.id).set({
      uid: decoded.uid,
      type: "credit_topup",
      packId: purchase.id,
      credits: purchase.credits,
      amountInr: purchase.priceInr,
      custom: purchase.custom,
      status: "created",
      razorpayOrderId: order.id,
      createdAt: new Date(),
    });
    return json(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, packId: purchase.id, credits: purchase.credits, amountInr: purchase.priceInr });
  } catch (error) {
    console.error("Razorpay order creation failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: "payment_order_failed", message: error.message || "Could not start checkout." });
  }
}
