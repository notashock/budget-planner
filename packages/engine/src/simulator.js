import { getDaysInMonth, clampDayToMonth, formatDate } from './calendar.js';
import { calculateFormulaCost } from './formula.js';

/**
 * Pure simulation engine.
 * Computes deterministic running balance timeline and safety floor breaches.
 * 
 * Rules:
 * - Operates strictly on integer minor units (or integers) to eliminate floating point drift.
 * - Events on the same date keep stable ordering: income first, then items by priority, then source order.
 * - Zero I/O and zero reliance on system clock.
 * 
 * @param {object} settings
 * @param {number} [settings.openingBalance=0] - Starting balance in minor units
 * @param {number} [settings.incomeAmount=0] - Monthly income in minor units
 * @param {number} [settings.incomeCreditDay=1] - Day of month income is credited (1 - 31)
 * @param {number} [settings.safetyFloor=0] - Safety floor threshold in minor units
 * @param {number} [settings.scale=100] - Scale factor (100 for cents, 1 for whole units)
 * 
 * @param {Array<object>} items - List of items for the month
 * 
 * @param {object} month
 * @param {number} month.year - Calendar year (e.g. 2026)
 * @param {number} month.month - Month number 1 - 12 (1 = Jan, 12 = Dec)
 * 
 * @returns {object} SimulationResult
 */
export function simulate(settings = {}, items = [], month = { year: 2026, month: 1 }) {
  const { year, month: monthNum } = month;
  const daysInMonth = getDaysInMonth(year, monthNum);
  const scale = settings.scale ?? 100;
  const openingBalance = Math.round(settings.openingBalance ?? 0);
  const incomeAmount = Math.round(settings.incomeAmount ?? 0);
  const incomeCreditDay = settings.incomeCreditDay ?? 1;
  const safetyFloor = Math.round(settings.safetyFloor ?? 0);

  /** @type {Array<object>} */
  const rawEvents = [];

  // 1. Generate Income Event if incomeAmount is provided (> 0)
  if (incomeAmount > 0) {
    const clampedIncomeDay = clampDayToMonth(incomeCreditDay, daysInMonth);
    rawEvents.push({
      day: clampedIncomeDay,
      date: formatDate(year, monthNum, clampedIncomeDay),
      label: 'Income',
      amount: incomeAmount,
      priority: -Infinity, // Income always executes first on its credited day
      sourceIndex: -1,
      itemType: 'income',
      itemId: null
    });
  }

  // 2. Generate Expense Events from Items
  items.forEach((item, index) => {
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
        itemId: item.id || item._id || null
      });
    } else if (item.type === 'recurring') {
      // Clamps day to month end for short months
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
            itemId: item.id || item._id || null
          });
        });
      }
    }
  });

  // 3. Stable Sort:
  // Primary: Day of month ascending
  // Secondary: Priority ascending (-Infinity for income)
  // Tertiary: Original item/source index ascending
  rawEvents.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.sourceIndex - b.sourceIndex;
  });

  // 4. Calculate Running Balances and Detect Lowest Point
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
      itemId: evt.itemId
    };
  });

  const endingBalance = currentBalance;

  if (events.length === 0) {
    lowestBalance = endingBalance;
    lowestDate = formatDate(year, monthNum, daysInMonth);
  }

  const floorBreached = lowestBalance < safetyFloor;

  // 5. Generate daily step balances for smooth visualization (day 1 to daysInMonth)
  const dailyBalances = [];
  let dayBalance = openingBalance;
  let eventIdx = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDate(year, monthNum, d);
    // Apply all events on day d
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

  return {
    events,
    dailyBalances,
    endingBalance,
    lowestBalance,
    lowestDate,
    floorBreached,
    daysInMonth
  };
}
