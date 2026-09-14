import { FieldValue } from "firebase-admin/firestore";

export const INR_PER_CREDIT = 2;

export const creditsToInr = (credits) => Number(credits) * INR_PER_CREDIT;

export const requirePositiveCreditCost = (value, label = "Operation") => {
  const cost = Number(value);
  if (!Number.isInteger(cost) || cost <= 0) {
    const error = new Error(`${label} credit cost is not configured correctly.`);
    error.status = 503;
    error.code = "invalid_credit_cost";
    throw error;
  }
  return cost;
};

/**
 * Spend the single PromptStudio credit currency inside an existing Firestore
 * transaction. Callers must make their operation/request state idempotent in
 * the same transaction so a retry can never charge twice.
 */
export async function debitCreditsInTransaction({ tx, userRef, userSnapshot, amount, operation }) {
  const cost = requirePositiveCreditCost(amount, operation);
  const user = userSnapshot?.exists ? userSnapshot.data() || {} : {};
  const balance = Math.max(Number(user.credits || 0), 0);
  if (balance < cost) {
    const error = new Error(`You need ${cost} credits for ${operation}.`);
    error.status = 402;
    error.code = "credits_required";
    error.creditsRequired = cost;
    error.creditsRemaining = balance;
    throw error;
  }
  const remaining = balance - cost;
  tx.set(userRef, { credits: remaining, quotaVersion: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { creditsCharged: cost, creditsRemaining: remaining, equivalentInr: creditsToInr(cost) };
}
