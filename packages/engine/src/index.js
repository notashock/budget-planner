export { simulate } from './simulator.js';
export { calculateFuelEfficiency } from './fuelLog.js';
export { recommendPurchaseDate } from './recommender.js';
export { getDaysInMonth, clampDayToMonth, formatDate, getRelativeDay, getDateFromRelativeDay, getSalaryWindowStatus } from './calendar.js';

/**
 * Currency conversion and formatting utilities.
 */

export function toMinorUnits(major, scale = 100) {
  return Math.round(Number(major || 0) * scale);
}

export function toMajorUnits(minor, scale = 100) {
  return Number(minor || 0) / scale;
}

export function formatCurrency(minor, symbol = '₹', scale = 100) {
  const major = toMajorUnits(minor, scale);
  const formatted = Math.abs(major).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const sign = major < 0 ? '-' : '';
  return `${sign}${symbol}${formatted}`;
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
