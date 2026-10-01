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

/**
 * Computes the relative day offset for a given ISO date string relative to Day 1 of the planned month.
 * If the date is in the planned month, returns the day number (1 - daysInMonth).
 * If the date is before Day 1 of the planned month, returns a negative relative offset:
 * e.g., for October 2026: '2026-09-30' -> -1, '2026-09-29' -> -2.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {number} year - Planned month year
 * @param {number} monthNum - Planned month number (1 - 12)
 * @returns {number} Relative day index (e.g. -2, -1, 1, 2, ... 31)
 */
export function getRelativeDay(dateStr, year, monthNum) {
  if (!dateStr || typeof dateStr !== 'string') return 1;
  const parts = dateStr.trim().split('-');
  if (parts.length < 3) return 1;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return 1;

  if (y === year && m === monthNum) {
    return d;
  }

  // Calculate day difference relative to Day 1 of (year, monthNum)
  const firstOfMonth = Date.UTC(year, monthNum - 1, 1);
  const targetDate = Date.UTC(y, m - 1, d);
  const diffDays = Math.round((targetDate - firstOfMonth) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return diffDays === 0 ? 1 : diffDays;
  }
  return d;
}

/**
 * Returns the ISO date string 'YYYY-MM-DD' for a relative day index.
 * e.g. for Oct 2026: relativeDay = -1 -> '2026-09-30', relativeDay = 1 -> '2026-10-01'.
 * @param {number} relativeDay
 * @param {number} year
 * @param {number} monthNum
 * @returns {string}
 */
export function getDateFromRelativeDay(relativeDay, year, monthNum) {
  if (relativeDay >= 1) {
    return formatDate(year, monthNum, relativeDay);
  }
  const d = new Date(Date.UTC(year, monthNum - 1, 1));
  d.setUTCDate(d.getUTCDate() + relativeDay);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return formatDate(y, m, day);
}
