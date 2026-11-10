import express from 'express';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { serialize } from '../utils/serializer.js';

export const walletsRouter = express.Router();
walletsRouter.use(requireAuth);

function parseCurrencyInt(val) {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  const clean = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = Number(clean);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

// List all wallets
walletsRouter.get('/', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const conditions = [
      eq(s.accounts.userId, userId),
      eq(s.accounts.type, 'wallet')
    ];
    if (req.query.includeArchived !== 'true') {
      conditions.push(eq(s.accounts.isArchived, false));
    }

    const walletsList = await db.query.accounts.findMany({
      where: and(...conditions),
      orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
    });

    return res.json(serialize(walletsList));
  } catch (err) {
    console.error('Fetch wallets error:', err);
    return res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

// Create a new wallet
walletsRouter.post('/', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const {
      name,
      walletType,
      openingBalance,
      isPrimary,
      color
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Wallet name is required' });
    }

    const isPrimaryBool = Boolean(isPrimary);
    if (isPrimaryBool) {
      await db.update(s.accounts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(s.accounts.userId, userId), eq(s.accounts.type, 'wallet')));
    }

    const parsedOpening = parseCurrencyInt(openingBalance) ?? 0;

    const [wallet] = await db.insert(s.accounts).values({
      userId,
      name: name.trim(),
      type: 'wallet',
      subtype: ['cash', 'digital', 'other'].includes(walletType) ? walletType : 'cash',
      openingBalance: parsedOpening,
      isPrimary: isPrimaryBool,
      color: typeof color === 'string' && color.trim() ? color.trim() : '#09090b'
    }).returning();

    return res.status(201).json(serialize(wallet));
  } catch (err) {
    console.error('Failed to create wallet:', err);
    return res.status(500).json({ error: err.message || 'Failed to create wallet' });
  }
});

// Update a wallet
walletsRouter.put('/:id', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const walletId = req.params.id;
    if (!walletId || walletId === 'undefined' || walletId === 'null') {
      return res.status(400).json({ error: 'Invalid wallet ID' });
    }

    const wallet = await db.query.accounts.findFirst({
      where: and(
        eq(s.accounts.id, walletId),
        eq(s.accounts.userId, userId),
        eq(s.accounts.type, 'wallet')
      )
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const {
      name,
      walletType,
      openingBalance,
      isPrimary,
      isArchived,
      color
    } = req.body;

    const updates = { updatedAt: new Date() };

    if (isPrimary === true) {
      await db.update(s.accounts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(s.accounts.userId, userId), eq(s.accounts.type, 'wallet')));
      updates.isPrimary = true;
    } else if (isPrimary === false) {
      updates.isPrimary = false;
    }

    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (['cash', 'digital', 'other'].includes(walletType)) updates.subtype = walletType;

    const parsedOpening = parseCurrencyInt(openingBalance);
    if (parsedOpening !== undefined) updates.openingBalance = parsedOpening;

    if (typeof isArchived === 'boolean') {
      updates.isArchived = isArchived;
      if (isArchived) updates.isPrimary = false;
    }
    if (typeof color === 'string' && color.trim()) updates.color = color.trim();

    const [updated] = await db.update(s.accounts)
      .set(updates)
      .where(eq(s.accounts.id, walletId))
      .returning();

    if (parsedOpening !== undefined) {
      const activeMonth = await db.query.months.findFirst({
        where: and(eq(s.months.userId, userId), eq(s.months.isClosed, false)),
        orderBy: [desc(s.months.year), desc(s.months.month)]
      });
      if (activeMonth) {
        const existingOpening = await db.query.monthAccountOpenings.findFirst({
          where: and(eq(s.monthAccountOpenings.monthId, activeMonth.id), eq(s.monthAccountOpenings.accountId, walletId))
        });
        if (existingOpening) {
          await db.update(s.monthAccountOpenings).set({ amount: parsedOpening }).where(eq(s.monthAccountOpenings.id, existingOpening.id));
        } else {
          await db.insert(s.monthAccountOpenings).values({ monthId: activeMonth.id, accountId: walletId, amount: parsedOpening });
        }
      }
    }

    return res.json(serialize(updated));
  } catch (err) {
    console.error('Failed to update wallet:', err);
    return res.status(500).json({ error: err.message || 'Failed to update wallet' });
  }
});

// Soft-archive a wallet
walletsRouter.delete('/:id', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const walletId = req.params.id;

    const wallet = await db.query.accounts.findFirst({
      where: and(
        eq(s.accounts.id, walletId),
        eq(s.accounts.userId, userId),
        eq(s.accounts.type, 'wallet')
      )
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const [updated] = await db.update(s.accounts)
      .set({ isArchived: true, isPrimary: false, updatedAt: new Date() })
      .where(eq(s.accounts.id, walletId))
      .returning();

    return res.json({ message: 'Wallet archived successfully', wallet: serialize(updated) });
  } catch (err) {
    console.error('Failed to archive wallet:', err);
    return res.status(500).json({ error: 'Failed to archive wallet' });
  }
});
