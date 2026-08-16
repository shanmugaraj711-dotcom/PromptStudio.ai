/**
 * Category-aware AI discovery catalog.
 * Keep this data separate so recommended tools and examples can evolve without
 * changing builder logic. Affiliate links are intentionally omitted for now.
 */
export const AI_CATALOG = Object.freeze({
  image: Object.freeze({
    title: 'Image → Prompt',
    subtitle: 'Turn a reference image or visual idea into a prompt tailored to the tool you want to use.',
    tools: [
      { id: 'midjourney', name: 'Midjourney', modelId: 'midjourney', reason: 'Strong for cinematic style, aesthetics and reference-driven image creation.', badge: 'Top pick' },
      { id: 'chatgpt', name: 'ChatGPT', modelId: 'chatgpt', reason: 'Great for versatile image creation and prompt iteration.' },
      { id: 'gemini', name: 'Gemini', modelId: 'gemini', reason: 'Useful for visual understanding and iterative image workflows.' },
    ],
    examples: [
      { title: 'Product hero', description: 'Turn a product reference into a premium commercial image prompt.', idea: 'Create a premium commercial product hero image matching the reference, with polished studio lighting, realistic materials, clean composition, and a luxury advertising feel.', modelId: 'midjourney' },
      { title: 'Cinematic portrait', description: 'Create a dramatic portrait while preserving the reference mood and composition.', idea: 'Create a cinematic portrait inspired by the reference image, preserving the subject, framing and mood while improving lighting, depth, skin texture and visual storytelling.', modelId: 'midjourney' },
      { title: 'Reference recreation', description: 'Describe the important visual details of an uploaded reference without inventing hidden facts.', idea: 'Analyze the reference image and create a faithful production-ready prompt covering subject, composition, framing, lighting, colors, materials, camera feel and atmosphere.', modelId: 'chatgpt' },
    ],
  }),
  writing: Object.freeze({
    title: 'Writing',
    subtitle: 'Start from a rough thought and turn it into clear, professional writing.',
    tools: [
      { id: 'chatgpt', name: 'ChatGPT', modelId: 'chatgpt', reason: 'Versatile for drafting, rewriting and structured content.' },
      { id: 'claude', name: 'Claude', modelId: 'claude', reason: 'Strong for long-form writing, editing and nuanced tone.' },
      { id: 'gemini', name: 'Gemini', modelId: 'gemini', reason: 'Useful for drafting and alternative versions.' },
    ],
    examples: [
      { title: 'Professional email', description: 'Turn a rough message into a concise professional email.', idea: 'Rewrite my rough message into a professional, friendly email that is concise, clear and action-oriented.', modelId: 'claude' },
      { title: 'Blog outline', description: 'Create a useful structure before writing the full article.', idea: 'Create a detailed blog outline for this topic with a strong hook, logical sections, practical examples and a clear conclusion.', modelId: 'chatgpt' },
      { title: 'Rewrite & improve', description: 'Preserve the meaning while making the writing clearer and stronger.', idea: 'Rewrite my text to improve clarity, flow, grammar and impact while preserving the original meaning and voice.', modelId: 'claude' },
    ],
  }),
  coding: Object.freeze({
    title: 'Coding',
    subtitle: 'Explain the goal, constraints and stack so the AI can produce better code.',
    tools: [
      { id: 'claude', name: 'Claude', modelId: 'claude', reason: 'Strong fit for complex coding tasks and repository-scale reasoning.', badge: 'Top pick' },
      { id: 'chatgpt', name: 'ChatGPT', modelId: 'chatgpt', reason: 'Useful for implementation, debugging and explanations.' },
      { id: 'gemini', name: 'Gemini', modelId: 'gemini', reason: 'Useful for coding assistance and alternative implementations.' },
    ],
    examples: [
      { title: 'Build a React page', description: 'Turn a product idea into a structured implementation prompt.', idea: 'Build a responsive React page for this product idea. Include component structure, accessible UI, responsive behavior, state handling and clean maintainable code.', modelId: 'claude' },
      { title: 'Debug an error', description: 'Give the AI the right context to diagnose and fix a bug.', idea: 'Analyze this code and error, identify the root cause, propose the safest fix, explain why it works, and provide the corrected code without changing unrelated behavior.', modelId: 'claude' },
      { title: 'SQL optimization', description: 'Improve a slow query while preserving its result.', idea: 'Optimize this SQL query for performance. Explain the bottleneck, recommend indexes or query changes, preserve the expected result, and provide the optimized query.', modelId: 'chatgpt' },
    ],
  }),
  marketing: Object.freeze({
    title: 'Marketing',
    subtitle: 'Create prompts for campaigns, ads, product positioning and audience-focused content.',
    tools: [
      { id: 'chatgpt', name: 'ChatGPT', modelId: 'chatgpt', reason: 'Strong all-rounder for campaigns and marketing copy.' },
      { id: 'claude', name: 'Claude', modelId: 'claude', reason: 'Useful for detailed strategy and long-form marketing content.' },
      { id: 'gemini', name: 'Gemini', modelId: 'gemini', reason: 'Useful for ideation and alternative campaign angles.' },
    ],
    examples: [
      { title: 'Ad campaign', description: 'Build a complete prompt for a targeted campaign.', idea: 'Create a marketing campaign for this product targeting the specified audience, including positioning, key message, ad angles, calls to action and platform-specific variations.', modelId: 'chatgpt' },
      { title: 'Product launch', description: 'Plan messaging around a new product launch.', idea: 'Create a product-launch messaging strategy with a clear value proposition, audience pain points, launch announcement, social posts and calls to action.', modelId: 'claude' },
      { title: 'Social content', description: 'Generate a repeatable social content system.', idea: 'Create a 30-day social content plan with varied hooks, useful educational posts, engagement prompts and platform-appropriate calls to action.', modelId: 'chatgpt' },
    ],
  }),
  business: Object.freeze({
    title: 'Business',
    subtitle: 'Turn business goals, decisions and operational tasks into structured AI prompts.',
    tools: [
      { id: 'chatgpt', name: 'ChatGPT', modelId: 'chatgpt', reason: 'Versatile for analysis, planning and business communication.' },
      { id: 'claude', name: 'Claude', modelId: 'claude', reason: 'Useful for detailed documents, analysis and structured reasoning.' },
      { id: 'gemini', name: 'Gemini', modelId: 'gemini', reason: 'Useful for research-oriented planning and alternatives.' },
    ],
    examples: [
      { title: 'Business plan', description: 'Turn an idea into a structured business planning prompt.', idea: 'Create a practical business plan for this idea covering target customers, problem, solution, positioning, operations, risks, revenue model and first 90-day actions.', modelId: 'claude' },
      { title: 'Decision analysis', description: 'Compare options using explicit criteria and trade-offs.', idea: 'Analyze these business options using clear decision criteria, benefits, risks, costs, dependencies and likely outcomes, then recommend the strongest option with reasoning.', modelId: 'chatgpt' },
      { title: 'Meeting summary', description: 'Turn meeting notes into decisions and actions.', idea: 'Convert these meeting notes into a concise executive summary with decisions made, open questions, owners, deadlines and next actions.', modelId: 'chatgpt' },
    ],
  }),
});

export const getAICatalog = (category) => AI_CATALOG[category] || AI_CATALOG.writing;

export default AI_CATALOG;
