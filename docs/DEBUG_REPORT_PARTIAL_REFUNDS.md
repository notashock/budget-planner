# Debug report: several refunds linked to one spend

**Reported:** "when I'm linking multiple credits to a single transaction it takes the original amount of the actual transaction"
**Area:** linking a refund to a spend (commit 6714c03, ADR 0062)

## Reproduction

Production (read-only check): the spend "Movie ticket" (₹1,260.24) has one linked refund of ₹160.00. When you start a second refund for it:

| | Expected | Actual (before the fix) |
|---|---|---|
| Amount shown in the "Refund for" picker | ₹1,100.24 left | ₹1,260.24 |
| Hint for a ₹100 refund | "net cost becomes ₹1,000.24" | "net cost becomes ₹1,160.24" |
| Refund of ₹1,200 (more than the ₹1,100.24 left) | refused | accepted on web, mobile and server |
| Spend already fully refunded | not offered | still offered |

Balances and the simulation were **not** affected. The engine nets each refund by its own amount and does not use `refundTargetTransactionId`, so the totals were right. What went wrong was the remaining amount shown and the missing upper limit.

New tests reproduce it: the 4 new web tests in `RefundLink.test.jsx` fail on the old code and pass with the fix.

## Root cause

No part of the system worked out what was already refunded on a spend.

- **Web** (`UnifiedEntryModal.jsx`): `refundTargets` set `amount` to the spend's original `t.amount`. The picker, the "net cost becomes…" hint and the "more than you paid" warning all used that number. Other refunds pointing at the same spend were never subtracted. Over-refunding was only a warning; saving still went through.
- **Mobile** (`unified_entry_modal.dart`): the "Refund for" label showed the original amount, and saving had no check at all.
- **Server** (`budgetExecution.recordTransaction`): it checked only that the target spend exists and belongs to the user. It never checked the refund's size, and `updateTransaction` let a linked refund be edited to any amount.

## Fix

- **Engine:** new `packages/engine/src/refunds.js` with `getRefundedAmount` and `getRefundableRemaining`. Remaining = spend amount minus every refund linked to it (never below 0). `excludeId` leaves out the refund being edited.
- **Server:** `assertRefundFits` loads the refunds already linked to the spend and rejects (400 `VALIDATION_ERROR`) any refund bigger than what is left. It runs when a refund is created and when a linked refund's amount is edited (the refund's own old amount is left out).
- **Web:** the picker and hint use what is left (the read-only edit view still shows the amount paid). Fully refunded spends are hidden. Saving a refund bigger than what is left is blocked with "Only ₹X of <spend> is left to refund."
- **Mobile:** the label reads "₹X left of ₹Y" once part of a spend is refunded. Fully refunded spends are hidden, and saving more than what is left shows the same message.

## Regression tests

- `packages/engine/test/refunds.test.js`: what is left goes down with each refund; only this spend's refunds count; never below 0; the edited refund is left out.
- `apps/web/src/test/RefundLink.test.jsx`: the production case (₹1,260.24 → ₹1,100.24 → ₹800.24); a refund over what is left is blocked, and exactly what is left saves; fully refunded spends are hidden; editing counts the other refunds but not itself.
- `apps/mobile/test/refund_link_test.dart`: what is left goes down (₹3,000 → ₹1,000 of ₹4,500); a refund over what is left is blocked, and exactly what is left saves; fully refunded spends are hidden.
- `apps/server/test/budget_execution.test.js`: a second refund that fits is accepted; one that fits the original amount but not what is left is rejected; editing a refund past what is left is rejected, and within it is accepted; anything after a full refund is rejected. These need Postgres and run in CI only.

## Not changed

- Production data: one linked refund, well under its spend. Nothing needs repairing.
- A spend's amount can still be edited below the total already refunded on it. The UI and server then treat what is left as 0. Blocking that edit would be a separate change.
