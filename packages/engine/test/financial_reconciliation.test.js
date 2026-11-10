import { describe, it, expect } from 'vitest';
import { simulate, calculateIrregularMetrics } from '../src/index.js';

describe('Financial Reconciliation & Engine Integrity Audits', () => {
  const bank = {
    id: 'bank-1',
    name: 'Main Bank',
    type: 'bank',
    openingBalance: 100000,
    minimumBalance: 0,
    isPrimary: true
  };

  const wallet = {
    id: 'wallet-1',
    name: 'Cash Wallet',
    type: 'wallet',
    openingBalance: 20000,
    minimumBalance: 0,
    isPrimary: true
  };

  const accounts = [bank, wallet];

  it('excludes inter-account transfers from totalAllSpentToDate and daily burn pace', () => {
    const settings = {
      openingBalance: 120000,
      safetyFloor: 10000,
      currentDay: 10,
      accounts,
      accountOpeningBalances: [
        { accountId: 'bank-1', amount: 100000 },
        { accountId: 'wallet-1', amount: 20000 }
      ]
    };

    const transactions = [
      // Normal living expense
      {
        id: 'tx-food',
        name: 'Dinner',
        amount: 2000,
        date: '2026-10-05',
        isIncome: false,
        status: 'successful',
        origin: 'spot',
        accountId: 'bank-1'
      },
      // Inter-account transfer of 30,000 from Bank to Wallet
      {
        id: 'tx-transfer-1',
        name: 'Inter-Account Transfer',
        amount: 30000,
        date: '2026-10-06',
        isIncome: false,
        status: 'successful',
        origin: 'transfer',
        accountId: 'bank-1',
        destinationAccountId: 'wallet-1'
      }
    ];

    const result = simulate(settings, [], { year: 2026, month: 10 }, transactions);

    // totalAllSpentToDate should ONLY reflect the 2,000 expense, NOT the 30,000 transfer!
    expect(result.safeVelocity.burnRatePerDay).toBe(Math.round(2000 / 10)); // 200/day, not 3200/day!
    // Safe velocity should remain healthy, never falsely flagging 'critical' or 'contracting'
    expect(result.safeVelocity.paceStatus).not.toBe('critical');
    expect(result.safeVelocity.paceStatus).not.toBe('contracting');
  });

  it('computes aggLowestBalance as the true daily minimum instead of false sum-of-minimums', () => {
    const settings = {
      openingBalance: 100000,
      safetyFloor: 50000,
      currentDay: 28,
      accounts: [
        { id: 'bank-1', name: 'Bank', type: 'bank', openingBalance: 80000, minimumBalance: 0 },
        { id: 'wallet-1', name: 'Wallet', type: 'wallet', openingBalance: 20000, minimumBalance: 0 }
      ],
      accountOpeningBalances: [
        { accountId: 'bank-1', amount: 80000 },
        { accountId: 'wallet-1', amount: 20000 }
      ]
    };

    const transactions = [
      { id: 'tx-1', name: 'Expense 1', amount: 5000, date: '2026-10-02', isIncome: false, status: 'successful', accountId: 'bank-1' },
      { id: 'tx-2', name: 'Expense 2', amount: 5000, date: '2026-10-25', isIncome: false, status: 'successful', accountId: 'wallet-1' }
    ];

    const result = simulate(settings, [], { year: 2026, month: 10 }, transactions);

    // Minimum balance should be exactly 90,000 (100k - 5k - 5k)
    expect(result.lowestBalance).toBe(90000);
    // Since 90k >= 50k safetyFloor, floorBreached should be false!
    expect(result.floorBreached).toBe(false);
  });

  it('preserves user configured monthly safety floor when accounts have 0 minimum balance', () => {
    const settings = {
      openingBalance: 100000,
      safetyFloor: 25000, // User configured 25k safeline in header
      accounts: [
        { id: 'bank-1', name: 'Bank', type: 'bank', openingBalance: 100000, minimumBalance: 0 }
      ]
    };

    const result = simulate(settings, [], { year: 2026, month: 10 }, []);
    expect(result.safetyFloor).toBe(25000);
  });

  it('excludes transfers from irregular income engine runway and spending calculations', () => {
    const transactions = [
      { id: 'tx-inc', amount: 60000, isIncome: true, status: 'successful', date: '2026-05-01' },
      { id: 'tx-exp', amount: 20000, isIncome: false, status: 'successful', date: '2026-06-01' },
      // Internal transfer
      { id: 'tx-tr', amount: 40000, isIncome: false, status: 'successful', origin: 'transfer', destinationAccountId: 'wallet-1', date: '2026-07-01' }
    ];

    const metrics = calculateIrregularMetrics({
      transactions,
      accounts: [{ openingBalance: 40000 }],
      asOfDate: '2026-10-01',
      windowMonths: 12
    });

    // Average spending should be based on 20,000 / 12, NOT (20,000 + 40,000) / 12
    expect(metrics.avgMonthlySpending).toBe(Math.round(20000 / 12));
    // Current balance should NOT have the 40,000 transfer deducted
    expect(metrics.currentBalance).toBe(40000 + 60000 - 20000);
  });
});
