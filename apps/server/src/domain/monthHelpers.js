import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function getTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isHistoricalPastMonth(month, asOfDate = null) {
  if (!month) return false;
  const now = asOfDate ? new Date(asOfDate) : new Date();
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  if (month.endDate) {
    return month.endDate < todayIso;
  }

  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  if (month.year < currentYear) return true;
  if (month.year === currentYear && month.month < currentMonthNum) return true;
  return false;
}

/**
 * Attaches accountOpeningBalances array to a month record
 */
export async function attachAccountOpeningsToMonth(month) {
  if (!month) return month;

  // If an active current/future month was prematurely marked isClosed (without closedAt or closingBalances), auto-heal and unclose it.
  // Historical past months must remain closed.
  if (month.isClosed && (!month.closedAt || !month.closingBalances) && !isHistoricalPastMonth(month)) {
    try {
      await db.update(s.months)
        .set({ isClosed: false, closedAt: null, closingBalances: null, updatedAt: new Date() })
        .where(eq(s.months.id, month.id));
      month.isClosed = false;
      month.closedAt = null;
      month.closingBalances = null;
    } catch (_) {
      month.isClosed = false;
    }
  }

  const openings = await db.query.monthAccountOpenings.findMany({
    where: eq(s.monthAccountOpenings.monthId, month.id)
  });
  return {
    ...month,
    accountOpeningBalances: openings.map(o => ({
      accountId: o.accountId,
      amount: o.amount
    }))
  };
}
