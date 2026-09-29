import express from 'express';
import { Month } from '../models/Month.js';
import { Item } from '../models/Item.js';
import { Setting } from '../models/Setting.js';
import { requireAuth } from '../middleware/auth.js';
import { simulate } from '@budget/engine';

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
    const { year, month, openingBalance, incomeAmount, incomeCreditDay, safetyFloor, currencySymbol } = req.body;

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

    // Default from user settings if not provided
    const userSettings = await Setting.findOne({ userId: req.session.userId });

    const newMonth = await Month.create({
      userId: req.session.userId,
      year: Number(year),
      month: Number(month),
      openingBalance: typeof openingBalance === 'number' ? Math.round(openingBalance) : 0,
      incomeAmount: typeof incomeAmount === 'number'
        ? Math.round(incomeAmount)
        : (userSettings?.defaultIncomeAmount ?? 0),
      incomeCreditDay: typeof incomeCreditDay === 'number'
        ? Math.max(1, Math.min(31, Math.floor(incomeCreditDay)))
        : (userSettings?.defaultIncomeCreditDay ?? 1),
      safetyFloor: typeof safetyFloor === 'number'
        ? Math.round(safetyFloor)
        : (userSettings?.defaultSafetyFloor ?? 0),
      currencySymbol: currencySymbol || userSettings?.currencySymbol || '$'
    });

    return res.status(201).json(newMonth);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create month' });
  }
});

// Get single month with items and computed simulation
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

    const items = await Item.find({
      userId: req.session.userId,
      monthId: month._id
    }).sort({ priority: 1, createdAt: 1 });

    const simulation = simulate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDay: month.incomeCreditDay,
        safetyFloor: month.safetyFloor,
        scale: 100
      },
      items,
      { year, month: monthNum }
    );

    return res.json({
      month,
      items,
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
    const { openingBalance, incomeAmount, incomeCreditDay, safetyFloor, currencySymbol } = req.body;

    const update = {};
    if (typeof openingBalance === 'number') update.openingBalance = Math.round(openingBalance);
    if (typeof incomeAmount === 'number') update.incomeAmount = Math.round(incomeAmount);
    if (typeof incomeCreditDay === 'number') {
      update.incomeCreditDay = Math.max(1, Math.min(31, Math.floor(incomeCreditDay)));
    }
    if (typeof safetyFloor === 'number') update.safetyFloor = Math.round(safetyFloor);
    if (typeof currencySymbol === 'string' && currencySymbol.trim()) update.currencySymbol = currencySymbol.trim();

    const month = await Month.findOneAndUpdate(
      { userId: req.session.userId, year, month: monthNum },
      { $set: update },
      { new: true }
    );

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    const items = await Item.find({ userId: req.session.userId, monthId: month._id });
    const simulation = simulate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDay: month.incomeCreditDay,
        safetyFloor: month.safetyFloor,
        scale: 100
      },
      items,
      { year, month: monthNum }
    );

    return res.json({ month, items, simulation });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update month' });
  }
});

// Month Rollover: copy recurring items to next month and optionally carry forward ending balance
monthsRouter.post('/:year/:month/rollover', async (req, res) => {
  try {
    const currentYear = Number(req.params.year);
    const currentMonthNum = Number(req.params.month);
    const carryBalance = req.body.carryBalance !== false; // Default true

    const currentMonth = await Month.findOne({
      userId: req.session.userId,
      year: currentYear,
      month: currentMonthNum
    });

    if (!currentMonth) {
      return res.status(404).json({ error: 'Source month not found' });
    }

    const currentItems = await Item.find({
      userId: req.session.userId,
      monthId: currentMonth._id
    });

    // Run simulation to get ending balance
    const currentSimulation = simulate(
      {
        openingBalance: currentMonth.openingBalance,
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDay: currentMonth.incomeCreditDay,
        safetyFloor: currentMonth.safetyFloor,
        scale: 100
      },
      currentItems,
      { year: currentYear, month: currentMonthNum }
    );

    // Compute next month calendar coordinates
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
        incomeCreditDay: currentMonth.incomeCreditDay,
        safetyFloor: currentMonth.safetyFloor,
        currencySymbol: currentMonth.currencySymbol
      });
    } else if (carryBalance) {
      nextMonth.openingBalance = newOpeningBalance;
      await nextMonth.save();
    }

    // Copy recurring items to next month if they are not already copied
    const recurringItems = currentItems.filter((i) => i.type === 'recurring');
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
          dayOfMonth: item.dayOfMonth
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
        scale: 100
      },
      allNextItems,
      { year: nextYear, month: nextMonthNum }
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

// Delete month and items
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

    await Item.deleteMany({ userId: req.session.userId, monthId: month._id });
    return res.json({ message: 'Month deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete month' });
  }
});
