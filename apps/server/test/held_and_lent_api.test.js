import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, ensureDatabaseInitialized } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { LedgerService } from '../src/domain/ledgerService.js';

// Held & Lent money (ADR 0069): someone's money staying with you, or yours with them.
// It moves account balances but is never income or expense, and held money is
// ring-fenced out of Safe-to-Spend.
describe('Held & Lent money API', () => {
  let app;
  let auth;
  let userId;
  let accountId;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const mm = String(month).padStart(2, '0');
  const day1 = `${year}-${mm}-01`;

  const sim = async () => {
    const res = await request(app).get(`/api/v1/periods/${year}/${month}`).set(auth);
    expect(res.status).toBe(200);
    return res.body.data.simulation;
  };
  const balance = async () => {
    const acc = await db.query.accounts.findFirst({ where: eq(s.accounts.id, accountId) });
    return acc.currentBalance;
  };

  beforeAll(async () => {
    await ensureDatabaseInitialized();
    app = createApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: `held_lent_${Date.now()}@example.com`, password: 'Password123!' });
    expect(reg.status).toBe(201);
    userId = reg.body.data.user.id;
    auth = { Authorization: `Bearer ${reg.body.data.token}` };

    const acc = await request(app)
      .post('/api/bank-accounts')
      .set(auth)
      .send({ name: 'Main', institution: 'Bank', accountType: 'checking', openingBalance: 1000000, isPrimary: true });
    expect(acc.status).toBe(201);
    accountId = acc.body.data.id;

    const m = await request(app)
      .post('/api/months')
      .set(auth)
      .send({ year, month, openingBalance: 1000000, incomeAmount: 0, safetyFloor: 100000, salaryAccountId: accountId });
    expect([200, 201]).toContain(m.status);
  });

  afterAll(async () => {
    if (userId) await db.delete(s.users).where(eq(s.users.id, userId));
  });

  let heldId;

  it('holding ₹2,000 for Ravi raises the balance but not income, expenses or Safe-to-Spend', async () => {
    const before = await sim();
    const startBal = await balance();

    const res = await request(app)
      .post('/api/v1/person-funds')
      .set(auth)
      .send({ personName: 'Ravi', direction: 'held', amount: 200000, date: day1, accountId });
    expect(res.status).toBe(201);
    heldId = res.body.data.id;
    expect(res.body.data.outstanding).toBe(200000);
    expect(res.body.data.status).toBe('open');
    expect(res.body.data.createdEntry.origin).toBe('held_in');
    expect(res.body.data.createdEntry.isIncome).toBe(false);

    expect(await balance()).toBe(startBal + 200000);

    const after = await sim();
    expect(after.heldReserve).toBe(200000);
    expect(after.totalIncome).toBe(before.totalIncome);
    expect(after.totalExpenses).toBe(before.totalExpenses);
    expect(after.safeVelocity.freeSurplus).toBe(before.safeVelocity.freeSurplus);
    const ev = after.events.find((e) => e.itemType === 'pass-through');
    expect(ev.label).toBe('Holding for Ravi');
  });

  it('refuses to return more than is held', async () => {
    const res = await request(app)
      .post(`/api/v1/person-funds/${heldId}/entries`)
      .set(auth)
      .send({ flow: 'out', amount: 300000, date: day1, accountId });
    expect(res.status).toBe(400);
  });

  it('returning it nets to zero and marks Ravi settled', async () => {
    const startBal = await balance();
    const res = await request(app)
      .post(`/api/v1/person-funds/${heldId}/entries`)
      .set(auth)
      .send({ flow: 'out', amount: 200000, date: day1, accountId });
    expect(res.status).toBe(201);
    expect(res.body.data.origin).toBe('held_return');
    expect(await balance()).toBe(startBal - 200000);

    const fund = await request(app).get(`/api/v1/person-funds/${heldId}`).set(auth);
    expect(fund.body.data.outstanding).toBe(0);
    expect(fund.body.data.status).toBe('settled');
    expect(fund.body.data.entries).toHaveLength(2);

    const after = await sim();
    expect(after.heldReserve).toBe(0);
    expect(after.totalExpenses).toBe(0);
  });

  it('lending ₹500 lowers cash and is tracked as owed to you, not spent', async () => {
    const startBal = await balance();
    const res = await request(app)
      .post('/api/v1/person-funds')
      .set(auth)
      .send({ personName: 'Asha', direction: 'lent', amount: 50000, date: day1, accountId });
    expect(res.status).toBe(201);
    expect(res.body.data.createdEntry.origin).toBe('lent_out');
    expect(await balance()).toBe(startBal - 50000);

    const after = await sim();
    expect(after.lentOutstanding).toBe(50000);
    expect(after.totalExpenses).toBe(0);
    expect(after.totalUnplannedSpent).toBe(0);

    const list = await request(app).get('/api/v1/person-funds').set(auth);
    expect(list.body.data.totals).toEqual({ held: 0, lent: 50000 });
  });

  it('rejects a held/lent row without a person', async () => {
    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth)
      .send({ origin: 'held_in', amount: 1000, date: day1, accountId });
    expect(res.status).toBe(400);
  });

  it('reclassifies an income logged the old way into held money', async () => {
    const income = await request(app)
      .post(`/api/months/${year}/${month}/transactions`)
      .set(auth)
      .send({ name: 'Cash from Meera', note: 'Cash from Meera', amount: 150000, isIncome: true, origin: 'spot', date: day1, accountId });
    expect(income.status).toBe(201);
    const startBal = await balance();
    const beforeSim = await sim();
    expect(beforeSim.totalIncome).toBe(150000);

    const res = await request(app)
      .post(`/api/v1/transactions/${income.body.data.id}/reclassify`)
      .set(auth)
      .send({ personName: 'Meera', direction: 'held' });
    expect(res.status).toBe(200);
    expect(res.body.data.transaction.origin).toBe('held_in');
    expect(res.body.data.transaction.isIncome).toBe(false);
    expect(res.body.data.fund.outstanding).toBe(150000);
    expect(await balance()).toBe(startBal);

    const afterSim = await sim();
    expect(afterSim.totalIncome).toBe(0);
    expect(afterSim.heldReserve).toBe(150000);
  });

  it('keeps the ledger recompute in step with the new origins', async () => {
    const live = await balance();
    await LedgerService.recomputeAccountBalance(accountId);
    expect(await balance()).toBe(live);
  });

  it('leaves held & lent money out of the month-end review totals', async () => {
    const res = await request(app).get(`/api/months/${year}/${month}/month-end-review`).set(auth);
    expect(res.status).toBe(200);
    const review = res.body.data;
    expect(review.totalExpenses).toBe(0);
    expect(review.directIncome).toBe(0);
    expect(review.passThrough).toEqual({ heldIn: 350000, heldReturned: 200000, lentOut: 50000, lentRepaid: 0 });
  });

  it('deleting an entry reopens the person and restores the balance', async () => {
    const fund = await request(app).get(`/api/v1/person-funds/${heldId}`).set(auth);
    const returned = fund.body.data.entries.find((t) => t.origin === 'held_return');
    const startBal = await balance();
    const del = await request(app).delete(`/api/v1/transactions/${returned.id}`).set(auth);
    expect(del.status).toBe(200);
    expect(await balance()).toBe(startBal + 200000);
    const after = await request(app).get(`/api/v1/person-funds/${heldId}`).set(auth);
    expect(after.body.data.outstanding).toBe(200000);
    expect(after.body.data.status).toBe('open');
  });

  it('only deletes a person with nothing logged', async () => {
    const busy = await request(app).delete(`/api/v1/person-funds/${heldId}`).set(auth);
    expect(busy.status).toBe(400);
    const empty = await request(app)
      .post('/api/v1/person-funds')
      .set(auth)
      .send({ personName: 'Nobody', direction: 'lent' });
    expect(empty.status).toBe(201);
    const del = await request(app).delete(`/api/v1/person-funds/${empty.body.data.id}`).set(auth);
    expect(del.status).toBe(200);
  });

  // Incident 2026-11-18: a double tap saved the same held money twice, a person moved
  // twice, and a 31 Oct entry was filed under October while its siblings sat in November.
  it('rejects the same entry sent twice in a row, unless asked', async () => {
    const body = { flow: 'in', amount: 10000, date: day1, accountId };
    const first = await request(app).post(`/api/v1/person-funds/${heldId}/entries`).set(auth).send(body);
    expect(first.status).toBe(201);
    const startBal = await balance();
    const again = await request(app).post(`/api/v1/person-funds/${heldId}/entries`).set(auth).send(body);
    expect(again.status).toBe(400);
    expect(await balance()).toBe(startBal);
    const meant = await request(app).post(`/api/v1/person-funds/${heldId}/entries`).set(auth).send({ ...body, allowDuplicate: true });
    expect(meant.status).toBe(201);
  });

  it('adding a person who already exists reuses them', async () => {
    const res = await request(app)
      .post('/api/v1/person-funds')
      .set(auth)
      .send({ personName: ' ravi ', direction: 'held' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(heldId);
  });

  it('moving the same entry to a person twice only moves it once', async () => {
    const income = await request(app)
      .post(`/api/months/${year}/${month}/transactions`)
      .set(auth)
      .send({ name: 'Cash from Kiran', amount: 30990, isIncome: true, origin: 'spot', date: day1, accountId });
    expect(income.status).toBe(201);
    const startBal = await balance();
    const [a, b] = await Promise.all([
      request(app).post(`/api/v1/transactions/${income.body.data.id}/reclassify`).set(auth).send({ personName: 'Kiran', direction: 'held' }),
      request(app).post(`/api/v1/transactions/${income.body.data.id}/reclassify`).set(auth).send({ personName: 'Kiran', direction: 'held' })
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(await balance()).toBe(startBal);
    const funds = await request(app).get('/api/v1/person-funds').set(auth);
    const kirans = funds.body.data.funds.filter((f) => f.personName === 'Kiran');
    expect(kirans).toHaveLength(1);
    expect(kirans[0].outstanding).toBe(30990);
    const live = await balance();
    await LedgerService.recomputeAccountBalance(accountId);
    expect(await balance()).toBe(live);
  });

  it('files an entry under the month being viewed, like other entries', async () => {
    const prev = new Date(year, month - 1, 0);
    const lastOfPrev = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    const res = await request(app)
      .post(`/api/v1/person-funds/${heldId}/entries`)
      .set(auth)
      .send({ flow: 'in', amount: 12345, date: lastOfPrev, accountId, year, month });
    expect(res.status).toBe(201);
    const current = await db.query.months.findFirst({ where: eq(s.months.userId, userId) });
    expect(res.body.data.monthId).toBe(current.id);
  });

  it('editing an entry settles or reopens the person', async () => {
    const created = await request(app).post('/api/v1/person-funds').set(auth)
      .send({ personName: 'Edit Test', direction: 'lent', amount: 30000, date: day1, accountId });
    expect(created.status).toBe(201);
    const fundId = created.body.data.id;
    const back = await request(app).post(`/api/v1/person-funds/${fundId}/entries`).set(auth)
      .send({ flow: 'in', amount: 20000, date: day1, accountId });
    expect(back.status).toBe(201);
    const repaidId = back.body.data.id;

    const edit = await request(app).patch(`/api/v1/transactions/${repaidId}`).set(auth).send({ amount: 30000 });
    expect(edit.status).toBe(200);
    expect((await request(app).get(`/api/v1/person-funds/${fundId}`).set(auth)).body.data.status).toBe('settled');

    await request(app).patch(`/api/v1/transactions/${repaidId}`).set(auth).send({ amount: 10000 });
    const reopened = (await request(app).get(`/api/v1/person-funds/${fundId}`).set(auth)).body.data;
    expect(reopened.status).toBe('open');
    expect(reopened.outstanding).toBe(20000);
  });

  it('deletes a person with entries only when asked, and their balance moves back', async () => {
    const startBal = await balance();
    const created = await request(app).post('/api/v1/person-funds').set(auth)
      .send({ personName: 'Delete Test', direction: 'lent', amount: 15000, date: day1, accountId });
    const fundId = created.body.data.id;
    expect(await balance()).toBe(startBal - 15000);

    const refused = await request(app).delete(`/api/v1/person-funds/${fundId}`).set(auth);
    expect(refused.status).toBe(400);

    const del = await request(app).delete(`/api/v1/person-funds/${fundId}?withEntries=true`).set(auth);
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/v1/person-funds/${fundId}`).set(auth)).status).toBe(404);
    expect(await db.query.transactions.findFirst({ where: eq(s.transactions.personFundId, fundId) })).toBeUndefined();
    expect(await balance()).toBe(startBal);
  });
});
