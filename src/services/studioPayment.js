export class StudioPaymentError extends Error {
  constructor(message, details = {}) { super(message); this.name = "StudioPaymentError"; Object.assign(this, details); }
}

const post = async (url, body, idToken, fetchImpl = fetch) => {
  if (!idToken) throw new StudioPaymentError("Your session has expired. Please sign in again.", { code: "unauthenticated" });
  let response;
  try {
    response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify(body) });
  } catch {
    throw new StudioPaymentError("We could not reach Studio. Please check your connection and try again.", { code: "network_error" });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new StudioPaymentError(payload.message || "Studio credit checkout failed.", { code: payload.code, status: response.status, creditsRequired: payload.creditsRequired, creditsRemaining: payload.creditsRemaining });
  return payload;
};

export async function payForStudioBuild({ idToken, studioBuildRequestId, acceptedFiles, fetchImpl = fetch, onSuccess }) {
  const checkout = await post("/api/studio-build-order", { studioBuildRequestId, acceptedFiles }, idToken, fetchImpl);
  if (!checkout.ok || !checkout.studioBuildRequestId || !checkout.acceptedRevisionId || !checkout.creditCost) throw new StudioPaymentError("Studio did not return a valid credit checkout.", { code: "invalid_checkout_response" });
  if (checkout.alreadyPaid) { await onSuccess?.(checkout); return checkout; }
  const result = await post("/api/studio-build-verify", { studioBuildRequestId: checkout.studioBuildRequestId }, idToken, fetchImpl);
  await onSuccess?.(result);
  return result;
}
