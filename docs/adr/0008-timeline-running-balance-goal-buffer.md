# 8. Timeline Running-Balance Goal Safety Buffer Calculation

Date: 2026-09-30

## Status

Accepted

## Context

Goal date recommendation was previously evaluating cash availability without properly accounting for subsequent scheduled expenses occurring later in the month. Specifically, evaluating whether an item could be purchased on a given day (e.g. Day 1) against the immediate balance (e.g. income + opening balance = 7,743) without factoring in future bills (e.g. 4,622 of expenses) could recommend buying today even though future bills would later drop the balance below the safety floor (e.g. 3,121 - 2,500 = 621, breaching a 1,000 floor by 379).

To guarantee safety floor integrity, the buffer must be calculated from the exact same running-balance timeline the Plan screen uses:
$$\text{buffer}(d) = \min_{t \ge d} (\text{running balance on day } t) - \text{price} - \text{safetyFloor}$$
and if the buffer is negative across candidate days, the recommender must explicitly recommend waiting for next month rather than suggesting an unsafe purchase date.

## Decisions

1. **Timeline Running-Balance Buffer Calculation**:
   - For any candidate purchase date $d \in [\text{currentDay}, \text{daysInMonth}]$, compute the baseline simulation timeline via `simulate(settings, items, month, transactions)`.
   - Calculate the minimum running balance from day $d$ to month-end:
     $$\text{minBalanceFromDToEnd} = \min(\{ \text{dailyBalances}_{t \ge d} \} \cup \{ \text{events}_{t \ge d}.\text{balanceAfter} \})$$
   - Compute the safety buffer:
     $$\text{buffer} = \text{minBalanceFromDToEnd} - \text{cost} - \text{safetyFloor}$$
   - Any candidate day with $\text{buffer} < 0$ is rejected as unsafe.

2. **Infeasible Goal Handling**:
   - If $\text{buffer} < 0$ for all candidate days in the month:
     - Return `feasible: false`.
     - Return strictly `recommendedDate: null` and `recommendedDay: null`.
     - Expose `projectedFloorDeficit: Math.abs(highestBuffer)` and `projectedLowestBalance: bestLowestBalance`.
     - Explicitly advise the user to wait for next month in `explanation`.

3. **Safe Candidate Selection**:
   - When one or more days satisfy $\text{buffer} \ge 0$:
     - Prioritize dates clearing heavy bills first ($d \ge \text{latestHeavyBillDay}$).
     - Sort by `savingsBuffer` descending (maximizing remaining cash reserve).
     - Break ties by latest day (keeping cash in hand for as long as possible).

4. **Client-Server Real-Time Synchronization**:
   - `GoalsScreen` evaluates active goals reactively using `@budget/engine`'s `recommendPurchaseDate` against the live `items`, `transactions`, and `month` state.
   - Any transaction logging, item change, or month setting update immediately triggers live recommendation updates without UI lag or stale dates.

## Consequences

- Completely eliminates false-positive recommendations that ignore upcoming monthly bills.
- Ensures the Plan screen's cash flow projections and Goal recommendations operate on the exact same underlying mathematical timeline.
- Infeasible goals clearly display the safety floor deficit and prompt the user to defer to next month.
