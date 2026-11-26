import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { periodMonthKey } from '../src/services/salaryTemplateService.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('a salary cycle is named after the month it mostly covers', () => {
  it('30 Oct - 29 Nov is November (the reported case), the 1st stays in its month', () => {
    expect(periodMonthKey({ originalStartDate: '2026-10-30', startDate: '2026-11-26' }, 'salary_cycle')).toEqual({ year: 2026, month: 11 });
    expect(periodMonthKey({ startDate: '2026-11-01' }, 'salary_cycle')).toEqual({ year: 2026, month: 11 });
    expect(periodMonthKey({ startDate: '2026-10-16' }, 'salary_cycle')).toEqual({ year: 2026, month: 10 });
    expect(periodMonthKey({ startDate: '2026-12-30' }, 'salary_cycle')).toEqual({ year: 2027, month: 1 });
    expect(periodMonthKey({ startDate: '2026-10-30' }, 'calendar_month')).toEqual({ year: 2026, month: 10 });
  });

  async function newUserWithSalary(app, lastPaid, creditDay) {
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `cycle_name_${Date.now()}_${Math.random()}@example.com`, password: 'Password123!' });
    const auth = { Authorization: `Bearer ${reg.body.data.token}` };
    const acc = await request(app).post('/api/v1/accounts').set(auth).send({
      name: 'HDFC', type: 'bank', accountType: 'salary', openingBalance: 5000000,
      openingBalanceDate: iso(new Date()), isPrimary: true
    });
    expect(acc.status).toBe(201);
    const tpl = await request(app).post('/api/salary-templates').set(auth).send({
      amount: 8000000, expectedCreditDay: creditDay, receivingAccountId: acc.body.data.id,
      periodType: 'salary_cycle', effectiveDate: lastPaid
    });
    expect(tpl.status).toBe(201);
    const periods = await request(app).get('/api/v1/periods').set(auth);
    expect(periods.status).toBe(200);
    return periods.body.data;
  }

  it('a new user gets the cycle that contains today, under the month it mostly covers', async () => {
    const app = createApp();
    const today = new Date();
    const todayIso = iso(today);
    // The last 28th on or before today (28 exists in every month)
    const lastPaid = new Date(today.getFullYear(), today.getMonth() - (today.getDate() >= 28 ? 0 : 1), 28);
    const months = await newUserWithSalary(app, iso(lastPaid), 28);

    const current = months.filter((m) => m.startDate <= todayIso && m.endDate >= todayIso);
    expect(current).toHaveLength(1);
    const mid = new Date(lastPaid.getFullYear(), lastPaid.getMonth(), lastPaid.getDate() + 15);
    expect({ year: current[0].year, month: current[0].month }).toEqual({ year: mid.getFullYear(), month: mid.getMonth() + 1 });
  });

  it('a last salary months ago still gives a current month, not only a finished one', async () => {
    const app = createApp();
    const today = new Date();
    const todayIso = iso(today);
    const months = await newUserWithSalary(app, iso(new Date(today.getFullYear(), today.getMonth() - 4, 5)), 5);
    expect(months.filter((m) => m.startDate <= todayIso && m.endDate >= todayIso)).toHaveLength(1);
  });
});

describe('first-run setup: a salary logged as credited lands in the bank balance', () => {
  async function setup(app, { balanceDate, salaryDate }) {
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `setup_credit_${Date.now()}_${Math.random()}@example.com`, password: 'Password123!' });
    const auth = { Authorization: `Bearer ${reg.body.data.token}` };
    const acc = await request(app).post('/api/v1/accounts').set(auth).send({
      name: 'HDFC', type: 'bank', accountType: 'salary', openingBalance: 5000000,
      openingBalanceDate: balanceDate, isPrimary: true
    });
    const tpl = await request(app).post('/api/salary-templates').set(auth).send({
      amount: 8000000, expectedCreditDay: Number(salaryDate.slice(8)), receivingAccountId: acc.body.data.id,
      periodType: 'salary_cycle', effectiveDate: salaryDate, markCredited: true
    });
    expect(tpl.status).toBe(201);
    const account = (await request(app).get('/api/v1/accounts').set(auth)).body.data.find((a) => a.id === acc.body.data.id);
    const months = (await request(app).get('/api/v1/periods').set(auth)).body.data;
    return { account, months };
  }

  it('a salary on or after the balance date is added to the balance and marks the month credited', async () => {
    const today = iso(new Date());
    const { account, months } = await setup(createApp(), { balanceDate: today, salaryDate: today });
    expect(account.currentBalance).toBe(13000000);
    const current = months.find((m) => m.startDate <= today && m.endDate >= today);
    expect(current.isSalaryCredited).toBe(true);
    expect(current.isClosed).toBeFalsy();
  });

  it('a salary before the balance date is already in that balance: marked credited, not added twice', async () => {
    const now = new Date();
    const today = iso(now);
    const salaryDate = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3));
    const { account, months } = await setup(createApp(), { balanceDate: today, salaryDate });
    expect(account.currentBalance).toBe(5000000);
    expect(months.find((m) => m.startDate <= today && m.endDate >= today).isSalaryCredited).toBe(true);
  });
});
