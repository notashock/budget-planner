import { describe, it, expect } from 'vitest';
import { simulate, getGoalMonthlyReserve } from '../src/index.js';

// October 2026 has 31 days; on day 10 there are 31 - 10 + 1 = 22 days left.
const PERIOD = { year: 2026, month: 10 };

function twoAccountSettings({ bankOpening, walletOpening, bankMin = 0, walletMin = 0, safetyFloor = 0 }) {
  const accounts = [
    { id: 'bank-a', name: 'Bank A', type: 'bank', openingBalance: bankOpening, minimumBalance: bankMin, isPrimary: true },
    { id: 'wallet-b', name: 'Wallet B', type: 'wallet', openingBalance: walletOpening, minimumBalance: walletMin }
  ];
  return {
    settings: {
      openingBalance: bankOpening + walletOpening,
      incomeAmount: 0,
      incomeCreditDay: 1,
      safetyFloor,
      currentDay: 10,
      accounts,
      accountOpeningBalances: [
        { accountId: 'bank-a', amount: bankOpening },
        { accountId: 'wallet-b', amount: walletOpening }
      ]
    },
    accounts
  };
}

describe('Sprint 1: one unified daily limit', () => {
  it('lets an account in deficit pull the unified limit down (no more positive limit while short)', () => {
    // Bank A owes a 3,000 bill it cannot cover; Wallet B holds 500.
    // Old behaviour: Bank A floored at 0, wallet 500 → "safe to spend" > 0 while the household is 1,500 short.
    const { settings, accounts } = twoAccountSettings({ bankOpening: 100000, walletOpening: 50000 });
    const items = [{ id: 'big-bill', type: 'one-time', name: 'Big bill', amount: 300000, day: 20, bankAccountId: 'bank-a', accountType: 'bank' }];

    const result = simulate(settings, items, PERIOD, [], [], [], accounts);

    expect(result.safeVelocity.committedUpcomingItems).toBe(300000);
    expect(result.safeVelocity.freeSurplus).toBe(0);
    expect(result.safeVelocity.safeVelocityPerDay).toBe(0);
    expect(result.safeToSpendPerDay).toBe(0);
    expect(result.safeVelocity.paceStatus).toBe('critical');
  });

  it('applies the month safety floor when it is larger than the sum of account minimums', () => {
    // Minimums sum to 200; the user set an 800 month floor. Today: 2,000 across both accounts.
    const { settings, accounts } = twoAccountSettings({
      bankOpening: 100000, walletOpening: 100000, bankMin: 10000, walletMin: 10000, safetyFloor: 80000
    });

    const result = simulate(settings, [], PERIOD, [], [], [], accounts);

    expect(result.safetyFloor).toBe(80000);
    // (200,000 - 0 bills - 80,000 floor) / 22 days = 5,454 per day (was 8,181 when summing per-account limits)
    expect(result.safeVelocity.freeSurplus).toBe(120000);
    expect(result.safeVelocity.safeVelocityPerDay).toBe(5454);
    expect(result.safeToSpendPerDay).toBe(5454);
  });

  it('keeps per-account limits for the single-account view', () => {
    const { settings, accounts } = twoAccountSettings({ bankOpening: 100000, walletOpening: 50000, bankMin: 20000 });
    const result = simulate(settings, [], PERIOD, [], [], [], accounts);

    // Bank A: (100,000 - 20,000) / 22 = 3,636 · Wallet B: 50,000 / 22 = 2,272
    expect(result.accounts['bank-a'].safeVelocity.safeVelocityPerDay).toBe(3636);
    expect(result.accounts['wallet-b'].safeVelocity.safeVelocityPerDay).toBe(2272);
  });

  it('reserves a goal\'s monthly share in both the unified and the funding account limits', () => {
    const { settings, accounts } = twoAccountSettings({ bankOpening: 100000, walletOpening: 50000 });
    // 600 by December: Oct, Nov, Dec = 3 months → 200 this month, funded from Bank A
    const goals = [{ id: 'g1', name: 'Phone', status: 'logged', targetAmount: 60000, targetDate: '2026-12-15', fundingAccountId: 'bank-a' }];

    const result = simulate(settings, [], PERIOD, [], goals, [], accounts);

    expect(result.safeVelocity.goalReserve).toBe(20000);
    expect(result.safeVelocity.freeSurplus).toBe(150000 - 20000);
    expect(result.accounts['bank-a'].safeVelocity.activeGoalsCost).toBe(20000);
    expect(result.accounts['wallet-b'].safeVelocity.activeGoalsCost).toBe(0);
  });
});

describe('Sprint 1: getGoalMonthlyReserve', () => {
  const period = { year: 2026, month: 10 };

  it('reserves target ÷ months remaining (this month counts), rounded up', () => {
    const { total, items } = getGoalMonthlyReserve(
      [{ id: 'a', status: 'active', targetAmount: 100000, targetDate: '2027-01-31' }],
      period
    );
    // Oct, Nov, Dec, Jan = 4 months → 25,000
    expect(total).toBe(25000);
    expect(items[0].monthsRemaining).toBe(4);

    expect(getGoalMonthlyReserve([{ status: 'logged', targetAmount: 1000, targetDate: '2026-12-01' }], period).total).toBe(334);
  });

  it('reserves the whole remainder when the target is this month', () => {
    expect(getGoalMonthlyReserve([{ status: 'logged', targetAmount: 7000, targetDate: '2026-10-28' }], period).total).toBe(7000);
  });

  it('ignores scheduled goals (already planned transactions), finished goals, undated goals and past targets', () => {
    const goals = [
      { status: 'scheduled', targetAmount: 50000, targetDate: '2026-12-01' },
      { status: 'achieved', targetAmount: 50000, targetDate: '2026-12-01' },
      { status: 'dropped', targetAmount: 50000, targetDate: '2026-12-01' },
      { status: 'deferred', targetAmount: 50000, targetDate: '2026-12-01' },
      { status: 'active', targetAmount: 50000, targetDate: null },
      { status: 'active', targetAmount: 50000, targetDate: '2026-09-30' }
    ];
    expect(getGoalMonthlyReserve(goals, period).total).toBe(0);
  });

  it('defaults a missing status to logged, and returns zero without a period', () => {
    expect(getGoalMonthlyReserve([{ targetAmount: 2000, targetDate: '2026-11-15' }], period).total).toBe(1000);
    expect(getGoalMonthlyReserve([{ status: 'active', targetAmount: 2000, targetDate: '2026-11-15' }]).total).toBe(0);
  });
});
