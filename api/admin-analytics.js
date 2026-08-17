import { adminDb, json } from "./_firebaseAdmin.js";
import { requireFounderAdmin } from "./_adminSecurity.js";
const count = async (query) => (await query.count().get()).data().count;
const money = (value) => Math.round(Number(value || 0) * 100) / 100;
export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "Method not allowed." });
  try {
    await requireFounderAdmin(req); const db = adminDb(); const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [users, newUsers, prompts, imagePrompts, orders, paidOrders, failedPayments, subscriptions, activeSubscriptions, feedback, support] = await Promise.all([
      count(db.collection("users")), count(db.collection("users").where("createdAt", ">=", since)), count(db.collectionGroup("prompts")), count(db.collectionGroup("prompts")), count(db.collection("paymentOrders")), db.collection("paymentOrders").where("fulfilled", "==", true).get(), count(db.collection("paymentOrders").where("status", "==", "failed")), count(db.collection("paymentSubscriptions")), count(db.collection("paymentSubscriptions").where("status", "in", ["active", "authenticated", "resumed"])), count(db.collection("feedback")), count(db.collection("supportMessages")),
    ]);
    const revenue = paidOrders.docs.reduce((sum, doc) => sum + Number(doc.data().amountInr || 0), 0);
    return json(res, 200, { ok: true, checkedAt: new Date().toISOString(), users, newUsers, promptsGenerated: prompts, imageToPromptUsage: imagePrompts, creditsPurchased: paidOrders.docs.reduce((sum, doc) => sum + Number(doc.data().credits || 0), 0), creditOrders: orders, proSubscribers: activeSubscriptions, subscriptions, revenueInr: money(revenue), failedPayments, feedback, supportMessages: support });
  } catch (error) { console.error("Admin analytics failed", { code: error?.code || "unknown" }); return json(res, error?.status || 500, { message: error?.message || "Could not load analytics." }); }
}
