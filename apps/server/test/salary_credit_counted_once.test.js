import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';

/**
 * A credited salary must be counted once by the period simulation.
 *
 * The salary cycle job and the month-update path store the credited salary as
 * a transaction with origin 'salary', name 'Monthly Salary' and no note. The
 * credit-salary endpoint finds that row and updates it. The simulation used to
 * miss it as the salary and count it a second time on top of the expected
 * salary, doubling the month's income and today's balance.
 */
describe('POST /api/v1/periods/:y/:m/credit-salary counts the salary once', () => {
  let app;
  let token;
  let userId;

  const api = {
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url, body = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)
  };

  beforeAll(async () => {
    await runMigrations();
    app = createApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: `salary_once_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`, password: 'Password123!' });
    expect(reg.status).toBe(201);
    token = reg.body.data.token;
    userId = reg.body.data.user.id;
  }, 60000);

  it('reports the month income and balance with a single salary', async () => {
    const created = await api.post('/api/v1/periods', {
      year: 2026, month: 11, openingBalance: 5000000, incomeAmount: 8000000, safetyFloor: 0
    });
    expect(created.status).toBe(201);
    const monthId = created.body.data.id || created.body.data.month?.id;
    expect(monthId).toBeTruthy();

    // The salary row as the salary cycle job writes it.
    await db.insert(s.transactions).values({
      userId,
      monthId,
      name: 'Monthly Salary',
      status: 'successful',
      origin: 'salary',
      amount: 8000000,
      date: '2026-11-01',
      isIncome: true,
      category: 'Income'
    });

    const credit = await api.post('/api/v1/periods/2026/11/credit-salary', { date: '2026-11-01' });
    expect(credit.status).toBe(200);

    const salaryRows = await db.query.transactions.findMany({
      where: and(eq(s.transactions.userId, userId), eq(s.transactions.isIncome, true))
    });
    expect(salaryRows).toHaveLength(1);

    const detail = await api.get('/api/v1/periods/2026/11');
    expect(detail.status).toBe(200);
    const { month, simulation } = detail.body.data;
    expect(month.isSalaryCredited).toBe(true);

    expect(simulation.totalIncome).toBe(8000000);
    expect(simulation.todayBalance).toBe(13000000);
    const incomeEvents = simulation.events.filter((e) => e.amount > 0);
    expect(incomeEvents).toHaveLength(1);
    expect(incomeEvents[0].isSalary).toBe(true);
    expect(simulation.salaryTransactionId).toBe(salaryRows[0].id);
  });
});
