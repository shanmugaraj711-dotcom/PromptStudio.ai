/**
 * PromptStudio central feature registry.
 *
 * Keep product capability switches here so new features can be introduced,
 * tested, disabled, or Pro-gated without scattering feature checks across UI.
 *
 * `enabled` controls whether the capability is implemented/available.
 * `plans` controls which subscription plans may use an enabled capability.
 */

export const FEATURE_REGISTRY = Object.freeze({
  // ---------------------------------------------------------------------------
  // Core — verified and currently active
  // ---------------------------------------------------------------------------
  aiPromptOptimization: {
    id: 'aiPromptOptimization',
    name: 'AI Prompt Optimization',
    phase: 'core',
    enabled: true,
    plans: ['free', 'pro'],
  },
  multiPerspectiveGeneration: {
    id: 'multiPerspectiveGeneration',
    name: 'Multi-Perspective Generation',
    phase: 'core',
    enabled: true,
    plans: ['free', 'pro'],
  },
  intentIntelligence: {
    id: 'intentIntelligence',
    name: 'Intent Intelligence',
    phase: 'core',
    enabled: true,
    plans: ['free', 'pro'],
  },
  dailyQuotaManagement: {
    id: 'dailyQuotaManagement',
    name: 'Daily Quota Management',
    phase: 'core',
    enabled: true,
    plans: ['free', 'pro'],
  },
  promptHistory: {
    id: 'promptHistory',
    name: 'Prompt History',
    phase: 'core',
    enabled: true,
    plans: ['free', 'pro'],
  },

  // ---------------------------------------------------------------------------
  // Image Intelligence — implemented in the reference-aware upload pipeline.
  // ---------------------------------------------------------------------------
  imageIntelligence: {
    id: 'imageIntelligence',
    name: 'Image → Prompt Intelligence',
    phase: 'core',
    enabled: true,
    plans: ['free', 'pro'],
  },
  imageUploadAnalysis: {
    id: 'imageUploadAnalysis',
    name: 'Image Upload & Analysis',
    phase: 'core',
    enabled: true,
    plans: ['free', 'pro'],
  },
  referenceAwarePrompt: {
    id: 'referenceAwarePrompt',
    name: 'Reference-Aware Prompt Generation',
    phase: 'core',
    enabled: true,
    plans: ['free', 'pro'],
  },

  // ---------------------------------------------------------------------------
  // Monetization / retention features
  // ---------------------------------------------------------------------------
  dynamicVariableFillers: {
    id: 'dynamicVariableFillers',
    name: 'Dynamic Variable Fillers',
    phase: 'upcoming',
    enabled: false,
    plans: ['free', 'pro'],
  },
  oneClickLaunchButtons: {
    id: 'oneClickLaunchButtons',
    name: 'One-Click AI Launch',
    phase: 'monetization',
    enabled: true,
    plans: ['pro'],
  },
  promptBookmarking: {
    id: 'promptBookmarking',
    name: 'Prompt Bookmarks / Favorites',
    phase: 'upcoming',
    enabled: false,
    plans: ['pro'],
  },
  shareablePromptLinks: {
    id: 'shareablePromptLinks',
    name: 'Shareable Prompt Links',
    phase: 'upcoming',
    enabled: false,
    plans: ['pro'],
  },

  // ---------------------------------------------------------------------------
  // Product intelligence extensions already in the roadmap.
  // ---------------------------------------------------------------------------
  aiToolRecommendation: {
    id: 'aiToolRecommendation',
    name: 'AI Tool Recommendation',
    phase: 'upcoming',
    enabled: false,
    plans: ['free', 'pro'],
  },
});

export const isFeatureActive = (featureId) => {
  const feature = FEATURE_REGISTRY[featureId];
  return Boolean(feature?.enabled);
};

export const evaluateFeatureAccess = (featureId, userPlan = 'free') => {
  const feature = FEATURE_REGISTRY[featureId];
  const normalizedPlan = userPlan === 'pro' ? 'pro' : 'free';

  if (!feature) {
    return {
      featureId,
      exists: false,
      active: false,
      allowed: false,
      reason: 'unknown_feature',
    };
  }

  if (!feature.enabled) {
    return {
      featureId,
      exists: true,
      active: false,
      allowed: false,
      reason: 'feature_disabled',
      phase: feature.phase,
    };
  }

  const allowed = feature.plans.includes(normalizedPlan);

  return {
    featureId,
    exists: true,
    active: true,
    allowed,
    reason: allowed ? 'allowed' : 'plan_restricted',
    phase: feature.phase,
  };
};

export default FEATURE_REGISTRY;
