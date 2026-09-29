import { getDaysInMonth, formatDate } from './calendar.js';
import { simulate } from './simulator.js';

/**
 * Recommends an optimal date for a one-time purchase such that the user
 * holds onto their cash savings for as long as possible while guaranteeing
 * that running balance never drops below the safety floor on or after that date.
 * 
 * @param {object} settings - Simulation settings
 * @param {Array<object>} items - Current planned items
 * @param {object} month - { year, month }
 * @param {number} purchaseAmount - Amount in minor units
 * @param {Array<object>} [transactions=[]] - Logged transactions
 * 
 * @returns {{
 *   recommendedDate: string | null,
 *   recommendedDay: number | null,
 *   feasible: boolean,
 *   projectedLowestBalance: number,
 *   savingsBuffer: number,
 *   explanation: string
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

  let bestSafeDay = null;
  let bestSafeResult = null;

  let bestAlternativeDay = null;
  let highestLowestBalance = -Infinity;
  let bestAlternativeResult = null;

  // Iterate backwards from the end of month to day 1 (latest safe date first)
  for (let d = daysInMonth; d >= 1; d--) {
    const candidateItem = {
      id: '__hypothetical_purchase__',
      type: 'one-time',
      name: 'Planned Purchase',
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

    if (!simResult.floorBreached && bestSafeDay === null) {
      bestSafeDay = d;
      bestSafeResult = simResult;
    }

    if (simResult.lowestBalance > highestLowestBalance) {
      highestLowestBalance = simResult.lowestBalance;
      bestAlternativeDay = d;
      bestAlternativeResult = simResult;
    }
  }

  if (bestSafeDay !== null) {
    const recDate = formatDate(year, monthNum, bestSafeDay);
    const savingsBuffer = bestSafeResult.lowestBalance - safetyFloor;

    return {
      recommendedDate: recDate,
      recommendedDay: bestSafeDay,
      feasible: true,
      projectedLowestBalance: bestSafeResult.lowestBalance,
      savingsBuffer,
      explanation: `Purchasing on ${recDate} lets you keep your savings until the latest possible date while maintaining a safety buffer of ${savingsBuffer} minor units.`
    };
  }

  // Not feasible without breaching floor on any day
  const altDate = bestAlternativeDay ? formatDate(year, monthNum, bestAlternativeDay) : null;
  const deficit = safetyFloor - highestLowestBalance;

  return {
    recommendedDate: altDate,
    recommendedDay: bestAlternativeDay,
    feasible: false,
    projectedLowestBalance: highestLowestBalance,
    savingsBuffer: -deficit,
    explanation: `This purchase will breach your safety floor on all days of the month. Scheduling on ${altDate} minimizes the deficit to ${deficit} minor units.`
  };
}
