import express from 'express';
import { Wallet } from '../models/Wallet.js';
import { requireAuth } from '../middleware/auth.js';

export const walletsRouter = express.Router();
walletsRouter.use(requireAuth);

// List all wallets
walletsRouter.get('/', async (req, res) => {
  try {
    const query = { userId: req.session.userId };
    if (req.query.includeArchived !== 'true') {
      query.isArchived = { $ne: true };
    }
    const wallets = await Wallet.find(query).sort({ isPrimary: -1, createdAt: 1 });
    return res.json(wallets);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch wallets' });
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

// Create a new wallet
walletsRouter.post('/', async (req, res) => {
  try {
    const {
      name,
      walletType,
      openingBalance,
      minimumBalance,
      isPrimary
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Wallet name is required' });
    }

    const isPrimaryBool = Boolean(isPrimary);
    if (isPrimaryBool) {
      await Wallet.updateMany(
        { userId: req.session.userId },
        { $set: { isPrimary: false } }
      );
    }

    const parsedOpening = parseCurrencyInt(openingBalance) ?? 0;
    const parsedMin = parseCurrencyInt(minimumBalance) ?? 0;

    const wallet = await Wallet.create({
      userId: req.session.userId,
      name: name.trim(),
      walletType: ['cash', 'digital', 'other'].includes(walletType) ? walletType : 'cash',
      openingBalance: parsedOpening,
      minimumBalance: parsedMin,
      isPrimary: isPrimaryBool
    });

    return res.status(201).json(wallet);
  } catch (err) {
    console.error('Failed to create wallet:', err);
    return res.status(500).json({ error: err.message || 'Failed to create wallet' });
  }
});

// Update a wallet
walletsRouter.put('/:id', async (req, res) => {
  try {
    const {
      name,
      walletType,
      openingBalance,
      minimumBalance,
      isPrimary,
      isArchived
    } = req.body;

    const walletId = req.params.id;
    if (!walletId || walletId === 'undefined' || walletId === 'null') {
      return res.status(400).json({ error: 'Invalid wallet ID' });
    }

    const wallet = await Wallet.findOne({
      _id: walletId,
      userId: req.session.userId
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (isPrimary === true) {
      await Wallet.updateMany(
        { userId: req.session.userId, _id: { $ne: wallet._id } },
        { $set: { isPrimary: false } }
      );
      wallet.isPrimary = true;
    } else if (isPrimary === false) {
      wallet.isPrimary = false;
    }

    if (typeof name === 'string' && name.trim()) wallet.name = name.trim();
    if (['cash', 'digital', 'other'].includes(walletType)) wallet.walletType = walletType;

    const parsedOpening = parseCurrencyInt(openingBalance);
    if (parsedOpening !== undefined) wallet.openingBalance = parsedOpening;

    const parsedMin = parseCurrencyInt(minimumBalance);
    if (parsedMin !== undefined) wallet.minimumBalance = parsedMin;

    if (typeof isArchived === 'boolean') {
      wallet.isArchived = isArchived;
      if (isArchived) wallet.isPrimary = false;
    }

    await wallet.save();
    return res.json(wallet);
  } catch (err) {
    console.error('Failed to update wallet:', err);
    return res.status(500).json({ error: err.message || 'Failed to update wallet' });
  }
});

// Soft-archive a wallet
walletsRouter.delete('/:id', async (req, res) => {
  try {
    const wallet = await Wallet.findOne({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    wallet.isArchived = true;
    wallet.isPrimary = false;
    await wallet.save();

    return res.json({ message: 'Wallet archived successfully', wallet });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to archive wallet' });
  }
});
