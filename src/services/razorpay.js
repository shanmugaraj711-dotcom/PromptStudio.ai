let checkoutPromise;

const loadCheckout = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutPromise) return checkoutPromise;
  checkoutPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-promptstudio-razorpay]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Razorpay));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.promptstudioRazorpay = "true";
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error("Unable to load secure Razorpay Checkout."));
    document.body.appendChild(script);
  });
  return checkoutPromise;
};

const authHeaders = async (user) => ({ Authorization: `Bearer ${await user.getIdToken()}` });
const post = async (url, body, user) => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders(user)) }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to start payment.");
  return data;
};

const openCreditCheckout = async ({ user, order, description, onSuccess }) => {
  const Razorpay = await loadCheckout();
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "PromptStudio AI",
      description,
      order_id: order.orderId,
      prefill: { name: user.displayName || "", email: user.email || "" },
      theme: { color: "#4f46e5" },
      handler: async (response) => {
        try {
          const result = await post("/api/razorpay-verify", { type: "credit", ...response }, user);
          await onSuccess?.(result);
          resolve(result);
        } catch (error) { reject(error); }
      },
      modal: { ondismiss: () => reject(new Error("Payment window closed.")) },
    });
    checkout.open();
  });
};

export const buyCredits = async ({ user, packId = "creator", onSuccess }) => {
  const order = await post("/api/razorpay-order", { packId }, user);
  return openCreditCheckout({ user, order, description: `${order.credits} Creator Credits`, onSuccess });
};

export const buyCustomCredits = async ({ user, amountInr, onSuccess }) => {
  const order = await post("/api/razorpay-order", { customAmountInr: amountInr }, user);
  return openCreditCheckout({ user, order, description: `${order.credits} Custom Creator Credits`, onSuccess });
};

export const subscribeToPro = async ({ user, billing, onSuccess }) => {
  const Razorpay = await loadCheckout();
  const subscription = await post("/api/razorpay-subscription", { billing }, user);
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: subscription.keyId,
      subscription_id: subscription.subscriptionId,
      name: subscription.name,
      description: subscription.description,
      prefill: { name: user.displayName || "", email: user.email || "" },
      theme: { color: "#4f46e5" },
      handler: async (response) => {
        try {
          const result = await post("/api/razorpay-verify", { type: "subscription", ...response }, user);
          await onSuccess?.(result);
          resolve(result);
        } catch (error) { reject(error); }
      },
      modal: { ondismiss: () => reject(new Error("Payment window closed.")) },
    });
    checkout.open();
  });
};
