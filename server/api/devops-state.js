import { adminDb, json, requireUser } from "./_firebaseAdmin.js";

/* DevOps Kit progress + entitlements, served by the server so the
   browser never needs Firestore rules for these collections.
   GET  -> { entitlements: {phase1, phase2}, progress: {lessons, lastLesson, sims} }
   POST -> save one visit: { lesson, completed? } or { sim, step, completed? } */
const LESSON_SLUGS = new Set([
  "lesson-0", "error-decoder",
  "p1-start", "p1-kafka", "p1-postgresql", "p1-redis", "p1-object-store",
  "p1-load-balancer", "p1-end-to-end",
  "p2-start", "p2-zero-cost", "p2-kubernetes", "p2-break-fix",
  "p2-cheat-sheets", "p2-interview", "p2-portfolio", "p2-resume", "p2-best-sites",
]);
const SIM_SLUGS = new Set(["kafka", "postgresql", "redis", "object-store", "load-balancer", "end-to-end"]);

const emptyProgress = () => ({ lessons: {}, lastLesson: null, sims: {} });

export default async function handler(req, res) {
  try {
    const decoded = await requireUser(req);
    const db = adminDb();
    const userRef = db.collection("users").doc(decoded.uid);
    const progressRef = db.collection("devopsProgress").doc(decoded.uid);

    if (req.method === "GET") {
      const [userSnap, progressSnap] = await Promise.all([userRef.get(), progressRef.get()]);
      const user = userSnap.exists ? userSnap.data() : {};
      const progress = progressSnap.exists ? progressSnap.data() : emptyProgress();
      return json(res, 200, {
        entitlements: { phase1: user.devopsPhase1 === true, phase2: user.devopsPhase2 === true },
        progress: {
          lessons: progress.lessons || {},
          lastLesson: progress.lastLesson || null,
          sims: progress.sims || {},
        },
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const lesson = typeof body.lesson === "string" && LESSON_SLUGS.has(body.lesson) ? body.lesson : null;
      const sim = typeof body.sim === "string" && SIM_SLUGS.has(body.sim) ? body.sim : null;
      const simStep = Number.isInteger(body.step) ? Math.max(1, body.step) : null;
      if (!lesson && !(sim && simStep !== null)) return json(res, 400, { message: "Nothing to save." });
      const now = new Date();
      const updated = await db.runTransaction(async (tx) => {
        const snap = await tx.get(progressRef);
        const progress = snap.exists ? snap.data() : emptyProgress();
        progress.lessons = progress.lessons || {};
        progress.sims = progress.sims || {};
        if (lesson) {
          const entry = progress.lessons[lesson] || {};
          entry.visitedAt = now;
          if (body.completed === true) entry.completed = true;
          if (body.completed === false) entry.completed = false;
          progress.lessons[lesson] = entry;
          progress.lastLesson = lesson;
        }
        if (sim && simStep !== null) {
          const entry = progress.sims[sim] || {};
          entry.step = simStep;
          entry.updatedAt = now;
          if (body.completed === true) entry.completed = true;
          progress.sims[sim] = entry;
        }
        progress.updatedAt = now;
        tx.set(progressRef, progress);
        return progress;
      });
      return json(res, 200, {
        ok: true,
        progress: {
          lessons: updated.lessons || {},
          lastLesson: updated.lastLesson || null,
          sims: updated.sims || {},
        },
      });
    }

    return json(res, 405, { message: "Method not allowed." });
  } catch (error) {
    console.error("DevOps state failed", { code: error?.code || "unknown" });
    return json(res, error.status || 500, { code: "devops_state_failed", message: error.message || "Could not load your progress." });
  }
}
