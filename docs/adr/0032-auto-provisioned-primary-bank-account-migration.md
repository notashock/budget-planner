# 0032. User-Consented Primary Bank Account Data Migration

## Context
With the introduction of the multi-account and multi-wallet management system (ADRs 0029, 0030, 0031), the data model distinguishes between individual bank accounts, wallets, and the unassigned balance pool. Existing databases contain months, items, transactions, and goals created under the legacy single-account paradigm, where account attribution did not exist (`accountType: null`, `bankAccountId: null`, `walletId: null`).

Rather than performing a silent background migration that assigns a synthetic placeholder name like "Primary Checking" without the user's awareness, users should have full visibility, agency, and consent over linking their financial institution, specifying their account name and last 4 digits, and seeing the exact current balance and transaction count being transferred.

## Decision
We decided to implement a **User-Consented Primary Bank Account Migration**:

1. **Eligibility Detection:**
   - Endpoint `GET /api/bank-accounts/migration-status` checks:
     - User has 0 `BankAccount` records and 0 `Wallet` records.
     - User has legacy budget data (at least 1 `Month`, `Item`, `Transaction`, or `Goal`).
   - If eligible, the API returns `{ eligible: true, stats: { monthCount, transactionCount, itemCount, currentOpeningBalance } }`.

2. **Legacy Migration Consent Modal:**
   - On application load, if `migration-status` indicates eligibility and the user hasn't dismissed it in the current session, the **Legacy Migration Consent Modal** opens automatically.
   - **Form Fields:**
     - **Account Name** (Required, e.g. "HDFC Salary Account" or "Primary Checking").
     - **Financial Institution** (Optional, e.g. "HDFC Bank", "Chase").
     - **Account Type** (`checking`, `salary`, `savings`).
     - **Last 4 Digits** (Optional numeric input, e.g. "1234", formatted into masked `•••• 1234`).
     - **Balance & History Preview** (Read-only summary of current opening balance and count of items/transactions being linked).
   - **User Agency:**
     - **Confirm & Link:** Calls `POST /api/bank-accounts/migrate` with the user's custom account attributes.
     - **Decide Later:** Dismisses the popup for the current session without modifying data (leaving items in the Unassigned Balance Pool). An "Upgrade & Link Account" banner remains accessible on the Accounts tab to resume anytime.

3. **Atomic Migration Execution:**
   - Dedicated endpoint `POST /api/bank-accounts/migrate`:
     - Creates the user's customized `BankAccount` (`isPrimary: true`, `openingBalance: latestMonth.openingBalance`).
     - Backfills all user `Month`s: `salaryBankAccountId = primaryBank._id`, `accountOpeningBalances = [{ accountType: 'bank', accountId: primaryBank._id, amount: month.openingBalance }]`.
     - Backfills unassigned `Item`s and `Transaction`s with `accountType: 'bank'`, `bankAccountId: primaryBank._id`.
     - Backfills unassigned `Goal`s with `fundingSourceType: 'bank'`, `fundingBankAccountId: primaryBank._id`.
     - Responds with the created bank account and backfill count.

4. **Preservation of Unassigned Data:**
   - Silent auto-creation in `GET` routes is removed. Data remains unassigned until the user provides consent via the migration modal or manually manages their accounts.

## Consequences
- **Positive:**
  - Respects user intent and privacy: users choose their real account name, institution, and 4-digit card/account identifier.
  - Zero surprise: users clearly see what balance and how many transactions will be attributed to the new account.
  - Non-blocking: users can skip or decide later without breaking existing application workflows.
  - Idempotent and atomic: executed once via explicit POST request.
