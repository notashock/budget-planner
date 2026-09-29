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
An expense scheduled on a specific day of the month that repeats monthly, clamped to the last day of shorter months.
_Avoid_: Subscription, standing order, bill.

**Fixed Recurring Item**:
A recurring item marked with a fixed flag that is automatically carried over to the next month on the identical calendar day and amount during month rollover.
_Avoid_: Permanent bill, locked expense, hard subscription.


**Fuel Log**:
A vehicle fuel expense entry recording odometer readings, fuel volume, and total cost across refueling stops, automatically calculating bike fuel efficiency (distance per volume unit) between consecutive stops.
_Avoid_: Formula item, mileage expense, dynamic bill.


**Month Rollover**:
The process of creating the next calendar month, copying recurring items and optionally carrying forward the ending balance as the new opening balance.
_Avoid_: Month close, archive, reset.

**What-If**:
An ephemeral in-memory recalculation of the timeline with modified item amounts or frequencies without saving to the database.
_Avoid_: Scenario, simulation draft, sandbox.

**Recommended Purchase Date**:
The latest calendar date in a month on which a one-time purchase can occur without causing the running balance on that or any subsequent date to breach the safety floor.
_Avoid_: Optimal purchase time, suggested spend day.

**Transaction**:
A recorded financial actual (expense or negative refund) on an exact date, either linked to a planned item or logged as an unexpected expense.
_Avoid_: Purchase entry, ledger entry, receipt.

**Unplanned Allowance**:
A monthly pool allocated for unexpected spending not captured by planned items, monitored through a daily rate.
_Avoid_: Buffer, slush fund, petty cash.

**Safe to Spend per Day**:
The remaining unplanned allowance divided by the remaining calendar days in the month.
_Avoid_: Daily budget, burn rate.

**Purchase Goal**:
A target one-time purchase evaluated against the monthly cash flow to recommend a feasible purchase date or advise waiting for the following month.
_Avoid_: Wishlist, savings target, impulse budget.

**Net Item Amount**:
The effective monetary cost of a budget item computed by subtracting all mapped refund transactions from its original amount.
_Avoid_: Adjusted cost, discounted price, revised expense.




