export const DEFAULT_PLAN = "free";

// Prompt limits are intentionally explicit so pricing, UI and enforcement stay aligned.
export const PLAN_DAILY_PROMPT_LIMITS = Object.freeze({
  free: 3,
  pro: 25,
});

export const normalizePlan = (plan) =>
  Object.hasOwn(PLAN_DAILY_PROMPT_LIMITS, plan) ? plan : DEFAULT_PLAN;

export const getDailyPromptLimit = (plan) =>
  PLAN_DAILY_PROMPT_LIMITS[normalizePlan(plan)];

export const getUtcDateKey = (date = new Date()) =>
  date.toISOString().slice(0, 10);

const toNonNegativeInteger = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export function createQuotaState(
  { plan, promptsToday, lastPromptDate, quotaVersion } = {},
  date = new Date()
) {
  const normalizedPlan = normalizePlan(plan);
  const dateKey = getUtcDateKey(date);
  const isCurrentDay = lastPromptDate === dateKey;
  const usedToday = isCurrentDay ? toNonNegativeInteger(promptsToday) : 0;
  const dailyLimit = getDailyPromptLimit(normalizedPlan);

  return {
    plan: normalizedPlan,
    promptsToday: usedToday,
    lastPromptDate: typeof lastPromptDate === "string" ? lastPromptDate : null,
    quotaVersion: toNonNegativeInteger(quotaVersion),
    dailyLimit,
    remaining: Math.max(dailyLimit - usedToday, 0),
  };
}
