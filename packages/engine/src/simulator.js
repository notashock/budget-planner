import { getDaysInMonth, clampDayToMonth, formatDate } from './calendar.js';
import { calculateFormulaCost } from './formula.js';

/**
 * Pure simulation engine.
 * Computes deterministic running balance timeline, safety floor breaches,
 * real-world transactions, today's balance, and net item refunds.
 * 
 * @param {object} settings
 * @param {number} [settings.openingBalance=0] - Starting balance in minor units
 * @param {number} [settings.incomeAmount=0] - Monthly income in minor units
 * @param {number} [settings.incomeCreditDay=1] - Day of month income is credited (1 - 31)
 * @param {number} [settings.safetyFloor=0] - Safety floor threshold in minor units
 * @param {number} [settings.unplannedAllowance=0] - Monthly unplanned allowance in minor units
 * @param {number} [settings.currentDay] - Current day of month for today's balance (1 - 31)
 * @param {number} [settings.scale=100] - Scale factor (100 for cents, 1 for whole units)
 * 
 * @param {Array<object>} items - List of planned items for the month
 * @param {object} month - { year, month } (month 1 - 12)
 * @param {Array<object>} [transactions=[]] - Logged real-world transactions
 * 
 * @returns {object} SimulationResult
 */
export function simulate(
  settings = {},
  items = [],
  month = { year: 2026, month: 1 },
  transactions = []
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
    const clampedIncomeDay = clampDayToMonth(incomeCreditDay, daysInMonth);
    rawEvents.push({
      day: clampedIncomeDay,
      date: formatDate(year, monthNum, clampedIncomeDay),
      label: 'Income',
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
      const targetDay = clampDayToMonth(item.day ?? 1, daysInMonth);
      const amount = Math.round(item.amount ?? 0);
      rawEvents.push({
        day: targetDay,
        date: formatDate(year, monthNum, targetDay),
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
    } else if (item.type === 'formula') {
      const config = item.formulaConfig || {};
      const dates = Array.isArray(config.dates) ? config.dates : [];
      if (dates.length > 0) {
        const perOccurrenceCost = calculateFormulaCost({
          distance: config.distance ?? 0,
          efficiency: config.efficiency ?? 1,
          fuelPrice: config.fuelPrice ?? 0,
          extraCost: config.extraCost ?? 0,
          scale
        });

        dates.forEach((d) => {
          const targetDay = clampDayToMonth(d, daysInMonth);
          rawEvents.push({
            day: targetDay,
            date: formatDate(year, monthNum, targetDay),
            label: item.name,
            amount: -Math.abs(perOccurrenceCost),
            priority,
            sourceIndex: index,
            itemType: 'formula',
            isActual: false,
            itemId: item.id || item._id || null
          });
        });
      }
    } else if (item.type === 'fuel-log') {
      const stops = Array.isArray(item.fuelStops) ? item.fuelStops : [];
      stops.forEach((stop, sIdx) => {
        if (stop.fuelCost && stop.fuelCost > 0) {
          let stopDay = 1;
          if (stop.date) {
            const parsedDay = parseInt(stop.date.split('-')[2], 10);
            if (!isNaN(parsedDay)) stopDay = clampDayToMonth(parsedDay, daysInMonth);
          }
          rawEvents.push({
            day: stopDay,
            date: stop.date || formatDate(year, monthNum, stopDay),
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
    if (tx.date) {
      const parts = tx.date.split('-');
      const parsedDay = parseInt(parts[2], 10);
      if (!isNaN(parsedDay)) txDay = clampDayToMonth(parsedDay, daysInMonth);
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
      date: tx.date || formatDate(year, monthNum, txDay),
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

  // 7. Daily balance points (day 1 to daysInMonth)
  const dailyBalances = [];
  let dayBalance = openingBalance;
  let eventIdx = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDate(year, monthNum, d);
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

  // 10. Unplanned Allowance and "Safe to Spend per Day"
  const allowanceLeft = unplannedAllowance - totalUnplannedSpent;
  const effectiveDay = currentDay || 1;
  const daysLeft = Math.max(1, daysInMonth - effectiveDay + 1);
  const safeToSpendPerDay = Math.max(0, Math.round(allowanceLeft / daysLeft));

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
    unplannedAllowance,
    totalUnplannedSpent,
    allowanceLeft,
    daysLeft,
    safeToSpendPerDay
  };
}
