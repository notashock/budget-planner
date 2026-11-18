import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { AccountService } from '../../domain/accountService.js';
import { TransferService } from '../../domain/transferService.js';
import { migrationStatusHandler, migrateHandler } from '../bankAccounts.js';

export const v1AccountsRouter = express.Router();
v1AccountsRouter.use(requireAuth);

const ACCOUNT_TYPES = ['bank', 'wallet', 'cash', 'credit_card'];

// GET /api/v1/accounts?type=bank|wallet|cash&includeArchived=true
// Without `type` this lists every account (legacy /api/bank-accounts/all).
v1AccountsRouter.get('/', async (req, res, next) => {
  try {
    const type = ACCOUNT_TYPES.includes(req.query.type) ? req.query.type : null;
    const includeArchived = req.query.includeArchived === 'true';
    return res.success(await AccountService.listAccounts(req.userId, { type, includeArchived }));
  } catch (err) {
    next(err);
  }
});

// Legacy single-account migration (same handlers as /api/bank-accounts)
v1AccountsRouter.get('/migration-status', migrationStatusHandler);
v1AccountsRouter.post('/migrate', migrateHandler);

// POST /api/v1/accounts - Create a bank, wallet or cash account (`type`, default bank)
v1AccountsRouter.post('/', async (req, res, next) => {
  try {
    const nameLabel = req.body?.type === 'wallet' ? 'Wallet' : (req.body?.type === 'credit_card' ? 'Card' : 'Account');
    const account = await AccountService.createAccount(req.userId, req.body, { defaultType: 'bank', nameLabel });
    return res.success(account, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/accounts/transfers - Inter-account transfer; returns { transfer, transaction }
v1AccountsRouter.post('/transfers', async (req, res, next) => {
  try {
    return res.success(await TransferService.createTransfer(req.userId, req.body), 201);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/accounts/:id - Update any account the user owns
v1AccountsRouter.patch('/:id', async (req, res, next) => {
  try {
    return res.success(await AccountService.updateAccount(req.userId, req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/accounts/:id - Soft-archive; returns the archived account
v1AccountsRouter.delete('/:id', async (req, res, next) => {
  try {
    return res.success(await AccountService.archiveAccount(req.userId, req.params.id));
  } catch (err) {
    next(err);
  }
});
