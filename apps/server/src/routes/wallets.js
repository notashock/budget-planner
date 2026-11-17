import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { AccountService } from '../domain/accountService.js';

export const walletsRouter = express.Router();
walletsRouter.use(requireAuth);

const WALLET_SCOPE = { expectedType: 'wallet', notFoundMessage: 'Wallet not found' };

// List all wallets
walletsRouter.get('/', async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    return res.json(await AccountService.listAccounts(req.userId, { type: 'wallet', includeArchived }));
  } catch (err) {
    next(err);
  }
});

// Create a new wallet
walletsRouter.post('/', async (req, res, next) => {
  try {
    const wallet = await AccountService.createAccount(
      req.userId,
      { ...req.body, type: 'wallet' },
      { defaultType: 'wallet', nameLabel: 'Wallet' }
    );
    return res.status(201).json(wallet);
  } catch (err) {
    next(err);
  }
});

// Update a wallet
walletsRouter.put('/:id', async (req, res, next) => {
  try {
    return res.json(await AccountService.updateAccount(req.userId, req.params.id, req.body, WALLET_SCOPE));
  } catch (err) {
    next(err);
  }
});

// Soft-archive a wallet
walletsRouter.delete('/:id', async (req, res, next) => {
  try {
    const wallet = await AccountService.archiveAccount(req.userId, req.params.id, WALLET_SCOPE);
    return res.json({ message: 'Wallet archived successfully', wallet });
  } catch (err) {
    next(err);
  }
});
