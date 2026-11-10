import { describe, it, expect } from 'vitest';
import {
  calculateIrregularMetrics,
  calculatePeriodBoundaries,
  getNextPeriodBoundaries,
  isPeriodExpired
} from '../src/index.js';

describe('Irregular Income & Period Boundaries Engine Suite', () => {
  it('calculates irregular income metrics with hand-calculated example', () => {
    const mockAccounts = [
      { id: 'acc-1', name: 'Primary Bank', openingBalance: 100000, openingBalanceDate: '2026-01-01' }
    ];

    const mockTransactions = [
      // Irregular Income
      { id: 't-1', amount: 60000, date: '2026-02-15', isIncome: true, status: 'successful', note: 'harvest' },
      { id: 't-2', amount: 40000, date: '2026-05-20', isIncome: true, status: 'successful', note: 'freelance design' },
      { id: 't-3', amount: 80000, date: '2026-08-10', isIncome: true, status: 'successful', note: 'consulting' },
      // Spending
      { id: 't-4', amount: 30000, date: '2026-03-01', isIncome: false, status: 'successful', category: 'Supplies' },
      { id: 't-5', amount: 45000, date: '2026-06-15', isIncome: false, status: 'successful', category: 'Equipment' },
      { id: 't-6', amount: 25000, date: '2026-09-01', isIncome: false, status: 'successful', category: 'Insurance' },
      // Planned transactions should NOT affect real balances or trailing actuals
      { id: 't-7', amount: 50000, date: '2026-11-01', isIncome: true, status: 'planned', note: 'future harvest' },
      { id: 't-8', amount: 10000, date: '2026-11-05', isIncome: false, status: 'planned', category: 'Seeds' }
    ];

    const metrics = calculateIrregularMetrics({
      transactions: mockTransactions,
      accounts: mockAccounts,
      asOfDate: '2026-10-20'
    });

    // Income: 60k + 40k + 80k = 180,000
    expect(metrics.trailing12mIncome).toBe(180000);
    // Smoothed monthly income: 180,000 / 12 = 15,000
    expect(metrics.smoothedMonthlyIncome).toBe(15000);

    // Spending: 30k + 45k + 25k = 100,000
    expect(metrics.trailing12mSpending).toBe(100000);
    // Average monthly spending: 100,000 / 12 = 8,333
    expect(metrics.avgMonthlySpending).toBe(8333);

    // Current balance: 100,000 (opening) + 180,000 (income) - 100,000 (spending) = 180,000
    expect(metrics.currentBalance).toBe(180000);

    // Runway: 180,000 / 8,333 = 21.60 -> 21.6 months
    expect(metrics.runwayMonths).toBe(21.6);
    expect(metrics.runwayDisplay).toBe('21.6 mo');
    expect(metrics.isIndefinite).toBe(false);

    // Quarterly aggregates
    expect(metrics.quarterly).toHaveLength(3);
    expect(metrics.quarterly[0]).toEqual({
      key: '2026-Q1',
      quarter: 'Q1',
      year: 2026,
      income: 60000,
      spending: 30000,
      net: 30000
    });
    expect(metrics.quarterly[1]).toEqual({
      key: '2026-Q2',
      quarter: 'Q2',
      year: 2026,
      income: 40000,
      spending: 45000,
      net: -5000
    });
    expect(metrics.quarterly[2]).toEqual({
      key: '2026-Q3',
      quarter: 'Q3',
      year: 2026,
      income: 80000,
      spending: 25000,
      net: 55000
    });

    // Yearly aggregates
    expect(metrics.yearly).toHaveLength(1);
    expect(metrics.yearly[0]).toEqual({
      key: '2026',
      year: 2026,
      income: 180000,
      spending: 100000,
      net: 80000
    });
  });

  it('safely handles empty state (no accounts, no transactions) with zero crashes', () => {
    const metrics = calculateIrregularMetrics({
      transactions: [],
      accounts: [],
      asOfDate: '2026-10-20'
    });

    expect(metrics.trailing12mIncome).toBe(0);
    expect(metrics.smoothedMonthlyIncome).toBe(0);
    expect(metrics.trailing12mSpending).toBe(0);
    expect(metrics.avgMonthlySpending).toBe(0);
    expect(metrics.currentBalance).toBe(0);
    expect(metrics.isIndefinite).toBe(true);
    expect(metrics.runwayDisplay).toBe('Indefinite');
    expect(metrics.quarterly).toEqual([]);
    expect(metrics.yearly).toEqual([]);
  });

  it('safely handles zero-spending state with positive balance without division by zero', () => {
    const metrics = calculateIrregularMetrics({
      accounts: [{ openingBalance: 50000 }],
      transactions: [
        { amount: 50000, date: '2026-05-10', isIncome: true, status: 'successful' }
      ],
      asOfDate: '2026-10-20'
    });

    expect(metrics.avgMonthlySpending).toBe(0);
    expect(metrics.currentBalance).toBe(100000);
    expect(metrics.isIndefinite).toBe(true);
    expect(metrics.runwayDisplay).toBe('Indefinite');
  });

  it('safely handles zero or negative balance with active spending', () => {
    const metrics = calculateIrregularMetrics({
      accounts: [{ openingBalance: 10000 }],
      transactions: [
        { amount: 20000, date: '2026-08-01', isIncome: false, status: 'successful' }
      ],
      asOfDate: '2026-10-20'
    });

    // 10k opening - 20k spent = -10,000 balance
    expect(metrics.currentBalance).toBe(-10000);
    expect(metrics.runwayMonths).toBe(0);
    expect(metrics.runwayDisplay).toBe('0.0 mo');
    expect(metrics.isIndefinite).toBe(false);
  });

  describe('Period Boundary Calculations', () => {
    it('calculates full calendar month boundaries', () => {
      const bounds = calculatePeriodBoundaries({
        periodType: 'calendar_month',
        targetDate: '2026-10-15'
      });

      expect(bounds.startDate).toBe('2026-10-01');
      expect(bounds.endDate).toBe('2026-10-31');
      expect(bounds.isPartial).toBe(false);
    });

    it('creates partial calendar month starting on openingBalanceDate', () => {
      const bounds = calculatePeriodBoundaries({
        periodType: 'calendar_month',
        targetDate: '2026-10-15',
        openingBalanceDate: '2026-10-12'
      });

      expect(bounds.startDate).toBe('2026-10-12');
      expect(bounds.originalStartDate).toBe('2026-10-01');
      expect(bounds.endDate).toBe('2026-10-31');
      expect(bounds.isPartial).toBe(true);
    });

    it('calculates salary-to-salary cycle when targetDate is before credit day', () => {
      // Expected credit day: 25. Target date: Oct 10 -> cycle is Sep 25 to Oct 24
      const bounds = calculatePeriodBoundaries({
        periodType: 'salary_cycle',
        creditDay: 25,
        targetDate: '2026-10-10'
      });

      expect(bounds.startDate).toBe('2026-09-25');
      expect(bounds.endDate).toBe('2026-10-24');
      expect(bounds.isPartial).toBe(false);
    });

    it('calculates salary-to-salary cycle when targetDate is on or after credit day', () => {
      // Expected credit day: 25. Target date: Oct 25 -> cycle is Oct 25 to Nov 24
      const bounds = calculatePeriodBoundaries({
        periodType: 'salary_cycle',
        creditDay: 25,
        targetDate: '2026-10-25'
      });

      expect(bounds.startDate).toBe('2026-10-25');
      expect(bounds.endDate).toBe('2026-11-24');
      expect(bounds.isPartial).toBe(false);
    });

    it('supports partial salary-to-salary cycle starting from openingBalanceDate', () => {
      const bounds = calculatePeriodBoundaries({
        periodType: 'salary_cycle',
        creditDay: 25,
        targetDate: '2026-10-20',
        openingBalanceDate: '2026-10-05'
      });

      expect(bounds.startDate).toBe('2026-10-05');
      expect(bounds.originalStartDate).toBe('2026-09-25');
      expect(bounds.endDate).toBe('2026-10-24');
      expect(bounds.isPartial).toBe(true);
    });

    it('computes next period boundaries seamlessly from previous end date', () => {
      const nextCycle = getNextPeriodBoundaries({
        periodType: 'salary_cycle',
        creditDay: 25,
        previousEndDate: '2026-10-24'
      });

      expect(nextCycle.startDate).toBe('2026-10-25');
      expect(nextCycle.endDate).toBe('2026-11-24');
    });

    it('evaluates whether a period has expired based on asOfDate', () => {
      expect(isPeriodExpired('2026-10-31', '2026-10-15')).toBe(false);
      expect(isPeriodExpired('2026-10-31', '2026-10-31')).toBe(false);
      expect(isPeriodExpired('2026-10-31', '2026-11-01')).toBe(true);
    });
  });
});
