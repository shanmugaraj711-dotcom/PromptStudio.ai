export async function createShareablePrompt(prompt, idToken) {
  const response = await fetch('/api/share-prompt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ prompt }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'Unable to create a share link.');
    error.code = payload.code;
    throw error;
  }
  return payload;
}

export async function fetchSharedPrompt(shareId) {
  const response = await fetch(`/api/share-prompt?id=${encodeURIComponent(shareId)}`, {
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'This share link is invalid or expired.');
    error.code = payload.code;
    throw error;
  }
  return payload;
}
