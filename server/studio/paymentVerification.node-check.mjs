import test from "node:test";
import assert from "node:assert/strict";
import { makeAcceptedRevision } from "./acceptedRevision.js";
import { finalizeVerifiedPayment } from "./paymentVerification.js";
import { runDelivery } from "./deliveryQueue.js";

const uid = "customer";
const studioBuildRequestId = "job-payment-retry-1234567890";
const orderId = "order_test_123";
const paymentId = "pay_test_123";
const files = { "/App.js": "export default () => <h1>Accepted</h1>", "/styles.css": "h1{color:blue}" };
const job = { uid, status: "ready", spec: { layout: "landing-page", title: "Accepted" }, renderer: "landing-page-v1" };
const revision = makeAcceptedRevision({ uid, studioJobId: studioBuildRequestId, job, files });

function database() {
  const data = new Map();
  let tail = Promise.resolve();
  const snapshot = (key) => ({ exists: data.has(key), data: () => structuredClone(data.get(key)) });
  return {
    data,
    collection: (name) => ({ doc: (id) => `${name}/${id}` }),
    runTransaction: (fn) => {
      const result = tail.then(async () => {
        const pending = new Map();
        const tx = {
          get: async (key) => pending.has(key) ? snapshotPending(key, pending, data) : snapshot(key),
          create: (key, value) => { if (data.has(key) || pending.has(key)) throw new Error("already exists"); pending.set(key, { op: "create", value: structuredClone(value) }); },
          update: (key, value) => { if (!data.has(key) && !pending.has(key)) throw new Error("missing document"); pending.set(key, { op: "update", value: structuredClone(value) }); },
        };
        const value = await fn(tx);
        for (const [key, change] of pending) {
          if (change.op === "create") data.set(key, change.value);
          else data.set(key, { ...data.get(key), ...change.value });
        }
        return value;
      });
      tail = result.catch(() => {});
      return result;
    },
  };
}

function snapshotPending(key, pending, data) {
  const change = pending.get(key);
  if (!change) return { exists: data.has(key), data: () => structuredClone(data.get(key)) };
  if (change.op === "create") return { exists: true, data: () => structuredClone(change.value) };
  return { exists: true, data: () => structuredClone({ ...data.get(key), ...change.value }) };
}

function seed(db) {
  db.data.set(`studioBuildPayments/${studioBuildRequestId}`, {
    uid,
    studioJobId: studioBuildRequestId,
    acceptedRevisionId: revision.revisionId,
    razorpayOrderId: orderId,
    status: "PAYMENT_PENDING",
    amountPaise: 100,
    currency: "INR",
  });
  db.data.set(`studioAcceptedRevisions/${revision.revisionId}`, revision);
}

test("duplicate payment verification is idempotent and creates one delivery", async () => {
  const db = database();
  seed(db);
  const ref = db.collection("studioBuildPayments").doc(studioBuildRequestId);
  const args = { db, ref, uid, orderId, paymentId, revision };
  const results = await Promise.all([finalizeVerifiedPayment(args), finalizeVerifiedPayment(args), finalizeVerifiedPayment(args)]);
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map((result) => result.status)).size, 1);
  assert.equal(db.data.get(`studioBuildPayments/${studioBuildRequestId}`).paymentId, paymentId);
  assert.equal([...db.data.keys()].filter((key) => key.startsWith("studioDeliveries/")).length, 1);
});

test("a duplicate verification with a different payment cannot replace the verified payment", async () => {
  const db = database();
  seed(db);
  const ref = db.collection("studioBuildPayments").doc(studioBuildRequestId);
  await finalizeVerifiedPayment({ db, ref, uid, orderId, paymentId, revision });
  await assert.rejects(finalizeVerifiedPayment({ db, ref, uid, orderId, paymentId: "pay_other", revision }), { code: "payment_already_verified" });
  assert.equal(db.data.get(`studioBuildPayments/${studioBuildRequestId}`).paymentId, paymentId);
});

test("duplicate verification cannot cause a second customer deployment", async () => {
  const db = database();
  seed(db);
  const ref = db.collection("studioBuildPayments").doc(studioBuildRequestId);
  await Promise.all([
    finalizeVerifiedPayment({ db, ref, uid, orderId, paymentId, revision }),
    finalizeVerifiedPayment({ db, ref, uid, orderId, paymentId, revision }),
  ]);

  let submitCount = 0;
  const provider = {
    projectId: "existing-project",
    submit: async () => { submitCount += 1; return { id: "dep_1" }; },
    recover: async () => ({ id: "dep_1" }),
    inspect: async () => ({ state: "READY", url: "https://customer.example" }),
    verify: async () => "https://customer.example",
  };
  const first = await runDelivery({ db, deliveryId: studioBuildRequestId, provider, now: () => 1000 });
  assert.equal(first.state, "BUILDING");
  const second = await runDelivery({ db, deliveryId: studioBuildRequestId, provider, now: () => 20000 });
  assert.equal(second.state, "READY");
  assert.equal(submitCount, 1);
});
