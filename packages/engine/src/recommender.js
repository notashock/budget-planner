import { getDaysInMonth, formatDate, clampDayToMonth } from './calendar.js';
import { simulate } from './simulator.js';

/**
 * Goal Date Estimation Pipeline
 * 
 * Dynamically estimates the optimal future date to execute a purchase goal within
 * the current month by:
 * 1. Restricting candidate dates strictly to future/current days (currentDay..daysInMonth).
 * 2. Analysing user spending pattern (actual daily burn rate vs planned allowance).
 * 3. Clearing heavy upcoming bills first (e.g. rent, fixed recurring items) to avoid cash squeezes.
 * 4. Finding the safe date that maximizes cash reserve while preserving safety floor.
 * 5. If no day in the month safely maintains the floor, returns feasible: false with
 *    recommendedDate: null (never returns a misleading date).
 * 
 * @param {object} settings - Simulation settings including openingBalance, incomeAmount, safetyFloor, unplannedAllowance, currentDay
 * @param {Array<object>} items - Planned budget items
 * @param {object} month - { year, month }
 * @param {number} purchaseAmount - Goal target price in minor units
 * @param {Array<object>} [transactions=[]] - Logged transactions for spending velocity analysis
 * 
 * @returns {{
 *   recommendedDate: string | null,
 *   recommendedDay: number | null,
 *   feasible: boolean,
 *   projectedLowestBalance: number,
 *   savingsBuffer: number,
 *   projectedFloorDeficit?: number,
 *   explanation: string,
 *   pipelineDetails?: {
 *     currentDay: number,
 *     burnRatePerDay: number,
 *     heavyBillDays: number[],
 *     safeDaysCount: number
 *   }
 * }}
 */
export function recommendPurchaseDate(
  settings = {},
  items = [],
  month = { year: 2026, month: 1 },
  purchaseAmount = 0,
  transactions = []
) {
  const { year, month: monthNum } = month;
  const daysInMonth = getDaysInMonth(year, monthNum);
  const safetyFloor = Math.round(settings.safetyFloor ?? 0);
  const cost = Math.abs(Math.round(purchaseAmount || 0));

  // Pipeline Step 1: Candidate date window restricted to today onwards
  const currentDay = typeof settings.currentDay === 'number'
    ? Math.max(1, Math.min(daysInMonth, Math.floor(settings.currentDay)))
    : 1;

  if (currentDay > daysInMonth) {
    return {
      recommendedDate: null,
      recommendedDay: null,
      feasible: false,
      projectedLowestBalance: 0,
      savingsBuffer: 0,
      projectedFloorDeficit: cost,
      explanation: 'Month has concluded. Defer goal to the following month.'
    };
  }

  // Pipeline Step 2: Analyse spending velocity / daily burn rate from logged transactions
  const unexpectedSpend = (transactions || [])
    .filter((tx) => !tx.plannedItemId && Number(tx.amount) > 0)
    .reduce((sum, tx) => sum + Math.round(Number(tx.amount)), 0);

  const daysPassed = Math.max(1, currentDay);
  const actualDailyBurnRate = Math.round(unexpectedSpend / daysPassed);
  const plannedDailyRate = settings.unplannedAllowance
    ? Math.round(settings.unplannedAllowance / daysInMonth)
    : 0;
  const effectiveBurnRate = Math.max(actualDailyBurnRate, plannedDailyRate);

  // Pipeline Step 3: Identify heavy scheduled bills in the remainder of the month
  // A heavy bill is defined as any planned debit >= 15% of monthly income, or >= 3x planned daily allowance
  const heavyBillThreshold = settings.incomeAmount > 0
    ? Math.round(settings.incomeAmount * 0.15)
    : Math.max(cost, 10000);

  const heavyBillDays = new Set();
  items.forEach((item) => {
    if (item.type === 'recurring' || item.isFixed) {
      const d = clampDayToMonth(item.dayOfMonth ?? 1, daysInMonth);
      if (d >= currentDay && Math.round(item.amount ?? 0) >= heavyBillThreshold) {
        heavyBillDays.add(d);
      }
    } else if (item.type === 'one-time') {
      const d = clampDayToMonth(item.day ?? 1, daysInMonth);
      if (d >= currentDay && Math.round(item.amount ?? 0) >= heavyBillThreshold) {
        heavyBillDays.add(d);
      }
    }
  });

  const latestHeavyBillDay = heavyBillDays.size > 0
    ? Math.max(...heavyBillDays)
    : currentDay;

  // Pipeline Step 4: Evaluate candidates from currentDay to daysInMonth
  const safeCandidates = [];
  let highestLowestBalance = -Infinity;
  let bestAlternativeDay = null;

  for (let d = currentDay; d <= daysInMonth; d++) {
    const candidateItem = {
      id: '__hypothetical_goal_purchase__',
      type: 'one-time',
      name: 'Goal Purchase',
      amount: cost,
      day: d,
      date: formatDate(year, monthNum, d),
      priority: 10
    };

    const simResult = simulate(
      settings,
      [...items, candidateItem],
      month,
      transactions
    );

    if (simResult.lowestBalance > highestLowestBalance) {
      highestLowestBalance = simResult.lowestBalance;
      bestAlternativeDay = d;
    }

    if (!simResult.floorBreached && simResult.lowestBalance >= safetyFloor) {
      safeCandidates.push({
        day: d,
        date: formatDate(year, monthNum, d),
        lowestBalance: simResult.lowestBalance,
        savingsBuffer: simResult.lowestBalance - safetyFloor,
        isAfterHeavyBills: d >= latestHeavyBillDay
      });
    }
  }

  // Pipeline Step 5: Decision & Selection
  if (safeCandidates.length > 0) {
    // Prefer safe days that clear heavy bills first
    const preferredCandidates = safeCandidates.filter((c) => c.isAfterHeavyBills);
    const candidatePool = preferredCandidates.length > 0 ? preferredCandidates : safeCandidates;

    // Pick the date that maximizes remaining cash buffer; tie-break by latest date
    candidatePool.sort((a, b) => {
      if (b.savingsBuffer !== a.savingsBuffer) {
        return b.savingsBuffer - a.savingsBuffer;
      }
      return b.day - a.day;
    });

    const chosen = candidatePool[0];

    return {
      recommendedDate: chosen.date,
      recommendedDay: chosen.day,
      feasible: true,
      projectedLowestBalance: chosen.lowestBalance,
      savingsBuffer: chosen.savingsBuffer,
      explanation: `Purchasing on ${chosen.date} preserves a safety buffer of ${chosen.savingsBuffer} minor units after clearing scheduled monthly obligations.`,
      pipelineDetails: {
        currentDay,
        burnRatePerDay: effectiveBurnRate,
        heavyBillDays: Array.from(heavyBillDays),
        safeDaysCount: safeCandidates.length
      }
    };
  }

  // Pipeline Step 6: Infeasible - NEVER display an arbitrary date!
  const deficit = safetyFloor - highestLowestBalance;

  return {
    recommendedDate: null,
    recommendedDay: null,
    feasible: false,
    projectedLowestBalance: highestLowestBalance,
    savingsBuffer: -deficit,
    projectedFloorDeficit: deficit,
    explanation: `Price is too high for this month. Purchasing would breach your safety floor by ${deficit} minor units. Wait for next month.`,
    pipelineDetails: {
      currentDay,
      burnRatePerDay: effectiveBurnRate,
      heavyBillDays: Array.from(heavyBillDays),
      safeDaysCount: 0
    }
  };
}
