import express from 'express';
import { Month } from '../models/Month.js';
import { Item } from '../models/Item.js';
import { Transaction } from '../models/Transaction.js';
import { BankAccount } from '../models/BankAccount.js';
import { Wallet } from '../models/Wallet.js';
import { requireAuth } from '../middleware/auth.js';

export const itemsRouter = express.Router();
itemsRouter.use(requireAuth);

// Create item in specific month
itemsRouter.post('/months/:year/:month/items', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const { type, name, priority, amount, day, dayOfMonth, formulaConfig } = req.body;

    if (!type || !name || !['one-time', 'recurring', 'fuel-log'].includes(type)) {
      return res.status(400).json({ error: 'Valid item type and name required' });
    }

    const month = await Month.findOne({
      userId: req.session.userId,
      year,
      month: monthNum
    });

    if (!month) {
      return res.status(404).json({ error: 'Month not found' });
    }

    const itemData = {
      userId: req.session.userId,
      monthId: month._id,
      type,
      name: name.trim(),
      priority: typeof priority === 'number' ? priority : 0
    };

    if (type === 'one-time') {
      itemData.amount = Math.round(Number(amount) || 0);
      itemData.day = Math.max(-31, Math.min(31, Math.floor(Number(day) || 1)));
    } else if (type === 'recurring') {
      itemData.amount = Math.round(Number(amount) || 0);
      itemData.dayOfMonth = Math.max(1, Math.min(31, Math.floor(Number(dayOfMonth) || 1)));
      if (typeof req.body.isFixed === 'boolean') {
        itemData.isFixed = req.body.isFixed;
      }
    } else if (type === 'fuel-log') {
      const stops = Array.isArray(req.body.fuelStops) ? req.body.fuelStops : [];
      itemData.fuelStops = stops.map((s) => ({
        date: s.date || `${year}-${String(monthNum).padStart(2, '0')}-01`,
        odometer: Number(s.odometer) || 0,
        fuelVolume: Number(s.fuelVolume) || 0,
        fuelCost: Math.round(Number(s.fuelCost) || 0)
      }));
    }

    if (typeof req.body.isPaid === 'boolean') {
      itemData.isPaid = req.body.isPaid;
    }

    // Resolve Account Attribution per ADR 0035 (mandatory):
    if (req.body.accountType === 'unassigned') {
      return res.status(400).json({ error: 'Account linking is required' });
    }

    let resolvedAccountType = ['bank', 'wallet'].includes(req.body.accountType) ? req.body.accountType : null;
    let resolvedBankAccountId = req.body.bankAccountId || null;
    let resolvedWalletId = req.body.walletId || null;

    if (!resolvedBankAccountId && !resolvedWalletId) {
      let primaryBank = await BankAccount.findOne({
        userId: req.session.userId,
        isArchived: { $ne: true }
      }).sort({ isPrimary: -1, createdAt: 1 });

      if (!primaryBank) {
        const totalAccounts = (await BankAccount.countDocuments({ userId: req.session.userId })) +
          (await Wallet.countDocuments({ userId: req.session.userId }));
        if (totalAccounts === 0) {
          primaryBank = await BankAccount.create({
            userId: req.session.userId,
            name: 'Primary Account',
            institution: 'Default Bank',
            accountType: 'checking',
            isPrimary: true,
            openingBalance: month.openingBalance || 0
          });
        }
      }

      if (primaryBank) {
        resolvedAccountType = 'bank';
        resolvedBankAccountId = primaryBank._id;
      }
    }

    if (!resolvedBankAccountId && !resolvedWalletId) {
      return res.status(400).json({ error: 'A valid Bank Account or Wallet must be linked to the planned item' });
    }

    itemData.accountType = resolvedAccountType;
    itemData.bankAccountId = resolvedBankAccountId;
    itemData.walletId = resolvedWalletId;

    const item = await Item.create(itemData);
    return res.status(201).json(item);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update item
itemsRouter.put('/items/:id', async (req, res) => {
  try {
    const { name, priority, amount, day, dayOfMonth, isFixed, accountType, bankAccountId, walletId } = req.body;

    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (name) item.name = name.trim();
    if (typeof priority === 'number') item.priority = priority;

    if (item.type === 'one-time') {
      if (typeof amount === 'number') item.amount = Math.round(amount);
      if (typeof day === 'number') item.day = Math.max(-31, Math.min(31, Math.floor(day)));
    } else if (item.type === 'recurring') {
      if (typeof amount === 'number') item.amount = Math.round(amount);
      if (typeof dayOfMonth === 'number') item.dayOfMonth = Math.max(1, Math.min(31, Math.floor(dayOfMonth)));
      if (typeof isFixed === 'boolean') item.isFixed = isFixed;
    } else if (item.type === 'fuel-log') {
      if (Array.isArray(req.body.fuelStops)) {
        item.fuelStops = req.body.fuelStops.map((s) => ({
          date: s.date || item.fuelStops?.[0]?.date || '2026-09-01',
          odometer: Number(s.odometer) || 0,
          fuelVolume: Number(s.fuelVolume) || 0,
          fuelCost: Math.round(Number(s.fuelCost) || 0)
        }));
      }
    }

    if (typeof req.body.isPaid === 'boolean') {
      const willBePaid = req.body.isPaid;
      if (willBePaid && !item.isPaid) {
        // Mark as paid: assign today's actual date in current active month
        const parentMonth = await Month.findById(item.monthId);
        const now = new Date();
        const isCurrentMonth = parentMonth && parentMonth.year === now.getFullYear() && parentMonth.month === (now.getMonth() + 1);

        if (isCurrentMonth) {
          if (item.originalDay === undefined || item.originalDay === null) {
            item.originalDay = item.type === 'recurring' ? (item.dayOfMonth || 1) : (item.day || 1);
            item.originalDate = item.date || null;
          }
          const todayDateNum = now.getDate();
          if (item.type === 'one-time') {
            item.day = todayDateNum;
          } else if (item.type === 'recurring') {
            item.dayOfMonth = todayDateNum;
          }
          const pad = (n) => String(n).padStart(2, '0');
          item.date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(todayDateNum)}`;
        }
        item.isPaid = true;
      } else if (!willBePaid && item.isPaid) {
        // Revert to pending: restore original scheduled day if saved
        if (item.originalDay !== undefined && item.originalDay !== null) {
          if (item.type === 'one-time') {
            item.day = item.originalDay;
          } else if (item.type === 'recurring') {
            item.dayOfMonth = item.originalDay;
          }
          if (item.originalDate) {
            item.date = item.originalDate;
          }
          item.originalDay = null;
          item.originalDate = null;
        }
        item.isPaid = false;
      }
    }

    let accountUpdated = false;
    if (accountType !== undefined) {
      if (accountType === 'unassigned') {
        return res.status(400).json({ error: 'Account linking is required' });
      }
      if (['bank', 'wallet'].includes(accountType)) {
        item.accountType = accountType;
        accountUpdated = true;
      }
    }
    if (bankAccountId !== undefined) {
      item.bankAccountId = bankAccountId || null;
      accountUpdated = true;
    }
    if (walletId !== undefined) {
      item.walletId = walletId || null;
      accountUpdated = true;
    }

    await item.save();

    if (accountUpdated) {
      // Synchronize any matched transactions per ADR 0035
      await Transaction.updateMany(
        { plannedItemId: item._id, userId: req.session.userId },
        {
          accountType: item.accountType,
          bankAccountId: item.bankAccountId,
          walletId: item.walletId
        }
      );
    }

    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete item
itemsRouter.delete('/items/:id', async (req, res) => {
  try {
    const item = await Item.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    return res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete item' });
  }
});
