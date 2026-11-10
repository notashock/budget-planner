# ADR 0066: Continuous Tracking and Read-Only Period Review Architecture

## Status
Accepted

## Context
1. **The Flawed "Month as a Container" Paradigm**:
   - The application previously treated "Month" as a physical container requiring manual user creation (`CreateMonthModal`) and manual end-of-period rituals (`RolloverModal`).
   - For users, financial life does not stop or compartmentalize arbitrarily. Money flows continuously, balances carry forward naturally across time, and transactions simply occur along a continuous timeline.
   - Forcing users to click "Create Month" or perform a manual "Rollover" created friction, blocked access to logging, and led to double-counting and ledger confusion.

2. **The User's Clarified Vision**:
   - Tracking is **continuous** and **uninterrupted**.
   - For regular salaried earners, confirming/logging the expected salary deposit naturally marks the boundary of the cycle and advances to the next cycle automatically.
   - A "Month" is strictly a **Review Artifact (Scorecard & Audit Archive)**, never an operational blocker or manual rollover chore.
   - When a past month is selected from the header dropdown, the entire application switches to **Strict Read-Only Review Mode**, showing historical account curves, settled transactions, period closing balances, completed transfers, and achieved goals.

## Decision
1. **Abolish Manual Create Month & Rollover Ceremonies**:
   - Remove manual `Create Month` and `Rollover` modals and triggers from the user interface.
   - Salary cycles advance automatically when the scheduled salary transaction is confirmed / logged as paid.
   - The server maintains a continuous rolling horizon and automatically archives completed periods as closed review scorecards.

2. **Strict Read-Only Period Review Mode in UI**:
   - The Month dropdown in the header becomes the **Period & Review Selector**:
     - **Active Cycle (Default)**: Live interactive mode with forward projections, Safe Velocity, upcoming commitments, and live entry buttons (+ Log, + Plan, + Transfer).
     - **Past Review Period**: When an archived period is selected, the app enters **Strict Read-Only Review Mode**:
       - Prominent banner: *"Reviewing [Period Name] (Read-Only Archive) - [Return to Current Active Cycle]"*.
       - **Plan Tab**: Renders the historical step-line balance curves for all or individual accounts, with an interactive daily timeline showing transactions that occurred on each day of that period.
       - **Transactions Tab**: Displays only successful transactions executed during that period.
       - **Accounts Tab**: Displays the closing balances of each bank account and wallet at the end of that period, plus transfers executed during that period.
       - **Goals Tab**: Displays goals that were planned and achieved within that period.
       - Creation, deletion, and mutation buttons are hidden or disabled in review mode to maintain audit integrity.

3. **Continuous Unpaid Commitment Handling**:
   - Unpaid planned transactions from a completed cycle remain on the continuous timeline with derived status `overdue`. They are never auto-deleted, duplicated, or silently dropped.
   - The Review Mode highlights any commitments that remained overdue at the end of the period.

4. **Irregular Earner Review Windows**:
   - Users with irregular/variable income track continuous Runway and Smoothed Cashflow by default, but can select past calendar months and quarters from the Review dropdown to audit historical performance.

## Consequences
- **Positive**: Zero manual friction at the start or end of a month. No "Month does not exist" dead-ends or empty screens.
- **Positive**: Complete audit fidelity: past periods are permanently preserved snapshots that cannot be accidentally modified.
- **Positive**: Clean unified UX: no separate "review modal" needed to see past months; the standard app screens (Plan, Transactions, Accounts, Goals) seamlessly adapt to show historical data.
- **Negative**: Backdated entries into locked past periods are prevented by the strict read-only policy. Corrections must be entered as adjustment transactions in the current active period.
