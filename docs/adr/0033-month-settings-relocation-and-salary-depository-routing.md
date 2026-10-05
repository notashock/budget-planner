# 0033. Month Settings Relocation and Salary Depository Routing

## Context
In the multi-account and multi-wallet architecture (ADRs 0029, 0030, 0031, 0032), bank liquidity is distributed across individual accounts, wallets, and a designated salary depository. Previously, the "Current Month Settings" (monthly income amount, salary credit date, safety floor threshold) was housed at the bottom of the **Goals** screen. Furthermore, when setting up or migrating accounts, the legacy migration modal prominently displayed the current opening balance, but omitted the monthly salary credit and its destination depository.

This created two friction points:
1. **Architectural Mismatch**: Depository routing and income baseline configuration belonged with accounts and liquidity management, not with target purchase goals.
2. **Opaque Payroll Allocation**: Users lacked an inline interface to designate or re-route which bank account receives the primary monthly salary deposit (`salaryBankAccountId`), leaving salary inflow disconnected from account cards and migration previews.
3. **Disjointed Creation Flows**: If an unmigrated user skipped the migration modal and clicked "+ Add Bank", they encountered an empty generic form rather than the unified migration path.

## Decision
We decided to implement the following changes:

1. **Relocate Current Month Settings to the Accounts Screen**:
   - Remove the editable "Current Month Settings" card from `GoalsScreen.jsx`.
   - On `GoalsScreen.jsx`, retain only a compact, read-only dynamic survival cushion indicator (`Cushion: ₹XX,XXX (Safe Velocity)`).
   - Place the full "Current Month Settings" card at the bottom of `AccountsScreen.jsx`, providing controls for:
     - Monthly Income Amount (`incomeAmount`)
     - Salary Credit Date (`incomeCreditDate` via `DatePicker`)
     - **Salary Deposit Bank Account** (`salaryBankAccountId`) dropdown
     - Safety Floor Threshold (`safetyFloor`)

2. **Interactive Salary Depository Routing**:
   - The **Salary Deposit Bank Account** dropdown lists all active bank accounts.
   - When saved, the active month's `salaryBankAccountId` is updated immediately and factored into the deterministic daily balance simulation.
   - Future month rollovers automatically inherit this designated salary bank account.
   - Also persists as user-level default setting `defaultSalaryBankAccountId` for newly created months.

3. **Unified "+ Add Bank" Migration Flow**:
   - If an unmigrated user with legacy records clicks **"+ Add Bank"** on the Accounts screen, trigger the canonical **Legacy Migration Modal** directly, ensuring a unified single onboarding flow rather than disjointed mechanisms.

4. **Transparent Salary Credit Visibility**:
   - **Legacy Migration Modal**: The preview summary displays both the **Current Opening Balance** and the **Monthly Salary Credit** (`+ ₹XX,XXX on [Date]`), clarifying that the new account acts as the primary salary depository.
   - **Bank Account Cards**: Bank cards designated as `salaryBankAccountId` display a `Salary / Payroll` badge and an informational line: `Salary Depository: +₹XX,XXX on [Date]`.
   - **Migration Status API**: `GET /api/bank-accounts/migration-status` returns `currentIncomeAmount`, `incomeCreditDate`, and `incomeCreditDay` in `stats`.

## Consequences
- **Positive:**
  - Clear domain boundaries: liquidity settings, salary routing, and account management reside together on the Accounts screen.
  - Transparent cash flow: users can see exactly which account receives payroll and can change it at any time.
  - DRY and cohesive UX: "+ Add Bank" and the migration banner route to the same robust migration modal.
  - Deterministic simulation: changes to `salaryBankAccountId` immediately re-simulate day-by-day running balances for the chosen bank depository.
