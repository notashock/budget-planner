import { describe, it, expect } from 'vitest';
import { simulate, summarizeLowPoints } from '../src/index.js';

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
