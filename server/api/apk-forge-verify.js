import crypto from "node:crypto";
import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { getRuntimeProductConfig } from "./_productConfig.js";
import { debitCreditsInTransaction } from "./_creditWallet.js";
import { dispatchForgeBuild } from "./_forgeGitHub.js";

const buildableStates = new Set(["PAYMENT_PENDING"]);
const retryableBuildFailures = new Set(["forge_build_origin_not_configured", "forge_dispatch_invalid_inputs"]);
const buildConfig = () => {
  const configuredOrigin = String(process.env.FORGE_WEB_ORIGIN || "").trim().replace(/\/$/, "");
  const vercelProductionUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const forgeWebOrigin = configuredOrigin || (vercelProductionUrl ? `https://${vercelProductionUrl}` : "https://promptstudioai.in");
  return { appName: String(process.env.FORGE_APP_NAME || "PromptStudio AI").trim() || "PromptStudio AI", forgeWebOrigin, packageId: String(process.env.FORGE_PACKAGE_ID || "in.promptstudio.ai").trim(), versionName: String(process.env.FORGE_VERSION_NAME || "0.1.0").trim() || "0.1.0" };
};
const fail = (status, code, message) => { const error = new Error(message); error.status = status; error.code = code; throw error; };

const startBuild = async ({ db, ref, forgeRequestId, uid }) => {
  const buildId = crypto.randomUUID().replace(/-/g, "");
  const config = buildConfig();
  if (!/^https:\/\/[^/]+$/.test(config.forgeWebOrigin)) fail(500, "forge_build_origin_invalid", "Forge build origin is invalid. Configure FORGE_WEB_ORIGIN as a HTTPS origin.");
  const versionCode = String(Math.floor(Date.now() / 1000));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) fail(404, "forge_request_not_found", "Forge request was not found.");
    const current = snap.data() || {};
    if (current.uid !== uid) fail(403, "forge_request_forbidden", "Forge request does not belong to this account.");
    const retryingInfrastructureFailure = current.status === "BUILD_FAILED" && retryableBuildFailures.has(String(current.buildFailureCode || ""));
    if (!buildableStates.has(current.status) && !retryingInfrastructureFailure) fail(409, "forge_request_not_buildable", `Forge request is currently ${current.status}.`);
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
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Forge credit checkout confirmation accepts POST requests only." });
  try {
    const user = await requireUser(req);
    const forgeRequestId = String(req.body?.forgeRequestId || "").trim();
    if (!forgeRequestId) return json(res, 400, { code: "invalid_forge_request_id", message: "A Forge request ID is required." });
    const db = adminDb();
    const ref = db.collection("apkForgeRequests").doc(forgeRequestId);
    const config = await getRuntimeProductConfig(db);
    const forgePricing = config.pricing.apkForge || {};
    const creditCost = Number(forgePricing.creditCost);
    if (!Number.isInteger(creditCost) || creditCost < 1) return json(res, 503, { code: "invalid_credit_cost", message: "Forge credit pricing is not configured correctly." });

    const snapshot = await ref.get();
    if (!snapshot.exists) return json(res, 404, { code: "forge_request_not_found", message: "Forge request was not found." });
    const request = snapshot.data() || {};
    if (request.uid !== user.uid) return json(res, 403, { code: "forge_request_forbidden", message: "Forge request does not belong to this account." });
    if (!request.previewAcceptedAt) return json(res, 409, { code: "forge_preview_not_accepted", message: "Review and accept the Forge preview before checkout." });

    const paidStates = new Set(["BUILDING", "VERIFYING", "READY", "BUILD_FAILED"]);
    if (paidStates.has(request.status)) return json(res, 200, { ok: true, forgeRequestId, status: request.status, paymentMethod: "credits", creditCost: Number(request.creditCost || creditCost), creditsRemaining: Number(request.creditsRemaining ?? 0), buildId: request.buildId || null });

    if (request.status === "CREDIT_PENDING") {
      await db.runTransaction(async (tx) => {
        const latest = await tx.get(ref);
        const latestData = latest.data() || {};
        if (!latest.exists || latestData.uid !== user.uid) fail(404, "forge_request_not_found", "Forge request was not found.");
        if (paidStates.has(latestData.status) || latestData.paymentId) return;
        if (latestData.status !== "CREDIT_PENDING") fail(409, "forge_credit_state_invalid", `Forge request is currently ${latestData.status}.`);
        if (Number(latestData.creditCost) !== creditCost) fail(409, "forge_credit_price_changed", "The Forge credit cost changed. Please start a new request.");
        const userRef = db.collection("users").doc(user.uid);
        const userSnap = await tx.get(userRef);
        const debit = await debitCreditsInTransaction({ tx, userRef, userSnapshot: userSnap, amount: creditCost, operation: "APK Forge build" });
        const now = new Date();
        tx.update(ref, { status: "PAYMENT_PENDING", paymentId: `credit_${forgeRequestId}`, paidAt: now, paymentVerifiedAt: now, creditCost: debit.creditsCharged, creditsRemaining: debit.creditsRemaining, equivalentInr: debit.equivalentInr, paymentMethod: "credits", updatedAt: now });
      });
    }

    const latestSnap = await ref.get();
    const latest = latestSnap.data() || {};
    if (latest.status === "BUILDING" || latest.status === "VERIFYING" || latest.status === "READY") return json(res, 200, { ok: true, forgeRequestId, status: latest.status, paymentMethod: "credits", creditCost: Number(latest.creditCost || creditCost), creditsRemaining: Number(latest.creditsRemaining ?? 0), buildId: latest.buildId || null });
    if (latest.status === "BUILD_FAILED" && !retryableBuildFailures.has(String(latest.buildFailureCode || ""))) return json(res, 409, { code: "build_failed", message: latest.buildFailureMessage || "The previous Forge build failed. Start a new Forge request before trying again.", forgeRequestId, status: latest.status, buildId: latest.buildId || null });
    if (!buildableStates.has(latest.status) && !(latest.status === "BUILD_FAILED" && retryableBuildFailures.has(String(latest.buildFailureCode || "")))) fail(409, "forge_request_not_buildable", `Forge request is currently ${latest.status}.`);

    try {
      const buildResult = await startBuild({ db, ref, forgeRequestId, uid: user.uid });
      return json(res, 200, { ok: true, forgeRequestId, status: "BUILDING", paymentMethod: "credits", creditCost: Number(latest.creditCost || creditCost), creditsRemaining: Number(latest.creditsRemaining ?? 0), buildId: buildResult.buildId });
    } catch (error) {
      const failedSnap = await ref.get(); const failed = failedSnap.data() || {};
      return json(res, 502, { code: error.code || "forge_build_dispatch_failed", message: error.message || "Credits were charged but the real APK build could not be started.", forgeRequestId, status: failed.status || "BUILD_FAILED", buildId: failed.buildId || null });
    }
  } catch (error) {
    console.error("APK Forge credit checkout confirmation failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: error.code || "apk_forge_credit_checkout_failed", message: error.message || "Forge credit checkout failed." });
  }
}
