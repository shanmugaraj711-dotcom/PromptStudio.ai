import PRODUCT_CONFIG from '../config/product.config.js';

export const DEFAULT_PLAN = PRODUCT_CONFIG.defaultPlan;

// Backward-compatible quota API. Limits are controlled in product.config.js.
export const PLAN_DAILY_PROMPT_LIMITS = Object.freeze(
  Object.fromEntries(Object.entries(PRODUCT_CONFIG.plans).map(([id, plan]) => [id, plan.dailyPromptLimit]))
);

export const PLAN_MONTHLY_IMAGE_LIMITS = Object.freeze(
  Object.fromEntries(Object.entries(PRODUCT_CONFIG.plans).map(([id, plan]) => [id, plan.monthlyImageLimit]))
);

export const normalizePlan = (plan) => Object.hasOwn(PRODUCT_CONFIG.plans, plan) ? plan : DEFAULT_PLAN;
export const getDailyPromptLimit = (plan) => PLAN_DAILY_PROMPT_LIMITS[normalizePlan(plan)];
export const getMonthlyImageLimit = (plan) => PLAN_MONTHLY_IMAGE_LIMITS[normalizePlan(plan)];
export const getUtcDateKey = (date = new Date()) => date.toISOString().slice(0, 10);
export const getUtcMonthKey = (date = new Date()) => date.toISOString().slice(0, 7);

const toNonNegativeInteger = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export function createQuotaState({ plan, promptsToday, lastPromptDate, imageAnalysesThisMonth, lastImageAnalysisMonth, quotaVersion } = {}, date = new Date()) {
  const normalizedPlan = normalizePlan(plan);
  const dateKey = getUtcDateKey(date);
  const monthKey = getUtcMonthKey(date);
  const usedToday = lastPromptDate === dateKey ? toNonNegativeInteger(promptsToday) : 0;
  const usedImagesThisMonth = lastImageAnalysisMonth === monthKey ? toNonNegativeInteger(imageAnalysesThisMonth) : 0;
  const dailyLimit = getDailyPromptLimit(normalizedPlan);
  const monthlyImageLimit = getMonthlyImageLimit(normalizedPlan);
  return {
    plan: normalizedPlan,
    promptsToday: usedToday,
    lastPromptDate: typeof lastPromptDate === 'string' ? lastPromptDate : null,
    imageAnalysesThisMonth: usedImagesThisMonth,
    lastImageAnalysisMonth: typeof lastImageAnalysisMonth === 'string' ? lastImageAnalysisMonth : null,
    quotaVersion: toNonNegativeInteger(quotaVersion),
    dailyLimit,
    monthlyImageLimit,
    remaining: Math.max(dailyLimit - usedToday, 0),
    imageRemaining: Math.max(monthlyImageLimit - usedImagesThisMonth, 0),
  };
}
