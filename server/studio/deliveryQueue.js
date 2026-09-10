import { randomUUID } from "node:crypto";
import { assertRevisionBinding } from "./acceptedRevision.js";

const STOP = 8640000000000000;
const LEASE_MS = 90000;
const refFor = (db, id) => db.collection("studioDeliveries").doc(id);
const paid = new Set(["PAID", "BUILDING", "READY"]);

// Called inside payment verification's transaction, before its first write.
export async function enqueueDelivery(tx, db, payment, revision) {
  assertRevisionBinding(payment, revision, payment.uid);
  const ref = refFor(db, payment.studioBuildRequestId);
  const existing = await tx.get(ref);
  if (existing.exists) {
    const current = existing.data();
    if (current.uid !== payment.uid || current.acceptedRevisionId !== revision.revisionId) throw new Error("Delivery revision conflict.");
    return current;
  }
  const job = { deliveryId: payment.studioBuildRequestId, uid: payment.uid, studioJobId: payment.studioJobId, acceptedRevisionId: revision.revisionId, state: "QUEUED", nextRunAt: 0, leaseUntil: 0, attempts: 0, createdAt: Date.now(), updatedAt: Date.now() };
  tx.create(ref, job);
  return job;
}

export async function runDelivery({ db, deliveryId, provider, now = Date.now }) {
  const ref = refFor(db, deliveryId);
  const leaseToken = randomUUID();
  let job = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    if (data.nextRunAt > now() || data.leaseUntil > now() || ["READY", "FAILED"].includes(data.state)) return null;
    tx.update(ref, { leaseToken, leaseUntil: now() + LEASE_MS, nextRunAt: now() + LEASE_MS, updatedAt: now() });
    return data;
  });
  if (!job) return { skipped: true };
  const save = async (patch) => {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.leaseToken !== leaseToken) throw new Error("Delivery lease superseded.");
      tx.update(ref, { ...patch, updatedAt: now() });
    });
    job = { ...job, ...patch };
  };
  try {
    const paymentSnap = await db.collection("studioBuildPayments").doc(deliveryId).get();
    const payment = paymentSnap.data();
    const revisionSnap = await db.collection("studioAcceptedRevisions").doc(job.acceptedRevisionId).get();
    const revision = revisionSnap.data();
    if (!paymentSnap.exists || !paid.has(payment.status)) throw new Error("Delivery requires verified payment.");
    assertRevisionBinding(payment, revision, job.uid);
    if (payment.acceptedRevisionId !== job.acceptedRevisionId) throw new Error("Delivery payment binding changed.");
    if (job.projectId && job.projectId !== provider.projectId) throw new Error("Customer hosting project changed during delivery.");
    if (job.state === "QUEUED") {
      // Persist intent first. A crash after this point recovers, never reposts.
      await save({ state: "SUBMITTING", submittedAt: now(), projectId: provider.projectId });
      const deployment = await provider.submit(job, revision);
      await save({ state: "BUILDING", deploymentId: deployment.id });
    } else if (job.state === "SUBMITTING") {
      const deployment = await provider.recover(job);
      if (deployment) await save({ state: "BUILDING", deploymentId: deployment.id });
      else if (now() - job.submittedAt > 20 * 60000) throw new Error("Deployment submission needs operator reconciliation; no second deployment was created.");
    } else if (job.state === "BUILDING" || job.state === "VERIFYING") {
      const deployment = await provider.inspect(job);
      if (["ERROR", "CANCELED"].includes(deployment.state)) throw new Error("The customer site build failed. Support can review the saved revision.");
      if (deployment.state === "READY") {
        await save({ state: "VERIFYING" });
        const liveUrl = await provider.verify(job, deployment.url);
        await save({ state: "READY", liveUrl, verifiedAt: now(), nextRunAt: STOP, leaseUntil: 0, lastError: null });
        return { state: "READY", liveUrl };
      }
      if (now() - job.submittedAt > 30 * 60000) throw new Error("The customer site build exceeded its time limit.");
    }
    await save({ nextRunAt: now() + 15000, leaseUntil: 0, lastError: null });
  } catch (error) {
    const attempts = (job.attempts || 0) + 1;
    const terminal = attempts >= 8;
    await save({ attempts, state: terminal ? "FAILED" : job.state, lastError: String(error.message || "Delivery failed").slice(0, 300), nextRunAt: terminal ? STOP : now() + Math.min(300000, 15000 * 2 ** attempts), leaseUntil: 0 });
  }
  return { state: job.state };
}

export function publicDelivery(job) {
  return { deliveryId: job.deliveryId, acceptedRevisionId: job.acceptedRevisionId, state: job.state, liveUrl: job.state === "READY" ? job.liveUrl : null, verifiedAt: job.verifiedAt || null, message: job.state === "FAILED" ? "Your payment is safe. Delivery needs support review; please do not pay again." : job.lastError ? "Delivery is taking longer than expected. We will retry automatically; you can return here later." : null };
}
