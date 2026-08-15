/**
 * PromptStudio monetization policy.
 * Keep pricing and credit costs centralized so UI, API, and future billing
 * integrations can consume one source of truth.
 */

export const PRICING = Object.freeze({
  proMonthlyInr: 79,
  proAnnualInr: 499,
  creditPackInr: 99,
  creditPackSize: 25,
});

export const CREDIT_COSTS = Object.freeze({
  standardGeneration: 1,
  promptRefinement: 1,
  referenceImageAnalysis: 3,
  advancedOperation: 3,
  heavyOperation: 5,
});

export const MONETIZATION_POLICY = Object.freeze({
  proDailyGenerations: 100,
  proMonthlyImageAnalyses: 100,
  creditsAvailableToPlans: ['free', 'pro'],
  purchasedCreditsExpire: false,
});

export const getCreditCost = (operation) => CREDIT_COSTS[operation] ?? null;

export const getCreditPackValue = () => PRICING.creditPackSize;

export default MONETIZATION_POLICY;
