import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getMigrationStatus, executeMigration } from '../services/accountMigration.js';
import { AccountService } from '../domain/accountService.js';

export const bankAccountsRouter = express.Router();
bankAccountsRouter.use(requireAuth);

// Check migration eligibility and get legacy stats (also mounted on /api/v1/accounts)
export async function migrationStatusHandler(req, res) {
  try {
    const userId = req.userId;
    const result = await getMigrationStatus(userId);
    return res.json(result);
  } catch (err) {
    console.error('Migration status error:', err);
    return res.status(500).json({ error: 'Failed to retrieve migration status' });
  }
}

// User-consented primary bank account data migration (also mounted on /api/v1/accounts)
export async function migrateHandler(req, res) {
  try {
    const userId = req.userId;
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
}

bankAccountsRouter.get('/migration-status', migrationStatusHandler);
bankAccountsRouter.post('/migrate', migrateHandler);

// List all bank accounts
bankAccountsRouter.get('/', async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    return res.json(await AccountService.listAccounts(req.userId, { type: 'bank', includeArchived }));
  } catch (err) {
    next(err);
  }
});

// List all accounts of any type (bank, cash, wallet)
bankAccountsRouter.get('/all', async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    return res.json(await AccountService.listAccounts(req.userId, { includeArchived }));
  } catch (err) {
    next(err);
  }
});

// Create a new bank account (or cash / wallet when `type` says so)
bankAccountsRouter.post('/', async (req, res, next) => {
  try {
    const account = await AccountService.createAccount(req.userId, req.body, { defaultType: 'bank' });
    return res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

// Update bank account
bankAccountsRouter.put('/:id', async (req, res, next) => {
  try {
    const account = await AccountService.updateAccount(req.userId, req.params.id, req.body);
    return res.json(account);
  } catch (err) {
    next(err);
  }
});

// Soft-archive a bank account
bankAccountsRouter.delete('/:id', async (req, res, next) => {
  try {
    const account = await AccountService.archiveAccount(req.userId, req.params.id, {
      expectedType: 'bank',
      notFoundMessage: 'Bank account not found'
    });
    return res.json({ message: 'Bank account archived successfully', account });
  } catch (err) {
    next(err);
  }
});
