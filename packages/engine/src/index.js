export { simulate } from './simulator.js';
export { calculateFormulaCost } from './formula.js';
export { getDaysInMonth, clampDayToMonth, formatDate } from './calendar.js';

/**
 * Currency conversion and formatting utilities.
 */

/**
 * Converts major units to minor units (e.g. 19.50 -> 1950).
 * @param {number} major
 * @param {number} [scale=100]
 * @returns {number}
 */
export function toMinorUnits(major, scale = 100) {
  return Math.round(Number(major || 0) * scale);
}

/**
 * Converts minor units to major units (e.g. 1950 -> 19.50).
 * @param {number} minor
 * @param {number} [scale=100]
 * @returns {number}
 */
export function toMajorUnits(minor, scale = 100) {
  return Number(minor || 0) / scale;
}

/**
 * Formats minor units into localized currency display string.
 * @param {number} minor
 * @param {string} [symbol='$']
 * @param {number} [scale=100]
 * @returns {string}
 */
export function formatCurrency(minor, symbol = '$', scale = 100) {
  const major = toMajorUnits(minor, scale);
  const formatted = Math.abs(major).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const sign = major < 0 ? '-' : '';
  return `${sign}${symbol}${formatted}`;
}
