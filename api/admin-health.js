import { adminAuth, adminDb, json } from "./_firebaseAdmin.js";
import { requireFounderAdmin } from "./_adminSecurity.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "Method not allowed." });
  try {
    await requireFounderAdmin(req);
    const db = adminDb();
    adminAuth();
    const config = await getRuntimeProductConfig(db);
    const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    const plansConfigured = Boolean(process.env.RAZORPAY_PRO_MONTHLY_PLAN_ID && process.env.RAZORPAY_PRO_ANNUAL_PLAN_ID);
    const webhookConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
    return json(res, 200, {
      ok: true,
      checkedAt: new Date().toISOString(),
      firebaseAdmin: true,
      gemini: Boolean(process.env.GEMINI_API_KEY),
      razorpay: razorpayConfigured,
      razorpayPlans: plansConfigured,
      razorpayWebhook: webhookConfigured,
      paymentMode: config.monetization.paymentMode,
      plans: { free: config.plans.free, pro: config.plans.pro },
      creditPricing: config.pricing.creditPacks,
      runtimeConfig: Boolean((await db.collection("systemConfig").doc("product").get()).exists),
    });
  } catch (error) {
    console.error("Admin health check failed", { code: error?.code || "unknown" });
    return json(res, error?.status || 503, { ok: false, message: error?.message || "Health check failed." });
  }
}
