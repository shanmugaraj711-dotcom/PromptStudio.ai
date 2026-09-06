import { STUDIO_AI_CAPABILITIES, getConfiguredDefaultModel, getProviderModelConfig } from "./aiModelConfig.js";
import { logAIUsage } from "./aiUsage.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";

const getGroqApiKey = () => {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error("Groq AI is not configured yet.");
    error.status = 503;
    error.code = "server_configuration_error";
    throw error;
  }
  return process.env.GROQ_API_KEY;
};

const toMessages = (contents) => [{
  role: "user",
  content: typeof contents === "string" ? contents : JSON.stringify(contents),
}];

const createGroqResponse = (payload, model) => ({
  text: payload?.choices?.[0]?.message?.content || "",
  usageMetadata: {
    promptTokenCount: Number(payload?.usage?.prompt_tokens || 0),
    candidatesTokenCount: Number(payload?.usage?.completion_tokens || 0),
    totalTokenCount: Number(payload?.usage?.total_tokens || 0),
  },
  provider: "groq",
  model,
  raw: payload,
});

const listGroqModels = async () => {
  const response = await fetch(GROQ_MODELS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getGroqApiKey()}`,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Groq model listing failed with status ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error?.code || "groq_model_list_failed";
    throw error;
  }
  return Array.isArray(payload?.data)
    ? payload.data.filter((model) => model?.id && model?.active !== false).map((model) => ({ id: model.id }))
    : [];
};

const resolveGroqModel = async (capability) => {
  getProviderModelConfig("groq", capability);
  const configuredModel = getConfiguredDefaultModel("groq", capability);
  const availableModels = await listGroqModels();
  const supportedStrictModels = new Set([
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
  ]);
  const match = availableModels.find((entry) => entry.id === configuredModel);
  if (!match || (capability === STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC && !supportedStrictModels.has(configuredModel))) {
    console.error("Studio AI configured model unavailable", {
      provider: "groq",
      capability,
      configuredModel,
      availableModelCount: availableModels.length,
    });
    const error = new Error(`Configured groq model "${configuredModel}" is unavailable for capability "${capability}".`);
    error.status = 503;
    error.code = "ai_model_unavailable";
    throw error;
  }
  console.info("Studio AI model verified", { provider: "groq", capability, model: configuredModel });
  return configuredModel;
};

export const createGroqProvider = () => ({
  name: "groq",
  async listAvailableModels() {
    return listGroqModels();
  },
  async resolveModel(capability = STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC) {
    return resolveGroqModel(capability);
  },
  async generateStructuredSpec({ contents, config = {}, capability = STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC }) {
    const activeModel = await this.resolveModel(capability);
    const controller = new AbortController();
    const abortSignal = config.abortSignal;
    const abortForwarder = () => controller.abort(abortSignal?.reason);
    if (abortSignal) {
      if (abortSignal.aborted) controller.abort(abortSignal.reason);
      else abortSignal.addEventListener("abort", abortForwarder, { once: true });
    }

    try {
      const responseFormat = config.responseJsonSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: "studio_spec",
              strict: true,
              schema: config.responseJsonSchema,
            },
          }
        : { type: "json_object" };

      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getGroqApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: activeModel,
          messages: toMessages(contents),
          response_format: responseFormat,
          temperature: 0,
          max_tokens: config.maxOutputTokens,
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.error?.message || `Groq request failed with status ${response.status}.`);
        error.status = response.status;
        error.code = payload?.error?.code || "groq_request_failed";
        throw error;
      }
      const result = createGroqResponse(payload, activeModel);
      logAIUsage(result, activeModel, { provider: "groq", stage: "spec", capability });
      return result;
    } finally {
      if (abortSignal) abortSignal.removeEventListener("abort", abortForwarder);
    }
  },
});
