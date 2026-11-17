import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { TransferService } from '../../domain/transferService.js';

export const v1TransfersRouter = express.Router();
v1TransfersRouter.use(requireAuth);

// GET /api/v1/transfers?monthId=
v1TransfersRouter.get('/', async (req, res, next) => {
  try {
    return res.success(await TransferService.listTransfers(req.userId, { monthId: req.query.monthId }));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/transfers - returns the transfer (same as legacy /api/transfers)
v1TransfersRouter.post('/', async (req, res, next) => {
  try {
    const { transfer } = await TransferService.createTransfer(req.userId, req.body);
    return res.success(transfer, 201);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/transfers/:id
v1TransfersRouter.patch('/:id', async (req, res, next) => {
  try {
    return res.success(await TransferService.updateTransfer(req.userId, req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/transfers/:id - returns the deleted transfer
v1TransfersRouter.delete('/:id', async (req, res, next) => {
  try {
    return res.success(await TransferService.deleteTransfer(req.userId, req.params.id));
  } catch (err) {
    next(err);
  }
});
