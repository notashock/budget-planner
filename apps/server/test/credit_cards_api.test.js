import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, ensureDatabaseInitialized } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { LedgerService } from '../src/domain/ledgerService.js';
import { dueDateFor, nextStatementOnOrAfter, dateOn, addDays } from '../src/domain/cardService.js';

// Credit cards (ADR 0070): swipes are spending but move no cash; bills are
// generated on the user's day, confirmed by the user, and paid by a transfer.
describe('Credit card dates', () => {
  it('clamps the bill day to short months', () => {
    expect(dateOn(2027, 2, 31)).toBe('2027-02-28');
    expect(nextStatementOnOrAfter('2027-02-01', 31)).toBe('2027-02-28');
    expect(nextStatementOnOrAfter('2027-03-01', 31)).toBe('2027-03-31');
  });

  it('puts the due date in the next month when the due day comes before the bill day', () => {
    expect(dueDateFor('2026-11-20', 8)).toBe('2026-12-08');
    expect(dueDateFor('2026-11-05', 25)).toBe('2026-11-25');
    expect(dueDateFor('2026-12-20', 8)).toBe('2027-01-08');
  });
});

describe('Credit cards API', () => {
  let app;
  let auth;
  let userId;
  let bankId;
  let cardId;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = addDays(today, -45);
  const billDate = addDays(today, -5);
  const statementDay = Number(billDate.split('-')[2]);

  const sim = async () => {
    const res = await request(app).get(`/api/v1/periods/${year}/${month}`).set(auth);
    expect(res.status).toBe(200);
    return res.body.data.simulation;
  };
  const balanceOf = async (id) => (await db.query.accounts.findFirst({ where: eq(s.accounts.id, id) })).currentBalance;
  const getCard = async () => {
    const res = await request(app).get(`/api/v1/cards/${cardId}`).set(auth);
    expect(res.status).toBe(200);
    return res.body.data;
  };

  beforeAll(async () => {
    await ensureDatabaseInitialized();
    app = createApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: `cards_${Date.now()}@example.com`, password: 'Password123!' });
    expect(reg.status).toBe(201);
    userId = reg.body.data.user.id;
    auth = { Authorization: `Bearer ${reg.body.data.token}` };

    const bank = await request(app)
      .post('/api/v1/accounts')
      .set(auth)
      .send({ name: 'Main', type: 'bank', openingBalance: 10000000, isPrimary: true });
    expect(bank.status).toBe(201);
    bankId = bank.body.data.id;

    const m = await request(app)
      .post('/api/months')
      .set(auth)
      .send({ year, month, openingBalance: 10000000, incomeAmount: 0, safetyFloor: 100000, salaryAccountId: bankId });
    expect([200, 201]).toContain(m.status);
  });

  afterAll(async () => {
    if (userId) await db.delete(s.users).where(eq(s.users.id, userId));
  });

  it('needs a bill generation day and a due day', async () => {
    const res = await request(app)
      .post('/api/v1/accounts')
      .set(auth)
      .send({ name: 'No days', type: 'credit_card', creditLimit: 100000 });
    expect(res.status).toBe(400);
  });

  it('creates a card with the user’s own bill and due days', async () => {
    const res = await request(app)
      .post('/api/v1/accounts')
      .set(auth)
      .send({
        name: 'Visa', type: 'credit_card', creditLimit: 5000000,
        statementDay, dueDay: 28, payFromAccountId: bankId, currentOutstanding: 0, openingBalanceDate: start
      });
    expect(res.status).toBe(201);
    cardId = res.body.data.id;
    expect(res.body.data.type).toBe('credit_card');
    expect(res.body.data.isPrimary).toBe(false);
    expect(res.body.data.statementDay).toBe(statementDay);
  });

  it('a swipe adds to what is owed on the card, not to the bank', async () => {
    const res = await request(app)
      .post('/api/v1/transactions')
      .set(auth)
      .send({ name: 'Groceries', amount: 200000, origin: 'spot', date: addDays(start, 2), accountId: cardId, category: 'Food' });
    expect(res.status).toBe(201);
    expect(await balanceOf(cardId)).toBe(-200000);
    expect(await balanceOf(bankId)).toBe(10000000);
  });

  let statementId;
  it('generates a draft bill on the bill day, rolling missed cycles in', async () => {
    const card = await getCard();
    expect(card.outstanding).toBe(200000);
    const latest = card.statements[0];
    expect(latest.cycleEnd).toBe(billDate);
    expect(latest.status).toBe('draft');
    expect(latest.computedAmount).toBe(200000);
    expect(latest.dueDate).toBe(dueDateFor(billDate, 28));
    expect(card.statements.slice(1).every((st) => st.status === 'carried')).toBe(true);
    expect(card.openBill.remaining).toBe(200000);
    statementId = latest.id;

    // Idempotent: asking again creates nothing new
    const again = await getCard();
    expect(again.statements).toHaveLength(card.statements.length);
  });

  it('confirming a higher bank amount logs the difference as card charges', async () => {
    const res = await request(app)
      .post(`/api/v1/cards/statements/${statementId}/confirm`)
      .set(auth)
      .send({ statementAmount: 210000, minimumDue: 20000, logChargesDifference: true });
    expect(res.status).toBe(200);
    expect(res.body.data.statement.status).toBe('open');
    expect(res.body.data.adjustment.amount).toBe(10000);
    expect(res.body.data.adjustment.category).toBe('Card charges');
    expect(await balanceOf(cardId)).toBe(-210000);
    expect(res.body.data.card.openBill.remaining).toBe(210000);
  });

  it('a swipe this month lowers Safe-to-Spend but not the bank balance', async () => {
    const before = await sim();
    const res = await request(app)
      .post(`/api/months/${year}/${month}/transactions`)
      .set(auth)
      .send({ name: 'Dinner', note: 'Dinner', amount: 50000, origin: 'spot', date: today, accountId: cardId, category: 'Food' });
    expect(res.status).toBe(201);
    const after = await sim();
    expect(after.todayBalance).toBe(before.todayBalance);
    expect(after.totalExpenses).toBe(before.totalExpenses + 50000);
    expect(after.cardReserve).toBe(260000);
    expect(after.safeVelocity.freeSurplus).toBe(Math.max(0, before.safeVelocity.freeSurplus - 50000));
    const card = after.cards.find((c) => c.id === cardId);
    expect(card.outstanding).toBe(260000);
    expect(card.payability).toBeTruthy();
    expect(typeof card.payability.score).toBe('number');
    expect(card.payability.statement).toMatch(/bill/);
    expect(after.cardPayability).toBeTruthy();
    expect(res.body.data).toBeTruthy();
    const detail = await request(app).get(`/api/v1/periods/${year}/${month}`).set(auth);
    expect(detail.body.data.creditCards.map((c) => c.id)).toContain(cardId);
  });

  it('never takes salary into a card', async () => {
    const res = await request(app)
      .put(`/api/months/${year}/${month}`)
      .set(auth)
      .send({ salaryAccountId: cardId });
    expect(res.status).toBe(400);
  });

  it('refuses to pay a bill from the card itself', async () => {
    const res = await request(app)
      .post(`/api/v1/cards/statements/${statementId}/pay`)
      .set(auth)
      .send({ fromAccountId: cardId });
    expect(res.status).toBe(400);
  });

  it('paying the bill moves cash once and is never a second expense', async () => {
    const before = await sim();
    const res = await request(app)
      .post(`/api/v1/cards/statements/${statementId}/pay`)
      .set(auth)
      .send({ date: today });
    expect(res.status).toBe(201);
    expect(await balanceOf(bankId)).toBe(10000000 - 210000);
    expect(await balanceOf(cardId)).toBe(-50000);
    const paid = res.body.data.card.statements.find((st) => st.id === statementId);
    expect(paid.state).toBe('paid');
    expect(res.body.data.card.openBill).toBeNull();

    const after = await sim();
    expect(after.todayBalance).toBe(before.todayBalance - 210000);
    expect(after.totalExpenses).toBe(before.totalExpenses);
    expect(after.cardReserve).toBe(50000);
    // Cash and what is owed both fell by the bill: Safe-to-Spend is unchanged
    expect(after.safeVelocity.freeSurplus).toBe(before.safeVelocity.freeSurplus);
  });

  it('the month review counts the swipe once and leaves the bill payment out', async () => {
    const res = await request(app).get(`/api/months/${year}/${month}/month-end-review`).set(auth);
    expect(res.status).toBe(200);
    const review = res.body.data;
    const card = review.cardSpend.find((c) => c.accountId === cardId);
    expect(card.total).toBeGreaterThanOrEqual(50000);
    expect(review.directExpenses).toBeLessThan(210000);
  });

  it('keeps the ledger recompute in step for cards', async () => {
    const live = await balanceOf(cardId);
    await LedgerService.recomputeAccountBalance(cardId);
    expect(await balanceOf(cardId)).toBe(live);
  });
});
