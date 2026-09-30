import express from 'express';
import { Month } from '../models/Month.js';
import { Item } from '../models/Item.js';
import { Setting } from '../models/Setting.js';
import { Transaction } from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.js';
import { simulate, recommendPurchaseDate } from '@budget/engine';

export const monthsRouter = express.Router();
monthsRouter.use(requireAuth);

// List all months
monthsRouter.get('/', async (req, res) => {
  try {
    const months = await Month.find({ userId: req.session.userId })
      .sort({ year: -1, month: -1 });
    return res.json(months);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve months' });
  }
});

// Create month (or initialize from settings)
monthsRouter.post('/', async (req, res) => {
  try {
    const {
      year,
      month,
      openingBalance,
      incomeAmount,
      incomeCreditDate,
      incomeCreditDay,
      safetyFloor,
      unplannedAllowance,
      currencySymbol
    } = req.body;

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Valid year and month (1-12) required' });
    }

    const existing = await Month.findOne({
      userId: req.session.userId,
      year: Number(year),
      month: Number(month)
    });
    if (existing) {
      return res.status(409).json({ error: 'Month already exists', month: existing });
    }

    const userSettings = await Setting.findOne({ userId: req.session.userId });

    const newMonth = await Month.create({
      userId: req.session.userId,
      year: Number(year),
      month: Number(month),
      openingBalance: typeof openingBalance === 'number' ? Math.round(openingBalance) : 0,
      incomeAmount: typeof incomeAmount === 'number'
        ? Math.round(incomeAmount)
        : (userSettings?.defaultIncomeAmount ?? 0),
      incomeCreditDate: typeof incomeCreditDate === 'string' && incomeCreditDate.trim()
        ? incomeCreditDate.trim()
        : null,
      incomeCreditDay: typeof incomeCreditDay === 'number'
        ? Math.max(1, Math.min(31, Math.floor(incomeCreditDay)))
        : (userSettings?.defaultIncomeCreditDay ?? 1),
      safetyFloor: typeof safetyFloor === 'number'
        ? Math.round(safetyFloor)
        : (userSettings?.defaultSafetyFloor ?? 0),
      unplannedAllowance: typeof unplannedAllowance === 'number'
        ? Math.round(unplannedAllowance)
        : (userSettings?.defaultUnplannedAllowance ?? 0),
      currencySymbol: currencySymbol || userSettings?.currencySymbol || '₹'
    });

    return res.status(201).json(newMonth);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create month' });
  }
});

// Get single month with items, transactions, and computed simulation
monthsRouter.get('/:year/:month', async (req, res) => {
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

    const [items, transactions] = await Promise.all([
      Item.find({
        userId: req.session.userId,
        monthId: month._id
      }).sort({ priority: 1, createdAt: 1 }),
      Transaction.find({
        userId: req.session.userId,
        monthId: month._id
      }).sort({ date: 1, createdAt: 1 })
    ]);

    const currentDay = new Date().getDate();

    const simulation = simulate(
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
      transactions
    );

    return res.json({
      month,
      items,
      transactions,
      simulation
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch month details' });
  }
});

// Update month settings/overrides
monthsRouter.put('/:year/:month', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const {
      openingBalance,
      incomeAmount,
      incomeCreditDate,
      incomeCreditDay,
      safetyFloor,
      unplannedAllowance,
      currencySymbol
    } = req.body;

    const update = {};
    if (typeof openingBalance === 'number') update.openingBalance = Math.round(openingBalance);
    if (typeof incomeAmount === 'number') update.incomeAmount = Math.round(incomeAmount);
    if (typeof incomeCreditDate === 'string') {
      update.incomeCreditDate = incomeCreditDate.trim() || null;
    }
    if (typeof incomeCreditDay === 'number') {
      update.incomeCreditDay = Math.max(1, Math.min(31, Math.floor(incomeCreditDay)));
    }
    if (typeof safetyFloor === 'number') update.safetyFloor = Math.round(safetyFloor);
    if (typeof unplannedAllowance === 'number') update.unplannedAllowance = Math.round(unplannedAllowance);
    if (typeof currencySymbol === 'string' && currencySymbol.trim()) update.currencySymbol = currencySymbol.trim();

    const month = await Month.findOneAndUpdate(
      { userId: req.session.userId, year, month: monthNum },
      { $set: update },
      { new: true }
    );

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    const [items, transactions] = await Promise.all([
      Item.find({ userId: req.session.userId, monthId: month._id }),
      Transaction.find({ userId: req.session.userId, monthId: month._id })
    ]);

    const simulation = simulate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDay: month.incomeCreditDay,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay: new Date().getDate(),
        scale: 100
      },
      items,
      { year, month: monthNum },
      transactions
    );

    return res.json({ month, items, transactions, simulation });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update month' });
  }
});

// Recommend optimal purchase date for a one-time purchase
monthsRouter.post('/:year/:month/recommend-purchase-date', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const { amount } = req.body;

    if (!amount || typeof Number(amount) !== 'number') {
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

    const [items, transactions] = await Promise.all([
      Item.find({ userId: req.session.userId, monthId: month._id }),
      Transaction.find({ userId: req.session.userId, monthId: month._id })
    ]);

    const recommendation = recommendPurchaseDate(
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
      Math.round(Number(amount)),
      transactions
    );

    return res.json(recommendation);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to compute purchase date recommendation' });
  }
});

// Month Rollover
monthsRouter.post('/:year/:month/rollover', async (req, res) => {
  try {
    const currentYear = Number(req.params.year);
    const currentMonthNum = Number(req.params.month);
    const carryBalance = req.body.carryBalance !== false;

    const currentMonth = await Month.findOne({
      userId: req.session.userId,
      year: currentYear,
      month: currentMonthNum
    });

    if (!currentMonth) {
      return res.status(404).json({ error: 'Source month not found' });
    }

    const [currentItems, currentTransactions] = await Promise.all([
      Item.find({ userId: req.session.userId, monthId: currentMonth._id }),
      Transaction.find({ userId: req.session.userId, monthId: currentMonth._id })
    ]);

    const currentSimulation = simulate(
      {
        openingBalance: currentMonth.openingBalance,
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDate: currentMonth.incomeCreditDate,
        incomeCreditDay: currentMonth.incomeCreditDay,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        scale: 100
      },
      currentItems,
      { year: currentYear, month: currentMonthNum },
      currentTransactions
    );

    let nextYear = currentYear;
    let nextMonthNum = currentMonthNum + 1;
    if (nextMonthNum > 12) {
      nextMonthNum = 1;
      nextYear += 1;
    }

    let nextMonth = await Month.findOne({
      userId: req.session.userId,
      year: nextYear,
      month: nextMonthNum
    });

    const newOpeningBalance = carryBalance ? currentSimulation.endingBalance : 0;

    if (!nextMonth) {
      nextMonth = await Month.create({
        userId: req.session.userId,
        year: nextYear,
        month: nextMonthNum,
        openingBalance: newOpeningBalance,
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDate: currentMonth.incomeCreditDate,
        incomeCreditDay: currentMonth.incomeCreditDay,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        currencySymbol: currentMonth.currencySymbol
      });
    } else if (carryBalance) {
      nextMonth.openingBalance = newOpeningBalance;
      await nextMonth.save();
    }

    // Copy only FIXED recurring items to next month if they are not already copied
    const recurringItems = currentItems.filter((i) => i.type === 'recurring' && i.isFixed === true);
    const existingNextItems = await Item.find({
      userId: req.session.userId,
      monthId: nextMonth._id,
      type: 'recurring'
    });

    const existingNames = new Set(existingNextItems.map((i) => `${i.name}-${i.dayOfMonth}`));

    const itemsToInsert = [];
    for (const item of recurringItems) {
      if (!existingNames.has(`${item.name}-${item.dayOfMonth}`)) {
        itemsToInsert.push({
          userId: req.session.userId,
          monthId: nextMonth._id,
          type: 'recurring',
          name: item.name,
          priority: item.priority,
          amount: item.amount,
          dayOfMonth: item.dayOfMonth,
          isFixed: true
        });
      }
    }

    if (itemsToInsert.length > 0) {
      await Item.insertMany(itemsToInsert);
    }

    const allNextItems = await Item.find({
      userId: req.session.userId,
      monthId: nextMonth._id
    });

    const nextSimulation = simulate(
      {
        openingBalance: nextMonth.openingBalance,
        incomeAmount: nextMonth.incomeAmount,
        incomeCreditDay: nextMonth.incomeCreditDay,
        safetyFloor: nextMonth.safetyFloor,
        unplannedAllowance: nextMonth.unplannedAllowance || 0,
        scale: 100
      },
      allNextItems,
      { year: nextYear, month: nextMonthNum },
      []
    );

    return res.status(201).json({
      month: nextMonth,
      items: allNextItems,
      simulation: nextSimulation
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to perform month rollover' });
  }
});

// Delete month and items and transactions
monthsRouter.delete('/:year/:month', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);

    const month = await Month.findOneAndDelete({
      userId: req.session.userId,
      year,
      month: monthNum
    });

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    await Promise.all([
      Item.deleteMany({ userId: req.session.userId, monthId: month._id }),
      Transaction.deleteMany({ userId: req.session.userId, monthId: month._id })
    ]);

    return res.json({ message: 'Month deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete month' });
  }
});
