import { describe, it, expect } from 'vitest';
import {
  simulate,
  scoreCardPayability,
  projectCycleSpend,
  coverageScore,
  buildCashAllocation,
  groupSpendByCategory
} from '../src/index.js';

// Credit cards (ADR 0070): a swipe is spending on the swipe day and lowers
// Safe-to-Spend, but moves no cash. Paying the bill is a transfer, never a
// second expense.
const bank = { id: 'b1', type: 'bank', name: 'Bank', isPrimary: true, openingBalance: 10000000 };
const MONTH = { year: 2026, month: 11 };
const card = (extra = {}) => ({
  id: 'c1',
  name: 'Visa',
  creditLimit: 5000000,
  openingOutstanding: 0,
  payFromAccountId: 'b1',
  cycleStart: '2026-10-21',
  cycleEnd: '2026-11-20',
  cycleDueDate: '2026-12-08',
  unbilledSoFar: 0,
  openBill: null,
  history: [],
  ...extra
});
const run = (txs, cards = [card()], extra = {}) => simulate({
  openingBalance: 10000000, incomeAmount: 0, incomeCreditDay: 1, safetyFloor: 1000000,
  currentDay: 10, scale: 100,
  accountOpeningBalances: [{ accountId: 'b1', amount: 10000000 }],
  creditCards: cards,
  ...extra
}, [], MONTH, txs, [], [], [bank]);

const swipe = (id, amount, date, more = {}) => ({ id, name: id, amount, date, status: 'successful', origin: 'spot', accountId: 'c1', isIncome: false, category: 'Food', ...more });
const payCard = (id, amount, date) => ({ id, name: 'Card payment', amount, date, status: 'successful', origin: 'transfer', accountId: 'b1', destinationAccountId: 'c1', isIncome: false });

describe('card swipes', () => {
  it('count as spending on the swipe day but leave cash alone', () => {
    const base = run([]);
    const r = run([swipe('s1', 500000, '2026-11-05')]);
    expect(r.todayBalance).toBe(base.todayBalance);
    expect(r.endingBalance).toBe(base.endingBalance);
    expect(r.totalExpenses).toBe(500000);
    expect(r.totalActualExpenses).toBe(500000);
    expect(r.totalUnplannedSpent).toBe(500000);
    const ev = r.events.find((e) => e.transactionId === 's1');
    expect(ev.isCardSpend).toBe(true);
    expect(ev.amount).toBe(-500000);
    expect(ev.balanceAfter).toBe(10000000);
    const day5 = r.days.find((d) => d.day === 5);
    expect(day5.totalOutflow).toBe(0);
  });

  it('lower Safe-to-Spend straight away', () => {
    const base = run([]);
    const r = run([swipe('s1', 500000, '2026-11-05')]);
    expect(r.cardReserve).toBe(500000);
    expect(r.safeVelocity.cardReserve).toBe(500000);
    expect(r.safeVelocity.freeSurplus).toBe(base.safeVelocity.freeSurplus - 500000);
  });

  it('never reach a cash account balance', () => {
    const r = run([swipe('s1', 500000, '2026-11-05')]);
    expect(r.accounts.b1.todayBalance).toBe(10000000);
    expect(r.accounts.b1.totalExpenses).toBe(0);
  });

  it('show in the category breakdown', () => {
    const r = run([swipe('s1', 500000, '2026-11-05')]);
    const groups = groupSpendByCategory(r.events);
    const list = Array.isArray(groups) ? groups : (groups.categories || groups.groups || []);
    expect(list.map((g) => g.category || g.name || g.key)).toContain('Food');
  });
});

describe('paying the card bill', () => {
  it('moves cash once and is not a second expense', () => {
    const base = run([]);
    const r = run([swipe('s1', 500000, '2026-11-05'), payCard('p1', 500000, '2026-11-08')]);
    expect(r.todayBalance).toBe(base.todayBalance - 500000);
    expect(r.totalExpenses).toBe(500000);
    expect(r.cardReserve).toBe(0);
    // Same Safe-to-Spend as having paid cash for it
    expect(r.safeVelocity.freeSurplus).toBe(base.safeVelocity.freeSurplus - 500000);
    expect(r.accounts.b1.todayBalance).toBe(10000000 - 500000);
  });

  it('keeps a transfer between two cash accounts at zero', () => {
    const wallet = { id: 'w1', type: 'wallet', name: 'Cash', openingBalance: 0 };
    const r = simulate({
      openingBalance: 10000000, safetyFloor: 0, currentDay: 10,
      accountOpeningBalances: [{ accountId: 'b1', amount: 10000000 }]
    }, [], MONTH, [{ id: 't1', amount: 100000, date: '2026-11-03', status: 'successful', origin: 'transfer', accountId: 'b1', destinationAccountId: 'w1' }], [], [], [bank, wallet]);
    expect(r.todayBalance).toBe(10000000);
  });
});

describe('a confirmed bill', () => {
  const billed = card({ openingOutstanding: 800000, openBill: { statementId: 'st1', remaining: 800000, dueDate: '2026-11-15' } });

  it('reserves what is owed and projects the payment on the due date', () => {
    const r = run([], [billed]);
    expect(r.cardReserve).toBe(800000);
    const ev = r.events.find((e) => e.itemType === 'card-bill');
    expect(ev.date).toBe('2026-11-15');
    expect(ev.amount).toBe(-800000);
    expect(r.endingBalance).toBe(10000000 - 800000);
    // Not double counted as a committed bill on top of the reserve
    expect(r.safeVelocity.committedUpcomingItems).toBe(0);
    expect(r.totalExpenses).toBe(0);
  });

  it('moves an overdue bill to today', () => {
    const r = run([], [card({ openingOutstanding: 800000, openBill: { remaining: 800000, dueDate: '2026-11-02' } })]);
    const ev = r.events.find((e) => e.itemType === 'card-bill');
    expect(ev.day).toBe(10);
    expect(r.events.find((e) => e.itemType === 'card-bill').isPending).toBe(true);
  });

  it('cash allocation sets card dues aside', () => {
    const alloc = buildCashAllocation({ todayBalance: 5000, safetyFloor: 1000, cardReserve: 1500 });
    expect(alloc.cards).toBe(1500);
    expect(alloc.free).toBe(2500);
  });
});

describe('Card Payability Score', () => {
  it('maps coverage to the four bands', () => {
    expect(coverageScore(2)).toBeGreaterThanOrEqual(85);
    expect(coverageScore(1.3)).toBeGreaterThanOrEqual(65);
    expect(coverageScore(1.3)).toBeLessThan(85);
    expect(coverageScore(1.0)).toBeGreaterThanOrEqual(40);
    expect(coverageScore(1.0)).toBeLessThan(65);
    expect(coverageScore(0.5)).toBeLessThan(40);
  });

  it('projects spend from this cycle and past bills', () => {
    const noHistory = projectCycleSpend({ unbilledSoFar: 100000, daysElapsed: 10, daysRemaining: 10 });
    expect(noHistory.projected).toBe(200000);
    const withHistory = projectCycleSpend({
      unbilledSoFar: 100000, daysElapsed: 10, daysRemaining: 10,
      history: [{ newSpend: 600000, cycleDays: 30 }]
    });
    // 0.6 × 10,000/day + 0.4 × 20,000/day = 14,000/day
    expect(withHistory.projected).toBe(100000 + 140000);
  });

  it('says how much over you are and how to get back to payable', () => {
    const p = scoreCardPayability({
      billedUnpaid: 0, unbilledSoFar: 2000000, projectedCycleSpend: 4230000,
      capacity: 3500000, daysRemaining: 12, history: [{ amount: 3620000, paidInFull: true }], dueDate: '2026-12-05'
    });
    // ₹35,000 against ₹42,300 is 83% coverage: the Over band
    expect(p.band).toBe('over');
    expect(p.shortfall).toBe(730000);
    expect(p.safeCardSpendPerDay).toBe(Math.floor((3500000 - 2000000) / 12));
    expect(p.statement).toMatch(/about ₹42,300/);
    expect(p.statement).toMatch(/₹6,100 more than last bill/);
    expect(p.statement).toMatch(/By 5 Dec/);
    expect(p.statement).toMatch(/₹7,300 over/);
  });

  it('compares the next bill with the last one and mentions what is still due', () => {
    const p = scoreCardPayability({
      billedUnpaid: 1875000, unbilledSoFar: 420000, projectedCycleSpend: 2276800,
      capacity: 15500000, daysRemaining: 25, history: [{ amount: 1875000, paidInFull: false }], dueDate: '2026-12-28'
    });
    expect(p.trend.nextBill).toBe(2276800);
    expect(p.trend.changeFromPrevious).toBe(2276800 - 1875000);
    expect(p.statement).toMatch(/next bill will be about ₹22,768 \(₹4,018 more than last bill\)/);
    expect(p.statement).toMatch(/₹18,750 is still due on the current bill, so ₹41,518 in all/);
  });

  it('marks down late payments and high usage', () => {
    const clean = scoreCardPayability({ projectedCycleSpend: 100000, capacity: 300000, history: [] });
    const late = scoreCardPayability({ projectedCycleSpend: 100000, capacity: 300000, history: [{ amount: 1, paidLate: true }] });
    const maxed = scoreCardPayability({ projectedCycleSpend: 100000, capacity: 300000, creditLimit: 100000, outstanding: 90000 });
    expect(late.score).toBe(clean.score - 5);
    expect(maxed.score).toBe(clean.score - 10);
  });

  it('gives no safe spend once already over', () => {
    const p = scoreCardPayability({ unbilledSoFar: 500000, projectedCycleSpend: 600000, capacity: 300000, daysRemaining: 5 });
    expect(p.band).toBe('over');
    expect(p.safeCardSpendPerDay).toBe(0);
  });

  it('is part of the simulation, using next month income when the bill falls due then', () => {
    const c = card({ unbilledSoFar: 500000 });
    const withoutIncome = run([swipe('s1', 500000, '2026-11-05')], [c]);
    const withIncome = run([swipe('s1', 500000, '2026-11-05')], [c], { nextIncome: { amount: 5000000, date: '2026-12-01' } });
    expect(withoutIncome.cards[0].payability).toBeTruthy();
    expect(withIncome.cards[0].payability.capacity).toBe(withoutIncome.cards[0].payability.capacity + 5000000);
    expect(withIncome.cardPayability.score).toBeGreaterThanOrEqual(withoutIncome.cardPayability.score);
    expect(withIncome.cards[0].outstanding).toBe(500000);
    expect(withIncome.cards[0].utilization).toBe(0.1);
  });

  it('is left out for past months', () => {
    const r = simulate({
      openingBalance: 1000000, currentDay: null,
      accountOpeningBalances: [{ accountId: 'b1', amount: 1000000 }],
      creditCards: [card({ unbilledSoFar: 1000 })]
    }, [], MONTH, [], [], [], [bank]);
    expect(r.cards[0].payability).toBeNull();
    expect(r.cardPayability).toBeNull();
  });
});
