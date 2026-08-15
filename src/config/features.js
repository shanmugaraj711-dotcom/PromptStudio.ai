/**
 * PromptStudio central feature registry.
 * Keep product capability switches here so features can be introduced,
 * tested, disabled, or Pro-gated without scattering feature checks across UI.
 */

export const FEATURE_REGISTRY = Object.freeze({
  aiPromptOptimization: { id: 'aiPromptOptimization', name: 'AI Prompt Optimization', phase: 'core', enabled: true, plans: ['free', 'pro'] },
  multiPerspectiveGeneration: { id: 'multiPerspectiveGeneration', name: 'Multi-Perspective Generation', phase: 'core', enabled: true, plans: ['free', 'pro'] },
  intentIntelligence: { id: 'intentIntelligence', name: 'Intent Intelligence', phase: 'core', enabled: true, plans: ['free', 'pro'] },
  dailyQuotaManagement: { id: 'dailyQuotaManagement', name: 'Daily Quota Management', phase: 'core', enabled: true, plans: ['free', 'pro'] },
  promptHistory: { id: 'promptHistory', name: 'Prompt History', phase: 'core', enabled: true, plans: ['free', 'pro'] },

  imageIntelligence: { id: 'imageIntelligence', name: 'Image → Prompt Intelligence', phase: 'core', enabled: true, plans: ['free', 'pro'] },
  imageUploadAnalysis: { id: 'imageUploadAnalysis', name: 'Image Upload & Analysis', phase: 'core', enabled: true, plans: ['free', 'pro'] },
  referenceAwarePrompt: { id: 'referenceAwarePrompt', name: 'Reference-Aware Prompt Generation', phase: 'core', enabled: true, plans: ['free', 'pro'] },

  dynamicVariableFillers: { id: 'dynamicVariableFillers', name: 'Dynamic Variable Fillers', phase: 'upcoming', enabled: false, plans: ['free', 'pro'] },
  oneClickLaunchButtons: { id: 'oneClickLaunchButtons', name: 'One-Click AI Launch', phase: 'monetization', enabled: true, plans: ['pro'] },
  promptBookmarking: { id: 'promptBookmarking', name: 'Prompt Bookmarks / Favorites', phase: 'monetization', enabled: true, plans: ['pro'] },
  shareablePromptLinks: { id: 'shareablePromptLinks', name: 'Shareable Prompt Links', phase: 'upcoming', enabled: false, plans: ['pro'] },
  aiToolRecommendation: { id: 'aiToolRecommendation', name: 'AI Tool Recommendation', phase: 'upcoming', enabled: false, plans: ['free', 'pro'] },
});

export const isFeatureActive = (featureId) => Boolean(FEATURE_REGISTRY[featureId]?.enabled);

export const evaluateFeatureAccess = (featureId, userPlan = 'free') => {
  const feature = FEATURE_REGISTRY[featureId];
  const normalizedPlan = userPlan === 'pro' ? 'pro' : 'free';
  if (!feature) return { featureId, exists: false, active: false, allowed: false, reason: 'unknown_feature' };
  if (!feature.enabled) return { featureId, exists: true, active: false, allowed: false, reason: 'feature_disabled', phase: feature.phase };
  const allowed = feature.plans.includes(normalizedPlan);
  return { featureId, exists: true, active: true, allowed, reason: allowed ? 'allowed' : 'plan_restricted', phase: feature.phase };
};

export default FEATURE_REGISTRY;
