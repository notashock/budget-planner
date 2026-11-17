import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { calculateIrregularMetrics } from '@budget/engine';
import { GeminiAssistantAdapter } from '../ai/geminiAdapter.js';
import { config } from '../config.js';
import { serialize } from '../utils/serializer.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * Read-only reports: the month-end review (with optional AI insight) and irregular-income metrics.
 * Merged into BudgetExecution, so callers use BudgetExecution.<method>().
 */
export const ReportsExecution = {
  /**
   * Generates month-end review with tag breakdowns and optional AI insights.
   */
  async getMonthEndReview(userId, year, monthNum, options = {}) {
    const month = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });

    if (!month) {
      throw new NotFoundError(`Month ${year}-${monthNum} not found`);
    }

    const accountId = options.accountId;
    const isAccountSpecific = Boolean(accountId && accountId !== 'all');

    let targetAccount = null;
    if (isAccountSpecific) {
      targetAccount = await db.query.accounts.findFirst({
        where: and(eq(s.accounts.id, accountId), eq(s.accounts.userId, userId))
      });
    }

    const txConditions = [
      eq(s.transactions.userId, userId),
      eq(s.transactions.monthId, month.id)
    ];
    if (isAccountSpecific) {
      txConditions.push(eq(s.transactions.accountId, accountId));
    }

    const [transactions, transfers] = await Promise.all([
      db.query.transactions.findMany({ where: and(...txConditions) }),
      db.query.transfers.findMany({
        where: and(eq(s.transfers.userId, userId), eq(s.transfers.monthId, month.id))
      })
    ]);

    const tagBreakdown = {
      Food: { count: 0, total: 0 },
      Travel: { count: 0, total: 0 },
      Health: { count: 0, total: 0 },
      Other: { count: 0, total: 0 }
    };

    let totalUnplannedActual = 0;
    let totalMatchedActual = 0;
    let directIncome = 0;

    transactions.forEach((tx) => {
      if (tx.isIncome) {
        directIncome += tx.amount;
        return;
      }

      const cat = tx.category || 'Other';
      if (!tagBreakdown[cat]) tagBreakdown[cat] = { count: 0, total: 0 };
      tagBreakdown[cat].count++;
      tagBreakdown[cat].total += tx.amount;

      // A planned bill settled in place (origin 'planned') is matched, not unplanned
      if (!tx.plannedItemId && tx.origin !== 'planned') {
        totalUnplannedActual += tx.amount;
      } else {
        totalMatchedActual += tx.amount;
      }
    });

    let totalTransferIn = 0;
    let totalTransferOut = 0;

    if (isAccountSpecific) {
      transfers.forEach((tr) => {
        if (tr.sourceAccountId === accountId) {
          totalTransferOut += tr.amount;
        }
        if (tr.destinationAccountId === accountId) {
          totalTransferIn += tr.amount;
        }
      });
    }

    const totalIncome = isAccountSpecific
      ? (directIncome + totalTransferIn)
      : (month.incomeAmount || 0) + directIncome;

    const totalExpenses = totalUnplannedActual + totalMatchedActual + totalTransferOut;
    const netCashflow = totalIncome - totalExpenses;

    let suggestedAllowance = 0;
    if (totalUnplannedActual > 0) {
      const withBuffer = totalUnplannedActual * 1.1;
      suggestedAllowance = Math.ceil(withBuffer / 5000) * 5000;
    } else {
      suggestedAllowance = month.unplannedAllowance || 10000;
    }

    const review = {
      isAccountSpecific,
      accountId: isAccountSpecific ? accountId : null,
      accountName: targetAccount ? targetAccount.name : (isAccountSpecific ? 'Account' : 'Unified (All Accounts)'),
      accountType: targetAccount ? targetAccount.type : null,
      totalIncome,
      directIncome,
      totalTransferIn,
      totalExpenses,
      directExpenses: totalUnplannedActual + totalMatchedActual,
      totalTransferOut,
      netCashflow,
      unplannedAllowance: month.unplannedAllowance || 0,
      totalUnplannedActual,
      totalMatchedActual,
      variance: (month.unplannedAllowance || 0) - totalUnplannedActual,
      tagBreakdown,
      suggestedNextMonthAllowance: suggestedAllowance,
      aiExplanation: null
    };

    const setting = await db.query.settings.findFirst({ where: eq(s.settings.userId, userId) });
    if (setting?.aiAssistantEnabled) {
      try {
        const adapter = new GeminiAssistantAdapter(config.geminiApiKey);
        const explanation = await adapter.explainTimeline(
          {
            floorBreached: false,
            lowestBalance: 0,
            lowestDate: '',
            endingBalance: 0,
            events: Object.entries(tagBreakdown).map(([tag, data]) => ({
              date: `${year}-${String(monthNum).padStart(2, '0')}`,
              label: tag,
              amount: -data.total
            }))
          },
          month.safetyFloor
        );
        review.aiExplanation = explanation.summary;
      } catch (e) {
        // Fail silently
      }
    }

    return serialize(review);
  },

  /**
   * Computes irregular income metrics (trailing 12M, smoothed income, runway, quarters, years).
   */
  async getIrregularReports(userId, query = {}) {
    const [accounts, transactions] = await Promise.all([
      db.query.accounts.findMany({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false))
      }),
      db.query.transactions.findMany({
        where: eq(s.transactions.userId, userId),
        orderBy: [asc(s.transactions.date)]
      })
    ]);

    const metrics = calculateIrregularMetrics({
      transactions,
      accounts,
      asOfDate: query.asOfDate
    });

    return serialize(metrics);
  }
};
