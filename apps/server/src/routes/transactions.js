import express from 'express';
import { Month } from '../models/Month.js';
import { Transaction } from '../models/Transaction.js';
import { Item } from '../models/Item.js';
import { Goal } from '../models/Goal.js';
import { Setting } from '../models/Setting.js';
import { requireAuth } from '../middleware/auth.js';
import { recommendPurchaseDate } from '@budget/engine';
import { GeminiAssistantAdapter } from '../ai/geminiAdapter.js';
import { config } from '../config.js';

export const transactionsRouter = express.Router();
transactionsRouter.use(requireAuth);

// GET /api/months/:year/:month/transactions
transactionsRouter.get('/months/:year/:month/transactions', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);

    const month = await Month.findOne({
      userId: req.session.userId,
      year,
      month: monthNum
    });

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    const transactions = await Transaction.find({
      userId: req.session.userId,
      monthId: month._id
    }).sort({ date: 1, createdAt: 1 });

    return res.json(transactions);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /api/months/:year/:month/transactions (3-tap quick log)
transactionsRouter.post('/months/:year/:month/transactions', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const { amount, tag, note, date, plannedItemId } = req.body;

    if (amount === undefined || amount === null || typeof Number(amount) !== 'number') {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const month = await Month.findOne({
      userId: req.session.userId,
      year,
      month: monthNum
    });

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    // Default date to today formatted as YYYY-MM-DD if not provided
    let txDate = date;
    if (!txDate) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      txDate = `${year}-${pad(monthNum)}-${pad(now.getDate())}`;
    }

    // Validate plannedItemId if provided
    let verifiedPlannedItemId = null;
    if (plannedItemId) {
      const item = await Item.findOne({
        _id: plannedItemId,
        userId: req.session.userId,
        monthId: month._id
      });
      if (item) {
        verifiedPlannedItemId = item._id;
      }
    }

    const validTag = ['Food', 'Travel', 'Health', 'Other'].includes(tag) ? tag : 'Other';

    const transaction = await Transaction.create({
      userId: req.session.userId,
      monthId: month._id,
      date: txDate,
      amount: Math.round(Number(amount)),
      tag: validTag,
      note: note ? String(note).trim() : '',
      plannedItemId: verifiedPlannedItemId
    });

    // Dynamic Goal Re-evaluation & Auto-Deferral:
    // If an expense purchase compromises the safety buffer of any active goal,
    // automatically transition that goal to deferred status.
    if (transaction.amount > 0) {
      try {
        const activeGoals = await Goal.find({
          userId: req.session.userId,
          monthId: month._id,
          status: { $in: ['active', 'evaluating'] }
        });

        if (activeGoals.length > 0) {
          const [items, allTransactions] = await Promise.all([
            Item.find({ userId: req.session.userId, monthId: month._id }),
            Transaction.find({ userId: req.session.userId, monthId: month._id })
          ]);

          for (const goal of activeGoals) {
            const rec = recommendPurchaseDate(
              {
                openingBalance: month.openingBalance,
                incomeAmount: month.incomeAmount,
                incomeCreditDate: month.incomeCreditDate,
                incomeCreditDay: month.incomeCreditDay,
                safetyFloor: month.safetyFloor,
                unplannedAllowance: month.unplannedAllowance || 0,
                currentDay: new Date().getDate(),
                scale: 100
              },
              items,
              { year, month: monthNum },
              goal.targetAmount,
              allTransactions
            );

            if (!rec.feasible) {
              goal.status = 'deferred';
              goal.deferredReason = 'Auto-deferred: recent purchase compromised safety buffer';

              let nextYear = month.year;
              let nextMonthNum = month.month + 1;
              if (nextMonthNum > 12) {
                nextMonthNum = 1;
                nextYear += 1;
              }

              let nextMonth = await Month.findOne({
                userId: req.session.userId,
                year: nextYear,
                month: nextMonthNum
              });

              if (!nextMonth) {
                nextMonth = await Month.create({
                  userId: req.session.userId,
                  year: nextYear,
                  month: nextMonthNum,
                  openingBalance: 0,
                  incomeAmount: month.incomeAmount,
                  incomeCreditDay: month.incomeCreditDay,
                  incomeCreditDate: month.incomeCreditDate,
                  safetyFloor: month.safetyFloor,
                  unplannedAllowance: month.unplannedAllowance || 0,
                  currencySymbol: month.currencySymbol
                });
              }

              goal.monthId = nextMonth._id;
              await goal.save();
            }
          }
        }
      } catch (goalEvalErr) {
        console.error('Goal auto-deferral evaluation error:', goalEvalErr);
      }
    }

    return res.status(201).json(transaction);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to log transaction' });
  }
});

// DELETE /api/transactions/:id
transactionsRouter.delete('/transactions/:id', async (req, res) => {
  try {
    const tx = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    return res.json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// GET /api/months/:year/:month/month-end-review
transactionsRouter.get('/months/:year/:month/month-end-review', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);

    const month = await Month.findOne({
      userId: req.session.userId,
      year,
      month: monthNum
    });

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    const transactions = await Transaction.find({
      userId: req.session.userId,
      monthId: month._id
    });

    const tagBreakdown = {
      Food: { count: 0, total: 0 },
      Travel: { count: 0, total: 0 },
      Health: { count: 0, total: 0 },
      Other: { count: 0, total: 0 }
    };

    let totalUnplannedActual = 0;
    let totalMatchedActual = 0;

    transactions.forEach((tx) => {
      const tag = tx.tag || 'Other';
      if (!tagBreakdown[tag]) tagBreakdown[tag] = { count: 0, total: 0 };
      tagBreakdown[tag].count++;
      tagBreakdown[tag].total += tx.amount;

      if (!tx.plannedItemId) {
        totalUnplannedActual += tx.amount;
      } else {
        totalMatchedActual += tx.amount;
      }
    });

    // Plain arithmetic calculation for suggested next-month allowance:
    // Suggests actual unplanned spend rounded up with a 10% safety buffer
    let suggestedAllowance = 0;
    if (totalUnplannedActual > 0) {
      // Add 10% buffer and round to nearest 50 whole units (5000 minor units)
      const withBuffer = totalUnplannedActual * 1.1;
      suggestedAllowance = Math.ceil(withBuffer / 5000) * 5000;
    } else {
      suggestedAllowance = month.unplannedAllowance || 10000;
    }

    const review = {
      unplannedAllowance: month.unplannedAllowance || 0,
      totalUnplannedActual,
      totalMatchedActual,
      variance: (month.unplannedAllowance || 0) - totalUnplannedActual,
      tagBreakdown,
      suggestedNextMonthAllowance: suggestedAllowance,
      aiExplanation: null
    };

    // If AI assistant is enabled, obtain optional pattern explanation
    const setting = await Setting.findOne({ userId: req.session.userId });
    if (setting?.aiAssistantEnabled) {
      try {
        const adapter = new GeminiAssistantAdapter(config.geminiApiKey);
        const explanation = await adapter.explainTimeline(
          {
            floorBreached: false,
            lowestBalance: 0,
            lowestDate: '',
            endingBalance: 0,
            events: Object.entries(tagBreakdown).map(([tag, data]) => ({
              date: `${year}-${String(monthNum).padStart(2, '0')}`,
              label: tag,
              amount: -data.total
            }))
          },
          month.safetyFloor
        );
        review.aiExplanation = explanation.summary;
      } catch (e) {
        // Fail silently if AI provider is unavailable
      }
    }

    return res.json(review);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate month-end review' });
  }
});
