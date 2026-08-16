import { FieldValue } from "firebase-admin/firestore";
import { adminDb, json } from "./_firebaseAdmin.js";
import { verifyWebhookSignature } from "./_razorpay.js";

export const config = { api: { bodyParser: false } };

const readRawBody = async (req) => {
  if (typeof req.body === "string") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
};

const fulfillCreditWebhook = async (orderId, paymentId) => {
  if (!orderId) return;
  const db = adminDb();
  const ref = db.collection("paymentOrders").doc(orderId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().fulfilled === true) return;
    const payment = snap.data();
    const userRef = db.collection("users").doc(payment.uid);
    const userSnap = await tx.get(userRef);
    const user = userSnap.exists ? userSnap.data() : {};
    tx.set(userRef, { credits: Math.max(Number(user.credits || 0), 0) + Math.max(Number(payment.credits || 0), 0), quotaVersion: FieldValue.increment(1) }, { merge: true });
    tx.set(ref, { fulfilled: true, status: "paid", paymentId, paidAt: new Date() }, { merge: true });
  });
};

const updateSubscription = async (subscription, event) => {
  const subscriptionId = subscription?.id;
  if (!subscriptionId) return;
  const db = adminDb();
  const ref = db.collection("paymentSubscriptions").doc(subscriptionId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const stored = snap.data();
  const status = subscription.status || event.replace("subscription.", "");
  const userRef = db.collection("users").doc(stored.uid);
  const active = ["active", "authenticated", "resumed"].includes(status);
  const ended = ["cancelled", "completed", "halted"].includes(status);
  await db.runTransaction(async (tx) => {
    if (ended) tx.set(userRef, { plan: "free", subscriptionStatus: status, quotaVersion: FieldValue.increment(1) }, { merge: true });
    else if (active) tx.set(userRef, { plan: "pro", subscriptionStatus: status, subscriptionBilling: stored.billing, razorpaySubscriptionId: subscriptionId, quotaVersion: FieldValue.increment(1) }, { merge: true });
    else tx.set(userRef, { subscriptionStatus: status, quotaVersion: FieldValue.increment(1) }, { merge: true });
    tx.set(ref, { status, lastWebhookEvent: event, updatedAt: new Date() }, { merge: true });
  });
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  const rawBody = await readRawBody(req);
  const signature = req.headers["x-razorpay-signature"] || "";
  if (!signature || !verifyWebhookSignature(rawBody, signature)) return json(res, 400, { message: "Invalid webhook signature." });
  try {
    const payload = JSON.parse(rawBody);
    const event = payload.event || "";
    const eventId = req.headers["x-razorpay-event-id"] || `${event}:${payload?.payload?.payment?.entity?.id || payload?.payload?.subscription?.entity?.id || Date.now()}`;
    const db = adminDb();
    const eventRef = db.collection("paymentWebhookEvents").doc(String(eventId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150));
    if ((await eventRef.get()).exists) return json(res, 200, { ok: true, duplicate: true });
    await eventRef.set({ event, receivedAt: new Date() });
    if (event === "payment.captured") {
      const payment = payload?.payload?.payment?.entity;
      await fulfillCreditWebhook(payment?.order_id, payment?.id);
    }
    if (event.startsWith("subscription.")) await updateSubscription(payload?.payload?.subscription?.entity, event);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("Razorpay webhook failed", { code: error?.code || "unknown" });
    return json(res, 500, { message: "Webhook processing failed." });
  }
}
