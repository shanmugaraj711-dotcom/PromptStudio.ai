import { adminAuth, adminDb, json } from "./_firebaseAdmin.js";
import { getRuntimeProductConfig } from "./_productConfig.js";

const bearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
};

const safeClientConfig = (config) => ({
  defaultPlan: config.defaultPlan,
  plans: config.plans,
  pricing: config.pricing,
  creditCosts: config.creditCosts,
  features: config.features,
});

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "Use GET for product configuration." });
  try {
    const token = bearerToken(req);
    if (!token) return json(res, 401, { message: "Authentication required." });
    await adminAuth().verifyIdToken(token);
    const config = await getRuntimeProductConfig(adminDb());
    res.setHeader?.("Cache-Control", "no-store, max-age=0");
    return json(res, 200, { config: safeClientConfig(config) });
  } catch (error) {
    console.error("Product config endpoint failed", { code: error?.code || "unknown" });
    return json(res, 401, { message: "Unable to load current product configuration." });
  }
}
