import { adminDb, json } from "./_firebaseAdmin.js";
import { requireFounderAdmin } from "./_adminSecurity.js";
import { readDailyStats } from "./_publicTelemetry.js";

const utcStartOfToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const checkGemini = async () => {
  const key = String(process.env.GEMINI_API_KEY || "").trim();
  if (!key) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const checkPublicEndpoint = async (req, stats) => {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "promptstudioai.in").split(",")[0].trim();
  const proto = String(req.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim();
  const origin = `${proto === "http" ? "http" : "https"}://${host}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${origin}/api/v1/optimize`, { method: "GET", signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return false;
    const errorAt = stats.lastErrorAt ? Date.parse(stats.lastErrorAt) : 0;
    const successAt = stats.lastSuccessAt ? Date.parse(stats.lastSuccessAt) : 0;
    if (errorAt && errorAt > successAt && Date.now() - errorAt < 15 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return json(res, 405, { message: "Method not allowed." });

  try {
    await requireFounderAdmin(req);
    const db = adminDb();
    const day = new Date().toISOString().slice(0, 10);
    const since = utcStartOfToday();
    const stats = await readDailyStats(day);
    const [signupSnap, gemini, publicEndpoint] = await Promise.all([
      db.collection("users").where("createdAt", ">=", since).count().get(),
      checkGemini(),
      checkPublicEndpoint(req, stats)
    ]);

    return json(res, 200, {
      ok: true,
      checkedAt: new Date().toISOString(),
      visitorsToday: stats.visitors,
      optimizationsToday: stats.optimizations,
      signupsToday: signupSnap.data().count,
      hitLimitToday: stats.hitLimitCount,
      publicOptimizer: publicEndpoint,
      gemini
    });
  } catch (error) {
    return json(res, Number(error?.status) || 500, { message: error?.message || "Unable to load admin metrics." });
  }
}
