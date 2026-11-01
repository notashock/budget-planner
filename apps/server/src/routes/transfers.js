import express from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { validateUserAccount } from '../services/accountValidation.js';
import { serialize } from '../utils/serializer.js';

export const transfersRouter = express.Router();
transfersRouter.use(requireAuth);

// List transfers for a month or user
transfersRouter.get('/', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const conditions = [eq(s.transfers.userId, userId)];
    if (req.query.monthId) {
      conditions.push(eq(s.transfers.monthId, req.query.monthId));
    }

    const transfers = await db.query.transfers.findMany({
      where: and(...conditions),
      orderBy: [asc(s.transfers.date), asc(s.transfers.createdAt)]
    });

    return res.json(serialize(transfers));
  } catch (err) {
    console.error('Fetch transfers error:', err);
    return res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// Create a Paired Account Transfer
transfersRouter.post('/', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const {
      monthId,
      date,
      amount,
      note,
      description
    } = req.body;

    const transferNote = (typeof note === 'string' && note.trim().length > 0)
      ? note.trim()
      : ((typeof description === 'string' && description.trim().length > 0) ? description.trim() : '');

    if (!date || !amount || typeof Number(amount) !== 'number' || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid date and positive amount are required' });
    }

    const sourceAccountId = req.body.sourceAccountId || req.body.sourceBankAccountId || req.body.sourceWalletId || req.body.sourceId;
    const destAccountId = req.body.destinationAccountId || req.body.destinationBankAccountId || req.body.destinationWalletId || req.body.destinationId;

    if (!sourceAccountId || !destAccountId) {
      return res.status(400).json({ error: 'Source and destination accounts are required' });
    }

    if (String(sourceAccountId) === String(destAccountId)) {
      return res.status(400).json({ error: 'Source and destination accounts must be different' });
    }

    const [validSource, validDest] = await Promise.all([
      validateUserAccount({ userId, accountId: sourceAccountId }),
      validateUserAccount({ userId, accountId: destAccountId })
    ]);

    if (!validSource || !validDest) {
      return res.status(400).json({ error: 'Source or destination account is invalid or not owned by user' });
    }

    let month = null;
    if (monthId) {
      month = await db.query.months.findFirst({
        where: and(eq(s.months.id, monthId), eq(s.months.userId, userId))
      });
    }
    if (!month && date) {
      const parts = String(date).split('-');
      if (parts.length >= 2) {
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        month = await db.query.months.findFirst({
          where: and(eq(s.months.userId, userId), eq(s.months.year, y), eq(s.months.month, m))
        });
      }
    }
    if (!month && req.body.year && req.body.month) {
      month = await db.query.months.findFirst({
        where: and(eq(s.months.userId, userId), eq(s.months.year, Number(req.body.year)), eq(s.months.month, Number(req.body.month)))
      });
    }

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    const [transfer] = await db.insert(s.transfers).values({
      userId,
      monthId: month.id,
      date,
      amount: Math.round(Number(amount)),
      sourceAccountId,
      destinationAccountId: destAccountId,
      note: transferNote
    }).returning();

    // Also write first-class record to transactions table
    await db.insert(s.transactions).values({
      userId,
      monthId: month.id,
      name: 'Inter-Account Transfer',
      status: 'successful',
      origin: 'transfer',
      amount: Math.round(Number(amount)),
      date,
      category: 'Transfer',
      note: transferNote,
      accountId: sourceAccountId,
      destinationAccountId: destAccountId,
      transferId: transfer.id,
      isIncome: false
    });

    return res.status(201).json(serialize(transfer));
  } catch (err) {
    console.error('Create transfer error:', err);
    return res.status(500).json({ error: 'Failed to create transfer' });
  }
});

// Delete a transfer
transfersRouter.delete('/:id', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const transferId = req.params.id;

    const existing = await db.query.transfers.findFirst({
      where: and(eq(s.transfers.id, transferId), eq(s.transfers.userId, userId))
    });

    if (!existing) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Delete corresponding transaction
    await db.delete(s.transactions).where(
      and(
        eq(s.transactions.userId, userId),
        eq(s.transactions.transferId, transferId)
      )
    );

    await db.delete(s.transfers).where(eq(s.transfers.id, transferId));

    return res.json({ message: 'Transfer deleted successfully', transfer: serialize(existing) });
  } catch (err) {
    console.error('Delete transfer error:', err);
    return res.status(500).json({ error: 'Failed to delete transfer' });
  }
});
