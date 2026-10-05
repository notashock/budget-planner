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

  // Pipeline Step 1: Candidate date window restricted strictly to future dates relative to present
  let currentDay = 1;
  let candidateStartDay = 1;

  if (typeof settings.currentDay === 'number') {
    currentDay = Math.floor(settings.currentDay);
    // If currentDay is within active month (>= 1), only recommend future dates (currentDay + 1 .. daysInMonth)
    // If currentDay === 0 (future month planning), start at Day 1
    candidateStartDay = currentDay >= 1 ? currentDay + 1 : 1;
  } else if (settings.currentDay === null) {
    // Explicitly a completed past month
    return {
      recommendedDate: null,
      recommendedDay: null,
      feasible: false,
      projectedLowestBalance: 0,
      savingsBuffer: 0,
      projectedFloorDeficit: cost,
      explanation: 'Month has concluded. Defer goal to the following month.'
    };
  } else {
    // currentDay not specified; default to starting from Day 1
    currentDay = 1;
    candidateStartDay = 1;
  }

  if (candidateStartDay > daysInMonth) {
    return {
      recommendedDate: null,
      recommendedDay: null,
      feasible: false,
      projectedLowestBalance: 0,
      savingsBuffer: 0,
      projectedFloorDeficit: cost,
      explanation: 'No remaining future dates exist in this month. Defer to the following month.'
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

  for (let d = candidateStartDay; d <= daysInMonth; d++) {
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

/**
 * Evaluates multiple purchase goals in sequential priority order, reserving funds from both the
 * unified cashflow and the designated funding accounts' daily balances.
 *
 * @param {object} params
 * @param {object} params.settings - Simulation settings (openingBalance, incomeAmount, accounts, etc.)
 * @param {Array<object>} params.items - Planned budget items
 * @param {object} params.month - { year, month }
 * @param {Array<object>} params.goals - Goals to evaluate
 * @param {Array<object>} [params.transactions=[]] - Real-world transactions
 * @param {Array<object>} [params.transfers=[]] - Inter-account transfers
 * @param {Array<object>} [params.accounts=[]] - Bank accounts and wallets
 * @returns {Array<object>} Evaluated goals with attached recommendation
 */
export function evaluateGoalsWithReservation({
  settings = {},
  items = [],
  month = { year: 2026, month: 1 },
  goals = [],
  transactions = [],
  transfers = [],
  accounts = []
}) {
  const normId = (val) => {
    if (!val) return null;
    if (typeof val === 'string') return val.trim();
    if (val._id) return String(val._id).trim();
    if (val.id) return String(val.id).trim();
    return String(val).trim();
  };

  // Build account lookup
  let allAccounts = [];
  if (Array.isArray(accounts) && accounts.length > 0) {
    allAccounts = accounts;
  } else if (Array.isArray(settings.accounts)) {
    allAccounts = settings.accounts;
  } else if (settings.accounts && (Array.isArray(settings.accounts.bankAccounts) || Array.isArray(settings.accounts.wallets))) {
    allAccounts = [
      ...(settings.accounts.bankAccounts || []),
      ...(settings.accounts.wallets || [])
    ];
  }

  const accountMap = new Map();
  allAccounts.forEach((acc) => {
    const id = normId(acc._id) || normId(acc.id);
    if (id) accountMap.set(id, acc);
  });

  const simSettings = {
    ...settings,
    accounts: allAccounts.length > 0 ? allAccounts : settings.accounts,
    transfers: Array.isArray(transfers) && transfers.length > 0 ? transfers : settings.transfers
  };

  // Clone items to accumulate synthetic reservations for feasible goals
  const committedItems = [...items];

  // Map goals with original indices for stable output order
  const indexedGoals = goals.map((g, idx) => ({
    originalIndex: idx,
    goal: g,
    priority: Number(g.priority ?? 0)
  }));

  // Sort by priority ascending (0 = High, 1 = Med, 2 = Low), then by original order / creation
  indexedGoals.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.originalIndex - b.originalIndex;
  });

  const evaluated = [];

  for (const item of indexedGoals) {
    const g = item.goal;
    const goalObj = typeof g.toObject === 'function' ? g.toObject() : (g._doc ? { ...g._doc } : { ...g });
    const isEvaluable = !goalObj.status || goalObj.status === 'active' || goalObj.status === 'evaluating' || goalObj.status === 'ready' || goalObj.status === 'scheduled';

    if (!isEvaluable) {
      evaluated.push({
        originalIndex: item.originalIndex,
        goal: { ...goalObj }
      });
      continue;
    }

    // Resolve designated funding source
    let resolvedFunding = null;
    const targetAccountId = normId(g.fundingBankAccountId) || normId(g.fundingWalletId) || normId(g.fundingAccountId);
    if (targetAccountId && accountMap.has(targetAccountId)) {
      const acc = accountMap.get(targetAccountId);
      resolvedFunding = {
        id: normId(acc._id) || normId(acc.id),
        type: g.fundingSourceType || acc.type || 'bank',
        name: acc.name || 'Account',
        minimumBalance: Math.round(Number(acc.minimumBalance) || 0)
      };
    }

    const recommendation = recommendPurchaseDate(
      simSettings,
      committedItems,
      month,
      g.targetAmount,
      transactions,
      [],
      transfers,
      resolvedFunding
    );

    if (recommendation.feasible && recommendation.recommendedDay) {
      // Reserve this goal's funds on and after its recommendedDay
      committedItems.push({
        _id: `goal_res_${g._id || g.id || item.originalIndex}`,
        type: 'one-time',
        name: `[Goal Reserved] ${g.name}`,
        amount: Math.round(Number(g.targetAmount) || 0),
        day: recommendation.recommendedDay,
        date: recommendation.recommendedDate,
        accountType: resolvedFunding ? resolvedFunding.type : (g.fundingSourceType || null),
        bankAccountId: (resolvedFunding && resolvedFunding.type === 'bank') ? resolvedFunding.id : (g.fundingBankAccountId || null),
        walletId: (resolvedFunding && resolvedFunding.type === 'wallet') ? resolvedFunding.id : (g.fundingWalletId || null),
        isPaid: false
      });
    }

    if (goalObj.status === 'evaluating') goalObj.status = 'active';
    if (goalObj.status === 'ready') goalObj.status = 'scheduled';

    evaluated.push({
      originalIndex: item.originalIndex,
      goal: {
        ...goalObj,
        recommendation
      }
    });
  }

  // Restore original ordering
  evaluated.sort((a, b) => a.originalIndex - b.originalIndex);
  return evaluated.map((e) => e.goal);
}

