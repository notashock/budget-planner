import express from 'express';
import { BankAccount } from '../models/BankAccount.js';
import { requireAuth } from '../middleware/auth.js';
import { getMigrationStatus, executeMigration, backfillUnassignedTransactions } from '../services/accountMigration.js';

export const bankAccountsRouter = express.Router();
bankAccountsRouter.use(requireAuth);

// Check migration eligibility and get legacy stats
bankAccountsRouter.get('/migration-status', async (req, res) => {
  try {
    const result = await getMigrationStatus(req.session.userId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve migration status' });
  }
});

// User-consented primary bank account data migration
bankAccountsRouter.post('/migrate', async (req, res) => {
  try {
    const { name, institution, accountType, accountNumberLast4, accountNumberMasked, minimumBalance } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Account name is required' });
    }

    const result = await executeMigration(req.session.userId, {
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
    const userId = req.session.userId;
    const query = { userId };
    if (req.query.includeArchived !== 'true') {
      query.isArchived = { $ne: true };
    }
    const accounts = await BankAccount.find(query).sort({ isPrimary: -1, createdAt: 1 });
    return res.json(accounts);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

// Helper to safely parse currency integer amounts (handling formatted strings, commas, or numbers)
function parseCurrencyInt(val) {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  const clean = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = Number(clean);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

// Create a new bank account
bankAccountsRouter.post('/', async (req, res) => {
  try {
    const {
      name,
      institution,
      accountType,
      accountNumberMasked,
      openingBalance,
      minimumBalance,
      isPrimary,
      color
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Account name is required' });
    }

    const isPrimaryBool = Boolean(isPrimary);
    if (isPrimaryBool) {
      await BankAccount.updateMany(
        { userId: req.session.userId },
        { $set: { isPrimary: false } }
      );
    }

    const parsedOpening = parseCurrencyInt(openingBalance) ?? 0;
    const parsedMin = parseCurrencyInt(minimumBalance) ?? 0;

    const bankAccount = await BankAccount.create({
      userId: req.session.userId,
      name: name.trim(),
      institution: typeof institution === 'string' ? institution.trim() : '',
      accountType: ['checking', 'savings', 'salary', 'other'].includes(accountType) ? accountType : 'checking',
      accountNumberMasked: typeof accountNumberMasked === 'string' ? accountNumberMasked.trim() : '',
      openingBalance: parsedOpening,
      minimumBalance: parsedMin,
      isPrimary: isPrimaryBool,
      color: typeof color === 'string' && color.trim() ? color.trim() : '#09090b'
    });

    const totalBanks = await BankAccount.countDocuments({ userId: req.session.userId, isArchived: { $ne: true } });
    if (isPrimaryBool || totalBanks === 1) {
      if (totalBanks === 1 && !isPrimaryBool) {
        bankAccount.isPrimary = true;
        await bankAccount.save();
      }
      try {
        await backfillUnassignedTransactions(req.session.userId, bankAccount);
      } catch (backfillErr) {
        console.error('Failed to backfill transactions on bank account creation:', backfillErr);
      }
    }

    return res.status(201).json(bankAccount);
  } catch (err) {
    console.error('Failed to create bank account:', err);
    return res.status(500).json({ error: err.message || 'Failed to create bank account' });
  }
});

// Update bank account
bankAccountsRouter.put('/:id', async (req, res) => {
  try {
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

    const bankId = req.params.id;
    if (!bankId || bankId === 'undefined' || bankId === 'null') {
      return res.status(400).json({ error: 'Invalid bank account ID' });
    }

    const account = await BankAccount.findOne({
      _id: bankId,
      userId: req.session.userId
    });

    if (!account) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    if (isPrimary === true) {
      await BankAccount.updateMany(
        { userId: req.session.userId, _id: { $ne: account._id } },
        { $set: { isPrimary: false } }
      );
      account.isPrimary = true;
    } else if (isPrimary === false) {
      account.isPrimary = false;
    }

    if (typeof name === 'string' && name.trim()) account.name = name.trim();
    if (typeof institution === 'string') account.institution = institution.trim();
    if (['checking', 'savings', 'salary', 'other'].includes(accountType)) account.accountType = accountType;
    if (typeof accountNumberMasked === 'string') account.accountNumberMasked = accountNumberMasked.trim();

    const parsedOpening = parseCurrencyInt(openingBalance);
    if (parsedOpening !== undefined) account.openingBalance = parsedOpening;

    const parsedMin = parseCurrencyInt(minimumBalance);
    if (parsedMin !== undefined) account.minimumBalance = parsedMin;

    if (typeof isArchived === 'boolean') {
      account.isArchived = isArchived;
      if (isArchived) account.isPrimary = false;
    }
    if (typeof color === 'string' && color.trim()) account.color = color.trim();

    await account.save();
    return res.json(account);
  } catch (err) {
    console.error('Failed to update bank account:', err);
    return res.status(500).json({ error: err.message || 'Failed to update bank account' });
  }
});

// Soft-archive a bank account
bankAccountsRouter.delete('/:id', async (req, res) => {
  try {
    const account = await BankAccount.findOne({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!account) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    account.isArchived = true;
    account.isPrimary = false;
    await account.save();

    return res.json({ message: 'Bank account archived successfully', account });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to archive bank account' });
  }
});
