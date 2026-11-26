import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, pool, runMigrations, ensureBalanceTrigger } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { MonthLifecycle } from '../src/domain/monthLifecycle.js';

// An account's stored balance must always equal opening + its successful transactions, whichever
// code path wrote them, and a refund filed under "Salary" must not stand in for the salary.
describe('Ledger balance stays in sync', () => {
  let app;
  let auth;
  let userId;
  let bankId;
  let otherId;

  const stored = async (id) => Number((await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [id])).rows[0].current_balance);

  beforeAll(async () => {
    await runMigrations();
    app = createApp();
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `ledger_sync_${Date.now()}@example.com`, password: 'Password123!' });
    auth = { Authorization: `Bearer ${reg.body.data.token}` };
    userId = reg.body.data.user.id;
    bankId = (await request(app).post('/api/v1/accounts').set(auth)
      .send({ name: 'Salary bank', type: 'bank', openingBalance: 10000, isPrimary: true })).body.data.id;
    otherId = (await request(app).post('/api/v1/accounts').set(auth)
      .send({ name: 'Personal', type: 'bank', openingBalance: 0 })).body.data.id;
  });

  it('follows inserts, edits, transfers, cancels and deletes made by any path', async () => {
    const [spend] = await db.insert(s.transactions).values(
      { userId, accountId: bankId, name: 'Groceries', amount: 2500, date: '2031-05-02', status: 'successful', origin: 'spot' }
    ).returning();
    expect(await stored(bankId)).toBe(7500);

    await db.update(s.transactions).set({ amount: 3000 }).where(eq(s.transactions.id, spend.id));
    expect(await stored(bankId)).toBe(7000);

    await db.insert(s.transactions).values(
      { userId, accountId: bankId, destinationAccountId: otherId, name: 'Move', amount: 1000, date: '2031-05-03', status: 'successful', origin: 'transfer' }
    );
    expect(await stored(bankId)).toBe(6000);
    expect(await stored(otherId)).toBe(1000);

    await db.update(s.transactions).set({ status: 'cancelled' }).where(eq(s.transactions.id, spend.id));
    expect(await stored(bankId)).toBe(9000);

    await db.delete(s.transactions).where(eq(s.transactions.userId, userId));
    expect(await stored(bankId)).toBe(10000);
    expect(await stored(otherId)).toBe(0);
  });

  it('an API spend changes the balance once, not twice', async () => {
    const res = await request(app).post('/api/v1/transactions').set(auth)
      .send({ name: 'Coffee', amount: 150, date: new Date().toISOString().slice(0, 10), accountId: bankId, status: 'successful', origin: 'spot' });
    expect(res.status).toBeLessThan(300);
    expect(await stored(bankId)).toBe(9850);
    await db.delete(s.transactions).where(eq(s.transactions.userId, userId));
  });

  it('serverless start-up installs the trigger on a database that lacks it', async () => {
    // Production never runs runMigrations on an existing database, only ensureDatabaseInitialized
    await pool.query('DROP TRIGGER IF EXISTS "trg_transactions_sync_balance" ON "transactions"');
    await ensureBalanceTrigger();
    const { rows } = await pool.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'trg_transactions_sync_balance'`);
    expect(rows).toHaveLength(1);
  });

  it('crediting salary adds the salary even when a refund is filed under "Salary"', async () => {
    await MonthLifecycle.createMonth(userId, {
      year: 2031, month: 6, incomeAmount: 50000, safetyFloor: 0, unplannedAllowance: 0, salaryAccountId: bankId,
    });
    const [june] = await db.select().from(s.months).where(and(eq(s.months.userId, userId), eq(s.months.year, 2031), eq(s.months.month, 6)));
    await db.insert(s.transactions).values(
      { userId, monthId: june.id, accountId: otherId, name: 'Movie ticket refund', amount: 205, isIncome: true, category: 'Salary', date: '2031-06-03', status: 'successful', origin: 'spot' }
    );

    await MonthLifecycle.updateMonth(userId, 2031, 6, { isSalaryCredited: true, salaryCreditedDate: '2031-06-01' });

    const salaries = await db.select().from(s.transactions)
      .where(and(eq(s.transactions.userId, userId), eq(s.transactions.origin, 'salary')));
    expect(salaries).toHaveLength(1);
    expect(salaries[0].amount).toBe(50000);
    expect(salaries[0].accountId).toBe(bankId);
    expect(await stored(bankId)).toBe(60000);
    expect(await stored(otherId)).toBe(205); // the refund itself is untouched
  });

  it('editing an opening balance shifts the month start by the difference, not to the opening', async () => {
    const [june] = await db.select().from(s.months).where(and(eq(s.months.userId, userId), eq(s.months.year, 2031), eq(s.months.month, 6)));
    const openingFor = async () => Number((await pool.query(
      'SELECT amount FROM month_account_openings WHERE month_id = $1 AND account_id = $2', [june.id, bankId]
    )).rows[0]?.amount);
    await pool.query('DELETE FROM month_account_openings WHERE month_id = $1 AND account_id = $2', [june.id, bankId]);
    await db.insert(s.monthAccountOpenings).values({ monthId: june.id, accountId: bankId, amount: 42000 });

    const res = await request(app).patch(`/api/v1/accounts/${bankId}`).set(auth).send({ openingBalance: 12500 }); // was 10,000
    expect(res.status).toBe(200);
    expect(await openingFor()).toBe(44500);
    expect(res.body.data.currentBalance).toBe(62500);
  });
});
