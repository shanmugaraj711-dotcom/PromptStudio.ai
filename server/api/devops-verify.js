import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest, verifyOrderSignature } from "./_razorpay.js";

/* DevOps Kit payment verification. Checks the Razorpay signature, then
   checks Razorpay itself that the order is really paid, and only then
   writes the entitlement. Safe to call twice — the second call is a
   no-op that returns the same success. */
/* One order, one or two fields: the bundle unlocks both phases at
   once, so it writes both entitlement fields and both timestamps. */
const ORDER_FIELDS = {
  phase1: ["devopsPhase1"],
  phase2: ["devopsPhase2"],
  bundle: ["devopsPhase1", "devopsPhase2"],
};
const ORDER_AT = {
  phase1: ["devopsPhase1At"],
  phase2: ["devopsPhase2At"],
  bundle: ["devopsPhase1At", "devopsPhase2At"],
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Payments are not set up yet." });
  try {
    const decoded = await requireUser(req);
    const body = req.body || {};
    if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
      return json(res, 400, { message: "Incomplete payment response." });
    }
    const db = adminDb();
    const orderSnap = await db.collection("paymentOrders").doc(body.razorpay_order_id).get();
    if (!orderSnap.exists) return json(res, 403, { message: "Payment order is not valid for this account." });
    const orderData = orderSnap.data();
    if (orderData.uid !== decoded.uid) return json(res, 403, { message: "Payment order is not valid for this account." });
    if (orderData.type !== "devops" || !ORDER_FIELDS[orderData.phase]) {
      return json(res, 400, { message: "This order is not a DevOps Kit order." });
    }
    if (!verifyOrderSignature({ orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature })) {
      return json(res, 400, { code: "invalid_signature", message: "Payment verification failed." });
    }
    const order = await razorpayRequest(`/orders/${encodeURIComponent(body.razorpay_order_id)}`);
    if (order.status !== "paid") {
      return json(res, 409, { code: "payment_not_captured", message: "Payment is not captured yet. Please wait a moment and refresh." });
    }
    const fields = ORDER_FIELDS[orderData.phase];
    const atFields = ORDER_AT[orderData.phase];
    const userRef = db.collection("users").doc(decoded.uid);
    const paymentRef = db.collection("paymentOrders").doc(body.razorpay_order_id);
    await db.runTransaction(async (tx) => {
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists) throw new Error("Payment order was not found.");
      if (paymentSnap.data().fulfilled === true) return;
      var grant = {};
      fields.forEach(function (f) { grant[f] = true; });
      atFields.forEach(function (f) { grant[f] = new Date(); });
      tx.set(userRef, grant, { merge: true });
      tx.set(paymentRef, { fulfilled: true, status: "paid", paymentId: body.razorpay_payment_id, paidAt: new Date() }, { merge: true });
    });
    return json(res, 200, {
      ok: true,
      phase: orderData.phase,
      amountInr: orderData.amountInr,
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
    });
  } catch (error) {
    console.error("DevOps verification failed", { code: error?.code || "unknown" });
    return json(res, error.status || 500, { code: "payment_verification_failed", message: error.message || "Payment verification failed." });
  }
}
