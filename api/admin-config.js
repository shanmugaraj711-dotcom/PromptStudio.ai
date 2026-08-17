import { adminDb, json } from "./_firebaseAdmin.js";
import { requireFounderAdmin } from "./_adminSecurity.js";
import { getRuntimeProductConfig, saveRuntimeProductConfig, writeConfigAudit } from "./_productConfig.js";

export default async function handler(req, res) {
  try {
    const actor = await requireFounderAdmin(req, { write: req.method === "PUT" });
    const db = adminDb();
    if (req.method === "GET") return json(res, 200, { config: await getRuntimeProductConfig(db) });
    if (req.method !== "PUT") return json(res, 405, { message: "Method not allowed." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (!body.config || typeof body.config !== "object") return json(res, 400, { message: "A product configuration object is required." });
    const before = await getRuntimeProductConfig(db);
    const after = await saveRuntimeProductConfig({ db, config: body.config, actor: actor.uid });
    await writeConfigAudit({ db, actor, before, after, requestId: body.requestId });
    return json(res, 200, { ok: true, config: after });
  } catch (error) {
    console.error("Admin config request failed", { code: error?.code || "unknown" });
    return json(res, error?.status || 500, { message: error?.message || "Unable to update product configuration." });
  }
}
