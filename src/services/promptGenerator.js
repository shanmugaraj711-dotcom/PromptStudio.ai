export class PromptGenerationError extends Error {
  constructor(message, { code, quota } = {}) {
    super(message);
    this.name = "PromptGenerationError";
    this.code = code;
    this.quota = quota;
  }
}

export async function generatePrompt({
  idea,
  aiModel,
  category,
  idToken,
  requestId,
  image,
  fetchImpl = fetch,
}) {
  if (!idToken) {
    throw new PromptGenerationError("Your session has expired. Please sign in again.", {
      code: "unauthenticated",
    });
  }

  let response;
  try {
    response = await fetchImpl("/api/generate-prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ idea, aiModel, category, requestId, image }),
    });
  } catch {
    throw new PromptGenerationError(
      "We could not reach the generation service. Please check your connection and try again.",
      { code: "network_error" }
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PromptGenerationError(
      payload.message || "Unable to generate a prompt right now. Please try again.",
      { code: payload.code, quota: payload.quota }
    );
  }

  if (!payload.prompt || !Array.isArray(payload.perspectives) || payload.perspectives.length < 3 || !payload.quota) {
    throw new PromptGenerationError("The generation service returned an incomplete intelligence response.", {
      code: "invalid_response",
      quota: payload.quota,
    });
  }

  return payload;
}
