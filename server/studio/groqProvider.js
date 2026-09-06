import { STUDIO_AI_CAPABILITIES, getConfiguredDefaultModel, getProviderModelConfig } from "./aiModelConfig.js";
import { logAIUsage } from "./aiUsage.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const STRUCTURED_JSON_MAX_ATTEMPTS = 2;
const STRUCTURED_JSON_RETRY_DELAY_MS = 300;
const DIAGNOSTIC_MAX_CHARS = 4000;

const getGroqApiKey = () => {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error("Groq AI is not configured yet.");
    error.status = 503;
    error.code = "server_configuration_error";
    throw error;
  }
  return process.env.GROQ_API_KEY;
};

const toMessages = (contents) => [{ role: "user", content: typeof contents === "string" ? contents : JSON.stringify(contents) }];

const createGroqResponse = (payload, model) => ({
  text: payload?.choices?.[0]?.message?.content || "",
  usageMetadata: {
    promptTokenCount: Number(payload?.usage?.prompt_tokens || 0),
    candidatesTokenCount: Number(payload?.usage?.completion_tokens || 0),
    totalTokenCount: Number(payload?.usage?.total_tokens || 0),
  },
  finishReason: payload?.choices?.[0]?.finish_reason || null,
  provider: "groq",
  model,
  raw: payload,
});

const listGroqModels = async () => {
  const response = await fetch(GROQ_MODELS_URL, { method: "GET", headers: { Authorization: `Bearer ${getGroqApiKey()}`, "Content-Type": "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Groq model listing failed with status ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error?.code || "groq_model_list_failed";
    throw error;
  }
  return Array.isArray(payload?.data) ? payload.data.filter((model) => model?.id && model?.active !== false).map((model) => ({ id: model.id })) : [];
};

const resolveGroqModel = async (capability) => {
  getProviderModelConfig("groq", capability);
  const configuredModel = getConfiguredDefaultModel("groq", capability);
  const availableModels = await listGroqModels();
  const supportedStrictModels = new Set(["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
  const match = availableModels.find((entry) => entry.id === configuredModel);
  if (!match || (capability === STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC && !supportedStrictModels.has(configuredModel))) {
    console.error("Studio AI configured model unavailable", { provider: "groq", capability, configuredModel, availableModelCount: availableModels.length });
    const error = new Error(`Configured groq model "${configuredModel}" is unavailable for capability "${capability}".`);
    error.status = 503;
    error.code = "ai_model_unavailable";
    throw error;
  }
  console.info("Studio AI model verified", { provider: "groq", capability, model: configuredModel });
  return configuredModel;
};

const waitForRetry = (ms, abortSignal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  if (!abortSignal) return;
  const onAbort = () => { clearTimeout(timer); reject(abortSignal.reason || new Error("The Groq request was aborted.")); };
  if (abortSignal.aborted) onAbort(); else abortSignal.addEventListener("abort", onAbort, { once: true });
});

const isValidJsonObject = (text) => {
  try { const parsed = JSON.parse(String(text || "").trim()); return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed)); } catch { return false; }
};

const diagnosticText = (value) => String(value ?? "").slice(0, DIAGNOSTIC_MAX_CHARS);

const createError = (message, status, code, details = {}) => Object.assign(new Error(message), { status, code, ...details });

export const createGroqProvider = () => ({
  name: "groq",
  async listAvailableModels() { return listGroqModels(); },
  async resolveModel(capability = STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC) { return resolveGroqModel(capability); },
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
      // Keep Groq on JSON Object Mode because Studio's shared evolving content/responsive
      // envelope is intentionally not a strict closed JSON Schema. Deterministic Studio
      // validation remains authoritative after the provider response.
      const responseFormat = { type: "json_object" };
      console.info("Studio AI structured response mode", { provider: "groq", capability, model: activeModel, mode: "json_object", maxAttempts: STRUCTURED_JSON_MAX_ATTEMPTS });

      for (let attempt = 1; attempt <= STRUCTURED_JSON_MAX_ATTEMPTS; attempt += 1) {
        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${getGroqApiKey()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: activeModel, messages: toMessages(contents), response_format: responseFormat, temperature: 0, max_tokens: config.maxOutputTokens }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const code = payload?.error?.code || "groq_request_failed";
          const failedGeneration = payload?.error?.failed_generation;
          const diagnostic = {
            provider: "groq",
            capability,
            model: activeModel,
            mode: "json_object",
            attempt,
            httpStatus: response.status,
            errorCode: code,
            errorMessage: payload?.error?.message || null,
            failedGeneration: failedGeneration == null ? null : diagnosticText(failedGeneration),
            failedGenerationLength: failedGeneration == null ? null : String(failedGeneration).length,
            promptTokenCount: Number(payload?.usage?.prompt_tokens || 0),
            candidatesTokenCount: Number(payload?.usage?.completion_tokens || 0),
            totalTokenCount: Number(payload?.usage?.total_tokens || 0),
            finishReason: payload?.choices?.[0]?.finish_reason || null,
          };
          console.warn("Studio Groq structured JSON provider error diagnostic", diagnostic);
          const error = createError(payload?.error?.message || `Groq request failed with status ${response.status}.`, response.status, code, { groqDiagnostic: diagnostic });
          if (code === "json_validate_failed" && attempt < STRUCTURED_JSON_MAX_ATTEMPTS) {
            console.warn("Studio Groq structured JSON generation retrying", { provider: "groq", capability, model: activeModel, attempt, nextAttempt: attempt + 1, reason: "json_validate_failed" });
            await waitForRetry(STRUCTURED_JSON_RETRY_DELAY_MS, abortSignal);
            continue;
          }
          throw error;
        }

        const result = createGroqResponse(payload, activeModel);
        console.info("Studio Groq structured JSON provider response diagnostic", {
          provider: "groq",
          capability,
          model: activeModel,
          attempt,
          promptTokenCount: result.usageMetadata.promptTokenCount,
          candidatesTokenCount: result.usageMetadata.candidatesTokenCount,
          totalTokenCount: result.usageMetadata.totalTokenCount,
          finishReason: result.finishReason,
          responseLength: result.text.length,
          responseValidJsonObject: isValidJsonObject(result.text),
        });
        if (!isValidJsonObject(result.text)) {
          if (attempt < STRUCTURED_JSON_MAX_ATTEMPTS) {
            console.warn("Studio Groq structured JSON generation retrying", { provider: "groq", capability, model: activeModel, attempt, nextAttempt: attempt + 1, reason: "invalid_ai_response" });
            await waitForRetry(STRUCTURED_JSON_RETRY_DELAY_MS, abortSignal);
            continue;
          }
          throw createError("Groq returned malformed structured JSON.", 502, "invalid_ai_response", { groqDiagnostic: { provider: "groq", capability, model: activeModel, attempt, finishReason: result.finishReason, promptTokenCount: result.usageMetadata.promptTokenCount, candidatesTokenCount: result.usageMetadata.candidatesTokenCount, totalTokenCount: result.usageMetadata.totalTokenCount, responseLength: result.text.length, responsePreview: diagnosticText(result.text) } });
        }
        logAIUsage(result, activeModel, { provider: "groq", stage: "spec", capability });
        return result;
      }
      throw createError("Groq structured JSON generation failed.", 502, "invalid_ai_response");
    } finally {
      if (abortSignal) abortSignal.removeEventListener("abort", abortForwarder);
    }
  },
});
