# ADR 0047: Boot-Time Database Index Synchronization and Route DDL Separation

## Status
Accepted

## Context
1. **Ad-Hoc Index Synchronization in User Requests**:
   - `apps/server/src/routes/bankAccounts.js` previously executed `await BankAccount.syncIndexes()` inside a catch block when encountering MongoDB duplicate key error code 11000.
   - This was added to recover from legacy stale unique indexes (e.g. constraints on account names or account numbers) retained in development databases.
   - Executing `syncIndexes()` during live HTTP requests initiates administrative DDL operations (dropping and rebuilding indexes), creating write lock contention and latency spikes.

## Decision
1. **Remove DDL Operations from Request Handlers**:
   - Strip all invocations of `syncIndexes()` from `bankAccounts.js` and all other Express route handlers.
   - When a duplicate key error (code 11000) occurs during document creation, the handler immediately returns `HTTP 409 Conflict` with an actionable error message (`"A bank account with this name or details already exists"`).
2. **Move Index Synchronization to Server Startup Lifecycle**:
   - In `apps/server/src/db.js` (or during database connection initialization):
     - Execute `BankAccount.syncIndexes()` once upon establishing the initial database connection before the HTTP listener begins serving requests.
     - Logs index sync completion to the server console.

## Consequences
- Eliminates DDL operations and collection write locks during user-facing request execution.
- Ensures stale database constraints are safely reconciled before traffic arrives.
- Enforces predictable HTTP error handling (`HTTP 409 Conflict`) for duplicate key collisions.
