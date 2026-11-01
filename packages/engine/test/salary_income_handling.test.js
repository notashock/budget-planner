import { describe, it, expect } from 'vitest';
import { simulate } from '../src/simulator.js';

describe('Salary Linking & Ad-Hoc Income Handling', () => {
  it('does not replace scheduled salary when logging an ad-hoc income with tag Salary and note bonus', () => {
    const settings = {
      incomeAmount: 1928000, // ₹19,280 scheduled salary
      salaryBankAccountId: 'bank-1',
      safetyFloor: 500000, // ₹5,000
      currentDay: 2,
      scale: 100,
      accounts: [
        { id: 'bank-1', name: 'Primary Checking', type: 'bank', isPrimary: true, openingBalance: 1000000 }
      ]
    };

    // User logs a 0.13 rs bonus income via UnifiedEntryModal with default tag 'Salary'
    const transactions = [
      {
        id: 'tx-1',
        isIncome: true,
        amount: 13, // ₹0.13
        tag: 'Salary',
        note: 'bonus',
        bankAccountId: 'bank-1'
      }
    ];

    const result = simulate(settings, [], { year: 2026, month: 11 }, transactions);

    // Total income should be 1928000 + 13 = 1928013
    expect(result.incomeAmount).toBe(1928013);

    // There should be a scheduled or actual salary event with 1928000
    const salaryEvent = result.events.find((e) => e.isSalary);
    expect(salaryEvent).toBeDefined();
    expect(salaryEvent.amount).toBe(1928000);
    expect(salaryEvent.itemType).toBe('salary');
    expect(salaryEvent.label).toContain('Salary');

    // The ad-hoc income event of 13 paise should also exist
    const adhocEvent = result.events.find((e) => e.transactionId === 'tx-1');
    expect(adhocEvent).toBeDefined();
    expect(adhocEvent.amount).toBe(13);
    expect(adhocEvent.itemType).toBe('actual-income');

    // Safety floor should NOT be breached
    expect(result.floorBreached).toBe(false);
  });

  it('correctly handles ad-hoc income with tag Bonus alongside scheduled salary', () => {
    const settings = {
      incomeAmount: 1928000,
      salaryBankAccountId: 'bank-1',
      safetyFloor: 500000,
      currentDay: 2,
      scale: 100,
      accounts: [
        { id: 'bank-1', name: 'Primary Checking', type: 'bank', isPrimary: true, openingBalance: 1000000 }
      ]
    };

    const transactions = [
      {
        id: 'tx-2',
        isIncome: true,
        amount: 50000, // ₹500
        tag: 'Bonus',
        note: 'festival bonus',
        bankAccountId: 'bank-1'
      }
    ];

    const result = simulate(settings, [], { year: 2026, month: 11 }, transactions);

    expect(result.incomeAmount).toBe(1928000 + 50000);
    const salaryEvent = result.events.find((e) => e.isSalary);
    expect(salaryEvent).toBeDefined();
    expect(salaryEvent.amount).toBe(1928000);
    expect(result.floorBreached).toBe(false);
  });

  it('fulfills scheduled salary when official salary settlement transaction is present', () => {
    const settings = {
      incomeAmount: 1928000,
      salaryBankAccountId: 'bank-1',
      safetyFloor: 500000,
      currentDay: 2,
      scale: 100,
      accounts: [
        { id: 'bank-1', name: 'Primary Checking', type: 'bank', isPrimary: true, openingBalance: 1000000 }
      ]
    };

    // Official salary crediting sets isSalary: true
    const transactions = [
      {
        id: 'tx-salary',
        isSalary: true,
        isIncome: true,
        amount: 1928000,
        tag: 'Salary',
        note: 'Monthly Salary',
        bankAccountId: 'bank-1',
        date: '2026-11-01'
      },
      {
        id: 'tx-bonus',
        isIncome: true,
        amount: 13,
        tag: 'Bonus',
        note: 'bonus',
        bankAccountId: 'bank-1',
        date: '2026-11-02'
      }
    ];

    const result = simulate(settings, [], { year: 2026, month: 11 }, transactions);

    // Total income should be 1928000 + 13 = 1928013 without double-counting salary
    expect(result.incomeAmount).toBe(1928013);
    const salaryEvents = result.events.filter((e) => e.isSalary);
    expect(salaryEvents).toHaveLength(1);
    expect(salaryEvents[0].amount).toBe(1928000);
    expect(salaryEvents[0].isActual).toBe(true);
    expect(salaryEvents[0].label).toContain('Salary');
  });
});
