# 0034. Transaction and Planned Item Account Attribution with Automatic Primary Bank Backfill

Date: 2026-10-04

## Status

Accepted

## Context

With multi-account architecture introduced in Phase 5, Planned Items and Transfers support explicit account attribution (attributing flows to specific Bank Accounts or Wallets). However, new transactions and planned items previously defaulted to unassigned cash pool unless explicitly changed, and legacy records created before account creation remained unattributed, disconnecting them from individual account balance curves and liquidity trajectories.

## Decision

1. **Transaction and Planned Item Attribution in Unified Entry Modal**:
   - In `UnifiedEntryModal` (`Log Spending` and `Plan Budget Item` modes), default the account selector to the user's Primary Bank Account (or primary wallet if no bank account exists).
   - Fall back gracefully to `General Cash Pool` (unassigned) if the user has not configured any bank accounts or wallets yet.
   - When a user matches a transaction to a planned item (`Match to planned item`), automatically auto-fill the transaction's account selector to mirror the planned item's assigned account, while preserving the user's ability to manually override it.
   - On the backend (`POST /api/months/:year/:month/transactions` and `POST /api/months/:year/:month/items`), automatically resolve and default unassigned entries to the user's Primary Bank Account.

2. **Automatic Idempotent Backfill of Existing Records**:
   - In the backend, automatically backfill unassigned transactions (`bankAccountId: null, walletId: null`):
     - If the transaction is matched to a planned item that already has an assigned Bank Account or Wallet, inherit that account.
     - Otherwise, assign the transaction to the user's Primary Bank Account.
   - Idempotently backfill unassigned planned items (`accountType: null`, `accountType: 'unassigned'`, or `bankAccountId: null`) to the user's Primary Bank Account.
   - This backfill executes idempotently:
     - When fetching month data (`GET /api/months/:year/:month`).
     - Whenever a primary bank account is created (`POST /api/bank-accounts`) or migrated (`POST /api/bank-accounts/migrate`).

## Consequences

- All planned budget items, spending actuals, and refund transactions are properly linked to distinct bank accounts or cash envelopes, enabling precise per-account liquidity trajectories.
- Historical items and transactions seamlessly transition to the primary bank account without manual user re-tagging.
- The user experience remains frictionless: creating planned items or logging transactions automatically attributes them to the primary bank account without requiring extra manual selection.
