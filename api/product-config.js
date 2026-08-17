import { adminDb, json } from "./_firebaseAdmin.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "Method not allowed." });
  try {
    const config = await getRuntimeProductConfig(adminDb());
    return json(res, 200, { plans: config.plans, pricing: config.pricing, creditCosts: config.creditCosts, features: config.features });
  } catch (error) {
    console.error("Product config read failed", { code: error?.code || "unknown" });
    return json(res, 503, { message: "Product configuration is temporarily unavailable." });
  }
}
