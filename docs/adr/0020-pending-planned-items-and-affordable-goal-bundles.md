# ADR 0020: Pending Planned Items and Affordable Goal Bundles

## Status
Accepted

## Context
1. **Pending Planned Items**:
   - In real-world budget execution, users schedule recurring or one-time bills for specific calendar days (e.g., rent, utility bills, subscriptions).
   - If a scheduled date arrives or passes but payment has not yet been disbursed (`isPaid: false`), previously the simulation retroactively deducted the amount on the scheduled day, depressing the user's instantaneous "Today's balance" (`todayBalance`) even though the actual cash was still sitting in their bank account.
   - To reflect true liquid bank realities while maintaining strict mathematical safety guarantees, unpaid past-due items should remain credited in today's balance while projecting the debit forward to today/tomorrow, safeguarding month-end reserves and safety floor integrity without premature cash depression.
2. **Affordable Goal Bundles**:
   - On `GoalsScreen.jsx`, users set multiple target purchase goals. Previously, goals were evaluated individually against the safety buffer, without considering combinations of active goals that could be safely purchased together within the current dynamic survival cushion (`simulation.safeVelocity.freeSurplus`).
   - A mathematical evaluation of affordable goal combinations (single goals and multi-goal combinations) gives users clear visibility into what can be acquired right now without risking a floor breach.

## Decisions

### 1. Deterministic Engine Simulation of Pending Planned Items
- In `packages/engine/src/simulator.js`:
  - When evaluating one-time and recurring items, checked `isPastDueUnpaid = item.isPaid === false && currentDay !== null && currentDay !== undefined && targetDay < currentDay`.
  - Shifted the event's execution day to `effectiveDay = isPastDueUnpaid ? Math.min(daysInMonth, (currentDay || 1) + 1) : targetDay`.
  - Preserved `originalDay` and `originalDate` on the event while tagging `isPaid` and `isPending`.
  - As a result, on `currentDay`, the funds remain unspent, accurately reflecting liquid cash in `todayBalance`, while on `currentDay + 1` the projected outflow ensures month-end `endingBalance` and safety floor alerts remain strictly safeguarded.

### 2. Backend Item Payment Lifecycle and Transaction Matching
- In `apps/server/src/models/Item.js`:
  - Added `isPaid: { type: Boolean, default: false }`.
- In `apps/server/src/routes/items.js`:
  - Added `isPaid` handling to POST item creation and PUT item update routes.
- In `apps/server/src/routes/transactions.js`:
  - When an expenditure actual transaction is logged against a planned item (`verifiedPlannedItemId && transaction.amount > 0`), automatically marks the target item as `isPaid: true`.
- In `apps/server/src/routes/months.js` & `apps/server/src/routes/goals.js`:
  - Ensured `currentDay` is passed to the engine only when the queried month matches the current calendar month (`isCurrentMonth = year === now.getFullYear() && monthNum === (now.getMonth() + 1)`).

### 3. Frontend Unified Controls and Visual Feedback
- In `apps/web/src/components/ItemModal.jsx` and `apps/web/src/components/UnifiedEntryModal.jsx`:
  - Provided interactive "Payment already done" checkbox to easily mark or schedule items with pending/paid status.
- In `apps/web/src/screens/ItemsScreen.jsx`:
  - Added direct 1-tap `Paid`/`Pending` toggle button on each bento item card.
  - Added a `Pending` filter tab pill displaying total count of unpaid items.
- In `apps/web/src/components/TimelineList.jsx`:
  - Added a dedicated `Pending` filter tab and visual `Pending` badge on event rows displaying the original scheduled date (`orig. Day X`).

### 4. Affordable Goal Bundles Insight
- In `apps/web/src/screens/GoalsScreen.jsx`:
  - Implemented `computeAffordableGoalBundles(activeGoals, availableCushion)` evaluating subset combinations of active purchase goals fitting safely within `availableCushion = simulation.safeVelocity.freeSurplus`.
  - Rendered a compact bento tile detailing Single and Multi-Item Combos with total cost and remaining cushion buffer.

## Consequences
- Day-to-day cash projection matches actual bank balances without sacrificing safety floor guarantees.
- Users can effortlessly audit, track, and toggle whether scheduled bills have cleared.
- Purchase goals screen provides immediate clarity on affordable goal bundles that fit within available reserves.
