import { describe, it, expect } from 'vitest';
import {
  simulate,
  calculateFormulaCost,
  calculateFuelEfficiency,
  recommendPurchaseDate,
  formatDisplayDate,
  formatCurrency
} from '../src/index.js';

describe('Engine Suite - Core & Sprint 2 Features', () => {
  it('passes the exact user-specified acceptance fixture', () => {
    const settingsWhole = {
      openingBalance: 0,
      incomeAmount: 19799,
      incomeCreditDay: 1,
      safetyFloor: 1000,
      scale: 1
    };

    const itemsWhole = [
      { id: '1', type: 'recurring', name: 'Rent', amount: 8500, dayOfMonth: 1 },
      { id: '2', type: 'one-time', name: 'Bill 1', amount: 3000, day: 2 },
      { id: '3', type: 'one-time', name: 'Bill 2', amount: 2000, day: 3 },
      {
        id: '4',
        type: 'formula',
        name: 'Trip',
        formulaConfig: {
          distance: 50,
          efficiency: 42.5,
          fuelPrice: 117,
          extraCost: 300,
          dates: [10, 17, 25]
        }
      },
      { id: '5', type: 'one-time', name: 'Bill 3', amount: 282, day: 12 },
      { id: '6', type: 'one-time', name: 'Bill 4', amount: 2803, day: 18 },
      { id: '7', type: 'recurring', name: 'Sub 1', amount: 89, dayOfMonth: 24 },
      { id: '8', type: 'recurring', name: 'Sub 2', amount: 319, dayOfMonth: 27 }
    ];

    const resultWhole = simulate(settingsWhole, itemsWhole, { year: 2026, month: 9 });

    expect(resultWhole.endingBalance).toBe(1492);
    expect(resultWhole.lowestBalance).toBe(1492);
    expect(resultWhole.lowestDate).toBe('2026-09-27');
    expect(resultWhole.floorBreached).toBe(false);
  });

  describe('Requirement 1: Purchase Date Recommender', () => {
    it('recommends the latest date in the month preserving safety floor', () => {
      // Income 10,000 on day 1. Bill 5,000 on day 15. Floor 2,000.
      // Purchase amount: 2,500.
      // If purchase made on day 20, balance after bill on day 15 is 5,000.
      // On day 20 balance becomes 5,000 - 2,500 = 2,500 (which is >= 2,000 floor).
      // Day 30 is latest safe date.
      const settings = {
        openingBalance: 0,
        incomeAmount: 1000000,
        incomeCreditDay: 1,
        safetyFloor: 200000,
        scale: 100
      };

      const items = [
        { id: 'rent', type: 'recurring', name: 'Mid Month Bill', amount: 500000, dayOfMonth: 15 }
      ];

      const recommendation = recommendPurchaseDate(
        settings,
        items,
        { year: 2026, month: 9 }, // 30 days
        250000 // 2,500.00
      );

      expect(recommendation.feasible).toBe(true);
      expect(recommendation.recommendedDay).toBe(30);
      expect(recommendation.recommendedDate).toBe('2026-09-30');
      expect(recommendation.savingsBuffer).toBe(50000); // 250,000 - 200,000
    });

    it('identifies unfeasible purchases that breach floor on all days', () => {
      const settings = {
        openingBalance: 0,
        incomeAmount: 500000,
        incomeCreditDay: 1,
        safetyFloor: 200000,
        scale: 100
      };

      // Trying to buy something for 4,000 when income is 5,000 and floor is 2,000 (leaves 1,000, breaching 2,000 floor)
      const recommendation = recommendPurchaseDate(
        settings,
        [],
        { year: 2026, month: 9 },
        400000
      );

      expect(recommendation.feasible).toBe(false);
      expect(recommendation.savingsBuffer).toBeLessThan(0);
    });
  });

  describe('Requirement 2: Bike Fuel Log & Efficiency', () => {
    it('sets first fuel stop as baseline and calculates efficiency on 2nd stop', () => {
      const stops = [
        { date: '2026-09-02', odometer: 12450, fuelVolume: 3.5, fuelCost: 40950 },
        { date: '2026-09-12', odometer: 12600, fuelVolume: 3.5, fuelCost: 41000 }
      ];

      const result = calculateFuelEfficiency(stops);

      expect(result.stopsWithEfficiency[0].isBaseline).toBe(true);
      expect(result.stopsWithEfficiency[0].efficiency).toBeNull();

      // 2nd stop: 12600 - 12450 = 150 km traveled on 3.5 L -> 150 / 3.5 = 42.86 km/L
      expect(result.stopsWithEfficiency[1].distanceTraveled).toBe(150);
      expect(result.stopsWithEfficiency[1].efficiency).toBe(42.86);
      expect(result.totalDistance).toBe(150);
      expect(result.averageEfficiency).toBe(42.86);
    });
  });

  describe('Requirement 3: Date formatting', () => {
    it('formats ISO dates to localized readable dates', () => {
      expect(formatDisplayDate('2026-09-18', true)).toBe('Fri, Sep 18');
      expect(formatDisplayDate('2026-09-18', false)).toBe('Sep 18');
    });
  });

  describe('Requirement 4: Unplanned Expense Logging & Actuals vs Planned', () => {
    it('replaces matched planned items with transactions and computes safe to spend per day', () => {
      const settings = {
        openingBalance: 0,
        incomeAmount: 500000, // 5,000.00
        incomeCreditDay: 1,
        safetyFloor: 100000,
        unplannedAllowance: 100000, // 1,000.00 unplanned allowance
        currentDay: 11, // Day 11 of 30 days -> 20 days left
        scale: 100
      };

      const items = [
        { id: 'item-electric', type: 'one-time', name: 'Electric Bill', amount: 80000, day: 10 }
      ];

      // 1 matched transaction (actual electric bill came to 85,000)
      // 1 unplanned transaction (Food: 20,000)
      const transactions = [
        {
          id: 'tx-1',
          date: '2026-09-10',
          amount: 85000,
          tag: 'Other',
          note: 'Electric bill actual',
          plannedItemId: 'item-electric'
        },
        {
          id: 'tx-2',
          date: '2026-09-11',
          amount: 20000,
          tag: 'Food',
          note: 'Groceries',
          plannedItemId: null
        }
      ];

      const result = simulate(settings, items, { year: 2026, month: 9 }, transactions);

      // Verify no double-counting: total events should be Income + Tx1 + Tx2 = 3 events
      expect(result.events).toHaveLength(3);
      const labels = result.events.map((e) => e.label);
      expect(labels).toContain('Income');
      expect(labels).toContain('Electric bill actual (Other)');
      expect(labels).toContain('Groceries (Food)');
      expect(labels).not.toContain('Electric Bill'); // Replaced!

      // Unplanned allowance calculation:
      // Allowance: 100,000. Unplanned spent: 20,000 (only tx-2, since tx-1 was planned).
      // Allowance left: 80,000.
      // Days left: 30 - 11 + 1 = 20 days.
      // Safe to spend per day: 80,000 / 20 = 4,000 ($40.00/day).
      expect(result.unplannedAllowance).toBe(100000);
      expect(result.totalUnplannedSpent).toBe(20000);
      expect(result.allowanceLeft).toBe(80000);
      expect(result.daysLeft).toBe(20);
      expect(result.safeToSpendPerDay).toBe(4000);
    });

    it('handles refunds (negative amounts) correctly in timeline and allowance', () => {
      const settings = {
        openingBalance: 100000,
        safetyFloor: 50000,
        unplannedAllowance: 50000,
        currentDay: 5,
        scale: 100
      };

      const transactions = [
        { id: 'tx-refund', date: '2026-09-05', amount: -15000, tag: 'Other', note: 'Store refund', plannedItemId: null }
      ];

      const result = simulate(settings, [], { year: 2026, month: 9 }, transactions);

      // Ending balance should increase by 15,000
      expect(result.endingBalance).toBe(115000);
      // Negative amount spent means unplanned spent is -15,000, so allowance left is 65,000
      expect(result.totalUnplannedSpent).toBe(-15000);
      expect(result.allowanceLeft).toBe(65000);
    });
  });

  describe('Sprint 3: Today Balance & Net Refunds', () => {
    it('calculates todayBalance up to currentDay, leaving future events for endingBalance', () => {
      // Income 10,000 on day 1. Bill 2,000 on day 5. Future bill 3,000 on day 20.
      const settings = {
        openingBalance: 0,
        incomeAmount: 1000000,
        incomeCreditDay: 1,
        currentDay: 10, // Today is day 10
        scale: 100
      };

      const items = [
        { id: '1', type: 'one-time', name: 'Past Bill', amount: 200000, day: 5 },
        { id: '2', type: 'one-time', name: 'Future Bill', amount: 300000, day: 20 }
      ];

      const result = simulate(settings, items, { year: 2026, month: 9 });

      // On day 10: balance is 10,000 - 2,000 = 8,000 (800,000 minor units)
      expect(result.todayBalance).toBe(800000);

      // On day 30: ending balance is 8,000 - 3,000 = 5,000 (500,000 minor units)
      expect(result.endingBalance).toBe(500000);
    });

    it('computes net amount for items with mapped refunds (e.g. 319 - 300 = 19)', () => {
      const items = [
        { id: 'tg-sub', type: 'recurring', name: 'Telegram Premium', amount: 31900, dayOfMonth: 5 }
      ];

      const transactions = [
        {
          id: 'tx-refund',
          date: '2026-09-08',
          amount: -30000, // Refund of 300.00
          tag: 'Other',
          note: 'Refund for Telegram Premium',
          plannedItemId: 'tg-sub'
        }
      ];

      const result = simulate({}, items, { year: 2026, month: 9 }, transactions);

      expect(result.itemNetMap['tg-sub']).toBeDefined();
      expect(result.itemNetMap['tg-sub'].originalAmount).toBe(31900);
      expect(result.itemNetMap['tg-sub'].refundTotal).toBe(30000);
      expect(result.itemNetMap['tg-sub'].netAmount).toBe(1900); // 19.00 net!
      expect(result.itemNetMap['tg-sub'].hasRefund).toBe(true);
    });
  });
});
