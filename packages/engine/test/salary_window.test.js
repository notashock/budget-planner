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

  it('correctly handles Day 1 expected salary date spanning across previous month-end', () => {
    const month = {
      year: 2026,
      month: 11, // November 2026
      incomeCreditDay: 1,
      incomeAmount: 5000000,
      salaryBankAccountId: 'bank-1'
    };

    // Expected credit date: 2026-11-01
    // Window: 5 days before = Oct 27, 2026
    // Window end: 4 days after = Nov 05, 2026 (end of day)

    // 1. Oct 26 (6 days before) -> locked (before_window)
    const beforeStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 26, 12, 0, 0)));
    expect(beforeStatus.isLocked).toBe(true);
    expect(beforeStatus.status).toBe('before_window');
    expect(beforeStatus.reason).toContain('Unlocks on');

    // 2. Oct 27 (5 days before) -> unlocked (in_window)
    const startStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 27, 0, 0, 0)));
    expect(startStatus.isLocked).toBe(false);
    expect(startStatus.status).toBe('in_window');

    // 3. Nov 01 (Day of credit) -> unlocked (in_window)
    const onDayStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 1, 10, 0, 0)));
    expect(onDayStatus.isLocked).toBe(false);
    expect(onDayStatus.status).toBe('in_window');

    // 4. Nov 05 (4 days after) -> unlocked (in_window)
    const lastDayStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 5, 20, 0, 0)));
    expect(lastDayStatus.isLocked).toBe(false);
    expect(lastDayStatus.status).toBe('in_window');

    // 5. Nov 06 (5 days after) -> locked (after_window)
    const afterStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 6, 1, 0, 0)));
    expect(afterStatus.isLocked).toBe(true);
    expect(afterStatus.status).toBe('after_window');
    expect(afterStatus.reason).toContain('Window closed on');
  });

  it('correctly handles mid-month expected salary date (e.g. Day 25)', () => {
    const month = {
      year: 2026,
      month: 10, // October 2026
      incomeCreditDay: 25,
      incomeAmount: 7500000,
      salaryBankAccountId: 'bank-2'
    };

    // Expected credit date: 2026-10-25
    // Window: 5 days before = Oct 20, 2026
    // Window end: Oct 29, 2026 (end of day)

    // Oct 19 -> locked
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 19))).isLocked).toBe(true);
    // Oct 20 -> in window
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 20))).isLocked).toBe(false);
    // Oct 29 -> in window
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 29))).isLocked).toBe(false);
    // Oct 30 -> after window
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 30))).isLocked).toBe(true);
  });
});
