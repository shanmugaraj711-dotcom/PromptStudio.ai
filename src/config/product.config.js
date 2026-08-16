/**
 * PromptStudio single product configuration.
 * Product limits, pricing, credit costs and payment policy live here.
 */
export const PRODUCT_CONFIG = Object.freeze({
  defaultPlan: 'free',
  plans: Object.freeze({
    free: Object.freeze({ id: 'free', name: 'Free', dailyPromptLimit: 3, dailyImageLimit: 1, monthlyImageLimit: null, creditsEnabled: true }),
    pro: Object.freeze({ id: 'pro', name: 'Pro', dailyPromptLimit: 25, dailyImageLimit: null, monthlyImageLimit: 20, creditsEnabled: true }),
  }),
  pricing: Object.freeze({
    proMonthlyInr: 79,
    proAnnualInr: 499,
    creditPacks: Object.freeze({
      starter: Object.freeze({ id: 'starter', name: 'Starter Credits', priceInr: 49, credits: 25 }),
      creator: Object.freeze({ id: 'creator', name: 'Creator Credits', priceInr: 99, credits: 60 }),
    }),
    customCredits: Object.freeze({ minInr: 10, maxInr: 1000, inrPerCredit: 2 }),
  }),
  creditCosts: Object.freeze({
    standardGeneration: 2,
    promptRefinement: 2,
    referenceImageAnalysis: 5,
    advancedOperation: 3,
    heavyOperation: 5,
  }),
  monetization: Object.freeze({ purchasedCreditsExpire: false, paymentProvider: 'razorpay', paymentMode: 'test' }),
  features: Object.freeze({
    aiPromptOptimization: { id: 'aiPromptOptimization', name: 'AI Prompt Optimization', phase: 'core', enabled: true, plans: ['free', 'pro'] },
    multiPerspectiveGeneration: { id: 'multiPerspectiveGeneration', name: 'Multi-Perspective Generation', phase: 'core', enabled: true, plans: ['free', 'pro'] },
    intentIntelligence: { id: 'intentIntelligence', name: 'Intent Intelligence', phase: 'core', enabled: true, plans: ['free', 'pro'] },
    dailyQuotaManagement: { id: 'dailyQuotaManagement', name: 'Daily Quota Management', phase: 'core', enabled: true, plans: ['free', 'pro'] },
    promptHistory: { id: 'promptHistory', name: 'Prompt History', phase: 'core', enabled: true, plans: ['free', 'pro'] },
    imageIntelligence: { id: 'imageIntelligence', name: 'Image → Prompt Intelligence', phase: 'core', enabled: true, plans: ['free', 'pro'] },
    imageUploadAnalysis: { id: 'imageUploadAnalysis', name: 'Image Upload & Analysis', phase: 'core', enabled: true, plans: ['free', 'pro'] },
    referenceAwarePrompt: { id: 'referenceAwarePrompt', name: 'Reference-Aware Prompt Generation', phase: 'core', enabled: true, plans: ['free', 'pro'] },
    dynamicVariableFillers: { id: 'dynamicVariableFillers', name: 'Dynamic Variables & Reusable Prompts', phase: 'monetization', enabled: true, plans: ['pro'] },
    oneClickLaunchButtons: { id: 'oneClickLaunchButtons', name: 'One-Click AI Launch', phase: 'monetization', enabled: true, plans: ['pro'] },
    promptBookmarking: { id: 'promptBookmarking', name: 'Prompt Bookmarks / Favorites', phase: 'monetization', enabled: true, plans: ['pro'] },
    shareablePromptLinks: { id: 'shareablePromptLinks', name: 'Shareable Prompt Links', phase: 'monetization', enabled: true, plans: ['pro'] },
    promptWorkflows: { id: 'promptWorkflows', name: 'Prompt Workflows', phase: 'monetization', enabled: true, plans: ['pro'] },
    creditTopUps: { id: 'creditTopUps', name: 'Pay-As-You-Go Creator Credits', phase: 'monetization', enabled: true, plans: ['free', 'pro'] },
    proSubscription: { id: 'proSubscription', name: 'Pro Subscription', phase: 'monetization', enabled: true, plans: ['pro'] },
    paymentGateway: { id: 'paymentGateway', name: 'Razorpay Payment Gateway', phase: 'monetization', enabled: true, plans: ['free', 'pro'] },
  }),
});
export default PRODUCT_CONFIG;
