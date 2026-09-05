import { GoogleGenAI } from "@google/genai";
import { createGroqProvider } from "./groqProvider.js";
import { logAIUsage } from "./aiUsage.js";

// TEMPORARY OVERRIDE: use 3.5-Lite while 3.7/3.6 daily quotas are exhausted.
// Revisit after the daily quota reset; do not treat this as the permanent model choice.
const TEMPORARY_GEMINI_MODEL = "gemini-3.5-flash-lite";
const TEMPORARY_OVERRIDE_REASON = "using 3.5-Lite due to 3.7/3.6 daily quota exhaustion";

const getGeminiClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("Studio AI is not configured yet.");
    error.status = 503;
    error.code = "server_configuration_error";
    throw error;
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const createGeminiProvider = () => ({
  name: "gemini",
  async generateStructuredSpec({ model, contents, config }) {
    const activeModel = TEMPORARY_GEMINI_MODEL;
    console.info("Studio AI temporary model override active", {
      requestedModel: model,
      activeModel,
      temporaryOverride: true,
      reason: TEMPORARY_OVERRIDE_REASON,
    });
    const response = await getGeminiClient().models.generateContent({ model: activeModel, contents, config });
    logAIUsage(response, activeModel, { provider: "gemini", stage: "spec", requestedModel: model });
    return response;
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
