import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { MonthLifecycle } from '../src/domain/monthLifecycle.js';

// Roadmap phase 3: the Plan page's summary and chart timeline, cut from the month detail.
describe('Month summary and timeline', () => {
  let app;
  let auth;
  let mainId;
  let cashId;
  let detail;

  beforeAll(async () => {
    await runMigrations();
    app = createApp();
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `views_${Date.now()}@example.com`, password: 'Password123!' });
    auth = { Authorization: `Bearer ${reg.body.data.token}` };
    const userId = reg.body.data.user.id;

    mainId = (await request(app).post('/api/v1/accounts').set(auth)
      .send({ name: 'Main', type: 'bank', openingBalance: 50000, minimumBalance: 5000, isPrimary: true })).body.data.id;
    cashId = (await request(app).post('/api/v1/accounts').set(auth)
      .send({ name: 'Cash', type: 'wallet', openingBalance: 2000 })).body.data.id;

    await MonthLifecycle.createMonth(userId, { year: 2032, month: 5, incomeAmount: 0, safetyFloor: 1000, unplannedAllowance: 0 });
    const [month] = await db.select().from(s.months).where(and(eq(s.months.userId, userId), eq(s.months.year, 2032)));
    const planned = (name, amount, date, accountId = mainId) =>
      ({ userId, accountId, monthId: month.id, name, amount, date, status: 'planned', origin: 'planned' });
    await db.insert(s.transactions).values([
      planned('Rent', 15000, '2032-05-03'),
      planned('Phone', 500, '2032-05-10'),
      planned('Snacks', 200, '2032-05-12', cashId),
      planned('Internet', 1000, '2032-05-20')
    ]);
    detail = (await request(app).get('/api/v1/periods/2032/5').set(auth)).body.data;
  });

  it('summary is small and its numbers match the month detail', async () => {
    const res = await request(app).get('/api/v1/periods/2032/5/summary').set(auth);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body.data).length).toBeLessThan(2048);

    const sum = res.body.data;
    const sim = detail.simulation;
    expect(sum.safeToSpendToday).toBe(sim.safeToSpendPerDay);
    expect(sum.afterTodaysBills).toBe(sim.todayBalance);
    expect(sum.lowest).toEqual({ balance: sim.lowestUpcomingBalance, date: sim.lowestUpcomingDate });
    expect(sum.safetyFloor).toBe(sim.safetyFloor);
    expect(['good', 'tight', 'critical']).toContain(sum.verdict.key);
    // Not the current month, so each balance is the simulated one
    const main = sum.accounts.find((a) => a.id === mainId);
    expect(main).toEqual({ id: mainId, name: 'Main', type: 'bank', balance: detail.accountSimulations[mainId].todayBalance, minimumBalance: 5000 });
    expect(sum.nextDue.map((t) => t.name)).toEqual(['Rent', 'Phone', 'Snacks']);
    // Ledger balances only: planned items don't touch them, no cards or Held & Lent here
    expect(sum.netWorth).toEqual({ total: 52000, cash: 52000, lent: 0, cardsOwed: 0, held: 0 });
    expect(sum.accounts[0]).not.toHaveProperty('_id'); // canonical names only
  });

  it('timeline for one account carries only that account', async () => {
    const res = await request(app).get(`/api/v1/periods/2032/5/timeline?accountId=${cashId}`).set(auth);
    expect(res.status).toBe(200);
    const tl = res.body.data;
    expect(tl.events.map((e) => e.name)).toEqual(['Snacks']);
    expect(tl.dailyBalances).toEqual(detail.accountSimulations[cashId].dailyBalances.map(({ day, date, balance }) => ({ day, date, balance })));
    expect(tl.lowest.balance).toBe(detail.accountSimulations[cashId].lowestBalance);
    expect(JSON.stringify(tl)).not.toContain(mainId);
  });

  it('timeline for all accounts uses the combined curve; an unknown account is a 404', async () => {
    const all = (await request(app).get('/api/v1/periods/2032/5/timeline').set(auth)).body.data;
    expect(all.events).toHaveLength(4);
    expect(all.dailyBalances.at(-1).balance).toBe(detail.simulation.dailyBalances.at(-1).balance);
    expect(all.lowest.balance).toBe(detail.simulation.lowestBalance);

    const missing = await request(app).get('/api/v1/periods/2032/5/timeline?accountId=00000000-0000-4000-8000-000000000000').set(auth);
    expect(missing.status).toBe(404);
  });
});
