import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { goalHandlers } from '../goals.js';

// Goals by id. Month-scoped goal routes live under /api/v1/periods/:year/:month/goals.
// Handlers are shared with the legacy /api/goals routes.
export const v1GoalsRouter = express.Router();
v1GoalsRouter.use(requireAuth);

v1GoalsRouter.patch('/:id', goalHandlers.update);
v1GoalsRouter.delete('/:id', goalHandlers.remove);
v1GoalsRouter.post('/:id/schedule', goalHandlers.schedule);
v1GoalsRouter.post('/:id/defer', goalHandlers.defer);
v1GoalsRouter.post('/:id/reactivate', goalHandlers.reactivate);
