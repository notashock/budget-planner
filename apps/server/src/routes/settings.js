import express from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { serialize } from '../utils/serializer.js';

export const settingsRouter = express.Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    let userSettings = await db.query.settings.findFirst({
      where: eq(s.settings.userId, userId)
    });
    if (!userSettings) {
      const [created] = await db.insert(s.settings).values({
        userId,
        defaultIncomeAmount: 0,
        defaultIncomeCreditDay: 1,
        defaultSafetyFloor: 0,
        defaultUnplannedAllowance: 0,
        currencySymbol: '₹',
        aiAssistantEnabled: false,
        theme: 'system'
      }).returning();
      userSettings = created;
    }
    return res.json(serialize(userSettings));
  } catch (err) {
    console.error('Settings fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

settingsRouter.put('/', async (req, res) => {
  try {
    const userId = req.userId || req.session?.userId;
    const {
      defaultIncomeAmount,
      defaultIncomeCreditDay,
      defaultSafetyFloor,
      defaultUnplannedAllowance,
      currencySymbol,
      defaultSalaryAccountId,
      defaultSalaryBankAccountId,
      aiAssistantEnabled,
      theme,
      incomeMode,
      periodType
    } = req.body;

    const update = {};
    if (['salary', 'irregular', 'both'].includes(incomeMode)) update.incomeMode = incomeMode;
    if (['calendar_month', 'salary_cycle'].includes(periodType)) update.periodType = periodType;
    if (typeof defaultIncomeAmount === 'number') update.defaultIncomeAmount = Math.round(defaultIncomeAmount);
    if (typeof defaultIncomeCreditDay === 'number') {
      update.defaultIncomeCreditDay = Math.max(1, Math.min(31, Math.floor(defaultIncomeCreditDay)));
    }
    if (typeof defaultSafetyFloor === 'number') update.defaultSafetyFloor = Math.round(defaultSafetyFloor);
    if (typeof defaultUnplannedAllowance === 'number') update.defaultUnplannedAllowance = Math.round(defaultUnplannedAllowance);
    if (typeof currencySymbol === 'string' && currencySymbol.trim()) update.currencySymbol = currencySymbol.trim();
    
    const targetSalaryAccId = defaultSalaryAccountId || defaultSalaryBankAccountId;
    if (targetSalaryAccId !== undefined) {
      update.defaultSalaryAccountId = targetSalaryAccId || null;
    }
    if (typeof aiAssistantEnabled === 'boolean') update.aiAssistantEnabled = aiAssistantEnabled;
    if (typeof theme === 'string') update.theme = theme;
    update.updatedAt = new Date();

    const [updatedSettings] = await db.insert(s.settings)
      .values({
        userId,
        ...update
      })
      .onConflictDoUpdate({
        target: s.settings.userId,
        set: update
      })
      .returning();

    return res.json(serialize(updatedSettings));
  } catch (err) {
    console.error('Settings update error:', err);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});
