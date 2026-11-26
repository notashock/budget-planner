import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { MonthLifecycle } from '../src/domain/monthLifecycle.js';

// A goal is created `logged` (ADR 0064). It must get a purchase-date
// recommendation straight away, and be auto-deferred (ADR 0061) when a new
// expense leaves no safe day for it, the same as an `active` goal.
describe('Newly created (logged) goals', () => {
  let app;
  let userId;
  let auth;
  let email;
  let bankId;
  let goalId;

  beforeAll(async () => {
    await runMigrations();
    app = createApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: (email = `logged_goal_${Date.now()}@example.com`), password: 'Password123!' });
    expect(reg.status).toBe(201);
    auth = { Authorization: `Bearer ${reg.body.data.token}` };
    userId = reg.body.data.user.id;

    const acc = await request(app)
      .post('/api/bank-accounts')
      .set(auth)
      .send({ name: 'Main', institution: 'Bank', openingBalance: 50000, isPrimary: true });
    expect(acc.status).toBe(201);
    bankId = acc.body.data.id;

    // ₹500 opening, ₹150 floor, no income
    await MonthLifecycle.createMonth(userId, {
      year: 2030,
      month: 6,
      openingBalance: 50000,
      incomeAmount: 0,
      safetyFloor: 15000,
      unplannedAllowance: 0,
      salaryAccountId: bankId,
      accountOpeningBalances: [{ accountId: bankId, amount: 50000 }]
    });
  });

  afterAll(async () => {
    if (userId) await db.delete(s.users).where(eq(s.users.id, userId));
  });

  it('gets a safe purchase date as soon as it is created', async () => {
    const created = await request(app)
      .post('/api/months/2030/6/goals')
      .set(auth)
      .send({ name: 'Headphones', targetAmount: 20000, priority: 0 });
    expect(created.status).toBe(201);
    goalId = (created.body.data.goal || created.body.data).id;

    const list = await request(app).get('/api/v1/periods/2030/6/goals').set(auth);
    expect(list.status).toBe(200);
    const goal = (list.body.data || list.body).find((g) => g.id === goalId);
    expect(goal.status).toBe('logged');
    expect(goal.recommendation).toBeDefined();
    expect(goal.recommendation.feasible).toBe(true);
    expect(goal.recommendation.recommendedDate).toMatch(/^2030-06-\d\d$/);
    expect(goal.recommendation.explanation).not.toContain('minor units');
  });

  it('is auto-deferred when a heavy expense leaves no safe day for it', async () => {
    // A spend can't be dated in the future (entryDateRules): log it on its own day
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2030-06-05T06:00:00Z'), shouldAdvanceTime: true });
    try {
    // A token signed today would read as expired in 2030: sign in again there
    const login = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
    const auth2030 = { Authorization: `Bearer ${login.body.data.token}` };
    // ₹500 - ₹300 spent = ₹200 left; ₹200 goal + ₹150 floor no longer fits
    const tx = await request(app)
      .post('/api/months/2030/6/transactions')
      .set(auth2030)
      .send({ amount: 30000, category: 'Emergency', note: 'Repair', date: '2030-06-05', accountId: bankId });
    expect(tx.status).toBe(201);

    const goal = await db.query.goals.findFirst({ where: eq(s.goals.id, goalId) });
    expect(goal.status).toBe('deferred');
    expect(goal.deferredReason).toContain('Auto-deferred');
    } finally {
      vi.useRealTimers();
    }
  });
});
