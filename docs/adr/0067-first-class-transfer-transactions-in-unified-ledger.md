# 0067: First-Class Transfer Transactions in Unified Ledger

## Context
Previously, inter-account money movements (such as ATM cash withdrawals, wallet top-ups, and bank-to-bank reallocations) were stored in an isolated `transfers` table and excluded from the main `TransactionsScreen` statement ledger. Users could see transfers on the Accounts and Plan timelines, but the primary Transactions screen lacked a complete, unified record of all account cash movements.

## Decision
1. **First-Class Storage in Unified Transactions Table**:
   - Store transfers directly in the `transactions` table with `origin = 'transfer'`.
   - Use `accountId` as the source account ID and `destinationAccountId` as the destination account ID.
   - Retain the positive minor-unit `amount` to represent the principal transferred.
   - `GET /api/transactions` returns transfers alongside all spot expenses, planned commitments, and credited income in a single chronologically sorted timeline.

2. **Spot-Only Lifecycle**:
   - Transfer transactions are strictly spot transactions created directly in `status = 'successful'`.
   - They cannot be scheduled as planned commitments (`status = 'planned'`).

3. **Single Bidirectional Row Representation**:
   - A transfer is modeled as a single entity rather than dual synthetic transaction legs.
   - **Filtered Account View**: When filtering by a specific Bank Account or Wallet:
     - If the account is the source: displayed as a **Withdrawal (-)** labeled *"Transfer to [Destination Account]"*.
     - If the account is the destination: displayed as a **Deposit (+)** labeled *"Transfer from [Source Account]"*.
     - Running balances for the isolated account reflect the debit or credit accurately.
   - **Unified "All Accounts" View**: Displayed as a single combined bilateral row with account badge `[Source] → [Destination]`, particular narrative *"Internal Account Transfer"*, amount display `⇄ ₹X,XXX (net ₹0)`, with zero net impact on total aggregated cash wealth.

4. **Delete-Only Management**:
   - On the Transactions screen, transfers are immutable; they support deletion but not in-place editing.
   - Deleting a transfer transaction removes the record and automatically restores the running balances of both the source and destination accounts.

## Consequences
- Single table and unified API endpoints simplify queries and timeline assembly across Web and Mobile.
- Database schema for `transactions` requires an optional `destinationAccountId` foreign key referencing `accounts.id`.
- The `transfers` table is phased out in favor of the unified `transactions` table (`origin = 'transfer'`).
