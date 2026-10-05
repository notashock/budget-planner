# 36. Accounts as Sole Source of Truth and Unified Onboarding

Date: 2026-10-04

## Context
Previously, budget months maintained an independent lump-sum `openingBalance` that could be configured without any registered bank accounts or wallets. While recent additions added account attribution for transactions and items, a fresh user could still create a month without a bank account, leading to unassigned balance pools and disconnected ledgers. The application must enforce a pure banking paradigm where Bank Accounts and Wallets are the sole source of truth for all balances, and every cash flow event (month opening, salary deposit, planned item, transaction debit, transfer, and purchase goal) is strictly bound to an account.

## Decision
1. **Bank Accounts and Wallets as Sole Balance Source of Truth**:
   - The aggregate month opening balance is strictly derived as `sum(accountOpeningBalances)`.
   - The generic disconnected `openingBalance` input is eliminated in month creation and month settings. Users configure opening balances directly per active Bank Account and Wallet.
   - In simulation and timeline projections, all cash events debit or credit designated accounts. Unassigned balance pools are completely removed.
2. **Unified Account-Linked Month Provisioning for Fresh Users**:
   - When a fresh user with zero registered accounts creates their first budget month in `CreateMonthModal`, the modal embeds mandatory Primary Bank Account setup fields (Account Name, Institution, Account Type, Initial Opening Balance).
   - Submitting the form atomically creates the Primary Bank Account and the initial Month, with `salaryBankAccountId` pre-routed to this account.
3. **Mandatory Salary Depository**:
   - Monthly salary/income must be credited to a designated Bank Account (`salaryBankAccountId`), defaulting to the user's Primary Bank Account.
4. **Mandatory Goal Funding Source**:
   - Purchase goals require selecting a funding Bank Account or Wallet (defaulting to the Primary Bank Account), and converting a goal into a planned budget item automatically inherits this funding account.

## Consequences
- Every monetary figure in the system is backed by a concrete bank account or cash wallet ledger.
- Fresh users are seamlessly guided to establish their primary banking ledger during initial month creation without extra onboarding steps.
- Timeline curves, account filter bars, and accounts screen summaries are mathematically unified.
