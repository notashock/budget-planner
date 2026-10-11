# ADR 0045: Unified Tenant Account Ownership Validation Across Ledger Entities

## Status
Accepted

## Context
1. **Multi-Tenant Account Referencing Gaps**:
   - The security audit identified that `transfersRouter.post`, `itemsRouter.post`, `itemsRouter.put`, `transactionsRouter.post`, and `monthsRouter.post`/`put` verify that parent `monthId` documents belong to the authenticated `userId`, but blindly persisted `bankAccountId`, `walletId`, `sourceBankAccountId`, and `destinationBankAccountId` directly from caller payloads.
   - If a caller supplies an account identifier belonging to another tenant, foreign account references are stored in transfer ledgers, planned items, and actual transactions without tenant validation.

## Decision
1. **Canonical Account Ownership Validation Helper**:
   - Create a centralized service utility `validateUserAccount({ userId, accountType, accountId })`:
     - If `accountId` is null/undefined and optional, returns `true`.
     - Queries `BankAccount.findOne({ _id: accountId, userId })` or `Wallet.findOne({ _id: accountId, userId })` depending on `accountType`.
     - Returns the validated account document or `null` if the account does not exist or does not belong to the user.
2. **Strict Boundary Enforcement (HTTP 400)**:
   - In `apps/server/src/routes/transfers.js`:
     - Validate that both source and destination accounts are owned by `req.session.userId` (or `req.userId`).
     - Reject with `HTTP 400 Bad Request` if either account is invalid or unowned.
   - In `apps/server/src/routes/items.js` and `apps/server/src/routes/transactions.js`:
     - If `bankAccountId` or `walletId` is explicitly supplied, verify that it belongs to the authenticated user.
     - Reject with `HTTP 400 Bad Request` if a foreign account ID is specified.
   - In `apps/server/src/routes/months.js`:
     - For `salaryBankAccountId`, verify ownership before saving.
     - For all entries in `accountOpeningBalances`, filter and verify that every `accountId` belongs to the authenticated user before persistence.

## Consequences
- Guarantees strict multi-tenant boundary isolation across all financial account references.
- Prevents cross-tenant foreign key injection and financial accounting corruption.
- Establishes a uniform error contract (`HTTP 400 Bad Request`) across all routes.
