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
 * 5. Optionally verifying designated Funding Source (Bank Account / Wallet) solvency.
 * 6. If no day in the month safely maintains the floor or account balance, returns feasible: false with
 *    recommendedDate: null (never returns a misleading date).
 * 
 * @param {object} settings - Simulation settings including openingBalance, incomeAmount, safetyFloor, unplannedAllowance, currentDay
 * @param {Array<object>} items - Planned budget items
 * @param {object} month - { year, month }
 * @param {number} purchaseAmount - Goal target price in minor units
 * @param {Array<object>} [transactions=[]] - Logged transactions for spending velocity analysis
 * @param {Array<object>} [goals=[]] - Active purchase goals
 * @param {Array<object>} [transfers=[]] - Paired Account Transfers
 * @param {object|null} [fundingSource=null] - Optional funding account constraints { id, type, name, minimumBalance }
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
  transactions = [],
  goals = [],
  transfers = [],
  fundingSource = null
) {
  const { year, month: monthNum } = month;
  const daysInMonth = getDaysInMonth(year, monthNum);
  const safetyFloor = Math.round(settings.safetyFloor ?? 0);
  const cost = Math.abs(Math.round(purchaseAmount || 0));

  const resolvedFundingSource = fundingSource || settings.fundingSource || null;

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
    .filter((tx) => !tx.plannedItemId && !tx.isIncome && Number(tx.amount) > 0)
    .reduce((sum, tx) => sum + Math.round(Number(tx.amount)), 0);

  const daysPassed = Math.max(1, currentDay);
  const actualDailyBurnRate = Math.round(unexpectedSpend / daysPassed);
  const plannedDailyRate = settings.unplannedAllowance
    ? Math.round(settings.unplannedAllowance / daysInMonth)
    : 0;
  const effectiveBurnRate = Math.max(actualDailyBurnRate, plannedDailyRate);

  // Pipeline Step 3: Identify heavy scheduled bills and compute daily planned load
  const heavyBillThreshold = settings.incomeAmount > 0
    ? Math.round(settings.incomeAmount * 0.15)
    : Math.max(cost, 10000);

  const heavyBillDays = new Set();
  const dailyPlannedLoad = {};
  items.forEach((item) => {
    let d = 1;
    if (item.type === 'recurring' || item.isFixed) {
      d = clampDayToMonth(item.dayOfMonth ?? 1, daysInMonth);
      if (d >= currentDay && Math.round(item.amount ?? 0) >= heavyBillThreshold) {
        heavyBillDays.add(d);
      }
    } else if (item.type === 'one-time') {
      d = clampDayToMonth(item.day ?? 1, daysInMonth);
      if (d >= currentDay && Math.round(item.amount ?? 0) >= heavyBillThreshold) {
        heavyBillDays.add(d);
      }
    }
    const amt = Math.round(item.amount ?? 0);
    dailyPlannedLoad[d] = (dailyPlannedLoad[d] || 0) + amt;
  });

  const latestHeavyBillDay = heavyBillDays.size > 0
    ? Math.max(...heavyBillDays)
    : currentDay;

  // Pipeline Step 4: Compute baseline simulation timeline (same as Plan screen)
  const baselineSim = simulate(settings, items, month, transactions, goals, transfers);

  const safeCandidates = [];
  let highestBuffer = -Infinity;
  let bestLowestBalance = -Infinity;
  let bestDay = null;
  let bestLowestDate = null;
  let accountDeficitFound = false;

  for (let d = currentDay; d <= daysInMonth; d++) {
    // Gather all running balances from day d through month-end
    const candidatePoints = [
      ...baselineSim.dailyBalances.filter((p) => p.day >= d).map((p) => ({ balance: p.balance, date: p.date, day: p.day })),
      ...baselineSim.events.filter((e) => e.day >= d).map((e) => ({ balance: e.balanceAfter, date: e.date, day: e.day }))
    ];

    let minBalanceFromDToEnd = baselineSim.endingBalance;
    let minPointDate = formatDate(year, monthNum, daysInMonth);

    if (candidatePoints.length > 0) {
      let minVal = Infinity;
      for (const pt of candidatePoints) {
        if (pt.balance < minVal) {
          minVal = pt.balance;
          minPointDate = pt.date;
        }
      }
      minBalanceFromDToEnd = minVal;
    }

    // Safety buffer: minimum balance from the purchase date to month-end, minus price, minus floor
    const buffer = minBalanceFromDToEnd - cost - safetyFloor;
    const projectedLowest = minBalanceFromDToEnd - cost;

    if (buffer > highestBuffer) {
      highestBuffer = buffer;
      bestLowestBalance = projectedLowest;
      bestDay = d;
      bestLowestDate = minPointDate;
    }

    const daysRemaining = Math.max(0, daysInMonth - d);
    const projectedBurnRemaining = effectiveBurnRate * daysRemaining;
    const paceBuffer = buffer - projectedBurnRemaining;

    // Check if aggregate balance on day d itself can absorb the cost
    const dayBalancePoint = baselineSim.dailyBalances.find((p) => p.day === d);
    const balanceOnDay = dayBalancePoint ? dayBalancePoint.balance : minBalanceFromDToEnd;
    const canAffordOnDay = (balanceOnDay - cost) >= safetyFloor;

    // Check designated funding source solvency if configured
    let fundingSourceSafe = true;
    if (resolvedFundingSource && resolvedFundingSource.id) {
      const accDaily = baselineSim.accountDailyBalances?.[String(resolvedFundingSource.id)] || [];
      const accRemaining = accDaily.filter((p) => p.day >= d);
      const minAccBal = accRemaining.length > 0
        ? Math.min(...accRemaining.map((p) => p.balance))
        : 0;
      const minRequired = Math.round(Number(resolvedFundingSource.minimumBalance) || 0);

      if ((minAccBal - cost) < minRequired) {
        fundingSourceSafe = false;
        accountDeficitFound = true;
      }
    }

    if (buffer >= 0 && canAffordOnDay && fundingSourceSafe) {
      safeCandidates.push({
        day: d,
        date: formatDate(year, monthNum, d),
        minBalanceFromDToEnd,
        projectedLowestBalance: projectedLowest,
        savingsBuffer: buffer,
        paceBuffer,
        existingDailyLoad: dailyPlannedLoad[d] || 0,
        isAfterHeavyBills: d >= latestHeavyBillDay,
        lowestDate: minPointDate
      });
    }
  }

  // Pipeline Step 5: Decision & Selection with Daily Outflow Smoothing
  if (safeCandidates.length > 0) {
    const preferredCandidates = safeCandidates.filter((c) => c.isAfterHeavyBills);
    const candidatePool = preferredCandidates.length > 0 ? preferredCandidates : safeCandidates;

    const paceSafeCandidates = candidatePool.filter((c) => c.paceBuffer >= 0);
    const activePool = paceSafeCandidates.length > 0 ? paceSafeCandidates : candidatePool;

    activePool.sort((a, b) => {
      // 1. Primary: Daily Outflow Smoothing (lowest existing scheduled spend on that date)
      if (a.existingDailyLoad !== b.existingDailyLoad) {
        return a.existingDailyLoad - b.existingDailyLoad;
      }
      // 2. Secondary: Earliest day if pace-safe
      if (paceSafeCandidates.length > 0) {
        return a.day - b.day;
      }
      // 3. Fallback: Highest savings buffer, then earliest day
      if (b.savingsBuffer !== a.savingsBuffer) {
        return b.savingsBuffer - a.savingsBuffer;
      }
      return a.day - b.day;
    });

    const chosen = activePool[0];

    return {
      recommendedDate: chosen.date,
      recommendedDay: chosen.day,
      feasible: true,
      projectedLowestBalance: chosen.projectedLowestBalance,
      savingsBuffer: chosen.savingsBuffer,
      lowestDate: chosen.lowestDate,
      explanation: `Purchasing on ${chosen.date} preserves a safety buffer of ${chosen.savingsBuffer} minor units after clearing scheduled monthly obligations and accounting for spending pace.`,
      pipelineDetails: {
        currentDay,
        burnRatePerDay: effectiveBurnRate,
        heavyBillDays: Array.from(heavyBillDays),
        safeDaysCount: safeCandidates.length,
        paceSafeDaysCount: paceSafeCandidates.length
      }
    };
  }

  // Pipeline Step 6: Infeasible
  const deficit = Math.abs(highestBuffer);
  let explanation = `Price is too high for this month. Purchasing would breach your safety floor by ${deficit} minor units. Wait for next month.`;
  if (accountDeficitFound && highestBuffer >= 0 && resolvedFundingSource) {
    explanation = `Selected funding account (${resolvedFundingSource.name || 'account'}) does not have sufficient balance to cover this purchase while respecting its minimum required balance. Transfer funds into this account or select a different funding source.`;
  }

  return {
    recommendedDate: null,
    recommendedDay: null,
    feasible: false,
    projectedLowestBalance: bestLowestBalance,
    savingsBuffer: highestBuffer,
    projectedFloorDeficit: deficit,
    lowestDate: bestLowestDate,
    explanation,
    pipelineDetails: {
      currentDay,
      burnRatePerDay: effectiveBurnRate,
      heavyBillDays: Array.from(heavyBillDays),
      safeDaysCount: 0
    }
  };
}
