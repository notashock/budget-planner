import { describe, it, expect } from 'vitest';
import { simulate } from '../src/index.js';

// Marking a planned bill as paid must not turn it into unplanned spending.
const acc = { id: 'a1', type: 'bank', name: 'Bank', isPrimary: true };
const run = (txs) => simulate({
  openingBalance: 10000000, incomeAmount: 0, incomeCreditDay: 1, safetyFloor: 1000000,
  currentDay: 10, scale: 100,
  accounts: { bankAccounts: [acc], wallets: [] },
  accountOpeningBalances: [{ accountId: 'a1', openingBalance: 10000000 }], transfers: []
}, [], { year: 2026, month: 11 }, txs, [], [], [acc]);

const bill = {
  id: 'b1', name: 'Rent', amount: 3000000, date: '2026-11-10', plannedDate: '2026-11-10',
  plannedAmount: 3000000, status: 'planned', origin: 'planned', accountId: 'a1'
};

describe('paying a planned bill', () => {
  it('keeps the unplanned allowance and spend unchanged when settled in place', () => {
    const before = run([bill]);
    const after = run([{ ...bill, status: 'successful' }]);
    expect(after.totalUnplannedSpent).toBe(before.totalUnplannedSpent);
    expect(after.unplannedAllowance).toBe(before.unplannedAllowance);
    expect(after.endingBalance).toBe(before.endingBalance);
  });

  it('shows the paid bill as a matched actual, not an unplanned expense', () => {
    const after = run([{ ...bill, status: 'successful' }]);
    const ev = after.events.find((e) => e.transactionId === 'b1');
    expect(ev.itemType).toBe('actual-matched');
  });

  it('still counts a real unplanned expense', () => {
    const after = run([{ id: 'u1', name: 'Snacks', amount: 50000, date: '2026-11-09', status: 'successful', origin: 'manual', accountId: 'a1' }]);
    expect(after.totalUnplannedSpent).toBe(50000);
  });
});
