import { GoogleGenAI } from "@google/genai";

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

export const createAIProvider = () => ({
  name: "gemini",
  async generateStructuredSpec({ model, contents, config }) {
    const activeModel = TEMPORARY_GEMINI_MODEL;
    console.info("Studio AI temporary model override active", {
      requestedModel: model,
      activeModel,
      temporaryOverride: true,
      reason: TEMPORARY_OVERRIDE_REASON,
    });
    return getGeminiClient().models.generateContent({ model: activeModel, contents, config });
  },
});
