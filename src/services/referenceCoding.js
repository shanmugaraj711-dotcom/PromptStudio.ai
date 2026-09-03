import { PromptGenerationError } from './promptGenerator';

export async function generateReferenceCoding({ idea, idToken, requestId, images = [], referenceFiles = [], outputFormat = 'notsure', targetAI = 'any', fetchImpl = fetch }) {
  if (!idToken) throw new PromptGenerationError('Your session has expired. Please sign in again.', { code: 'unauthenticated' });
  let response;
  try {
    response = await fetchImpl('/api/reference-coding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        idea,
        aiModel: 'chatgpt',
        category: 'coding',
        requestId,
        images,
        referenceFiles,
        outputFormat,
        targetAI,
      }),
    });
  } catch {
    throw new PromptGenerationError('We could not reach the generation service. Please check your connection and try again.', { code: 'network_error' });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new PromptGenerationError(payload.message || 'Unable to generate a coding prompt right now. Please try again.', { code: payload.code, quota: payload.quota, creditsRemaining: payload.creditsRemaining, creditCost: payload.creditCost });
  if (!payload.prompt || !Array.isArray(payload.perspectives) || payload.perspectives.length < 3 || !payload.quota) {
    throw new PromptGenerationError('The generation service returned an incomplete intelligence response.', { code: 'invalid_response', quota: payload.quota });
  }
  return payload;
}

export const createRequestId = () => globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `coding-${Date.now()}-${Math.random().toString(36).slice(2)}`;
