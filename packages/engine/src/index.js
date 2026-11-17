export { simulate, deriveTransactionState, summarizeLowPoints, isDiscretionarySpend } from './simulator.js';
export { calculateFuelEfficiency } from './fuelLog.js';
export { recommendPurchaseDate, evaluateGoalsWithReservation } from './recommender.js';
export { getDaysInMonth, clampDayToMonth, formatDate, getRelativeDay, getDateFromRelativeDay, getSalaryWindowStatus } from './calendar.js';
export { calculateIrregularMetrics, calculatePeriodBoundaries, getNextPeriodBoundaries, isPeriodExpired } from './incomeEngine.js';
export {
  buildCashAllocation,
  getNetPosition,
  splitPaidAndPlanned,
  getAllowancePace,
  getUpcomingOutflows,
  groupSpendByCategory,
  getRunwayBand,
  getHeadroom,
  getGoalMonthlyReserve,
  getMonthVerdict,
  getUnifiedVerdict
} from './planInsights.js';

/**
 * Currency conversion and formatting utilities.
 */

export function toMinorUnits(major, scale = 100) {
  return Math.round(Number(major || 0) * scale);
}

export function toMajorUnits(minor, scale = 100) {
  return Number(minor || 0) / scale;
}

/**
 * Formats minor units as currency with Indian digit grouping.
 * @param {number} minor
 * @param {string} [symbol='₹']
 * @param {number} [scale=100]
 * @param {{ decimals?: 0 | 2 | 'auto' }} [options]
 *   2 (default): always show paise, for lists and the ledger.
 *   0: whole rupees (rounded), for headline figures and totals.
 *   'auto': drop paise only when the amount is a whole number of rupees.
 */
export function formatCurrency(minor, symbol = '₹', scale = 100, options = {}) {
  const major = toMajorUnits(minor, scale);
  const { decimals = 2 } = options || {};
  const digits = decimals === 'auto'
    ? (Number.isInteger(Math.round(Math.abs(major) * 100) / 100) ? 0 : 2)
    : (decimals === 0 ? 0 : 2);
  const formatted = Math.abs(major).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const sign = major < 0 && formatted.replace(/[0,.]/g, '') !== '' ? '-' : '';
  return `${sign}${symbol}${formatted}`;
}

/** Whole-rupee headline figure (rounded). */
export function formatCurrencyWhole(minor, symbol = '₹', scale = 100) {
  return formatCurrency(minor, symbol, scale, { decimals: 0 });
}

/**
 * Formats ISO date 'YYYY-MM-DD' into short readable format (e.g. 'Fri, Sep 18' or 'Sep 18').
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {boolean} [includeWeekday=true]
 * @returns {string}
 */
export function formatDisplayDate(dateStr, includeWeekday = true) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const date = new Date(Date.UTC(year, month - 1, day));
  const options = {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  };
  if (includeWeekday) {
    options.weekday = 'short';
  }

  return date.toLocaleDateString('en-US', options);
}
