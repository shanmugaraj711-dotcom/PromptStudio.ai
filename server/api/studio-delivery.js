import { timingSafeEqual } from "node:crypto";
import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { publicDelivery, runDelivery } from "../studio/deliveryQueue.js";
import { createVercelDeliveryProvider } from "../studio/vercelDelivery.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET") return json(res, 405, { message: "Delivery accepts GET requests only." });
    if (req.query?.action === "worker") {
      const secret = process.env.STUDIO_DELIVERY_WORKER_SECRET;
      const expected = Buffer.from("Bearer " + (secret || ""));
      const actual = Buffer.from(req.headers.authorization || "");
      if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json(res, 401, { message: "Unauthorized worker." });
      const provider = createVercelDeliveryProvider();
      const db = adminDb();
      const due = await db.collection("studioDeliveries").where("nextRunAt", "<=", Date.now()).orderBy("nextRunAt").limit(1).get();
      if (due.empty) return json(res, 200, { ok: true, idle: true });
      const result = await runDelivery({ db, deliveryId: due.docs[0].id, provider });
      return json(res, 200, { ok: true, ...result });
    }
    const user = await requireUser(req);
    const db = adminDb();
    const deliveryId = String(req.query?.deliveryId || "");
    if (deliveryId) {
      if (!/^[A-Za-z0-9_-]{20,80}$/.test(deliveryId)) return json(res, 400, { message: "Invalid delivery ID." });
      const snap = await db.collection("studioDeliveries").doc(deliveryId).get();
      if (!snap.exists || snap.data().uid !== user.uid) return json(res, 404, { message: "Delivery not found." });
      return json(res, 200, { delivery: publicDelivery(snap.data()) });
    }
    // Recover the customer's deliveries after a refresh or a later sign-in.
    const snapshots = await db.collection("studioDeliveries").where("uid", "==", user.uid).get();
    const deliveries = snapshots.docs.map((s) => s.data()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(publicDelivery);
    return json(res, 200, { deliveries });
  } catch (error) {
    console.error("Studio delivery request failed", { message: error.message });
    return json(res, error.status || 503, { message: "Delivery status is temporarily unavailable. Your payment is safe; please try again later." });
  }
}
