import { describe, it, expect } from 'vitest';
import { getSalaryWindowStatus } from '../src/calendar.js';

describe('getSalaryWindowStatus', () => {
  it('returns unlocked for unconfigured month', () => {
    const month = {
      year: 2026,
      month: 11,
      incomeAmount: 0,
      salaryBankAccountId: null
    };

    const status = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 10)));
    expect(status.isLocked).toBe(false);
    expect(status.status).toBe('unconfigured');
    expect(status.isUnconfigured).toBe(true);
  });

  it('correctly calculates 10-day window anchored to month-end (5 days before to 5 days after)', () => {
    const month = {
      year: 2026,
      month: 10, // October 2026 (31 days)
      incomeAmount: 5000000,
      salaryBankAccountId: 'bank-1'
    };

    // Last day of October = Oct 31
    // Window: 5 days before = Oct 26, 2026
    // Window end: 5 days after = Nov 05, 2026 (end of day)

    // 1. Oct 25 (6 days before month-end) -> locked (before_window)
    const beforeStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 25, 12, 0, 0)));
    expect(beforeStatus.isLocked).toBe(true);
    expect(beforeStatus.status).toBe('before_window');
    expect(beforeStatus.reason).toContain('Unlocks on Oct 26');

    // 2. Oct 26 (5 days before month-end) -> unlocked (in_window)
    const startStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 26, 0, 0, 0)));
    expect(startStatus.isLocked).toBe(false);
    expect(startStatus.status).toBe('in_window');

    // 3. Oct 31 (Month-end) -> unlocked (in_window)
    const monthEndStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 31, 10, 0, 0)));
    expect(monthEndStatus.isLocked).toBe(false);
    expect(monthEndStatus.status).toBe('in_window');

    // 4. Nov 04 (Current system date) -> unlocked (in_window)
    const nov4Status = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 4, 12, 0, 0)));
    expect(nov4Status.isLocked).toBe(false);
    expect(nov4Status.status).toBe('in_window');

    // 5. Nov 05 (5 days after month-end) -> unlocked (in_window)
    const lastDayStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 5, 20, 0, 0)));
    expect(lastDayStatus.isLocked).toBe(false);
    expect(lastDayStatus.status).toBe('in_window');

    // 6. Nov 06 (6 days after month-end) -> locked (after_window)
    const afterStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 6, 1, 0, 0)));
    expect(afterStatus.isLocked).toBe(true);
    expect(afterStatus.status).toBe('after_window');
    expect(afterStatus.reason).toContain('Window closed on Nov 5');
  });

  it('correctly handles short months like February (28 days)', () => {
    const month = {
      year: 2026,
      month: 2, // February 2026 (28 days)
      incomeAmount: 7500000,
      salaryBankAccountId: 'bank-2'
    };

    // Last day of Feb = Feb 28
    // Window: 5 days before = Feb 23
    // Window end: 5 days after = March 05

    // Feb 22 -> locked
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 1, 22))).isLocked).toBe(true);
    // Feb 23 -> in window
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 1, 23))).isLocked).toBe(false);
    // March 05 -> in window
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 2, 5))).isLocked).toBe(false);
    // March 06 -> after window
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 2, 6))).isLocked).toBe(true);
  });
});
