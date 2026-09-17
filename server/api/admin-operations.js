import { json, adminDb } from "./_firebaseAdmin.js";
import { requireFounderAdmin } from "./_adminSecurity.js";
import { defaultOperationsConfig, getOperationsConfig, saveOperationsConfig } from "./_operationsConfig.js";

const providerStatus = () => ({
  gemini: { configured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || "default" },
  groq: { configured: Boolean(process.env.GROQ_API_KEY), model: process.env.GROQ_MODEL || "default" },
  order: String(process.env.AI_PROVIDER_ORDER || "gemini,groq")
});

export default async function handler(req, res) {
  try {
    const actor = await requireFounderAdmin(req, { write: req.method !== "GET" });
    const db = adminDb();
    if (req.method === "GET") {
      const config = await getOperationsConfig(db);
      const [auditSnap] = await Promise.all([db.collection("adminAudit").where("action", "==", "operations_config_update").orderBy("createdAt", "desc").limit(20).get().catch(() => ({ docs: [] }))]);
      return json(res, 200, { ok: true, checkedAt: new Date().toISOString(), config, defaults: defaultOperationsConfig(), providers: providerStatus(), audit: auditSnap.docs.map((doc) => { const d = doc.data() || {}; return { id: doc.id, actorEmail: d.actorEmail || null, createdAt: d.createdAt?.toDate?.()?.toISOString?.() || null }; }) });
    }
    if (req.method !== "PUT") return json(res, 405, { message: "Method not allowed." });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const config = await saveOperationsConfig({ db, config: body.config, actor, requestId: body.requestId });
    return json(res, 200, { ok: true, config, savedAt: new Date().toISOString() });
  } catch (error) {
    return json(res, Number(error?.status) || 500, { message: error?.message || "Operations control request failed." });
  }
}
