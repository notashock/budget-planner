// The salary schedule sheet laid out and locked as web's SalarySafelineModal.
import 'package:budget_mobile/models/month_detail.dart';
import 'package:budget_mobile/modals/salary_safeline_modal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeBudget extends BudgetProvider {
  Map<String, dynamic>? saved;

  @override
  MonthInfo? get monthInfo => MonthInfo.fromJson(const {
        '_id': 'm1', 'year': 2026, 'month': 11, 'incomeAmount': 8000000, 'safetyFloor': 500000,
        'salaryBankAccountId': 'b1', 'salaryAccountId': 'b1', 'salaryCreditedDate': '2026-10-30', 'isSalaryCredited': true,
      });

  @override
  List<dynamic> get bankAccounts => [
        {'_id': 'b1', 'name': 'HDFC', 'isPrimary': true, 'institution': 'HDFC Bank', 'openingBalance': 0},
      ];

  @override
  Future<void> updateSalaryFloor({num? income, num? floor, int? creditDay, String? bankAccountId, String? salaryCreditedDate, bool? isSalaryCredited}) async {
    saved = {
      if (income != null) 'income': income,
      if (floor != null) 'floor': floor,
      if (bankAccountId != null) 'bank': bankAccountId,
      if (salaryCreditedDate != null) 'date': salaryCreditedDate,
      if (isSalaryCredited != null) 'credited': isSalaryCredited,
    };
  }
}

Future<FakeBudget> pump(WidgetTester tester, DateTime today) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final budget = FakeBudget();
  await tester.pumpWidget(ChangeNotifierProvider<BudgetProvider>.value(
    value: budget,
    child: MaterialApp(home: Scaffold(body: SalarySafelineModal(currentDate: today))),
  ));
  await tester.pump();
  return budget;
}

void main() {
  testWidgets('inside the window: web labels, Cancel, and the whole schedule saves', (tester) async {
    final budget = await pump(tester, DateTime(2026, 11, 3));
    expect(find.text('Salary schedule'), findsOneWidget);
    expect(find.text('Salary Credited Account *'), findsOneWidget);
    expect(find.text('HDFC (HDFC Bank) [Primary]'), findsOneWidget);
    expect(find.text('Monthly Salary Amount (₹) *'), findsOneWidget);
    expect(find.text('Safety floor (₹) *'), findsOneWidget);
    expect(find.text('Date of Salary Credit *'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
    expect(find.byKey(const ValueKey('salary-lock-banner')), findsNothing);

    await tester.enterText(find.byKey(const ValueKey('salary-amount-input')), '85000');
    await tester.tap(find.text('Save salary schedule'));
    await tester.pump();
    expect(budget.saved, {'income': 8500000, 'floor': 500000, 'bank': 'b1'});
  });

  testWidgets('after the window: locked notice, only the safety floor changes', (tester) async {
    final budget = await pump(tester, DateTime(2026, 11, 26));
    expect(find.byKey(const ValueKey('salary-lock-banner')), findsOneWidget);
    expect(find.textContaining('Window closed on Nov 5 Your safety floor can still be changed.'), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const ValueKey('salary-amount-input'))).enabled, isFalse);

    await tester.enterText(find.byKey(const ValueKey('safeline-floor-input')), '6000');
    await tester.tap(find.text('Update safety floor'));
    await tester.pump();
    expect(budget.saved, {'floor': 600000});
  });
}
