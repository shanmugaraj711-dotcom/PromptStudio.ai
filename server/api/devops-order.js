import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest } from "./_razorpay.js";

/* DevOps Kit order creation. Prices are fixed here, on the server —
   the client never chooses an amount. One order per phase. */
const PHASES = {
  phase1: { priceInr: 399, name: "DevOps Kit — Phase 1: The Data Tier" },
  phase2: { priceInr: 799, name: "DevOps Kit — Phase 2: The Rest of DevOps" },
};
const PHASE_FIELD = { phase1: "devopsPhase1", phase2: "devopsPhase2" };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Payments are not set up yet." });
  try {
    const decoded = await requireUser(req);
    const phase = req.body?.phase;
    if (!PHASES[phase]) return json(res, 400, { message: "Choose Phase 1 or Phase 2." });
    const db = adminDb();
    const userSnap = await db.collection("users").doc(decoded.uid).get();
    if (userSnap.exists && userSnap.data()?.[PHASE_FIELD[phase]] === true) {
      return json(res, 409, { code: "already_owned", message: "You already own this phase." });
    }
    const amountInr = PHASES[phase].priceInr;
    const receipt = `dk_${phase}_${Date.now()}_${decoded.uid.slice(0, 8)}`.slice(0, 40);
    const order = await razorpayRequest("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: amountInr * 100,
        currency: "INR",
        receipt,
        notes: { uid: decoded.uid, type: "devops", phase },
        partial_payment: false,
      }),
    });
    await db.collection("paymentOrders").doc(order.id).set({
      uid: decoded.uid,
      type: "devops",
      phase,
      amountInr,
      status: "created",
      razorpayOrderId: order.id,
      createdAt: new Date(),
    });
    return json(res, 200, {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      phase,
      amountInr,
    });
  } catch (error) {
    console.error("DevOps order creation failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: "payment_order_failed", message: error.message || "Could not start checkout." });
  }
}
