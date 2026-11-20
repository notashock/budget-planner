import 'package:budget_mobile/models/goal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/screens/accounts_screen.dart';
import 'package:budget_mobile/screens/goals_screen.dart';
import 'package:budget_mobile/screens/plan_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fake_font_http.dart';
import 'helpers/fixture_budget.dart';

/// Accounts, Goals and Plan on the typed models, with the recorded month.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  useFakeFontHttp();

  // Ids as recorded (they change when fixtures are re-recorded).
  final bankId = (fixture('accounts_bank') as List).first['id'] as String;
  final walletId = (fixture('accounts_wallet') as List).first['id'] as String;

  /// [wide]: Plan's chart, summary cards and timeline still overflow at phone
  /// width with test fonts (summary_cards.dart, step_line_chart.dart,
  /// timeline_list.dart); fixing them is upgrade plan item 3.3.
  Future<void> pump(WidgetTester tester, BudgetProvider budget, Widget screen, {bool wide = false}) async {
    tester.view.physicalSize = Size(wide ? 2400 : 1080, 4000);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: budget,
      child: MaterialApp(home: screen),
    ));
    await tester.pump();
  }

  /// Lets queued writes (fake clock) and the mock HTTP calls (real clock) finish.
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 5; i++) {
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    }
    await tester.pump();
  }

  Map<String, dynamic> goal(Map<String, dynamic> f) => (f['goals'] as List).first as Map<String, dynamic>;

  group('Goals', () {
    testWidgets('a goal the engine has not evaluated says so, not "floor breach risk"', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      expect(budget.goalModels.single.recommendation, isNull, reason: 'recorded goal is logged, never evaluated');
      await pump(tester, budget, const GoalsScreen());

      expect(find.text('No safe purchase date checked yet.'), findsOneWidget);
      expect(find.textContaining('Floor breach risk'), findsNothing);
      expect(find.text('Schedule Transaction'), findsNothing);
      expect(find.text('High'), findsNothing);
      expect(find.text('Medium'), findsOneWidget, reason: 'priority 1 is medium');
    });

    testWidgets('a feasible goal offers its safe day and Schedule', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(() => fb.load(edit: (f) {
            goal(f)
              ..['status'] = 'active'
              ..['recommendation'] = {'feasible': true, 'recommendedDay': 24, 'recommendedDate': '2026-11-24', 'explanation': 'ok'};
          })))!;
      await pump(tester, budget, const GoalsScreen());

      expect(find.text('Safe purchase date: Day 24 (2026-11-24)'), findsOneWidget);
      await tester.tap(find.text('Schedule Transaction'));
      await settle(tester);
      expect(fb.writes, contains('POST /api/v1/goals/${budget.goalModels.single.id}/schedule'));
    });

    testWidgets('a deferred goal (the server says "deferred") offers Reactivate', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(() => fb.load(edit: (f) => goal(f)['status'] = 'deferred')))!;
      expect(budget.goalModels.single.status, GoalStatus.deferred);
      await pump(tester, budget, const GoalsScreen());

      expect(find.text('Reactivate'), findsOneWidget);
      await tester.tap(find.text('Reactivate'));
      await settle(tester);
      expect(fb.writes, contains('POST /api/v1/goals/${budget.goalModels.single.id}/reactivate'));
    });

    testWidgets('delete asks first; Keep sends nothing', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      await pump(tester, budget, const GoalsScreen());
      final id = budget.goalModels.single.id;

      await tester.tap(find.byKey(ValueKey('delete-goal-$id')));
      await tester.pumpAndSettle();
      expect(find.text('Delete "Headphones"?'), findsOneWidget);
      await tester.tap(find.text('Keep'));
      await tester.pumpAndSettle();
      expect(fb.writes, isEmpty);

      await tester.tap(find.byKey(ValueKey('delete-goal-$id')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await settle(tester);
      expect(fb.writes, ['DELETE /api/v1/goals/$id']);
    });
  });

  group('Accounts', () {
    testWidgets('a transfer shows the real account names, not "Source → Destination"', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      await pump(tester, budget, const AccountsScreen());

      expect(find.text('Main → UPI'), findsOneWidget);
      expect(find.textContaining('Source'), findsNothing);
      expect(find.textContaining('Day 19'), findsOneWidget);
    });

    testWidgets('shows the saved last 4 digits (server field accountNumberMasked)', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(
        () => fb.load(edit: (f) => (f['accounts_bank'] as List).first['accountNumberMasked'] = '4321'),
      ))!;
      await pump(tester, budget, const AccountsScreen());
      expect(find.text('•••• 4321'), findsOneWidget);
    });

    testWidgets('an unknown balance is shown as unavailable, never as the opening balance', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(() => fb.load(edit: (f) {
            (f['accounts_wallet'] as List).first
              ..remove('currentBalance')
              ..['openingBalance'] = 999900;
            final detail = f['month_detail'] as Map<String, dynamic>;
            (detail['accountSimulations'] as Map).remove(walletId);
            ((detail['simulation'] as Map)['accountBalances'] as Map?)?.remove(walletId);
          })))!;
      await pump(tester, budget, const AccountsScreen());

      final tile = find.byKey(ValueKey('account-$walletId'));
      expect(find.descendant(of: tile, matching: find.text('Balance unavailable')), findsOneWidget);
      expect(find.text('₹9,999.00'), findsNothing);
    });

    testWidgets('archiving an account asks first', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      await pump(tester, budget, const AccountsScreen());

      await tester.tap(find.byKey(ValueKey('delete-account-$bankId')));
      await tester.pumpAndSettle();
      expect(find.text('Archive Main?'), findsOneWidget);
      await tester.tap(find.text('Keep'));
      await tester.pumpAndSettle();
      expect(fb.writes, isEmpty);
    });

    testWidgets('adding a bank needs a name and sends the digits as accountNumberMasked', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      await pump(tester, budget, const AccountsScreen());

      await tester.tap(find.text('Add Bank'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('add-account-submit')));
      await tester.pump();
      expect(find.text('Enter a name'), findsOneWidget);
      expect(fb.writes, isEmpty);

      await tester.enterText(find.byKey(const ValueKey('add-account-name')), 'HDFC');
      await tester.enterText(find.byKey(const ValueKey('add-account-mask')), '1234');
      await tester.tap(find.byKey(const ValueKey('add-account-submit')));
      await settle(tester);

      final post = fb.requests.firstWhere((r) => r.method == 'POST' && r.url.path == '/api/v1/accounts');
      expect(post.body, contains('"accountNumberMasked":"1234"'));
      expect(post.body, isNot(contains('"accountNumberMask"')));
    });
  });

  group('Plan', () {
    testWidgets("an account view uses that account's simulation and says so", (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      await pump(tester, budget, const PlanScreen(), wide: true);

      await tester.tap(find.text('Main').first);
      await tester.pump();
      expect(find.textContaining('Viewing isolated trajectory for', findRichText: true), findsOneWidget);
    });

    testWidgets("without that account's simulation, it does not label all-accounts numbers as one account",
        (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(
        () => fb.load(edit: (f) => ((f['month_detail'] as Map)['accountSimulations'] as Map).remove(bankId)),
      ))!;
      await pump(tester, budget, const PlanScreen(), wide: true);

      await tester.tap(find.text('Main').first);
      await tester.pump();
      expect(find.textContaining('Viewing isolated trajectory for', findRichText: true), findsNothing);
    });
  });
}
