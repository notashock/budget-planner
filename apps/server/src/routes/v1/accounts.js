import express from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import * as s from '../../db/schema.js';
import { requireAuth } from '../../middleware/auth.js';
import { LedgerService } from '../../domain/ledgerService.js';
import { serialize } from '../../utils/serializer.js';

export const v1AccountsRouter = express.Router();
v1AccountsRouter.use(requireAuth);

// GET /api/v1/accounts - List all active accounts with materialized balances
v1AccountsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const includeArchived = req.query.includeArchived === 'true';
    const accountList = await LedgerService.getAccountsWithBalances(userId, includeArchived);
    return res.success(accountList);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/accounts - Create a new account (bank, wallet, cash)
v1AccountsRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const {
      name,
      type = 'bank',
      subtype = 'checking',
      institution = '',
      accountNumberMasked = '',
      openingBalance = 0,
      minimumBalance = 0,
      isPrimary = false,
      color = '#09090b'
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Account name is required' });
    }

    const numOpening = Math.round(Number(openingBalance) || 0);
    const numMin = Math.round(Number(minimumBalance) || 0);

    const [account] = await db.insert(s.accounts).values({
      userId,
      name: name.trim(),
      type: ['bank', 'wallet', 'cash'].includes(type) ? type : 'bank',
      subtype: String(subtype || 'checking').trim(),
      institution: String(institution || '').trim(),
      accountNumberMasked: String(accountNumberMasked || '').trim(),
      openingBalance: numOpening,
      currentBalance: numOpening,
      minimumBalance: numMin,
      isPrimary: Boolean(isPrimary),
      color: String(color || '#09090b').trim()
    }).returning();

    return res.success(serialize(account), 201);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/accounts/:id - Update account details
v1AccountsRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const { id } = req.params;
    const { name, institution, minimumBalance, isPrimary, isArchived, color } = req.body;

    const existing = await db.query.accounts.findFirst({
      where: and(eq(s.accounts.id, id), eq(s.accounts.userId, userId))
    });
    if (!existing) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const updates = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name).trim();
    if (institution !== undefined) updates.institution = String(institution).trim();
    if (minimumBalance !== undefined) updates.minimumBalance = Math.round(Number(minimumBalance) || 0);
    if (isPrimary !== undefined) updates.isPrimary = Boolean(isPrimary);
    if (isArchived !== undefined) updates.isArchived = Boolean(isArchived);
    if (color !== undefined) updates.color = String(color).trim();

    const [updated] = await db.update(s.accounts)
      .set(updates)
      .where(eq(s.accounts.id, id))
      .returning();

    return res.success(serialize(updated));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/accounts/transfers - Inter-account transfer with atomic balance movement
v1AccountsRouter.post('/transfers', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const result = await LedgerService.recordTransfer(userId, req.body);
    return res.success(result, 201);
  } catch (err) {
    next(err);
  }
});
