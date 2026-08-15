// Central monetization policy. Payment processing is intentionally not implemented here.
// Credits are a future pay-as-you-go balance fulfilled only after verified payment.

export const PRO_MONTHLY_PRICE_INR = 79;
export const PRO_ANNUAL_PRICE_INR = 499;
export const CREDIT_PACK_PRICE_INR = 99;
export const CREDIT_PACK_SIZE = 25;

export const CREDIT_COSTS = Object.freeze({
  standardGeneration: 1,
  imageAnalysis: 2,
  refinement: 1,
});

export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({ dailyGenerations: 3, monthlyImageAnalyses: 0 }),
  pro: Object.freeze({ dailyGenerations: 100, monthlyImageAnalyses: 100 }),
});

export const getCreditCost = (operation = "standardGeneration") =>
  CREDIT_COSTS[operation] || CREDIT_COSTS.standardGeneration;

export const getPlanLimits = (plan = "free") =>
  PLAN_LIMITS[plan === "pro" ? "pro" : "free"];
