import { json, adminDb } from "./_firebaseAdmin.js";
import { requireFounderAdmin } from "./_adminSecurity.js";
import { defaultOperationsConfig, getOperationsConfig, saveOperationsConfig } from "./_operationsConfig.js";
import { readDailyStats } from "./_publicTelemetry.js";

const withTimeout = async (url, headers, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    return { reachable: response.ok, status: response.status };
  } catch {
    return { reachable: false, status: null };
  } finally {
    clearTimeout(timer);
  }
};

const providerStatus = async () => {
  const geminiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const groqKey = String(process.env.GROQ_API_KEY || "").trim();
  const [geminiHealth, groqHealth] = await Promise.all([
    geminiKey
      ? withTimeout("https://generativelanguage.googleapis.com/v1beta/models", { Authorization: `Bearer ${geminiKey}` })
      : { reachable: false, status: null },
    groqKey
      ? withTimeout("https://api.groq.com/openai/v1/models", { Authorization: `Bearer ${groqKey}` })
      : { reachable: false, status: null },
  ]);
  return {
    gemini: { configured: Boolean(geminiKey), reachable: geminiHealth.reachable, status: geminiHealth.status, model: process.env.GEMINI_MODEL || "default" },
    groq: { configured: Boolean(groqKey), reachable: groqHealth.reachable, status: groqHealth.status, model: process.env.GROQ_MODEL || "default" },
    order: String(process.env.AI_PROVIDER_ORDER || "gemini,groq")
  };
};

export default async function handler(req, res) {
  try {
    const actor = await requireFounderAdmin(req, { write: req.method !== "GET" });
    const db = adminDb();
    if (req.method === "GET") {
      const config = await getOperationsConfig(db);
      const [auditSnap, stats, providers] = await Promise.all([
        db.collection("adminAudit").where("action", "==", "operations_config_update").orderBy("createdAt", "desc").limit(20).get().catch(() => ({ docs: [] })),
        readDailyStats(),
        providerStatus(),
      ]);
      return json(res, 200, {
        ok: true,
        checkedAt: new Date().toISOString(),
        config,
        defaults: defaultOperationsConfig(),
        providers,
        usage: {
          publicOptimizerToday: stats.optimizations,
          publicVisitorsToday: stats.visitors,
          publicLimitHitsToday: stats.hitLimitCount,
          lastSuccessAt: stats.lastSuccessAt,
          lastErrorAt: stats.lastErrorAt,
          lastErrorCode: stats.lastErrorCode,
        },
        audit: auditSnap.docs.map((doc) => {
          const d = doc.data() || {};
          return { id: doc.id, actorEmail: d.actorEmail || null, createdAt: d.createdAt?.toDate?.()?.toISOString?.() || null };
        })
      });
    }
    if (req.method !== "PUT") return json(res, 405, { message: "Method not allowed." });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const config = await saveOperationsConfig({ db, config: body.config, actor, requestId: body.requestId });
    return json(res, 200, { ok: true, config, savedAt: new Date().toISOString() });
  } catch (error) {
    return json(res, Number(error?.status) || 500, { message: error?.message || "Operations control request failed." });
  }
}
