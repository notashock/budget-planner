# Dynamic Spending Pattern Date Estimation and Salary Credit Calendar Cycle

## Context
Goal purchase date recommendation previously iterated across all days of the month indiscriminately (even past dates) and returned a substitute date even when a goal breached the safety floor every single day, giving users a misleading impression that a purchase was viable. Furthermore, salaries credited on the final working day of a preceding month (such as September 30 for October expenses) were forced into an arbitrary day-of-month integer, causing timing mismatches on timeline balances. Finally, legacy formula trip fields complicated the domain model and INR (₹) was adopted as the canonical currency.

## Decision
1. **Dynamic Goal Date Estimation Pipeline**:
   - Restrict candidate dates strictly to `d >= currentDay` (no past dates).
   - Dynamically calculate the user's actual daily burn rate from logged unplanned transactions (`spentSoFar / daysPassedSoFar`).
   - Project remaining daily allowance consumption based on actual burn rate.
   - Schedule purchases only after heavy scheduled bills (e.g. fixed rent) have cleared so liquidity is preserved.
   - If no candidate date maintains the balance above the safety floor, return `feasible: false` and explicitly `recommendedDate: null`. Do not display an arbitrary date; clearly indicate the floor deficit and advise deferral to next month.
2. **Salary Credit Date**:
   - Model salary credit as a specific calendar date selector (`incomeCreditDate`).
   - When the salary credit date occurs on or before Day 1 of the planned month (e.g. Sep 30 for October), the engine treats the salary as available funds starting on Day 1 (Oct 1).
3. **Currency & Domain Simplification**:
   - Set the default currency symbol to `₹` (Indian Rupee) throughout the engine, backend models, and frontend.
   - Completely remove the legacy `type: 'formula'` trip calculation item while retaining vehicle `fuel-log` entries.
