import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { BudgetExecution } from '../../domain/budgetExecution.js';

export const v1TransactionsRouter = express.Router();
v1TransactionsRouter.use(requireAuth);

// GET /api/v1/transactions - List transactions
v1TransactionsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const transactions = await BudgetExecution.listAllTransactions(userId, req.query);
    return res.success(transactions);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/transactions - Record new transaction
v1TransactionsRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const tx = await BudgetExecution.recordGlobalTransaction(userId, req.body);
    return res.success(tx, 201);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/transactions/:id - Update transaction
v1TransactionsRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const tx = await BudgetExecution.updateTransaction(userId, req.params.id, req.body);
    return res.success(tx);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/transactions/:id/pay - Mark transaction paid
v1TransactionsRouter.post('/:id/pay', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const result = await BudgetExecution.markTransactionPaid(userId, req.params.id, req.body);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/transactions/:id - Delete transaction
v1TransactionsRouter.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const result = await BudgetExecution.deleteTransaction(userId, req.params.id);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});
