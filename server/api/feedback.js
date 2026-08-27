import { adminDb, json, requireUser } from "./_firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed." });
  try {
    const decoded = await requireUser(req);
    const type = String(req.body?.type || "feedback").trim().slice(0, 30);
    const message = String(req.body?.message || "").trim();
    const page = String(req.body?.page || "").trim().slice(0, 200);
    const rating = Math.max(1, Math.min(5, Number(req.body?.rating || 5)));
    if (message.length < 5) return json(res, 400, { message: "Please provide a little more detail." });
    if (message.length > 4000) return json(res, 400, { message: "Feedback is too long." });

    const db = adminDb();
    const ref = await db.collection("feedback").add({
      uid: decoded.uid,
      email: decoded.email || null,
      type,
      rating,
      message,
      page,
      status: "new",
      createdAt: new Date(),
    });
    return json(res, 200, { ok: true, id: ref.id });
  } catch (error) {
    console.error("Feedback submission failed", { code: error?.code || "unknown" });
    return json(res, error?.status || 500, { message: "Could not send feedback." });
  }
}
