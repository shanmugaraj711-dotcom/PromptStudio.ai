import { FieldValue } from "firebase-admin/firestore";

const COLLECTION = "systemConfig";
const DOC_ID = "operations";
const DEFAULTS = Object.freeze({
  generation: { userPerMinute: 8, ipPerMinute: 20 },
  publicOptimizer: { dailyIpLimit: 2, providerTimeoutMs: 15000, maxBodyBytes: 32000, maxPromptLength: 6000 },
  runtime: { apiMaxDurationSeconds: 60, providerAttemptTimeoutMs: 8000, studioGenerationTimeoutMs: 18000, studioJobLeaseMs: 60000 },
  thresholds: { errorRatePercent: 10, timeoutRatePercent: 5, rateLimitHitsPerHour: 100, providerFailureCountPerHour: 20 },
  providerOrder: "gemini,groq"
});
const int = (value, min, max, fallback) => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fallback; };
const normalize = (raw = {}) => ({
  generation: { userPerMinute: int(raw.generation?.userPerMinute, 1, 1000, DEFAULTS.generation.userPerMinute), ipPerMinute: int(raw.generation?.ipPerMinute, 1, 5000, DEFAULTS.generation.ipPerMinute) },
  publicOptimizer: { dailyIpLimit: int(raw.publicOptimizer?.dailyIpLimit, 0, 1000, DEFAULTS.publicOptimizer.dailyIpLimit), providerTimeoutMs: int(raw.publicOptimizer?.providerTimeoutMs, 1000, 60000, DEFAULTS.publicOptimizer.providerTimeoutMs), maxBodyBytes: int(raw.publicOptimizer?.maxBodyBytes, 4096, 1000000, DEFAULTS.publicOptimizer.maxBodyBytes), maxPromptLength: int(raw.publicOptimizer?.maxPromptLength, 100, 20000, DEFAULTS.publicOptimizer.maxPromptLength) },
  runtime: { apiMaxDurationSeconds: int(raw.runtime?.apiMaxDurationSeconds, 1, 300, DEFAULTS.runtime.apiMaxDurationSeconds), providerAttemptTimeoutMs: int(raw.runtime?.providerAttemptTimeoutMs, 1000, 60000, DEFAULTS.runtime.providerAttemptTimeoutMs), studioGenerationTimeoutMs: int(raw.runtime?.studioGenerationTimeoutMs, 1000, 120000, DEFAULTS.runtime.studioGenerationTimeoutMs), studioJobLeaseMs: int(raw.runtime?.studioJobLeaseMs, 5000, 600000, DEFAULTS.runtime.studioJobLeaseMs) },
  thresholds: { errorRatePercent: int(raw.thresholds?.errorRatePercent, 1, 100, DEFAULTS.thresholds.errorRatePercent), timeoutRatePercent: int(raw.thresholds?.timeoutRatePercent, 1, 100, DEFAULTS.thresholds.timeoutRatePercent), rateLimitHitsPerHour: int(raw.thresholds?.rateLimitHitsPerHour, 1, 100000, DEFAULTS.thresholds.rateLimitHitsPerHour), providerFailureCountPerHour: int(raw.thresholds?.providerFailureCountPerHour, 1, 100000, DEFAULTS.thresholds.providerFailureCountPerHour) },
  providerOrder: ["gemini", "groq"].filter((p) => String(raw.providerOrder || DEFAULTS.providerOrder).split(",").map((x) => x.trim().toLowerCase()).includes(p)).join(",") || DEFAULTS.providerOrder
});
export const defaultOperationsConfig = () => JSON.parse(JSON.stringify(DEFAULTS));
export const getOperationsConfig = async (db) => { const snap = await db.collection(COLLECTION).doc(DOC_ID).get(); return normalize(snap.exists ? snap.data().config : DEFAULTS); };
export const saveOperationsConfig = async ({ db, config, actor, requestId }) => { const normalized = normalize(config); await db.collection(COLLECTION).doc(DOC_ID).set({ config: normalized, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true }); await db.collection("adminAudit").add({ action: "operations_config_update", actorUid: actor.uid, actorEmail: actor.email || null, requestId: requestId || null, after: normalized, createdAt: FieldValue.serverTimestamp() }); return normalized; };
