# Budget Planner

A deterministic monthly budget planner that calculates day-by-day running balances against income, dated expenses, and a safety floor.

## Language

**Plan**:
A dated projection of running balances for a specific month calculated deterministically from income and items.
_Avoid_: Budget sheet, spreadsheet, forecast.

**Safety Floor**:
A minimum cash threshold specified by the user, below which any projected daily balance is flagged as a breach.
_Avoid_: Minimum balance, buffer, overdraft limit.

**Timeline**:
A chronological sequence of dated events and running balances resulting from the simulation of a month.
_Avoid_: Ledger, transaction history, statement.

**Event**:
A single dated occurrence (income receipt, recurring item debit, one-time item debit, or formula item occurrence) that updates the running balance.
_Avoid_: Transaction, entry, record.

**One-Time Item**:
An expense occurring on a single calendar date.
_Avoid_: Ad-hoc expense, sporadic cost.

**Recurring Item**:
An expense scheduled on a specific day of the month that recurs monthly, clamped to the last day of shorter months.
_Avoid_: Subscription, standing order, bill.

**Formula Item**:
A transportation or usage-based expense calculated per occurrence from distance, efficiency, fuel price, and extra cost across specified dates.
_Avoid_: Dynamic item, mileage expense.

**Month Rollover**:
The process of creating the next calendar month, copying recurring items and optionally carrying forward the ending balance as the new opening balance.
_Avoid_: Month close, archive, reset.

**What-If**:
An ephemeral in-memory recalculation of the timeline with modified item amounts or frequencies without saving to the database.
_Avoid_: Scenario, simulation draft, sandbox.
