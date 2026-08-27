import { adminDb, json, requireUser } from "./_firebaseAdmin.js";

const serialize = (doc) => {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || null,
  };
};

export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    const db = adminDb();

    if (req.method === "GET") {
      const snapshot = await db.collection("supportMessages").where("uid", "==", decoded.uid).limit(50).get();
      const messages = snapshot.docs.map(serialize).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      return json(res, 200, { messages });
    }

    if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
    const message = String(req.body?.message || "").trim();
    const page = String(req.body?.page || "").trim().slice(0, 200);
    const transactionId = String(req.body?.transactionId || "").trim().slice(0, 200);
    if (message.length < 3) return json(res, 400, { message: "Message is too short." });
    if (message.length > 2000) return json(res, 400, { message: "Message is too long." });

    const ref = await db.collection("supportMessages").add({
      uid: decoded.uid,
      email: decoded.email || null,
      message,
      page,
      transactionId: transactionId || null,
      status: "new",
      createdAt: new Date(),
    });
    return json(res, 200, { ok: true, id: ref.id });
  } catch (error) {
    console.error("Support message failed", { code: error?.code || "unknown" });
    return json(res, error?.status || 500, { message: "Could not process your support message." });
  }
}
