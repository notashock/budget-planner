/**
 * Refunds linked to a recorded spend (ADR 0062).
 *
 * A spend can be refunded in parts: each refund is its own transaction with a
 * negative amount and `refundTargetTransactionId` pointing at the spend. What
 * can still be refunded is the spend's amount minus every refund already linked
 * to it, never the spend's original amount on its own.
 */

const idOf = (t) => String(t?.id ?? t?._id ?? '');

/**
 * Total (positive, in minor units) already refunded against a spend.
 * @param {string} targetId - the spend's id
 * @param {Array<object>} transactions
 * @param {{ excludeId?: string }} [options] - leave out one refund (the one being edited)
 */
export function getRefundedAmount(targetId, transactions, options = {}) {
  if (!targetId) return 0;
  const target = String(targetId);
  const exclude = options.excludeId != null ? String(options.excludeId) : null;
  return (transactions || []).reduce((sum, t) => {
    if (!t || String(t.refundTargetTransactionId ?? '') !== target) return sum;
    if (exclude && idOf(t) === exclude) return sum;
    const amount = Number(t.amount) || 0;
    return amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
}

/**
 * How much of a spend can still be refunded (minor units, never below 0).
 * @param {object} spend - the spend transaction (positive amount)
 * @param {Array<object>} transactions
 * @param {{ excludeId?: string }} [options]
 */
export function getRefundableRemaining(spend, transactions, options = {}) {
  if (!spend) return 0;
  const paid = Math.abs(Number(spend.amount) || 0);
  return Math.max(0, paid - getRefundedAmount(idOf(spend), transactions, options));
}
