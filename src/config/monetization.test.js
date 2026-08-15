import { describe, expect, it } from 'vitest';
import { CREDIT_COSTS, MONETIZATION_POLICY, PRICING, getCreditCost } from './monetization.js';

describe('PromptStudio monetization policy', () => {
  it('keeps the agreed pricing centralized', () => {
    expect(PRICING).toMatchObject({
      proMonthlyInr: 79,
      proAnnualInr: 499,
      creditPackInr: 99,
      creditPackSize: 25,
    });
  });

  it('allows credits for both free and pro users', () => {
    expect(MONETIZATION_POLICY.creditsAvailableToPlans).toEqual(['free', 'pro']);
    expect(MONETIZATION_POLICY.purchasedCreditsExpire).toBe(false);
  });

  it('weights image analysis above standard generation', () => {
    expect(getCreditCost('standardGeneration')).toBe(1);
    expect(getCreditCost('promptRefinement')).toBe(1);
    expect(getCreditCost('referenceImageAnalysis')).toBe(3);
    expect(CREDIT_COSTS.referenceImageAnalysis).toBeGreaterThan(CREDIT_COSTS.standardGeneration);
  });

  it('keeps the agreed included Pro allowances', () => {
    expect(MONETIZATION_POLICY.proDailyGenerations).toBe(100);
    expect(MONETIZATION_POLICY.proMonthlyImageAnalyses).toBe(100);
  });
});
