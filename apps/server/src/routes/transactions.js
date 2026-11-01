import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { BudgetExecution } from '../domain/budgetExecution.js';
import { GeminiAssistantAdapter } from '../ai/geminiAdapter.js';
import { config } from '../config.js';
import { ValidationError } from '../utils/errors.js';

export const transactionsRouter = express.Router();
transactionsRouter.use(requireAuth);

// GET /api/transactions (Global / Period-Free Transactions List)
transactionsRouter.get('/transactions', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const transactions = await BudgetExecution.listAllTransactions(userId, req.query);
    return res.success(transactions);
  } catch (err) {
    next(err);
  }
});

// POST /api/transactions (Global / Period-Free Transaction Creation)
transactionsRouter.post('/transactions', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const transaction = await BudgetExecution.recordGlobalTransaction(userId, req.body);
    return res.success(transaction, 201);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/irregular (Irregular income analytics: trailing 12M, smoothed income, runway, quarters, years)
transactionsRouter.get('/reports/irregular', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const reports = await BudgetExecution.getIrregularReports(userId, req.query);
    return res.success(reports);
  } catch (err) {
    next(err);
  }
});

// GET /api/months/:year/:month/transactions
transactionsRouter.get('/months/:year/:month/transactions', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const transactions = await BudgetExecution.listTransactions(userId, year, monthNum, req.query);
    return res.success(transactions);
  } catch (err) {
    next(err);
  }
});

// POST /api/months/:year/:month/transactions
transactionsRouter.post('/months/:year/:month/transactions', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const transaction = await BudgetExecution.recordTransaction(userId, year, monthNum, req.body);
    return res.success(transaction, 201);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/transactions/:id/pay (One-tap Mark as Paid with actual confirmation)
transactionsRouter.patch('/transactions/:id/pay', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const txId = req.params.id;
    const result = await BudgetExecution.markTransactionPaid(userId, txId, req.body);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/transactions/:id/cancel (Cancel planned transaction with goal prompt action)
transactionsRouter.patch('/transactions/:id/cancel', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const txId = req.params.id;
    const result = await BudgetExecution.cancelTransaction(userId, txId, req.body);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/transactions/:id
transactionsRouter.put('/transactions/:id', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const txId = req.params.id;
    const result = await BudgetExecution.updateTransaction(userId, txId, req.body);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/transactions/:id
transactionsRouter.delete('/transactions/:id', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const txId = req.params.id;
    const result = await BudgetExecution.deleteTransaction(userId, txId);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/months/:year/:month/month-end-review
transactionsRouter.get('/months/:year/:month/month-end-review', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const review = await BudgetExecution.getMonthEndReview(userId, year, monthNum, {
      accountId: req.query.accountId
    });
    return res.success(review);
  } catch (err) {
    next(err);
  }
});

// POST /api/transactions/classify (Gemini AI transaction note classification)
transactionsRouter.post('/transactions/classify', async (req, res, next) => {
  try {
    const { note } = req.body;
    if (!note || typeof note !== 'string') {
      throw new ValidationError('Transaction note string is required');
    }
    const adapter = new GeminiAssistantAdapter(config.geminiApiKey);
    const category = await adapter.classifyExpenseNote(note);
    return res.success({ category });
  } catch (err) {
    next(err);
  }
});
