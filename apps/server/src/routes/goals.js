import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { BudgetExecution } from '../domain/budgetExecution.js';

export const goalsRouter = express.Router();
goalsRouter.use(requireAuth);

// GET /api/months/:year/:month/goals
goalsRouter.get('/months/:year/:month/goals', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const evaluatedGoals = await BudgetExecution.listGoals(userId, year, monthNum);
    return res.success(evaluatedGoals);
  } catch (err) {
    next(err);
  }
});

// POST /api/months/:year/:month/goals
goalsRouter.post('/months/:year/:month/goals', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const goal = await BudgetExecution.createGoal(userId, year, monthNum, req.body);
    return res.success(goal, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/goals/:id/schedule
goalsRouter.post('/goals/:id/schedule', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const goalId = req.params.id;
    const result = await BudgetExecution.scheduleGoal(userId, goalId, req.body);
    return res.success(result, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/goals/:id/convert-to-item (Legacy alias)
goalsRouter.post('/goals/:id/convert-to-item', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const goalId = req.params.id;
    const result = await BudgetExecution.scheduleGoal(userId, goalId, req.body);
    return res.success(result, 201);
  } catch (err) {
    next(err);
  }
});

// PUT /api/goals/:id
goalsRouter.put('/goals/:id', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const goalId = req.params.id;
    const updated = await BudgetExecution.updateGoal(userId, goalId, req.body);
    return res.success(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/goals/:id/defer
goalsRouter.post('/goals/:id/defer', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const goalId = req.params.id;
    const result = await BudgetExecution.deferGoal(userId, goalId);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/goals/:id/reactivate
goalsRouter.post('/goals/:id/reactivate', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const goalId = req.params.id;
    const result = await BudgetExecution.reactivateGoal(userId, goalId);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/goals/:id
goalsRouter.delete('/goals/:id', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const goalId = req.params.id;
    const result = await BudgetExecution.deleteGoal(userId, goalId);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/months/:year/:month/goals/recommend-date
goalsRouter.post('/months/:year/:month/goals/recommend-date', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const amount = req.body.amount || req.body.targetAmount;
    const fundingSource = req.body.fundingSource || req.body.fundingAccountId;
    const rec = await BudgetExecution.recommendGoalDate(userId, year, monthNum, amount, fundingSource);
    return res.success(rec);
  } catch (err) {
    next(err);
  }
});
