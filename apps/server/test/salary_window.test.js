import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { expectedPayday, windowFor } from '../src/domain/salaryWindow.js';

describe('the next salary window is payday ± 5 days', () => {
  it('payday is the credit day in the month after the last salary, clamped to month end', () => {
    expect(expectedPayday('2026-10-30', 30)).toBe('2026-11-30');
    expect(expectedPayday('2026-11-28', 30)).toBe('2026-12-30'); // paid early
    expect(expectedPayday('2026-12-02', 30)).toBe('2026-12-30'); // paid late
    expect(expectedPayday('2026-10-31', 31)).toBe('2026-11-30'); // 31st in a 30-day month
    expect(expectedPayday('2026-11-30', 31)).toBe('2026-12-31');
    expect(expectedPayday('2027-01-31', null)).toBe('2027-02-28'); // no schedule day: a month later
  });

  it('Oct 30 -> Nov 25 to Dec 5, both days included', () => {
    const at = (today) => windowFor(expectedPayday('2026-10-30', 30), today);
    expect(at('2026-11-28')).toEqual({ expectedDate: '2026-11-30', opensOn: '2026-11-25', closesOn: '2026-12-05', state: 'open' });
    expect(at('2026-11-24').state).toBe('before');
    expect(at('2026-11-25').state).toBe('open');
    expect(at('2026-12-05').state).toBe('open');
    expect(at('2026-12-06').state).toBe('late');
  });
});

describe('crediting the salary keeps to the window', () => {
  let app;
  const users = {};

  beforeAll(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-24T06:00:00Z'), shouldAdvanceTime: true }));
  afterAll(() => vi.useRealTimers());

  async function user(name) {
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `window_${name}_${Date.now()}_${Math.random()}@example.com`, password: 'Password123!' });
    const auth = { Authorization: `Bearer ${reg.body.data.token}` };
    const acc = await request(app).post('/api/v1/accounts').set(auth).send({
      name: 'HDFC', type: 'bank', accountType: 'salary', openingBalance: 5000000, openingBalanceDate: '2026-10-30', isPrimary: true
    });
    const tpl = await request(app).post('/api/salary-templates').set(auth).send({
      amount: 8000000, expectedCreditDay: 30, receivingAccountId: acc.body.data.id,
      periodType: 'salary_cycle', effectiveDate: '2026-10-30', markCredited: true
    });
    expect(tpl.status).toBe(201);
    return auth;
  }
  const windowOf = async (auth) => (await request(app).get('/api/v1/periods/salary-window').set(auth)).body.data;
  const credit = (auth, body) => request(app).post('/api/v1/periods/2026/11/credit-salary').set(auth).send(body);

  beforeAll(async () => {
    app = createApp();
    users.early = await user('early');
    users.late = await user('late');
  });

  it('before the window: shown, and refused', async () => {
    expect(await windowOf(users.early)).toMatchObject({
      lastCreditedDate: '2026-10-30', expectedDate: '2026-11-30', opensOn: '2026-11-25', closesOn: '2026-12-05',
      state: 'before', amount: 8000000, period: { year: 2026, month: 11, isSalaryCredited: true }
    });
    const res = await credit(users.early, {});
    expect(res.status).toBe(400);
    expect(res.body.error?.message || res.body.message).toMatch(/from 25 Nov 2026/);
  });

  it('inside the window (28 Nov, before the cycle ends on 29 Nov): starts the next cycle', async () => {
    vi.setSystemTime(new Date('2026-11-28T06:00:00Z'));
    expect((await windowOf(users.early)).state).toBe('open');
    const res = await credit(users.early, { date: '2026-11-28' });
    expect(res.status).toBe(200);
    expect(res.body.data.advancedMonth).toMatchObject({ year: 2026, month: 12, startDate: '2026-11-28', isSalaryCredited: true });
    expect(await windowOf(users.early)).toMatchObject({ lastCreditedDate: '2026-11-28', expectedDate: '2026-12-30', state: 'before' });
  });

  it('after the window: refused until the user confirms it came late', async () => {
    vi.setSystemTime(new Date('2026-12-07T06:00:00Z'));
    expect((await windowOf(users.late)).state).toBe('late');
    const refused = await credit(users.late, { date: '2026-12-07' });
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message || refused.body.message).toMatch(/due by 5 Dec 2026/);
    const late = await credit(users.late, { date: '2026-12-07', late: true });
    expect(late.status).toBe(200);
    expect(late.body.data.advancedMonth).toMatchObject({ startDate: '2026-12-07', isSalaryCredited: true });
  });
});
