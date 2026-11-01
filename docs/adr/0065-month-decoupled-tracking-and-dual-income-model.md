# 0065: Month-Decoupled Tracking and Dual-Income Model

## Context
Previously, tracking was coupled to a budget `month` entity. Transactions and transfers required a `monthId`, forcing users without regular monthly salaries into an unnatural monthly budgeting abstraction. Furthermore, users with irregular income (freelancers, seasonal earners) lacked reports calibrated to volatility (runway, trailing smoothed income), and new users lacked a guided onboarding sequence ensuring foundational account setup.

## Decision

1. **Month-Decoupled Tracking & Nullable Foreign Keys**:
   - Financial tracking never depends on a "month". Every transaction belongs to an `account` and has a `date`.
   - In PostgreSQL, `month_id` on `transactions` and `transfers` is made nullable (`ON DELETE SET NULL`).
   - Ledgers, running balances, and reports calculate strictly from `account_id` and `date`.
   - A `month` entity exists strictly as an optional planning wrapper for users who configure regular income.
   - All reports, charts, and screens operate without errors when no month exists.

2. **Strict Onboarding Gate**:
   - New users are gated dynamically: if `accounts.length === 0`, all navigation redirects to the Onboarding wizard.
   - **Step 1 (Mandatory)**: Create at least one account (`name`, `type`: `bank` | `cash` | `wallet`, `openingBalance`, `openingBalanceDate`). The user cannot skip or enter the app until one account exists.
   - **Step 2 (Income Profile)**: Ask "Do you receive a fixed regular income?" (`salary`, `irregular`, `both`).
     - If `salary` or `both`: Collect salary details (`amount`, `expectedCreditDay`, `receivingAccountId`, `periodType`: `calendar_month` | `salary_cycle`) and create a `salary_template`.
     - If `irregular`: Skip template setup. No month is created. The user enters the app with full tracking capability.
   - The income mode is stored in `settings` (`incomeMode`) and remains fully editable in Settings/Profile.

3. **Salary Template, Versioning & Rolling Periods**:
   - A `salary_templates` table stores recurring salary configurations (`amount`, `expectedCreditDay`, `receivingAccountId`, `periodType`, `effectiveDate`, `isActive`, `version`).
   - The engine automatically provisions the active period and 1 forward period (rolling 2-period horizon) so users never create months manually.
   - Salary is created as a planned income transaction (`isIncome: true`, `origin: 'salary'`) following the standard lifecycle: `planned` -> `due` (within due window) -> `overdue` (past credit date) -> `successful` (when credited/settled). On settlement, the user can edit actual amount and date.
   - Template edits are versioned from an `effectiveDate` forward; historical periods retain their original planned amounts.
   - First period after signup is partial, beginning at `openingBalanceDate`.

4. **Irregular Income Metrics & Adaptive Reports**:
   - Users can log spot income transactions at any time (`isIncome: true`, `status: 'successful'`) with descriptive note/source (e.g., "freelance project", "harvest").
   - Users without regular monthly income see an adaptive dashboard featuring:
     - Timeframe selector: `[Trailing 12M] | [Year to Date] | [Quarter]`.
     - Hero KPIs: **Emergency Runway** (`currentBalance / avgMonthlySpending`) and **Smoothed Monthly Income** (`trailing12mIncome / 12`).
     - "Saved this month" is never shown as a primary metric for irregular earners.

5. **Robustness & Division-by-Zero Guards**:
   - Runway handles zero spending safely: returns `Infinity` / "Indefinite".
   - Runway handles zero or negative balance safely: returns `0` months.
   - Empty charts and zero-income states display clean, helpful prompts rather than blank or broken interfaces.
   - Switching income modes never deletes, moves, or corrupts existing transactions.

## Consequences
- Unlocks seamless support for freelancers, seasonal workers, and dual-income earners.
- Eliminates application crashes when zero budget months exist.
- Schema migration makes `month_id` nullable in PostgreSQL.
