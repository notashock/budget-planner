import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { localNow } from '../utils/clock.js';
import { ValidationError } from '../utils/errors.js';
import { dayInMonth } from './recurringPlans.js';
import { SalaryTemplateService } from '../services/salaryTemplateService.js';

/** Payouts land up to this many days either side of the payday. */
export const SALARY_WINDOW_DAYS = 5;

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parts = (dateIso) => dateIso.split('-').map(Number);
export const addDays = (dateIso, n) => { const [y, m, d] = parts(dateIso); return iso(new Date(Date.UTC(y, m - 1, d + n))); };
const daysBetween = (a, b) => { const [ay, am, ad] = parts(a); const [by, bm, bd] = parts(b); return Math.abs(Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000; };

/**
 * The payday after a salary that landed on [lastIso]: the schedule's credit day in the
 * month after, clamped to month end (31 -> 30 Nov). The month is the one whose payday is
 * nearest a month after the last salary, so an early (28 Nov) or late (2 Dec) payout for a
 * 30 Nov payday still points at 30 Dec. With no credit day, one month after the last salary.
 */
export function expectedPayday(lastIso, creditDay) {
  const [y, m, d] = parts(lastIso);
  const monthLater = dayInMonth(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, d);
  if (!creditDay) return monthLater;
  let best = null;
  for (let k = 0; k <= 2; k += 1) {
    const mm = ((m - 1 + k) % 12) + 1;
    const yy = y + Math.floor((m - 1 + k) / 12);
    const c = dayInMonth(yy, mm, creditDay);
    if (c > lastIso && (!best || daysBetween(c, monthLater) < daysBetween(best, monthLater))) best = c;
  }
  return best;
}

/** Before, open (payday ± 5 days, both included) or late (after the window). */
export function windowFor(expectedDate, todayIso) {
  const opensOn = addDays(expectedDate, -SALARY_WINDOW_DAYS);
  const closesOn = addDays(expectedDate, SALARY_WINDOW_DAYS);
  const state = todayIso < opensOn ? 'before' : (todayIso > closesOn ? 'late' : 'open');
  return { expectedDate, opensOn, closesOn, state };
}

export function todayIso() {
  const now = localNow();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The user's next salary window, from their last credited salary. Null when no salary has
 * been credited yet (the first one is logged at setup and has no window).
 */
export async function getSalaryWindow(userId) {
  // A salary row in a month not yet marked credited is the one being confirmed, not the last one
  const credited = await db.query.months.findMany({
    where: and(eq(s.months.userId, userId), eq(s.months.isSalaryCredited, true))
  });
  if (!credited.length) return null;
  const lastTx = await db.query.transactions.findFirst({
    where: and(
      eq(s.transactions.userId, userId), eq(s.transactions.origin, 'salary'), eq(s.transactions.status, 'successful'),
      inArray(s.transactions.monthId, credited.map((m) => m.id))
    ),
    orderBy: [desc(s.transactions.date)]
  });
  const lastMonth = credited.filter((m) => m.salaryCreditedDate).sort((a, b) => (a.salaryCreditedDate < b.salaryCreditedDate ? 1 : -1))[0];
  const last = [lastTx?.date, lastMonth?.salaryCreditedDate].filter(Boolean).sort().pop();
  if (!last) return null;

  const template = await SalaryTemplateService.getActiveTemplate(userId);
  const settings = await db.query.settings.findFirst({ where: eq(s.settings.userId, userId) });
  const creditDay = template?.expectedCreditDay || settings?.defaultIncomeCreditDay || null;
  const today = todayIso();
  const open = await db.query.months.findFirst({
    where: and(eq(s.months.userId, userId), eq(s.months.isClosed, false)),
    orderBy: [desc(s.months.year), desc(s.months.month)]
  });
  return {
    lastCreditedDate: last,
    ...windowFor(expectedPayday(last, creditDay), today),
    today,
    amount: template?.amount || open?.incomeAmount || 0,
    accountId: template?.receivingAccountId || open?.salaryAccountId || null,
    period: open ? { year: open.year, month: open.month, isSalaryCredited: Boolean(open.isSalaryCredited) } : null
  };
}

/**
 * Throws unless [date] can be logged as the next salary: inside the window, or after it
 * when the user confirmed a late salary ([late]); never before it, never after today.
 */
export function assertInWindow(win, date, late) {
  if (!win) return;
  const when = (d) => { const [y, m, dd] = parts(d); return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`; };
  if (win.state === 'before') throw new ValidationError(`Next salary can be logged from ${when(win.opensOn)}`);
  if (date > win.today) throw new ValidationError('A salary cannot be logged before it arrives');
  if (date <= win.lastCreditedDate || date < win.opensOn) {
    throw new ValidationError(`The salary date must be between ${when(win.opensOn)} and today`);
  }
  if (win.state === 'late' && !late) {
    throw new ValidationError(`Your salary was due by ${when(win.closesOn)}. Confirm it came late to log it.`);
  }
}
