import { describe, it, expect } from 'vitest';
import {
  buildCashAllocation,
  getNetPosition,
  splitPaidAndPlanned,
  getAllowancePace,
  getUpcomingOutflows,
  groupSpendByCategory,
  getRunwayBand,
  getHeadroom
} from '../src/index.js';

describe('Plan insights: buildCashAllocation', () => {
  it('splits today balance into committed, floor reserve and free (matches Safe Velocity)', () => {
    const a = buildCashAllocation({ todayBalance: 6120000, committedUpcomingItems: 4230000, safetyFloor: 1000000 });
    expect(a.committed).toBe(4230000);
    expect(a.floorReserve).toBe(1000000);
    expect(a.free).toBe(890000);
    expect(a.shortfall).toBe(0);
    expect(a.committed + a.floorReserve + a.free).toBe(6120000);
    expect(a.segments.map((s) => s.key)).toEqual(['committed', 'floor', 'free']);
  });

  it('reports a shortfall when bills plus floor exceed the balance', () => {
    const a = buildCashAllocation({ todayBalance: 500000, committedUpcomingItems: 400000, safetyFloor: 300000 });
    expect(a.committed).toBe(400000);
    expect(a.floorReserve).toBe(100000);
    expect(a.free).toBe(0);
    expect(a.shortfall).toBe(200000);
    expect(a.total).toBe(700000);
  });

  it('never lets an engine freeSurplus exceed what is left after bills and floor', () => {
    const a = buildCashAllocation({ todayBalance: 1000, committedUpcomingItems: 400, safetyFloor: 100, freeSurplus: 9999 });
    expect(a.free).toBe(500);
  });

  it('clamps a negative balance to zero and treats everything as shortfall', () => {
    const a = buildCashAllocation({ todayBalance: -2000, committedUpcomingItems: 1000, safetyFloor: 500 });
    expect(a.committed).toBe(0);
    expect(a.floorReserve).toBe(0);
    expect(a.free).toBe(0);
    expect(a.shortfall).toBe(1500);
  });

  it('sets aside goal savings after bills and floor, and never turns goals into a shortfall', () => {
    const a = buildCashAllocation({ todayBalance: 100000, committedUpcomingItems: 40000, safetyFloor: 20000, goalReserve: 15000 });
    expect(a).toMatchObject({ committed: 40000, floorReserve: 20000, goalSavings: 15000, free: 25000, shortfall: 0 });
    expect(a.segments.map((s) => s.key)).toEqual(['committed', 'floor', 'goals', 'free']);

    const tight = buildCashAllocation({ todayBalance: 50000, committedUpcomingItems: 40000, safetyFloor: 20000, goalReserve: 15000 });
    expect(tight).toMatchObject({ goalSavings: 0, free: 0, shortfall: 10000 });
  });

  it('handles empty input', () => {
    const a = buildCashAllocation();
    expect(a.total).toBe(0);
    expect(a.segments).toEqual([]);
  });
});

describe('Plan insights: getNetPosition and splitPaidAndPlanned', () => {
  it('computes net and savings rate', () => {
    const n = getNetPosition(13500000, 9340000);
    expect(n.net).toBe(4160000);
    expect(n.savingsRate).toBeCloseTo(0.3081, 3);
  });

  it('returns a null savings rate with zero income', () => {
    expect(getNetPosition(0, 5000).savingsRate).toBeNull();
    expect(getNetPosition(0, 5000).net).toBe(-5000);
  });

  it('splits expenses into paid and planned, ignoring transfers and inflows', () => {
    const s = splitPaidAndPlanned([
      { amount: -1000, isActual: true },
      { amount: -500, isPaid: true },
      { amount: -2000 },
      { amount: -3000, itemType: 'transfer' },
      { amount: 9000, isSalary: true }
    ]);
    expect(s).toEqual({ paid: 1500, planned: 2000 });
  });
});

describe('Plan insights: getAllowancePace', () => {
  it('returns null without an allowance', () => {
    expect(getAllowancePace({ unplannedAllowance: 0 })).toBeNull();
  });

  it('flags spending ahead of the expected line', () => {
    const p = getAllowancePace({ unplannedAllowance: 1000000, totalUnplannedSpent: 620000, daysElapsed: 15, daysInMonth: 30 });
    expect(p.expectedByToday).toBe(500000);
    expect(p.delta).toBe(120000);
    expect(p.status).toBe('over');
    expect(p.left).toBe(380000);
  });

  it('treats a small deviation as on pace and a large underspend as under', () => {
    expect(getAllowancePace({ unplannedAllowance: 1000, totalUnplannedSpent: 520, daysElapsed: 15, daysInMonth: 30 }).status).toBe('on');
    expect(getAllowancePace({ unplannedAllowance: 1000, totalUnplannedSpent: 100, daysElapsed: 15, daysInMonth: 30 }).status).toBe('under');
  });

  it('caps the used ratio at 1 when overspent', () => {
    expect(getAllowancePace({ unplannedAllowance: 1000, totalUnplannedSpent: 1500, daysElapsed: 30, daysInMonth: 30 }).usedRatio).toBe(1);
  });
});

describe('Plan insights: getUpcomingOutflows', () => {
  const events = [
    { label: 'Internet', date: '2026-11-14', amount: -1200, itemType: 'planned-transaction' },
    { label: 'Old rent', date: '2026-11-17', originalDate: '2026-11-05', amount: -5000, isPending: true },
    { label: 'Electricity', date: '2026-11-17', amount: -3400 },
    { label: 'Rent', date: '2026-11-21', amount: -40000 },
    { label: 'Beyond window', date: '2026-11-25', amount: -999 },
    { label: 'Paid already', date: '2026-11-18', amount: -700, isPaid: true },
    { label: 'Transfer', date: '2026-11-18', amount: -5000, itemType: 'transfer' },
    { label: 'Salary', date: '2026-11-30', amount: 135000, isSalary: true }
  ];

  it('lists overdue first, then due items in the window, excluding paid and transfers', () => {
    const u = getUpcomingOutflows(events, '2026-11-17', 7);
    expect(u.items.map((i) => i.label)).toEqual(['Old rent', 'Internet', 'Electricity', 'Rent']);
    expect(u.overdueCount).toBe(2);
    expect(u.total).toBe(1200 + 5000 + 3400 + 40000);
    expect(u.items.find((i) => i.label === 'Electricity').isDueToday).toBe(true);
  });

  it('reports days until the next unpaid salary', () => {
    const u = getUpcomingOutflows(events, '2026-11-17', 7);
    expect(u.nextSalaryDate).toBe('2026-11-30');
    expect(u.daysToSalary).toBe(13);
  });

  it('returns an empty result without a today date or events', () => {
    expect(getUpcomingOutflows(events, null).items).toEqual([]);
    expect(getUpcomingOutflows([], '2026-11-17').total).toBe(0);
  });
});

describe('Plan insights: groupSpendByCategory', () => {
  it('groups case-insensitively, splits paid vs planned and sorts largest first', () => {
    const g = groupSpendByCategory([
      { category: 'Food', amount: -300, isActual: true },
      { category: 'food', amount: -200 },
      { tag: 'Rent', amount: -4000 },
      { amount: -50 },
      { category: 'Transfer', amount: -999, itemType: 'transfer' },
      { category: 'Salary', amount: 9000 }
    ]);
    expect(g.categories.map((c) => c.name)).toEqual(['Rent', 'Food', 'Uncategorised']);
    const food = g.categories.find((c) => c.name === 'Food');
    expect(food).toMatchObject({ paid: 300, planned: 200, total: 500, count: 2 });
    expect(g.total).toBe(4550);
    expect(g.max).toBe(4000);
  });

  it('folds categories beyond topN into Other', () => {
    const evts = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c, i) => ({ category: c, amount: -(100 - i), isActual: true }));
    const g = groupSpendByCategory(evts, { topN: 5 });
    expect(g.categories).toHaveLength(6);
    expect(g.categories[5]).toMatchObject({ name: 'Other', isOther: true, total: 95 + 94 });
  });

  it('does not create an Other bucket for a single leftover category', () => {
    const evts = ['A', 'B', 'C', 'D', 'E', 'F'].map((c) => ({ category: c, amount: -10 }));
    expect(groupSpendByCategory(evts, { topN: 5 }).categories.some((c) => c.isOther)).toBe(false);
  });
});

describe('Plan insights: getRunwayBand and getHeadroom', () => {
  it('maps runway months to emergency-fund bands', () => {
    expect(getRunwayBand(1.2).key).toBe('low');
    expect(getRunwayBand(4.2).key).toBe('building');
    expect(getRunwayBand(6).key).toBe('healthy');
    expect(getRunwayBand(Infinity).key).toBe('healthy');
    expect(getRunwayBand(NaN).key).toBe('low');
  });

  it('computes headroom above a minimum balance with status', () => {
    expect(getHeadroom(5000, 1000)).toMatchObject({ amount: 4000, status: 'healthy' });
    expect(getHeadroom(1100, 1000).status).toBe('warning');
    expect(getHeadroom(900, 1000).status).toBe('breached');
    expect(getHeadroom(0, 0).ratio).toBe(0);
  });
});
