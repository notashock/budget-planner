# 0054. PostgreSQL Migration with Drizzle ORM and Relational Schema

Date: 2026-10-18

## Status

Accepted

## Context

The budget planner application currently relies on MongoDB via Mongoose for data persistence. While document-based storage allowed rapid initial prototyping, the domain model has evolved into an intrinsically relational financial system featuring:
1. Strict foreign key relationships between Users, Months, Bank Accounts, Wallets, Planned Items, Actual Transactions, Inter-Account Transfers, and Purchase Goals.
2. Distinct semantics separating planned disbursements (`Item`, self-settled via `isPaid: true`) from actual out-of-pocket spending (`Transaction`).
3. Explicit credit and refund mapping, where only refunds and credits map to offset either an existing spent transaction or a planned item.
4. Composite uniqueness constraints (such as `(user_id, year, month)`).
5. The requirement for database-level cascading deletes (`ON DELETE CASCADE`) to prevent orphaned financial records upon account or month deletion.

Furthermore, running MongoDB with session state (`connect-mongo`) creates ambient state overhead, whereas the system has already standardized on stateless JWT Bearer token authentication.

## Decision

We will migrate the primary database from MongoDB to PostgreSQL using Drizzle ORM with the following architectural specifications:

1. **ORM & Query Layer**:
   - Adopt **Drizzle ORM** (`drizzle-orm` + `pg` driver + `drizzle-kit`).
   - Use declarative TypeScript/JavaScript schema definitions (`schema.js`) generating versioned, deterministic SQL migration files.

2. **Primary Key Strategy**:
   - Use **UUIDv4** (`gen_random_uuid()`) for all table primary keys.
   - Preserves string ID compatibility across both the React Web client and Flutter Mobile client without requiring frontend model rewrites or numeric ID conversion.

3. **Domain Model Boundary**:
   - **Planned Items** (`items`): Represent scheduled budget items (one-time, recurring, fuel-log) that settle their own disbursement directly via `is_paid = true`.
   - **Spent Transactions** (`transactions`): Represent actual financial spends drawing down the unplanned allowance/velocity. Spent transactions do not link to planned items.
   - **Refund / Credit Mapping**: Incoming credits/refunds (`is_income = true` or negative amount) may reference either a target `planned_item_id` or an existing `refund_target_transaction_id` to compute net expenditure.

4. **Normalized Relational Structure**:
   - `users`: User authentication credentials.
   - `bank_accounts` & `wallets`: Financial accounts with ownership checks and soft archival.
   - `months`: Monthly budget cycles with unique composite constraint `(user_id, year, month)`.
   - `month_account_openings`: Normalized child table linking starting balances per registered account to a specific month.
   - `items`: Planned recurring and one-time budget items with foreign keys to accounts.
   - `fuel_stops`: Normalized child table recording odometer and cost readings for fuel log items.
   - `transactions`: Actual expenditures, income credits, and refunds.
   - `transfers`: Paired account transfers recording source and destination accounts.
   - `goals`: Purchase goals with funding source attribution and evaluation status.
   - `settings`: User preferences and default parameters.

5. **Authentication & Session Deprecation**:
   - Deprecate `express-session` and `connect-mongo`.
   - Rely exclusively on stateless JWT Bearer tokens transmitted in the `Authorization: Bearer <token>` header.

6. **Migration & ETL Pipeline**:
   - Direct cutover supported by an automated ETL script that extracts legacy MongoDB collections, maps MongoDB `ObjectId` hex strings deterministically to UUIDs, validates relational integrity, and batch-inserts records into PostgreSQL.

## Consequences

### Positive
- **Guaranteed Referencing Integrity**: Foreign keys and database-level cascades prevent orphaned records, broken transfers, or floating transactions.
- **Stateless Infrastructure**: Removing session stores simplifies deployments, horizontal scaling, and containerized hosting.
- **Type-Safe & Fast Queries**: Drizzle ORM provides lightweight, SQL-direct query execution without the heavy query-engine binary overhead of Prisma.
- **Client Stability**: Preserving UUIDv4 string representations ensures zero disruption or breaking changes for Web and Mobile clients.

### Negative / Trade-offs
- Requires executing the ETL migration script for existing deployments with historical MongoDB data.
- Server integration test suite must be updated to run against a PostgreSQL instance (or Dockerized PostgreSQL test database) instead of local MongoDB.
