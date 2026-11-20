import { describe, it, expect } from 'vitest';
import { simulate } from '../src/simulator.js';

// A salary credited through the server is stored as a transaction with
// origin 'salary' (name 'Monthly Salary', no note or tag). The engine must
// treat that row as the month's salary, not as a second income on top of the
// expected-salary event.
describe('salary credited through the server (origin = salary)', () => {
  const settings = {
    openingBalance: 5000000, // ₹50,000
    incomeAmount: 8000000, // ₹80,000
    isSalaryCredited: true,
    salaryCreditedDate: '2026-11-01',
    currentDay: 20,
    scale: 100
  };

  const run = (tx) => simulate(settings, [], { year: 2026, month: 11 }, [tx]);

  for (const category of ['Income', 'Salary']) {
    it(`counts the salary once (category ${category})`, () => {
      const tx = {
        id: 'salary-tx-1',
        name: 'Monthly Salary',
        origin: 'salary',
        isIncome: true,
        status: 'successful',
        amount: 8000000,
        date: '2026-11-01',
        category
      };
      const result = run(tx);

      expect(result.totalIncome).toBe(8000000);
      expect(result.incomeAmount).toBe(8000000);
      expect(result.todayBalance).toBe(13000000);

      const incomeEvents = result.events.filter((e) => e.amount > 0);
      expect(incomeEvents).toHaveLength(1);
      expect(incomeEvents[0].isSalary).toBe(true);
      expect(incomeEvents[0].transactionId).toBe('salary-tx-1');
      expect(incomeEvents[0].label).toBe('Salary (Credited)');

      expect(result.isSalaryCredited).toBe(true);
      expect(result.salaryTransactionId).toBe('salary-tx-1');
      expect(result.salaryCreditedDate).toBe('2026-11-01');
    });
  }

  it('counts the salary once in the receiving account simulation', () => {
    const result = simulate(
      {
        ...settings,
        salaryBankAccountId: 'bank-1',
        accounts: [{ id: 'bank-1', name: 'Savings', type: 'bank', isPrimary: true, openingBalance: 5000000 }]
      },
      [],
      { year: 2026, month: 11 },
      [{
        id: 'salary-tx-1', name: 'Monthly Salary', origin: 'salary', isIncome: true, status: 'successful',
        amount: 8000000, date: '2026-11-01', category: 'Income', bankAccountId: 'bank-1'
      }]
    );
    expect(result.totalIncome).toBe(8000000);
    expect(result.todayBalance).toBe(13000000);
    const acc = result.accountSimulations['bank-1'];
    expect(acc.todayBalance).toBe(13000000);
    expect(acc.incomeAmount).toBe(8000000);
  });

  it('still treats an unrelated logged income as extra income', () => {
    const result = simulate(settings, [], { year: 2026, month: 11 }, [
      { id: 'bonus', name: 'Freelance', origin: 'spot', isIncome: true, status: 'successful', amount: 100000, date: '2026-11-05', category: 'Income' }
    ]);
    expect(result.totalIncome).toBe(8100000);
    expect(result.salaryTransactionId).toBeNull();
  });
});
