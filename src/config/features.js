import PRODUCT_CONFIG from './product.config.js';

/**
 * Backward-compatible feature API.
 * The actual feature source of truth lives in product.config.js.
 */
export const FEATURE_REGISTRY = PRODUCT_CONFIG.features;

export const isFeatureActive = (featureId) => Boolean(FEATURE_REGISTRY[featureId]?.enabled);

export const evaluateFeatureAccess = (featureId, userPlan = PRODUCT_CONFIG.defaultPlan) => {
  const feature = FEATURE_REGISTRY[featureId];
  const normalizedPlan = Object.hasOwn(PRODUCT_CONFIG.plans, userPlan) ? userPlan : PRODUCT_CONFIG.defaultPlan;
  if (!feature) return { featureId, exists: false, active: false, allowed: false, reason: 'unknown_feature' };
  if (!feature.enabled) return { featureId, exists: true, active: false, allowed: false, reason: 'feature_disabled', phase: feature.phase };
  const allowed = feature.plans.includes(normalizedPlan);
  return { featureId, exists: true, active: true, allowed, reason: allowed ? 'allowed' : 'plan_restricted', phase: feature.phase };
};

export default FEATURE_REGISTRY;
