import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { MonthLifecycle } from '../domain/monthLifecycle.js';

export const monthsRouter = express.Router();
monthsRouter.use(requireAuth);

// List all months
monthsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const months = await MonthLifecycle.listMonths(userId);
    return res.success(months);
  } catch (err) {
    next(err);
  }
});

// Create month
monthsRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const fullMonth = await MonthLifecycle.createMonth(userId, req.body);
    return res.success(fullMonth, 201);
  } catch (err) {
    next(err);
  }
});

// Get single month with dual simulations
monthsRouter.get('/:year/:month', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const snapshot = await MonthLifecycle.getMonthDetails(userId, year, monthNum);
    return res.success(snapshot);
  } catch (err) {
    next(err);
  }
});

// Update month settings / overrides
monthsRouter.put('/:year/:month', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const updated = await MonthLifecycle.updateMonth(userId, year, monthNum, req.body);
    return res.success(updated);
  } catch (err) {
    next(err);
  }
});

// Dedicated 1-click salary credit endpoint
monthsRouter.post('/:year/:month/credit-salary', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const result = await MonthLifecycle.creditSalary(userId, year, monthNum, req.body);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});

// Recommend purchase date
monthsRouter.post('/:year/:month/recommend-purchase-date', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const rawAmt = req.body.amount ?? req.body.purchaseAmount;
    const rec = await MonthLifecycle.recommendPurchaseDate(
      userId,
      year,
      monthNum,
      rawAmt,
      req.body.fundingSource,
      req.body.currentDay
    );
    return res.success(rec);
  } catch (err) {
    next(err);
  }
});

// Month rollover handlers
const handleRollover = async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const currentYear = Number(req.params.year || req.body.currentYear);
    const currentMonthNum = Number(req.params.month || req.body.currentMonthNum);
    const result = await MonthLifecycle.rolloverMonth(userId, currentYear, currentMonthNum, req.body);
    return res.success(result, 201);
  } catch (err) {
    next(err);
  }
};

monthsRouter.post('/:year/:month/rollover', handleRollover);
monthsRouter.post('/rollover', handleRollover);

// Delete month cascade
monthsRouter.delete('/:year/:month', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const result = await MonthLifecycle.deleteMonth(userId, year, monthNum, req.query.force === 'true');
    return res.success(result);
  } catch (err) {
    next(err);
  }
});
