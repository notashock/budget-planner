import { describe, it, expect } from 'vitest';
import { isFuturePeriod } from '../src/index.js';

describe('isFuturePeriod', () => {
  const today = '2026-11-30';

  it('a salary cycle named December that starts today is current, not future', () => {
    expect(isFuturePeriod({ year: 2026, month: 12, startDate: '2026-11-30' }, today)).toBe(false);
  });

  it('a ghost month named December that started on 9 Nov is still future', () => {
    expect(isFuturePeriod({ year: 2026, month: 12, startDate: '2026-11-09' }, today)).toBe(true);
  });

  it('a month that starts after today, or a later month with no dates, is future', () => {
    expect(isFuturePeriod({ year: 2026, month: 12, startDate: '2026-12-01' }, today)).toBe(true);
    expect(isFuturePeriod({ year: 2026, month: 12 }, today)).toBe(true);
  });

  it('this month and earlier months are not future', () => {
    expect(isFuturePeriod({ year: 2026, month: 11, startDate: '2026-10-30' }, today)).toBe(false);
    expect(isFuturePeriod({ year: 2026, month: 10 }, today)).toBe(false);
  });
});
