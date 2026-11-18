import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { PersonFundService } from '../../domain/personFundService.js';
import { route } from '../routeHelpers.js';

// Held & Lent money (ADR 0069): one record per person, entries are pass-through transactions
export const v1PersonFundsRouter = express.Router();
v1PersonFundsRouter.use(requireAuth);

// GET /api/v1/person-funds?status=open|settled&direction=held|lent -> { funds, totals }
v1PersonFundsRouter.get('/', route(async (req, res) => res.success(await PersonFundService.listFunds(req.userId, req.query))));

// POST /api/v1/person-funds { personName, direction, note?, expectedSettleDate?, amount?, date?, accountId? }
v1PersonFundsRouter.post('/', route(async (req, res) => res.success(await PersonFundService.createFund(req.userId, req.body), 201)));

// GET /api/v1/person-funds/:id -> fund with outstanding and entries
v1PersonFundsRouter.get('/:id', route(async (req, res) => res.success(await PersonFundService.getFund(req.userId, req.params.id))));

v1PersonFundsRouter.patch('/:id', route(async (req, res) => res.success(await PersonFundService.updateFund(req.userId, req.params.id, req.body))));

// DELETE only when nothing was logged against the person
v1PersonFundsRouter.delete('/:id', route(async (req, res) => res.success(await PersonFundService.deleteFund(req.userId, req.params.id))));

// POST /api/v1/person-funds/:id/entries { flow: 'in'|'out', amount, date?, accountId?, note?, status?, allowExceed? }
v1PersonFundsRouter.post('/:id/entries', route(async (req, res) => (
  res.success(await PersonFundService.addEntry(req.userId, req.params.id, req.body), 201)
)));
