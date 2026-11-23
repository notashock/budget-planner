import { and, eq, ne, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { LedgerService } from './ledgerService.js';

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
 * Attaches accountOpeningBalances to a month record. Accounts with no stored opening for the month
 * get their ledger balance at the month's start, so the plan doesn't start from an account's
 * creation-time opening and miss everything posted since. Read-only: nothing here is saved.
 */
export async function attachAccountOpeningsToMonth(month) {
  if (!month) return month;

  // A current/future month marked closed without closedAt/closingBalances is shown open; the stored
  // flag is fixed by healPrematurelyClosedMonths at startup. Historical past months stay closed.
  if (month.isClosed && (!month.closedAt || !month.closingBalances) && !isHistoricalPastMonth(month)) {
    month = { ...month, isClosed: false, closedAt: null, closingBalances: null };
  }

  const [openings, accounts] = await Promise.all([
    db.query.monthAccountOpenings.findMany({ where: eq(s.monthAccountOpenings.monthId, month.id) }),
    db.query.accounts.findMany({
      where: and(eq(s.accounts.userId, month.userId), eq(s.accounts.isArchived, false), ne(s.accounts.type, 'credit_card')),
      columns: { id: true }
    })
  ]);
  const stored = new Set(openings.map(o => o.accountId));
  const missing = accounts.map(a => a.id).filter(id => !stored.has(id));
  const startDate = month.startDate || `${month.year}-${pad(month.month)}-01`;
  const ledger = await LedgerService.balancesAtMonthStart(month.userId, missing, startDate, month.id);

  return {
    ...month,
    accountOpeningBalances: [
      ...openings.map(o => ({ accountId: o.accountId, amount: o.amount })),
      ...missing.map(accountId => ({ accountId, amount: ledger[accountId] ?? 0 }))
    ]
  };
}

// The month's salary row (cycle job, credit-salary, month edit). Never matched by category alone:
// a refund filed under "Salary" or "Income" must not be taken for the salary.
export const salaryTxCondition = () => or(
  eq(s.transactions.origin, 'salary'),
  eq(s.transactions.name, 'Monthly Salary'),
  eq(s.transactions.name, 'Expected Monthly Salary'),
  and(eq(s.transactions.note, 'Monthly Salary'), eq(s.transactions.isIncome, true))
);
