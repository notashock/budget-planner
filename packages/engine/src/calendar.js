/**
 * Calendar utilities for budget calculations.
 * Pure functions with zero system clock or timezone dependencies.
 */

/**
 * Returns the number of days in a given calendar month (1-indexed month: 1 = Jan, 12 = Dec).
 * @param {number} year - Full year (e.g. 2026)
 * @param {number} month - Month (1 - 12)
 * @returns {number} Days in month (28, 29, 30, or 31)
 */
export function getDaysInMonth(year, month) {
  // Using Date.UTC to prevent any local timezone offsets
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Clamps a day of month to the valid range for that specific month.
 * Handles short months deterministically (e.g. day 31 in Feb becomes 28/29).
 * @param {number} day - Target day of month (1 - 31)
 * @param {number} daysInMonth - Number of days in the month
 * @returns {number} Clamped day (1 - daysInMonth)
 */
export function clampDayToMonth(day, daysInMonth) {
  if (day < 1) return 1;
  return Math.min(Math.floor(day), daysInMonth);
}

/**
 * Formats year, month, and day into ISO date string 'YYYY-MM-DD'.
 * @param {number} year
 * @param {number} month (1 - 12)
 * @param {number} day (1 - 31)
 * @returns {string}
 */
export function formatDate(year, month, day) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
