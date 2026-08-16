import { adminAuth, adminDb, json, requireUser } from "./_firebaseAdmin.js";
import PRODUCT_CONFIG from "../src/config/product.config.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "Method not allowed." });
  try {
    const decoded = await requireUser(req);
    if (decoded.admin !== true) return json(res, 403, { message: "Admin access required." });

    adminAuth();
    adminDb();

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
      paymentMode: PRODUCT_CONFIG.monetization.paymentMode,
      plans: {
        free: PRODUCT_CONFIG.plans.free,
        pro: PRODUCT_CONFIG.plans.pro,
      },
      creditPricing: PRODUCT_CONFIG.pricing.creditPacks,
    });
  } catch (error) {
    console.error("Admin health check failed", { code: error?.code || "unknown" });
    return json(res, error?.status || 503, { ok: false, message: error?.message || "Health check failed." });
  }
}
