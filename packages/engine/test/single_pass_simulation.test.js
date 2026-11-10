import { describe, it, expect } from 'vitest';
import { simulate } from '../src/index.js';

describe('Single-Pass Multi-Account Simulation Engine', () => {
  const bankAccount = {
    id: 'bank-1',
    name: 'Primary Checking',
    type: 'bank',
    institution: 'Standard Bank',
    isPrimary: true,
    openingBalance: 500000, // ₹5,000
    minimumBalance: 50000   // ₹500
  };

  const walletAccount = {
    id: 'wallet-1',
    name: 'Everyday Cash',
    type: 'wallet',
    isPrimary: false,
    openingBalance: 100000, // ₹1,000
    minimumBalance: 0
  };

  const accounts = [bankAccount, walletAccount];

  it('generates both portfolio simulation and per-account simulation in a single pass', () => {
    const transactions = [
      {
        id: 'tx-1',
        name: 'Salary Credit',
        amount: 250000,
        date: '2026-11-01',
        isIncome: true,
        isSalary: true,
        tag: 'Salary',
        accountId: 'bank-1',
        status: 'successful'
      },
      {
        id: 'tx-2',
        name: 'Groceries',
        amount: 30000,
        date: '2026-11-05',
        isIncome: false,
        accountId: 'wallet-1',
        status: 'successful'
      },
      {
        id: 'tx-3',
        name: 'Rent',
        amount: 150000,
        date: '2026-11-10',
        isIncome: false,
        accountId: 'bank-1',
        status: 'successful'
      }
    ];

    const result = simulate(
      {
        openingBalance: 600000,
        safetyFloor: 50000,
        incomeAmount: 250000,
        incomeCreditDate: '2026-11-01',
        salaryBankAccountId: 'bank-1',
        accounts,
        accountOpeningBalances: [
          { accountId: 'bank-1', amount: 500000 },
          { accountId: 'wallet-1', amount: 100000 }
        ],
        currentDay: 15
      },
      [],
      { year: 2026, month: 11 },
      transactions
    );

    // Verify portfolio level results
    expect(result.accountSimulations).toBeDefined();
    expect(result.accountSimulations['bank-1']).toBeDefined();
    expect(result.accountSimulations['wallet-1']).toBeDefined();

    // Verify bank account single-pass results:
    // Opening: 500k + 250k salary - 150k rent = 600k
    const bankSim = result.accountSimulations['bank-1'];
    expect(bankSim.openingBalance).toBe(500000);
    expect(bankSim.endingBalance).toBe(600000);
    expect(bankSim.floorBreached).toBe(false);
    expect(bankSim.dailyBalances.length).toBe(30);

    // Verify wallet account single-pass results:
    // Opening: 100k - 30k groceries = 70k
    const walletSim = result.accountSimulations['wallet-1'];
    expect(walletSim.openingBalance).toBe(100000);
    expect(walletSim.endingBalance).toBe(70000);
    expect(walletSim.floorBreached).toBe(false);
  });
});
