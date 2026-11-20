import { describe, it, expect } from 'vitest';
import { recommendPurchaseDate, evaluateGoalsWithReservation } from '../src/index.js';

const month = { year: 2026, month: 10 };
const settings = {
  openingBalance: 500000, // ₹5,000
  incomeAmount: 0,
  incomeCreditDay: 1,
  safetyFloor: 100000, // ₹1,000
  currentDay: 10
};

describe('Goal evaluation by status', () => {
  it('gives a newly created (logged) goal a purchase-date recommendation', () => {
    const [goal] = evaluateGoalsWithReservation({
      settings,
      month,
      goals: [{ id: 'g-new', name: 'Headphones', targetAmount: 150000, priority: 0, status: 'logged' }]
    });

    expect(goal.status).toBe('logged');
    expect(goal.recommendation).toBeDefined();
    expect(goal.recommendation.feasible).toBe(true);
    expect(goal.recommendation.recommendedDay).toBeGreaterThanOrEqual(10);
  });

  it('reserves a logged goal in strict priority order (ADR 0063)', () => {
    // ₹5,000 opening, ₹1,000 floor -> ₹4,000 of headroom. The P0 goal takes ₹3,000;
    // the P2 goal (₹2,000) no longer fits once the P0 reservation is made.
    const evaluated = evaluateGoalsWithReservation({
      settings,
      month,
      goals: [
        { id: 'g-low', name: 'Gadget', targetAmount: 200000, priority: 2, status: 'logged' },
        { id: 'g-high', name: 'Laptop', targetAmount: 300000, priority: 0, status: 'logged' }
      ]
    });

    // Output keeps the input order
    expect(evaluated.map((g) => g.id)).toEqual(['g-low', 'g-high']);
    const high = evaluated.find((g) => g.id === 'g-high');
    const low = evaluated.find((g) => g.id === 'g-low');
    expect(high.recommendation.feasible).toBe(true);
    expect(low.recommendation.feasible).toBe(false);
  });

  it('passes parked and closed goals through without a recommendation', () => {
    const evaluated = evaluateGoalsWithReservation({
      settings,
      month,
      goals: ['deferred', 'achieved', 'dropped'].map((status) => ({
        id: `g-${status}`, name: status, targetAmount: 100000, priority: 0, status
      }))
    });

    for (const g of evaluated) {
      expect(g.recommendation).toBeUndefined();
    }
  });
});

describe('Recommendation explanations', () => {
  it('states the feasible safety buffer as currency, not minor units', () => {
    const rec = recommendPurchaseDate(settings, [], month, 150000);
    expect(rec.feasible).toBe(true);
    // 500000 - 150000 - 100000 = 250000 minor units = ₹2,500
    expect(rec.explanation).toContain('₹2,500');
    expect(rec.explanation).not.toContain('minor units');
  });

  it('states the infeasible floor deficit as currency, using the month currency symbol', () => {
    const rec = recommendPurchaseDate({ ...settings, currencySymbol: '$' }, [], month, 450000);
    expect(rec.feasible).toBe(false);
    // 500000 - 450000 - 100000 = -50000 minor units -> $500 short
    expect(rec.explanation).toContain('$500');
    expect(rec.explanation).not.toContain('minor units');
  });
});
