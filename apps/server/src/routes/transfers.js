import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { TransferService } from '../domain/transferService.js';

export const transfersRouter = express.Router();
transfersRouter.use(requireAuth);

// List transfers for a month or user
transfersRouter.get('/', async (req, res, next) => {
  try {
    return res.json(await TransferService.listTransfers(req.userId, { monthId: req.query.monthId }));
  } catch (err) {
    next(err);
  }
});

// Create a Paired Account Transfer
transfersRouter.post('/', async (req, res, next) => {
  try {
    const { transfer } = await TransferService.createTransfer(req.userId, req.body);
    return res.status(201).json(transfer);
  } catch (err) {
    next(err);
  }
});

// Update a transfer
transfersRouter.put('/:id', async (req, res, next) => {
  try {
    return res.json(await TransferService.updateTransfer(req.userId, req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

// Delete a transfer
transfersRouter.delete('/:id', async (req, res, next) => {
  try {
    const transfer = await TransferService.deleteTransfer(req.userId, req.params.id);
    return res.json({ message: 'Transfer deleted successfully', transfer });
  } catch (err) {
    next(err);
  }
});
