import express from 'express';
import rateLimit from 'express-rate-limit';
import { Setting } from '../models/Setting.js';
import { requireAuth } from '../middleware/auth.js';
import { GeminiAssistantAdapter } from '../ai/geminiAdapter.js';

export const aiRouter = express.Router();
aiRouter.use(requireAuth);

// Rate limiter: max 20 AI requests per 10 minutes per IP
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: 'Too many assistant requests. Please wait a few minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

aiRouter.use(aiLimiter);

// Middleware: ensure AI assistant is enabled in user settings
async function requireAiEnabled(req, res, next) {
  try {
    const setting = await Setting.findOne({ userId: req.session.userId });
    if (!setting || !setting.aiAssistantEnabled) {
      return res.status(403).json({
        error: 'AI assistant is disabled. Enable it in settings to use this feature.'
      });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify AI assistant permissions' });
  }
}

aiRouter.use(requireAiEnabled);

const adapter = new GeminiAssistantAdapter(process.env.GEMINI_API_KEY);

// POST /api/ai/parse-text
aiRouter.post('/parse-text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Input text is required' });
    }

    const draftItem = await adapter.parseText(text);
    return res.json({ item: draftItem });
  } catch (err) {
    return res.status(422).json({ error: err.message || 'Failed to parse text' });
  }
});

// POST /api/ai/explain-timeline
aiRouter.post('/explain-timeline', async (req, res) => {
  try {
    const { timelineSummary, safetyFloor } = req.body;
    if (!timelineSummary || typeof safetyFloor !== 'number') {
      return res.status(400).json({ error: 'Valid timeline summary and safety floor required' });
    }

    // Strip sensitive fields: only keep label, amount, balanceAfter, date
    const sanitizedEvents = (timelineSummary.events || []).map((e) => ({
      date: e.date,
      label: String(e.label || 'Expense'),
      amount: Number(e.amount) || 0,
      balanceAfter: Number(e.balanceAfter) || 0
    }));

    const cleanSummary = {
      endingBalance: Number(timelineSummary.endingBalance) || 0,
      lowestBalance: Number(timelineSummary.lowestBalance) || 0,
      lowestDate: String(timelineSummary.lowestDate || ''),
      floorBreached: Boolean(timelineSummary.floorBreached),
      events: sanitizedEvents
    };

    const explanation = await adapter.explainTimeline(cleanSummary, safetyFloor);
    return res.json(explanation);
  } catch (err) {
    return res.status(422).json({ error: err.message || 'Failed to explain timeline' });
  }
});
