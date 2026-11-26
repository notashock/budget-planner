import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, pool, runMigrations } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { MonthLifecycle } from '../src/domain/monthLifecycle.js';

// A month's openings are saved when it is set up. Editing an earlier month afterwards must move
// every later month's opening by the same amount, or later balances and safe-to-spend drift.
describe('Earlier-month edits carry forward into later openings', () => {
  let userId;
  let bankId;
  let walletId;
  let cardId;
  let may;
  let june;
  let july;

  const opening = async (month, accountId) => Number((await pool.query(
    'SELECT amount FROM month_account_openings WHERE month_id = $1 AND account_id = $2', [month.id, accountId]
  )).rows[0]?.amount);
  const monthTotal = async (month) => Number((await pool.query('SELECT opening_balance FROM months WHERE id = $1', [month.id])).rows[0].opening_balance);
  const tx = (values) => ({ userId, status: 'successful', origin: 'spot', ...values });

  beforeAll(async () => {
    await runMigrations();
    const app = createApp();
    const reg = await request(app).post('/api/auth/register')
      .send({ email: `carry_${Date.now()}@example.com`, password: 'Password123!' });
    const auth = { Authorization: `Bearer ${reg.body.data.token}` };
    userId = reg.body.data.user.id;
    const add = async (body) => (await request(app).post('/api/v1/accounts').set(auth).send(body)).body.data.id;
    bankId = await add({ name: 'Bank', type: 'bank', openingBalance: 100000, isPrimary: true });
    walletId = await add({ name: 'Wallet', type: 'wallet', openingBalance: 5000 });
    cardId = await add({ name: 'Card', type: 'credit_card', openingBalance: 0, creditLimit: 500000, statementDay: 1, dueDay: 20 });

    for (const m of [5, 6, 7]) {
      await MonthLifecycle.createMonth(userId, { year: 2033, month: m, incomeAmount: 0, safetyFloor: 0, unplannedAllowance: 0 });
    }
    const rows = await db.select().from(s.months).where(eq(s.months.userId, userId));
    [may, june, july] = [5, 6, 7].map((m) => rows.find((r) => r.year === 2033 && r.month === m));
    // Saved openings for June and July, as a rollover leaves them
    for (const m of [june, july]) {
      await pool.query('DELETE FROM month_account_openings WHERE month_id = $1', [m.id]);
      await db.insert(s.monthAccountOpenings).values([
        { monthId: m.id, accountId: bankId, amount: 100000 },
        { monthId: m.id, accountId: walletId, amount: 5000 }
      ]);
      await pool.query('UPDATE months SET opening_balance = 105000 WHERE id = $1', [m.id]);
    }
  });

  it('adding, editing and deleting a May spend moves June and July, not May', async () => {
    const [spend] = await db.insert(s.transactions).values(tx({ monthId: may.id, accountId: bankId, name: 'Late May spend', amount: 2000, date: '2033-05-28' })).returning();
    expect(await opening(june, bankId)).toBe(98000);
    expect(await opening(july, bankId)).toBe(98000);
    expect(await monthTotal(june)).toBe(103000);
    expect(await opening(june, walletId)).toBe(5000);

    await db.update(s.transactions).set({ amount: 3500 }).where(eq(s.transactions.id, spend.id));
    expect(await opening(june, bankId)).toBe(96500);

    // Cancelling takes it out, like deleting
    await db.update(s.transactions).set({ status: 'cancelled' }).where(eq(s.transactions.id, spend.id));
    expect(await opening(june, bankId)).toBe(100000);
    await db.update(s.transactions).set({ status: 'successful' }).where(eq(s.transactions.id, spend.id));
    await db.delete(s.transactions).where(eq(s.transactions.id, spend.id));
    expect(await opening(june, bankId)).toBe(100000);
    expect(await opening(july, bankId)).toBe(100000);
    expect(await monthTotal(july)).toBe(105000);
  });

  it('an entry of June dated in May belongs to June, so June keeps its opening', async () => {
    const [early] = await db.insert(s.transactions).values(tx({ monthId: june.id, accountId: bankId, name: 'Held in, dated May 31', amount: 7000, date: '2033-05-31', origin: 'held_in' })).returning();
    expect(await opening(june, bankId)).toBe(100000);
    expect(await opening(july, bankId)).toBe(107000);
    await db.delete(s.transactions).where(eq(s.transactions.id, early.id));
    expect(await opening(july, bankId)).toBe(100000);
  });

  it('a May transfer moves both accounts, and card rows leave the cash total alone', async () => {
    const [move] = await db.insert(s.transactions).values(tx({ monthId: may.id, accountId: bankId, destinationAccountId: walletId, name: 'To wallet', amount: 1500, date: '2033-05-10', origin: 'transfer' })).returning();
    expect(await opening(june, bankId)).toBe(98500);
    expect(await opening(june, walletId)).toBe(6500);
    expect(await monthTotal(june)).toBe(105000);
    await db.delete(s.transactions).where(eq(s.transactions.id, move.id));

    // The card has no saved opening in June, so nothing is added for it
    await db.insert(s.transactions).values(tx({ monthId: may.id, accountId: cardId, name: 'Swipe', amount: 900, date: '2033-05-11' }));
    expect(await opening(june, cardId)).toBeNaN();
    expect(await monthTotal(june)).toBe(105000);
  });

  it('moving an entry from May to June shifts only July back', async () => {
    const [spend] = await db.insert(s.transactions).values(tx({ monthId: may.id, accountId: bankId, name: 'Moved', amount: 400, date: '2033-05-20' })).returning();
    expect(await opening(june, bankId)).toBe(99600);
    await db.update(s.transactions).set({ monthId: june.id, date: '2033-06-02' }).where(eq(s.transactions.id, spend.id));
    expect(await opening(june, bankId)).toBe(100000);
    expect(await opening(july, bankId)).toBe(99600);
  });
});
