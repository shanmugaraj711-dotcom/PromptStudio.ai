// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createQuotaState, getUtcDateKey, getUtcMonthKey } from "../src/constants/quota";
import { CREDIT_COSTS } from "../src/config/monetization";

describe("monetization generation policy", () => {
  it("keeps the agreed limits and credit costs centralized", () => {
    const quota = createQuotaState({ plan: "pro", promptsToday: 100, lastPromptDate: getUtcDateKey(), imageAnalysesThisMonth: 100, lastImageAnalysisMonth: getUtcMonthKey() });
    expect(quota.remaining).toBe(0);
    expect(quota.imageRemaining).toBe(0);
    expect(CREDIT_COSTS.standardGeneration).toBe(1);
    expect(CREDIT_COSTS.referenceImageAnalysis).toBe(3);
  });

  it("resets daily and monthly included allowances by UTC boundary", () => {
    const date = new Date("2026-08-15T12:00:00.000Z");
    const nextDay = new Date("2026-08-16T00:00:00.000Z");
    const nextMonth = new Date("2026-09-01T00:00:00.000Z");
    const dailyReset = createQuotaState({ plan: "pro", promptsToday: 100, lastPromptDate: getUtcDateKey(date), imageAnalysesThisMonth: 100, lastImageAnalysisMonth: getUtcMonthKey(date) }, nextDay);
    const monthlyReset = createQuotaState({ plan: "pro", promptsToday: 100, lastPromptDate: getUtcDateKey(date), imageAnalysesThisMonth: 100, lastImageAnalysisMonth: getUtcMonthKey(date) }, nextMonth);
    expect(dailyReset.remaining).toBe(100);
    expect(dailyReset.imageRemaining).toBe(100);
    expect(monthlyReset.remaining).toBe(100);
    expect(monthlyReset.imageRemaining).toBe(100);
  });
});
