# 0064: Unified Transaction Lifecycle and Goal Integration

## Context
Previously, planned budget commitments were stored in an `items` table, while actual spent money was stored in a separate `transactions` table. This dual-record model led to terminology friction ("items" vs "transactions"), artificial copying when paying an item, and loose goal-coupling.

## Decision
1. **Single Unified Transaction Entity**:
   - Merge all money-related records into a single `transactions` table with stored statuses: `planned`, `successful`, `cancelled`.
   - Derived states `due` and `overdue` are computed dynamically against the user's local date (`due` when scheduled within the configurable due window, default 3 days; `overdue` when scheduled date has passed).
   - Origin field distinguishes transaction generation: `spot` (logged on the spot as successful), `planned` (scheduled ahead), `goal` (scheduled from a goal).
   - Only `successful` transactions affect spending totals, running balances, category breakdowns, and account balances. `planned` transactions power the monthly forecast and Planned view.
   - For planned transactions with no explicit date, the recommendation algorithm assigns the optimal date automatically.

2. **Transaction Settlement (Mark as Paid)**:
   - When marking a planned transaction as paid, its status updates to `successful`. It is not copied or duplicated. It disappears from the Planned view and appears in the actual transactions list.
   - Planned values (`plannedAmount`, `plannedDate`) are retained alongside actual values (`amount`, `date`) to support plan-vs-actual analysis.
   - In v1, reversing a successful transaction back to planned is disallowed.

3. **Goal Lifecycle Integration**:
   - Goals exist as separate entities with statuses: `logged`, `scheduled`, `achieved`, `dropped`.
   - Scheduling a goal creates a 1-to-1 linked planned transaction (`origin = goal`, linked via `goalId`).
   - When the linked transaction becomes `successful`, the goal automatically becomes `achieved`.
   - When the linked transaction is `cancelled`, the user chooses whether the goal reverts to `logged` or becomes `dropped`.

4. **Terminology**:
   - The words "item" and "planned item" are completely eliminated from code, database relations, API schemas, UI labels, and copy.

## Consequences
- Single table and unified API endpoints simplify queries, state management, and lifecycle events across Web and Mobile.
- Database migrations must map legacy `items` and `transactions` into the unified table with full reversibility.
