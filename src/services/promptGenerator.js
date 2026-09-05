export class PromptGenerationError extends Error {
  constructor(message, { code, quota, creditsRemaining, creditCost } = {}) {
    super(message);
    this.name = "PromptGenerationError";
    this.code = code;
    this.quota = quota;
    this.creditsRemaining = creditsRemaining;
    this.creditCost = creditCost;
  }
}

const sanitizeServiceMessage = (message) => {
  const text = String(message || "").trim();
  if (!text) return "Unable to generate a prompt right now. Please try again.";
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error?.message || parsed?.error?.code || parsed?.error?.status) {
      return "Studio AI is busy right now. Please try again in a moment.";
    }
  } catch {
    // Keep normal server messages; only provider-shaped JSON is hidden.
  }
  if (/high demand|temporarily unavailable|service unavailable|overloaded/i.test(text)) {
    return "Studio AI is busy right now. Please try again in a moment.";
  }
  return text;
};

export async function generatePrompt({
  idea,
  aiModel,
  category,
  idToken,
  requestId,
  image,
  fetchImpl = fetch,
}) {
  if (!idToken) throw new PromptGenerationError("Your session has expired. Please sign in again.", { code: "unauthenticated" });
  let response;
  try {
    response = await fetchImpl("/api/generate-prompt-credits", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ idea, aiModel, category, requestId, image }),
    });
  } catch {
    throw new PromptGenerationError("We could not reach the generation service. Please check your connection and try again.", { code: "network_error" });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new PromptGenerationError(sanitizeServiceMessage(payload.message), { code: payload.code, quota: payload.quota, creditsRemaining: payload.creditsRemaining, creditCost: payload.creditCost });
  if (!payload.prompt || !Array.isArray(payload.perspectives) || payload.perspectives.length < 3 || !payload.quota) throw new PromptGenerationError("The generation service returned an incomplete intelligence response.", { code: "invalid_response", quota: payload.quota });
  return payload;
}
