import { describe, it, expect } from 'vitest';
import { simulate, splitPaidAndPlanned, getNetPosition } from '../src/index.js';

// A refund is saved as a negative spend (ADR 0062). It gives that spending back, so the
// month's spending and Projected net must count it, as balances already do.
const acc = { id: 'a1', type: 'bank', name: 'Bank', isPrimary: true, openingBalance: 10000000 };
const card = { id: 'c1', type: 'credit_card', name: 'Card', creditLimit: 5000000, statementDay: 1, dueDay: 20 };
const MONTH = { year: 2026, month: 11 };
const run = (txs) => simulate({
  openingBalance: 10000000, incomeAmount: 0, incomeCreditDay: 1, safetyFloor: 0,
  currentDay: 25, scale: 100,
  accountOpeningBalances: [{ accountId: 'a1', amount: 10000000 }]
}, [], MONTH, txs, [], [], [acc, card]);
const tx = (id, amount, date, more = {}) => ({
  id, name: id, origin: 'spot', amount, date, status: 'successful', accountId: 'a1', isIncome: false, ...more
});

describe('refunds reduce the month\'s spending', () => {
  const movie = tx('s1', 126024, '2026-11-20');
  const refund = tx('r1', -30000, '2026-11-21', { refundTargetTransactionId: 's1' });

  it('Projected net counts the refund, matching the balance', () => {
    const before = run([movie]);
    const after = run([movie, refund]);
    expect(before.totalExpenses).toBe(126024);
    expect(after.totalExpenses).toBe(96024);
    expect(after.endingBalance - before.endingBalance).toBe(30000);
    expect(getNetPosition(after.incomeAmount, after.totalExpenses).net)
      .toBe(getNetPosition(before.incomeAmount, before.totalExpenses).net + 30000);
  });

  it('a refund on a card counts too', () => {
    const swipe = tx('s2', 50000, '2026-11-05', { accountId: 'c1' });
    const back = tx('r2', -20000, '2026-11-06', { accountId: 'c1' });
    expect(run([swipe, back]).totalExpenses).toBe(30000);
  });

  it('paid-so-far nets refunds the same way', () => {
    const { events } = run([movie, refund]);
    expect(splitPaidAndPlanned(events).paid).toBe(96024);
  });

  it('income and held money are not mistaken for refunds', () => {
    const pay = tx('i1', 40000, '2026-11-02', { isIncome: true });
    const held = tx('h1', 20000, '2026-11-03', { origin: 'held_in' });
    const sim = run([movie, pay, held]);
    expect(sim.totalExpenses).toBe(126024);
  });
});

describe('single-account view and income totals', () => {
  it('on one account a refund lowers its spending instead of adding to its income', () => {
    const movie = tx('s1', 126024, '2026-11-20');
    const refund = tx('r1', -30000, '2026-11-21');
    const a1 = run([movie, refund]).accounts.a1;
    expect(a1.totalExpenses).toBe(96024);
    expect(a1.totalIncome ?? a1.incomeAmount).toBe(0);
  });

  it('cancelled or still-planned income is not counted', () => {
    const bonus = tx('b1', 1000000, '2026-11-04', { isIncome: true, status: 'cancelled' });
    const due = tx('b2', 500000, '2026-11-28', { isIncome: true, status: 'planned', origin: 'planned' });
    const got = tx('b3', 200000, '2026-11-05', { isIncome: true });
    expect(run([bonus, due, got]).incomeAmount).toBe(200000);
  });
});
