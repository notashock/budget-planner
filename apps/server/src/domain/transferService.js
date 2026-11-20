import { eq, and, asc, lte, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { validateUserAccount } from '../services/accountValidation.js';
import { LedgerService } from './ledgerService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { serialize } from '../utils/serializer.js';
import { loadAccountTypeMap, attachAccountTypes } from '../utils/accountTypes.js';

// Clients have sent the account ids under several names over time
function sourceIdFrom(body) {
  return body.sourceAccountId || body.sourceBankAccountId || body.sourceWalletId || body.sourceId;
}
function destinationIdFrom(body) {
  return body.destinationAccountId || body.destinationBankAccountId || body.destinationWalletId || body.destinationId;
}
function noteFrom({ note, description }) {
  if (typeof note === 'string' && note.trim()) return note.trim();
  if (typeof description === 'string' && description.trim()) return description.trim();
  return '';
}

/**
 * The period a transfer belongs to: the month the client names, else the one
 * whose date range covers the transfer date (periods follow the salary cycle,
 * not calendar months). A transfer outside every period is period-free, the
 * same as a global transaction. Closed review periods are read-only.
 */
async function resolveMonth(userId, body) {
  const { monthId, date } = body;
  let month = null;
  if (monthId) {
    month = await db.query.months.findFirst({
      where: and(eq(s.months.id, monthId), eq(s.months.userId, userId))
    });
  }
  if (!month && date) {
    month = await db.query.months.findFirst({
      where: and(eq(s.months.userId, userId), lte(s.months.startDate, date), gte(s.months.endDate, date))
    });
  }
  if (!month && date) {
    // Calendar months created without explicit period dates
    const [yr, mo] = String(date).split('-').map(Number);
    if (yr && mo) {
      month = await db.query.months.findFirst({
        where: and(eq(s.months.userId, userId), eq(s.months.year, yr), eq(s.months.month, mo))
      });
    }
  }
  if (!month && body.year && body.month) {
    month = await db.query.months.findFirst({
      where: and(eq(s.months.userId, userId), eq(s.months.year, Number(body.year)), eq(s.months.month, Number(body.month)))
    });
  }
  if (month?.isClosed) {
    throw new ValidationError(`Cannot record a transfer in closed review period ${month.year}-${month.month}. Review periods are strictly read-only.`);
  }
  return month;
}

async function findOwnedTransfer(userId, transferId) {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(s.transfers.id, transferId), eq(s.transfers.userId, userId))
  });
  if (!transfer) throw new NotFoundError('Transfer not found');
  return transfer;
}

/**
 * Paired account transfers: a row in `transfers` plus its mirror in
 * `transactions` (origin 'transfer'), with materialized balances kept in step.
 * Shared by the legacy /api/transfers router and /api/v1/transfers.
 */
export const TransferService = {
  async listTransfers(userId, { monthId = null } = {}) {
    const conditions = [eq(s.transfers.userId, userId)];
    if (monthId) conditions.push(eq(s.transfers.monthId, monthId));
    const [rows, accountTypes] = await Promise.all([
      db.query.transfers.findMany({
        where: and(...conditions),
        orderBy: [asc(s.transfers.date), asc(s.transfers.createdAt)]
      }),
      loadAccountTypeMap(userId)
    ]);
    return serialize(attachAccountTypes(rows, accountTypes));
  },

  /** Returns `{ transfer, transaction }`. Both accounts must belong to the user. */
  async createTransfer(userId, body = {}) {
    const { date, amount } = body;
    const numAmount = Number(amount);
    if (!date || !amount || isNaN(numAmount) || numAmount <= 0) {
      throw new ValidationError('Valid date and positive amount are required');
    }

    const sourceAccountId = sourceIdFrom(body);
    const destinationAccountId = destinationIdFrom(body);
    if (!sourceAccountId || !destinationAccountId) {
      throw new ValidationError('Source and destination accounts are required');
    }
    if (String(sourceAccountId) === String(destinationAccountId)) {
      throw new ValidationError('Source and destination accounts must be different');
    }

    const [validSource, validDest] = await Promise.all([
      validateUserAccount({ userId, accountId: sourceAccountId }),
      validateUserAccount({ userId, accountId: destinationAccountId })
    ]);
    if (!validSource || !validDest) {
      throw new ValidationError('Source or destination account is invalid or not owned by user');
    }

    const month = await resolveMonth(userId, body);
    const monthId = month ? month.id : null;

    const note = noteFrom(body);
    const rounded = Math.round(numAmount);

    const { transfer, transaction } = await db.transaction(async (trx) => {
      const [transfer] = await trx.insert(s.transfers).values({
        userId,
        monthId,
        date,
        amount: rounded,
        sourceAccountId: validSource.id,
        destinationAccountId: validDest.id,
        note
      }).returning();

      const [transaction] = await trx.insert(s.transactions).values({
        userId,
        monthId,
        name: 'Inter-Account Transfer',
        status: 'successful',
        origin: 'transfer',
        amount: rounded,
        date,
        category: 'Transfer',
        note,
        accountId: validSource.id,
        destinationAccountId: validDest.id,
        transferId: transfer.id,
        isIncome: false
      }).returning();

      return { transfer, transaction };
    });

    await LedgerService.applyTransactionBalance(transaction, 1);
    return { transfer: serialize(transfer), transaction: serialize(transaction) };
  },

  async updateTransfer(userId, transferId, body = {}) {
    const existing = await findOwnedTransfer(userId, transferId);
    const requestedSource = sourceIdFrom(body);
    const requestedDest = destinationIdFrom(body);

    for (const accountId of [requestedSource, requestedDest]) {
      if (accountId && !(await validateUserAccount({ userId, accountId }))) {
        throw new ValidationError('Source or destination account is invalid or not owned by user');
      }
    }

    const sourceAccountId = requestedSource || existing.sourceAccountId;
    const destinationAccountId = requestedDest || existing.destinationAccountId;
    if (String(sourceAccountId) === String(destinationAccountId)) {
      throw new ValidationError('Source and destination accounts must be different');
    }

    const { amount, date, note, description } = body;
    let effectiveAmount = existing.amount;
    if (amount !== undefined) {
      effectiveAmount = Math.round(Number(amount));
      if (isNaN(effectiveAmount) || effectiveAmount <= 0) {
        throw new ValidationError('Transfer amount must be greater than zero');
      }
    }
    const effectiveDate = date ? String(date).trim() : existing.date;
    const effectiveNote = note !== undefined ? String(note).trim() : (description !== undefined ? String(description).trim() : existing.note);

    const [updated] = await db.update(s.transfers).set({
      sourceAccountId,
      destinationAccountId,
      amount: effectiveAmount,
      date: effectiveDate,
      note: effectiveNote,
      updatedAt: new Date()
    }).where(eq(s.transfers.id, existing.id)).returning();

    const existingTx = await db.query.transactions.findFirst({
      where: and(eq(s.transactions.userId, userId), eq(s.transactions.transferId, existing.id))
    });
    if (existingTx) {
      const [updatedTx] = await db.update(s.transactions).set({
        accountId: sourceAccountId,
        destinationAccountId,
        amount: effectiveAmount,
        date: effectiveDate,
        note: effectiveNote,
        updatedAt: new Date()
      }).where(eq(s.transactions.id, existingTx.id)).returning();

      await LedgerService.handleTransactionUpdateBalance(existingTx, updatedTx);
    }

    return serialize(updated);
  },

  /** Deletes the transfer and its mirror transaction, reversing the balance movement. */
  async deleteTransfer(userId, transferId) {
    const existing = await findOwnedTransfer(userId, transferId);
    const mirrors = await db.delete(s.transactions)
      .where(and(eq(s.transactions.userId, userId), eq(s.transactions.transferId, existing.id)))
      .returning();
    for (const tx of mirrors) {
      await LedgerService.applyTransactionBalance(tx, -1);
    }
    await db.delete(s.transfers).where(eq(s.transfers.id, existing.id));
    return serialize(existing);
  }
};
