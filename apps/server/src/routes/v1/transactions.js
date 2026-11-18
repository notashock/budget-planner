import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { transactionHandlers } from '../transactions.js';
import { PersonFundService } from '../../domain/personFundService.js';
import { route } from '../routeHelpers.js';

// Handlers are shared with the legacy /api/transactions routes.
export const v1TransactionsRouter = express.Router();
v1TransactionsRouter.use(requireAuth);

v1TransactionsRouter.get('/', transactionHandlers.list);
v1TransactionsRouter.post('/', transactionHandlers.create);
v1TransactionsRouter.post('/classify', transactionHandlers.classify);
v1TransactionsRouter.patch('/:id', transactionHandlers.update);
v1TransactionsRouter.delete('/:id', transactionHandlers.remove);
v1TransactionsRouter.post('/:id/pay', transactionHandlers.pay);
v1TransactionsRouter.post('/:id/cancel', transactionHandlers.cancel);
// Turn an income/expense logged the old way into held or lent money
v1TransactionsRouter.post('/:id/reclassify', route(async (req, res) => (
  res.success(await PersonFundService.reclassifyTransaction(req.userId, req.params.id, req.body))
)));
