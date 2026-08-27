import PRODUCT_CONFIG from "../../src/config/product.config.js";
import { FieldValue } from "firebase-admin/firestore";

const COLLECTION = "systemConfig";
const DOC_ID = "product";
const clone = (value) => JSON.parse(JSON.stringify(value));
const clampInt = (value, min = 0, max = 1000000) => { const n = Number(value); if (!Number.isFinite(n)) return null; const i = Math.floor(n); return i >= min && i <= max ? i : null; };
export const defaultProductConfig = () => clone(PRODUCT_CONFIG);

export const normalizeProductConfig = (input) => {
  const base = defaultProductConfig(); const raw = clone(input || {}); const next = clone(base);
  next.plans = { ...base.plans };
  for (const id of ["free", "pro"]) {
    const source = raw.plans?.[id] || {};
    next.plans[id] = { ...base.plans[id] };
    for (const key of ["dailyPromptLimit", "dailyImageLimit", "monthlyImageLimit"]) {
      if (source[key] === null) next.plans[id][key] = null;
      else if (source[key] !== undefined) { const value = clampInt(source[key], 0, 10000); if (value === null) throw new Error(`Invalid ${id}.${key}.`); next.plans[id][key] = value; }
    }
  }
  next.pricing = clone(base.pricing);
  const pricing = raw.pricing || {};
  next.pricing.proMonthlyInr = clampInt(pricing.proMonthlyInr, 1, 100000) ?? base.pricing.proMonthlyInr;
  next.pricing.proAnnualInr = clampInt(pricing.proAnnualInr, 1, 1000000) ?? base.pricing.proAnnualInr;
  for (const id of Object.keys(base.pricing.creditPacks)) {
    const source = pricing.creditPacks?.[id] || {};
    next.pricing.creditPacks[id] = { ...base.pricing.creditPacks[id] };
    if (source.priceInr !== undefined) next.pricing.creditPacks[id].priceInr = clampInt(source.priceInr, 1, 100000) ?? base.pricing.creditPacks[id].priceInr;
    if (source.credits !== undefined) next.pricing.creditPacks[id].credits = clampInt(source.credits, 1, 100000) ?? base.pricing.creditPacks[id].credits;
  }
  next.pricing.customCredits = { ...base.pricing.customCredits };
  const custom = pricing.customCredits || {};
  next.pricing.customCredits.minInr = clampInt(custom.minInr, 1, 100000) ?? base.pricing.customCredits.minInr;
  next.pricing.customCredits.maxInr = clampInt(custom.maxInr, next.pricing.customCredits.minInr, 1000000) ?? base.pricing.customCredits.maxInr;
  next.pricing.customCredits.inrPerCredit = Math.max(Number(custom.inrPerCredit || base.pricing.customCredits.inrPerCredit), 0.01);
  next.creditCosts = { ...base.creditCosts };
  for (const key of Object.keys(base.creditCosts)) next.creditCosts[key] = clampInt(raw.creditCosts?.[key], 0, 1000) ?? base.creditCosts[key];
  next.features = clone(base.features);
  for (const key of Object.keys(base.features)) if (typeof raw.features?.[key]?.enabled === "boolean") next.features[key].enabled = raw.features[key].enabled;
  next.monetization = { ...base.monetization, purchasedCreditsExpire: base.monetization.purchasedCreditsExpire, paymentProvider: base.monetization.paymentProvider, paymentMode: base.monetization.paymentMode };
  return next;
};

export const getRuntimeProductConfig = async (db) => { const snapshot = await db.collection(COLLECTION).doc(DOC_ID).get(); if (!snapshot.exists) return defaultProductConfig(); return normalizeProductConfig(snapshot.data().config); };
export const saveRuntimeProductConfig = async ({ db, config, actor }) => { const normalized = normalizeProductConfig(config); await db.collection(COLLECTION).doc(DOC_ID).set({ config: normalized, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor }, { merge: true }); return normalized; };
export const writeConfigAudit = async ({ db, actor, before, after, requestId }) => { await db.collection("adminAudit").add({ action: "product_config_update", actorUid: actor.uid, actorEmail: actor.email || null, requestId: requestId || null, before, after, createdAt: FieldValue.serverTimestamp() }); };
