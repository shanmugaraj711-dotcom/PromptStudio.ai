import generatePromptCredits from "../generate-prompt-credits.js";
import { integrationError, requestId, requireJson, setIntegrationHeaders } from "./_integration.js";

export default async function handler(req, res) {
  const id = requestId(req);
  setIntegrationHeaders(res, id);
  res.setHeader("X-PromptStudio-API-Version", "v1");

  if (req.method !== "POST") {
    return integrationError(res, 405, "method_not_allowed", "Use POST for prompt generation.", id);
  }
  if (!requireJson(req, res, id)) return;

  try {
    return await generatePromptCredits(req, res);
  } catch (error) {
    console.error("Integration prompt request failed", { requestId: id, code: error?.code || "unknown" });
    return integrationError(res, 500, "integration_request_failed", "Prompt generation could not be completed.", id);
  }
}
