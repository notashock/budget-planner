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
A single dated occurrence (income receipt, recurring item debit, one-time item debit, or fuel log stop) that updates the running balance.
_Avoid_: Transaction, entry, record.

**Salary Credit Date**:
The exact calendar date on which salary is deposited. When credited on or before the 1st of the budget month (such as the 30th of the preceding month), the funds become available cash from Day 1 of the planned month.
_Avoid_: Payday number, salary cycle day.

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
The process of creating the next calendar month, copying fixed recurring items and optionally carrying forward the ending balance as the new opening balance.
_Avoid_: Month close, archive, reset.

**What-If**:
An ephemeral in-memory recalculation of the timeline with modified item amounts or frequencies without saving to the database.
_Avoid_: Scenario, simulation draft, sandbox.

**Goal Date Estimation Pipeline**:
An algorithm that determines whether a target purchase goal is feasible within the remainder of the month by evaluating upcoming heavy fixed bills, projecting remaining spend from the user's actual daily burn rate, and picking the safest upcoming date that maximizes savings buffer. If no safe date exists, it returns no date (`null`) with an explicit floor deficit and wait-for-next-month guidance.
_Avoid_: Spend date picker, price estimator.

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

**Goal Lifecycle Status**:
The state of a purchase goal within a budget month: `active` (evaluating recommendation dynamically against cash flows), `scheduled` (promoted to a planned one-time budget item), or `deferred` (pushed to the following budget month).
_Avoid_: Evaluating, pending, queued, purchased.

**Priority Tier**:
A 3-tier visual ordering system for same-day items: High (3 bars / 0), Medium (2 bars / 1), and Low (1 bar / 2), controlling the deterministic order in which simultaneous expenses draw on the daily balance.
_Avoid_: Priority number, rank, star rating.
