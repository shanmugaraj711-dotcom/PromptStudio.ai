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
  if (!orderId) {
    const error = new Error("Captured payment is missing its Razorpay order id.");
    error.code = "payment_order_missing";
    throw error;
  }

  const db = adminDb();
  const ref = db.collection("paymentOrders").doc(orderId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const error = new Error("Payment order was not found for the captured payment.");
      error.code = "payment_order_not_found";
      throw error;
    }

    const payment = snap.data() || {};
    if (payment.fulfilled === true) {
      return { fulfilled: false, alreadyFulfilled: true };
    }

    const userRef = db.collection("users").doc(payment.uid);
    const userSnap = await tx.get(userRef);
    const user = userSnap.exists ? userSnap.data() : {};
    const credits = Math.max(Number(payment.credits || 0), 0);

    if (!payment.uid || !Number.isInteger(credits) || credits <= 0) {
      const error = new Error("Payment order has invalid credit fulfillment data.");
      error.code = "invalid_payment_order";
      throw error;
    }

    tx.set(userRef, {
      credits: Math.max(Number(user.credits || 0), 0) + credits,
      quotaVersion: FieldValue.increment(1),
    }, { merge: true });
    tx.set(ref, {
      fulfilled: true,
      status: "paid",
      paymentId,
      paidAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    return { fulfilled: true, alreadyFulfilled: false };
  });
};

const markCreditPaymentFailed = async (orderId, paymentId) => {
  if (!orderId) return;
  await adminDb().collection("paymentOrders").doc(orderId).set({
    status: "failed",
    paymentId: paymentId || null,
    failedAt: new Date(),
  }, { merge: true });
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
    const eventKey = String(eventId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150);
    const db = adminDb();
    const eventRef = db.collection("paymentWebhookEvents").doc(eventKey);
    const existing = await eventRef.get();

    if (existing.exists && existing.data()?.status === "processed") {
      return json(res, 200, { ok: true, duplicate: true });
    }

    await eventRef.set({
      event,
      status: "processing",
      attempts: FieldValue.increment(1),
      lastAttemptAt: new Date(),
    }, { merge: true });

    if (event === "payment.captured") {
      const payment = payload?.payload?.payment?.entity;
      await fulfillCreditWebhook(payment?.order_id, payment?.id);
    }

    if (event === "payment.failed") {
      const payment = payload?.payload?.payment?.entity;
      await markCreditPaymentFailed(payment?.order_id, payment?.id);
    }

    if (event.startsWith("subscription.")) {
      await updateSubscription(payload?.payload?.subscription?.entity, event);
    }

    await eventRef.set({
      status: "processed",
      processedAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("Razorpay webhook failed", { code: error?.code || "unknown" });

    try {
      const payload = JSON.parse(rawBody);
      const event = payload.event || "";
      const eventId = req.headers["x-razorpay-event-id"] || `${event}:${payload?.payload?.payment?.entity?.id || payload?.payload?.subscription?.entity?.id || "unknown"}`;
      const eventKey = String(eventId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150);
      await adminDb().collection("paymentWebhookEvents").doc(eventKey).set({
        status: "failed",
        lastErrorCode: error?.code || "unknown",
        lastFailedAt: new Date(),
      }, { merge: true });
    } catch (auditError) {
      console.error("Razorpay webhook audit update failed", { code: auditError?.code || "unknown" });
    }

    return json(res, 500, { message: "Webhook processing failed." });
  }
}
