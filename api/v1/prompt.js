import generatePromptCredits from "../generate-prompt-credits.js";

/**
 * PromptStudio Integration API v1.
 *
 * This is intentionally a thin compatibility boundary over the existing,
 * server-authoritative credit-aware generation handler. It does not duplicate
 * quota, credit, billing, or Gemini business logic.
 *
 * Authentication, request validation, rate limiting, idempotency and credit
 * reservation therefore remain enforced by the existing core handler.
 */
export default async function handler(req, res) {
  res.setHeader("X-PromptStudio-API-Version", "v1");
  res.setHeader("Cache-Control", "no-store");
  return generatePromptCredits(req, res);
}
