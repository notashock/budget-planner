# ADR 0049: Card Truncation, Items Mixed Feed, Dynamic Chart Scaling, and Partial Payment Settlement

## Status
Accepted

## Context
1. **Card Layout and Text Overflow**:
   - Long labels/notes in the Plan page timeline (`TimelineList.jsx`) and item cards (`ItemsScreen.jsx`) previously caused cards to fit arbitrarily long text into single cards or expand horizontally, distorting the responsive bento grid due to missing `min-width: 0` constraints on flex children.
2. **Items Feed Separation vs. Mixed Feed**:
   - The Items screen previously separated planned items from logged transactions across discrete filter tabs (`all` only showed planned items). Users need a unified chronological view in the `all` tab where active pending items can be edited while paid items and settled transactions are locked against ad-hoc mutations.
3. **Chart Left Axis Digit Clipping**:
   - `StepLineChart.jsx` used static left padding (`58px` mobile, `66px` desktop). When running balances or floors exceed 5–6 digits (e.g. `₹1,25,000` or `₹10,50,000`), the leading currency symbol and digits clipped past the left SVG canvas boundary.
4. **Partial Spending and Planned Item Settlement Flow**:
   - When a user logs a spending transaction matching a planned expense with an amount lower than planned, the system previously marked the planned item paid without clarifying the destination of the unspent difference.

## Decision
1. **Two-Line Text Clamping and Flexible Container Hardening**:
   - Apply `-webkit-line-clamp: 2` with `overflow: hidden; text-overflow: ellipsis; word-break: break-word;` on `.item-bento-title` and `.timeline-event-label`.
   - Enforce `min-width: 0` across `.item-bento-card`, `.item-bento-header`, and `.timeline-event-info` flex containers to eliminate horizontal grid blowout.
   - Attach native `title` tooltips displaying the complete, unclipped text on hover.
2. **Sectioned Mixed Feed with Paid Item Edit Locks**:
   - In `ItemsScreen.jsx`, the `all` tab renders two distinct, clearly labeled sections:
     - **Active & Pending Budget Items**: all items where `!item.isPaid`. "Edit", "Delete", and toggle switch remain fully interactive.
     - **Logged Transactions & Paid Items**: all items where `item.isPaid === true` alongside all logged transactions for the month.
     - For paid items, the "Edit" button is replaced with a locked badge indicator (`🔒 Paid`), preventing inconsistency with linked ledger actuals while keeping the toggle switch available if the user intentionally reverts payment.
3. **Dynamic Chart Left Padding with Compact Formatting Support**:
   - In `StepLineChart.jsx`, calculate `paddingLeft` dynamically:
     - Compute maximum label character length across `yTicks`.
     - Automatically scale `paddingLeft` (from `58px` up to `90px+`).
     - Support compact metric notation (e.g. `₹50k`, `₹1.5L`) when numbers exceed 6 digits to keep the chart area spacious and legible.
4. **Interactive Planned-Item Matching & Under-Spend Settlement Modal**:
   - In `UnifiedEntryModal.jsx` (Quick Log / Spending tab):
     - When the user selects a Category/Tag or enters an amount, display an interactive suggestion banner highlighting candidate unpaid planned items in the active month with a 1-tap "Link & Settle" button.
     - If the logged transaction amount is strictly less than the planned amount, prompt the user with two options:
       - **Option A ("Release remaining to balance")**: Adjusts the planned item's amount down to the actual spent amount and marks it paid, immediately freeing the difference into overall cash balance.
       - **Option B ("Keep remainder scheduled")**: Splits the commitment by marking the spent amount as paid and generating a new pending planned item for the remaining balance.

## Consequences
- Prevents visual breakage and horizontal layout distortion across all device viewports.
- Provides a comprehensive, single-pane overview of all financial commitments and actuals in the Items screen while guarding data integrity for settled payments.
- Ensures chart Y-axis labels remain fully visible for all personal finance scales.
- Introduces an intuitive, transparent settlement flow for under-budget spending.
