import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest } from "./_razorpay.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const PLAN_ENV = { monthly: "RAZORPAY_PRO_MONTHLY_PLAN_ID", annual: "RAZORPAY_PRO_ANNUAL_PLAN_ID" };

// Keep the subscription horizon safely inside Razorpay's UPI 30-year expiry limit.
// This preserves long-lived recurring Pro subscriptions without creating an
// expire_at timestamp that UPI rejects.
const SUBSCRIPTION_CYCLES = { monthly: 348, annual: 29 };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay is not configured yet." });
  try {
    const decoded = await requireUser(req); const db = adminDb(); const config = await getRuntimeProductConfig(db);
    const billing = req.body?.billing === "annual" ? "annual" : "monthly"; const planId = String(process.env[PLAN_ENV[billing]] || "").trim();
    if (!planId) return json(res, 503, { code: "subscription_plan_not_configured", message: `Razorpay ${billing} plan ID is not configured.` });
    const totalCount = SUBSCRIPTION_CYCLES[billing];
    const amountInr = billing === "annual" ? config.pricing.proAnnualInr : config.pricing.proMonthlyInr;
    const subscription = await razorpayRequest("/subscriptions", { method: "POST", body: JSON.stringify({ plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: true, notes: { uid: decoded.uid, type: "pro_subscription", billing } }) });
    await db.collection("paymentSubscriptions").doc(subscription.id).set({ uid: decoded.uid, billing, planId, amountInr, status: subscription.status || "created", razorpaySubscriptionId: subscription.id, createdAt: new Date() });
    return json(res, 200, { subscriptionId: subscription.id, keyId: process.env.RAZORPAY_KEY_ID, name: "PromptStudio AI", description: `PromptStudio Pro · ${billing === "annual" ? "Annual" : "Monthly"}` });
  } catch (error) { console.error("Razorpay subscription creation failed", { code: error?.code || "unknown", status: error?.status }); return json(res, error.status || 500, { code: "subscription_create_failed", message: error.message || "Could not start Pro checkout." }); }
}
