export const DEFAULT_PLAN = "free";

// Prompt and image limits are explicit so pricing, UI and enforcement stay aligned.
export const PLAN_DAILY_PROMPT_LIMITS = Object.freeze({
  free: 3,
  pro: 25,
});

export const PLAN_DAILY_IMAGE_LIMITS = Object.freeze({
  free: 1,
  pro: null,
});

export const PLAN_MONTHLY_IMAGE_LIMITS = Object.freeze({
  free: null,
  pro: 20,
});

export const normalizePlan = (plan) =>
  Object.hasOwn(PLAN_DAILY_PROMPT_LIMITS, plan) ? plan : DEFAULT_PLAN;

export const getDailyPromptLimit = (plan) => PLAN_DAILY_PROMPT_LIMITS[normalizePlan(plan)];
export const getDailyImageLimit = (plan) => PLAN_DAILY_IMAGE_LIMITS[normalizePlan(plan)];
export const getMonthlyImageLimit = (plan) => PLAN_MONTHLY_IMAGE_LIMITS[normalizePlan(plan)];

export const getUtcDateKey = (date = new Date()) => date.toISOString().slice(0, 10);
export const getUtcMonthKey = (date = new Date()) => date.toISOString().slice(0, 7);

const toNonNegativeInteger = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export function createQuotaState(
  { plan, promptsToday, lastPromptDate, quotaVersion, imageAnalysesToday, lastImageAnalysisDate, imageAnalysesThisMonth, lastImageAnalysisMonth } = {},
  date = new Date()
) {
  const normalizedPlan = normalizePlan(plan);
  const dateKey = getUtcDateKey(date);
  const monthKey = getUtcMonthKey(date);
  const promptUsedToday = lastPromptDate === dateKey ? toNonNegativeInteger(promptsToday) : 0;
  const imageUsedToday = lastImageAnalysisDate === dateKey ? toNonNegativeInteger(imageAnalysesToday) : 0;
  const imageUsedThisMonth = lastImageAnalysisMonth === monthKey ? toNonNegativeInteger(imageAnalysesThisMonth) : 0;
  const dailyPromptLimit = getDailyPromptLimit(normalizedPlan);
  const dailyImageLimit = getDailyImageLimit(normalizedPlan);
  const monthlyImageLimit = getMonthlyImageLimit(normalizedPlan);
  const imageLimit = dailyImageLimit ?? monthlyImageLimit;
  const imageUsed = dailyImageLimit !== null ? imageUsedToday : imageUsedThisMonth;

  return {
    plan: normalizedPlan,
    promptsToday: promptUsedToday,
    lastPromptDate: typeof lastPromptDate === "string" ? lastPromptDate : null,
    imageAnalysesToday: imageUsedToday,
    lastImageAnalysisDate: typeof lastImageAnalysisDate === "string" ? lastImageAnalysisDate : null,
    imageAnalysesThisMonth: imageUsedThisMonth,
    lastImageAnalysisMonth: typeof lastImageAnalysisMonth === "string" ? lastImageAnalysisMonth : null,
    quotaVersion: toNonNegativeInteger(quotaVersion),
    dailyLimit: dailyPromptLimit,
    remaining: Math.max(dailyPromptLimit - promptUsedToday, 0),
    dailyImageLimit,
    monthlyImageLimit,
    imageLimit,
    imageUsed,
    imageRemaining: Math.max(imageLimit === null ? 0 : imageLimit - imageUsed, 0),
    imagePeriod: dailyImageLimit !== null ? "day" : "month",
  };
}
