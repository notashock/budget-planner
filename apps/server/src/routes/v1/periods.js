import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { monthHandlers } from '../months.js';
import { transactionHandlers } from '../transactions.js';
import { goalHandlers } from '../goals.js';

// Budget periods (months). Handlers are shared with the legacy /api/months routes.
export const v1PeriodsRouter = express.Router();
v1PeriodsRouter.use(requireAuth);

v1PeriodsRouter.get('/', monthHandlers.list);
v1PeriodsRouter.post('/', monthHandlers.create);
v1PeriodsRouter.post('/rollover', monthHandlers.rollover);

v1PeriodsRouter.get('/:year/:month', monthHandlers.detail);
v1PeriodsRouter.get('/:year/:month/summary', monthHandlers.summary);
v1PeriodsRouter.get('/:year/:month/timeline', monthHandlers.timeline);
v1PeriodsRouter.patch('/:year/:month', monthHandlers.update);
v1PeriodsRouter.delete('/:year/:month', monthHandlers.remove);
v1PeriodsRouter.post('/:year/:month/credit-salary', monthHandlers.creditSalary);
v1PeriodsRouter.post('/:year/:month/rollover', monthHandlers.rollover);
v1PeriodsRouter.post('/:year/:month/recommend-purchase-date', monthHandlers.recommendPurchaseDate);

v1PeriodsRouter.get('/:year/:month/transactions', transactionHandlers.listForMonth);
v1PeriodsRouter.post('/:year/:month/transactions', transactionHandlers.createForMonth);
v1PeriodsRouter.get('/:year/:month/month-end-review', transactionHandlers.monthEndReview);

v1PeriodsRouter.get('/:year/:month/goals', goalHandlers.listForMonth);
v1PeriodsRouter.post('/:year/:month/goals', goalHandlers.createForMonth);
v1PeriodsRouter.post('/:year/:month/goals/recommend-date', goalHandlers.recommendDate);
