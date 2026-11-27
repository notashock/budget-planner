import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

// Paid on the 30th, last salary 30 Oct; it is 28 Nov and the next salary has come in early.
describe('logging the next payday salary on a salary cycle', () => {
  let app;
  let auth;
  let accountId;

  beforeAll(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-28T06:00:00Z'), shouldAdvanceTime: true }));
  afterAll(() => vi.useRealTimers());

  beforeAll(async () => {
    app = createApp();
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `next_salary_${Date.now()}_${Math.random()}@example.com`, password: 'Password123!' });
    auth = { Authorization: `Bearer ${reg.body.data.token}` };
    const acc = await request(app).post('/api/v1/accounts').set(auth).send({
      name: 'HDFC', type: 'bank', accountType: 'salary', openingBalance: 5000000,
      openingBalanceDate: '2026-10-30', isPrimary: true
    });
    expect(acc.status).toBe(201);
    accountId = acc.body.data.id;
    const tpl = await request(app).post('/api/salary-templates').set(auth).send({
      amount: 8000000, expectedCreditDay: 30, receivingAccountId: accountId,
      periodType: 'salary_cycle', effectiveDate: '2026-10-30', markCredited: true
    });
    expect(tpl.status).toBe(201);
    const nov = (await request(app).get('/api/v1/periods').set(auth)).body.data.find((m) => m.year === 2026 && m.month === 11);
    expect(nov).toMatchObject({ startDate: '2026-10-30', endDate: '2026-11-29', isSalaryCredited: true });
  });

  it('refuses a date mid-cycle or in the future', async () => {
    const early = await request(app).post('/api/v1/periods/2026/11/credit-salary').set(auth).send({ date: '2026-11-15' });
    expect(early.status).toBe(400);
    expect(early.body.error?.message || early.body.message).toMatch(/already logged/i);
    const future = await request(app).post('/api/v1/periods/2026/11/credit-salary').set(auth).send({ date: '2026-12-05' });
    expect(future.status).toBe(400);
  });

  it('closes this cycle the day before and opens the next one holding the salary', async () => {
    const res = await request(app).post('/api/v1/periods/2026/11/credit-salary').set(auth)
      .send({ amount: 8200000, date: '2026-11-28', bankAccountId: accountId });
    expect(res.status).toBe(200);
    expect(res.body.data.advancedMonth).toMatchObject({ year: 2026, month: 12 });

    const periods = (await request(app).get('/api/v1/periods').set(auth)).body.data;
    const nov = periods.find((m) => m.year === 2026 && m.month === 11);
    const dec = periods.find((m) => m.year === 2026 && m.month === 12);
    expect(nov).toMatchObject({ isClosed: true, endDate: '2026-11-27', salaryCreditedDate: '2026-10-30' });
    expect(dec).toMatchObject({
      isClosed: false, startDate: '2026-11-28', endDate: '2026-12-29',
      isSalaryCredited: true, salaryCreditedDate: '2026-11-28', incomeAmount: 8200000
    });
    expect(periods.filter((m) => !m.isClosed)).toHaveLength(1);

    const decTxs = (await request(app).get('/api/v1/periods/2026/12/transactions').set(auth)).body.data;
    expect(decTxs.filter((t) => t.origin === 'salary').map((t) => t.amount)).toEqual([8200000]);
    const novTxs = (await request(app).get('/api/v1/periods/2026/11/transactions').set(auth)).body.data;
    expect(novTxs.filter((t) => t.origin === 'salary').map((t) => t.amount)).toEqual([8000000]);

    const account = (await request(app).get('/api/v1/accounts').set(auth)).body.data.find((a) => a.id === accountId);
    expect(account.currentBalance).toBe(5000000 + 8000000 + 8200000);
  });

  it('a second credit in the new cycle is refused', async () => {
    const again = await request(app).post('/api/v1/periods/2026/12/credit-salary').set(auth).send({ date: '2026-11-28' });
    expect(again.status).toBe(400);
  });
});
