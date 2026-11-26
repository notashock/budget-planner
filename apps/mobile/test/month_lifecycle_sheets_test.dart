// Rollover and month-end review laid out as on web.
import 'dart:convert';

import 'package:budget_mobile/models/month_detail.dart';
import 'package:budget_mobile/models/simulation.dart';
import 'package:budget_mobile/modals/month_modals.dart';
import 'package:budget_mobile/modals/month_review_modal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:budget_mobile/services/storage_service.dart';

class FakeBudget extends BudgetProvider {
  final List<(bool, bool)> rollovers = [];

  @override
  MonthInfo? get monthInfo => const MonthInfo(id: 'm1', year: 2026, month: 12, incomeAmount: 0);

  @override
  List<dynamic> get bankAccounts => [
        {'_id': 'b1', 'name': 'Main Bank', 'isPrimary': true, 'openingBalance': 1000000, 'currentBalance': 1250000},
      ];

  @override
  List<dynamic> get wallets => [
        {'_id': 'w1', 'name': 'Cash', 'openingBalance': 20000},
      ];

  @override
  List<dynamic> get creditCards => const [];

  @override
  List<dynamic> get transactions => [
        {'_id': 'r1', 'title': 'Rent', 'amount': 3000000, 'plannedAmount': 3000000, 'status': 'planned',
          'recurrence': 'monthly', 'isFixed': true, 'date': '2026-12-05', 'plannedDate': '2026-12-05'},
        {'_id': 'r2', 'title': 'Gym', 'amount': 150000, 'status': 'planned', 'recurrence': 'monthly', 'date': '2026-12-10'},
      ];

  @override
  Future<void> rolloverMonth({bool carryBalance = true, bool rolloverUnpaid = false}) async =>
      rollovers.add((carryBalance, rolloverUnpaid));
}

Future<FakeBudget> pump(WidgetTester tester, Widget child) async {
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final budget = FakeBudget();
  await tester.pumpWidget(ChangeNotifierProvider<BudgetProvider>.value(
    value: budget,
    child: MaterialApp(home: Scaffold(body: child)),
  ));
  await tester.pump(); // the review spins until it loads, so no settle here
  return budget;
}

void main() {
  testWidgets('rollover: Start January 2027, the balances preview, both switches on', (tester) async {
    final budget = await pump(tester, const RolloverModal());
    await tester.pumpAndSettle();
    expect(find.text('Start January 2027'), findsOneWidget);
    expect(find.text('Cycle rollover from December 2026'), findsOneWidget);
    expect(find.text('OPENING BALANCES PREVIEW'), findsOneWidget);
    expect(find.text('Carrying Ending Balances'), findsOneWidget);
    expect(find.textContaining('12,500'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('carry-balance')));
    await tester.pump();
    expect(find.text('Resetting to Zero'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('confirm-rollover')));
    await tester.pumpAndSettle();
    expect(budget.rollovers, [(false, true)]);
  });

  testWidgets('month-end review shows web\'s sections from the server review', (tester) async {
    SharedPreferences.setMockInitialValues({StorageService.keyToken: 'test-token'});
    ApiService().updateBaseUrl('http://api.test');
    final paths = <String>[];
    ApiService().client = MockClient((r) async {
      paths.add(r.url.path);
      return http.Response(
        jsonEncode({'status': 'success', 'data': {
          'totalUnplannedActual': 450000,
          'suggestedNextMonthAllowance': 990000,
          'tagBreakdown': {
            'Food': {'total': 300000, 'count': 4},
            'Travel': {'total': 150000, 'count': 1},
          },
          'aiExplanation': 'Food led your spending.',
        }}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    addTearDown(() => ApiService().client = http.Client());

    final sim = SimulationResult.fromJson({
      'dailyBalances': [],
      'safeVelocity': {'safeVelocityPerDay': 43300, 'freeSurplus': 1300000, 'paceStatus': 'healthy'},
    });
    await pump(
      tester,
      MonthReviewSheet(month: const MonthInfo(id: 'm1', year: 2026, month: 12, incomeAmount: 0), simulation: sim),
    );
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();

    expect(find.text('Month Review'), findsOneWidget);
    expect(find.text('Unified View'), findsOneWidget);
    expect(paths, ['/api/v1/periods/2026/12/month-end-review']);
    expect(find.text('Safety cushion'), findsOneWidget);
    expect(find.text('Within survival limits'), findsOneWidget);
    expect(find.text('1 fixed rollovers • 1 variable'), findsOneWidget);
    expect(find.text('Fixed Rollover'), findsOneWidget);
    expect(find.text('Spending by category'), findsOneWidget);
    expect(find.text('4 entries'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Assistant Spending Insight'), 200);
    expect(find.text('Suggested safety cushion for next month'), findsOneWidget);
    expect(find.text('Food led your spending.'), findsOneWidget);
  });
}
