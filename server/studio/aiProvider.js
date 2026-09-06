import { GoogleGenAI } from "@google/genai";
import { createGroqProvider } from "./groqProvider.js";
import { STUDIO_AI_CAPABILITIES, getConfiguredDefaultModel, getProviderModelConfig } from "./aiModelConfig.js";
import { logAIUsage } from "./aiUsage.js";

const getGeminiClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("Studio AI is not configured yet.");
    error.status = 503;
    error.code = "server_configuration_error";
    throw error;
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const normalizeGeminiModelName = (name) => String(name || "").replace(/^models\//, "");

const listGeminiModels = async () => {
  const client = getGeminiClient();
  const models = [];
  for await (const model of client.models.list()) {
    const id = normalizeGeminiModelName(model?.name || model?.id);
    if (!id) continue;
    const supportedActions = Array.isArray(model?.supportedActions)
      ? model.supportedActions
      : Array.isArray(model?.supported_actions) ? model.supported_actions : [];
    models.push({ id, supportedActions });
  }
  return models;
};

const assertAvailable = (provider, capability, model, availableModels) => {
  const match = availableModels.find((entry) => entry.id === model);
  const capabilitySupported = provider === "gemini"
    ? !match?.supportedActions?.length || match.supportedActions.includes("generateContent")
    : true;
  if (!match || !capabilitySupported) {
    console.error("Studio AI configured model unavailable", {
      provider,
      capability,
      configuredModel: model,
      availableModelCount: availableModels.length,
    });
    const error = new Error(`Configured ${provider} model "${model}" is unavailable for capability "${capability}".`);
    error.status = 503;
    error.code = "ai_model_unavailable";
    throw error;
  }
  console.info("Studio AI model verified", { provider, capability, model });
  return model;
};

const createGeminiProvider = () => ({
  name: "gemini",
  async listAvailableModels() {
    return listGeminiModels();
  },
  async resolveModel(capability = STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC) {
    getProviderModelConfig("gemini", capability);
    const configuredModel = getConfiguredDefaultModel("gemini", capability);
    const availableModels = await listGeminiModels();
    return assertAvailable("gemini", capability, configuredModel, availableModels);
  },
  async generateStructuredSpec({ contents, config = {}, capability = STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC }) {
    const activeModel = await this.resolveModel(capability);
    const response = await getGeminiClient().models.generateContent({ model: activeModel, contents, config });
    logAIUsage(response, activeModel, { provider: "gemini", stage: "spec", capability });
    return {
      text: response?.text || "",
      usageMetadata: response?.usageMetadata || response?.usage_metadata || {},
      provider: "gemini",
      model: activeModel,
      raw: response,
    };
  },
});

export const createAIProvider = () => {
  const providerName = String(process.env.STUDIO_AI_PROVIDER || "gemini").trim().toLowerCase();
  if (providerName === "groq") {
    console.info("Studio AI provider selected", { provider: "groq" });
    return createGroqProvider();
  }
  console.info("Studio AI provider selected", { provider: "gemini" });
  return createGeminiProvider();
};
