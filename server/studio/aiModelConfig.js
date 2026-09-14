export const STUDIO_AI_CAPABILITIES = Object.freeze({
  STRUCTURED_JSON_SPEC: "structured-json-spec",
});

export const AI_PROVIDER_MODEL_CONFIG = Object.freeze({
  gemini: Object.freeze({
    [STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC]: Object.freeze({
      envVar: "GEMINI_MODEL",
      defaultModel: "gemini-3.5-flash-lite",
    }),
  }),
  groq: Object.freeze({
    [STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC]: Object.freeze({
      envVar: "GROQ_MODEL",
      defaultModel: "openai/gpt-oss-20b",
    }),
  }),
});

export const getProviderModelConfig = (provider, capability) => {
  const config = AI_PROVIDER_MODEL_CONFIG[provider]?.[capability];
  if (!config) {
    const error = new Error(`AI provider "${provider}" does not support capability "${capability}".`);
    error.status = 503;
    error.code = "ai_capability_unsupported";
    throw error;
  }
  return config;
};

export const getConfiguredDefaultModel = (provider, capability) => {
  const config = getProviderModelConfig(provider, capability);
  return String(process.env[config.envVar] || config.defaultModel).trim();
};
