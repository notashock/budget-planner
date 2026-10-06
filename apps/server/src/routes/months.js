import express from 'express';
import { Month } from '../models/Month.js';
import { Item } from '../models/Item.js';
import { Setting } from '../models/Setting.js';
import { Transaction } from '../models/Transaction.js';
import { BankAccount } from '../models/BankAccount.js';
import { Wallet } from '../models/Wallet.js';
import { Transfer } from '../models/Transfer.js';
import { Goal } from '../models/Goal.js';
import { requireAuth } from '../middleware/auth.js';
import { simulate, recommendPurchaseDate } from '@budget/engine';
import { backfillUnassignedTransactions } from '../services/accountMigration.js';

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

// Create month (or initialize from settings / predecessor inheritance)
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
      currencySymbol,
      salaryBankAccountId,
      accountOpeningBalances
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

    // Predecessor Baseline Inheritance: resolve latest chronologically preceding month
    let defaultIncome = 0;
    let defaultFloor = 0;
    let defaultCreditDay = 1;
    let defaultSalaryBank = null;

    const predecessor = await Month.findOne({
      userId: req.session.userId,
      $or: [
        { year: { $lt: Number(year) } },
        { year: Number(year), month: { $lt: Number(month) } }
      ]
    }).sort({ year: -1, month: -1 });

    if (predecessor) {
      defaultIncome = predecessor.incomeAmount ?? 0;
      defaultFloor = predecessor.safetyFloor ?? 0;
      defaultCreditDay = predecessor.incomeCreditDay ?? 1;
      defaultSalaryBank = predecessor.salaryBankAccountId ?? null;
    }

    let finalAccountOpenings = [];
    if (Array.isArray(accountOpeningBalances)) {
      finalAccountOpenings = accountOpeningBalances
        .map((entry) => {
          const id = entry.accountId || entry.bankAccountId || entry.walletId;
          if (!id) return null;
          return {
            accountType: entry.accountType === 'wallet' ? 'wallet' : 'bank',
            accountId: id,
            amount: typeof entry.amount === 'number'
              ? Math.round(entry.amount)
              : (typeof entry.openingBalance === 'number' ? Math.round(entry.openingBalance) : 0)
          };
        })
        .filter(Boolean);
    }

    let finalOpening = typeof openingBalance === 'number' ? Math.round(openingBalance) : 0;
    if (finalAccountOpenings.length > 0 && typeof openingBalance !== 'number') {
      finalOpening = finalAccountOpenings.reduce((sum, a) => sum + (Math.round(Number(a.amount)) || 0), 0);
    }

    const newMonth = await Month.create({
      userId: req.session.userId,
      year: Number(year),
      month: Number(month),
      openingBalance: finalOpening,
      incomeAmount: typeof incomeAmount === 'number'
        ? Math.round(incomeAmount)
        : defaultIncome,
      incomeCreditDate: typeof incomeCreditDate === 'string' && incomeCreditDate.trim()
        ? incomeCreditDate.trim()
        : null,
      incomeCreditDay: typeof incomeCreditDay === 'number'
        ? Math.max(1, Math.min(31, Math.floor(incomeCreditDay)))
        : defaultCreditDay,
      safetyFloor: typeof safetyFloor === 'number'
        ? Math.round(safetyFloor)
        : defaultFloor,
      unplannedAllowance: typeof unplannedAllowance === 'number'
        ? Math.round(unplannedAllowance)
        : (userSettings?.defaultUnplannedAllowance ?? 0),
      currencySymbol: currencySymbol || userSettings?.currencySymbol || '₹',
      salaryBankAccountId: salaryBankAccountId || defaultSalaryBank,
      isSalaryCredited: false,
      accountOpeningBalances: finalAccountOpenings
    });

    return res.status(201).json(newMonth);
  } catch (err) {
    console.error('Failed to create month:', err);
    return res.status(500).json({ error: err.message || 'Failed to create month' });
  }
});

// DELETE /api/months/:year/:month (Delete month cascade)
monthsRouter.delete('/:year/:month', async (req, res) => {
  try {
    const userId = req.session.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);

    const month = await Month.findOne({ userId, year, month: monthNum });
    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    // Cascade delete all associated entities for this month
    await Promise.all([
      Item.deleteMany({ monthId: month._id }),
      Transaction.deleteMany({ monthId: month._id }),
      Transfer.deleteMany({ monthId: month._id }),
      Goal.deleteMany({ monthId: month._id }),
      Month.findByIdAndDelete(month._id)
    ]);

    return res.json({
      message: 'Month and all associated items deleted successfully',
      deleted: { year, month: monthNum }
    });
  } catch (err) {
    console.error('Failed to delete month:', err);
    return res.status(500).json({ error: 'Failed to delete month' });
  }
});

// Get single month with items, transactions, transfers, accounts, and computed simulation
monthsRouter.get('/:year/:month', async (req, res) => {
  try {
    const userId = req.session.userId;
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);

    const month = await Month.findOne({
      userId,
      year,
      month: monthNum
    });

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    const [bankAccounts, wallets] = await Promise.all([
      BankAccount.find({
        userId: req.session.userId,
        isArchived: { $ne: true }
      }).sort({ isPrimary: -1, createdAt: 1 }),
      Wallet.find({
        userId: req.session.userId,
        isArchived: { $ne: true }
      }).sort({ isPrimary: -1, createdAt: 1 })
    ]);

    // If user has accounts, idempotently backfill all unassigned transactions and items to primary bank account
    if (bankAccounts.length > 0) {
      const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
      const validBankIds = bankAccounts.map((b) => b._id);
      const validWalletIds = wallets.map((w) => w._id);

      try {
        await backfillUnassignedTransactions(userId, primaryBank);
        await Item.updateMany(
          {
            userId,
            monthId: month._id,
            $or: [
              { bankAccountId: null },
              { bankAccountId: { $exists: false } },
              { bankAccountId: { $nin: validBankIds } },
              { accountType: 'unassigned' },
              { accountType: null },
              { accountType: { $exists: false } }
            ],
            walletId: { $nin: validWalletIds }
          },
          {
            $set: {
              accountType: 'bank',
              bankAccountId: primaryBank._id
            }
          }
        );
        await Transaction.updateMany(
          {
            userId,
            monthId: month._id,
            $or: [
              { bankAccountId: null },
              { bankAccountId: { $exists: false } },
              { bankAccountId: { $nin: validBankIds } },
              { accountType: 'unassigned' },
              { accountType: null },
              { accountType: { $exists: false } }
            ],
            walletId: { $nin: validWalletIds }
          },
          {
            $set: {
              accountType: 'bank',
              bankAccountId: primaryBank._id
            }
          }
        );

        if (!month.salaryBankAccountId) {
          month.salaryBankAccountId = primaryBank._id;
          await Month.updateOne({ _id: month._id }, { $set: { salaryBankAccountId: primaryBank._id } });
        }
      } catch (backfillErr) {
        console.error('Error during automatic month backfill:', backfillErr);
      }
    }

    const [items, transactions, transfers] = await Promise.all([
      Item.find({
        userId: req.session.userId,
        monthId: month._id
      }).sort({ priority: 1, createdAt: 1 }),
      Transaction.find({
        userId: req.session.userId,
        monthId: month._id
      }).sort({ date: 1, createdAt: 1 }),
      Transfer.find({
        userId: req.session.userId,
        monthId: month._id
      }).sort({ date: 1, createdAt: 1 })
    ]);

    const now = new Date();
    const currentYearMonth = now.getFullYear() * 12 + now.getMonth() + 1;
    const viewingYearMonth = year * 12 + monthNum;

    let currentDay = null;
    if (viewingYearMonth === currentYearMonth) {
      currentDay = now.getDate();
    } else if (viewingYearMonth < currentYearMonth) {
      currentDay = null; // Past month: completed, show ending balance
    } else {
      currentDay = 0; // Future month: show opening balance
    }

    const simulation = simulate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDay,
        salaryBankAccountId: month.salaryBankAccountId,
        isSalaryCredited: Boolean(month.isSalaryCredited),
        salaryCreditedDate: month.salaryCreditedDate,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100,
        accounts: { bankAccounts, wallets },
        accountOpeningBalances: month.accountOpeningBalances || [],
        transfers
      },
      items,
      { year, month: monthNum },
      transactions,
      [],
      transfers
    );

    return res.json({
      month,
      items,
      transactions,
      transfers,
      bankAccounts,
      wallets,
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
      currencySymbol,
      salaryBankAccountId,
      accountOpeningBalances
    } = req.body;

    const update = {};
    if (typeof openingBalance === 'number') {
      update.openingBalance = Math.round(openingBalance);
    } else if (Array.isArray(accountOpeningBalances)) {
      update.openingBalance = accountOpeningBalances.reduce((sum, a) => sum + (Math.round(Number(a.amount)) || 0), 0);
    }
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
    if (salaryBankAccountId !== undefined) update.salaryBankAccountId = salaryBankAccountId || null;
    if (typeof req.body.salaryCreditedDate === 'string') {
      update.salaryCreditedDate = req.body.salaryCreditedDate.trim() || null;
      update.incomeCreditDate = update.salaryCreditedDate;
      if (update.salaryCreditedDate) {
        update.isSalaryCredited = true;
        const parts = update.salaryCreditedDate.split('-');
        const parsedD = parseInt(parts[2], 10);
        if (!isNaN(parsedD)) {
          update.incomeCreditDay = Math.max(1, Math.min(31, parsedD));
        }
      }
    }
    if (typeof req.body.isSalaryCredited === 'boolean') {
      update.isSalaryCredited = req.body.isSalaryCredited;
      if (req.body.isSalaryCredited && !update.salaryCreditedDate) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        update.salaryCreditedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      } else if (!req.body.isSalaryCredited) {
        update.salaryCreditedDate = null;
      }
    }
    if (Array.isArray(accountOpeningBalances)) update.accountOpeningBalances = accountOpeningBalances;

    const month = await Month.findOneAndUpdate(
      { userId: req.session.userId, year, month: monthNum },
      { $set: update },
      { new: true }
    );

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    const activeBanks = await BankAccount.find({ userId: req.session.userId, isArchived: { $ne: true } });
    const activeWallets = await Wallet.find({ userId: req.session.userId, isArchived: { $ne: true } });
    const primaryBank = activeBanks.find((b) => b.isPrimary) || activeBanks[0];
    const targetBankId = update.salaryBankAccountId || (primaryBank ? primaryBank._id : null);
    const validBankIds = activeBanks.map((b) => b._id);
    const validWalletIds = activeWallets.map((w) => w._id);

    if (targetBankId) {
      await Promise.all([
        Item.updateMany(
          {
            userId: req.session.userId,
            monthId: month._id,
            $or: [
              { bankAccountId: null },
              { bankAccountId: { $exists: false } },
              { bankAccountId: { $nin: validBankIds } },
              { accountType: 'unassigned' },
              { accountType: null },
              { accountType: { $exists: false } }
            ],
            walletId: { $nin: validWalletIds }
          },
          {
            $set: {
              accountType: 'bank',
              bankAccountId: targetBankId
            }
          }
        ),
        Transaction.updateMany(
          {
            userId: req.session.userId,
            monthId: month._id,
            $or: [
              { bankAccountId: null },
              { bankAccountId: { $exists: false } },
              { bankAccountId: { $nin: validBankIds } },
              { accountType: 'unassigned' },
              { accountType: null },
              { accountType: { $exists: false } }
            ],
            walletId: { $nin: validWalletIds }
          },
          {
            $set: {
              accountType: 'bank',
              bankAccountId: targetBankId
            }
          }
        )
      ]);
    }

    if (update.salaryCreditedDate) {
      await Transaction.updateMany(
        {
          userId: req.session.userId,
          monthId: month._id,
          $or: [{ isSalary: true }, { tag: 'Salary' }]
        },
        {
          $set: { date: update.salaryCreditedDate }
        }
      );
    }

    const [items, transactions, transfers, bankAccounts, wallets] = await Promise.all([
      Item.find({ userId: req.session.userId, monthId: month._id }).sort({ priority: 1, createdAt: 1 }),
      Transaction.find({ userId: req.session.userId, monthId: month._id }).sort({ date: 1, createdAt: 1 }),
      Transfer.find({ userId: req.session.userId, monthId: month._id }).sort({ date: 1, createdAt: 1 }),
      BankAccount.find({ userId: req.session.userId, isArchived: { $ne: true } }),
      Wallet.find({ userId: req.session.userId, isArchived: { $ne: true } })
    ]);

    const now = new Date();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const currentDay = isCurrentMonth ? now.getDate() : null;

    const simulation = simulate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDay,
        salaryBankAccountId: month.salaryBankAccountId,
        isSalaryCredited: Boolean(month.isSalaryCredited),
        salaryCreditedDate: month.salaryCreditedDate,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100,
        accounts: { bankAccounts, wallets },
        accountOpeningBalances: month.accountOpeningBalances || [],
        transfers
      },
      items,
      { year, month: monthNum },
      transactions,
      [],
      transfers
    );

    return res.json({ month, items, transactions, transfers, bankAccounts, wallets, simulation });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update month' });
  }
});

// Dedicated 1-click endpoint to credit salary
monthsRouter.post('/:year/:month/credit-salary', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const month = await Month.findOne({ userId: req.session.userId, year, month: monthNum });
    if (!month) return res.status(404).json({ error: 'Month not found' });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const [bankAccounts, wallets] = await Promise.all([
      BankAccount.find({ userId: req.session.userId, isArchived: { $ne: true } }),
      Wallet.find({ userId: req.session.userId, isArchived: { $ne: true } })
    ]);

    const targetBank = (month.salaryBankAccountId ? bankAccounts.find(b => String(b._id || b.id) === String(month.salaryBankAccountId)) : null) ||
                       bankAccounts.find(b => b.isPrimary) ||
                       bankAccounts[0];

    const salaryAmt = Number(req.body.amount || month.incomeAmount || 0);
    const creditDate = req.body.date || todayStr;

    // Check if an existing salary transaction is present to avoid duplicate
    let salaryTx = await Transaction.findOne({
      userId: req.session.userId,
      monthId: month._id,
      $or: [
        { isSalary: true },
        { tag: 'Salary' }
      ]
    });

    if (!salaryTx && salaryAmt > 0) {
      salaryTx = new Transaction({
        userId: req.session.userId,
        monthId: month._id,
        amount: salaryAmt,
        date: creditDate,
        note: 'Monthly Salary',
        tag: 'Salary',
        accountType: 'bank',
        bankAccountId: targetBank ? targetBank._id : null,
        isIncome: true
      });
      await salaryTx.save();
    }

    month.isSalaryCredited = true;
    month.salaryCreditedDate = creditDate;
    if (targetBank && !month.salaryBankAccountId) {
      month.salaryBankAccountId = targetBank._id;
    }
    await month.save();

    const [items, transactions, transfers] = await Promise.all([
      Item.find({ userId: req.session.userId, monthId: month._id }).sort({ priority: 1, createdAt: 1 }),
      Transaction.find({ userId: req.session.userId, monthId: month._id }).sort({ date: 1, createdAt: 1 }),
      Transfer.find({ userId: req.session.userId, monthId: month._id }).sort({ date: 1, createdAt: 1 })
    ]);

    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const viewingYearMonth = `${year}-${String(monthNum).padStart(2, '0')}`;
    let currentDay;
    if (viewingYearMonth === currentYearMonth) currentDay = now.getDate();
    else if (viewingYearMonth < currentYearMonth) currentDay = null;
    else currentDay = 0;

    const simulation = simulate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDay,
        salaryBankAccountId: month.salaryBankAccountId,
        isSalaryCredited: true,
        salaryCreditedDate: month.salaryCreditedDate,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100,
        accounts: { bankAccounts, wallets },
        accountOpeningBalances: month.accountOpeningBalances || [],
        transfers
      },
      items,
      { year, month: monthNum },
      transactions,
      [],
      transfers
    );

    return res.json({ success: true, month, transaction: salaryTx, simulation, items, transactions, transfers, bankAccounts, wallets });
  } catch (err) {
    console.error('Error crediting salary:', err);
    return res.status(500).json({ error: 'Failed to credit salary' });
  }
});

// Recommend optimal purchase date for a one-time purchase
monthsRouter.post('/:year/:month/recommend-purchase-date', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const { amount, fundingSource } = req.body;

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

    const [items, transactions, transfers, bankAccounts, wallets] = await Promise.all([
      Item.find({ userId: req.session.userId, monthId: month._id }),
      Transaction.find({ userId: req.session.userId, monthId: month._id }),
      Transfer.find({ userId: req.session.userId, monthId: month._id }),
      BankAccount.find({ userId: req.session.userId, isArchived: { $ne: true } }),
      Wallet.find({ userId: req.session.userId, isArchived: { $ne: true } })
    ]);

    const now = new Date();
    const isCurrentMonth = Number(year) === now.getFullYear() && Number(monthNum) === (now.getMonth() + 1);
    const clientDay = (typeof req.body?.currentDay === 'number' && req.body.currentDay >= 1) ? Math.floor(req.body.currentDay) : null;
    const currentDay = clientDay !== null ? clientDay : (isCurrentMonth ? now.getDate() : 0);

    const recommendation = recommendPurchaseDate(
      {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDay,
        salaryBankAccountId: month.salaryBankAccountId,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: month.unplannedAllowance || 0,
        currentDay,
        scale: 100,
        accounts: { bankAccounts, wallets },
        accountOpeningBalances: month.accountOpeningBalances || [],
        transfers
      },
      items,
      { year, month: monthNum },
      Number(amount),
      transactions,
      [],
      transfers,
      fundingSource || null
    );

    return res.json(recommendation);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to recommend purchase date' });
  }
});

// Month rollover handler supporting /:year/:month/rollover and /rollover
const handleRollover = async (req, res) => {
  try {
    const currentYear = Number(req.params.year || req.body.currentYear);
    const currentMonthNum = Number(req.params.month || req.body.currentMonthNum);
    const carryBalance = req.body.carryBalance;

    if (!currentYear || !currentMonthNum) {
      return res.status(400).json({ error: 'currentYear and currentMonthNum are required' });
    }

    const currentMonth = await Month.findOne({
      userId: req.session.userId,
      year: currentYear,
      month: currentMonthNum
    });

    if (!currentMonth) {
      return res.status(404).json({ error: 'Current month not found' });
    }

    const [currentItems, currentTransactions, currentTransfers, bankAccounts, wallets] = await Promise.all([
      Item.find({
        userId: req.session.userId,
        monthId: currentMonth._id
      }),
      Transaction.find({
        userId: req.session.userId,
        monthId: currentMonth._id
      }),
      Transfer.find({
        userId: req.session.userId,
        monthId: currentMonth._id
      }),
      BankAccount.find({
        userId: req.session.userId,
        isArchived: { $ne: true }
      }),
      Wallet.find({
        userId: req.session.userId,
        isArchived: { $ne: true }
      })
    ]);

    const currentSimulation = simulate(
      {
        openingBalance: currentMonth.openingBalance,
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDate: currentMonth.incomeCreditDate,
        incomeCreditDay: currentMonth.incomeCreditDay,
        salaryBankAccountId: currentMonth.salaryBankAccountId,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        scale: 100,
        accounts: { bankAccounts, wallets },
        accountOpeningBalances: currentMonth.accountOpeningBalances || [],
        transfers: currentTransfers
      },
      currentItems,
      { year: currentYear, month: currentMonthNum },
      currentTransactions,
      [],
      currentTransfers
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
    const nextAccountOpeningBalances = (carryBalance && Array.isArray(currentSimulation.accountSummaries))
      ? currentSimulation.accountSummaries.map((s) => ({
          accountType: s.type,
          accountId: s.id,
          amount: s.endingBalance
        }))
      : [];

    if (!nextMonth) {
      nextMonth = await Month.create({
        userId: req.session.userId,
        year: nextYear,
        month: nextMonthNum,
        openingBalance: newOpeningBalance,
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDate: currentMonth.incomeCreditDate,
        incomeCreditDay: currentMonth.incomeCreditDay,
        salaryBankAccountId: currentMonth.salaryBankAccountId || null,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        currencySymbol: currentMonth.currencySymbol,
        accountOpeningBalances: nextAccountOpeningBalances
      });
    } else if (carryBalance) {
      nextMonth.openingBalance = newOpeningBalance;
      nextMonth.accountOpeningBalances = nextAccountOpeningBalances;
      if (currentMonth.salaryBankAccountId) {
        nextMonth.salaryBankAccountId = currentMonth.salaryBankAccountId;
      }
      await nextMonth.save();
    }

    // Copy FIXED recurring items to next month with account attribution
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
          isFixed: true,
          isPaid: false,
          accountType: item.accountType || null,
          bankAccountId: item.bankAccountId || null,
          walletId: item.walletId || null
        });
      }
    }

    // Per ADR 0041: Copy unpaid one-time items if requested during rollover
    const rolloverUnpaid = Boolean(req.body.rolloverUnpaidOneTimeItems);
    if (rolloverUnpaid) {
      const unpaidOneTimeItems = currentItems.filter((i) => i.type === 'one-time' && i.isPaid === false);
      for (const item of unpaidOneTimeItems) {
        itemsToInsert.push({
          userId: req.session.userId,
          monthId: nextMonth._id,
          type: 'one-time',
          name: item.name,
          priority: item.priority,
          amount: item.amount,
          day: Math.min(28, item.day || 1),
          isPaid: false,
          originalDay: item.day || 1,
          accountType: item.accountType || null,
          bankAccountId: item.bankAccountId || null,
          walletId: item.walletId || null
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
        salaryBankAccountId: nextMonth.salaryBankAccountId,
        safetyFloor: nextMonth.safetyFloor,
        unplannedAllowance: nextMonth.unplannedAllowance || 0,
        scale: 100,
        accounts: { bankAccounts, wallets },
        accountOpeningBalances: nextMonth.accountOpeningBalances || [],
        transfers: []
      },
      allNextItems,
      { year: nextYear, month: nextMonthNum },
      [],
      [],
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
};

monthsRouter.post('/:year/:month/rollover', handleRollover);
monthsRouter.post('/rollover', handleRollover);

// Delete month and items and transactions
monthsRouter.delete('/:year/:month', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);

    const now = new Date();
    if (year === now.getFullYear() && monthNum === (now.getMonth() + 1)) {
      return res.status(400).json({ error: 'The current month cannot be deleted' });
    }

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
      Transaction.deleteMany({ userId: req.session.userId, monthId: month._id }),
      Transfer.deleteMany({ userId: req.session.userId, monthId: month._id })
    ]);

    return res.json({ message: 'Month deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete month' });
  }
});
