/**
 * PromptStudio single product configuration.
 * Product limits, pricing, credit costs and payment policy live here.
 */
export const PRODUCT_CONFIG = Object.freeze({
  defaultPlan: 'free',
  plans: Object.freeze({
    free: Object.freeze({ id: 'free', name: 'Free', dailyPromptLimit: 3, monthlyImageLimit: 3, creditsEnabled: true }),
    pro: Object.freeze({ id: 'pro', name: 'Pro', dailyPromptLimit: 100, monthlyImageLimit: 100, creditsEnabled: true }),
  }),
  pricing: Object.freeze({ proMonthlyInr: 79, proAnnualInr: 499, creditPackInr: 99, creditPackSize: 25 }),
  creditCosts: Object.freeze({ standardGeneration: 1, promptRefinement: 1, referenceImageAnalysis: 3, advancedOperation: 3, heavyOperation: 5 }),
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
    creditTopUps: { id: 'creditTopUps', name: 'Pay-As-You-Go Credits', phase: 'monetization', enabled: true, plans: ['free', 'pro'] },
    proSubscription: { id: 'proSubscription', name: 'Pro Subscription', phase: 'monetization', enabled: true, plans: ['pro'] },
    paymentGateway: { id: 'paymentGateway', name: 'Razorpay Payment Gateway', phase: 'monetization', enabled: true, plans: ['free', 'pro'] },
  }),
});
export default PRODUCT_CONFIG;
