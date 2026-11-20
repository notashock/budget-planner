import { eq, and, or, asc, inArray, desc, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { recommendPurchaseDate, deriveTransactionState, isPassThrough, getRefundableRemaining } from '@budget/engine';
import { backfillUnassignedTransactions } from '../services/accountMigration.js';
import { validateUserAccount } from '../services/accountValidation.js';
import { SalaryTemplateService } from '../services/salaryTemplateService.js';
import { serialize } from '../utils/serializer.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { LedgerService } from './ledgerService.js';
import { isValidUuid } from '../middleware/auth.js';
import { GoalExecution } from './goalExecution.js';
import { ReportsExecution } from './reportsExecution.js';
import { PersonFundService } from './personFundService.js';

/** Held & Lent rows always belong to a person; route them through PersonFundService. */
function recordPassThrough(userId, payload) {
  if (!payload.personFundId) {
    throw new ValidationError('Held or lent money needs a person (personFundId)');
  }
  return PersonFundService.addEntry(userId, payload.personFundId, {
    origin: payload.origin,
    amount: payload.amount,
    date: payload.date || payload.plannedDate,
    accountId: payload.accountId,
    note: payload.note,
    name: payload.name,
    status: payload.status,
    allowExceed: payload.allowExceed
  });
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * BudgetExecution Domain Service
 * Consolidates transaction recording, refund verification, and purchase goal evaluation.
 */
/**
 * A spend can be refunded in parts, but the refunds linked to it can never add up
 * to more than was paid (ADR 0062). Checks against what is left after the refunds
 * already linked to the spend, not the spend's original amount.
 * @param {string} userId
 * @param {object} targetTx - the spend being refunded
 * @param {number} refundAmount - the new refund's amount (minor units, negative)
 * @param {string} [excludeId] - the refund being edited, left out of the total
 */
async function assertRefundFits(userId, targetTx, refundAmount, excludeId) {
  const linkedRefunds = await db.query.transactions.findMany({
    where: and(
      eq(s.transactions.refundTargetTransactionId, targetTx.id),
      eq(s.transactions.userId, userId)
    )
  });
  const remaining = getRefundableRemaining(targetTx, linkedRefunds, { excludeId });
  if (Math.abs(Number(refundAmount) || 0) > remaining) {
    throw new ValidationError(
      `Refunds can't add up to more than the spend: only ${(remaining / 100).toFixed(2)} of ${(Math.abs(Number(targetTx.amount) || 0) / 100).toFixed(2)} is left to refund`
    );
  }
}

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
    if (isPassThrough(origin)) return recordPassThrough(userId, payload);

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
        await assertRefundFits(userId, targetTx, numAmount);
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

    if (transaction.status === 'successful') {
      try {
        await LedgerService.applyTransactionBalance(transaction, 1);
      } catch (balErr) {
        console.error('Failed to update materialized account balance:', balErr);
      }
    }

    // Auto goal deferral if spending committed
    if (resolvedStatus === 'successful' && transaction.amount > 0 && !transaction.isIncome) {
      await this._reEvaluateAndDeferGoals(userId, month);
    } else if (resolvedStatus === 'successful' && (transaction.isIncome || transaction.amount < 0)) {
      await this._reEvaluateAndReviveGoals(userId, month);
    }

    return serialize(transaction);
  },

  /**
   * Transitions a planned transaction to successful (Mark as Paid).
   * Confirms actual amount and actual date while preserving planned values.
   * If linked to a goal, automatically marks the goal achieved.
   * Resiliently resolves both s.transactions and bridged items from s.items.
   */
  async markTransactionPaid(userId, txId, payload = {}) {
    if (!txId || !isValidUuid(txId)) {
      throw new NotFoundError('Transaction not found');
    }

    // 1. First, search in s.transactions (by id, legacyItemId, or plannedItemId)
    let tx = await db.query.transactions.findFirst({
      where: and(
        or(
          eq(s.transactions.id, txId),
          eq(s.transactions.legacyItemId, txId),
          eq(s.transactions.plannedItemId, txId)
        ),
        eq(s.transactions.userId, userId)
      )
    });

    let rawAmt = payload.amount !== undefined ? payload.amount : payload.actualAmount;
    let rawDate = payload.date || payload.actualDate;
    let requestedAccountId = payload.accountId;

    // Helper: resolve default primary account if accountId is empty/null
    const resolveValidAccountId = async (candidateId) => {
      let resolvedId = candidateId;
      if (typeof resolvedId === 'object' && resolvedId !== null) {
        resolvedId = resolvedId.id || resolvedId._id || null;
      }
      if (typeof resolvedId === 'string') {
        resolvedId = resolvedId.trim();
      }
      if (!resolvedId) {
        const primaryAcc = await db.query.accounts.findFirst({
          where: and(eq(s.accounts.userId, userId), eq(s.accounts.isArchived, false)),
          orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
        });
        return primaryAcc?.id || null;
      }
      const valid = await validateUserAccount({ userId, accountId: resolvedId });
      if (!valid) throw new ValidationError('Specified account is invalid');
      return resolvedId;
    };

    if (!tx) {
      // 2. Check if txId references an item in s.items (bridged planned budget item)
      const item = await db.query.items.findFirst({
        where: and(eq(s.items.id, txId), eq(s.items.userId, userId))
      });

      if (!item) {
        throw new NotFoundError('Transaction not found');
      }

      if (item.monthId) {
        const month = await db.query.months.findFirst({ where: eq(s.months.id, item.monthId) });
        if (month && month.isClosed) {
          throw new ValidationError('Cannot modify transactions in a closed review period. Review periods are strictly read-only.');
        }
      }

      const actualAmount = rawAmt !== undefined ? Math.round(Number(rawAmt)) : item.amount;
      const actualDate = rawDate ? String(rawDate).trim() : item.date;
      const finalAccountId = await resolveValidAccountId(requestedAccountId || item.accountId);

      const [insertedTx] = await db.insert(s.transactions).values({
        userId,
        monthId: item.monthId,
        name: item.name,
        status: 'successful',
        origin: 'planned',
        date: actualDate,
        amount: actualAmount,
        plannedAmount: item.amount,
        plannedDate: item.date,
        category: item.category || 'General',
        note: '',
        goalId: null,
        recurrence: null,
        plannedItemId: item.id,
        legacyItemId: item.id,
        accountId: finalAccountId,
        isIncome: Boolean(item.isIncome)
      }).returning();

      // Mark the item as paid in s.items
      await db.update(s.items).set({
        isPaid: true,
        updatedAt: new Date()
      }).where(eq(s.items.id, item.id));

      try {
        await LedgerService.applyTransactionBalance(insertedTx, 1);
      } catch (balErr) {
        console.error('Failed to update materialized account balance:', balErr);
      }

      const month = item.monthId ? await db.query.months.findFirst({ where: eq(s.months.id, item.monthId) }) : null;
      if (month && insertedTx.amount > 0 && !insertedTx.isIncome) {
        await this._reEvaluateAndDeferGoals(userId, month);
      }

      return serialize(insertedTx);
    }

    // Found existing transaction record
    if (tx.monthId) {
      const month = await db.query.months.findFirst({ where: eq(s.months.id, tx.monthId) });
      if (month && month.isClosed) {
        throw new ValidationError('Cannot modify transactions in a closed review period. Review periods are strictly read-only.');
      }
    }

    if (tx.status !== 'planned') {
      throw new ValidationError(`Only planned transactions can be marked as paid. Current status: ${tx.status}`);
    }

    const actualAmount = rawAmt !== undefined ? Math.round(Number(rawAmt)) : (tx.plannedAmount || tx.amount);
    const actualDate = rawDate ? String(rawDate).trim() : (tx.plannedDate || tx.date);
    const finalAccountId = await resolveValidAccountId(requestedAccountId || tx.accountId);

    const [updatedTx] = await db.update(s.transactions).set({
      status: 'successful',
      amount: actualAmount,
      date: actualDate,
      accountId: finalAccountId,
      updatedAt: new Date()
    }).where(eq(s.transactions.id, tx.id)).returning();

    // Also mark linked item in s.items as paid if exists
    const linkedItemId = tx.plannedItemId || tx.legacyItemId;
    if (linkedItemId && isValidUuid(linkedItemId)) {
      await db.update(s.items).set({
        isPaid: true,
        updatedAt: new Date()
      }).where(eq(s.items.id, linkedItemId));
    }

    if (tx.goalId) {
      await db.update(s.goals).set({
        status: 'achieved',
        updatedAt: new Date()
      }).where(eq(s.goals.id, tx.goalId));
    }

    try {
      await LedgerService.applyTransactionBalance(updatedTx, 1);
    } catch (balErr) {
      console.error('Failed to update materialized account balance:', balErr);
    }

    let advancedMonth = null;
    // When a salary transaction is settled, advance the cycle and snapshot closed period
    if ((updatedTx.origin === 'salary' || updatedTx.category === 'Salary') && updatedTx.isIncome) {
      const advanceRes = await SalaryTemplateService.onSalaryCredited(userId, updatedTx, actualDate);
      if (advanceRes?.nextMonth) {
        advancedMonth = advanceRes.nextMonth;
      }
    }

    const month = await db.query.months.findFirst({ where: eq(s.months.id, tx.monthId) });
    if (month && updatedTx.amount > 0 && !updatedTx.isIncome) {
      await this._reEvaluateAndDeferGoals(userId, month);
    }

    const resObj = serialize(updatedTx);
    if (advancedMonth) {
      resObj.advancedMonth = serialize(advancedMonth);
    }
    return resObj;
  },

  /**
   * Cancels a planned transaction. Excluded from Planned view.
   * If linked to a goal, prompts destination status ('return_to_logged' vs 'dropped').
   * Resiliently handles both s.transactions and bridged items from s.items.
   */
  async cancelTransaction(userId, txId, payload = {}) {
    if (!txId || !isValidUuid(txId)) {
      throw new NotFoundError('Transaction not found');
    }

    let tx = await db.query.transactions.findFirst({
      where: and(
        or(
          eq(s.transactions.id, txId),
          eq(s.transactions.legacyItemId, txId),
          eq(s.transactions.plannedItemId, txId)
        ),
        eq(s.transactions.userId, userId)
      )
    });

    if (!tx) {
      // Check s.items
      const item = await db.query.items.findFirst({
        where: and(eq(s.items.id, txId), eq(s.items.userId, userId))
      });

      if (!item) {
        throw new NotFoundError('Transaction not found');
      }

      if (item.monthId) {
        const month = await db.query.months.findFirst({ where: eq(s.months.id, item.monthId) });
        if (month && month.isClosed) {
          throw new ValidationError('Cannot cancel transactions in a closed review period. Review periods are strictly read-only.');
        }
      }

      await db.delete(s.items).where(eq(s.items.id, item.id));
      return serialize({ id: item.id, status: 'cancelled', message: 'Planned item cancelled successfully' });
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

    const linkedItemId = tx.plannedItemId || tx.legacyItemId;
    if (linkedItemId && isValidUuid(linkedItemId)) {
      await db.delete(s.items).where(eq(s.items.id, linkedItemId));
    }

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
   * Updates an existing transaction or planned item polymorphically, safely rebalancing
   * ledger account balances, cascading dual-table updates, and handling recurrence scopes.
   */
  async updateTransaction(userId, txId, payload = {}) {
    if (!txId) {
      throw new NotFoundError('Transaction not found');
    }

    // 1. Search in s.transactions
    const tx = await db.query.transactions.findFirst({
      where: and(
        or(
          eq(s.transactions.id, txId),
          eq(s.transactions.legacyItemId, txId),
          eq(s.transactions.plannedItemId, txId)
        ),
        eq(s.transactions.userId, userId)
      )
    });

    if (tx) {
      if (tx.monthId) {
        const month = await db.query.months.findFirst({ where: eq(s.months.id, tx.monthId) });
        if (month && month.isClosed) {
          throw new ValidationError('Cannot modify transactions in a closed review period. Review periods are strictly read-only.');
        }
      }

      const updates = { updatedAt: new Date() };
      // A linked refund's new amount must still fit in what is left of its spend
      if (payload.amount !== undefined && tx.refundTargetTransactionId) {
        const targetTx = await db.query.transactions.findFirst({
          where: and(eq(s.transactions.id, tx.refundTargetTransactionId), eq(s.transactions.userId, userId))
        });
        if (targetTx) await assertRefundFits(userId, targetTx, Math.round(Number(payload.amount)), tx.id);
      }
      const effectiveName = payload.name !== undefined ? payload.name : payload.title;
      if (effectiveName !== undefined) updates.name = String(effectiveName).trim();
      if (payload.amount !== undefined) updates.amount = Math.round(Number(payload.amount));
      if (payload.date) {
        updates.date = String(payload.date).trim();
        // If date moved to another month period, dynamically re-link monthId
        const parts = updates.date.split('-');
        if (parts.length >= 2) {
          const yr = Number(parts[0]);
          const mo = Number(parts[1]);
          if (!isNaN(yr) && !isNaN(mo)) {
            const targetMonth = await db.query.months.findFirst({
              where: and(eq(s.months.userId, userId), eq(s.months.year, yr), eq(s.months.month, mo))
            });
            if (targetMonth) {
              updates.monthId = targetMonth.id;
            }
          }
        }
      }
      if (payload.plannedAmount !== undefined) updates.plannedAmount = Math.round(Number(payload.plannedAmount));
      if (payload.plannedDate !== undefined) updates.plannedDate = payload.plannedDate;
      if (payload.category) updates.category = String(payload.category).trim();
      if (payload.note !== undefined) updates.note = String(payload.note).trim();
      if (payload.accountId !== undefined) updates.accountId = payload.accountId;
      if (payload.destinationAccountId !== undefined) updates.destinationAccountId = payload.destinationAccountId;
      if (payload.isIncome !== undefined) updates.isIncome = Boolean(payload.isIncome);
      if (payload.recurrence !== undefined) updates.recurrence = payload.recurrence;
      if (payload.isPaid !== undefined) {
        updates.status = payload.isPaid ? 'successful' : 'planned';
      }
      if (payload.status !== undefined) {
        updates.status = payload.status;
      }

      const [updated] = await db.update(s.transactions)
        .set(updates)
        .where(eq(s.transactions.id, tx.id))
        .returning();

      // Synchronize ledger account balance if this transaction is settled
      try {
        await LedgerService.handleTransactionUpdateBalance(tx, updated);
      } catch (balErr) {
        console.error('Failed to update materialized account balance:', balErr);
      }

      // If linked to a transfer, update the transfer record
      if (tx.transferId) {
        await db.update(s.transfers).set({
          sourceAccountId: updates.accountId || tx.accountId,
          destinationAccountId: updates.destinationAccountId || tx.destinationAccountId,
          amount: updates.amount !== undefined ? updates.amount : tx.amount,
          date: updates.date || tx.date,
          note: updates.note !== undefined ? updates.note : tx.note,
          updatedAt: new Date()
        }).where(eq(s.transfers.id, tx.transferId));
      }

      // If linked to an item in items table, synchronize it
      const linkedItemId = tx.plannedItemId || tx.legacyItemId;
      if (linkedItemId) {
        await db.update(s.items).set({
          name: updates.name !== undefined ? updates.name : tx.name,
          amount: updates.amount !== undefined ? updates.amount : tx.amount,
          date: updates.date || tx.date,
          category: updates.category || tx.category,
          accountId: updates.accountId !== undefined ? updates.accountId : tx.accountId,
          updatedAt: new Date()
        }).where(and(eq(s.items.id, linkedItemId), eq(s.items.userId, userId)));
      }

      // Recurrence cascade if requested
      if (payload.cascadeScope === 'all_future') {
        const effectiveDate = updates.date || tx.date;
        const targetName = updates.name || tx.name;
        if (targetName && effectiveDate) {
          await db.update(s.items).set({
            amount: updates.amount !== undefined ? updates.amount : tx.amount,
            category: updates.category || tx.category,
            accountId: updates.accountId !== undefined ? updates.accountId : tx.accountId,
            updatedAt: new Date()
          }).where(
            and(
              eq(s.items.userId, userId),
              eq(s.items.name, targetName),
              gte(s.items.date, effectiveDate)
            )
          );
        }
      }

      // Salary Template sync if user checked "Update standard monthly salary"
      if (payload.updateSalaryTemplate && (tx.origin === 'salary' || tx.category === 'Salary') && updates.amount) {
        await db.update(s.salaryTemplates).set({
          monthlyAmount: updates.amount,
          updatedAt: new Date()
        }).where(eq(s.salaryTemplates.userId, userId));
      }

      const month = updated.monthId ? await db.query.months.findFirst({ where: eq(s.months.id, updated.monthId) }) : null;
      if (month) {
        if (updated.isIncome || (tx.amount > updated.amount)) {
          await this._reEvaluateAndReviveGoals(userId, month);
        } else if (!updated.isIncome && updated.amount > tx.amount) {
          await this._reEvaluateAndDeferGoals(userId, month);
        }
      }

      return serialize({
        ...updated,
        isPaid: updated.status === 'successful'
      });
    }

    // 2. Fallback: check if txId exists in s.items
    const item = await db.query.items.findFirst({
      where: and(eq(s.items.id, txId), eq(s.items.userId, userId))
    });

    if (!item) {
      throw new NotFoundError('Transaction not found');
    }

    if (item.monthId) {
      const month = await db.query.months.findFirst({ where: eq(s.months.id, item.monthId) });
      if (month && month.isClosed) {
        throw new ValidationError('Cannot modify transactions in a closed review period. Review periods are strictly read-only.');
      }
    }

    const itemUpdates = { updatedAt: new Date() };
    const effectiveName = payload.name !== undefined ? payload.name : payload.title;
    if (effectiveName !== undefined) itemUpdates.name = String(effectiveName).trim();
    if (payload.amount !== undefined) itemUpdates.amount = Math.round(Number(payload.amount));
    if (payload.date) {
      itemUpdates.date = String(payload.date).trim();
      const parts = itemUpdates.date.split('-');
      if (parts.length >= 2) {
        const yr = Number(parts[0]);
        const mo = Number(parts[1]);
        if (!isNaN(yr) && !isNaN(mo)) {
          const targetMonth = await db.query.months.findFirst({
            where: and(eq(s.months.userId, userId), eq(s.months.year, yr), eq(s.months.month, mo))
          });
          if (targetMonth) {
            itemUpdates.monthId = targetMonth.id;
          }
        }
      }
    }
    if (payload.category) itemUpdates.category = String(payload.category).trim();
    if (payload.accountId !== undefined) itemUpdates.accountId = payload.accountId;
    if (payload.isIncome !== undefined) itemUpdates.isIncome = Boolean(payload.isIncome);
    if (payload.type !== undefined) itemUpdates.type = payload.type;
    if (payload.isPaid !== undefined) itemUpdates.isPaid = Boolean(payload.isPaid);
    if (payload.status !== undefined) itemUpdates.isPaid = payload.status === 'successful';

    const [updatedItem] = await db.update(s.items)
      .set(itemUpdates)
      .where(eq(s.items.id, item.id))
      .returning();

    // If linked transactions exist, synchronize them and rebalance
    const linkedTxs = await db.query.transactions.findMany({
      where: and(
        eq(s.transactions.userId, userId),
        or(
          eq(s.transactions.id, item.id),
          eq(s.transactions.plannedItemId, item.id),
          eq(s.transactions.legacyItemId, item.id)
        )
      )
    });

    for (const ltx of linkedTxs) {
      const [uTx] = await db.update(s.transactions).set({
        name: updatedItem.name,
        amount: updatedItem.amount,
        date: updatedItem.date,
        monthId: updatedItem.monthId,
        category: updatedItem.category,
        accountId: updatedItem.accountId,
        updatedAt: new Date()
      }).where(eq(s.transactions.id, ltx.id)).returning();

      await LedgerService.handleTransactionUpdateBalance(ltx, uTx);
    }

    if (payload.cascadeScope === 'all_future') {
      const effectiveDate = updatedItem.date || item.date;
      const targetName = updatedItem.name || item.name;
      if (targetName && effectiveDate) {
        await db.update(s.items).set({
          amount: updatedItem.amount,
          category: updatedItem.category,
          accountId: updatedItem.accountId,
          updatedAt: new Date()
        }).where(
          and(
            eq(s.items.userId, userId),
            eq(s.items.name, targetName),
            gte(s.items.date, effectiveDate)
          )
        );
      }
    }

    const month = updatedItem.monthId ? await db.query.months.findFirst({ where: eq(s.months.id, updatedItem.monthId) }) : null;
    if (month && !updatedItem.isIncome && updatedItem.amount > item.amount) {
      await this._reEvaluateAndDeferGoals(userId, month);
    }

    return serialize({
      ...updatedItem,
      isPaid: updatedItem.isPaid !== undefined ? updatedItem.isPaid : (updatedItem.status === 'successful')
    });
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
          // Open goals: `logged` is how a goal is created (ADR 0064), `active`
          // is what reactivation sets, `evaluating` is a legacy name.
          inArray(s.goals.status, ['logged', 'active', 'evaluating'])
        )
      });

      if (activeGoals.length === 0) return;

      const [items, allTransactions] = await Promise.all([
        db.query.items.findMany({ where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id)) }),
        db.query.transactions.findMany({ where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)) })
      ]);

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonthNum = now.getMonth() + 1;
      const isPastMonth = Number(month.year) < currentYear || (Number(month.year) === currentYear && Number(month.month) < currentMonthNum);
      const isCurrentMonth = Number(month.year) === currentYear && Number(month.month) === currentMonthNum;
      const currentDay = isCurrentMonth ? now.getDate() : (isPastMonth ? null : 0);

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
   * Internal routine for Autonomous Goal Self-Healing Revival.
   * Restores deferred goals to active when positive cashflow restores the safety buffer.
   */
  async _reEvaluateAndReviveGoals(userId, month) {
    try {
      const deferredGoals = await db.query.goals.findMany({
        where: and(
          eq(s.goals.userId, userId),
          eq(s.goals.monthId, month.id),
          eq(s.goals.status, 'deferred')
        ),
        orderBy: [asc(s.goals.priority), asc(s.goals.createdAt)]
      });

      if (deferredGoals.length === 0) return;

      const [items, allTransactions] = await Promise.all([
        db.query.items.findMany({ where: and(eq(s.items.userId, userId), eq(s.items.monthId, month.id)) }),
        db.query.transactions.findMany({ where: and(eq(s.transactions.userId, userId), eq(s.transactions.monthId, month.id)) })
      ]);

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonthNum = now.getMonth() + 1;
      const isPastMonth = Number(month.year) < currentYear || (Number(month.year) === currentYear && Number(month.month) < currentMonthNum);
      const isCurrentMonth = Number(month.year) === currentYear && Number(month.month) === currentMonthNum;
      const currentDay = isCurrentMonth ? now.getDate() : (isPastMonth ? null : 0);

      for (const goal of deferredGoals) {
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

        if (rec.feasible) {
          await db.update(s.goals)
            .set({
              status: 'active',
              deferredReason: null,
              updatedAt: new Date()
            })
            .where(eq(s.goals.id, goal.id));
        }
      }
    } catch (goalReviveErr) {
      console.error('Goal self-healing revival error:', goalReviveErr);
    }
  },

  /**
   * Deletes a transaction or planned budget item polymorphically, cascades related entities,
   * reverses materialized ledger account balances if settled, and re-evaluates goals.
   * Idempotent: returns success message if already removed.
   */
  async deleteTransaction(userId, txId) {
    if (!txId) {
      return { message: 'Transaction already removed' };
    }

    // 1. Check if record exists in transactions
    const existing = await db.query.transactions.findFirst({
      where: and(eq(s.transactions.id, txId), eq(s.transactions.userId, userId))
    });

    if (existing) {
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

      if (existing.status === 'successful') {
        try {
          await LedgerService.applyTransactionBalance(existing, -1);
        } catch (balErr) {
          console.error('Failed to reverse materialized account balance on delete:', balErr);
        }
      }

      // Delete the transaction
      await db.delete(s.transactions).where(eq(s.transactions.id, txId));

      // Cascade delete any corresponding planned item in items table
      const linkedItemId = existing.plannedItemId || existing.legacyItemId;
      if (linkedItemId) {
        await db.delete(s.items).where(and(eq(s.items.id, linkedItemId), eq(s.items.userId, userId)));
      }
      // Also delete any item that shares the exact same id
      await db.delete(s.items).where(and(eq(s.items.id, txId), eq(s.items.userId, userId)));

      // A held/lent entry changes what is outstanding with that person
      if (existing.personFundId) {
        await PersonFundService.refreshStatus(existing.personFundId);
      }

      if (existing.monthId && !existing.isIncome && existing.amount > 0) {
        const month = await db.query.months.findFirst({ where: eq(s.months.id, existing.monthId) });
        if (month) {
          await this._reEvaluateAndReviveGoals(userId, month);
        }
      }

      return { message: 'Transaction deleted successfully' };
    }

    // 2. Fallback: check if txId references an item in s.items (bridged planned transaction or item deletion)
    const item = await db.query.items.findFirst({
      where: and(eq(s.items.id, txId), eq(s.items.userId, userId))
    });

    if (item) {
      if (item.monthId) {
        const month = await db.query.months.findFirst({ where: eq(s.months.id, item.monthId) });
        if (month && month.isClosed) {
          throw new ValidationError('Cannot delete transactions in a closed review period. Review periods are strictly read-only.');
        }
      }

      // Find any linked transactions in transactions table
      const linkedTransactions = await db.query.transactions.findMany({
        where: and(
          eq(s.transactions.userId, userId),
          or(
            eq(s.transactions.id, item.id),
            eq(s.transactions.plannedItemId, item.id),
            eq(s.transactions.legacyItemId, item.id)
          )
        )
      });

      for (const linkedTx of linkedTransactions) {
        if (linkedTx.transferId) {
          await db.delete(s.transfers).where(eq(s.transfers.id, linkedTx.transferId));
        }
        if (linkedTx.status === 'successful') {
          try {
            await LedgerService.applyTransactionBalance(linkedTx, -1);
          } catch (balErr) {
            console.error('Failed to reverse materialized account balance on delete (linked item):', balErr);
          }
        }
        await db.delete(s.transactions).where(eq(s.transactions.id, linkedTx.id));
      }

      // Delete the item itself
      await db.delete(s.items).where(eq(s.items.id, item.id));

      if (item.monthId && !item.isIncome && item.amount > 0) {
        const month = await db.query.months.findFirst({ where: eq(s.months.id, item.monthId) });
        if (month) {
          await this._reEvaluateAndReviveGoals(userId, month);
        }
      }

      return { message: 'Transaction deleted successfully' };
    }

    // 3. Idempotent success: record is already deleted
    return { message: 'Transaction already removed' };
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
    if (isPassThrough(origin)) return recordPassThrough(userId, payload);

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
      // Calendar months created without explicit period dates: match on year and month
      const [txYr, txMo] = String(txDate).split('-').map(Number);
      const calendarMonth = !coveringMonth && txYr && txMo
        ? await db.query.months.findFirst({
            where: and(eq(s.months.userId, userId), eq(s.months.year, txYr), eq(s.months.month, txMo))
          })
        : null;
      const linkedMonth = coveringMonth || calendarMonth;
      if (linkedMonth) {
        if (linkedMonth.isClosed) {
          throw new ValidationError(`Cannot log transactions dated inside closed review period ${linkedMonth.year}-${linkedMonth.month} (${linkedMonth.startDate} to ${linkedMonth.endDate}). Review periods are strictly read-only.`);
        }
        linkedMonthId = linkedMonth.id;
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

      try {
        await LedgerService.applyTransactionBalance(transaction, 1);
      } catch (balErr) {
        console.error('Failed to update balance on transfer transaction:', balErr);
      }

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

    if (transaction.status === 'successful') {
      try {
        await LedgerService.applyTransactionBalance(transaction, 1);
      } catch (balErr) {
        console.error('Failed to update balance on global transaction:', balErr);
      }
    }

    return serialize(transaction);
  },

  // Goals and reports live in their own modules (goalExecution.js, reportsExecution.js)
  ...GoalExecution,
  ...ReportsExecution
};
