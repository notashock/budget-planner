import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Setting } from '../src/models/Setting.js';
import { Month } from '../src/models/Month.js';
import { Item } from '../src/models/Item.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/budget_planner_test';

describe('Server API Endpoints', () => {
  let app;

  beforeAll(async () => {
    await connectDB(TEST_DB_URI);
    // Clean test database
    await Promise.all([
      User.deleteMany({}),
      Setting.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({})
    ]);

    app = createApp({
      mongoUri: TEST_DB_URI,
      sessionSecret: 'test_secret',
      useMongoStore: false // Use memory store for fast testing
    });
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({}),
      Setting.deleteMany({}),
      Month.deleteMany({}),
      Item.deleteMany({})
    ]);
    await disconnectDB();
  });

  it('rejects unauthenticated requests to protected endpoints', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('registers a user, sets session, and creates default settings', async () => {
    const agent = request.agent(app);

    const regRes = await agent
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(regRes.status).toBe(201);
    expect(regRes.body.user).toBeDefined();
    expect(regRes.body.user.email).toBe('test@example.com');

    // Should now access /api/settings seamlessly with session
    const settingsRes = await agent.get('/api/settings');
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.currencySymbol).toBe('$');
    expect(settingsRes.body.aiAssistantEnabled).toBe(false);
  });

  it('runs the acceptance fixture through month and items endpoints', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    // 1. Create Month (2026-09) with income 19,799 and floor 1,000 in minor units (scale 100)
    const monthRes = await agent.post('/api/months').send({
      year: 2026,
      month: 9,
      openingBalance: 0,
      incomeAmount: 1979900,
      incomeCreditDay: 1,
      safetyFloor: 100000,
      currencySymbol: '$'
    });
    expect(monthRes.status).toBe(201);

    // 2. Add Rent (recurring 8,500 on day 1)
    await agent.post('/api/months/2026/9/items').send({
      type: 'recurring',
      name: 'Rent',
      amount: 850000,
      dayOfMonth: 1
    });

    // 3. Add one-time items: 3,000 on day 2; 2,000 on day 3
    await agent.post('/api/months/2026/9/items').send({
      type: 'one-time',
      name: 'Expense Day 2',
      amount: 300000,
      day: 2
    });

    await agent.post('/api/months/2026/9/items').send({
      type: 'one-time',
      name: 'Expense Day 3',
      amount: 200000,
      day: 3
    });

    // 4. Add Formula Trip: 50 km, 42.5 km/L, fuel 117/L (11700), extra 300 (30000) on days [10, 17, 25]
    await agent.post('/api/months/2026/9/items').send({
      type: 'formula',
      name: 'Work Trip',
      formulaConfig: {
        distance: 50,
        efficiency: 42.5,
        fuelPrice: 11700,
        extraCost: 30000,
        dates: [10, 17, 25]
      }
    });

    // 5. Add one-time 282 on day 12; one-time 2,803 on day 18
    await agent.post('/api/months/2026/9/items').send({
      type: 'one-time',
      name: 'Expense Day 12',
      amount: 28200,
      day: 12
    });

    await agent.post('/api/months/2026/9/items').send({
      type: 'one-time',
      name: 'Expense Day 18',
      amount: 280300,
      day: 18
    });

    // 6. Add recurring 89 on day 24; recurring 319 on day 27
    await agent.post('/api/months/2026/9/items').send({
      type: 'recurring',
      name: 'Sub 1',
      amount: 8900,
      dayOfMonth: 24
    });

    await agent.post('/api/months/2026/9/items').send({
      type: 'recurring',
      name: 'Sub 2',
      amount: 31900,
      dayOfMonth: 27
    });

    // 7. Fetch Month details and computed simulation
    const detailRes = await agent.get('/api/months/2026/9');
    expect(detailRes.status).toBe(200);

    const { simulation, items } = detailRes.body;
    expect(items).toHaveLength(8);

    // Verify engine calculation:
    // Ending balance: 149200 ($1,492.00)
    // Lowest balance: 149200 ($1,492.00)
    // Floor breached: false
    expect(simulation.endingBalance).toBe(149200);
    expect(simulation.lowestBalance).toBe(149200);
    expect(simulation.lowestDate).toBe('2026-09-27');
    expect(simulation.floorBreached).toBe(false);
  });

  it('performs month rollover, carrying ending balance and recurring items', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    // Rollover from 2026-09 to 2026-10
    const rolloverRes = await agent
      .post('/api/months/2026/9/rollover')
      .send({ carryBalance: true });

    expect(rolloverRes.status).toBe(201);
    expect(rolloverRes.body.month.year).toBe(2026);
    expect(rolloverRes.body.month.month).toBe(10);
    // Opening balance should equal September ending balance (149200)
    expect(rolloverRes.body.month.openingBalance).toBe(149200);

    // Recurring items (Rent, Sub 1, Sub 2) should be copied
    const recurringNames = rolloverRes.body.items.map((i) => i.name);
    expect(recurringNames).toContain('Rent');
    expect(recurringNames).toContain('Sub 1');
    expect(recurringNames).toContain('Sub 2');
    expect(recurringNames).not.toContain('Expense Day 2'); // One-time not copied
  });
});
