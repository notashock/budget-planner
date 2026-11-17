import { describe, it, expect } from 'vitest';
import {
  dailyLimit,
  classifyPace,
  buildDayRows,
  isSameTransaction,
  indexAccountSummaries
} from '../src/simulatorParts.js';

describe('simulate() building blocks', () => {
  it('daily limit takes bills, floor and goal reserve off today, spread over the days left, rounded down', () => {
    // 10,000 - 3,000 bills - 2,000 floor - 1,000 goals = 4,000 over 3 days = 1,333.33 -> 1,333
    expect(dailyLimit({ balance: 1000000, committed: 300000, floor: 200000, goalReserve: 100000, daysLeft: 3 }))
      .toEqual({ freeSurplus: 400000, rate: 133333 });
    // Already below what is committed: nothing to spend, never negative
    expect(dailyLimit({ balance: 100000, committed: 300000, floor: 0, daysLeft: 5 })).toEqual({ freeSurplus: 0, rate: 0 });
    // daysLeft of 0 is treated as 1 rather than dividing by zero
    expect(dailyLimit({ balance: 500, daysLeft: 0 }).rate).toBe(500);
  });

  it('pace bands: critical at no limit, over 25% above is contracting, over 25% below is expanding', () => {
    expect(classifyPace(0, 0)).toBe('critical');
    expect(classifyPace(1000, 1300)).toBe('contracting');
    expect(classifyPace(1000, 1250)).toBe('stable');
    expect(classifyPace(1000, 740)).toBe('expanding');
    expect(classifyPace(1000, 750)).toBe('stable');
  });

  it('day rows chain opening to closing balance and total each day', () => {
    const rows = buildDayRows(
      [{ day: 1, date: '2026-11-01', balance: 900 }, { day: 2, date: '2026-11-02', balance: 400 }],
      [{ day: 1, amount: -100 }, { day: 2, amount: 200 }, { day: 2, amount: -700 }],
      1000,
      500
    );
    expect(rows[0]).toMatchObject({ openingBalance: 1000, closingBalance: 900, totalInflow: 0, totalOutflow: 100, hasBreach: false });
    expect(rows[1]).toMatchObject({ openingBalance: 900, closingBalance: 400, totalInflow: 200, totalOutflow: 700, hasBreach: true });
    expect(rows[1].events).toHaveLength(2);
  });

  it('matches the same transaction by reference, _id or id', () => {
    const tx = { id: 'x' };
    expect(isSameTransaction(tx, tx)).toBe(true);
    expect(isSameTransaction({ _id: 'a' }, { _id: 'a' })).toBe(true);
    expect(isSameTransaction({ id: 'a' }, { id: 'b' })).toBe(false);
    expect(isSameTransaction(null, tx)).toBe(false);
  });

  it('indexes account summaries by id and legacy alt id', () => {
    const { accountsMap, accountSimulations } = indexAccountSummaries(
      [{ id: 'a1', altId: 'old', todayBalance: 5, minimumBalance: 2, safeVelocity: { rate: 1 } }],
      { a1: [{ day: 1, balance: 5 }] }
    );
    expect(accountsMap.old).toBe(accountsMap.a1);
    expect(accountSimulations.a1).toMatchObject({ todayBalance: 5, safetyFloor: 2, dailyBalances: [{ day: 1, balance: 5 }] });
    expect(accountSimulations.old).toBe(accountSimulations.a1);
  });
});
