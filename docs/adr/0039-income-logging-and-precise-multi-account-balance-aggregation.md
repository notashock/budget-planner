# 39. Income Logging and Precise Multi-Account Balance Aggregation

Date: 2026-10-04

## Status

Accepted

## Context

Users need to track both scheduled salary income and ad-hoc income receipts (e.g. freelance payments, bonuses, reimbursements, dividends) credited to specific bank accounts or wallets.

Previously:
1. Income was primarily modeled as a single static `month.incomeAmount` configured at month creation and deposited to `month.salaryBankAccountId`.
2. `UnifiedEntryModal` supported logging expenses, planning budget items, and transfers, but lacked a dedicated mode for logging income receipts.
3. In individual account views and KPI summaries, the relationship between scheduled salary, logged income transactions, today's liquid balance, and lowest balance needed strict mathematical attribution and filtering.

## Decision

1. **Log Income Tab in UnifiedEntryModal**:
   - Add a 4th mode tab: `Log Income` (`income`).
   - If a monthly salary is scheduled on the active month, render an informative card displaying the scheduled salary amount, credit date, and receiving bank depository.
   - Provide a form to log ad-hoc income with: Amount (₹), Date, Deposited Account (Bank Account or Wallet), Tag ('Salary', 'Freelance', 'Bonus', 'Investment', 'Other'), and Note.
   - Submitting creates a transaction record with `isIncome: true` tagged with `accountType`, `bankAccountId`, or `walletId`.

2. **Unified (All Accounts) Metrics**:
   - **Monthly Income**: Exact sum of scheduled monthly salary (`month.incomeAmount`) plus all logged income transactions (`isIncome: true`) in that month.
   - **Today's Balance**: Sum of all accounts' current liquid balances (accounting for opening balances, all incomes to date, all expense transactions to date, and paid planned items to date).
   - **Lowest Balance**: The lowest point on the aggregate liquidity curve from Day 1 to Month-End after considering all incomes, planned items, and transactions.
   - **Total Expenses**: Sum of all planned items and unplanned expense transactions across all accounts.
   - **Internal Transfers**: Treated as net-zero ($0 impact on aggregate cash).

3. **Isolated (Single Account) Metrics**:
   - **Monthly Income**: Income credited to this specific account (base salary if designated as `salaryBankAccountId`, plus any income transactions tagged to this account).
   - **Today's Balance**: Isolated current liquid balance for this account (opening balance + incomes credited to date - expenses to date - paid planned items to date + net internal transfers to date).
   - **Lowest Balance**: Lowest balance reached on this specific account's cash curve across the month.
   - **Total Expenses**: Sum of planned items assigned to this account plus expense transactions tagged to this account.
   - **Internal Transfers**: Discrete debit on source account (`-₹X,XXX.XX`) and credit on destination account (`+₹X,XXX.XX`).

4. **Timeline Presentation**:
   - Logged income entries are rendered on the interactive timeline with an elevated credit badge (`+₹X,XXX.XX`), income source tag, and receiving account name.
   - Filtered account mode strictly displays only items and transactions tagged to that account.

## Consequences

- Complete clarity over liquidity across multiple banks and wallets.
- Supports multi-income households and irregular freelance earnings.
- All KPIs on Plan screen and Accounts screen stay mathematically synchronized.
