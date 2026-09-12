import crypto from "node:crypto";
import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { isConfigured, razorpayRequest, verifyOrderSignature } from "./_razorpay.js";
import { dispatchForgeBuild } from "./_forgeGitHub.js";

const buildableStates = new Set(["PAYMENT_PENDING"]);
const buildConfig = () => ({
  appName: String(process.env.FORGE_APP_NAME || "PromptStudio AI").trim() || "PromptStudio AI",
  forgeWebOrigin: String(process.env.FORGE_WEB_ORIGIN || "").trim().replace(/\/$/, ""),
  packageId: String(process.env.FORGE_PACKAGE_ID || "in.promptstudio.ai").trim(),
  versionName: String(process.env.FORGE_VERSION_NAME || "0.1.0").trim() || "0.1.0"
});
const fail = (status, code, message) => { const error = new Error(message); error.status = status; error.code = code; throw error; };
const startBuild = async ({ db, ref, forgeRequestId, uid }) => {
  const buildId = crypto.randomUUID().replace(/-/g, "");
  const config = buildConfig();
  if (!config.forgeWebOrigin) fail(503, "forge_build_origin_not_configured", "Forge cannot start a real APK build until FORGE_WEB_ORIGIN is configured.");
  const versionCode = String(Math.floor(Date.now() / 1000));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) fail(404, "forge_request_not_found", "Forge request was not found.");
    const current = snap.data() || {};
    if (current.uid !== uid) fail(403, "forge_request_forbidden", "Forge request does not belong to this account.");
    if (!buildableStates.has(current.status)) fail(409, "forge_request_not_buildable", `Forge request is currently ${current.status}.`);
    const ts = new Date();
    tx.update(ref, { status: "BUILDING", buildId, buildStartedAt: ts, buildDispatchPending: true, buildAppName: config.appName, buildWebOrigin: config.forgeWebOrigin, buildPackageId: config.packageId, buildVersionName: config.versionName, buildVersionCode: versionCode, updatedAt: ts });
  });
  try {
    const dispatch = await dispatchForgeBuild({ forgeRequestId, buildId, appName: config.appName, forgeWebOrigin: config.forgeWebOrigin, packageId: config.packageId, versionName: config.versionName, versionCode });
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref); if (!snap.exists) return;
      const current = snap.data() || {};
      if (current.status !== "BUILDING" || current.buildId !== buildId) return;
      tx.update(ref, { buildDispatchPending: false, buildDispatchAcceptedAt: new Date(), buildQueueMarker: dispatch.markerPath, updatedAt: new Date() });
    });
    return { buildId, dispatch };
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref); if (!snap.exists) return;
      const current = snap.data() || {};
      if (current.status !== "BUILDING" || current.buildId !== buildId) return;
      tx.update(ref, { status: "BUILD_FAILED", buildDispatchPending: false, buildFailureCode: error.code || "forge_dispatch_failed", buildFailureMessage: error.message || "The Forge build could not be queued.", buildFailedAt: new Date(), updatedAt: new Date() });
    });
    throw error;
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Forge payment verification accepts POST requests only." });
  if (!isConfigured()) return json(res, 503, { code: "payment_not_configured", message: "Razorpay is not configured." });
  try {
    const user = await requireUser(req); const body = req.body && typeof req.body === "object" ? req.body : {};
    const orderId = String(body.razorpay_order_id || body.orderId || "").trim(); const paymentId = String(body.razorpay_payment_id || body.paymentId || "").trim(); const signature = String(body.razorpay_signature || body.signature || "").trim();
    if (!orderId || !paymentId || !signature) return json(res, 400, { code: "incomplete_payment_response", message: "Incomplete payment response." });
    const db = adminDb(); const snap = await db.collection("apkForgeRequests").where("razorpayOrderId", "==", orderId).limit(1).get();
    if (snap.empty) return json(res, 404, { code: "forge_order_not_found", message: "Forge payment order was not found." });
    const ref = snap.docs[0].ref; const request = snap.docs[0].data() || {};
    if (request.uid !== user.uid) return json(res, 403, { code: "forge_order_forbidden", message: "Forge payment does not belong to this account." });
    if (!verifyOrderSignature({ orderId, paymentId, signature })) return json(res, 400, { code: "invalid_signature", message: "Payment verification failed." });
    const order = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}`);
    if (order.id !== orderId || order.currency !== "INR" || Number(order.amount) !== Number(request.amountPaise || Number(request.amountInr) * 100)) return json(res, 409, { code: "payment_amount_mismatch", message: "Payment amount does not match the Forge request." });
    if (order.status !== "paid") return json(res, 409, { code: "payment_not_captured", message: "Payment is not captured yet. Please wait a moment and retry." });
    const payments = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}/payments`); const payment = Array.isArray(payments?.items) ? payments.items.find((item) => item.id === paymentId) : null;
    if (!payment || payment.order_id !== orderId || payment.status !== "captured" || Number(payment.amount) !== Number(order.amount)) return json(res, 409, { code: "payment_not_captured", message: "The submitted payment is not a captured payment for this Forge order." });

    const currentSnap = await ref.get();
    const current = currentSnap.data() || {};
    if (current.status === "READY") return json(res, 200, { ok: true, forgeRequestId: current.forgeRequestId, status: "READY", orderId, paymentId, buildId: current.buildId || null });
    if (current.status === "BUILDING" || current.status === "VERIFYING") return json(res, 200, { ok: true, forgeRequestId: current.forgeRequestId, status: current.status, orderId, paymentId, buildId: current.buildId || null });
    if (current.status === "BUILD_FAILED") return json(res, 409, { code: "build_failed", message: current.buildFailureMessage || "The previous Forge build failed. Start a new Forge request before trying again.", forgeRequestId: current.forgeRequestId, status: current.status, buildId: current.buildId || null });
    if (!buildableStates.has(current.status)) fail(409, "forge_request_not_buildable", `Forge request is currently ${current.status}.`);

    await db.runTransaction(async (tx) => {
      const latest = await tx.get(ref); if (!latest.exists) fail(404, "forge_request_not_found", "Forge request was not found.");
      const latestData = latest.data() || {};
      if (latestData.uid !== user.uid) fail(403, "forge_order_forbidden", "Forge payment does not belong to this account.");
      if (latestData.status !== "PAYMENT_PENDING") return;
      const ts = new Date();
      tx.update(ref, { paymentId, paidAt: ts, paymentVerifiedAt: ts, razorpayOrderStatus: order.status, updatedAt: ts });
    });

    try {
      const buildResult = await startBuild({ db, ref, forgeRequestId: request.forgeRequestId, uid: user.uid });
      return json(res, 200, { ok: true, forgeRequestId: request.forgeRequestId, status: "BUILDING", orderId, paymentId, buildId: buildResult.buildId });
    } catch (error) {
      const failedSnap = await ref.get();
      const failed = failedSnap.data() || {};
      return json(res, 502, { code: error.code || "forge_build_dispatch_failed", message: error.message || "Payment succeeded but the real APK build could not be started.", forgeRequestId: request.forgeRequestId, status: failed.status || "BUILD_FAILED", buildId: failed.buildId || null });
    }
  } catch (error) {
    console.error("APK Forge payment verification failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: error.code || "apk_forge_payment_verification_failed", message: error.message || "Payment verification failed." });
  }
}
