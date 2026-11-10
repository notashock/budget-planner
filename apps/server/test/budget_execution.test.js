import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { MonthLifecycle } from '../src/domain/monthLifecycle.js';

describe('BudgetExecution & Goal Evaluation Seam Suite', () => {
  let app;
  let testUserId;
  let testUserEmail = `budget_exec_${Date.now()}@example.com`;
  let authToken;
  let bankId;
  let spentTxId;

  beforeAll(async () => {
    app = createApp({ sessionSecret: 'test_secret_exec' });

    // Register test user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: testUserEmail, password: 'password123' });
    expect(regRes.status).toBe(201);
    expect(regRes.body.status).toBe('success');
    authToken = regRes.body.data.token;
    testUserId = regRes.body.data.user.id;

    // Create a primary bank account
    const accRes = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'HDFC Checking',
        institution: 'HDFC Bank',
        openingBalance: 50000,
        isPrimary: true
      });
    expect(accRes.status).toBe(201);
    bankId = accRes.body.data.id;

    // Create a budget month
    await MonthLifecycle.createMonth(testUserId, {
      year: 2026,
      month: 11,
      openingBalance: 50000,
      incomeAmount: 60000,
      safetyFloor: 15000,
      unplannedAllowance: 10000,
      salaryAccountId: bankId,
      accountOpeningBalances: [{ accountId: bankId, amount: 50000 }]
    });
  });

  afterAll(async () => {
    if (testUserId) {
      await db.delete(s.users).where(eq(s.users.id, testUserId));
    }
  });

  it('records an expense transaction, returning structured response envelope with data', async () => {
    const res = await request(app)
      .post('/api/months/2026/11/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 2500,
        category: 'Food',
        note: 'Grocery supermarket',
        date: '2026-11-05',
        accountId: bankId
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.data).toBeDefined();
    expect(res.body.data.amount).toBe(2500);
    expect(res.body.data.category).toBe('Food');
    spentTxId = res.body.data.id;
  });

  it('rejects mapping a refund to a planned item per ADR 0062', async () => {
    const res = await request(app)
      .post('/api/months/2026/11/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: -1000,
        isRefund: true,
        category: 'Food',
        note: 'Grocery refund',
        date: '2026-11-06',
        accountId: bankId,
        plannedItemId: '00000000-0000-0000-0000-000000000001'
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('Refunds can only be mapped to existing spent transactions');
  });

  it('allows mapping a refund strictly to an existing spent transaction per ADR 0062', async () => {
    const res = await request(app)
      .post('/api/months/2026/11/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: -500,
        isRefund: true,
        category: 'Food',
        note: 'Item return discount',
        date: '2026-11-06',
        accountId: bankId,
        refundTargetTransactionId: spentTxId
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.amount).toBe(-500);
    expect(res.body.data.refundTargetTransactionId).toBe(spentTxId);
  });

  it('creates purchase goals and evaluates them with strict priority reservation per ADR 0063', async () => {
    // Goal 1: High Priority (priority 0)
    const goal1Res = await request(app)
      .post('/api/months/2026/11/goals')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Emergency Fund Topup',
        targetAmount: 5000,
        priority: 0,
        fundingAccountId: bankId
      });
    expect(goal1Res.status).toBe(201);

    // Goal 2: Low Priority (priority 2)
    const goal2Res = await request(app)
      .post('/api/months/2026/11/goals')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Gaming Headset',
        targetAmount: 3000,
        priority: 2,
        fundingAccountId: bankId
      });
    expect(goal2Res.status).toBe(201);

    const listRes = await request(app)
      .get('/api/months/2026/11/goals')
      .set('Authorization', `Bearer ${authToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.status).toBe('success');
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.length).toBe(2);
    // Highest priority comes first
    expect(listRes.body.data[0].name).toBe('Emergency Fund Topup');
  });

  it('automatically defers goals to next month when a heavy expense breaks cashflow per ADR 0061', async () => {
    // Log a massive expense that depletes available cashflow
    const heavyTxRes = await request(app)
      .post('/api/months/2026/11/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 85000,
        category: 'Emergency',
        note: 'Major medical procedure',
        date: '2026-11-10',
        accountId: bankId
      });
    expect(heavyTxRes.status).toBe(201);

    // Check goals for next month (December 2026)
    const nextMonth = await db.query.months.findFirst({
      where: and(eq(s.months.userId, testUserId), eq(s.months.year, 2026), eq(s.months.month, 12))
    });

    expect(nextMonth).toBeDefined();

    // Check deferred goals migrated to December
    const deferredGoals = await db.query.goals.findMany({
      where: and(eq(s.goals.userId, testUserId), eq(s.goals.monthId, nextMonth.id))
    });

    expect(deferredGoals.length).toBeGreaterThan(0);
    expect(deferredGoals[0].status).toBe('deferred');
    expect(deferredGoals[0].deferredReason).toContain('Auto-deferred');
  });

  it('generates month-end review with tag breakdowns and net cashflow', async () => {
    const res = await request(app)
      .get('/api/months/2026/11/month-end-review')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.tagBreakdown).toBeDefined();
    expect(res.body.data.netCashflow).toBeDefined();
  });
});
