import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { MonthLifecycle } from '../domain/monthLifecycle.js';
import { route, yearMonth } from './routeHelpers.js';

export const monthsRouter = express.Router();
monthsRouter.use(requireAuth);

/**
 * Month (budget period) handlers, mounted here on /api/months and on
 * /api/v1/periods, so both surfaces run the same code.
 */
export const monthHandlers = {
  list: route(async (req, res) => res.success(await MonthLifecycle.listMonths(req.userId))),

  create: route(async (req, res) => res.success(await MonthLifecycle.createMonth(req.userId, req.body), 201)),

  // Month detail with simulations
  detail: route(async (req, res) => res.success(await MonthLifecycle.getMonthDetails(req.userId, ...yearMonth(req)))),

  // Month settings / overrides
  update: route(async (req, res) => res.success(await MonthLifecycle.updateMonth(req.userId, ...yearMonth(req), req.body))),

  // 1-click salary credit
  creditSalary: route(async (req, res) => res.success(await MonthLifecycle.creditSalary(req.userId, ...yearMonth(req), req.body))),

  recommendPurchaseDate: route(async (req, res) => {
    const rawAmt = req.body.amount ?? req.body.purchaseAmount;
    const rec = await MonthLifecycle.recommendPurchaseDate(
      req.userId,
      ...yearMonth(req),
      rawAmt,
      req.body.fundingSource,
      req.body.currentDay
    );
    return res.success(rec);
  }),

  rollover: route(async (req, res) => {
    const currentYear = Number(req.params.year || req.body.currentYear);
    const currentMonthNum = Number(req.params.month || req.body.currentMonthNum);
    return res.success(await MonthLifecycle.rolloverMonth(req.userId, currentYear, currentMonthNum, req.body), 201);
  }),

  // Cascade delete; ?force=true deletes a month that has activity
  remove: route(async (req, res) => res.success(
    await MonthLifecycle.deleteMonth(req.userId, ...yearMonth(req), req.query.force === 'true')
  ))
};

monthsRouter.get('/', monthHandlers.list);
monthsRouter.post('/', monthHandlers.create);
monthsRouter.get('/:year/:month', monthHandlers.detail);
monthsRouter.put('/:year/:month', monthHandlers.update);
monthsRouter.post('/:year/:month/credit-salary', monthHandlers.creditSalary);
monthsRouter.post('/:year/:month/recommend-purchase-date', monthHandlers.recommendPurchaseDate);
monthsRouter.post('/:year/:month/rollover', monthHandlers.rollover);
monthsRouter.post('/rollover', monthHandlers.rollover);
monthsRouter.delete('/:year/:month', monthHandlers.remove);
