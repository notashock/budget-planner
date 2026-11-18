import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { CardService } from '../../domain/cardService.js';
import { route } from '../routeHelpers.js';

// Credit cards (ADR 0070). Cards are created and edited through /api/v1/accounts
// with type 'credit_card'; this router covers bills (statements) and paying them.
export const v1CardsRouter = express.Router();
v1CardsRouter.use(requireAuth);

// GET /api/v1/cards -> every active card with what is owed, this cycle, open bill and statements
v1CardsRouter.get('/', route(async (req, res) => res.success(await CardService.listCards(req.userId))));

// GET /api/v1/cards/:id -> one card
v1CardsRouter.get('/:id', route(async (req, res) => res.success(await CardService.getCard(req.userId, req.params.id))));

// POST /api/v1/cards/statements/:statementId/confirm { statementAmount?, minimumDue?, dueDate?, logChargesDifference? }
v1CardsRouter.post('/statements/:statementId/confirm', route(async (req, res) => (
  res.success(await CardService.confirmStatement(req.userId, req.params.statementId, req.body))
)));

// POST /api/v1/cards/statements/:statementId/pay { amount?, fromAccountId?, date? }
v1CardsRouter.post('/statements/:statementId/pay', route(async (req, res) => (
  res.success(await CardService.payStatement(req.userId, req.params.statementId, req.body), 201)
)));
