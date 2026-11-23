import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, pool, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { MonthLifecycle } from '../src/domain/monthLifecycle.js';
import { backfillUnassignedTransactions } from '../src/services/accountMigration.js';

// Roadmap phase 1: viewing a month or a transaction list must not change stored data. Reads used to
// run a backfill that wrote ₹0 month openings and moved archived accounts' history to the primary bank.
describe('Reads do not write', () => {
  let app;
  let userId;
  let auth;
  let mainId;
  let oldId;

  // Every row this user owns, with its last update time, across the tables a read used to touch
  const snapshot = async () => {
    const { rows } = await pool.query(
      `SELECT 'account' AS t, id::text, updated_at::text AS u, current_balance::text AS v FROM accounts WHERE user_id = $1
       UNION ALL SELECT 'month', id::text, updated_at::text, is_closed::text FROM months WHERE user_id = $1
       UNION ALL SELECT 'opening', o.id::text, o.amount::text, o.account_id::text FROM month_account_openings o JOIN months m ON m.id = o.month_id WHERE m.user_id = $1
       UNION ALL SELECT 'tx', id::text, updated_at::text, account_id::text FROM transactions WHERE user_id = $1
       UNION ALL SELECT 'item', id::text, updated_at::text, account_id::text FROM items WHERE user_id = $1
       ORDER BY 1, 2`,
      [userId]
    );
    return rows;
  };

  beforeAll(async () => {
    await runMigrations();
    app = createApp();
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `reads_${Date.now()}@example.com`, password: 'Password123!' });
    expect(reg.status).toBe(201);
    auth = { Authorization: `Bearer ${reg.body.data.token}` };
    userId = reg.body.data.user.id;

    const main = await request(app).post('/api/v1/accounts').set(auth)
      .send({ name: 'Main', type: 'bank', openingBalance: 50000, isPrimary: true });
    mainId = main.body.data.id;
    const old = await request(app).post('/api/v1/accounts').set(auth)
      .send({ name: 'Old', type: 'bank', openingBalance: 2000 });
    oldId = old.body.data.id;

    // March 2031 has no stored openings
    await MonthLifecycle.createMonth(userId, { year: 2031, month: 3, incomeAmount: 0, safetyFloor: 0, unplannedAllowance: 0 });
    const [march] = await db.select().from(s.months).where(eq(s.months.userId, userId));
    await db.insert(s.transactions).values([
      { userId, accountId: mainId, name: 'February bill', amount: 1000, date: '2031-02-10', status: 'successful', origin: 'spot' },
      { userId, accountId: oldId, name: 'Old account spend', amount: 500, date: '2031-02-11', status: 'successful', origin: 'spot' },
      { userId, accountId: mainId, monthId: march.id, name: 'March rent', amount: 3000, date: '2031-03-05', status: 'successful', origin: 'spot' }
    ]);

    const archived = await request(app).delete(`/api/v1/accounts/${oldId}`).set(auth);
    expect(archived.status).toBe(200);
  });

  it('month detail and both transaction lists leave every row unchanged', async () => {
    const before = await snapshot();
    for (const url of ['/api/v1/periods/2031/3', '/api/v1/periods/2031/3/transactions', '/api/v1/transactions']) {
      const res = await request(app).get(url).set(auth);
      expect(res.status, url).toBe(200);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('a month with no stored opening starts each account at its ledger balance', async () => {
    const res = await request(app).get('/api/v1/periods/2031/3').set(auth);
    const openings = Object.fromEntries(res.body.data.month.accountOpeningBalances.map((o) => [o.accountId, o.amount]));
    // 50,000 opening − the February bill; March's own rent is replayed by the simulator, not counted twice
    expect(openings[mainId]).toBe(49000);
    expect(openings[oldId]).toBeUndefined(); // archived accounts are not part of the plan
    const sim = Object.values(res.body.data.simulation.accounts).find((a) => a.name === 'Main');
    expect(sim.openingBalance).toBe(49000);
    expect(sim.endingBalance).toBe(46000);
  });

  it('the backfill keeps archived history and updates the ledger of the account it fills', async () => {
    const [orphan] = await db.insert(s.transactions).values({
      userId, accountId: null, name: 'Legacy row', amount: 700, date: '2031-01-15', status: 'successful', origin: 'spot'
    }).returning();
    await backfillUnassignedTransactions(userId);

    const moved = await db.query.transactions.findFirst({ where: eq(s.transactions.id, orphan.id) });
    expect(moved.accountId).toBe(mainId);
    const onOld = await db.query.transactions.findFirst({ where: eq(s.transactions.name, 'Old account spend') });
    expect(onOld.accountId).toBe(oldId);
    const main = await db.query.accounts.findFirst({ where: eq(s.accounts.id, mainId) });
    expect(main.currentBalance).toBe(50000 - 1000 - 3000 - 700);
  });
});
