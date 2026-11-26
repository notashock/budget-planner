import { describe, it, expect } from 'vitest';
import { simulate } from '../src/index.js';

// A salary cycle 26 Nov - 25 Dec, named December (the month it mostly covers).
// Days are counted from the cycle's start, not by December's calendar.
const acc = { id: 'a1', type: 'bank', name: 'HDFC', isPrimary: true };
const cycle = { year: 2026, month: 12, startDate: '2026-11-26', endDate: '2026-12-25' };
const rent = {
  id: 'r1', name: 'Rent', amount: 3000000, date: '2026-12-05', plannedDate: '2026-12-05',
  plannedAmount: 3000000, status: 'planned', origin: 'planned', accountId: 'a1'
};
const run = (currentDay, month = cycle) => simulate({
  openingBalance: 13000000, incomeAmount: 0, safetyFloor: 0,
  currentDay, scale: 100,
  accounts: { bankAccounts: [acc], wallets: [] },
  accountOpeningBalances: [{ accountId: 'a1', openingBalance: 13000000 }], transfers: []
}, [], month, [rent], [], [], [acc]);

describe('a salary cycle that crosses into the next month', () => {
  it('on its first day (26 Nov) has 30 days left and counts the 5 Dec rent as still to come', () => {
    const sim = run(26);
    expect(sim.daysInMonth).toBe(30);
    expect(sim.dailyBalances[0].date).toBe('2026-11-26');
    expect(sim.dailyBalances.at(-1).date).toBe('2026-12-25');
    expect(sim.currentDay).toBe(1);
    expect(sim.safeVelocity.daysLeft).toBe(30);
    expect(sim.safeVelocity.committedUpcomingItems).toBe(3000000);
    expect(sim.events.find((e) => e.transactionId === 'r1').date).toBe('2026-12-05');
  });

  it('on 5 Dec has 21 days left', () => {
    const sim = run(5);
    expect(sim.currentDay).toBe(10);
    expect(sim.safeVelocity.daysLeft).toBe(21);
  });

  it('a month that does not cross into the next is counted by its calendar, as before', () => {
    const sim = run(26, { year: 2026, month: 11, startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(sim.daysInMonth).toBe(30);
    expect(sim.currentDay).toBe(26);
    expect(sim.safeVelocity.daysLeft).toBe(5);
  });
});
