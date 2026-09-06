import { STUDIO_AI_CAPABILITIES, getConfiguredDefaultModel, getProviderModelConfig } from "./aiModelConfig.js";
import { logAIUsage } from "./aiUsage.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const STRUCTURED_JSON_MAX_ATTEMPTS = 2;
const STRUCTURED_JSON_RETRY_DELAY_MS = 300;
const GROQ_MIN_OUTPUT_TOKENS = 3600;
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

const toMessages = (contents, responseJsonSchema) => {
  const schemaInstruction = responseJsonSchema
    ? `\n\nOUTPUT CONTRACT:\nReturn one JSON object that follows this exact Studio Spec schema. Do not invent a different field structure.\n${JSON.stringify(responseJsonSchema)}`
    : "";
  return [
    {
      role: "system",
      content: "Return ONLY one valid JSON object. Do not use markdown, code fences, explanations, or any text outside the JSON object.",
    },
    {
      role: "user",
      content: `${typeof contents === "string" ? contents : JSON.stringify(contents)}${schemaInstruction}`,
    },
  ];
};

const createGroqResponse = (payload, model, parsedJson) => ({
  text: JSON.stringify(parsedJson),
  parsedJson,
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
  const match = availableModels.find((entry) => entry.id === configuredModel);
  if (!match) {
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

const parseJsonObject = (text) => {
  const raw = String(text || "").trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  throw new Error("Groq returned malformed structured JSON.");
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
      const outputTokenBudget = Math.max(Number(config.maxOutputTokens) || 0, GROQ_MIN_OUTPUT_TOKENS);
      console.info("Studio AI structured response mode", { provider: "groq", capability, model: activeModel, mode: "prompted-json", maxAttempts: STRUCTURED_JSON_MAX_ATTEMPTS, outputTokenBudget, schemaProvided: Boolean(config.responseJsonSchema) });

      for (let attempt = 1; attempt <= STRUCTURED_JSON_MAX_ATTEMPTS; attempt += 1) {
        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${getGroqApiKey()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: activeModel, messages: toMessages(contents, config.responseJsonSchema), temperature: 0, max_tokens: outputTokenBudget }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const code = payload?.error?.code || "groq_request_failed";
          const diagnostic = {
            provider: "groq",
            capability,
            model: activeModel,
            mode: "prompted-json",
            attempt,
            httpStatus: response.status,
            errorCode: code,
            errorMessage: payload?.error?.message || null,
            failedGeneration: payload?.error?.failed_generation == null ? null : diagnosticText(payload.error.failed_generation),
            failedGenerationLength: payload?.error?.failed_generation == null ? null : String(payload.error.failed_generation).length,
            promptTokenCount: Number(payload?.usage?.prompt_tokens || 0),
            candidatesTokenCount: Number(payload?.usage?.completion_tokens || 0),
            totalTokenCount: Number(payload?.usage?.total_tokens || 0),
            finishReason: payload?.choices?.[0]?.finish_reason || null,
          };
          console.warn("Studio Groq JSON provider error diagnostic", diagnostic);
          throw createError(payload?.error?.message || `Groq request failed with status ${response.status}.`, response.status, code, { groqDiagnostic: diagnostic });
        }

        const rawText = payload?.choices?.[0]?.message?.content || "";
        try {
          const parsedJson = parseJsonObject(rawText);
          const result = createGroqResponse(payload, activeModel, parsedJson);
          console.info("Studio Groq JSON provider response diagnostic", {
            provider: "groq",
            capability,
            model: activeModel,
            attempt,
            promptTokenCount: result.usageMetadata.promptTokenCount,
            candidatesTokenCount: result.usageMetadata.candidatesTokenCount,
            totalTokenCount: result.usageMetadata.totalTokenCount,
            finishReason: result.finishReason,
            responseLength: rawText.length,
            responseValidJsonObject: true,
          });
          logAIUsage(result, activeModel, { provider: "groq", stage: "spec", capability });
          return result;
        } catch (parseError) {
          console.warn("Studio Groq JSON provider response parse failed", {
            provider: "groq",
            capability,
            model: activeModel,
            attempt,
            finishReason: payload?.choices?.[0]?.finish_reason || null,
            responseLength: rawText.length,
            responsePreview: diagnosticText(rawText),
          });
          if (attempt < STRUCTURED_JSON_MAX_ATTEMPTS) {
            await waitForRetry(STRUCTURED_JSON_RETRY_DELAY_MS, abortSignal);
            continue;
          }
          throw createError("Groq returned malformed structured JSON.", 502, "invalid_ai_response", {
            groqDiagnostic: {
              provider: "groq",
              capability,
              model: activeModel,
              attempt,
              finishReason: payload?.choices?.[0]?.finish_reason || null,
              promptTokenCount: Number(payload?.usage?.prompt_tokens || 0),
              candidatesTokenCount: Number(payload?.usage?.completion_tokens || 0),
              totalTokenCount: Number(payload?.usage?.total_tokens || 0),
              responseLength: rawText.length,
              responsePreview: diagnosticText(rawText),
            },
            cause: parseError,
          });
        }
      }
      throw createError("Groq structured JSON generation failed.", 502, "invalid_ai_response");
    } finally {
      if (abortSignal) abortSignal.removeEventListener("abort", abortForwarder);
    }
  },
});
