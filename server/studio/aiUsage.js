const PRICING_USD_PER_MILLION = {
  "gemini-3.5-flash-lite": { input: 0.30, output: 2.50 },
};

const numberOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

export const getAIUsage = (response, model) => {
  const usage = response?.usageMetadata || response?.usage_metadata || {};
  const inputTokens = numberOrZero(usage.promptTokenCount ?? usage.prompt_token_count);
  const outputTokens = numberOrZero(usage.candidatesTokenCount ?? usage.candidates_token_count);
  const totalTokens = numberOrZero(usage.totalTokenCount ?? usage.total_token_count);
  const thoughtsTokens = numberOrZero(usage.thoughtsTokenCount ?? usage.thoughts_token_count);
  const pricing = PRICING_USD_PER_MILLION[model];
  const estimatedCostUsd = pricing
    ? Number(((inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output).toFixed(8))
    : null;

  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    thoughtsTokens,
    estimatedCostUsd,
    pricingKnown: Boolean(pricing),
  };
};

export const logAIUsage = (response, model, context = {}) => {
  const usage = getAIUsage(response, model);
  console.info("Studio AI usage", {
    ...context,
    ...usage,
  });
  return usage;
};
