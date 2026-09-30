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

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/budget_planner_sprint4_test';

describe('Sprint 4 Backend Suite - Salary Credit Date, Dynamic Goals, Rupee, and No Formula', () => {
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
      sessionSecret: 'sprint4_test_secret',
      useMongoStore: false
    });

    agent = request.agent(app);

    // Register test user
    await agent.post('/api/auth/register').send({
      email: 'sprint4@example.com',
      password: 'password123'
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

  it('defaults currency symbol to Rupee (₹) in settings and months', async () => {
    const settingsRes = await agent.get('/api/settings');
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.currencySymbol).toBe('₹');

    // Create a new month without specifying currency symbol
    const monthRes = await agent.post('/api/months').send({
      year: 2026,
      month: 10,
      openingBalance: 0,
      incomeAmount: 7500000,
      incomeCreditDate: '2026-09-30'
    });

    expect(monthRes.status).toBe(201);
    expect(monthRes.body.currencySymbol).toBe('₹');
    expect(monthRes.body.incomeCreditDate).toBe('2026-09-30');
  });

  it('handles salary credited on Sept 30th for October as available Day 1 cash', async () => {
    // Add Day 1 rent expense for ₹25,000 (2,500,000 minor units)
    await agent.post('/api/months/2026/10/items').send({
      type: 'recurring',
      name: 'October Rent',
      amount: 2500000,
      dayOfMonth: 1,
      isFixed: true
    });

    const detailRes = await agent.get('/api/months/2026/10');
    expect(detailRes.status).toBe(200);

    const { simulation } = detailRes.body;
    expect(simulation.events).toBeDefined();

    // Verify salary credited event appears on Day 1 (Oct 1)
    const incomeEvent = simulation.events.find((e) => e.amount > 0);
    expect(incomeEvent).toBeDefined();
    expect(incomeEvent.date).toBe('2026-10-01');
    expect(incomeEvent.label).toContain('Salary (credited 2026-09-30)');

    // Opening Day 1 balance: 75,000 - 25,000 = 50,000 (5,000,000 minor units)
    expect(simulation.dailyBalances[0].balance).toBe(5000000);
    expect(simulation.floorBreached).toBe(false);
  });

  it('rejects legacy formula items with status 400', async () => {
    const res = await agent.post('/api/months/2026/10/items').send({
      type: 'formula',
      name: 'Old Formula Trip',
      formulaConfig: {
        distance: 50,
        efficiency: 15,
        fuelPrice: 10000,
        extraCost: 0,
        dates: [5]
      }
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Valid item type and name required');
  });

  it('evaluates purchase goals dynamically and returns recommendedDate: null if infeasible', async () => {
    // Goal 1: Feasible item (Smartphone for ₹20,000)
    const goalRes = await agent.post('/api/months/2026/10/goals').send({
      name: 'Smartphone',
      targetAmount: 2000000
    });

    expect(goalRes.status).toBe(201);
    expect(goalRes.body.recommendation.feasible).toBe(true);
    expect(goalRes.body.recommendation.recommendedDate).toBeDefined();
    expect(goalRes.body.recommendation.recommendedDay).toBeGreaterThanOrEqual(1);

    // Goal 2: Infeasible item (Luxury Bike for ₹80,000 when remaining cash is ₹30,000)
    const infeasibleRes = await agent.post('/api/months/2026/10/goals').send({
      name: 'Luxury Bike',
      targetAmount: 8000000
    });

    expect(infeasibleRes.status).toBe(201);
    expect(infeasibleRes.body.recommendation.feasible).toBe(false);
    // MUST be strictly null - never return an arbitrary date!
    expect(infeasibleRes.body.recommendation.recommendedDate).toBeNull();
    expect(infeasibleRes.body.recommendation.recommendedDay).toBeNull();
    expect(infeasibleRes.body.recommendation.explanation).toContain('Price is too high for this month');
  });
});
