import { adminDb, json, requireUser } from "./_firebaseAdmin.js";
import { getRuntimeProductConfig } from "./_productConfig.js";
import { reserveAcceptedCheckout, fail } from "../studio/acceptedRevision.js";

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const paidStates = new Set(["PAID", "BUILDING", "READY"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { code: "method_not_allowed", message: "Studio build checkout accepts POST requests only." });
  try {
    const user = await requireUser(req);
    const db = adminDb();
    const config = await getRuntimeProductConfig(db);
    const pricing = config.pricing.studioBuild || {};
    if (pricing.enabled !== true) return json(res, 503, { code: "studio_build_disabled", message: "Studio builds are temporarily unavailable." });
    const creditCost = Number(pricing.creditCost);
    if (!Number.isInteger(creditCost) || creditCost <= 0) return json(res, 503, { code: "invalid_studio_pricing", message: "Studio build credit pricing is not configured correctly." });
    const studioBuildRequestId = String(req.body?.studioBuildRequestId || "").trim();
    if (!REQUEST_ID_RE.test(studioBuildRequestId)) return json(res, 400, { code: "invalid_studio_build_request", message: "A valid Studio preview request is required before checkout." });

    // Freeze the exact approved source and atomically consume credits + bind delivery.
    const { payment, alreadyPaid } = await reserveAcceptedCheckout({
      db,
      uid: user.uid,
      studioJobId: studioBuildRequestId,
      files: req.body?.acceptedFiles,
      pricing: { creditCost },
    });

    const identity = { studioBuildRequestId, acceptedRevisionId: payment.acceptedRevisionId };
    if (paidStates.has(payment.status)) {
      return json(res, 200, {
        ok: true,
        ...identity,
        alreadyPaid: Boolean(alreadyPaid),
        status: payment.status,
        paymentMethod: payment.paymentMethod || "credits",
        creditCost: payment.creditCost,
        creditsRemaining: payment.creditsRemaining,
        equivalentInr: payment.equivalentInr,
      });
    }

    fail(409, "studio_payment_state_invalid", `Studio build request is currently ${payment.status}.`);
  } catch (error) {
    console.error("Studio credit checkout failed", { code: error?.code || "unknown", status: error?.status });
    return json(res, error.status || 500, { code: error.code || "studio_build_order_failed", message: error.message || "Could not start Studio checkout." });
  }
}
