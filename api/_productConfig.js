import PRODUCT_CONFIG from "../src/config/product.config.js";
import { FieldValue } from "firebase-admin/firestore";

const COLLECTION = "systemConfig";
const DOC_ID = "product";

const clone = (value) => JSON.parse(JSON.stringify(value));

const clampInt = (value, min = 0, max = 1000000) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i >= min && i <= max ? i : null;
};

export const defaultProductConfig = () => clone(PRODUCT_CONFIG);

export const normalizeProductConfig = (input) => {
  const base = defaultProductConfig();
  const next = clone(input || {});
  const plans = next.plans || {};
  for (const id of ["free", "pro"]) {
    if (!plans[id]) continue;
    for (const key of ["dailyPromptLimit", "dailyImageLimit", "monthlyImageLimit"]) {
      if (plans[id][key] !== null && plans[id][key] !== undefined) {
        const value = clampInt(plans[id][key], 0, 10000);
        if (value === null) throw new Error(`Invalid ${id}.${key}.`);
        plans[id][key] = value;
      }
    }
  }
  next.plans = { ...base.plans, ...plans };
  next.pricing = { ...base.pricing, ...(next.pricing || {}) };
  next.pricing.proMonthlyInr = clampInt(next.pricing.proMonthlyInr, 1, 100000) ?? base.pricing.proMonthlyInr;
  next.pricing.proAnnualInr = clampInt(next.pricing.proAnnualInr, 1, 1000000) ?? base.pricing.proAnnualInr;
  next.creditCosts = { ...base.creditCosts, ...(next.creditCosts || {}) };
  for (const key of Object.keys(base.creditCosts)) next.creditCosts[key] = clampInt(next.creditCosts[key], 0, 1000) ?? base.creditCosts[key];
  return next;
};

export const getRuntimeProductConfig = async (db) => {
  const snapshot = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snapshot.exists) return defaultProductConfig();
  return normalizeProductConfig(snapshot.data().config);
};

export const saveRuntimeProductConfig = async ({ db, config, actor }) => {
  const normalized = normalizeProductConfig(config);
  await db.collection(COLLECTION).doc(DOC_ID).set({
    config: normalized,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor,
  }, { merge: true });
  return normalized;
};

export const writeConfigAudit = async ({ db, actor, before, after, requestId }) => {
  await db.collection("adminAudit").add({
    action: "product_config_update",
    actorUid: actor.uid,
    actorEmail: actor.email || null,
    requestId: requestId || null,
    before,
    after,
    createdAt: FieldValue.serverTimestamp(),
  });
};
