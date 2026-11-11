import express from 'express';
import { eq, and, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { validateUserAccount } from '../services/accountValidation.js';
import { serialize } from '../utils/serializer.js';
import { BudgetExecution } from '../domain/budgetExecution.js';

export const itemsRouter = express.Router();
itemsRouter.use(requireAuth);

// Create item in specific month
itemsRouter.post('/months/:year/:month/items', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    let { type, name, priority, amount, day, dayOfMonth, date } = req.body;

    if (!type || !name) {
      return res.status(400).json({ error: 'Valid item type and name required' });
    }

    const resolvedType = type === 'recurring' ? 'recurring' : 'one-time';

    const month = await db.query.months.findFirst({
      where: and(
        eq(s.months.userId, userId),
        eq(s.months.year, year),
        eq(s.months.month, monthNum)
      )
    });

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    // Determine canonical date
    let itemDate = date;
    if (!itemDate || typeof itemDate !== 'string') {
      const dayNum = resolvedType === 'recurring' ? (Number(dayOfMonth) || 1) : (Number(day) || 1);
      const clampedDay = Math.max(1, Math.min(28, Math.floor(dayNum)));
      itemDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    }

    // Resolve Account Attribution
    if (req.body.accountType === 'unassigned') {
      return res.status(400).json({ error: 'Account linking is required' });
    }

    let resolvedAccountId = req.body.accountId || req.body.bankAccountId || req.body.walletId;

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
          )
        });
      }

      if (!primaryAccount) {
        const [created] = await db.insert(s.accounts).values({
          userId,
          name: 'Primary Account',
          type: 'bank',
          subtype: 'checking',
          institution: 'Default Bank',
          isPrimary: true,
          openingBalance: month.openingBalance || 0
        }).returning();
        primaryAccount = created;
      }

      resolvedAccountId = primaryAccount.id;
    }

    const validAccount = await validateUserAccount({ userId, accountId: resolvedAccountId });
    if (!validAccount) {
      return res.status(400).json({ error: 'Linked account is invalid or not owned by user' });
    }

    const isPaid = typeof req.body.isPaid === 'boolean' ? req.body.isPaid : false;
    const numAmount = Math.round(Number(amount) || 0);

    const [tx] = await db.insert(s.transactions).values({
      userId,
      monthId: month.id,
      name: name.trim(),
      status: isPaid ? 'successful' : 'planned',
      origin: 'planned',
      amount: numAmount,
      date: itemDate,
      plannedAmount: numAmount,
      plannedDate: itemDate,
      category: ((req.body.category || req.body.tag) ? String(req.body.category || req.body.tag).trim() : 'General'),
      note: req.body.note ? String(req.body.note).trim() : '',
      isIncome: typeof req.body.isIncome === 'boolean' ? req.body.isIncome : false,
      recurrence: resolvedType === 'recurring' ? 'monthly' : null,
      accountId: resolvedAccountId
    }).returning();

    return res.success(serialize({
      ...tx,
      type: resolvedType,
      isPaid: tx.status === 'successful',
      isFixed: typeof req.body.isFixed === 'boolean' ? req.body.isFixed : false,
      priority: typeof priority === 'number' ? priority : 0
    }), 201);
  } catch (err) {
    console.error('Create item error:', err);
    return res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update item (updates unified transaction or legacy item)
itemsRouter.put('/items/:id', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const itemId = req.params.id;

    // Check transactions first
    const tx = await db.query.transactions.findFirst({
      where: and(
        or(eq(s.transactions.id, itemId), eq(s.transactions.legacyItemId, itemId)),
        eq(s.transactions.userId, userId)
      )
    });

    if (tx) {
      const { name, amount, date, day, dayOfMonth } = req.body;
      const updates = { updatedAt: new Date() };
      if (name) updates.name = name.trim();
      if (typeof amount === 'number') {
        updates.amount = Math.round(amount);
        updates.plannedAmount = Math.round(amount);
      }
      if (typeof date === 'string' && date.trim()) {
        updates.date = date.trim();
        updates.plannedDate = date.trim();
      }
      if (typeof req.body.isPaid === 'boolean') {
        updates.status = req.body.isPaid ? 'successful' : 'planned';
      }
      const incomingAccountId = req.body.accountId || req.body.bankAccountId || req.body.walletId;
      if (incomingAccountId) {
        updates.accountId = incomingAccountId;
      }
      const [updatedTx] = await db.update(s.transactions)
        .set(updates)
        .where(eq(s.transactions.id, tx.id))
        .returning();
      return res.success(serialize({
        ...updatedTx,
        isPaid: updatedTx.status === 'successful'
      }));
    }

    const item = await db.query.items.findFirst({
      where: and(eq(s.items.id, itemId), eq(s.items.userId, userId))
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const { name, priority, amount, day, dayOfMonth, date, isFixed } = req.body;
    const updates = { updatedAt: new Date() };

    if (name) updates.name = name.trim();
    if (req.body.category !== undefined) {
      updates.category = String(req.body.category).trim() || 'General';
    }
    if (typeof req.body.isIncome === 'boolean') updates.isIncome = req.body.isIncome;
    if (typeof isFixed === 'boolean') updates.isFixed = isFixed;
    if (typeof amount === 'number') updates.amount = Math.round(amount);

    if (typeof date === 'string' && date.trim()) {
      updates.date = date.trim();
    }
    if (typeof req.body.isPaid === 'boolean') {
      updates.isPaid = req.body.isPaid;
    }

    const incomingAccountId = req.body.accountId || req.body.bankAccountId || req.body.walletId;
    if (incomingAccountId) {
      updates.accountId = incomingAccountId;
    }

    const [updatedItem] = await db.update(s.items)
      .set(updates)
      .where(eq(s.items.id, itemId))
      .returning();

    return res.success(serialize(updatedItem));
  } catch (err) {
    console.error('Update item error:', err);
    return res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete item
itemsRouter.delete('/items/:id', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const itemId = req.params.id;

    const result = await BudgetExecution.deleteTransaction(userId, itemId);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});
