// Plan's "Salary due" prompt: a salary-cycle user paid on the 30th logs the next salary.
import 'package:budget_mobile/models/month_detail.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/widgets/salary_due_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _cycle = {
  '_id': 'm1', 'year': 2026, 'month': 11, 'incomeAmount': 8000000, 'salaryAccountId': 'b1',
  'startDate': '2026-10-30', 'endDate': '2026-11-29', 'incomeCreditDate': '2026-10-30',
  'salaryCreditedDate': '2026-10-30', 'isSalaryCredited': true,
};

class FakeBudget extends BudgetProvider {
  FakeBudget(this.month, {this.periodType = 'salary_cycle'});
  final Map<String, dynamic> month;
  final String periodType;
  Map<String, dynamic>? credited;

  @override
  MonthInfo? get monthInfo => MonthInfo.fromJson(month);

  @override
  Map<String, dynamic> get userSettings => {'periodType': periodType, 'incomeMode': 'salary'};

  @override
  List<dynamic> get bankAccounts => [
        {'_id': 'b1', 'name': 'HDFC', 'isPrimary': true, 'openingBalance': 0},
      ];

  @override
  Future<void> creditSalary({num? amount, String? bankAccountId, String? date}) async {
    credited = {'amount': amount, 'bank': bankAccountId, 'date': date};
  }
}

Future<void> pump(WidgetTester tester, FakeBudget budget, DateTime today) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ChangeNotifierProvider<BudgetProvider>.value(
    value: budget,
    child: MaterialApp(home: Scaffold(body: SalaryDueCard(today: today))),
  ));
  await tester.pump();
}

void main() {
  group('salaryDue', () {
    final m = MonthInfo.fromJson(_cycle);
    test('a credited cycle offers the next payday from 5 days before it', () {
      expect(salaryDue(m, 'salary_cycle', DateTime(2026, 11, 20)), isNull);
      expect(salaryDue(m, 'salary_cycle', DateTime(2026, 11, 25)),
          (payday: '2026-11-30', nextCycle: true, earliest: '2026-11-20'));
    });
    test('a calendar month that is credited offers nothing', () {
      expect(salaryDue(m, 'calendar_month', DateTime(2026, 11, 28)), isNull);
    });
    test('a cycle without its salary offers it from 5 days before it is expected', () {
      final open = MonthInfo.fromJson({..._cycle, 'isSalaryCredited': false, 'salaryCreditedDate': null,
        'startDate': '2026-11-30', 'endDate': '2026-12-29', 'incomeCreditDate': '2026-11-30', 'month': 12});
      expect(salaryDue(open, 'salary_cycle', DateTime(2026, 12, 2))?.nextCycle, isFalse);
      expect(salaryDue(MonthInfo.fromJson({..._cycle, 'isClosed': true}), 'salary_cycle', DateTime(2026, 11, 28)), isNull);
    });
  });

  testWidgets('hidden mid-cycle', (tester) async {
    await pump(tester, FakeBudget(_cycle), DateTime(2026, 11, 10));
    expect(find.byKey(const ValueKey('salary-due-card')), findsNothing);
  });

  testWidgets('two days before payday: Log salary confirms amount, account and date', (tester) async {
    final budget = FakeBudget(_cycle);
    await pump(tester, budget, DateTime(2026, 11, 28));
    expect(find.text('Salary due 30 Nov'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('salary-due-log')));
    await tester.pumpAndSettle();

    expect(find.text('Log salary'), findsWidgets);
    expect(find.text('HDFC'), findsOneWidget);
    expect(find.byKey(const ValueKey('log-salary-cycle-note')), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('log-salary-amount')), '82000');
    await tester.tap(find.byKey(const ValueKey('log-salary-confirm')));
    await tester.pumpAndSettle();
    expect(budget.credited, {'amount': 8200000, 'bank': 'b1', 'date': '2026-11-28'});
    expect(find.text('Salary logged'), findsOneWidget);
  });
}
