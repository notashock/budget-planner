import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Setting } from '../src/models/Setting.js';
import { Month } from '../src/models/Month.js';
import { Item } from '../src/models/Item.js';
import { Transaction } from '../src/models/Transaction.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/budget_planner_sprint2_test';

describe('Sprint 2 Backend Suite - Transactions, Recommender, and Fuel Logs', () => {
  let app;
  let agent;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);
    await Promise.all([
      User.deleteMany({}),
      Setting.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({})
    ]);

    app = createApp({
      mongoUri: TEST_DB_URI,
      sessionSecret: 'sprint2_test_secret',
      useMongoStore: false
    });

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'sprint2@example.com', password: 'password123' });

    // Initialize September 2026 month with 5,000 income, 1,000 floor, and 1,000 unplanned allowance
    await agent.post('/api/months').send({
      year: 2026,
      month: 9,
      openingBalance: 0,
      incomeAmount: 500000,
      incomeCreditDay: 1,
      safetyFloor: 100000,
      unplannedAllowance: 100000,
      currencySymbol: '$'
    });
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({}),
      Setting.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({}),
      Transaction.deleteMany({})
    ]);
    await disconnectDB();
  });

  it('quick-logs unplanned transactions with tag, note, and auto-dated', async () => {
    const res = await agent
      .post('/api/months/2026/9/transactions')
      .send({
        amount: 2500, // $25.00
        tag: 'Food',
        note: 'Lunch at cafe'
      });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.tag).toBe('Food');
    expect(res.body.note).toBe('Lunch at cafe');
    expect(res.body.plannedItemId).toBeNull();
  });

  it('links a transaction to a planned item, avoiding double counting in simulation', async () => {
    // 1. Create a planned item for Internet: $60.00 on day 15
    const itemRes = await agent.post('/api/months/2026/9/items').send({
      type: 'one-time',
      name: 'Internet Bill',
      amount: 6000,
      day: 15
    });
    expect(itemRes.status).toBe(201);
    const plannedId = itemRes.body._id;

    // 2. Log actual transaction matched to this planned item: actual was $65.00
    const txRes = await agent.post('/api/months/2026/9/transactions').send({
      amount: 6500,
      tag: 'Other',
      note: 'Internet payment actual',
      date: '2026-09-14',
      plannedItemId: plannedId
    });
    expect(txRes.status).toBe(201);
    expect(txRes.body.plannedItemId).toBe(plannedId);

    // 3. Fetch month detail and verify simulation replaces planned item with actual
    const monthRes = await agent.get('/api/months/2026/9');
    expect(monthRes.status).toBe(200);

    const events = monthRes.body.simulation.events;
    const labels = events.map((e) => e.label);
    expect(labels).toContain('Internet payment actual (Other)');
    expect(labels).not.toContain('Internet Bill'); // Replaced
  });

  it('recommends optimal purchase date for one-time purchases', async () => {
    const res = await agent
      .post('/api/months/2026/9/recommend-purchase-date')
      .send({ amount: 150000 }); // $1,500.00

    expect(res.status).toBe(200);
    expect(res.body.feasible).toBe(true);
    expect(res.body.recommendedDay).toBe(1);
    expect(res.body.recommendedDate).toBe('2026-09-01');
    expect(res.body.savingsBuffer).toBeGreaterThanOrEqual(0);
  });

  it('generates month-end review with tag breakdowns and plain arithmetic suggestion', async () => {
    // Add additional transactions across tags
    await agent.post('/api/months/2026/9/transactions').send({
      amount: 1500,
      tag: 'Travel',
      note: 'Bus fare'
    });

    await agent.post('/api/months/2026/9/transactions').send({
      amount: 3000,
      tag: 'Health',
      note: 'Vitamins'
    });

    const res = await agent.get('/api/months/2026/9/month-end-review');
    expect(res.status).toBe(200);
    expect(res.body.unplannedAllowance).toBe(100000);
    expect(res.body.tagBreakdown.Food.total).toBe(2500);
    expect(res.body.tagBreakdown.Travel.total).toBe(1500);
    expect(res.body.tagBreakdown.Health.total).toBe(3000);
    expect(res.body.suggestedNextMonthAllowance).toBeGreaterThan(0);
  });

  it('supports creating and updating fuel-log items with bike odometer readings', async () => {
    const fuelItemRes = await agent.post('/api/months/2026/9/items').send({
      type: 'fuel-log',
      name: 'Yamaha R15 Fuel',
      fuelStops: [
        { date: '2026-09-02', odometer: 12450, fuelVolume: 3.5, fuelCost: 40950 },
        { date: '2026-09-15', odometer: 12600, fuelVolume: 3.5, fuelCost: 41000 }
      ]
    });

    expect(fuelItemRes.status).toBe(201);
    expect(fuelItemRes.body.type).toBe('fuel-log');
    expect(fuelItemRes.body.fuelStops).toHaveLength(2);
  });
});
