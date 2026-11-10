import express from 'express';
import { eq, and, desc, asc, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { getMigrationStatus, executeMigration, backfillUnassignedTransactions } from '../services/accountMigration.js';
import { serialize } from '../utils/serializer.js';

export const bankAccountsRouter = express.Router();
bankAccountsRouter.use(requireAuth);

function parseCurrencyInt(val) {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  const clean = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = Number(clean);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

// Check migration eligibility and get legacy stats
bankAccountsRouter.get('/migration-status', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const result = await getMigrationStatus(userId);
    return res.json(result);
  } catch (err) {
    console.error('Migration status error:', err);
    return res.status(500).json({ error: 'Failed to retrieve migration status' });
  }
});

// User-consented primary bank account data migration
bankAccountsRouter.post('/migrate', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const { name, institution, accountType, accountNumberLast4, accountNumberMasked, minimumBalance } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Account name is required' });
    }

    const result = await executeMigration(userId, {
      name: name.trim(),
      institution: typeof institution === 'string' ? institution.trim() : '',
      accountType,
      accountNumberLast4,
      accountNumberMasked,
      minimumBalance: typeof minimumBalance === 'number' ? minimumBalance : 0
    });

    return res.status(201).json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Migration failed' });
  }
});

// List all bank accounts
bankAccountsRouter.get('/', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const conditions = [
      eq(s.accounts.userId, userId),
      eq(s.accounts.type, 'bank')
    ];
    if (req.query.includeArchived !== 'true') {
      conditions.push(eq(s.accounts.isArchived, false));
    }

    const bankList = await db.query.accounts.findMany({
      where: and(...conditions),
      orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
    });

    return res.json(serialize(bankList));
  } catch (err) {
    console.error('Fetch bank accounts error:', err);
    return res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

// List all accounts of any type (bank, cash, wallet)
bankAccountsRouter.get('/all', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const conditions = [eq(s.accounts.userId, userId)];
    if (req.query.includeArchived !== 'true') {
      conditions.push(eq(s.accounts.isArchived, false));
    }

    const allList = await db.query.accounts.findMany({
      where: and(...conditions),
      orderBy: [desc(s.accounts.isPrimary), asc(s.accounts.createdAt)]
    });

    return res.json(serialize(allList));
  } catch (err) {
    console.error('Fetch all accounts error:', err);
    return res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Create a new bank account
bankAccountsRouter.post('/', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const {
      name,
      type,
      institution,
      accountType,
      accountNumberMasked,
      openingBalance,
      openingBalanceDate,
      minimumBalance,
      isPrimary,
      color
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Account name is required' });
    }

    const resolvedType = type === 'cash' || accountType === 'cash' ? 'cash' : (type === 'wallet' ? 'wallet' : 'bank');

    const isPrimaryBool = Boolean(isPrimary);
    if (isPrimaryBool) {
      await db.update(s.accounts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(s.accounts.userId, userId), eq(s.accounts.type, resolvedType)));
    }

    const parsedOpening = parseCurrencyInt(openingBalance) ?? 0;
    const parsedMin = parseCurrencyInt(minimumBalance) ?? 0;

    const [bankAccount] = await db.insert(s.accounts).values({
      userId,
      name: name.trim(),
      type: resolvedType,
      subtype: ['checking', 'savings', 'salary', 'cash', 'other'].includes(accountType) ? accountType : (resolvedType === 'cash' ? 'cash' : 'checking'),
      institution: typeof institution === 'string' ? institution.trim() : '',
      accountNumberMasked: typeof accountNumberMasked === 'string' ? accountNumberMasked.trim() : '',
      openingBalance: parsedOpening,
      openingBalanceDate: typeof openingBalanceDate === 'string' && openingBalanceDate.trim() ? openingBalanceDate.trim() : null,
      minimumBalance: parsedMin,
      isPrimary: isPrimaryBool,
      color: typeof color === 'string' && color.trim() ? color.trim() : '#09090b'
    }).returning();

    const [{ count: totalBanks }] = await db
      .select({ count: count() })
      .from(s.accounts)
      .where(and(eq(s.accounts.userId, userId), eq(s.accounts.type, 'bank'), eq(s.accounts.isArchived, false)));

    let finalAccount = bankAccount;
    if (isPrimaryBool || Number(totalBanks) === 1) {
      if (Number(totalBanks) === 1 && !isPrimaryBool) {
        const [updated] = await db.update(s.accounts)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(s.accounts.id, bankAccount.id))
          .returning();
        finalAccount = updated;
      }
      try {
        await backfillUnassignedTransactions(userId, finalAccount);
      } catch (backfillErr) {
        console.error('Failed to backfill transactions on bank account creation:', backfillErr);
      }
    }

    return res.status(201).json(serialize(finalAccount));
  } catch (err) {
    console.error('Failed to create bank account:', err);
    return res.status(500).json({ error: err.message || 'Failed to create bank account' });
  }
});

// Update bank account
bankAccountsRouter.put('/:id', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const bankId = req.params.id;
    if (!bankId || bankId === 'undefined' || bankId === 'null') {
      return res.status(400).json({ error: 'Invalid bank account ID' });
    }

    const account = await db.query.accounts.findFirst({
      where: and(
        eq(s.accounts.id, bankId),
        eq(s.accounts.userId, userId)
      )
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const {
      name,
      institution,
      accountType,
      accountNumberMasked,
      openingBalance,
      minimumBalance,
      isPrimary,
      isArchived,
      color
    } = req.body;

    const updates = { updatedAt: new Date() };

    if (isPrimary === true) {
      await db.update(s.accounts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(s.accounts.userId, userId), eq(s.accounts.type, 'bank')));
      updates.isPrimary = true;
    } else if (isPrimary === false) {
      updates.isPrimary = false;
    }

    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (typeof institution === 'string') updates.institution = institution.trim();
    if (['checking', 'savings', 'salary', 'other'].includes(accountType)) updates.subtype = accountType;
    if (typeof accountNumberMasked === 'string') updates.accountNumberMasked = accountNumberMasked.trim();

    const parsedOpening = parseCurrencyInt(openingBalance);
    if (parsedOpening !== undefined) updates.openingBalance = parsedOpening;

    const parsedMin = parseCurrencyInt(minimumBalance);
    if (parsedMin !== undefined) updates.minimumBalance = parsedMin;

    if (typeof isArchived === 'boolean') {
      updates.isArchived = isArchived;
      if (isArchived) updates.isPrimary = false;
    }
    if (typeof color === 'string' && color.trim()) updates.color = color.trim();

    const [updated] = await db.update(s.accounts)
      .set(updates)
      .where(eq(s.accounts.id, bankId))
      .returning();

    if (parsedOpening !== undefined) {
      const activeMonth = await db.query.months.findFirst({
        where: and(eq(s.months.userId, userId), eq(s.months.isClosed, false)),
        orderBy: [desc(s.months.year), desc(s.months.month)]
      });
      if (activeMonth) {
        const existingOpening = await db.query.monthAccountOpenings.findFirst({
          where: and(eq(s.monthAccountOpenings.monthId, activeMonth.id), eq(s.monthAccountOpenings.accountId, bankId))
        });
        if (existingOpening) {
          await db.update(s.monthAccountOpenings).set({ amount: parsedOpening }).where(eq(s.monthAccountOpenings.id, existingOpening.id));
        } else {
          await db.insert(s.monthAccountOpenings).values({ monthId: activeMonth.id, accountId: bankId, amount: parsedOpening });
        }
      }
    }

    return res.json(serialize(updated));
  } catch (err) {
    console.error('Failed to update bank account:', err);
    return res.status(500).json({ error: err.message || 'Failed to update bank account' });
  }
});

// Soft-archive a bank account
bankAccountsRouter.delete('/:id', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const bankId = req.params.id;

    const account = await db.query.accounts.findFirst({
      where: and(
        eq(s.accounts.id, bankId),
        eq(s.accounts.userId, userId),
        eq(s.accounts.type, 'bank')
      )
    });

    if (!account) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    const [updated] = await db.update(s.accounts)
      .set({ isArchived: true, isPrimary: false, updatedAt: new Date() })
      .where(eq(s.accounts.id, bankId))
      .returning();

    return res.json({ message: 'Bank account archived successfully', account: serialize(updated) });
  } catch (err) {
    console.error('Failed to archive bank account:', err);
    return res.status(500).json({ error: 'Failed to archive bank account' });
  }
});
