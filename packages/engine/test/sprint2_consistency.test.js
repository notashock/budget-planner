import { describe, it, expect } from 'vitest';
import { simulate, summarizeLowPoints, isDiscretionarySpend } from '../src/index.js';

const PERIOD = { year: 2026, month: 10 };

describe("Sprint 2: low points never hide a past breach", () => {
  it("summarizeLowPoints returns the true low, the upcoming low and the first past breach", () => {
    const pts = [
      { day: 1, date: '2026-10-01', balance: 50000 },
      { day: 3, date: '2026-10-03', balance: -20000 },
      { day: 5, date: '2026-10-05', balance: 80000 },
      { day: 12, date: '2026-10-12', balance: 30000 },
      { day: 20, date: '2026-10-20', balance: 60000 }
    ];
    const lows = summarizeLowPoints(pts, { currentDay: 10, floor: 10000 });
    expect(lows.lowest).toEqual({ balance: -20000, date: '2026-10-03' });
    expect(lows.upcoming).toEqual({ balance: 30000, date: '2026-10-12' });
    expect(lows.pastBreach).toEqual({ balance: -20000, date: '2026-10-03' });
  });

  it("without a current day (past or future month) upcoming equals the true low and nothing is 'past'", () => {
    const pts = [{ day: 1, date: '2026-10-01', balance: 500 }, { day: 2, date: '2026-10-02', balance: 100 }];
    const lows = summarizeLowPoints(pts, { currentDay: null, floor: 1000 });
    expect(lows.upcoming).toEqual(lows.lowest);
    expect(lows.pastBreach).toBeNull();
  });

  it("an account that went overdrawn earlier this month keeps that low point and breach", () => {
    // Opening 100; spends 300 on day 3 (overdrawn -200); salary 1,000 on day 5; today is day 10.
    const accounts = [{ id: 'bank-a', name: 'Bank A', type: 'bank', openingBalance: 10000, minimumBalance: 0, isPrimary: true }];
    const settings = {
      openingBalance: 10000,
      incomeAmount: 0,
      incomeCreditDay: 1,
      safetyFloor: 0,
      currentDay: 10,
      accounts,
      accountOpeningBalances: [{ accountId: 'bank-a', amount: 10000 }]
    };
    const transactions = [
      { id: 't1', date: '2026-10-03', amount: 30000, tag: 'Shopping', status: 'successful', bankAccountId: 'bank-a' },
      { id: 't2', date: '2026-10-05', amount: 100000, isIncome: true, tag: 'Income', status: 'successful', bankAccountId: 'bank-a' }
    ];

    const result = simulate(settings, [], PERIOD, transactions, [], [], accounts);
    const acc = result.accounts['bank-a'];

    expect(acc.lowestBalance).toBe(-20000);           // was hidden: only days >= 10 were considered
    expect(acc.lowestDate).toBe('2026-10-03');
    expect(acc.floorBreached).toBe(true);
    expect(acc.pastBreach).toEqual({ balance: -20000, date: '2026-10-03' });
    expect(acc.lowestUpcomingBalance).toBe(80000);
    expect(result.pastBreach).toEqual({ balance: -20000, date: '2026-10-03' });
    expect(result.lowestUpcomingBalance).toBe(80000);
  });
});

describe("Sprint 2: pace compares discretionary spending with the daily limit", () => {
  const settings = { openingBalance: 2000000, incomeAmount: 0, incomeCreditDay: 1, safetyFloor: 0, currentDay: 10 };

  it("paying rent on day 1 does not make the month look over pace", () => {
    const transactions = [
      // Rent paid from a planned item: budgeted, not day-to-day spending
      { id: 'rent', date: '2026-10-01', amount: 1500000, tag: 'Rent', status: 'successful', origin: 'planned', plannedItemId: 'item-rent' },
      // Small everyday spend
      { id: 'coffee', date: '2026-10-05', amount: 5000, tag: 'Food', status: 'successful', origin: 'spot' }
    ];
    const result = simulate(settings, [], PERIOD, transactions);
    // Only the 50 coffee counts: 5,000 / 10 days = 500 per day
    expect(result.safeVelocity.burnRatePerDay).toBe(500);
    expect(result.safeVelocity.paceStatus).not.toBe('contracting');
  });

  it("isDiscretionarySpend ignores planned, goal, salary, transfer, unpaid and income entries", () => {
    expect(isDiscretionarySpend({ amount: 100, origin: 'spot', status: 'successful' })).toBe(true);
    expect(isDiscretionarySpend({ amount: 100 })).toBe(true); // legacy rows without status/origin
    expect(isDiscretionarySpend({ amount: 100, origin: 'planned' })).toBe(false);
    expect(isDiscretionarySpend({ amount: 100, plannedItemId: 'x' })).toBe(false);
    expect(isDiscretionarySpend({ amount: 100, origin: 'goal' })).toBe(false);
    expect(isDiscretionarySpend({ amount: 100, origin: 'transfer' })).toBe(false);
    expect(isDiscretionarySpend({ amount: 100, status: 'planned' })).toBe(false);
    expect(isDiscretionarySpend({ amount: 100, isIncome: true })).toBe(false);
  });
});

describe("Sprint 2: totalActualExpenses reports real spending", () => {
  it("sums paid/logged outflows and excludes planned items and transfers", () => {
    const settings = { openingBalance: 500000, incomeAmount: 0, incomeCreditDay: 1, safetyFloor: 0, currentDay: 15 };
    const items = [{ id: 'later', type: 'one-time', name: 'Later bill', amount: 40000, day: 25 }];
    const transactions = [
      { id: 'a', date: '2026-10-03', amount: 12000, tag: 'Food', status: 'successful' },
      { id: 'b', date: '2026-10-08', amount: 8000, tag: 'Travel', status: 'successful' }
    ];
    const result = simulate(settings, items, PERIOD, transactions);
    expect(result.totalActualExpenses).toBe(20000);
    expect(result.totalExpenses).toBe(60000);
  });
});
