export const DEFAULT_PLAN = "free";

// Monetization policy. Keep user-facing limits here so the UI and API share one source of truth.
export const PLAN_DAILY_PROMPT_LIMITS = Object.freeze({
  free: 3,
  pro: 100,
});

export const PLAN_MONTHLY_IMAGE_LIMITS = Object.freeze({
  free: 0,
  pro: 100,
});

export const normalizePlan = (plan) =>
  Object.hasOwn(PLAN_DAILY_PROMPT_LIMITS, plan) ? plan : DEFAULT_PLAN;

export const getDailyPromptLimit = (plan) =>
  PLAN_DAILY_PROMPT_LIMITS[normalizePlan(plan)];

export const getMonthlyImageLimit = (plan) =>
  PLAN_MONTHLY_IMAGE_LIMITS[normalizePlan(plan)];

export const getUtcDateKey = (date = new Date()) =>
  date.toISOString().slice(0, 10);

export const getUtcMonthKey = (date = new Date()) =>
  date.toISOString().slice(0, 7);

const toNonNegativeInteger = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export function createQuotaState(
  {
    plan,
    promptsToday,
    lastPromptDate,
    imageAnalysesThisMonth,
    lastImageAnalysisMonth,
    quotaVersion,
  } = {},
  date = new Date()
) {
  const normalizedPlan = normalizePlan(plan);
  const dateKey = getUtcDateKey(date);
  const monthKey = getUtcMonthKey(date);
  const usedToday = lastPromptDate === dateKey ? toNonNegativeInteger(promptsToday) : 0;
  const usedImagesThisMonth =
    lastImageAnalysisMonth === monthKey ? toNonNegativeInteger(imageAnalysesThisMonth) : 0;
  const dailyLimit = getDailyPromptLimit(normalizedPlan);
  const monthlyImageLimit = getMonthlyImageLimit(normalizedPlan);

  return {
    plan: normalizedPlan,
    promptsToday: usedToday,
    lastPromptDate: typeof lastPromptDate === "string" ? lastPromptDate : null,
    imageAnalysesThisMonth: usedImagesThisMonth,
    lastImageAnalysisMonth:
      typeof lastImageAnalysisMonth === "string" ? lastImageAnalysisMonth : null,
    quotaVersion: toNonNegativeInteger(quotaVersion),
    dailyLimit,
    monthlyImageLimit,
    remaining: Math.max(dailyLimit - usedToday, 0),
    imageRemaining: Math.max(monthlyImageLimit - usedImagesThisMonth, 0),
  };
}
