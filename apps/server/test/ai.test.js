import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Setting } from '../src/models/Setting.js';
import { validateDraftItemSchema, validateExplanationSchema } from '../src/ai/schema.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/budget_planner_ai_test';

describe('AI Assistant & Toggle Suite', () => {
  let app;
  let agent;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);
    await Promise.all([User.deleteMany({}), Setting.deleteMany({})]);

    app = createApp({
      mongoUri: TEST_DB_URI,
      sessionSecret: 'test_ai_secret',
      useMongoStore: false
    });

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'ai-user@example.com', password: 'password123' });
  });

  afterAll(async () => {
    await Promise.all([User.deleteMany({}), Setting.deleteMany({})]);
    await disconnectDB();
  });

  it('rejects AI endpoint requests when toggle is off by default (403 Forbidden)', async () => {
    const res = await agent
      .post('/api/ai/parse-text')
      .send({ text: 'Dinner 50 on day 10' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });

  it('allows AI requests once aiAssistantEnabled toggle is activated', async () => {
    // 1. Enable toggle in settings
    const settingRes = await agent
      .put('/api/settings')
      .send({ aiAssistantEnabled: true });
    expect(settingRes.body.aiAssistantEnabled).toBe(true);

    // 2. Now call parse-text
    const parseRes = await agent
      .post('/api/ai/parse-text')
      .send({ text: 'Groceries 250 on day 15' });

    expect(parseRes.status).toBe(200);
    expect(parseRes.body.item).toBeDefined();
    expect(parseRes.body.item.type).toBe('one-time');
    expect(parseRes.body.item.amount).toBe(25000);
    expect(parseRes.body.item.day).toBe(15);
  });

  it('explains timeline when enabled and provides recommendations', async () => {
    const explainRes = await agent
      .post('/api/ai/explain-timeline')
      .send({
        safetyFloor: 100000,
        timelineSummary: {
          endingBalance: 80000,
          lowestBalance: 80000,
          lowestDate: '2026-09-20',
          floorBreached: true,
          events: [
            { date: '2026-09-01', label: 'Income', amount: 200000, balanceAfter: 200000 },
            { date: '2026-09-20', label: 'Car Repair', amount: -120000, balanceAfter: 80000 }
          ]
        }
      });

    expect(explainRes.status).toBe(200);
    expect(explainRes.body.summary).toBeDefined();
    expect(Array.isArray(explainRes.body.suggestions)).toBe(true);
    expect(explainRes.body.suggestions.length).toBeGreaterThan(0);
  });

  it('strictly validates schema and rejects non-conforming model outputs', () => {
    // Missing required name
    expect(() => validateDraftItemSchema({ type: 'one-time', amount: 5000 })).toThrow(/name/);

    // Invalid item type
    expect(() => validateDraftItemSchema({ name: 'Test', type: 'crypto' })).toThrow(/Invalid item type/);

    // Reject removed formula item type
    expect(() => validateDraftItemSchema({ name: 'Trip', type: 'formula' })).toThrow(/Invalid item type/);

    // Valid explanation schema
    const validExplanation = validateExplanationSchema({
      summary: 'Floor maintained',
      suggestions: ['Keep doing this']
    });
    expect(validExplanation.summary).toBe('Floor maintained');

    // Invalid explanation
    expect(() => validateExplanationSchema({ summary: '' })).toThrow(/non-empty/);
  });
});
