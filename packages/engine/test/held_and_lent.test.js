import { describe, it, expect } from 'vitest';
import {
  simulate,
  isDiscretionarySpend,
  isPassThrough,
  passThroughDeltas,
  buildCashAllocation,
  calculateIrregularMetrics,
  groupSpendByCategory
} from '../src/index.js';

// Held & Lent money (ADR 0069): cash moves, but it is never income or expense,
// and money held for others is ring-fenced out of Safe-to-Spend and the floor check.
const acc = { id: 'a1', type: 'bank', name: 'Bank', isPrimary: true, openingBalance: 10000000 };
const MONTH = { year: 2026, month: 11 };
const run = (txs, extra = {}) => simulate({
  openingBalance: 10000000, incomeAmount: 0, incomeCreditDay: 1, safetyFloor: 1000000,
  currentDay: 10, scale: 100,
  accountOpeningBalances: [{ accountId: 'a1', amount: 10000000 }],
  ...extra
}, [], MONTH, txs, [], [], [acc]);

const tx = (id, origin, amount, date, more = {}) => ({
  id, name: id, origin, amount, date, status: 'successful', accountId: 'a1', isIncome: false, ...more
});

describe('pass-through helpers', () => {
  it('recognises the four origins and their direction', () => {
    expect(isPassThrough('held_in')).toBe(true);
    expect(isPassThrough({ origin: 'lent_repaid' })).toBe(true);
    expect(isPassThrough('spot')).toBe(false);
    expect(passThroughDeltas('held_in', 500)).toEqual({ held: 500, lent: 0 });
    expect(passThroughDeltas('held_return', 500)).toEqual({ held: -500, lent: 0 });
    expect(passThroughDeltas('lent_out', 500)).toEqual({ held: 0, lent: 500 });
    expect(passThroughDeltas('lent_repaid', 500)).toEqual({ held: 0, lent: -500 });
  });

  it('never counts as discretionary spending', () => {
    expect(isDiscretionarySpend(tx('x', 'held_return', 100, '2026-11-02'))).toBe(false);
    expect(isDiscretionarySpend(tx('x', 'lent_out', 100, '2026-11-02'))).toBe(false);
  });
});

describe('holding money for someone', () => {
  const heldIn = tx('h1', 'held_in', 2000000, '2026-11-03', { personName: 'Ravi' });
  const heldOut = tx('h2', 'held_return', 2000000, '2026-11-08', { personName: 'Ravi' });

  it('moves cash but adds nothing to income or expenses', () => {
    const base = run([]);
    const held = run([heldIn]);
    expect(held.endingBalance).toBe(base.endingBalance + 2000000);
    expect(held.totalIncome).toBe(base.totalIncome);
    expect(held.totalExpenses).toBe(base.totalExpenses);
    expect(held.totalActualExpenses).toBe(0);
    expect(held.totalUnplannedSpent).toBe(0);
    const ev = held.events.find((e) => e.transactionId === 'h1');
    expect(ev.itemType).toBe('pass-through');
    expect(ev.amount).toBe(2000000);
    expect(ev.label).toBe('Holding for Ravi');
  });

  it('ring-fences held money out of Safe-to-Spend', () => {
    const base = run([]);
    const held = run([heldIn]);
    expect(held.todayBalance).toBe(base.todayBalance + 2000000);
    expect(held.heldReserve).toBe(2000000);
    expect(held.safeVelocity.freeSurplus).toBe(base.safeVelocity.freeSurplus);
    expect(held.safeToSpendPerDay).toBe(base.safeToSpendPerDay);
    expect(held.accounts.a1.heldForOthers).toBe(2000000);
    expect(held.accounts.a1.safeVelocity.freeSurplus).toBe(base.accounts.a1.safeVelocity.freeSurplus);
  });

  it('returning it is net zero: no expense, nothing left held', () => {
    const base = run([]);
    const both = run([heldIn, heldOut]);
    expect(both.endingBalance).toBe(base.endingBalance);
    expect(both.totalExpenses).toBe(base.totalExpenses);
    expect(both.totalIncome).toBe(base.totalIncome);
    expect(both.heldReserve).toBe(0);
    expect(both.safeToSpendPerDay).toBe(base.safeToSpendPerDay);
    expect(both.passThrough).toMatchObject({ heldIn: 2000000, heldReturned: 2000000 });
  });

  it('does not let held money hide a floor breach', () => {
    // Own money 1,000,000 below a 1,000,000 floor after spending 9,500,000; held cash masks it
    const spend = tx('s1', 'spot', 9500000, '2026-11-05');
    const withoutHeld = run([spend]);
    const withHeld = run([spend, heldIn]);
    expect(withoutHeld.floorBreached).toBe(true);
    expect(withHeld.floorBreached).toBe(true);
    expect(withHeld.lowestBalance).toBe(withoutHeld.lowestBalance);
    const day5 = withHeld.days.find((d) => d.day === 5);
    expect(day5.heldForOthers).toBe(2000000);
    expect(day5.hasBreach).toBe(true);
  });

  it('carries money held from earlier months', () => {
    const r = run([], { heldOpeningBalance: 1500000, heldOpeningByAccount: { a1: 1500000 } });
    const base = run([]);
    expect(r.heldReserve).toBe(1500000);
    expect(r.safeVelocity.freeSurplus).toBe(base.safeVelocity.freeSurplus - 1500000);
    expect(r.accounts.a1.heldForOthers).toBe(1500000);
  });

  it('a planned return is shown but not double-reserved as a bill', () => {
    const plannedReturn = { ...heldOut, id: 'h3', status: 'planned', date: '2026-11-20', plannedDate: '2026-11-20', plannedAmount: 2000000 };
    const r = run([heldIn, plannedReturn]);
    const ev = r.events.find((e) => e.transactionId === 'h3');
    expect(ev.itemType).toBe('pass-through');
    expect(ev.amount).toBe(-2000000);
    expect(r.safeVelocity.committedUpcomingItems).toBe(0);
    expect(r.heldReserve).toBe(2000000);
    expect(r.totalExpenses).toBe(0);
  });
});

describe('lending money', () => {
  it('lowers cash, is not an expense, and repayment is not income', () => {
    const base = run([]);
    const lent = run([tx('l1', 'lent_out', 1000000, '2026-11-02', { personName: 'Asha' })]);
    expect(lent.todayBalance).toBe(base.todayBalance - 1000000);
    expect(lent.totalExpenses).toBe(0);
    expect(lent.lentOutstanding).toBe(1000000);
    expect(lent.heldReserve).toBe(0);
    expect(lent.safeVelocity.freeSurplus).toBe(base.safeVelocity.freeSurplus - 1000000);

    const repaid = run([
      tx('l1', 'lent_out', 1000000, '2026-11-02'),
      tx('l2', 'lent_repaid', 1000000, '2026-11-06')
    ]);
    expect(repaid.todayBalance).toBe(base.todayBalance);
    expect(repaid.totalIncome).toBe(base.totalIncome);
    expect(repaid.lentOutstanding).toBe(0);
  });

  it('an expected repayment does not raise Safe-to-Spend today', () => {
    const lentRun = run([tx('l1', 'lent_out', 1000000, '2026-11-02')]);
    const withExpected = run([
      tx('l1', 'lent_out', 1000000, '2026-11-02'),
      { ...tx('l2', 'lent_repaid', 1000000, '2026-11-25'), status: 'planned', plannedDate: '2026-11-25', plannedAmount: 1000000 }
    ]);
    expect(withExpected.safeVelocity.freeSurplus).toBe(lentRun.safeVelocity.freeSurplus);
  });
});

describe('insights and reports skip held & lent money', () => {
  it('cash allocation sets held money aside', () => {
    const alloc = buildCashAllocation({ todayBalance: 5000, committedUpcomingItems: 1000, safetyFloor: 1000, heldReserve: 2000 });
    expect(alloc.held).toBe(2000);
    expect(alloc.free).toBe(1000);
    expect(alloc.segments.map((s) => s.key)).toContain('held');
  });

  it('category breakdown leaves it out', () => {
    const r = run([tx('h1', 'held_in', 2000000, '2026-11-03'), tx('h2', 'held_return', 2000000, '2026-11-04'), tx('s1', 'spot', 50000, '2026-11-04', { category: 'Food' })]);
    const groups = groupSpendByCategory(r.events);
    const list = Array.isArray(groups) ? groups : (groups.categories || groups.groups || []);
    const names = list.map((g) => g.category || g.name || g.key);
    expect(names).toContain('Food');
    expect(names).not.toContain('Held & Lent');
  });

  it('irregular income metrics ignore it for income and spending but keep the cash', () => {
    const m = calculateIrregularMetrics({
      transactions: [
        tx('h1', 'held_in', 2000000, '2026-10-03'),
        tx('h2', 'lent_out', 500000, '2026-10-04')
      ],
      accounts: [{ ...acc, openingBalance: 0 }],
      asOfDate: '2026-11-10'
    });
    expect(m.trailing12mIncome).toBe(0);
    expect(m.trailing12mSpending).toBe(0);
    expect(m.currentBalance).toBe(1500000);
  });
});
