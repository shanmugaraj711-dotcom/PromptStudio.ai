import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest } from "./_razorpay.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const getPack = (config, packId) => { const packs = config.pricing.creditPacks; return packs[packId] || packs.creator; };
const getCreditPurchase = (body, config) => {
  if (body?.customAmountInr !== undefined && body?.customAmountInr !== null) {
    const amount = Number(body.customAmountInr); const { minInr, maxInr, inrPerCredit } = config.pricing.customCredits;
    if (!Number.isInteger(amount) || amount < minInr || amount > maxInr) throw Object.assign(new Error(`Choose a custom amount between ₹${minInr} and ₹${maxInr}.`), { status: 400 });
    const credits = Math.floor(amount / inrPerCredit); if (credits < 1) throw Object.assign(new Error("The custom amount is too small for credits."), { status: 400 });
    return { id: `custom_${amount}`, name: "Custom Creator Credits", priceInr: amount, credits, custom: true };
  }
  const pack = getPack(config, body?.packId); return { ...pack, custom: false };
};

const getFounderDiscount = (profile) => {
  const percent = Number(profile?.founderDiscountPercent || 0);
  const until = profile?.founderDiscountUntil ? new Date(profile.founderDiscountUntil) : null;
  if (!Number.isInteger(percent) || percent <= 0 || percent > 90) return 0;
  if (until && !Number.isNaN(until.getTime()) && until.getTime() <= Date.now()) return 0;
  return percent;
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay is not configured yet." });
  try {
    const decoded = await requireUser(req); const db = adminDb(); const config = await getRuntimeProductConfig(db); const purchase = getCreditPurchase(req.body, config);
    const userSnap = await db.collection("users").doc(decoded.uid).get();
    const profile = userSnap.exists ? userSnap.data() : {};
    const discountPercent = getFounderDiscount(profile);
    const originalAmountInr = Number(purchase.priceInr);
    const discountInr = Math.floor(originalAmountInr * discountPercent / 100);
    const amountInr = originalAmountInr - discountInr;
    if (!Number.isInteger(amountInr) || amountInr < 1) return json(res, 400, { message: "This founder discount makes the purchase amount invalid. Use a credit grant or trial instead." });
    const receipt = `ps_${Date.now()}_${decoded.uid.slice(0, 8)}`.slice(0, 40);
    const order = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ amount: amountInr * 100, currency: "INR", receipt, notes: { uid: decoded.uid, type: "credit_topup", packId: purchase.id, credits: String(purchase.credits), custom: String(purchase.custom), founderDiscountPercent: String(discountPercent) }, partial_payment: false }) });
    await db.collection("paymentOrders").doc(order.id).set({ uid: decoded.uid, type: "credit_topup", packId: purchase.id, credits: purchase.credits, amountInr, originalAmountInr, discountInr, founderDiscountPercent: discountPercent, custom: purchase.custom, status: "created", razorpayOrderId: order.id, createdAt: new Date() });
    return json(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, packId: purchase.id, credits: purchase.credits, amountInr, originalAmountInr, discountInr, founderDiscountPercent: discountPercent });
  } catch (error) { console.error("Razorpay order creation failed", { code: error?.code || "unknown", status: error?.status }); return json(res, error.status || 500, { code: "payment_order_failed", message: error.message || "Could not start checkout." }); }
}
