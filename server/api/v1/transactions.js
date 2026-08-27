import { adminDb, json, requireUser } from "../_firebaseAdmin.js";

const serializeDate = (value) => value?.toDate?.()?.toISOString?.() || value || null;

export default async function handler(req, res) {
  res.setHeader("X-PromptStudio-API-Version", "v1");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return json(res, 405, { code: "method_not_allowed", message: "Use GET to retrieve transactions." });
  try {
    const decoded = await requireUser(req);
    const limit = Math.min(Math.max(Number(req.query?.limit || 20), 1), 50);
    const snapshot = await adminDb().collection("paymentOrders").where("uid", "==", decoded.uid).limit(limit).get();
    const transactions = snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        orderId: data.razorpayOrderId || doc.id,
        paymentId: data.paymentId || null,
        amountInr: Number(data.amountInr || 0),
        credits: Number(data.credits || 0),
        packId: data.packId || "credit_topup",
        status: data.status || (data.fulfilled ? "paid" : "pending"),
        fulfilled: data.fulfilled === true,
        createdAt: serializeDate(data.createdAt),
        paidAt: serializeDate(data.paidAt),
      };
    }).sort((a, b) => new Date(b.paidAt || b.createdAt || 0) - new Date(a.paidAt || a.createdAt || 0));
    return json(res, 200, { transactions });
  } catch (error) {
    console.error("Integration transaction lookup failed", { code: error?.code || "unknown" });
    return json(res, error?.status || 500, { code: "transaction_lookup_failed", message: "Could not retrieve transactions." });
  }
}
