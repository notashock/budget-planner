import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { deriveTransactionState } from '@budget/engine';
import { SimulationService } from './simulationService.js';
import { attachAccountOpeningsToMonth, isHistoricalPastMonth } from './monthLifecycle.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { serialize } from '../utils/serializer.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * PlanningPeriodService: Idempotent Query & Lifecycle Service for Budget Periods.
 * Strictly adheres to CQRS: Read queries produce zero mutations.
 */
export const PlanningPeriodService = {
  /**
   * Idempotent read query listing all periods for a user with opening snapshots attached.
   */
  async listPeriods(userId) {
    const monthsList = await db.query.months.findMany({
      where: eq(s.months.userId, userId),
      orderBy: [desc(s.months.year), desc(s.months.month)]
    });

    return Promise.all(monthsList.map(attachAccountOpeningsToMonth));
  },

  /**
   * Idempotent read query retrieving full period details, ledger entries, and single-pass simulation.
   */
  async getPeriodDetails(userId, year, monthNum) {
    const rawMonth = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });

    if (!rawMonth) {
      throw new NotFoundError(`Period ${year}-${monthNum} not found`);
    }

    const month = await attachAccountOpeningsToMonth(rawMonth);

    const [allAccounts, rawTransactions, transfers, userSettings] = await Promise.all([
      db.query.accounts.findMany({
        where: eq(s.accounts.userId, userId),
        orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
      }),
      db.query.transactions.findMany({
        where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)),
        orderBy: [asc(s.transactions.date), asc(s.transactions.createdAt)]
      }),
      db.query.transfers.findMany({
        where: and(eq(s.transfers.userId, userId), eq(s.transfers.monthId, month.id)),
        orderBy: [asc(s.transfers.date), asc(s.transfers.createdAt)]
      }),
      db.query.settings.findFirst({
        where: eq(s.settings.userId, userId)
      })
    ]);

    const bankAccounts = allAccounts.filter((a) => a.type === 'bank' && !a.isArchived);
    const wallets = allAccounts.filter((a) => a.type === 'wallet' && !a.isArchived);

    const now = new Date();
    const dueWindowDays = userSettings?.dueWindowDays || 3;
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const transactions = rawTransactions.map((tx) => ({
      ...tx,
      derivedStatus: deriveTransactionState(tx, todayStr, dueWindowDays)
    }));

    const currentYearMonth = now.getFullYear() * 12 + now.getMonth() + 1;
    const viewingYearMonth = year * 12 + monthNum;

    let currentDay = null;
    if (viewingYearMonth === currentYearMonth) {
      currentDay = now.getDate();
    } else if (viewingYearMonth < currentYearMonth) {
      currentDay = null;
    } else {
      currentDay = 0;
    }

    // Execute single-pass multi-account simulation
    const { simulation, accountSimulations } = SimulationService.computeSimulation({
      month,
      bankAccounts,
      wallets,
      accountOpenings: month.accountOpeningBalances || [],
      transactions,
      transfers,
      currentDay
    });

    return {
      month: serialize(month),
      items: [], // Deprecated
      transactions: serialize(transactions),
      transfers: serialize(transfers),
      bankAccounts: serialize(bankAccounts),
      wallets: serialize(wallets),
      simulation,
      accountSimulations
    };
  }
};
