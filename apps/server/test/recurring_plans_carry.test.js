import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { nextOccurrence, dayInMonth } from '../src/domain/recurringPlans.js';

describe('a recurring plan falls on its calendar day', () => {
  it('first date is strictly after today, pulled back to month end', () => {
    expect(nextOccurrence(26, '2026-11-28')).toBe('2026-12-26');
    expect(nextOccurrence(30, '2026-11-28')).toBe('2026-11-30');
    expect(nextOccurrence(28, '2026-11-28')).toBe('2026-12-28');
    expect(nextOccurrence(31, '2026-11-28')).toBe('2026-11-30');
    expect(nextOccurrence(31, '2027-01-31')).toBe('2027-02-28');
    expect(dayInMonth(2027, 3, 31)).toBe('2027-03-31');
  });
});

// Paid on the 30th: plans made on 25 Nov in the 30 Oct - 29 Nov cycle, then the salary on 30 Nov starts the next one.
describe('plans when a new cycle starts', () => {
  let app;
  let auth;
  let accountId;

  beforeAll(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-25T06:00:00Z'), shouldAdvanceTime: true }));
  afterAll(() => vi.useRealTimers());

  const plan = (body) => request(app).post('/api/v1/periods/2026/11/transactions').set(auth)
    .send({ status: 'planned', origin: 'planned', category: 'Bills', accountId, ...body });

  beforeAll(async () => {
    app = createApp();
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `carry_${Date.now()}_${Math.random()}@example.com`, password: 'Password123!' });
    auth = { Authorization: `Bearer ${reg.body.data.token}` };
    const acc = await request(app).post('/api/v1/accounts').set(auth).send({
      name: 'HDFC', type: 'bank', accountType: 'salary', openingBalance: 5000000,
      openingBalanceDate: '2026-10-30', isPrimary: true
    });
    accountId = acc.body.data.id;
    const tpl = await request(app).post('/api/salary-templates').set(auth).send({
      amount: 8000000, expectedCreditDay: 30, receivingAccountId: accountId,
      periodType: 'salary_cycle', effectiveDate: '2026-10-30', markCredited: true
    });
    expect(tpl.status).toBe(201);
  });

  it('a new monthly plan takes its day, and one past this cycle waits for the next', async () => {
    const rent = await plan({ name: 'Rent', amount: 2500000, type: 'recurring', dayOfMonth: 28, date: null, isFixed: true });
    expect(rent.status).toBe(201);
    expect(rent.body.data).toMatchObject({ date: '2026-11-28', recurrence: 'monthly', recurrenceDay: 28, status: 'planned' });

    expect((await plan({ name: 'Gym', amount: 100000, type: 'recurring', dayOfMonth: 27, isFixed: false })).status).toBe(201);
    const power = await plan({ name: 'Electricity', amount: 300000, type: 'recurring', dayOfMonth: 20, isFixed: false });
    expect(power.body.data).toMatchObject({ date: '2026-12-20', status: 'scheduled' });

    expect((await plan({ name: 'Insurance', amount: 400000, date: '2026-11-29', isFixed: true })).status).toBe(201);
    expect((await plan({ name: 'Dinner', amount: 200000, date: '2026-11-29', isFixed: false })).status).toBe(201);

    const nov = (await request(app).get('/api/v1/periods/2026/11/transactions').set(auth)).body.data;
    expect(nov.map((t) => t.name)).not.toContain('Electricity');
  });

  it('Fixed moves in, Variable drops, monthly plans repeat on their date', async () => {
    vi.setSystemTime(new Date('2026-11-30T06:00:00Z'));
    const res = await request(app).post('/api/v1/periods/2026/11/credit-salary').set(auth).send({ date: '2026-11-30' });
    expect(res.status).toBe(200);
    expect(res.body.data.carried.dropped.map((t) => t.name).sort()).toEqual(['Dinner', 'Gym']);

    const dec = (await request(app).get('/api/v1/periods/2026/12/transactions').set(auth)).body.data
      .filter((t) => t.origin !== 'salary')
      .map((t) => `${t.name} ${t.date} ${t.status} ${t.amount}`).sort();
    expect(dec).toEqual([
      'Electricity 2026-12-20 planned 300000',
      'Gym 2026-12-27 planned 100000',
      'Insurance 2026-11-29 planned 400000',
      'Rent 2026-11-28 planned 2500000',
      'Rent 2026-12-28 planned 2500000'
    ]);

    const nov = (await request(app).get('/api/v1/periods/2026/11/transactions').set(auth)).body.data;
    expect(nov.filter((t) => t.status === 'cancelled').map((t) => t.name).sort()).toEqual(['Dinner', 'Gym']);
  });
});
