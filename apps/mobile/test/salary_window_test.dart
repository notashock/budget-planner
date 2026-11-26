// Same cases as packages/engine/test/salary_window.test.js.
import 'package:budget_mobile/engine/calendar.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('unconfigured: unlocked, flagged as mid-month setup after day 5', () {
    final month = {'year': 2026, 'month': 11, 'incomeAmount': 0, 'salaryBankAccountId': null};
    final early = getSalaryWindowStatus(month, DateTime.utc(2026, 11, 2));
    expect(early.isLocked, isFalse);
    expect(early.isUnconfigured, isTrue);
    expect(early.isMidMonthSetup, isFalse);
    final mid = getSalaryWindowStatus(month, DateTime.utc(2026, 11, 15));
    expect(mid.isLocked, isFalse);
    expect(mid.isMidMonthSetup, isTrue);
    expect(mid.reason, contains('mid-month setup will lock immediately'));
  });

  test('open for 10 days: 5 days before day 1 through day 5', () {
    final month = {'year': 2026, 'month': 11, 'incomeAmount': 5000000, 'salaryBankAccountId': 'bank-1'};
    final before = getSalaryWindowStatus(month, DateTime.utc(2026, 10, 26, 12));
    expect(before.status, 'before_window');
    expect(before.isLocked, isTrue);
    expect(before.reason, contains('Unlocks on Oct 27'));
    for (final d in [DateTime.utc(2026, 10, 27), DateTime.utc(2026, 11, 1, 10), DateTime.utc(2026, 11, 5, 20)]) {
      expect(getSalaryWindowStatus(month, d).status, 'in_window', reason: '$d');
    }
    final after = getSalaryWindowStatus(month, DateTime.utc(2026, 11, 6, 1));
    expect(after.status, 'after_window');
    expect(after.reason, contains('Window closed on Nov 5'));
  });
}
