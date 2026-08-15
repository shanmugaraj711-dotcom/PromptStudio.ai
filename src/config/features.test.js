import { describe, expect, it } from 'vitest';
import { evaluateFeatureAccess, isFeatureActive } from './features';

describe('feature registry', () => {
  it('keeps one-click AI launch active but Pro-only', () => {
    expect(isFeatureActive('oneClickLaunchButtons')).toBe(true);
    expect(evaluateFeatureAccess('oneClickLaunchButtons', 'free')).toMatchObject({
      active: true,
      allowed: false,
      reason: 'plan_restricted',
    });
    expect(evaluateFeatureAccess('oneClickLaunchButtons', 'pro')).toMatchObject({
      active: true,
      allowed: true,
      reason: 'allowed',
    });
  });
});
