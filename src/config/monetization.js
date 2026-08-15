import PRODUCT_CONFIG from './product.config.js';

/**
 * Backward-compatible monetization API.
 * Pricing and credit costs are sourced from product.config.js.
 */
export const PRICING = PRODUCT_CONFIG.pricing;
export const CREDIT_COSTS = PRODUCT_CONFIG.creditCosts;
export const MONETIZATION_POLICY = Object.freeze({
  proDailyGenerations: PRODUCT_CONFIG.plans.pro.dailyPromptLimit,
  proMonthlyImageAnalyses: PRODUCT_CONFIG.plans.pro.monthlyImageLimit,
  creditsAvailableToPlans: Object.keys(PRODUCT_CONFIG.plans).filter((plan) => PRODUCT_CONFIG.plans[plan].creditsEnabled),
  purchasedCreditsExpire: PRODUCT_CONFIG.monetization.purchasedCreditsExpire,
});

export const getCreditCost = (operation) => CREDIT_COSTS[operation] ?? null;
export const getCreditPackValue = () => PRICING.creditPackSize;

export default MONETIZATION_POLICY;
