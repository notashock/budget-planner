import { describe, it, expect } from 'vitest';
import {
  simulate,
  calculateFuelEfficiency,
  recommendPurchaseDate,
  formatDisplayDate,
  formatCurrency
} from '../src/index.js';

describe('Engine Suite - Core & Sprint Features', () => {
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
      { id: '4a', type: 'one-time', name: 'Trip 1', amount: 438, day: 10 },
      { id: '4b', type: 'one-time', name: 'Trip 2', amount: 438, day: 17 },
      { id: '4c', type: 'one-time', name: 'Trip 3', amount: 438, day: 25 },
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

  describe('Sprint 2: Bike Fuel Log & Efficiency', () => {
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

  describe('Sprint 2: Date and Currency formatting', () => {
    it('formats ISO dates to localized readable dates', () => {
      expect(formatDisplayDate('2026-09-18', true)).toBe('Fri, Sep 18');
      expect(formatDisplayDate('2026-09-18', false)).toBe('Sep 18');
    });

    it('formats currency in Indian Rupees by default', () => {
      expect(formatCurrency(150000)).toContain('₹');
      expect(formatCurrency(150000)).toContain('1,500.00');
    });
  });

  describe('Sprint 2: Unplanned Expense Logging & Actuals vs Planned', () => {
    it('replaces matched planned items with transactions and computes safe to spend per day', () => {
      const settings = {
        openingBalance: 0,
        incomeAmount: 500000,
        incomeCreditDay: 1,
        safetyFloor: 100000,
        unplannedAllowance: 100000,
        currentDay: 11,
        scale: 100
      };

      const items = [
        { id: 'item-electric', type: 'one-time', name: 'Electric Bill', amount: 80000, day: 10 }
      ];

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

      expect(result.events).toHaveLength(3);
      const labels = result.events.map((e) => e.label);
      expect(labels).toContain('Income');
      expect(labels).toContain('Electric bill actual (Other)');
      expect(labels).toContain('Groceries (Food)');
      expect(labels).not.toContain('Electric Bill');

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

      expect(result.endingBalance).toBe(115000);
      expect(result.totalUnplannedSpent).toBe(-15000);
      expect(result.allowanceLeft).toBe(65000);
    });
  });

  describe('Sprint 3: Today Balance & Net Refunds', () => {
    it('calculates todayBalance up to currentDay, leaving future events for endingBalance', () => {
      const settings = {
        openingBalance: 0,
        incomeAmount: 1000000,
        incomeCreditDay: 1,
        currentDay: 10,
        scale: 100
      };

      const items = [
        { id: '1', type: 'one-time', name: 'Past Bill', amount: 200000, day: 5 },
        { id: '2', type: 'one-time', name: 'Future Bill', amount: 300000, day: 20 }
      ];

      const result = simulate(settings, items, { year: 2026, month: 9 });

      expect(result.todayBalance).toBe(800000);
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
          amount: -30000,
          tag: 'Other',
          note: 'Refund for Telegram Premium',
          plannedItemId: 'tg-sub'
        }
      ];

      const result = simulate({}, items, { year: 2026, month: 9 }, transactions);

      expect(result.itemNetMap['tg-sub']).toBeDefined();
      expect(result.itemNetMap['tg-sub'].originalAmount).toBe(31900);
      expect(result.itemNetMap['tg-sub'].refundTotal).toBe(30000);
      expect(result.itemNetMap['tg-sub'].netAmount).toBe(1900);
      expect(result.itemNetMap['tg-sub'].hasRefund).toBe(true);
    });
  });

  describe('Sprint 4: Salary Credit Date & Dynamic Goal Estimation Pipeline', () => {
    it('handles salary credited on Sept 30th as available cash from Day 1 of October', () => {
      const octoberSettings = {
        openingBalance: 0,
        incomeAmount: 8000000, // ₹80,000.00
        incomeCreditDate: '2026-09-30', // Credited Sep 30th for October budget
        safetyFloor: 1000000,
        scale: 100
      };

      const items = [
        { id: 'rent-oct', type: 'recurring', name: 'October Rent', amount: 2500000, dayOfMonth: 1, isFixed: true }
      ];

      const result = simulate(octoberSettings, items, { year: 2026, month: 10 });

      // Salary should be credited on Day -1 (Sept 30)
      const incomeEvent = result.events.find((e) => e.amount > 0);
      expect(incomeEvent).toBeDefined();
      expect(incomeEvent.date).toBe('2026-09-30');
      expect(incomeEvent.day).toBe(-1);
      expect(incomeEvent.label).toContain('Salary (credited 2026-09-30)');

      // On Day -1, balance = 80,000; on Day 1, balance = 80,000 - 25,000 = 55,000
      expect(result.dailyBalances[0].date).toBe('2026-09-30');
      expect(result.dailyBalances[0].day).toBe(-1);
      expect(result.dailyBalances[0].balance).toBe(8000000);
      expect(result.dailyBalances[1].date).toBe('2026-10-01');
      expect(result.dailyBalances[1].day).toBe(1);
      expect(result.dailyBalances[1].balance).toBe(5500000);
      expect(result.endingBalance).toBe(5500000);
    });

    it('treats pre-month dates as relative negative days (-1 for Sep 30, -2 for Sep 29)', () => {
      const settings = {
        openingBalance: 1000000, // ₹10,000 opening
        incomeAmount: 5000000,
        incomeCreditDay: 1,
        safetyFloor: 1000000,
        scale: 100
      };

      const items = [
        { id: 'item-pre', type: 'one-time', name: 'Pre-Month Item', amount: 200000, day: -1, date: '2026-09-30' }
      ];

      const transactions = [
        { id: 'tx-pre2', date: '2026-09-29', amount: 100000, note: 'Pre-month dinner' }
      ];

      const result = simulate(settings, items, { year: 2026, month: 10 }, transactions);

      // Events should have tx on Day -2 (2026-09-29) and item on Day -1 (2026-09-30)
      const eventPre2 = result.events.find((e) => e.date === '2026-09-29');
      expect(eventPre2).toBeDefined();
      expect(eventPre2.day).toBe(-2);
      expect(eventPre2.balanceAfter).toBe(900000); // 10,000 - 1,000 = 9,000

      const eventPre1 = result.events.find((e) => e.date === '2026-09-30');
      expect(eventPre1).toBeDefined();
      expect(eventPre1.day).toBe(-1);
      expect(eventPre1.balanceAfter).toBe(700000); // 9,000 - 2,000 = 7,000

      // Income occurs on Day 1 (+50,000) -> 7,000 + 50,000 = 57,000
      const incomeEvent = result.events.find((e) => e.day === 1 && e.amount > 0);
      expect(incomeEvent.balanceAfter).toBe(5700000);

      // Daily balances include Day -2, Day -1, then Day 1
      expect(result.dailyBalances[0].day).toBe(-2);
      expect(result.dailyBalances[0].balance).toBe(900000);
      expect(result.dailyBalances[1].day).toBe(-1);
      expect(result.dailyBalances[1].balance).toBe(700000);
      expect(result.dailyBalances[2].day).toBe(1);
      expect(result.dailyBalances[2].balance).toBe(5700000);
    });

    it('estimates goal date dynamically: ignores past dates and schedules after heavy bills', () => {
      const settings = {
        openingBalance: 1000000,
        incomeAmount: 10000000, // 100,000
        incomeCreditDay: 1,
        safetyFloor: 2000000, // 20,000 floor
        unplannedAllowance: 1500000,
        currentDay: 10 // Today is the 10th
      };

      // Heavy bill (Rent: 40,000) on the 15th
      const items = [
        { id: 'rent', type: 'recurring', name: 'Rent', amount: 4000000, dayOfMonth: 15, isFixed: true }
      ];

      // User wants to buy a goal for ₹30,000 (3,000,000 minor units)
      const recommendation = recommendPurchaseDate(
        settings,
        items,
        { year: 2026, month: 10 },
        3000000
      );

      expect(recommendation.feasible).toBe(true);
      // Must not recommend any day before today (day 10)
      expect(recommendation.recommendedDay).toBeGreaterThanOrEqual(10);
      // Diversifies load by scheduling after the heavy rent bill on Day 15 onto zero-load Day 16
      expect(recommendation.recommendedDay).toBe(16);
      expect(recommendation.savingsBuffer).toBeGreaterThanOrEqual(0);
    });

    it('returns recommendedDate: null and never displays an arbitrary date when goal is infeasible', () => {
      const settings = {
        openingBalance: 0,
        incomeAmount: 5000000, // 50,000
        incomeCreditDay: 1,
        safetyFloor: 2000000, // 20,000 floor
        currentDay: 5
      };

      // Goal price 45,000 would leave only 5,000, severely breaching the 20,000 floor
      const recommendation = recommendPurchaseDate(
        settings,
        [],
        { year: 2026, month: 10 },
        4500000
      );

      expect(recommendation.feasible).toBe(false);
      // Strictly null — must not return an arbitrary date
      expect(recommendation.recommendedDate).toBeNull();
      expect(recommendation.recommendedDay).toBeNull();
      expect(recommendation.projectedFloorDeficit).toBeGreaterThan(0);
      expect(recommendation.explanation).toContain('Price is too high for this month');
    });

    it('computes buffer from running-balance timeline taking expenses into account, recommending waiting for next month when buffer is negative', () => {
      // Scenario from user:
      // Income + opening balance: 7,743 (774,300 minor units)
      // Expenses: 4,622 (462,200 minor units) arriving on Day 10 and Day 20
      // Real balance remaining: 3,121 (312,100 minor units)
      // Purchase: 2,500 (250,000 minor units) - Helmet
      // Safety floor: 1,000 (100,000 minor units)
      // Projected balance would drop to 3,121 - 2,500 = 621 (62,100 minor units)
      // Safety buffer: 3,121 - 2,500 - 1,000 = -379 (-37,900 minor units), deficit = 379
      const settings = {
        openingBalance: 0,
        incomeAmount: 774300,
        incomeCreditDay: 1,
        safetyFloor: 100000,
        currentDay: 1
      };

      const items = [
        { id: 'bills-1', type: 'recurring', name: 'Utility Bills', amount: 200000, dayOfMonth: 10, isFixed: true },
        { id: 'bills-2', type: 'one-time', name: 'Insurance & Groceries', amount: 262200, day: 20 }
      ];

      const recommendation = recommendPurchaseDate(
        settings,
        items,
        { year: 2026, month: 10 },
        250000 // Helmet: 2,500
      );

      // Must be infeasible because buffer (-379) is negative on all days
      expect(recommendation.feasible).toBe(false);
      expect(recommendation.recommendedDate).toBeNull();
      expect(recommendation.recommendedDay).toBeNull();
      expect(recommendation.savingsBuffer).toBe(-37900);
      expect(recommendation.projectedFloorDeficit).toBe(37900);
      expect(recommendation.projectedLowestBalance).toBe(62100);
      expect(recommendation.explanation).toContain('Price is too high for this month');
      expect(recommendation.explanation).toContain('Wait for next month');
    });

    it('calculates dynamic pace-adaptive Safe Velocity based on liquid cash, upcoming items, safety floor, and goals', () => {
      // Income: 500,000 (Day 1)
      // Safety Floor: 100,000
      // Current Day: 10
      // Upcoming planned item on Day 20: 150,000
      // Active goal: 50,000
      // Unplanned spending so far (days 1-10): 20,000
      // Liquid cash on Day 10: 500,000 - 20,000 = 480,000
      // Free Surplus: 480,000 - 150,000 (upcoming) - 100,000 (floor) - 50,000 (goal) = 180,000
      // Days left in October (31 days, day 10): 31 - 10 + 1 = 22 days
      // Safe velocity per day: Math.floor(180,000 / 22) = 8,181
      const settings = {
        openingBalance: 0,
        incomeAmount: 500000,
        incomeCreditDay: 1,
        safetyFloor: 100000,
        currentDay: 10,
        unplannedAllowance: 0 // dynamic mode
      };

      const items = [
        { id: 'upcoming-item', type: 'one-time', name: 'Car Service', amount: 150000, day: 20 }
      ];

      const transactions = [
        { id: 'tx-1', date: '2026-10-05', amount: 20000, tag: 'Food', note: 'Dinner', plannedItemId: null }
      ];

      const goals = [
        { id: 'goal-1', status: 'active', name: 'Headphones', targetAmount: 50000 }
      ];

      const result = simulate(settings, items, { year: 2026, month: 10 }, transactions, goals);

      expect(result.safeVelocity).toBeDefined();
      // Per ADR 0041: Unpaid planned item is not deducted from Safe Velocity
      expect(result.safeVelocity.freeSurplus).toBe(330000);
      expect(result.safeVelocity.daysLeft).toBe(22);
      expect(result.safeVelocity.safeVelocityPerDay).toBe(15000);
      expect(result.safeToSpendPerDay).toBe(15000);
      expect(result.allowanceLeft).toBe(330000);
      expect(result.safeVelocity.committedUpcomingItems).toBe(0);
      expect(result.safeVelocity.activeGoalsCost).toBe(50000);
      expect(result.safeVelocity.burnRatePerDay).toBe(2000); // 20,000 / 10 days

      // When the upcoming item is marked paid, its cash is debited from todayBalance directly (committedUpcomingItems is 0, freeSurplus is 180000)
      const paidResult = simulate(settings, [{ ...items[0], isPaid: true }], { year: 2026, month: 10 }, transactions, goals);
      expect(paidResult.safeVelocity.committedUpcomingItems).toBe(0);
      expect(paidResult.safeVelocity.freeSurplus).toBe(180000);
      expect(paidResult.safeVelocity.safeVelocityPerDay).toBe(8181);
    });

    it('preserves cash in todayBalance for unpaid past-due items and deducts when marked isPaid: true', () => {
      const settings = {
        openingBalance: 100000,
        incomeAmount: 0,
        incomeCreditDay: 1,
        safetyFloor: 10000,
        currentDay: 10
      };

      const unpaidItems = [
        { id: 'item-1', type: 'one-time', name: 'Past Bill', amount: 30000, day: 5, isPaid: false }
      ];

      // With isPaid: false, payment not done yet -> money is still in account on Day 10!
      const unpaidResult = simulate(settings, unpaidItems, { year: 2026, month: 10 });
      expect(unpaidResult.todayBalance).toBe(100000);
      expect(unpaidResult.endingBalance).toBe(70000);
      expect(unpaidResult.events[0].isPending).toBe(true);
      expect(unpaidResult.events[0].originalDay).toBe(5);

      // With isPaid: true, payment was completed on Day 5 -> todayBalance is debited!
      const paidItems = [
        { id: 'item-1', type: 'one-time', name: 'Past Bill', amount: 30000, day: 5, isPaid: true }
      ];
      const paidResult = simulate(settings, paidItems, { year: 2026, month: 10 });
      expect(paidResult.todayBalance).toBe(70000);
      expect(paidResult.endingBalance).toBe(70000);
      expect(paidResult.events[0].isPending).toBe(false);
      expect(paidResult.events[0].day).toBe(5);
    });

    describe('ADR 0041: Dynamic Velocity Unpaid Exclusion, Load Smoothing, and Forward-Rolling', () => {
      it('diversifies date recommendations to avoid heavy-load days', () => {
        const settings = {
          openingBalance: 500000,
          incomeAmount: 5000000,
          incomeCreditDay: 1,
          safetyFloor: 100000,
          currentDay: 10
        };

        const items = [
          // Day 12 has a heavy load (50,000)
          { id: 'bill-1', type: 'one-time', name: 'Heavy Bill', amount: 5000000, day: 12 },
          // Day 13 has zero load
        ];

        // Recommend purchase for 1,500 (150000 minor units)
        const rec = recommendPurchaseDate(settings, items, { year: 2026, month: 10 }, 150000);
        expect(rec.feasible).toBe(true);
        // Instead of stacking on Day 12, recommender picks the zero-load Day 13
        expect(rec.recommendedDay).toBe(13);
      });

      it('rolls overdue unpaid items into future days and preserves originalDay', () => {
        const settings = {
          openingBalance: 300000,
          incomeAmount: 0,
          incomeCreditDay: 1,
          safetyFloor: 50000,
          currentDay: 8
        };

        const items = [
          // Scheduled on Day 3, but unpaid
          { id: 'bill-past', type: 'one-time', name: 'Past Due Bill', amount: 50000, day: 3, originalDay: 3, isPaid: false },
          // Scheduled on Day 9 with existing load
          { id: 'bill-future', type: 'one-time', name: 'Future Bill', amount: 100000, day: 9, isPaid: false }
        ];

        const sim = simulate(settings, items, { year: 2026, month: 10 });
        const pastItemEvt = sim.events.find((e) => e.itemId === 'bill-past');
        expect(pastItemEvt).toBeDefined();
        expect(pastItemEvt.isPending).toBe(true);
        expect(pastItemEvt.originalDay).toBe(3);
        // Forward-rolled after currentDay (Day 8); picks zero-load Day 10 rather than Day 9
        expect(pastItemEvt.day).toBeGreaterThan(8);
        expect(pastItemEvt.day).toBe(10);
      });
    });
  });
});

