import { createAIProvider } from "../studio/aiProvider.js";
import { STUDIO_AI_CAPABILITIES } from "../studio/aiModelConfig.js";

const DIAGNOSTIC_KEY = "ps-groq-diag-7f3c9a21b6e54d0f";
const aiProvider = createAIProvider();

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === "production") return res.status(404).json({ message: "Not found." });
  if (req.method !== "GET") return res.status(405).json({ message: "Use GET." });
  if (String(req.query?.key || "") !== DIAGNOSTIC_KEY) return res.status(404).json({ message: "Not found." });
  if (aiProvider.name !== "groq") return res.status(409).json({ provider: aiProvider.name, message: "Diagnostic requires Groq provider selection." });

  const startedAt = Date.now();
  try {
    const result = await aiProvider.generateStructuredSpec({
      capability: STUDIO_AI_CAPABILITIES.STRUCTURED_JSON_SPEC,
      contents: "Return only this JSON object: {\"ok\":true}",
      config: { maxOutputTokens: 32 },
    });
    return res.status(200).json({
      ok: true,
      provider: result.provider,
      model: result.model,
      text: result.text,
      usageMetadata: result.usageMetadata,
      finishReason: result.finishReason,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      provider: aiProvider.name,
      durationMs: Date.now() - startedAt,
      error: {
        code: error?.code || null,
        status: Number(error?.status || 0) || null,
        message: String(error?.message || "unknown").slice(0, 500),
        groqDiagnostic: error?.groqDiagnostic || null,
      },
    });
  }
}
