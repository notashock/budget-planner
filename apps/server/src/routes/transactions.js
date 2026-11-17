import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { BudgetExecution } from '../domain/budgetExecution.js';
import { GeminiAssistantAdapter } from '../ai/geminiAdapter.js';
import { config } from '../config.js';
import { ValidationError } from '../utils/errors.js';
import { route, yearMonth } from './routeHelpers.js';

export const transactionsRouter = express.Router();
transactionsRouter.use(requireAuth);

/**
 * Transaction handlers, mounted here under /api and under /api/v1
 * (/transactions, /periods/:year/:month/transactions, /reports), so both
 * surfaces run the same code.
 */
export const transactionHandlers = {
  // Global / period-free list and create
  list: route(async (req, res) => res.success(await BudgetExecution.listAllTransactions(req.userId, req.query))),
  create: route(async (req, res) => res.success(await BudgetExecution.recordGlobalTransaction(req.userId, req.body), 201)),

  listForMonth: route(async (req, res) => res.success(await BudgetExecution.listTransactions(req.userId, ...yearMonth(req), req.query))),
  createForMonth: route(async (req, res) => res.success(await BudgetExecution.recordTransaction(req.userId, ...yearMonth(req), req.body), 201)),

  // One-tap mark as paid with actual confirmation
  pay: route(async (req, res) => res.success(await BudgetExecution.markTransactionPaid(req.userId, req.params.id, req.body))),
  // Cancel a planned transaction (with goal prompt action)
  cancel: route(async (req, res) => res.success(await BudgetExecution.cancelTransaction(req.userId, req.params.id, req.body))),
  update: route(async (req, res) => res.success(await BudgetExecution.updateTransaction(req.userId, req.params.id, req.body))),
  remove: route(async (req, res) => res.success(await BudgetExecution.deleteTransaction(req.userId, req.params.id))),

  monthEndReview: route(async (req, res) => res.success(
    await BudgetExecution.getMonthEndReview(req.userId, ...yearMonth(req), { accountId: req.query.accountId })
  )),

  // Irregular income analytics: trailing 12M, smoothed income, runway, quarters, years
  irregularReports: route(async (req, res) => res.success(await BudgetExecution.getIrregularReports(req.userId, req.query))),

  // Gemini AI transaction note classification
  classify: route(async (req, res) => {
    const { note } = req.body;
    if (!note || typeof note !== 'string') {
      throw new ValidationError('Transaction note string is required');
    }
    const adapter = new GeminiAssistantAdapter(config.geminiApiKey);
    return res.success({ category: await adapter.classifyExpenseNote(note) });
  })
};

transactionsRouter.get('/transactions', transactionHandlers.list);
transactionsRouter.post('/transactions', transactionHandlers.create);
transactionsRouter.post('/transactions/classify', transactionHandlers.classify);
transactionsRouter.get('/reports/irregular', transactionHandlers.irregularReports);
transactionsRouter.get('/months/:year/:month/transactions', transactionHandlers.listForMonth);
transactionsRouter.post('/months/:year/:month/transactions', transactionHandlers.createForMonth);
transactionsRouter.get('/months/:year/:month/month-end-review', transactionHandlers.monthEndReview);
transactionsRouter.patch('/transactions/:id/pay', transactionHandlers.pay);
transactionsRouter.patch('/transactions/:id/cancel', transactionHandlers.cancel);
transactionsRouter.put('/transactions/:id', transactionHandlers.update);
transactionsRouter.delete('/transactions/:id', transactionHandlers.remove);
