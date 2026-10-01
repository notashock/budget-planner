import {
  getDaysInMonth,
  clampDayToMonth,
  formatDate,
  getRelativeDay,
  getDateFromRelativeDay
} from './calendar.js';

/**
 * Pure simulation engine.
 * Computes deterministic running balance timeline, safety floor breaches,
 * real-world transactions, today's balance, and net item refunds.
 * 
 * @param {object} settings
 * @param {number} [settings.openingBalance=0] - Starting balance in minor units
 * @param {number} [settings.incomeAmount=0] - Monthly income in minor units
 * @param {string} [settings.incomeCreditDate] - Specific date salary is credited (YYYY-MM-DD)
 * @param {number} [settings.incomeCreditDay=1] - Day of month income is credited (1 - 31)
 * @param {number} [settings.safetyFloor=0] - Safety floor threshold in minor units
 * @param {number} [settings.unplannedAllowance=0] - Monthly unplanned allowance in minor units
 * @param {number} [settings.currentDay] - Current day of month for today's balance (1 - 31)
 * @param {number} [settings.scale=100] - Scale factor (100 for cents, 1 for whole units)
 * 
 * @param {Array<object>} items - List of planned items for the month
 * @param {object} month - { year, month } (month 1 - 12)
 * @param {Array<object>} [transactions=[]] - Logged real-world transactions
 * @param {Array<object>} [goals=[]] - Active purchase goals
 * 
 * @returns {object} SimulationResult
 */
export function simulate(
  settings = {},
  items = [],
  month = { year: 2026, month: 1 },
  transactions = [],
  goals = []
) {
  const { year, month: monthNum } = month;
  const daysInMonth = getDaysInMonth(year, monthNum);
  const scale = settings.scale ?? 100;
  const openingBalance = Math.round(settings.openingBalance ?? 0);
  const incomeAmount = Math.round(settings.incomeAmount ?? 0);
  const incomeCreditDay = settings.incomeCreditDay ?? 1;
  const safetyFloor = Math.round(settings.safetyFloor ?? 0);
  const unplannedAllowance = Math.round(settings.unplannedAllowance ?? 0);

  // Determine current day for today's balance calculation
  const currentDay = typeof settings.currentDay === 'number'
    ? Math.max(1, Math.min(daysInMonth, Math.floor(settings.currentDay)))
    : null;

  /** @type {Array<object>} */
  const rawEvents = [];

  // 1. Generate Income Event
  if (incomeAmount > 0) {
    let incomeDay = 1;
    let incomeDate = formatDate(year, monthNum, 1);
    let incomeLabel = 'Income';

    if (settings.incomeCreditDate && typeof settings.incomeCreditDate === 'string' && settings.incomeCreditDate.trim()) {
      const parsedDate = settings.incomeCreditDate.trim();
      const firstOfMonth = formatDate(year, monthNum, 1);
      if (parsedDate < firstOfMonth) {
        // Credited prior to Day 1 (e.g. Sep 30 for October) -> relative negative day
        incomeDay = getRelativeDay(parsedDate, year, monthNum);
        incomeDate = parsedDate;
        incomeLabel = `Salary (credited ${parsedDate})`;
      } else if (parsedDate === firstOfMonth) {
        incomeDay = 1;
        incomeDate = firstOfMonth;
        incomeLabel = 'Income';
      } else {
        const parts = parsedDate.split('-');
        const parsedD = parseInt(parts[2], 10);
        incomeDay = clampDayToMonth(isNaN(parsedD) ? 1 : parsedD, daysInMonth);
        incomeDate = formatDate(year, monthNum, incomeDay);
        incomeLabel = 'Income';
      }
    } else {
      incomeDay = clampDayToMonth(incomeCreditDay, daysInMonth);
      incomeDate = formatDate(year, monthNum, incomeDay);
    }

    rawEvents.push({
      day: incomeDay,
      date: incomeDate,
      label: incomeLabel,
      amount: incomeAmount,
      priority: -Infinity,
      sourceIndex: -1,
      itemType: 'income',
      isActual: false,
      itemId: null
    });
  }

  // 2. Identify planned items that have been fulfilled by logged transactions
  // to avoid double-counting.
  // Note: Refund transactions (amount < 0) do NOT replace the planned item,
  // they only apply credits to it! Only expense transactions (amount > 0) fulfill the item.
  const fulfilledItemIds = new Set();
  const itemRefundMap = {}; // itemId -> total refund amount in minor units

  (transactions || []).forEach((tx) => {
    if (tx.plannedItemId) {
      const pIdStr = String(tx.plannedItemId);
      const txAmount = Math.round(Number(tx.amount) || 0);

      if (txAmount > 0) {
        // Outflow expense fulfills the planned item
        fulfilledItemIds.add(pIdStr);
      } else if (txAmount < 0) {
        // Inflow refund reduces net item cost
        const refundAmt = Math.abs(txAmount);
        itemRefundMap[pIdStr] = (itemRefundMap[pIdStr] || 0) + refundAmt;
      }
    }
  });

  // 3. Generate Expense Events from Unfulfilled Planned Items
  items.forEach((item, index) => {
    const itemIdStr = String(item.id || item._id || '');
    if (fulfilledItemIds.has(itemIdStr)) {
      // Replaced by the actual transaction
      return;
    }

    const priority = typeof item.priority === 'number' ? item.priority : 0;

    if (item.type === 'one-time') {
      let targetDay = 1;
      let targetDate = '';
      if (typeof item.day === 'number') {
        if (item.day < 0) {
          targetDay = item.day;
          targetDate = item.date || getDateFromRelativeDay(item.day, year, monthNum);
        } else {
          targetDay = clampDayToMonth(item.day, daysInMonth);
          targetDate = item.date || formatDate(year, monthNum, targetDay);
        }
      } else if (item.date) {
        targetDay = getRelativeDay(item.date, year, monthNum);
        targetDate = item.date;
      } else {
        targetDay = 1;
        targetDate = formatDate(year, monthNum, 1);
      }

      const amount = Math.round(item.amount ?? 0);
      rawEvents.push({
        day: targetDay,
        date: targetDate,
        label: item.name,
        amount: -Math.abs(amount),
        priority,
        sourceIndex: index,
        itemType: 'one-time',
        isActual: false,
        itemId: item.id || item._id || null
      });
    } else if (item.type === 'recurring') {
      const targetDay = clampDayToMonth(item.dayOfMonth ?? 1, daysInMonth);
      const amount = Math.round(item.amount ?? 0);
      rawEvents.push({
        day: targetDay,
        date: formatDate(year, monthNum, targetDay),
        label: item.name,
        amount: -Math.abs(amount),
        priority,
        sourceIndex: index,
        itemType: 'recurring',
        isFixed: Boolean(item.isFixed),
        isActual: false,
        itemId: item.id || item._id || null
      });
    } else if (item.type === 'fuel-log') {
      const stops = Array.isArray(item.fuelStops) ? item.fuelStops : [];
      stops.forEach((stop, sIdx) => {
        if (stop.fuelCost && stop.fuelCost > 0) {
          let stopDay = 1;
          let stopDate = stop.date || formatDate(year, monthNum, 1);
          if (stop.date) {
            stopDay = getRelativeDay(stop.date, year, monthNum);
            if (stopDay > 0) stopDay = clampDayToMonth(stopDay, daysInMonth);
            stopDate = stop.date;
          }
          rawEvents.push({
            day: stopDay,
            date: stopDate,
            label: `${item.name} (${stop.fuelVolume || 0}L)`,
            amount: -Math.abs(Math.round(stop.fuelCost)),
            priority,
            sourceIndex: index * 100 + sIdx,
            itemType: 'fuel-log',
            isActual: true,
            itemId: item.id || item._id || null
          });
        }
      });
    }
  });

  // 4. Generate Events from Logged Transactions (Actuals)
  let totalUnplannedSpent = 0;
  (transactions || []).forEach((tx, txIndex) => {
    let txDay = 1;
    let txDate = tx.date || formatDate(year, monthNum, 1);
    if (tx.date) {
      txDay = getRelativeDay(tx.date, year, monthNum);
      if (txDay > 0) txDay = clampDayToMonth(txDay, daysInMonth);
      txDate = tx.date;
    }

    const txAmount = Math.round(Number(tx.amount) || 0);

    // If txAmount > 0: outflow expense event (-txAmount).
    // If txAmount < 0: inflow refund event (+|txAmount|).
    const eventAmount = txAmount > 0 ? -txAmount : Math.abs(txAmount);

    if (!tx.plannedItemId) {
      totalUnplannedSpent += txAmount;
    }

    const labelPrefix = txAmount < 0 ? 'Refund: ' : '';
    const eventLabel = tx.note
      ? `${labelPrefix}${tx.note} (${tx.tag || 'Expense'})`
      : `${labelPrefix}${tx.tag || (txAmount < 0 ? 'Refund' : 'Unplanned expense')}`;

    rawEvents.push({
      day: txDay,
      date: txDate,
      label: eventLabel,
      amount: eventAmount,
      priority: 0,
      sourceIndex: 1000 + txIndex,
      itemType: tx.plannedItemId
        ? (txAmount < 0 ? 'actual-refund' : 'actual-matched')
        : 'unplanned-transaction',
      isActual: true,
      transactionId: tx.id || tx._id || null,
      plannedItemId: tx.plannedItemId || null
    });
  });

  // 5. Stable Sort:
  // Day ascending -> Priority ascending -> Source index ascending
  rawEvents.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.sourceIndex - b.sourceIndex;
  });

  // 6. Calculate Running Balances
  let currentBalance = openingBalance;
  let lowestBalance = rawEvents.length > 0 ? Infinity : openingBalance;
  let lowestDate = formatDate(year, monthNum, 1);

  const events = rawEvents.map((evt) => {
    currentBalance += evt.amount;
    const balanceAfter = currentBalance;

    if (balanceAfter < lowestBalance) {
      lowestBalance = balanceAfter;
      lowestDate = evt.date;
    }

    return {
      date: evt.date,
      day: evt.day,
      label: evt.label,
      amount: evt.amount,
      balanceAfter,
      itemType: evt.itemType,
      isFixed: evt.isFixed,
      isActual: evt.isActual,
      itemId: evt.itemId || null,
      transactionId: evt.transactionId || null,
      plannedItemId: evt.plannedItemId || null
    };
  });

  const endingBalance = currentBalance;

  if (events.length === 0) {
    lowestBalance = endingBalance;
    lowestDate = formatDate(year, monthNum, daysInMonth);
  }

  const floorBreached = lowestBalance < safetyFloor;

  // 7. Daily balance points (minNegativeDay to daysInMonth)
  const minNegativeDay = rawEvents.length > 0 && rawEvents[0].day < 0
    ? rawEvents[0].day
    : 1;

  const dailyBalances = [];
  let dayBalance = openingBalance;
  let eventIdx = 0;

  for (let d = minNegativeDay; d <= daysInMonth; d++) {
    if (d === 0) continue; // Calendar skips Day 0 between Day -1 and Day 1

    const dateStr = getDateFromRelativeDay(d, year, monthNum);
    while (eventIdx < events.length && events[eventIdx].day === d) {
      dayBalance = events[eventIdx].balanceAfter;
      eventIdx++;
    }
    dailyBalances.push({
      day: d,
      date: dateStr,
      balance: dayBalance
    });
  }

  // 8. Calculate Today's Balance
  let todayBalance = endingBalance;
  if (currentDay !== null) {
    const todayPoint = dailyBalances.find((p) => p.day === currentDay);
    todayBalance = todayPoint ? todayPoint.balance : endingBalance;
  }

  // 9. Net item summaries for items with refunds
  const itemNetMap = {};
  items.forEach((item) => {
    const idStr = String(item.id || item._id || '');
    const originalAmount = Math.round(item.amount || 0);
    const refundTotal = itemRefundMap[idStr] || 0;
    const netAmount = Math.max(0, originalAmount - refundTotal);

    itemNetMap[idStr] = {
      originalAmount,
      refundTotal,
      netAmount,
      hasRefund: refundTotal > 0
    };
  });

  // 10. Pace-Adaptive Safe Velocity and Dynamic Allowance
  const effectiveDay = currentDay || 1;
  const daysLeft = Math.max(1, daysInMonth - effectiveDay + 1);
  const daysElapsed = Math.max(1, effectiveDay);

  // Calculate upcoming committed expenses from effectiveDay onwards
  let committedUpcomingItems = 0;
  events.forEach((evt) => {
    if (evt.day >= effectiveDay && !evt.isActual && evt.amount < 0) {
      committedUpcomingItems += Math.abs(evt.amount);
    }
  });

  // Calculate active purchase goals
  let activeGoalsCost = 0;
  (goals || []).forEach((g) => {
    if (g && (g.status === 'active' || g.status === 'evaluating')) {
      activeGoalsCost += Math.round(Number(g.targetAmount) || 0);
    }
  });

  // Dynamic Free Surplus: money left after preserving safety floor, upcoming bills, and active goals
  const freeSurplus = Math.max(0, todayBalance - committedUpcomingItems - safetyFloor - activeGoalsCost);
  const safeVelocityPerDay = Math.max(0, Math.floor(freeSurplus / daysLeft));
  const burnRatePerDay = totalUnplannedSpent > 0 ? Math.round(totalUnplannedSpent / daysElapsed) : 0;

  let paceStatus = 'stable';
  if (safeVelocityPerDay <= 0) {
    paceStatus = 'critical';
  } else if (burnRatePerDay > safeVelocityPerDay * 1.25) {
    paceStatus = 'contracting';
  } else if (burnRatePerDay < safeVelocityPerDay * 0.75) {
    paceStatus = 'expanding';
  }

  // Allowance left: if legacy static unplanned allowance is explicitly passed, honor it;
  // otherwise, the dynamic Safe Velocity freeSurplus is automatically treated as the unplanned allowance.
  const dynamicAllowance = unplannedAllowance > 0
    ? unplannedAllowance
    : (freeSurplus + totalUnplannedSpent);

  const allowanceLeft = unplannedAllowance > 0
    ? (unplannedAllowance - totalUnplannedSpent)
    : freeSurplus;
  
  const safeToSpendPerDay = unplannedAllowance > 0
    ? Math.max(0, Math.round(allowanceLeft / daysLeft))
    : safeVelocityPerDay;

  return {
    events,
    dailyBalances,
    endingBalance,
    todayBalance,
    lowestBalance,
    lowestDate,
    floorBreached,
    daysInMonth,
    itemNetMap,
    unplannedAllowance: dynamicAllowance,
    totalUnplannedSpent,
    allowanceLeft,
    daysLeft,
    daysElapsed,
    safeToSpendPerDay,
    safeVelocity: {
      safeVelocityPerDay,
      freeSurplus,
      burnRatePerDay,
      committedUpcomingItems,
      activeGoalsCost,
      daysLeft,
      daysElapsed,
      paceStatus
    }
  };
}
