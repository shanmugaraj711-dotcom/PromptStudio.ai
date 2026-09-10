import { assertRevisionBinding } from "./acceptedRevision.js";
import { enqueueDelivery } from "./deliveryQueue.js";

const paidStates = new Set(["PAID", "BUILDING", "READY"]);
const fail = (status, code, message) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
};

// The only transaction that turns a verified Razorpay payment into a Studio delivery.
// Retries are safe because the delivery key is the Studio build request ID and the
// existing payment ID cannot be silently replaced by a different captured payment.
export async function finalizeVerifiedPayment({ db, ref, uid, orderId, paymentId, revision }) {
  return db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(ref);
    if (!currentSnap.exists) fail(404, "studio_build_not_found", "Studio build payment request was not found.");
    const current = currentSnap.data() || {};
    if (current.uid !== uid) fail(403, "studio_build_forbidden", "Studio build payment does not belong to this account.");
    assertRevisionBinding(current, revision, uid);
    if (current.razorpayOrderId !== orderId) fail(409, "studio_order_mismatch", "The checkout order changed during verification.");

    if (paidStates.has(current.status)) {
      if (current.paymentId && current.paymentId !== paymentId) {
        fail(409, "payment_already_verified", "This Studio payment is already verified with a different payment.");
      }
      await enqueueDelivery(tx, db, current, revision);
      return current;
    }

    if (current.status !== "PAYMENT_PENDING") {
      fail(409, "studio_payment_state_invalid", `Studio build request is currently ${current.status}.`);
    }

    await enqueueDelivery(tx, db, current, revision);
    const now = new Date();
    tx.update(ref, {
      status: "PAID",
      paymentId,
      paidAt: now,
      paymentVerifiedAt: now,
      razorpayOrderStatus: "paid",
      razorpayPaymentStatus: "captured",
      updatedAt: now,
    });
    return { ...current, status: "PAID", paymentId, paidAt: now };
  });
}
