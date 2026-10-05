# 37. Unified Multi-Account Aggregation and Isolated Trajectory

Date: 2026-10-04

## Context
As users establish multiple bank accounts and cash wallets, the dashboard must seamlessly balance two complementary perspectives:
1. **Consolidated Financial Truth (All Accounts)**: A holistic view where the top KPI summary cards (Monthly Income, Total Expenses, Today's Balance, Month-End Balance, and Dynamic Safe Velocity) represent the exact mathematical sum of all registered bank accounts and wallets, and the interactive timeline and step-line chart display all planned expenses, actual transactions, and income streams combined.
2. **Account-Isolated Trajectory**: A focused operational view where filtering by an individual bank account or wallet isolates the entire dashboard stack—including the top Dynamic Safe Velocity card, KPI cards, timeline curve, and event feed—specifically to that account's assigned cash flows, reserves, minimum balance, and committed bills.
3. **Existing Calculated Data Ingestion**: Existing users with active calculated budgets require a frictionless 1-tap transfer mechanism directly from the dashboard to ingest 100% of their existing numbers into their Primary Bank Account without data loss.

## Decision
1. **Unified View Aggregation**:
   - The "All Accounts (Unified)" mode calculates every top summary card as the exact sum of all active bank accounts and wallets:
     - $\text{Monthly Income} = \sum \text{Account Incomes}$
     - $\text{Total Expenses} = \sum \text{Account Expenses}$
     - $\text{Today's Balance} = \sum \text{Account Today Balances}$
     - $\text{Month-End Balance} = \sum \text{Account Ending Balances}$
     - $\text{Dynamic Safe Velocity} = \text{Consolidated Liquid Cushion} / \text{Days Remaining}$
   - Internal inter-account transfers are presented as net-zero liquidity reallocations in the Unified timeline, maintaining true net cash fidelity.
2. **Account-Isolated Insights & Velocity**:
   - When an individual account is selected in the filter pill bar:
     - The **Dynamic Safe Velocity Card** calculates that specific account's discretionary spending velocity ($\max(0, \text{Today} - \text{Committed Bills} - \text{Min Balance} - \text{Earmarked Goals}) / \text{Days Left}$).
     - The **Detailed KPI Cards** reflect only that account's specific income, expenses, current balance, and minimum cash trough.
     - The **Chart & Timeline** plot only the isolated account's daily balance trajectory and chronological events (with transfers represented as explicit debits or credits).
3. **Plan Screen Prominent Ingestion Action**:
   - A prominent "Transfer Existing Calculations to Bank Account" card is surfaced directly on the Plan screen when unmigrated calculated budget data exists, enabling immediate 1-tap onboarding into a Primary Bank Account.

## Consequences
- Zero ambiguity: all unified summary figures match the arithmetic sum of the user's active bank accounts and wallets.
- Users gain granular clarity on per-account liquidity without losing their macro financial trajectory.
- Inter-account transfers reflect exact bank movement without distorting top-line spend or income totals.
