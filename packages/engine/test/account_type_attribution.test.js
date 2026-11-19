import { describe, it, expect } from 'vitest';
import { simulate } from '../src/index.js';

// The server sends a spend's account only as accountId (bridged to
// bankAccountId), with accountType set to the account's real type. A wallet
// spend has no walletId, so it must still be attributed to the wallet.
describe('Per-account spending by real account type', () => {
  const accounts = {
    bankAccounts: [{ id: 'bank-1', name: 'Bank', type: 'bank', openingBalance: 500000, isPrimary: true }],
    wallets: [{ id: 'wallet-1', name: 'Wallet', type: 'wallet', openingBalance: 20000 }]
  };
  const settings = {
    openingBalance: 520000,
    incomeAmount: 0,
    incomeCreditDay: 1,
    salaryBankAccountId: 'bank-1',
    currentDay: 10,
    accounts
  };
  const spend = (extra) => ({
    id: 'coffee',
    date: '2026-10-05',
    amount: 3000,
    tag: 'Food',
    status: 'successful',
    origin: 'spot',
    isIncome: false,
    accountId: 'wallet-1',
    bankAccountId: 'wallet-1',
    ...extra
  });
  const spentBy = (sim, id) => {
    const v = sim.accounts[id].safeVelocity;
    return v.totalAllowance - v.allowanceLeft;
  };

  it.each([
    ['real type', { accountType: 'wallet' }],
    ['legacy "bank" label', { accountType: 'bank' }],
    ['no type', {}]
  ])('counts a wallet spend against the wallet (%s)', (_label, extra) => {
    const sim = simulate(settings, [], { year: 2026, month: 10 }, [spend(extra)]);
    expect(spentBy(sim, 'wallet-1')).toBe(3000);
    expect(spentBy(sim, 'bank-1')).toBe(0);
  });
});
