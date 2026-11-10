import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { PlanningPeriodService } from '../../domain/planningPeriodService.js';
import { MonthLifecycle } from '../../domain/monthLifecycle.js';

export const v1PeriodsRouter = express.Router();
v1PeriodsRouter.use(requireAuth);

// GET /api/v1/periods - Idempotent list of budget periods
v1PeriodsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const periods = await PlanningPeriodService.listPeriods(userId);
    return res.success(periods);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/periods/:year/:month - Idempotent period details and single-pass simulation
v1PeriodsRouter.get('/:year/:month', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    const periodDetails = await PlanningPeriodService.getPeriodDetails(userId, year, month);
    return res.success(periodDetails);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/periods/:year/:month/close - Explicit period closure
v1PeriodsRouter.post('/:year/:month/close', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    const closed = await MonthLifecycle.closeMonth(userId, year, month, req.body);
    return res.success(closed);
  } catch (err) {
    next(err);
  }
});
