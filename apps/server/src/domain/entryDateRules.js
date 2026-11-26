import { ValidationError } from '../utils/errors.js';
import { todayIso } from './cardService.js';

function shiftDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A spend or income happens on or before today; a planned payment is for
 * today or later. One day of slack each way: the server's clock is UTC, while
 * people log in their own day (India is 5:30 ahead), and the apps hold the
 * exact local day.
 */
export function assertEntryDate({ status, date, today = todayIso() }) {
  if (!date) return;
  const day = String(date).slice(0, 10);
  if (status === 'planned') {
    if (day < shiftDays(today, -1)) throw new ValidationError("A planned payment can't be dated in the past.");
  } else if (day > shiftDays(today, 1)) {
    throw new ValidationError("A spend or income can't be dated in the future.");
  }
}
