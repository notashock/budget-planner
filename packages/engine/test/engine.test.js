import { describe, it, expect } from 'vitest';
import {
  simulate,
  calculateFormulaCost,
  getDaysInMonth,
  clampDayToMonth,
  toMinorUnits,
  toMajorUnits,
  formatCurrency
} from '../src/index.js';

describe('Deterministic Simulation Engine', () => {
  it('passes the exact user-specified acceptance fixture', () => {
    // Acceptance Fixture:
    // Income 19,799 on day 1.
    // Items:
    // - recurring rent 8,500 on day 1
    // - one-time 3,000 on day 2
    // - one-time 2,000 on day 3
    // - formula trip (50 km, 42.5 km/L, fuel 117/L, extra 300, so 438 each) on days 10, 17, 25
    // - one-time 282 on day 12
    // - one-time 2,803 on day 18
    // - recurring 89 on day 24
    // - recurring 319 on day 27
    // Floor 1,000.
    // Expected: ending balance 1,492, lowest balance 1,492, floor not breached.

    // 1. Direct Whole-Unit Test (scale = 1)
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

    // Verify day 1 ordering: Income executes before Rent on day 1
    const day1Events = resultWhole.events.filter((e) => e.day === 1);
    expect(day1Events).toHaveLength(2);
    expect(day1Events[0].label).toBe('Income');
    expect(day1Events[0].amount).toBe(19799);
    expect(day1Events[0].balanceAfter).toBe(19799);

    expect(day1Events[1].label).toBe('Rent');
    expect(day1Events[1].amount).toBe(-8500);
    expect(day1Events[1].balanceAfter).toBe(11299);

    // 2. Minor-Unit Standard Test (scale = 100, cents)
    const settingsMinor = {
      openingBalance: 0,
      incomeAmount: 1979900,
      incomeCreditDay: 1,
      safetyFloor: 100000,
      scale: 100
    };

    const itemsMinor = [
      { id: '1', type: 'recurring', name: 'Rent', amount: 850000, dayOfMonth: 1 },
      { id: '2', type: 'one-time', name: 'Bill 1', amount: 300000, day: 2 },
      { id: '3', type: 'one-time', name: 'Bill 2', amount: 200000, day: 3 },
      {
        id: '4',
        type: 'formula',
        name: 'Trip',
        formulaConfig: {
          distance: 50,
          efficiency: 42.5,
          fuelPrice: 11700,
          extraCost: 30000,
          dates: [10, 17, 25]
        }
      },
      { id: '5', type: 'one-time', name: 'Bill 3', amount: 28200, day: 12 },
      { id: '6', type: 'one-time', name: 'Bill 4', amount: 280300, day: 18 },
      { id: '7', type: 'recurring', name: 'Sub 1', amount: 8900, dayOfMonth: 24 },
      { id: '8', type: 'recurring', name: 'Sub 2', amount: 31900, dayOfMonth: 27 }
    ];

    const resultMinor = simulate(settingsMinor, itemsMinor, { year: 2026, month: 9 });

    expect(resultMinor.endingBalance).toBe(149200);
    expect(resultMinor.lowestBalance).toBe(149200);
    expect(resultMinor.lowestDate).toBe('2026-09-27');
    expect(resultMinor.floorBreached).toBe(false);
  });

  it('detects safety floor breach accurately', () => {
    const settings = {
      openingBalance: 0,
      incomeAmount: 5000,
      incomeCreditDay: 1,
      safetyFloor: 1000,
      scale: 1
    };

    const items = [
      { id: '1', type: 'one-time', name: 'Big Repair', amount: 4500, day: 5 }
    ];

    const result = simulate(settings, items, { year: 2026, month: 9 });
    // Balance drops from 5000 to 500 on day 5, which is < 1000
    expect(result.lowestBalance).toBe(500);
    expect(result.lowestDate).toBe('2026-09-05');
    expect(result.floorBreached).toBe(true);
  });

  it('clamps recurring items to the last day of short months', () => {
    const items = [
      { id: 'sub', type: 'recurring', name: 'End of month bill', amount: 100, dayOfMonth: 31 }
    ];

    // February non-leap year (28 days)
    const feb2026 = simulate({ incomeAmount: 0, scale: 1 }, items, { year: 2026, month: 2 });
    expect(feb2026.events[0].day).toBe(28);
    expect(feb2026.events[0].date).toBe('2026-02-28');

    // February leap year (29 days)
    const feb2024 = simulate({ incomeAmount: 0, scale: 1 }, items, { year: 2024, month: 2 });
    expect(feb2024.events[0].day).toBe(29);
    expect(feb2024.events[0].date).toBe('2024-02-29');

    // April (30 days)
    const apr2026 = simulate({ incomeAmount: 0, scale: 1 }, items, { year: 2026, month: 4 });
    expect(apr2026.events[0].day).toBe(30);
    expect(apr2026.events[0].date).toBe('2026-04-30');
  });

  it('orders same-day events stably: income first, then lower priority numbers, then insertion order', () => {
    const settings = {
      incomeAmount: 1000,
      incomeCreditDay: 5,
      scale: 1
    };

    const items = [
      { id: 'c', type: 'one-time', name: 'Late Bill', amount: 100, day: 5, priority: 10 },
      { id: 'a', type: 'one-time', name: 'Urgent Bill', amount: 200, day: 5, priority: 1 },
      { id: 'b', type: 'one-time', name: 'Standard Bill 1', amount: 50, day: 5, priority: 5 },
      { id: 'd', type: 'one-time', name: 'Standard Bill 2', amount: 60, day: 5, priority: 5 }
    ];

    const result = simulate(settings, items, { year: 2026, month: 5 });
    const labels = result.events.map((e) => e.label);

    expect(labels).toEqual([
      'Income',          // Priority -Infinity
      'Urgent Bill',     // Priority 1
      'Standard Bill 1', // Priority 5 (first in items array)
      'Standard Bill 2', // Priority 5 (second in items array)
      'Late Bill'        // Priority 10
    ]);
  });

  it('calculates formula costs and rounds to whole units as specified', () => {
    // 50 km, 42.5 km/L, fuel 117/L, extra 300
    // (50 / 42.5) * 117 + 300 = 437.647... -> 438
    const cost = calculateFormulaCost({
      distance: 50,
      efficiency: 42.5,
      fuelPrice: 117,
      extraCost: 300,
      scale: 1
    });
    expect(cost).toBe(438);

    // Minor unit scaling
    const costMinor = calculateFormulaCost({
      distance: 50,
      efficiency: 42.5,
      fuelPrice: 11700,
      extraCost: 30000,
      scale: 100
    });
    expect(costMinor).toBe(43800);
  });

  it('formats currency cleanly without floating-point errors', () => {
    expect(formatCurrency(149200, '$', 100)).toBe('$1,492.00');
    expect(formatCurrency(1492, '$', 1)).toBe('$1,492.00');
    expect(formatCurrency(-5000, '$', 100)).toBe('-$50.00');
  });
});
