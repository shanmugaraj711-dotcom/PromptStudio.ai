import crypto from "node:crypto";

const keyId = () => String(process.env.RAZORPAY_KEY_ID || "").trim();
const secret = () => String(process.env.RAZORPAY_KEY_SECRET || "").trim();

export const isConfigured = () => Boolean(keyId() && secret());

export const razorpayRequest = async (path, options = {}) => {
  if (!isConfigured()) throw new Error("Razorpay test keys are not configured.");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId()}:${secret()}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.description || "Razorpay request failed.");
    error.status = response.status;
    error.razorpay = data;
    throw error;
  }
  return data;
};

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const verifyOrderSignature = ({ orderId, paymentId, signature }) =>
  safeEqual(crypto.createHmac("sha256", secret()).update(`${orderId}|${paymentId}`).digest("hex"), signature);

export const verifySubscriptionSignature = ({ subscriptionId, paymentId, signature }) =>
  safeEqual(crypto.createHmac("sha256", secret()).update(`${paymentId}|${subscriptionId}`).digest("hex"), signature);

export const verifyWebhookSignature = (rawBody, signature) =>
  safeEqual(crypto.createHmac("sha256", String(process.env.RAZORPAY_WEBHOOK_SECRET || "")).update(rawBody).digest("hex"), signature);
