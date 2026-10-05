import express from 'express';
import { Transfer } from '../models/Transfer.js';
import { Month } from '../models/Month.js';
import { requireAuth } from '../middleware/auth.js';

export const transfersRouter = express.Router();
transfersRouter.use(requireAuth);

// List transfers for a month or user
transfersRouter.get('/', async (req, res) => {
  try {
    const filter = { userId: req.session.userId };
    if (req.query.monthId) {
      filter.monthId = req.query.monthId;
    }
    const transfers = await Transfer.find(filter).sort({ date: 1, createdAt: 1 });
    return res.json(transfers);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// Create a Paired Account Transfer
transfersRouter.post('/', async (req, res) => {
  try {
    const {
      monthId,
      date,
      amount,
      sourceType,
      sourceBankAccountId,
      sourceWalletId,
      destinationType,
      destinationBankAccountId,
      destinationWalletId,
      note
    } = req.body;

    if (!monthId || !date || !amount || typeof Number(amount) !== 'number' || Number(amount) <= 0) {
      return res.status(400).json({ error: 'monthId, valid date, and positive amount are required' });
    }

    if (!['bank', 'wallet'].includes(sourceType) || !['bank', 'wallet'].includes(destinationType)) {
      return res.status(400).json({ error: 'Valid sourceType and destinationType are required' });
    }

    // Verify source and destination are not identical
    const isSameSourceDest = sourceType === destinationType && (
      (sourceType === 'bank' && String(sourceBankAccountId) === String(destinationBankAccountId)) ||
      (sourceType === 'wallet' && String(sourceWalletId) === String(destinationWalletId))
    );

    if (isSameSourceDest) {
      return res.status(400).json({ error: 'Source and destination accounts must be different' });
    }

    const month = await Month.findOne({
      _id: monthId,
      userId: req.session.userId
    });

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    const transfer = await Transfer.create({
      userId: req.session.userId,
      monthId: month._id,
      date,
      amount: Math.round(Number(amount)),
      sourceType,
      sourceBankAccountId: sourceType === 'bank' ? sourceBankAccountId : null,
      sourceWalletId: sourceType === 'wallet' ? sourceWalletId : null,
      destinationType,
      destinationBankAccountId: destinationType === 'bank' ? destinationBankAccountId : null,
      destinationWalletId: destinationType === 'wallet' ? destinationWalletId : null,
      note: typeof note === 'string' ? note.trim() : ''
    });

    return res.status(201).json(transfer);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create transfer' });
  }
});

// Delete a transfer
transfersRouter.delete('/:id', async (req, res) => {
  try {
    const transfer = await Transfer.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    return res.json({ message: 'Transfer deleted successfully', transfer });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete transfer' });
  }
});
