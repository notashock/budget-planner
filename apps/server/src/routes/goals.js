import express from 'express';
import { Month } from '../models/Month.js';
import { Goal } from '../models/Goal.js';
import { Item } from '../models/Item.js';
import { Transaction } from '../models/Transaction.js';
import { BankAccount } from '../models/BankAccount.js';
import { Wallet } from '../models/Wallet.js';
import { requireAuth } from '../middleware/auth.js';
import { recommendPurchaseDate } from '@budget/engine';

export const goalsRouter = express.Router();
goalsRouter.use(requireAuth);

// GET /api/months/:year/:month/goals
goalsRouter.get('/months/:year/:month/goals', async (req, res) => {
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

    const [goals, items, transactions] = await Promise.all([
      Goal.find({ userId: req.session.userId, monthId: month._id }).sort({ createdAt: -1 }),
      Item.find({ userId: req.session.userId, monthId: month._id }),
      Transaction.find({ userId: req.session.userId, monthId: month._id })
    ]);

    const now = new Date();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : 0;

    const evaluatedGoals = goals.map((goal) => {
      const recommendation = recommendPurchaseDate(
        {
          openingBalance: month.openingBalance,
          incomeAmount: month.incomeAmount,
          incomeCreditDate: month.incomeCreditDate,
          incomeCreditDay: month.incomeCreditDay,
          safetyFloor: month.safetyFloor,
          unplannedAllowance: month.unplannedAllowance || 0,
          currentDay,
          scale: 100
        },
        items,
        { year, month: monthNum },
        goal.targetAmount,
        transactions
      );

      const obj = goal.toObject();
      if (obj.status === 'evaluating') obj.status = 'active';
      if (obj.status === 'ready') obj.status = 'scheduled';

      return {
        ...obj,
        recommendation
      };
    });

    return res.json(evaluatedGoals);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// POST /api/months/:year/:month/goals
goalsRouter.post('/months/:year/:month/goals', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const { name, targetAmount, fundingSourceType, fundingBankAccountId, fundingWalletId } = req.body;

    if (!name || !targetAmount || typeof Number(targetAmount) !== 'number') {
      return res.status(400).json({ error: 'Valid goal name and target amount required' });
    }

    const month = await Month.findOne({
      userId: req.session.userId,
      year,
      month: monthNum
    });

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    let fType = fundingSourceType;
    let fBankId = fundingBankAccountId;
    let fWalletId = fundingWalletId;

    if (!fBankId && !fWalletId) {
      const primaryBank = await BankAccount.findOne({ userId: req.session.userId, isPrimary: true, isArchived: false })
        || await BankAccount.findOne({ userId: req.session.userId, isArchived: false });
      if (primaryBank) {
        fType = 'bank';
        fBankId = primaryBank._id;
      } else {
        const firstWallet = await Wallet.findOne({ userId: req.session.userId, isArchived: false });
        if (firstWallet) {
          fType = 'wallet';
          fWalletId = firstWallet._id;
        }
      }
    }

    const goal = await Goal.create({
      userId: req.session.userId,
      monthId: month._id,
      name: name.trim(),
      targetAmount: Math.round(Number(targetAmount)),
      status: 'active',
      fundingSourceType: fType || null,
      fundingBankAccountId: fBankId || null,
      fundingWalletId: fWalletId || null
    });

    // Evaluate recommendation immediately
    const [items, transactions] = await Promise.all([
      Item.find({ userId: req.session.userId, monthId: month._id }),
      Transaction.find({ userId: req.session.userId, monthId: month._id })
    ]);

    const now = new Date();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : 0;

    const recommendation = recommendPurchaseDate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDay,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100
      },
      items,
      { year, month: monthNum },
      goal.targetAmount,
      transactions
    );

    return res.status(201).json({
      ...goal.toObject(),
      recommendation
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create goal' });
  }
});

// POST /api/goals/:id/convert-to-item (1-tap convert goal into planned item)
goalsRouter.post('/goals/:id/convert-to-item', async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const month = await Month.findById(goal.monthId);
    if (!month) {
      return res.status(404).json({ error: 'Associated month not found' });
    }

    const [items, transactions] = await Promise.all([
      Item.find({ userId: req.session.userId, monthId: month._id }),
      Transaction.find({ userId: req.session.userId, monthId: month._id })
    ]);

    const now = new Date();
    const isCurrentMonth = Number(month.year) === now.getFullYear() && Number(month.month) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : 0;

    const recommendation = recommendPurchaseDate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDay,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100
      },
      items,
      { year: month.year, month: month.month },
      goal.targetAmount,
      transactions
    );

    const targetDay = recommendation.recommendedDay || 1;

    let accountType = goal.fundingSourceType || 'bank';
    let bankAccountId = goal.fundingBankAccountId;
    let walletId = goal.fundingWalletId;

    if (!bankAccountId && !walletId) {
      const primaryBank = await BankAccount.findOne({ userId: req.session.userId, isPrimary: true, isArchived: false })
        || await BankAccount.findOne({ userId: req.session.userId, isArchived: false });
      if (primaryBank) {
        accountType = 'bank';
        bankAccountId = primaryBank._id;
      } else {
        const firstWallet = await Wallet.findOne({ userId: req.session.userId, isArchived: false });
        if (firstWallet) {
          accountType = 'wallet';
          walletId = firstWallet._id;
        }
      }
    }

    // Create scheduled one-time item
    const item = await Item.create({
      userId: req.session.userId,
      monthId: month._id,
      type: 'one-time',
      name: goal.name,
      amount: goal.targetAmount,
      day: targetDay,
      priority: 0,
      accountType,
      bankAccountId: bankAccountId || undefined,
      walletId: walletId || undefined
    });

    goal.status = 'scheduled';
    await goal.save();

    return res.status(201).json({ item, goal });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to convert goal to item' });
  }
});

// POST /api/goals/:id/defer (Defer goal to next month)
goalsRouter.post('/goals/:id/defer', async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const currentMonth = await Month.findById(goal.monthId);
    if (!currentMonth) {
      return res.status(404).json({ error: 'Current month not found' });
    }

    let nextYear = currentMonth.year;
    let nextMonthNum = currentMonth.month + 1;
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
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDay: currentMonth.incomeCreditDay,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        currencySymbol: currentMonth.currencySymbol
      });
    }

    goal.monthId = nextMonth._id;
    goal.status = 'deferred';
    await goal.save();

    return res.json({ message: 'Goal deferred to next month', goal, nextMonth });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to defer goal' });
  }
});

// POST /api/goals/:id/reactivate (Reactivate deferred goal)
goalsRouter.post('/goals/:id/reactivate', async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    goal.status = 'active';
    goal.deferredReason = null;
    await goal.save();

    return res.json({ message: 'Goal reactivated successfully', goal });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reactivate goal' });
  }
});

// DELETE /api/goals/:id
goalsRouter.delete('/goals/:id', async (req, res) => {
  try {
    const goal = await Goal.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    return res.json({ message: 'Goal deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete goal' });
  }
});
