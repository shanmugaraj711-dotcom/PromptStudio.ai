import { FieldValue } from "firebase-admin/firestore";
import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest, verifyOrderSignature, verifySubscriptionSignature } from "./_razorpay.js";

const applyCredits = async (uid, paymentId, orderId) => {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const paymentRef = db.collection("paymentOrders").doc(orderId);
  await db.runTransaction(async (tx) => {
    const [paymentSnap, userSnap] = await Promise.all([tx.get(paymentRef), tx.get(userRef)]);
    if (!paymentSnap.exists) throw new Error("Payment order was not found.");
    const payment = paymentSnap.data();
    if (payment.uid !== uid) throw new Error("Payment does not belong to this account.");
    if (payment.fulfilled === true) return;
    const user = userSnap.exists ? userSnap.data() : {};
    const credits = Math.max(Number(user.credits || 0), 0) + Math.max(Number(payment.credits || 0), 0);
    tx.set(userRef, { credits, quotaVersion: FieldValue.increment(1) }, { merge: true });
    tx.set(paymentRef, { fulfilled: true, status: "paid", paymentId, paidAt: new Date() }, { merge: true });
  });
};

const activatePro = async (uid, subscriptionId, billing) => {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const subRef = db.collection("paymentSubscriptions").doc(subscriptionId);
  await db.runTransaction(async (tx) => {
    const [subSnap, userSnap] = await Promise.all([tx.get(subRef), tx.get(userRef)]);
    if (!subSnap.exists) throw new Error("Subscription was not found.");
    const sub = subSnap.data();
    if (sub.uid !== uid) throw new Error("Subscription does not belong to this account.");
    if (sub.fulfilled === true) return;
    tx.set(userRef, { plan: "pro", subscriptionStatus: "active", subscriptionBilling: billing, razorpaySubscriptionId: subscriptionId, quotaVersion: FieldValue.increment(1) }, { merge: true });
    tx.set(subRef, { fulfilled: true, status: "active", activatedAt: new Date() }, { merge: true });
  });
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay is not configured." });
  try {
    const decoded = await requireUser(req);
    const body = req.body || {};
    if (body.type === "credit") {
      if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) return json(res, 400, { message: "Incomplete payment response." });
      const orderSnap = await adminDb().collection("paymentOrders").doc(body.razorpay_order_id).get();
      if (!orderSnap.exists || orderSnap.data().uid !== decoded.uid) return json(res, 403, { message: "Payment order is not valid for this account." });
      if (!verifyOrderSignature({ orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature })) return json(res, 400, { code: "invalid_signature", message: "Payment verification failed." });
      const order = await razorpayRequest(`/orders/${encodeURIComponent(body.razorpay_order_id)}`);
      if (order.status !== "paid") return json(res, 409, { code: "payment_not_captured", message: "Payment is not captured yet. Please wait a moment and refresh." });
      await applyCredits(decoded.uid, body.razorpay_payment_id, body.razorpay_order_id);
      return json(res, 200, { ok: true, type: "credit", creditsAdded: orderSnap.data().credits });
    }
    if (body.type === "subscription") {
      if (!body.razorpay_subscription_id || !body.razorpay_payment_id || !body.razorpay_signature) return json(res, 400, { message: "Incomplete subscription response." });
      const subSnap = await adminDb().collection("paymentSubscriptions").doc(body.razorpay_subscription_id).get();
      if (!subSnap.exists || subSnap.data().uid !== decoded.uid) return json(res, 403, { message: "Subscription is not valid for this account." });
      if (!verifySubscriptionSignature({ subscriptionId: body.razorpay_subscription_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature })) return json(res, 400, { code: "invalid_signature", message: "Subscription verification failed." });
      const subscription = await razorpayRequest(`/subscriptions/${encodeURIComponent(body.razorpay_subscription_id)}`);
      if (!["active", "authenticated"].includes(subscription.status)) return json(res, 409, { code: "subscription_not_active", message: `Subscription is currently ${subscription.status}.` });
      await activatePro(decoded.uid, body.razorpay_subscription_id, subSnap.data().billing);
      return json(res, 200, { ok: true, type: "subscription", plan: "pro" });
    }
    return json(res, 400, { message: "Unknown payment type." });
  } catch (error) {
    console.error("Razorpay verification failed", { code: error?.code || "unknown" });
    return json(res, error.status || 500, { code: "payment_verification_failed", message: error.message || "Payment verification failed." });
  }
}
