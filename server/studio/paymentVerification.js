import { assertRevisionBinding } from "./acceptedRevision.js";
import { enqueueDelivery } from "./deliveryQueue.js";
import { debitCreditsInTransaction } from "../api/_creditWallet.js";

const paidStates = new Set(["PAID", "BUILDING", "READY"]);
const fail = (status, code, message) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
};

// The only transaction that turns an approved Studio revision into a paid
// delivery. Payment is funded exclusively by the user's PromptStudio credits.
// Retries are safe because the Studio build request is the idempotency key.
export async function finalizeCreditCheckout({ db, ref, uid, revision }) {
  return db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(ref);
    if (!currentSnap.exists) fail(404, "studio_build_not_found", "Studio build payment request was not found.");
    const current = currentSnap.data() || {};
    if (current.uid !== uid) fail(403, "studio_build_forbidden", "Studio build payment does not belong to this account.");
    assertRevisionBinding(current, revision, uid);

    if (paidStates.has(current.status)) {
      await enqueueDelivery(tx, db, current, revision);
      return current;
    }
    if (current.status !== "CREDIT_PENDING") {
      fail(409, "studio_credit_state_invalid", `Studio build request is currently ${current.status}.`);
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await tx.get(userRef);
    const debit = await debitCreditsInTransaction({ tx, userRef, userSnapshot: userSnap, amount: current.creditCost, operation: "Studio build" });
    const now = new Date();
    const paymentId = `credit_${current.studioBuildRequestId}`;
    const paid = { ...current, status: "PAID", paymentId, paidAt: now, paymentVerifiedAt: now, creditCost: debit.creditsCharged, creditsRemaining: debit.creditsRemaining, equivalentInr: debit.equivalentInr, paymentMethod: "credits", updatedAt: now };
    await enqueueDelivery(tx, db, paid, revision);
    tx.update(ref, { status: "PAID", paymentId, paidAt: now, paymentVerifiedAt: now, creditCost: debit.creditsCharged, creditsRemaining: debit.creditsRemaining, equivalentInr: debit.equivalentInr, paymentMethod: "credits", updatedAt: now });
    return paid;
  });
}

// Kept as a compatibility alias for internal callers during the migration.
export const finalizeVerifiedPayment = finalizeCreditCheckout;
