# ADR 0052: Backend-Centralized Simulations, Strict Salary Lock, and Full Date Picker Migration

## Status
Accepted

## Context
1. **Calculation Drift & Duplication**: Maintaining twin deterministic engine calculations across the JavaScript backend/web client and the Flutter mobile client (`@budget/engine` vs `apps/mobile/lib/engine`) introduced mathematical drift and runtime type discrepancies (e.g. dynamic indexing cast errors when account identifiers were passed as plain strings).
2. **Account Trajectory Parity**: Account-isolated trajectory calculations required identical filtering and simulation logic on both platforms. Serving authoritative pre-calculated simulation snapshots for both aggregate and per-account views eliminates client-side duplication.
3. **Salary Window Locking Strictness**: Users required that once salary is credited or when outside the designated salary window, the salary configuration modal must be strictly locked to avoid inadvertent shifts in the baseline budget.
4. **Modal Ergonomics (Date vs Day-of-Month)**: All one-time entities (actual transactions, one-time planned items, transfers, and goals) should specify explicit calendar dates (`YYYY-MM-DD`), reserving relative day-of-month (`dayOfMonth` 1-31) strictly for recurring items.
5. **Categorization & Goal Recommendations**: Category tags should be selectable via rapid-tap chips (`Food`, `Travel`, `Health`, `Other`) with optional custom category entry matching the web application. Purchase goals should dynamically run `recommendPurchaseDate` to propose the earliest safe date that preserves the safety floor.

## Decisions

1. **Centralize Simulations on Backend**:
   - `apps/server/src/routes/months.js` computes both the aggregate `simulation` and per-account simulations (`accountSimulations: { [accountId]: SimulationResult }`) using `@budget/engine`.
   - `apps/mobile/lib/providers/budget_provider.dart` and `PlanScreen` consume the authoritative server simulation directly, falling back safely to offline engine simulation if network is unreachable.
   - Robust `_extractId` helper replaces unsafe direct dynamic subscripting (`it['bankAccountId']['_id']`), resolving `type 'String' is not a subtype of type 'int' of 'index'`.

2. **Items List Layout & Density**:
   - Compact `IconButton` constraints (`VisualDensity.compact`, zero padding) on items cards to eliminate the 16-pixel horizontal flex overflow.

3. **Strict Salary Locking**:
   - In `SalarySafelineModal`, if `month.isSalaryCredited` is `true` or `salaryStatus.isLocked`, all input fields are rendered disabled, the primary CTA is locked, and a distinct lock banner displays the scheduled reopening reason.

4. **Full Calendar Date Picker Migration**:
   - `UnifiedEntryModal` and `EditItemModal` replace day-only text fields with calendar date pickers for one-time transactions, items, and transfers.
   - Recurring items continue using day-of-month (`dayOfMonth` 1-31).

5. **Selectable Category Chips**:
   - Standardized quick-select chips (`Food`, `Travel`, `Health`, `Other`) with an optional custom category input.

6. **Purchase Goal Recommender Integration**:
   - Dynamic recommendation badge displays earliest safe day and available buffer, with a 1-tap "Apply Date" button.

## Consequences
- Single source of truth for all trajectory math across web and mobile.
- Zero overflow warnings on mobile item lists.
- Full UI and domain parity across both web and mobile clients.
