import express from 'express';
import { Month } from '../models/Month.js';
import { Item } from '../models/Item.js';
import { requireAuth } from '../middleware/auth.js';

export const itemsRouter = express.Router();
itemsRouter.use(requireAuth);

// Create item in specific month
itemsRouter.post('/months/:year/:month/items', async (req, res) => {
  try {
    const year = Number(req.params.year);
    const monthNum = Number(req.params.month);
    const { type, name, priority, amount, day, dayOfMonth, formulaConfig } = req.body;

    if (!type || !name || !['one-time', 'recurring', 'formula', 'fuel-log'].includes(type)) {
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
      itemData.day = Math.max(1, Math.min(31, Math.floor(Number(day) || 1)));
    } else if (type === 'recurring') {
      itemData.amount = Math.round(Number(amount) || 0);
      itemData.dayOfMonth = Math.max(1, Math.min(31, Math.floor(Number(dayOfMonth) || 1)));
      if (typeof req.body.isFixed === 'boolean') {
        itemData.isFixed = req.body.isFixed;
      }
    } else if (type === 'formula') {
      const cfg = formulaConfig || {};
      const dates = Array.isArray(cfg.dates)
        ? cfg.dates.map((d) => Math.max(1, Math.min(31, Math.floor(Number(d) || 1))))
        : [];

      itemData.formulaConfig = {
        distance: Number(cfg.distance) || 0,
        efficiency: Number(cfg.efficiency) > 0 ? Number(cfg.efficiency) : 1,
        fuelPrice: Math.round(Number(cfg.fuelPrice) || 0),
        extraCost: Math.round(Number(cfg.extraCost) || 0),
        dates
      };
    } else if (type === 'fuel-log') {
      const stops = Array.isArray(req.body.fuelStops) ? req.body.fuelStops : [];
      itemData.fuelStops = stops.map((s) => ({
        date: s.date || `${year}-${String(monthNum).padStart(2, '0')}-01`,
        odometer: Number(s.odometer) || 0,
        fuelVolume: Number(s.fuelVolume) || 0,
        fuelCost: Math.round(Number(s.fuelCost) || 0)
      }));
    }

    const item = await Item.create(itemData);
    return res.status(201).json(item);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update item
itemsRouter.put('/items/:id', async (req, res) => {
  try {
    const { name, priority, amount, day, dayOfMonth, formulaConfig, isFixed } = req.body;

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
      if (typeof day === 'number') item.day = Math.max(1, Math.min(31, Math.floor(day)));
    } else if (item.type === 'recurring') {
      if (typeof amount === 'number') item.amount = Math.round(amount);
      if (typeof dayOfMonth === 'number') item.dayOfMonth = Math.max(1, Math.min(31, Math.floor(dayOfMonth)));
      if (typeof isFixed === 'boolean') item.isFixed = isFixed;
    } else if (item.type === 'formula') {
      if (formulaConfig) {
        if (typeof formulaConfig.distance === 'number') item.formulaConfig.distance = formulaConfig.distance;
        if (typeof formulaConfig.efficiency === 'number' && formulaConfig.efficiency > 0) {
          item.formulaConfig.efficiency = formulaConfig.efficiency;
        }
        if (typeof formulaConfig.fuelPrice === 'number') {
          item.formulaConfig.fuelPrice = Math.round(formulaConfig.fuelPrice);
        }
        if (typeof formulaConfig.extraCost === 'number') {
          item.formulaConfig.extraCost = Math.round(formulaConfig.extraCost);
        }
        if (Array.isArray(formulaConfig.dates)) {
          item.formulaConfig.dates = formulaConfig.dates.map((d) =>
            Math.max(1, Math.min(31, Math.floor(Number(d) || 1)))
          );
        }
      }
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

    await item.save();
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
