import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { BudgetExecution } from '../domain/budgetExecution.js';
import { route, yearMonth } from './routeHelpers.js';

export const goalsRouter = express.Router();
goalsRouter.use(requireAuth);

/**
 * Goal handlers, mounted here under /api and under /api/v1
 * (/periods/:year/:month/goals and /goals/:id), so both surfaces run the same code.
 */
export const goalHandlers = {
  listForMonth: route(async (req, res) => res.success(await BudgetExecution.listGoals(req.userId, ...yearMonth(req)))),
  createForMonth: route(async (req, res) => res.success(await BudgetExecution.createGoal(req.userId, ...yearMonth(req), req.body), 201)),
  recommendDate: route(async (req, res) => {
    const amount = req.body.amount || req.body.targetAmount;
    const fundingSource = req.body.fundingSource || req.body.fundingAccountId;
    return res.success(await BudgetExecution.recommendGoalDate(req.userId, ...yearMonth(req), amount, fundingSource));
  }),
  schedule: route(async (req, res) => res.success(await BudgetExecution.scheduleGoal(req.userId, req.params.id, req.body), 201)),
  update: route(async (req, res) => res.success(await BudgetExecution.updateGoal(req.userId, req.params.id, req.body))),
  defer: route(async (req, res) => res.success(await BudgetExecution.deferGoal(req.userId, req.params.id))),
  reactivate: route(async (req, res) => res.success(await BudgetExecution.reactivateGoal(req.userId, req.params.id))),
  remove: route(async (req, res) => res.success(await BudgetExecution.deleteGoal(req.userId, req.params.id)))
};

goalsRouter.get('/months/:year/:month/goals', goalHandlers.listForMonth);
goalsRouter.post('/months/:year/:month/goals', goalHandlers.createForMonth);
goalsRouter.post('/months/:year/:month/goals/recommend-date', goalHandlers.recommendDate);
goalsRouter.post('/goals/:id/schedule', goalHandlers.schedule);
goalsRouter.post('/goals/:id/convert-to-item', goalHandlers.schedule); // legacy alias
goalsRouter.put('/goals/:id', goalHandlers.update);
goalsRouter.post('/goals/:id/defer', goalHandlers.defer);
goalsRouter.post('/goals/:id/reactivate', goalHandlers.reactivate);
goalsRouter.delete('/goals/:id', goalHandlers.remove);
