# ADR 0053: Server-Authoritative Simulation Harmonization, Account Editing, and Items Categorized Sorting & Filtering

## Status
Accepted

## Context
1. **Server-Side Computation Single Source of Truth**:
   - Web and mobile clients previously calculated mathematical projections in slightly diverging ways. We established that the backend server (`apps/server/src/routes/months.js` via `@budget/engine`) must be the sole authority for cashflow simulations, dynamic safe velocity, velocity pace status, and recommendation algorithms.
   - Both web and mobile clients must store the most recent simulation results locally for instant offline visibility.
2. **Missing Mobile Graph & Interactive Timeline Deserialization**:
   - On the mobile client, the Cashflow Trajectory Spline Chart did not render because the server simulator's `dailyBalances` objects (`{ day, date, balance }`) did not include the expected `closingBalance`, `totalInflow`, `totalOutflow`, and `events` properties required by Dart's `TimelineDay` model.
   - Consequently, `SimulationResult.days` was either empty or had zero closing balances, causing the spline painter to abort and KPI cards to display empty metrics.
3. **Budget Items and Transactions in Interactive Timeline**:
   - The interactive timeline requires daily grouped events (`allEvents` and `days[i].events`) with account attributions so that selecting a date on the spline chart or timeline highlights exact planned items and actual transactions.
4. **Bank Account Editing**:
   - Users could create and delete bank accounts but lacked an in-place editing modal to update the bank name, institution, minimum balance, and primary account status.
5. **Categorization, Filtering, and Sorting in Items Section**:
   - Both planned items and transactions in the items list need clear category badges, category filtering (e.g. `All`, `Food`, `Travel`, `Health`, `Other`), and multi-mode sorting (Date/Day Descending/Ascending, Amount High-to-Low, Low-to-High).

## Decisions

1. **Normalize Server Simulation Output (`@budget/engine` & `months.js`)**:
   - Ensure the server simulation response generates a comprehensive `days` array containing:
     - `day`: Day number (1–31).
     - `date`: Full date string `YYYY-MM-DD`.
     - `openingBalance` & `closingBalance` (aliasing `balance`).
     - `totalInflow` & `totalOutflow`.
     - `events`: Array of `TimelineEvent`s for that day.
     - `hasBreach`: Boolean indicating if `closingBalance < safetyFloor`.
   - Ensure `SimulationResult.fromJson` on mobile cleanly maps both `balance` and `closingBalance`, ensuring immediate graph rendering.
2. **Web Client Backend Simulation Consumption**:
   - In `apps/web/src/App.jsx`, replace client-side re-simulation with the server-supplied `simulation` and `accountSimulations` returned by `api.getMonthDetail`. Cache recent calculations in `localStorage` for offline visibility.
3. **Account Editing Modal (`edit_account_modal.dart`)**:
   - Add an edit pencil button on each account card in `AccountsScreen`.
   - Clicking opens `EditAccountModal`, allowing users to modify `name`, `institution`, `minimumBalance`, and `isPrimary`.
4. **Items Categorization, Filtering & Sorting**:
   - In `ItemsScreen`, add a filter bar with a Category selector and a Sort selector (`Newest First`, `Oldest First`, `Highest Amount`, `Lowest Amount`).
   - Display colored category badges on every item card.

## Consequences
- Guaranteed mathematical consistency across Web and Mobile with authoritative backend calculations.
- Cashflow trajectory graph renders reliably on mobile devices.
- Full parity for account management and items exploration across platforms.
