import { CREDIT_COSTS, PRICING } from "../config/monetization.js";

export const createCreditState = ({ credits = 0, creditVersion = 0 } = {}) => ({
  credits: Math.max(Number.isFinite(Number(credits)) ? Math.floor(Number(credits)) : 0, 0),
  creditVersion: Math.max(Number.isFinite(Number(creditVersion)) ? Math.floor(Number(creditVersion)) : 0, 0),
});

export const getCreditCost = (operation) => CREDIT_COSTS[operation] ?? null;

export const canSpendCredits = (state, operation) => {
  const normalized = createCreditState(state);
  const cost = getCreditCost(operation);
  return cost !== null && normalized.credits >= cost;
};

export const spendCredits = (state, operation) => {
  const normalized = createCreditState(state);
  const cost = getCreditCost(operation);
  if (cost === null) return { ok: false, reason: "unknown_operation", ...normalized };
  if (normalized.credits < cost) return { ok: false, reason: "insufficient_credits", ...normalized };
  return {
    ok: true,
    reason: "spent",
    credits: normalized.credits - cost,
    creditVersion: normalized.creditVersion + 1,
    cost,
  };
};

export const addPurchasedCredits = (state, packSize = PRICING.creditPackSize) => {
  const normalized = createCreditState(state);
  const amount = Number.isFinite(Number(packSize)) ? Math.max(Math.floor(Number(packSize)), 0) : 0;
  return {
    credits: normalized.credits + amount,
    creditVersion: normalized.creditVersion + (amount > 0 ? 1 : 0),
  };
};
