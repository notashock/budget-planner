import { describe, it, expect } from 'vitest';
import { assertEntryDate } from '../src/domain/entryDateRules.js';

const today = '2026-11-26';
const ok = (status, date) => expect(() => assertEntryDate({ status, date, today })).not.toThrow();
const no = (status, date, msg) => expect(() => assertEntryDate({ status, date, today })).toThrow(msg);

describe('entry date rules', () => {
  it('a spend or income is today or earlier (one day of slack for time zones)', () => {
    ok('successful', '2026-11-01');
    ok('successful', today);
    ok('successful', '2026-11-27');
    no('successful', '2026-11-28', "can't be dated in the future");
  });

  it('a planned payment is today or later (one day of slack for time zones)', () => {
    ok('planned', '2026-12-05');
    ok('planned', today);
    ok('planned', '2026-11-25');
    no('planned', '2026-11-24', "can't be dated in the past");
  });

  it('no date means the server picks one', () => {
    ok('planned', undefined);
    ok('successful', null);
  });
});
