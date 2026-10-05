import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Setting } from '../src/models/Setting.js';
import { Month } from '../src/models/Month.js';
import { Item } from '../src/models/Item.js';
import { Transaction } from '../src/models/Transaction.js';
import { Goal } from '../src/models/Goal.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/budget_planner_sprint3_test';

describe('Sprint 3 Backend Suite - Fixed Recurring, Goals, and Refund Mapping', () => {
  let app;
  let agent;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);
    await Promise.all([
      User.deleteMany({}),
      Setting.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({}),
      Goal.deleteMany({})
    ]);

    app = createApp({
      mongoUri: TEST_DB_URI,
      sessionSecret: 'sprint3_test_secret',
      useMongoStore: false
    });

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'sprint3@example.com', password: 'password123' });

    // Initialize month (September 2026)
    await agent.post('/api/months').send({
      year: 2026,
      month: 9,
      openingBalance: 0,
      incomeAmount: 500000,
      incomeCreditDay: 1,
      safetyFloor: 100000,
      unplannedAllowance: 50000,
      currencySymbol: '$'
    });
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({}),
      Setting.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({}),
      Goal.deleteMany({})
    ]);
    await disconnectDB();
  });

  it('copies only recurring items with isFixed: true during month rollover', async () => {
    // 1. Add fixed recurring item (Rent, $800, isFixed: true)
    await agent.post('/api/months/2026/9/items').send({
      type: 'recurring',
      name: 'Fixed Rent',
      amount: 80000,
      dayOfMonth: 1,
      isFixed: true
    });

    // 2. Add variable/temporary recurring item (Trial gym pass, $30, isFixed: false)
    await agent.post('/api/months/2026/9/items').send({
      type: 'recurring',
      name: 'Gym Trial',
      amount: 3000,
      dayOfMonth: 10,
      isFixed: false
    });

    // 3. Perform rollover to October 2026
    const rolloverRes = await agent.post('/api/months/2026/9/rollover').send({ carryBalance: true });
    expect(rolloverRes.status).toBe(201);

    const octItems = rolloverRes.body.items;
    const itemNames = octItems.map((i) => i.name);

    // Only 'Fixed Rent' should be carried over
    expect(itemNames).toContain('Fixed Rent');
    expect(itemNames).not.toContain('Gym Trial');
  });

  it('manages purchase goals with evaluation, 1-tap conversion, and deferral', async () => {
    // 1. Create a purchase goal: Headphones for $250
    const goalRes = await agent
      .post('/api/months/2026/9/goals')
      .send({ name: 'Noise Cancelling Headphones', targetAmount: 25000 });

    expect(goalRes.status).toBe(201);
    expect(goalRes.body.name).toBe('Noise Cancelling Headphones');
    expect(goalRes.body.recommendation.feasible).toBe(true);
    // Diversifies away from Day 1's heavy Fixed Rent (80,000) to zero-load Day 2
    expect(goalRes.body.recommendation.recommendedDay).toBe(2);

    const goalId = goalRes.body._id;

    // 2. 1-tap convert goal into scheduled item
    const convertRes = await agent.post(`/api/goals/${goalId}/convert-to-item`);
    expect(convertRes.status).toBe(201);
    expect(convertRes.body.item.name).toBe('Noise Cancelling Headphones');
    expect(convertRes.body.item.day).toBe(2);
    expect(['scheduled', 'ready']).toContain(convertRes.body.goal.status);

    // 3. Create another goal that is too expensive and defer it
    const bigGoalRes = await agent
      .post('/api/months/2026/9/goals')
      .send({ name: 'High End Laptop', targetAmount: 800000 }); // $8,000 exceeds income

    expect(bigGoalRes.status).toBe(201);
    expect(bigGoalRes.body.recommendation.feasible).toBe(false);

    // Defer to next month
    const deferRes = await agent.post(`/api/goals/${bigGoalRes.body._id}/defer`);
    expect(deferRes.status).toBe(200);
    expect(deferRes.body.goal.status).toBe('deferred');
  });

  it('reflects net refunds for mapped items in month simulation', async () => {
    // Planned item: Telegram Premium 319 ($319.00)
    const itemRes = await agent.post('/api/months/2026/9/items').send({
      type: 'recurring',
      name: 'Telegram Premium',
      amount: 31900,
      dayOfMonth: 5
    });
    const itemId = itemRes.body._id;

    // Log mapped refund: $300.00 (-30,000)
    await agent.post('/api/months/2026/9/transactions').send({
      amount: -30000,
      tag: 'Other',
      note: 'Partial refund',
      plannedItemId: itemId
    });

    const monthRes = await agent.get('/api/months/2026/9');
    expect(monthRes.status).toBe(200);

    const netMap = monthRes.body.simulation.itemNetMap;
    expect(netMap[itemId]).toBeDefined();
    expect(netMap[itemId].originalAmount).toBe(31900);
    expect(netMap[itemId].refundTotal).toBe(30000);
    expect(netMap[itemId].netAmount).toBe(1900); // Net is $19.00!
  });
});
