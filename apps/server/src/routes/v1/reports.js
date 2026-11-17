import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { transactionHandlers } from '../transactions.js';

export const v1ReportsRouter = express.Router();
v1ReportsRouter.use(requireAuth);

// GET /api/v1/reports/irregular?asOfDate=YYYY-MM-DD
v1ReportsRouter.get('/irregular', transactionHandlers.irregularReports);
