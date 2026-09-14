import { GoogleGenAI } from "@google/genai";
import { createGroqProvider } from "./groqProvider.js";
import { STUDIO_AI_CAPABILITIES, getConfiguredDefaultModel, getProviderModelConfig } from "./aiModelConfig.js";
import { logAIUsage } from "./aiUsage.js";

const STUDIO_PROVIDER_ATTEMPT_TIMEOUT_MS = 8000;

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
    const supportedActions = Array.isArray(model?.supportedActions) ? model.supportedActions : Array.isArray(model?.supported_actions) ? model.supported_actions : [];
    models.push({ id, supportedActions });
  }
  return models;
};

const assertAvailable = (provider, capability, model, availableModels) => {
  const match = availableModels.find((entry) => entry.id === model);
  const capabilitySupported = provider === "gemini" ? !match?.supportedActions?.length || match.supportedActions.includes("generateContent") : true;
  if (!match || !capabilitySupported) {
    console.error("Studio AI configured model unavailable", { provider, capability, configuredModel: model, availableModelCount: availableModels.length });
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
  async listAvailableModels() { return listGeminiModels(); },
  async resolveModel(capability = STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC) {
    getProviderModelConfig("gemini", capability);
    const configuredModel = getConfiguredDefaultModel("gemini", capability);
    return assertAvailable("gemini", capability, configuredModel, await listGeminiModels());
  },
  async generateStructuredSpec({ contents, config = {}, capability = STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC }) {
    const activeModel = await this.resolveModel(capability);
    const response = await getGeminiClient().models.generateContent({ model: activeModel, contents, config });
    logAIUsage(response, activeModel, { provider: "gemini", stage: "spec", capability });
    return { text: response?.text || "", usageMetadata: response?.usageMetadata || response?.usage_metadata || {}, provider: "gemini", model: activeModel, raw: response };
  },
});

const unsupportedProvider = (providerName) => {
  const error = new Error(`Unsupported Studio AI provider "${providerName}". Configure STUDIO_AI_PROVIDER as "groq" or "gemini".`);
  error.status = 503;
  error.code = "ai_provider_unsupported";
  return error;
};

const hasProviderKey = (provider) => provider === "gemini" ? Boolean(String(process.env.GEMINI_API_KEY || "").trim()) : Boolean(String(process.env.GROQ_API_KEY || "").trim());

const isFailoverCandidate = (error) => {
  const status = Number(error?.status || error?.statusCode || error?.httpStatus || 0);
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  if (["ai_model_unavailable", "server_configuration_error", "resource_exhausted", "rate_limit_exceeded", "service_unavailable", "provider_unavailable", "internal_server_error"].includes(code)) return true;
  return /quota|rate limit|temporar|unavailable|overload|high demand|resource exhausted|deadline|timeout|aborted/.test(message);
};

const createProvider = (providerName) => {
  if (providerName === "groq") return createGroqProvider();
  if (providerName === "gemini") return createGeminiProvider();
  throw unsupportedProvider(providerName);
};

const createAttemptSignal = (outerSignal) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Studio AI provider attempt timed out.")), STUDIO_PROVIDER_ATTEMPT_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(outerSignal.reason);
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort(outerSignal.reason);
    else outerSignal.addEventListener("abort", forwardAbort, { once: true });
  }
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); if (outerSignal) outerSignal.removeEventListener("abort", forwardAbort); } };
};

const runAttempt = (provider, args, signal) => {
  const providerPromise = provider.generateStructuredSpec({ ...args, config: { ...(args.config || {}), abortSignal: signal } });
  if (signal.aborted) return Promise.reject(signal.reason || new Error("Studio AI provider attempt aborted."));
  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => reject(signal.reason || new Error("Studio AI provider attempt aborted."));
    signal.addEventListener("abort", onAbort, { once: true });
    providerPromise.finally(() => signal.removeEventListener("abort", onAbort));
  });
  return Promise.race([providerPromise, abortPromise]);
};

export const createAIProvider = () => {
  const configuredProvider = String(process.env.STUDIO_AI_PROVIDER || "gemini").trim().toLowerCase();
  if (!["gemini", "groq"].includes(configuredProvider)) throw unsupportedProvider(configuredProvider);

  const primary = createProvider(configuredProvider);
  const fallbackName = configuredProvider === "gemini" ? "groq" : "gemini";
  const fallback = hasProviderKey(fallbackName) ? createProvider(fallbackName) : null;

  console.info("Studio AI provider router selected", { primary: primary.name, fallback: fallback?.name || null });

  return {
    name: primary.name,
    async listAvailableModels() { return primary.listAvailableModels(); },
    async resolveModel(capability = STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC) {
      try { return await primary.resolveModel(capability); }
      catch (error) {
        if (!fallback || !isFailoverCandidate(error)) throw error;
        console.warn("Studio AI primary model unavailable; checking fallback provider", { primary: primary.name, fallback: fallback.name, capability, code: error?.code || null, status: Number(error?.status || error?.statusCode || error?.httpStatus || 0) || null });
        return fallback.resolveModel(capability);
      }
    },
    async generateStructuredSpec(args = {}) {
      const outerSignal = args.config?.abortSignal;
      const providers = [primary, ...(fallback ? [fallback] : [])];
      let lastError;
      for (const provider of providers) {
        const attempt = createAttemptSignal(outerSignal);
        try {
          return await runAttempt(provider, args, attempt.signal);
        } catch (error) {
          lastError = error;
          if (provider === primary && fallback && isFailoverCandidate(error)) {
            console.warn("Studio AI primary generation failed; failing over", { primary: primary.name, fallback: fallback.name, capability: args.capability || STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC, code: error?.code || null, status: Number(error?.status || error?.statusCode || error?.httpStatus || 0) || null });
            continue;
          }
          throw error;
        } finally { attempt.cleanup(); }
      }
      throw lastError;
    },
  };
};
