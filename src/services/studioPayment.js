export class StudioPaymentError extends Error {
  constructor(message, details = {}) { super(message); this.name = "StudioPaymentError"; Object.assign(this, details); }
}

const post = async (url, body, idToken, fetchImpl = fetch) => {
  if (!idToken) throw new StudioPaymentError("Your session has expired. Please sign in again.", { code: "unauthenticated" });
  let response;
  try {
    response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify(body) });
  } catch {
    throw new StudioPaymentError("We could not reach Studio payments. Please check your connection and try again.", { code: "network_error" });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new StudioPaymentError(payload.message || "Studio payment failed.", { code: payload.code, status: response.status });
  return payload;
};

const loadCheckout = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve(window.Razorpay);
  const existing = document.querySelector('script[data-promptstudio-razorpay]');
  if (existing) { existing.addEventListener("load", () => resolve(window.Razorpay)); existing.addEventListener("error", reject); return; }
  const script = document.createElement("script");
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  script.async = true;
  script.dataset.promptstudioRazorpay = "true";
  script.onload = () => resolve(window.Razorpay);
  script.onerror = () => reject(new StudioPaymentError("Unable to load secure Razorpay Checkout.", { code: "checkout_load_failed" }));
  document.body.appendChild(script);
});

export async function payForStudioBuild({ user, idToken, studioBuildRequestId, acceptedFiles, fetchImpl = fetch, onSuccess }) {
  const order = await post("/api/studio-build-order", { studioBuildRequestId, acceptedFiles }, idToken, fetchImpl);
  if (order.alreadyPaid) { await onSuccess?.(order); return order; }
  if (!order.orderId || !order.studioBuildRequestId || !order.acceptedRevisionId) throw new StudioPaymentError("Studio did not return a valid payment order.", { code: "invalid_order_response" });
  const Razorpay = await loadCheckout();
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "PromptStudio AI",
      description: "PromptStudio Studio build",
      order_id: order.orderId,
      prefill: { name: user?.displayName || "", email: user?.email || "" },
      theme: { color: "#4f46e5" },
      handler: async (response) => {
        try {
          const result = await post("/api/studio-build-verify", { studioBuildRequestId: order.studioBuildRequestId, ...response }, idToken, fetchImpl);
          await onSuccess?.(result);
          resolve(result);
        } catch (error) { reject(error); }
      },
      modal: { ondismiss: () => reject(new StudioPaymentError("Payment window closed.", { code: "checkout_dismissed" })) },
    });
    checkout.open();
  });
}
