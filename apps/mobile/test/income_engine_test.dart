// Same cases as packages/engine/test/irregular_income.test.js.
import 'package:budget_mobile/engine/income_engine.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('ledger balances are the current balance when no as-of date is given', () {
    final accounts = [
      {'id': 'a', 'openingBalance': 50000, 'currentBalance': 35000},
      {'id': 'b', 'openingBalance': 2000, 'currentBalance': 1500},
    ];
    expect(calculateIrregularMetrics(accounts: accounts).currentBalance, 36500);
    expect(calculateIrregularMetrics(accounts: accounts, asOfDate: '2026-01-01').currentBalance, 52000);
  });

  test("transactions before an account's opening balance are not added to it", () {
    final m = calculateIrregularMetrics(
      accounts: [
        {'id': 'a', 'openingBalance': 500000, 'openingBalanceDate': '2026-06-01'},
        {'id': 'b', 'openingBalance': 100000},
      ],
      transactions: [
        {'id': '1', 'accountId': 'a', 'amount': 200000, 'date': '2026-05-10', 'isIncome': true, 'status': 'successful'},
        {'id': '2', 'accountId': 'a', 'amount': 50000, 'date': '2026-05-20', 'status': 'successful'},
        {'id': '3', 'accountId': 'a', 'amount': 30000, 'date': '2026-07-01', 'status': 'successful'},
        {'id': '4', 'accountId': 'b', 'amount': 10000, 'date': '2026-04-01', 'status': 'successful'},
      ],
      asOfDate: '2026-10-20',
    );
    expect(m.currentBalance, 560000);
    expect(m.trailing12mIncome, 200000);
    expect(m.trailing12mSpending, 90000);
  });

  test('averages over the months of history present, not always 12', () {
    final m = calculateIrregularMetrics(
      accounts: [
        {'id': 'a', 'openingBalance': 300000, 'openingBalanceDate': '2026-08-01'},
      ],
      transactions: [
        {'id': '1', 'amount': 90000, 'date': '2026-08-10', 'isIncome': true, 'status': 'successful'},
        {'id': '2', 'amount': 60000, 'date': '2026-09-05', 'status': 'successful'},
        {'id': '3', 'amount': 30000, 'date': '2026-10-05', 'status': 'successful'},
      ],
      asOfDate: '2026-10-20',
    );
    expect(m.monthsOfHistory, 3);
    expect(m.smoothedMonthlyIncome, 30000);
    expect(m.avgMonthlySpending, 30000);
    expect(m.runwayMonths, 10);
    expect(m.quarterly.map((q) => q.key), ['2026-Q3', '2026-Q4']);
    expect(m.yearly.single.net, 0);
  });

  test('empty and zero-spending states do not divide by zero', () {
    final empty = calculateIrregularMetrics();
    expect(empty.isIndefinite, isTrue);
    expect(empty.monthsOfHistory, 1);
    expect(getRunwayBand(empty.runwayMonths).label, 'No spending recorded');
    expect(getRunwayBand(4).key, 'building');
    expect(getRunwayBand(1).key, 'low');
  });
}
