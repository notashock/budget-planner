import { describe, it, expect } from 'vitest';
import { getNetWorth } from '../src/index.js';

describe('getNetWorth', () => {
  const bank = { type: 'bank', currentBalance: 3400000 };
  const wallet = { type: 'wallet', currentBalance: 150000 };

  it('is zero with nothing', () => {
    expect(getNetWorth().total).toBe(0);
  });

  it('adds bank and wallet balances, skipping archived accounts and card rows', () => {
    const r = getNetWorth({ accounts: [bank, wallet, { type: 'bank', currentBalance: 99, isArchived: true }, { type: 'credit_card', currentBalance: -500 }] });
    expect(r.cash).toBe(3550000);
    expect(r.total).toBe(3550000);
  });

  it('adds money lent and subtracts money held for others', () => {
    expect(getNetWorth({ personFunds: { lent: 50000 } }).total).toBe(50000);
    expect(getNetWorth({ personFunds: { held: 859900 } }).total).toBe(-859900);
  });

  it('subtracts card debt from outstanding or from a card ledger balance', () => {
    expect(getNetWorth({ cards: [{ outstanding: 250000 }] }).cardsOwed).toBe(250000);
    expect(getNetWorth({ cards: [{ currentBalance: -216352 }] }).cardsOwed).toBe(216352);
    // A card with no bill yet, or in credit, owes nothing
    expect(getNetWorth({ cards: [{ outstanding: 0 }, { currentBalance: 1200 }] }).cardsOwed).toBe(0);
  });

  it('mixes every input and can go negative', () => {
    const r = getNetWorth({
      accounts: [bank, wallet],
      cards: [{ outstanding: 250000 }],
      personFunds: { lent: 50000, held: 100000 },
    });
    expect(r).toEqual({ total: 3250000, cash: 3550000, lent: 50000, cardsOwed: 250000, held: 100000 });
    expect(getNetWorth({ accounts: [{ type: 'bank', currentBalance: 1000 }], cards: [{ outstanding: 5000 }] }).total).toBe(-4000);
  });
});
