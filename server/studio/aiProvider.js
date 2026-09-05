import { GoogleGenAI } from "@google/genai";

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
    return getGeminiClient().models.generateContent({ model, contents, config });
  },
});
