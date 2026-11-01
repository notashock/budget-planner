import { eq, and, or, asc, inArray, desc, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import {
  recommendPurchaseDate,
  evaluateGoalsWithReservation,
  deriveTransactionState,
  calculateIrregularMetrics
} from '@budget/engine';
import { GeminiAssistantAdapter } from '../ai/geminiAdapter.js';
import { config } from '../config.js';
import { backfillUnassignedTransactions } from '../services/accountMigration.js';
import { validateUserAccount } from '../services/accountValidation.js';
import { SalaryTemplateService } from '../services/salaryTemplateService.js';
import { serialize } from '../utils/serializer.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { isHistoricalPastMonth } from './monthLifecycle.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * BudgetExecution Domain Service
 * Consolidates transaction recording, refund verification, and purchase goal evaluation.
 */
export const BudgetExecution = {
  /**
   * Lists transactions for a specific month with status/origin filtering and derived status attribution.
   */
  async listTransactions(userId, year, monthNum, query = {}) {
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

    try {
      await backfillUnassignedTransactions(userId);
    } catch {
      // non-fatal
    }

    const userSettings = await db.query.settings.findFirst({
      where: eq(s.settings.userId, userId)
    });
    const dueWindowDays = userSettings?.dueWindowDays ?? 3;

    const now = new Date();
    const defaultToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const todayStr = query.today && typeof query.today === 'string' ? query.today : defaultToday;

    const conditions = [
      eq(s.transactions.userId, userId),
      eq(s.transactions.monthId, month.id)
    ];

    if (query.origin && query.origin !== 'all') {
      conditions.push(eq(s.transactions.origin, query.origin));
    }

    if (query.accountId && query.accountId !== 'all') {
      conditions.push(
        or(
          eq(s.transactions.accountId, query.accountId),
          eq(s.transactions.destinationAccountId, query.accountId)
        )
      );
    }

    if (query.status && query.status !== 'all' && query.status !== 'due' && query.status !== 'overdue') {
      conditions.push(eq(s.transactions.status, query.status));
    }

    const transactions = await db.query.transactions.findMany({
      where: and(...conditions),
      with: {
        account: true,
        destinationAccount: true
      },
      orderBy: [asc(s.transactions.date), asc(s.transactions.createdAt)]
    });

    const withDerived = transactions.map((tx) => {
      const derivedStatus = deriveTransactionState(tx, todayStr, dueWindowDays);
      return {
        ...tx,
        derivedStatus
      };
    });

    if (query.status === 'due') {
      return serialize(withDerived.filter((t) => t.derivedStatus === 'due'));
    }
    if (query.status === 'overdue') {
      return serialize(withDerived.filter((t) => t.derivedStatus === 'overdue'));
    }

    return serialize(withDerived);
  },

  /**
   * Records a new transaction (spot, planned, or goal), enforces strict refund exclusivity (ADR 0062),
   * assigns recommended date if planned date is omitted, and triggers automatic goal deferral if cashflow is breached.
   */
  async recordTransaction(userId, year, monthNum, payload) {
    const { amount, tag, note, date, plannedDate, origin, status, plannedItemId, refundTargetTransactionId } = payload;

    if (amount === undefined || amount === null || typeof Number(amount) !== 'number') {
      throw new ValidationError('Valid amount is required');
    }

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

    if (month.isClosed) {
      throw new ValidationError('Cannot create transactions in a closed review period. Review periods are strictly read-only.');
    }

    const numAmount = Math.round(Number(amount));
    const isCreditOrRefund = numAmount < 0 || Boolean(payload.isCredit) || Boolean(payload.isRefund);

    // Resolve origin and status
    let resolvedOrigin = origin || (status === 'planned' ? 'planned' : 'spot');
    let resolvedStatus = status;
    if (resolvedOrigin === 'spot') {
      resolvedStatus = 'successful';
    } else if (!resolvedStatus) {
      resolvedStatus = 'planned';
    }

    if (resolvedOrigin === 'transfer') {
      resolvedStatus = 'successful';
      const sourceAccId = payload.accountId || payload.sourceAccountId || payload.sourceBankAccountId || payload.sourceWalletId;
      const destAccId = payload.destinationAccountId || payload.destinationBankAccountId || payload.destinationWalletId;

      if (!sourceAccId || !destAccId) {
        throw new ValidationError('Source and destination accounts are required for transfers');
      }
      if (String(sourceAccId) === String(destAccId)) {
        throw new ValidationError('Source and destination accounts must be different');
      }

      const [validSource, validDest] = await Promise.all([
        validateUserAccount({ userId, accountId: sourceAccId }),
        validateUserAccount({ userId, accountId: destAccId })
      ]);
      if (!validSource || !validDest) {
        throw new ValidationError('Source or destination account is invalid or not owned by user');
      }

      let txDate = date || plannedDate;
      if (!txDate) {
        const now = new Date();
        txDate = `${year}-${pad(monthNum)}-${pad(Math.min(28, now.getDate()))}`;
      }

      const transferAmount = Math.abs(numAmount);
      const txNote = (note !== undefined && note !== null) ? String(note).trim() : '';
      const txName = payload.name ? String(payload.name).trim() : 'Inter-Account Transfer';

      let linkedTransferId = payload.transferId || null;
      if (!linkedTransferId) {
        const [tr] = await db.insert(s.transfers).values({
          userId,
          monthId: month.id,
          date: txDate,
          amount: transferAmount,
          sourceAccountId: sourceAccId,
          destinationAccountId: destAccId,
          note: txNote
        }).returning();
        linkedTransferId = tr.id;
      }

      const [transaction] = await db.insert(s.transactions).values({
        userId,
        monthId: month.id,
        name: txName,
        status: 'successful',
        origin: 'transfer',
        date: txDate,
        amount: transferAmount,
        category: 'Transfer',
        note: txNote,
        accountId: sourceAccId,
        destinationAccountId: destAccId,
        transferId: linkedTransferId,
        isIncome: false
      }).returning();

      return serialize(transaction);
    }

    let txDate = date || plannedDate;
    if (!txDate) {
      if (resolvedStatus === 'planned') {
        // Automatic algorithm recommendation for undated planned transaction
        try {
          const rec = await this.recommendGoalDate(userId, year, monthNum, Math.abs(numAmount));
          if (rec?.recommendedDate) {
            txDate = rec.recommendedDate;
          }
        } catch {
          // fallback
        }
      }
      if (!txDate) {
        const now = new Date();
        txDate = `${year}-${pad(monthNum)}-${pad(Math.min(28, now.getDate()))}`;
      }
    }

    let finalPlannedDate = null;
    let finalPlannedAmount = null;
    if (resolvedStatus === 'planned' || resolvedOrigin === 'planned' || resolvedOrigin === 'goal') {
      finalPlannedDate = payload.plannedDate || txDate;
      finalPlannedAmount = payload.plannedAmount !== undefined ? Math.round(Number(payload.plannedAmount)) : Math.abs(numAmount);
    }

    // Refunds can only be mapped to an existing spent transaction
    if (plannedItemId && isCreditOrRefund) {
      throw new ValidationError('Refunds can only be mapped to existing spent transactions');
    }

    let verifiedRefundTargetId = null;
    if (refundTargetTransactionId && isCreditOrRefund) {
      const targetTx = await db.query.transactions.findFirst({
        where: and(
          eq(s.transactions.id, refundTargetTransactionId),
          eq(s.transactions.userId, userId)
        )
      });
      if (targetTx) {
        verifiedRefundTargetId = targetTx.id;
      }
    }

    const incomingCategory = (payload.category || tag || 'Other').trim();
    const validCategory = incomingCategory.length > 0 ? incomingCategory : 'Other';
    const txName = payload.name ? String(payload.name).trim() : (payload.description ? String(payload.description).trim() : (note ? String(note).trim() : validCategory));
    const txNote = (note !== undefined && note !== null) ? String(note).trim() : '';

    if (payload.accountType === 'unassigned') {
      throw new ValidationError('Account linking is required');
    }

    let resolvedAccountId = payload.accountId || payload.bankAccountId || payload.walletId;

    if (!resolvedAccountId) {
      let primaryAccount = await db.query.accounts.findFirst({
        where: and(
          eq(s.accounts.userId, userId),
          eq(s.accounts.isPrimary, true),
          eq(s.accounts.isArchived, false)
        )
      });

      if (!primaryAccount) {
        primaryAccount = await db.query.accounts.findFirst({
          where: and(
            eq(s.accounts.userId, userId),
            eq(s.accounts.isArchived, false)
          ),
          orderBy: [asc(s.accounts.createdAt)]
        });
      }

      if (!primaryAccount) {
        const [createdAccount] = await db.insert(s.accounts).values({
          userId,
          name: 'Primary Account',
          type: 'bank',
          subtype: 'checking',
          institution: 'Default Bank',
          isPrimary: true,
          openingBalance: month.openingBalance || 0
        }).returning();
        primaryAccount = createdAccount;
      }

      resolvedAccountId = primaryAccount.id;
    }

    const validAccount = await validateUserAccount({ userId, accountId: resolvedAccountId });
    if (!validAccount) {
      throw new ValidationError('Linked Account is invalid or not owned by user');
    }

    const [transaction] = await db.insert(s.transactions).values({
      userId,
      monthId: month.id,
      name: txName,
      status: resolvedStatus,
      origin: resolvedOrigin,
      date: txDate,
      amount: numAmount,
      plannedAmount: finalPlannedAmount,
      plannedDate: finalPlannedDate,
      category: validCategory,
      note: txNote,
      goalId: payload.goalId || null,
      recurrence: payload.recurrence || null,
      plannedItemId: null,
      refundTargetTransactionId: verifiedRefundTargetId,
      accountId: resolvedAccountId,
      isIncome: Boolean(payload.isIncome),
      transferId: payload.transferId || null
    }).returning();

    // If goal-origin, mark goal scheduled
    if (payload.goalId && resolvedOrigin === 'goal') {
      await db.update(s.goals).set({
        status: 'scheduled',
        updatedAt: new Date()
      }).where(eq(s.goals.id, payload.goalId));
    }

    // Auto goal deferral if spending committed
    if (resolvedStatus === 'successful' && transaction.amount > 0 && !transaction.isIncome) {
      await this._reEvaluateAndDeferGoals(userId, month);
    }

    return serialize(transaction);
  },

  /**
   * Transitions a planned transaction to successful (Mark as Paid).
   * Confirms actual amount and actual date while preserving planned values.
   * If linked to a goal, automatically marks the goal achieved.
   */
  async markTransactionPaid(userId, txId, payload = {}) {
    const tx = await db.query.transactions.findFirst({
      where: and(eq(s.transactions.id, txId), eq(s.transactions.userId, userId))
    });

    if (!tx) {
      throw new NotFoundError('Transaction not found');
    }

    if (tx.monthId) {
      const month = await db.query.months.findFirst({ where: eq(s.months.id, tx.monthId) });
      if (month && month.isClosed) {
        throw new ValidationError('Cannot modify transactions in a closed review period. Review periods are strictly read-only.');
      }
    }

    if (tx.status !== 'planned') {
      throw new ValidationError(`Only planned transactions can be marked as paid. Current status: ${tx.status}`);
    }

    const rawAmt = payload.amount !== undefined ? payload.amount : payload.actualAmount;
    const actualAmount = rawAmt !== undefined ? Math.round(Number(rawAmt)) : (tx.plannedAmount || tx.amount);
    const rawDate = payload.date || payload.actualDate;
    const actualDate = rawDate ? String(rawDate).trim() : (tx.plannedDate || tx.date);
    const accountId = payload.accountId || tx.accountId;

    if (accountId) {
      const valid = await validateUserAccount({ userId, accountId });
      if (!valid) throw new ValidationError('Specified account is invalid');
    }

    const [updatedTx] = await db.update(s.transactions).set({
      status: 'successful',
      amount: actualAmount,
      date: actualDate,
      accountId,
      updatedAt: new Date()
    }).where(eq(s.transactions.id, tx.id)).returning();

    if (tx.goalId) {
      await db.update(s.goals).set({
        status: 'achieved',
        updatedAt: new Date()
      }).where(eq(s.goals.id, tx.goalId));
    }

    // When a salary transaction is settled, advance the cycle and snapshot closed period
    if (updatedTx.origin === 'salary' && updatedTx.isIncome) {
      await SalaryTemplateService.onSalaryCredited(userId, updatedTx, actualDate);
    }

    const month = await db.query.months.findFirst({ where: eq(s.months.id, tx.monthId) });
    if (month && updatedTx.amount > 0 && !updatedTx.isIncome) {
      await this._reEvaluateAndDeferGoals(userId, month);
    }

    return serialize(updatedTx);
  },

  /**
   * Cancels a planned transaction. Excluded from Planned view.
   * If linked to a goal, prompts destination status ('return_to_logged' vs 'dropped').
   */
  async cancelTransaction(userId, txId, payload = {}) {
    const tx = await db.query.transactions.findFirst({
      where: and(eq(s.transactions.id, txId), eq(s.transactions.userId, userId))
    });

    if (!tx) {
      throw new NotFoundError('Transaction not found');
    }

    if (tx.monthId) {
      const month = await db.query.months.findFirst({ where: eq(s.months.id, tx.monthId) });
      if (month && month.isClosed) {
        throw new ValidationError('Cannot cancel transactions in a closed review period. Review periods are strictly read-only.');
      }
    }

    if (tx.status !== 'planned') {
      throw new ValidationError(`Only planned transactions can be cancelled. Current status: ${tx.status}`);
    }

    const [updatedTx] = await db.update(s.transactions).set({
      status: 'cancelled',
      updatedAt: new Date()
    }).where(eq(s.transactions.id, tx.id)).returning();

    if (tx.goalId) {
      const destinationGoalStatus = payload.goalAction === 'dropped' ? 'dropped' : 'logged';
      await db.update(s.goals).set({
        status: destinationGoalStatus,
        updatedAt: new Date()
      }).where(eq(s.goals.id, tx.goalId));
    }

    return serialize(updatedTx);
  },

  /**
   * Updates an existing transaction.
   */
  async updateTransaction(userId, txId, payload = {}) {
    const tx = await db.query.transactions.findFirst({
      where: and(eq(s.transactions.id, txId), eq(s.transactions.userId, userId))
    });

    if (!tx) {
      throw new NotFoundError('Transaction not found');
    }

    if (tx.monthId) {
      const month = await db.query.months.findFirst({ where: eq(s.months.id, tx.monthId) });
      if (month && month.isClosed) {
        throw new ValidationError('Cannot modify transactions in a closed review period. Review periods are strictly read-only.');
      }
    }

    const updates = { updatedAt: new Date() };
    if (payload.name !== undefined) updates.name = String(payload.name).trim();
    if (payload.amount !== undefined) updates.amount = Math.round(Number(payload.amount));
    if (payload.date) updates.date = String(payload.date).trim();
    if (payload.plannedAmount !== undefined) updates.plannedAmount = Math.round(Number(payload.plannedAmount));
    if (payload.plannedDate !== undefined) updates.plannedDate = payload.plannedDate;
    if (payload.category) updates.category = String(payload.category).trim();
    if (payload.note !== undefined) updates.note = String(payload.note).trim();
    if (payload.accountId) updates.accountId = payload.accountId;
    if (payload.recurrence !== undefined) updates.recurrence = payload.recurrence;

    const [updated] = await db.update(s.transactions)
      .set(updates)
      .where(eq(s.transactions.id, txId))
      .returning();

    return serialize(updated);
  },

  /**
   * Internal routine for Automatic Goal Deferral Migration (ADR 0061).
   */
  async _reEvaluateAndDeferGoals(userId, month) {
    try {
      const activeGoals = await db.query.goals.findMany({
        where: and(
          eq(s.goals.userId, userId),
          eq(s.goals.monthId, month.id),
          inArray(s.goals.status, ['active', 'evaluating'])
        )
      });

      if (activeGoals.length === 0) return;

      const [items, allTransactions] = await Promise.all([
        db.query.items.findMany({ where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id)) }),
        db.query.transactions.findMany({ where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)) })
      ]);

      const now = new Date();
      const isCurrentMonth = Number(month.year) === now.getFullYear() && Number(month.month) === (now.getMonth() + 1);
      const currentDay = isCurrentMonth ? now.getDate() : null;

      for (const goal of activeGoals) {
        const rec = recommendPurchaseDate(
          {
            openingBalance: month.openingBalance,
            incomeAmount: month.incomeAmount,
            incomeCreditDate: month.incomeCreditDate,
            incomeCreditDay: month.incomeCreditDate ? parseInt(month.incomeCreditDate.split('-')[2], 10) : 1,
            safetyFloor: month.safetyFloor,
            unplannedAllowance: month.unplannedAllowance || 0,
            currentDay,
            scale: 100
          },
          items,
          { year: month.year, month: month.month },
          goal.targetAmount,
          allTransactions
        );

        if (!rec.feasible) {
          // Keep the goal in the current month marked as deferred; rolled over when the next cycle is actually created
          await db.update(s.goals)
            .set({
              status: 'deferred',
              deferredReason: 'Auto-deferred: recent purchase compromised safety buffer',
              updatedAt: new Date()
            })
            .where(eq(s.goals.id, goal.id));
        }
      }
    } catch (goalEvalErr) {
      console.error('Goal auto-deferral evaluation error:', goalEvalErr);
    }
  },

  /**
   * Deletes a transaction and re-evaluates goals.
   */
  async deleteTransaction(userId, txId) {
    const existing = await db.query.transactions.findFirst({
      where: and(eq(s.transactions.id, txId), eq(s.transactions.userId, userId))
    });

    if (!existing) {
      throw new NotFoundError('Transaction not found');
    }

    if (existing.monthId) {
      const month = await db.query.months.findFirst({ where: eq(s.months.id, existing.monthId) });
      if (month && month.isClosed) {
        throw new ValidationError('Cannot delete transactions in a closed review period. Review periods are strictly read-only.');
      }
    }

    if (existing.transferId) {
      await db.delete(s.transfers).where(eq(s.transfers.id, existing.transferId));
    } else if (existing.origin === 'transfer') {
      await db.delete(s.transfers).where(
        and(
          eq(s.transfers.userId, userId),
          eq(s.transfers.sourceAccountId, existing.accountId),
          eq(s.transfers.destinationAccountId, existing.destinationAccountId),
          eq(s.transfers.date, existing.date)
        )
      );
    }

    await db.delete(s.transactions).where(eq(s.transactions.id, txId));
    return { message: 'Transaction deleted successfully' };
  },

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

      if (!tx.plannedItemId) {
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
   * Evaluates active purchase goals with strict priority reservation (ADR 0063).
   */
  async listGoals(userId, year, monthNum) {
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

    const [goals, items, transactions, transfers, accountsList] = await Promise.all([
      db.query.goals.findMany({
        where: and(eq(s.goals.userId, userId), eq(s.goals.monthId, month.id)),
        orderBy: [asc(s.goals.priority), asc(s.goals.createdAt)]
      }),
      db.query.items.findMany({
        where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id))
      }),
      db.query.transactions.findMany({
        where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id))
      }),
      db.query.transfers.findMany({
        where: and(eq(s.transfers.userId, userId), eq(s.transfers.monthId, month.id))
      }),
      db.query.accounts.findMany({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false))
      })
    ]);

    const now = new Date();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : 0;

    const evaluatedGoals = evaluateGoalsWithReservation({
      settings: {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDate ? parseInt(month.incomeCreditDate.split('-')[2], 10) : 1,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100
      },
      items: serialize(items),
      month: { year, month: monthNum },
      goals: serialize(goals),
      transactions: serialize(transactions),
      transfers: serialize(transfers),
      accounts: serialize(accountsList)
    });

    return serialize(evaluatedGoals);
  },

  /**
   * Creates a new purchase goal.
   */
  async createGoal(userId, year, monthNum, payload) {
    const { name, targetAmount, priority = 0 } = payload;

    if (!name || !targetAmount || typeof Number(targetAmount) !== 'number') {
      throw new ValidationError('Valid goal name and target amount required');
    }

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

    let fundingAccountId = payload.fundingAccountId || payload.fundingBankAccountId || payload.fundingWalletId;

    if (!fundingAccountId) {
      const primaryAccount = await db.query.accounts.findFirst({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isPrimary, true), eq(s.accounts.isArchived, false))
      }) || await db.query.accounts.findFirst({
        where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false))
      });
      if (primaryAccount) {
        fundingAccountId = primaryAccount.id;
      }
    }

    const parsedPriority = [0, 1, 2].includes(Number(priority)) ? Number(priority) : 0;

    const [goal] = await db.insert(s.goals).values({
      userId,
      monthId: month.id,
      name: name.trim(),
      targetAmount: Math.round(Number(targetAmount)),
      targetDate: payload.targetDate ? String(payload.targetDate).trim() : null,
      priority: parsedPriority,
      status: payload.status || 'logged',
      fundingAccountId: fundingAccountId || null
    }).returning();

    const evaluatedGoals = await this.listGoals(userId, year, monthNum);
    const targetGoal = evaluatedGoals.find((g) => String(g._id || g.id) === String(goal.id)) || {
      ...serialize(goal),
      recommendation: null
    };

    return targetGoal;
  },

  /**
   * Schedules a goal by generating a linked planned transaction (origin = 'goal').
   */
  async scheduleGoal(userId, goalId, payload = {}) {
    const goal = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!goal) {
      throw new NotFoundError('Goal not found');
    }

    const month = await db.query.months.findFirst({
      where: eq(s.months.id, goal.monthId)
    });
    if (!month) {
      throw new NotFoundError('Associated month not found');
    }

    let scheduledDate = payload.date || payload.plannedDate || goal.targetDate;
    if (!scheduledDate) {
      try {
        const rec = await this.recommendGoalDate(userId, month.year, month.month, goal.targetAmount, goal.fundingAccountId);
        if (rec?.recommendedDate) {
          scheduledDate = rec.recommendedDate;
        }
      } catch {
        // fallback
      }
      if (!scheduledDate) {
        const now = new Date();
        scheduledDate = `${month.year}-${pad(month.month)}-${pad(Math.min(28, now.getDate()))}`;
      }
    }

    let resolvedAccountId = payload.accountId || goal.fundingAccountId;
    if (resolvedAccountId) {
      const valid = await validateUserAccount({ userId, accountId: resolvedAccountId });
      if (!valid) resolvedAccountId = null;
    }

    const [transaction] = await db.insert(s.transactions).values({
      userId,
      monthId: month.id,
      name: goal.name,
      status: 'planned',
      origin: 'goal',
      amount: goal.targetAmount,
      plannedAmount: goal.targetAmount,
      date: scheduledDate,
      plannedDate: scheduledDate,
      goalId: goal.id,
      category: payload.category || 'Goal',
      note: payload.note || `Scheduled Goal: ${goal.name}`,
      accountId: resolvedAccountId,
      isIncome: false
    }).returning();

    const [updatedGoal] = await db.update(s.goals)
      .set({ status: 'scheduled', updatedAt: new Date() })
      .where(eq(s.goals.id, goal.id))
      .returning();

    return {
      transaction: serialize(transaction),
      item: serialize(transaction), // legacy alias
      goal: serialize(updatedGoal)
    };
  },

  /**
   * Alias for backward compatibility
   */
  async convertGoalToItem(userId, goalId, payload = {}) {
    return this.scheduleGoal(userId, goalId, payload);
  },

  /**
   * Updates an existing purchase goal.
   */
  async updateGoal(userId, goalId, payload) {
    const existing = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!existing) {
      throw new NotFoundError('Goal not found');
    }

    const updates = { updatedAt: new Date() };
    if (payload.name) updates.name = String(payload.name).trim();
    if (payload.targetAmount !== undefined) updates.targetAmount = Math.round(Number(payload.targetAmount));
    if (payload.priority !== undefined) updates.priority = Number(payload.priority);
    if (payload.status) updates.status = payload.status;
    if (payload.fundingAccountId !== undefined) updates.fundingAccountId = payload.fundingAccountId || null;

    const [updated] = await db.update(s.goals)
      .set(updates)
      .where(eq(s.goals.id, goalId))
      .returning();

    return serialize(updated);
  },

  /**
   * Defers a goal to next month manually.
   */
  async deferGoal(userId, goalId) {
    const goal = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!goal) {
      throw new NotFoundError('Goal not found');
    }

    const currentMonth = await db.query.months.findFirst({
      where: eq(s.months.id, goal.monthId)
    });
    if (!currentMonth) {
      throw new NotFoundError('Current month not found');
    }

    let nextYear = currentMonth.year;
    let nextMonthNum = currentMonth.month + 1;
    if (nextMonthNum > 12) {
      nextMonthNum = 1;
      nextYear += 1;
    }

    let nextMonth = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, nextYear),
        eq(s.months.month, nextMonthNum)
      )
    });

    if (!nextMonth) {
      const [created] = await db.insert(s.months).values({
        userId,
        year: nextYear,
        month: nextMonthNum,
        openingBalance: 0,
        incomeAmount: currentMonth.incomeAmount || 0,
        incomeCreditDate: currentMonth.incomeCreditDate || null,
        salaryAccountId: currentMonth.salaryAccountId || null,
        isSalaryCredited: false,
        salaryCreditedDate: null,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        currencySymbol: currentMonth.currencySymbol
      }).returning();
      nextMonth = created;
    }

    const [updated] = await db.update(s.goals)
      .set({
        monthId: nextMonth.id,
        status: 'deferred',
        updatedAt: new Date()
      })
      .where(eq(s.goals.id, goal.id))
      .returning();

    return { message: 'Goal deferred to next month', goal: serialize(updated), nextMonth: serialize(nextMonth) };
  },

  /**
   * Reactivates a deferred goal.
   */
  async reactivateGoal(userId, goalId) {
    const goal = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!goal) {
      throw new NotFoundError('Goal not found');
    }

    const [updated] = await db.update(s.goals)
      .set({
        status: 'active',
        deferredReason: null,
        updatedAt: new Date()
      })
      .where(eq(s.goals.id, goalId))
      .returning();

    return { message: 'Goal reactivated successfully', goal: serialize(updated) };
  },

  /**
   * Deletes a purchase goal.
   */
  async deleteGoal(userId, goalId) {
    const existing = await db.query.goals.findFirst({
      where: and(eq(s.goals.id, goalId), eq(s.goals.userId, userId))
    });

    if (!existing) {
      throw new NotFoundError('Goal not found');
    }

    await db.delete(s.goals).where(eq(s.goals.id, goalId));
    return { message: 'Goal deleted successfully' };
  },

  /**
   * Recommends a purchase date for a candidate goal amount.
   */
  async recommendGoalDate(userId, year, monthNum, amount, fundingSource = null) {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new ValidationError('Valid positive amount is required');
    }

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

    const [items, transactions] = await Promise.all([
      db.query.items.findMany({ where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id)) }),
      db.query.transactions.findMany({ where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)) })
    ]);

    const now = new Date();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : null;

    const rec = recommendPurchaseDate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDate ? parseInt(month.incomeCreditDate.split('-')[2], 10) : 1,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100
      },
      items,
      { year, month: monthNum },
      numAmount,
      transactions
    );

    return rec;
  },

  /**
   * Lists all transactions across dates/periods (for irregular earners or global ledger view).
   */
  async listAllTransactions(userId, query = {}) {
    try {
      await backfillUnassignedTransactions(userId);
    } catch {
      // non-fatal
    }

    const userSettings = await db.query.settings.findFirst({
      where: eq(s.settings.userId, userId)
    });
    const dueWindowDays = userSettings?.dueWindowDays ?? 3;

    const now = new Date();
    const defaultToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const todayStr = query.today && typeof query.today === 'string' ? query.today : defaultToday;

    const conditions = [eq(s.transactions.userId, userId)];

    if (query.origin && query.origin !== 'all') {
      conditions.push(eq(s.transactions.origin, query.origin));
    }

    if (query.accountId && query.accountId !== 'all') {
      conditions.push(
        or(
          eq(s.transactions.accountId, query.accountId),
          eq(s.transactions.destinationAccountId, query.accountId)
        )
      );
    }

    if (query.startDate) {
      conditions.push(gte(s.transactions.date, query.startDate));
    }

    if (query.endDate) {
      conditions.push(lte(s.transactions.date, query.endDate));
    }

    if (query.status && query.status !== 'all' && query.status !== 'due' && query.status !== 'overdue') {
      conditions.push(eq(s.transactions.status, query.status));
    }

    const transactions = await db.query.transactions.findMany({
      where: and(...conditions),
      with: {
        account: true,
        destinationAccount: true
      },
      orderBy: [desc(s.transactions.date), desc(s.transactions.createdAt)]
    });

    const withDerived = transactions.map((tx) => {
      const derivedStatus = deriveTransactionState(tx, todayStr, dueWindowDays);
      return {
        ...tx,
        derivedStatus
      };
    });

    if (query.status === 'due') {
      return serialize(withDerived.filter((t) => t.derivedStatus === 'due'));
    }
    if (query.status === 'overdue') {
      return serialize(withDerived.filter((t) => t.derivedStatus === 'overdue'));
    }

    return serialize(withDerived);
  },

  /**
   * Records a global/spot transaction without requiring a monthId.
   * If a budget month covers the transaction date, links it optionally.
   */
  async recordGlobalTransaction(userId, payload) {
    const { amount, name, note, date, plannedDate, origin, status, accountId, category, isIncome } = payload;

    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      throw new ValidationError('Valid amount is required');
    }

    const numAmount = Math.round(Number(amount));
    let resolvedOrigin = origin || (status === 'planned' ? 'planned' : 'spot');
    let resolvedStatus = status;
    if (resolvedOrigin === 'spot') {
      resolvedStatus = 'successful';
    } else if (!resolvedStatus) {
      resolvedStatus = 'planned';
    }

    const now = new Date();
    const defaultToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const txDate = date || plannedDate || defaultToday;

    // Attempt to link covering month if one exists for txDate
    let linkedMonthId = payload.monthId || null;
    if (!linkedMonthId && txDate) {
      const coveringMonth = await db.query.months.findFirst({
        where: and(
          eq(s.months.userId, userId),
          lte(s.months.startDate, txDate),
          gte(s.months.endDate, txDate)
        )
      });
      if (coveringMonth) {
        if (coveringMonth.isClosed) {
          throw new ValidationError(`Cannot log transactions dated inside closed review period ${coveringMonth.year}-${coveringMonth.month} (${coveringMonth.startDate} to ${coveringMonth.endDate}). Review periods are strictly read-only.`);
        }
        linkedMonthId = coveringMonth.id;
      }
    } else if (linkedMonthId) {
      const targetMonth = await db.query.months.findFirst({ where: eq(s.months.id, linkedMonthId) });
      if (targetMonth && targetMonth.isClosed) {
        throw new ValidationError('Cannot log transactions in a closed review period. Review periods are strictly read-only.');
      }
    }

    if (resolvedOrigin === 'transfer') {
      resolvedStatus = 'successful';
      const sourceAccId = payload.accountId || payload.sourceAccountId || payload.sourceBankAccountId || payload.sourceWalletId;
      const destAccId = payload.destinationAccountId || payload.destinationBankAccountId || payload.destinationWalletId;

      if (!sourceAccId || !destAccId) {
        throw new ValidationError('Source and destination accounts are required for transfers');
      }
      if (String(sourceAccId) === String(destAccId)) {
        throw new ValidationError('Source and destination accounts must be different');
      }

      const [validSource, validDest] = await Promise.all([
        validateUserAccount({ userId, accountId: sourceAccId }),
        validateUserAccount({ userId, accountId: destAccId })
      ]);
      if (!validSource || !validDest) {
        throw new ValidationError('Source or destination account is invalid or not owned by user');
      }

      const transferAmount = Math.abs(numAmount);
      const txNote = (note !== undefined && note !== null) ? String(note).trim() : '';
      const txName = payload.name ? String(payload.name).trim() : 'Inter-Account Transfer';

      let linkedTransferId = payload.transferId || null;
      if (!linkedTransferId) {
        const [tr] = await db.insert(s.transfers).values({
          userId,
          monthId: linkedMonthId,
          date: txDate,
          amount: transferAmount,
          sourceAccountId: sourceAccId,
          destinationAccountId: destAccId,
          note: txNote
        }).returning();
        linkedTransferId = tr.id;
      }

      const [transaction] = await db.insert(s.transactions).values({
        userId,
        monthId: linkedMonthId,
        name: txName,
        status: 'successful',
        origin: 'transfer',
        date: txDate,
        amount: transferAmount,
        category: 'Transfer',
        note: txNote,
        accountId: sourceAccId,
        destinationAccountId: destAccId,
        transferId: linkedTransferId,
        isIncome: false
      }).returning();

      return serialize(transaction);
    }

    let resolvedAccountId = accountId;
    if (!resolvedAccountId) {
      const primaryAccount = await db.query.accounts.findFirst({
        where: and(
          eq(s.accounts.userId, userId),
          eq(s.accounts.isPrimary, true),
          eq(s.accounts.isArchived, false)
        )
      });
      resolvedAccountId = primaryAccount?.id || null;
    }

    if (resolvedAccountId) {
      const validAccount = await validateUserAccount({ userId, accountId: resolvedAccountId });
      if (!validAccount) {
        throw new ValidationError('Linked Account is invalid or not owned by user');
      }
    }

    const [transaction] = await db.insert(s.transactions).values({
      userId,
      monthId: linkedMonthId,
      name: (name || note || (Boolean(isIncome) ? 'Income' : 'Expense')).trim(),
      status: resolvedStatus,
      origin: resolvedOrigin,
      date: txDate,
      amount: numAmount,
      plannedAmount: payload.plannedAmount !== undefined ? Math.round(Number(payload.plannedAmount)) : (resolvedStatus === 'planned' ? numAmount : null),
      plannedDate: plannedDate || (resolvedStatus === 'planned' ? txDate : null),
      category: category || (Boolean(isIncome) ? 'Income' : 'Other'),
      note: (note || '').trim(),
      accountId: resolvedAccountId,
      isIncome: Boolean(isIncome),
      goalId: payload.goalId || null
    }).returning();

    return serialize(transaction);
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
