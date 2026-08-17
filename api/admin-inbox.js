import { adminDb, json } from "./_firebaseAdmin.js";
import { requireFounderAdmin } from "./_adminSecurity.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "Method not allowed." });
  try {
    await requireFounderAdmin(req);
    const db = adminDb();
    const [supportSnap, feedbackSnap] = await Promise.all([
      db.collection("supportMessages").orderBy("createdAt", "desc").limit(20).get(),
      db.collection("feedback").orderBy("createdAt", "desc").limit(20).get(),
    ]);
    const mapDocs = (snap) => snap.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null };
    });
    return json(res, 200, { ok: true, support: mapDocs(supportSnap), feedback: mapDocs(feedbackSnap) });
  } catch (error) {
    console.error("Admin inbox failed", { code: error?.code || "unknown" });
    return json(res, error?.status || 503, { message: "Could not load support inbox." });
  }
}
