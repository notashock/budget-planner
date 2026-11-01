import { describe, it, expect } from 'vitest';
import { getSalaryWindowStatus } from '../src/calendar.js';

describe('getSalaryWindowStatus (Strict 10-Day Rollover Window)', () => {
  it('returns unlocked for unconfigured month, flagging mid-month setup when after Day 5', () => {
    const month = {
      year: 2026,
      month: 11,
      incomeAmount: 0,
      salaryBankAccountId: null
    };

    // Before Day 5 (e.g. Nov 2)
    const earlyStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 2)));
    expect(earlyStatus.isLocked).toBe(false);
    expect(earlyStatus.isUnconfigured).toBe(true);
    expect(earlyStatus.isMidMonthSetup).toBe(false);

    // After Day 5 (e.g. Nov 15) -> mid-month initial configuration warning
    const midMonthStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 15)));
    expect(midMonthStatus.isLocked).toBe(false);
    expect(midMonthStatus.isUnconfigured).toBe(true);
    expect(midMonthStatus.isMidMonthSetup).toBe(true);
    expect(midMonthStatus.reason).toContain('mid-month setup will lock immediately');
  });

  it('strictly opens for exactly 10 days: 5 days before Day 1 through Day 5 of the new month', () => {
    const month = {
      year: 2026,
      month: 11, // November 2026
      incomeAmount: 5000000,
      salaryBankAccountId: 'bank-1'
    };

    // 10-day Window for Nov 2026:
    // Window start: Oct 27, 2026 (00:00:00 UTC) (5 days before Day 1: Oct 27, 28, 29, 30, 31)
    // Window end: Nov 05, 2026 (23:59:59.999 UTC) (Days 1, 2, 3, 4, 5)

    // 1. Oct 26 (6 days before Day 1) -> locked (before_window)
    const beforeStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 26, 12, 0, 0)));
    expect(beforeStatus.isLocked).toBe(true);
    expect(beforeStatus.status).toBe('before_window');
    expect(beforeStatus.reason).toContain('Unlocks on Oct 27');

    // 2. Oct 27 (5 days before Day 1) -> unlocked (in_window)
    const startStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 9, 27, 0, 0, 0)));
    expect(startStatus.isLocked).toBe(false);
    expect(startStatus.status).toBe('in_window');

    // 3. Nov 01 (Day 1 of new month) -> unlocked (in_window)
    const onDayStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 1, 10, 0, 0)));
    expect(onDayStatus.isLocked).toBe(false);
    expect(onDayStatus.status).toBe('in_window');

    // 4. Nov 05 (Day 5 of new month) -> unlocked (in_window)
    const lastDayStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 5, 20, 0, 0)));
    expect(lastDayStatus.isLocked).toBe(false);
    expect(lastDayStatus.status).toBe('in_window');

    // 5. Nov 06 (Day 6 of new month) -> locked (after_window)
    const afterStatus = getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 6, 1, 0, 0)));
    expect(afterStatus.isLocked).toBe(true);
    expect(afterStatus.status).toBe('after_window');
    expect(afterStatus.reason).toContain('Window closed on Nov 5');
  });

  it('enforces the same rollover window regardless of configured salary credit date', () => {
    const month = {
      year: 2026,
      month: 11,
      incomeCreditDay: 25, // Even if salary is credited on 25th, rollover window is strictly Oct 27 - Nov 5
      incomeAmount: 7500000,
      salaryBankAccountId: 'bank-2'
    };

    // Nov 25 is outside the rollover window -> locked
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 25))).isLocked).toBe(true);
    // Nov 2 is inside the rollover window -> open
    expect(getSalaryWindowStatus(month, new Date(Date.UTC(2026, 10, 2))).isLocked).toBe(false);
  });

  it('correctly handles year boundary transition (December to January)', () => {
    const janMonth = {
      year: 2027,
      month: 1, // January 2027
      incomeAmount: 6000000,
      salaryBankAccountId: 'bank-1'
    };

    // Window: Dec 27, 2026 through Jan 5, 2027
    // Dec 26, 2026 -> locked
    expect(getSalaryWindowStatus(janMonth, new Date(Date.UTC(2026, 11, 26))).isLocked).toBe(true);
    // Dec 27, 2026 -> open
    expect(getSalaryWindowStatus(janMonth, new Date(Date.UTC(2026, 11, 27))).isLocked).toBe(false);
    // Jan 5, 2027 -> open
    expect(getSalaryWindowStatus(janMonth, new Date(Date.UTC(2027, 0, 5))).isLocked).toBe(false);
    // Jan 6, 2027 -> locked
    expect(getSalaryWindowStatus(janMonth, new Date(Date.UTC(2027, 0, 6))).isLocked).toBe(true);
  });
});
