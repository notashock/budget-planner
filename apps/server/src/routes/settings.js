import express from 'express';
import { Setting } from '../models/Setting.js';
import { requireAuth } from '../middleware/auth.js';

export const settingsRouter = express.Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (req, res) => {
  try {
    let settings = await Setting.findOne({ userId: req.session.userId });
    if (!settings) {
      settings = await Setting.create({
        userId: req.session.userId,
        defaultIncomeAmount: 0,
        defaultIncomeCreditDay: 1,
        defaultSafetyFloor: 0,
        currencySymbol: '$',
        aiAssistantEnabled: false
      });
    }
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

settingsRouter.put('/', async (req, res) => {
  try {
    const {
      defaultIncomeAmount,
      defaultIncomeCreditDay,
      defaultSafetyFloor,
      currencySymbol,
      aiAssistantEnabled
    } = req.body;

    const update = {};
    if (typeof defaultIncomeAmount === 'number') update.defaultIncomeAmount = Math.round(defaultIncomeAmount);
    if (typeof defaultIncomeCreditDay === 'number') {
      update.defaultIncomeCreditDay = Math.max(1, Math.min(31, Math.floor(defaultIncomeCreditDay)));
    }
    if (typeof defaultSafetyFloor === 'number') update.defaultSafetyFloor = Math.round(defaultSafetyFloor);
    if (typeof currencySymbol === 'string' && currencySymbol.trim()) update.currencySymbol = currencySymbol.trim();
    if (typeof aiAssistantEnabled === 'boolean') update.aiAssistantEnabled = aiAssistantEnabled;

    const settings = await Setting.findOneAndUpdate(
      { userId: req.session.userId },
      { $set: update },
      { new: true, upsert: true }
    );

    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});
