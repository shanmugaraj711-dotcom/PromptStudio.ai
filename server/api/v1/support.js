import { adminDb, json, requireUser } from "../_firebaseAdmin.js";

const serialize = (doc) => {
  const data = doc.data() || {};
  return {
    id: doc.id,
    message: data.message || "",
    page: data.page || null,
    transactionId: data.transactionId || null,
    status: data.status || "new",
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || null,
  };
};

export default async function handler(req, res) {
  res.setHeader("X-PromptStudio-API-Version", "v1");
  res.setHeader("Cache-Control", "no-store");
  try {
    const decoded = await requireUser(req);
    const db = adminDb();
    if (req.method === "GET") {
      const snapshot = await db.collection("supportMessages").where("uid", "==", decoded.uid).limit(50).get();
      return json(res, 200, { messages: snapshot.docs.map(serialize).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) });
    }
    if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Use GET or POST for support." });
    const body = req.body || {};
    const message = String(body.message || "").trim();
    const page = String(body.page || "").trim().slice(0, 200);
    const transactionId = String(body.transactionId || "").trim().slice(0, 200);
    if (message.length < 3) return json(res, 400, { code: "invalid_message", message: "Message is too short." });
    if (message.length > 2000) return json(res, 400, { code: "invalid_message", message: "Message is too long." });
    const ref = await db.collection("supportMessages").add({ uid: decoded.uid, email: decoded.email || null, message, page, transactionId: transactionId || null, status: "new", source: "api_v1", createdAt: new Date() });
    return json(res, 201, { ok: true, id: ref.id, status: "new" });
  } catch (error) {
    console.error("Integration support request failed", { code: error?.code || "unknown" });
    return json(res, error?.status || 500, { code: "support_request_failed", message: "Could not process your support request." });
  }
}
