import { createHash } from "node:crypto";

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
  return db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(db.collection("studioJobs").doc(studioJobId));
    const userSnap = await tx.get(db.collection("users").doc(uid));
    const revision = makeAcceptedRevision({ uid, studioJobId, job: jobSnap.exists ? jobSnap.data() : null, files });
    const paymentSnap = await tx.get(paymentRef);
    const revisionRef = db.collection("studioAcceptedRevisions").doc(revision.revisionId);
    const revisionSnap = await tx.get(revisionRef);
    const creditCost = Number(pricing?.creditCost);
    if (!Number.isInteger(creditCost) || creditCost <= 0) fail(503, "invalid_credit_cost", "Studio credit pricing is not configured correctly.");
    if (paymentSnap.exists) {
      const payment = paymentSnap.data();
      if (payment.uid !== uid) fail(403, "studio_build_forbidden", "This checkout belongs to another account.");
      if (!payment.acceptedRevisionId) fail(409, "accepted_revision_missing", "This checkout predates saved previews. Please contact support; do not pay again.");
      if (payment.acceptedRevisionId !== revision.revisionId) fail(409, "accepted_revision_changed", "Checkout is already linked to a different approved preview. Start a new preview to purchase a different version.");
      assertRevisionBinding(payment, revisionSnap.exists ? revisionSnap.data() : null, uid);
      if (Number(payment.creditCost) !== creditCost) fail(409, "studio_credit_price_changed", "The Studio credit cost changed. Please start a new preview before continuing.");
      return { payment, createOrder: false };
    }
    const balance = Math.max(Number(userSnap.exists ? userSnap.data()?.credits || 0 : 0), 0);
    if (balance < creditCost) fail(402, "credits_required", `You need ${creditCost} credits for a Studio build. You currently have ${balance}.`);
    const payment = { studioBuildRequestId: studioJobId, studioJobId, uid, acceptedRevisionId: revision.revisionId, status: "CREDIT_PENDING", creditCost, equivalentInr: creditCost * 2, createdAt: new Date(), updatedAt: new Date() };
    if (revisionSnap.exists) assertRevisionBinding(payment, revisionSnap.data(), uid);
    else tx.create(revisionRef, { ...revision, acceptedAt: new Date() });
    tx.create(paymentRef, payment);
    return { payment, createOrder: true, creditsAvailable: balance };
  });
}
