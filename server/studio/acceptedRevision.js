import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

export const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");

export function makeAcceptedRevision({ uid, studioJobId, job, files }) {
  if (!job || job.uid !== uid) fail(404, "studio_job_not_found", "The Studio preview could not be found.");
  if (job.status !== "ready" || !job.spec || !job.renderer) fail(409, "studio_preview_not_ready", "A completed Studio preview is required before checkout.");
  const paths = ["/App.js", "/styles.css"];
  if (!files || Array.isArray(files) || Object.keys(files).length !== paths.length || paths.some((path) => typeof files[path] !== "string" || !files[path].trim() || files[path].length > 50000)) {
    fail(400, "invalid_accepted_files", "The approved preview must contain valid App.js and styles.css files. Please regenerate the preview.");
  }
  const revision = JSON.parse(JSON.stringify({ schemaVersion: 1, uid, studioJobId, sourceSpec: job.spec, renderer: job.renderer, files: Object.fromEntries(paths.map((path) => [path, files[path]])) }));
  return { ...revision, revisionId: digest(revision) };
}

export function assertRevisionBinding(payment, revision, uid) {
  if (!revision || revision.uid !== uid || payment.uid !== uid || payment.acceptedRevisionId !== revision.revisionId || payment.studioJobId !== revision.studioJobId) {
    fail(409, "accepted_revision_missing", "This checkout has no matching saved preview. Please contact support before making another payment.");
  }
  const { revisionId, acceptedAt, ...content } = revision;
  if (digest(content) !== revisionId) fail(409, "accepted_revision_corrupt", "The saved preview could not be verified. Please contact support.");
}

export async function reserveAcceptedCheckout({ db, uid, studioJobId, files, pricing }) {
  const paymentRef = db.collection("studioBuildPayments").doc(studioJobId);
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(db.collection("studioJobs").doc(studioJobId));
    const paymentSnap = await tx.get(paymentRef);
    const userSnap = await tx.get(userRef);
    const revision = makeAcceptedRevision({ uid, studioJobId, job: jobSnap.exists ? jobSnap.data() : null, files });
    const revisionRef = db.collection("studioAcceptedRevisions").doc(revision.revisionId);
    const revisionSnap = await tx.get(revisionRef);

    if (paymentSnap.exists) {
      const payment = paymentSnap.data();
      if (payment.uid !== uid) fail(403, "studio_build_forbidden", "This checkout belongs to another account.");
      if (!payment.acceptedRevisionId) fail(409, "accepted_revision_missing", "This checkout predates saved previews. Please contact support; do not pay again.");
      if (payment.acceptedRevisionId !== revision.revisionId) fail(409, "accepted_revision_changed", "Checkout is already linked to a different approved preview. Start a new preview to purchase a different version.");
      assertRevisionBinding(payment, revisionSnap.exists ? revisionSnap.data() : null, uid);
      return { payment, createOrder: false };
    }

    const creditCost = Number(pricing.creditCost);
    if (!Number.isInteger(creditCost) || creditCost <= 0) fail(503, "invalid_studio_pricing", "Studio build credit pricing is not configured correctly.");
    const user = userSnap.exists ? userSnap.data() : {};
    const credits = Math.max(Number(user.credits || 0), 0);
    if (credits < creditCost) fail(402, "credits_required", `You need ${creditCost} credits to build this Studio project.`);
    const creditsRemaining = credits - creditCost;

    const payment = {
      studioBuildRequestId: studioJobId,
      studioJobId,
      uid,
      acceptedRevisionId: revision.revisionId,
      status: "PAID",
      paymentMethod: "credits",
      paymentId: `credit_${studioJobId}`,
      creditCost,
      creditsRemaining,
      equivalentInr: creditCost * 2,
      ...pricing,
      createdAt: new Date(),
      paidAt: new Date(),
      paymentVerifiedAt: new Date(),
      updatedAt: new Date(),
    };

    if (revisionSnap.exists) assertRevisionBinding(payment, revisionSnap.data(), uid);
    else tx.create(revisionRef, { ...revision, acceptedAt: new Date() });

    // The delivery queue import is deferred to avoid a module cycle. enqueueDelivery only
    // performs transaction reads/writes, so it remains part of this same atomic checkout.
    const { enqueueDelivery } = await import("./deliveryQueue.js");
    await enqueueDelivery(tx, db, payment, revision);

    tx.set(userRef, {
      credits: creditsRemaining,
      quotaVersion: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.create(paymentRef, payment);

    return { payment, createOrder: false, alreadyPaid: true };
  });
}
