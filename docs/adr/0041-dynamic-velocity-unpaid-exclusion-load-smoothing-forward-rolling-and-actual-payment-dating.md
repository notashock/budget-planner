# ADR 0041: Dynamic Safe Velocity Unpaid Exclusion, Date Diversification Load Smoothing, Forward-Rolling Pending Items, and Actual Payment Dating

## Status
Accepted

## Context
1. **Unpaid Items Impact on Dynamic Safe Velocity**:
   - Previously, the simulation engine included all unfulfilled upcoming planned budget items (`isPaid: false`) in `committedUpcomingItems`, subtracting them from `todayBalance` to compute `freeSurplus` and `safeVelocityPerDay`.
   - Users who maintain flexible or discretionary planned items found their daily safe-to-spend velocity suppressed in advance, even when those payments had not yet been executed.
   - The user requires that planned budget items marked as not paid must not be deducted from the Dynamic Safe Velocity calculation, allowing daily safe velocity to reflect true liquid cash minus safety floor until items are settled.

2. **Date Planning Concentration & Sudden Cash Drops**:
   - When users request an automated recommended date for a new planned bill (e.g. ₹150 bill or purchase goal), a naive recommendation that places the item on whatever date has the highest absolute balance or lowest balance buffer often stacks multiple bills onto the same calendar date.
   - This creates heavy payment clusters and sudden cash drops on individual dates rather than an evenly diversified payment timeline.
   - The user requires date diversification where new planned items are scheduled on safe dates that minimize existing payment load on that date.

3. **Pending Planned Items Schedule Drift**:
   - In real-world budget execution, a planned bill's scheduled calendar day may pass without the user having paid it (`isPaid: false`).
   - Previously, the simulation engine virtually projected overdue unpaid items to tomorrow (`currentDay + 1`), but the stored date in the database was not updated, leaving the item marked on a past date.
   - The user requires that pending planned items have their dates moved forward to newly recommended dates within the current month using the diversification algorithm, and if unpaid at month's end, prompt for rollover into the next month.

4. **Actual Payment Date Attribution**:
   - When an item is marked as paid via the items screen or modal, the date of marking was not preserved as the payment date.
   - The user requires that marking an item as paid updates its active date to the calendar date when it was marked, while saving the initial scheduled date as `originalDay` for full transparency.

## Decisions

### 1. Exclusion of Unpaid Planned Items from Dynamic Safe Velocity
- In `packages/engine/src/simulator.js`:
  - When computing `committedUpcomingItems`, exclude all unpaid planned items (`!evt.isActual && evt.isPaid === false`).
  - `freeSurplus` is calculated strictly from current liquid cash (`todayBalance`) minus the safety floor (`safetyFloor`) and active goals (`activeGoalsCost`).
  - Only items marked `isPaid: true` (which immediately debit `todayBalance` on or before `currentDay` per ADR 0035) or fulfilled via actual transactions reduce available surplus.
  - This ensures Safe Velocity does not prematurely constrain the user's daily discretionary spending for bills that have not left the account.

### 2. Date Diversification via Daily Outflow Smoothing
- In `packages/engine/src/recommender.js`:
  - Compute the daily planned outflow load for each candidate day: $L_d = \sum_{i \in \text{items on } d} \text{amount}_i$.
  - Filter candidate future dates (`currentDay..daysInMonth`) that safely preserve the safety floor without breach.
  - Among safe candidate dates, rank candidates primarily by **minimum existing load** ($L_d$), breaking ties by the earliest feasible date.
  - This prevents piling new bills onto already loaded dates (e.g., salary/rent days), achieving smooth, gradual cash outflow across the calendar month.

### 3. Forward-Rolling Pending Items & Month-End Rollover
- **Dynamic Forward-Rolling**:
  - In `packages/engine/src/simulator.js` and server routes (`apps/server/src/routes/months.js` / `items.js`):
  - When viewing or calculating the current active month, items that are overdue and unpaid (`isPaid: false && targetDay < currentDay`) have their projected execution day moved forward to the next recommended diversified date within the same month (`currentDay..daysInMonth`).
- **Month Rollover Prompt for Unpaid One-Time Items**:
  - In `apps/web/src/components/MonthModals.jsx` (`RolloverModal`):
  - When rolling over a month that has unpaid one-time planned items, display an "Unpaid Item Rollover" section allowing the user to select and roll these items into the new month at their optimal recommended dates.

### 4. Actual Payment Date Attribution
- In `apps/server/src/models/Item.js`:
  - Add `originalDay: { type: Number }` and `originalDate: { type: String }` fields.
- In `apps/server/src/routes/items.js`:
  - When an item is updated with `isPaid: true`:
    - If `originalDay` is not already recorded, store the existing scheduled day (`item.day` or `item.dayOfMonth`) into `item.originalDay` / `item.originalDate`.
    - Update `item.day` (and `item.date`) to today's date (`now.getDate()` in current month) so the running balance timeline debits cash on the exact date settlement occurred.
    - If toggled back to `isPaid: false`, restore `item.day = item.originalDay` and allow it to roll forward if past due.
- In `apps/web/src/screens/ItemsScreen.jsx` & `apps/web/src/components/TimelineList.jsx`:
  - When displaying paid items with `originalDay !== day`, show a subtle attribution badge: `Paid on Day X • Orig Day Y`.

## Consequences
- Dynamic Safe Velocity accurately reflects current liquid cash without being depressed by unpaid items.
- Recommended dates naturally distribute payments and eliminate jarring single-day balance drops.
- Overdue bills automatically stay relevant on future dates instead of getting lost in past timeline dates.
- Marking an item as paid anchors the transaction on the exact date of settlement while preserving full historical intent.
