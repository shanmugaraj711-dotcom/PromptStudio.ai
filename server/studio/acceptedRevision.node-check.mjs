import test from "node:test";
import assert from "node:assert/strict";
import { makeAcceptedRevision, reserveAcceptedCheckout, assertRevisionBinding } from "./acceptedRevision.js";
import { payForStudioBuild } from "../../src/services/studioPayment.js";

const uid = "customer";
const studioJobId = "job-12345678901234567890";
const files = { "/App.js": "export default () => <h1>Approved edit</h1>", "/styles.css": "h1 { color: blue; }" };
const job = { uid, status: "ready", spec: { layout: "landing-page", title: "Original title" }, renderer: "landing-page-v1", files: { ...files, "/App.js": "original source" } };
const pricing = { amountInr: 100, amountPaise: 10000, currency: "INR" };
const args = { uid, studioJobId, job, files };
// Serial transaction harness with rollback; integration with Firestore remains separate.
function database() {
  const data = new Map([[`studioJobs/${studioJobId}`, structuredClone(job)]]);
  let tail = Promise.resolve();
  const snapshot = (key) => ({ exists: data.has(key), data: () => structuredClone(data.get(key)) });
  return { data, collection: (name) => ({ doc: (id) => `${name}/${id}` }), runTransaction: (fn) => {
    const result = tail.then(async () => {
      const pending = [];
      const value = await fn({ get: async (key) => snapshot(key), create: (key, value) => { assert.equal(data.has(key), false); pending.push([key, structuredClone(value)]); } });
      for (const entry of pending) data.set(...entry);
      return value;
    });
    tail = result.catch(() => {});
    return result;
  } };
}
const reserve = (db, overrides = {}) => reserveAcceptedCheckout({ db, uid, studioJobId, files, pricing, ...overrides });

test("snapshot preserves edited source and server-owned spec without aliasing", () => {
  const revision = makeAcceptedRevision(args);
  assert.deepEqual(revision.files, files);
  assert.notEqual(revision.files["/App.js"], job.files["/App.js"]);
  assert.deepEqual(revision.sourceSpec, job.spec);
  revision.files["/App.js"] = "mutated";
  assert.match(files["/App.js"], /Approved edit/);
});
test("content identity is stable across key order and changes with edits", () => {
  assert.equal(makeAcceptedRevision(args).revisionId, makeAcceptedRevision({ ...args, files: { "/styles.css": files["/styles.css"], "/App.js": files["/App.js"] } }).revisionId);
  assert.notEqual(makeAcceptedRevision(args).revisionId, makeAcceptedRevision({ ...args, files: { ...files, "/styles.css": "h1{color:red}" } }).revisionId);
});
test("rejects wrong ownership, unfinished jobs, missing files and extra paths", () => {
  for (const overrides of [{ uid: "other" }, { job: { ...job, status: "queued" } }, { files: {} }, { files: { ...files, "../secret": "x" } }, { files: { ...files, "/App.js": "x".repeat(50001) } }]) assert.throws(() => makeAcceptedRevision({ ...args, ...overrides }));
});
test("concurrent checkout attempts reserve exactly one immutable revision and order creator", async () => {
  const db = database();
  const results = await Promise.all([reserve(db), reserve(db), reserve(db)]);
  assert.equal(results.filter((r) => r.createOrder).length, 1);
  assert.equal(db.data.size, 3);
  const revision = db.data.get(`studioAcceptedRevisions/${results[0].payment.acceptedRevisionId}`);
  assertRevisionBinding(results[0].payment, revision, uid);
});
test("a changed preview cannot replace a revision already linked to checkout", async () => {
  const db = database();
  const first = await reserve(db);
  await assert.rejects(reserve(db, { files: { ...files, "/styles.css": "h1{color:red}" } }), { code: "accepted_revision_changed" });
  assert.equal(db.data.size, 3);
  assert.equal(db.data.get(`studioBuildPayments/${studioJobId}`).acceptedRevisionId, first.payment.acceptedRevisionId);
});
test("legacy checkout cannot silently acquire a new accepted revision", async () => {
  const db = database();
  db.data.set(`studioBuildPayments/${studioJobId}`, { uid, studioJobId, status: "PAID" });
  await assert.rejects(reserve(db), { code: "accepted_revision_missing" });
  assert.equal(db.data.size, 2);
});
test("payment binding rejects source tampering, different customers and different revisions", () => {
  const revision = makeAcceptedRevision(args);
  const payment = { uid, studioJobId, acceptedRevisionId: revision.revisionId };
  assertRevisionBinding(payment, revision, uid);
  assert.throws(() => assertRevisionBinding(payment, { ...revision, files: { ...files, "/App.js": "changed" } }, uid), { code: "accepted_revision_corrupt" });
  assert.throws(() => assertRevisionBinding(payment, revision, "other"));
  assert.throws(() => assertRevisionBinding({ ...payment, acceptedRevisionId: "other" }, revision, uid));
});
test("checkout client submits approved files and preserves returned revision identity", async () => {
  let submitted;
  const result = await payForStudioBuild({ uid, idToken: "test-token", studioBuildRequestId: studioJobId, acceptedFiles: files,
    fetchImpl: async (url, options) => { submitted = JSON.parse(options.body); return { ok: true, json: async () => ({ alreadyPaid: true, acceptedRevisionId: "saved-revision" }) }; },
  });
  assert.deepEqual(submitted, { studioBuildRequestId: studioJobId, acceptedFiles: files });
  assert.equal(result.acceptedRevisionId, "saved-revision");
});
