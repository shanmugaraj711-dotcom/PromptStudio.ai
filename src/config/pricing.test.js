import { describe, expect, it } from 'vitest';
import PRODUCT_CONFIG from './product.config';
import { PRICING_PLANS } from '../constants/pricingPlans';

describe('PromptStudio monetization', () => {
  it('keeps public pricing aligned with product configuration', () => {
    const free = PRICING_PLANS.find((plan) => plan.id === 'free');
    const pro = PRICING_PLANS.find((plan) => plan.id === 'pro');
    const credits = PRICING_PLANS.find((plan) => plan.id === 'credits');

    expect(free.price).toBe('₹0');
    expect(pro.price).toBe(`₹${PRODUCT_CONFIG.pricing.proMonthlyInr}`);
    expect(pro.annualPrice).toBe(`₹${PRODUCT_CONFIG.pricing.proAnnualInr}`);
    expect(credits.price).toBe(`₹${PRODUCT_CONFIG.pricing.creditPacks.starter.priceInr}`);
    expect(credits.features).toContain(`${PRODUCT_CONFIG.pricing.creditPacks.starter.credits} credits for ₹${PRODUCT_CONFIG.pricing.creditPacks.starter.priceInr}`);
    expect(credits.features).toContain(`${PRODUCT_CONFIG.pricing.creditPacks.creator.credits} credits for ₹${PRODUCT_CONFIG.pricing.creditPacks.creator.priceInr} · Best Value`);
  });

  it('uses exactly ₹2 per credit for every credit pack and custom purchase', () => {
    expect(PRODUCT_CONFIG.pricing.customCredits.inrPerCredit).toBe(2);
    for (const pack of Object.values(PRODUCT_CONFIG.pricing.creditPacks)) expect(pack.priceInr).toBe(pack.credits * 2);
  });

  it('prices Studio and APK Forge only in credits', () => {
    expect(PRODUCT_CONFIG.pricing.studioBuild.creditCost).toBe(100);
    expect(PRODUCT_CONFIG.pricing.apkForge.creditCost).toBe(100);
    expect(PRODUCT_CONFIG.pricing.studioBuild.creditCost * 2).toBe(200);
    expect(PRODUCT_CONFIG.pricing.apkForge.creditCost * 2).toBe(200);
    expect(PRODUCT_CONFIG.pricing.studioBuild).not.toHaveProperty('buildPriceInr');
    expect(PRODUCT_CONFIG.pricing.apkForge).not.toHaveProperty('buildPriceInr');
  });

  it('keeps Image → Prompt more credit-intensive than standard prompts', () => {
    expect(PRODUCT_CONFIG.creditCosts.referenceImageAnalysis).toBe(5);
    expect(PRODUCT_CONFIG.creditCosts.standardGeneration).toBe(2);
    expect(PRODUCT_CONFIG.creditCosts.referenceImageAnalysis).toBeGreaterThan(PRODUCT_CONFIG.creditCosts.standardGeneration);
  });

  it('keeps purchased credits non-expiring', () => {
    expect(PRODUCT_CONFIG.monetization.purchasedCreditsExpire).toBe(false);
  });
});
