import 'dart:convert';
import 'dart:io';

import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/models/transaction.dart';
import 'package:budget_mobile/screens/transactions_screen.dart';
import 'package:budget_mobile/widgets/swipe_row.dart';
import 'package:budget_mobile/services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_font_http.dart';

/// The Transactions screen on a month recorded from the real server
/// (test/fixtures/api), plus one refund (upgrade plan 1.1).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  useFakeFontHttp();

  dynamic fixture(String name) => jsonDecode(File('test/fixtures/api/$name.json').readAsStringSync());
  // UTF-8 bytes like the real server (the fixtures contain '₹').
  http.Response ok(Object? data) => http.Response.bytes(
        utf8.encode(jsonEncode({'status': 'success', 'data': data})),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  Future<BudgetProvider> load() async {
    SharedPreferences.setMockInitialValues({});
    final detail = fixture('month_detail') as Map<String, dynamic>;
    final groceries = (detail['transactions'] as List).firstWhere((t) => t['name'] == 'Groceries') as Map;
    (detail['transactions'] as List).add({
      ...groceries,
      'id': 'refund-1',
      '_id': 'refund-1',
      'name': 'Groceries refund',
      'amount': -50000,
      'refundTargetTransactionId': groceries['id'],
    });

    final api = ApiService()
      ..updateBaseUrl('http://api.test')
      ..retryDelay = Duration.zero;
    api.client = MockClient((req) async {
      final path = req.url.path;
      if (path == '/api/settings') return ok(<String, dynamic>{});
      if (path == '/api/v1/periods') return ok(fixture('periods'));
      if (RegExp(r'^/api/v1/periods/\d+/\d+$').hasMatch(path)) return ok(detail);
      if (RegExp(r'^/api/v1/periods/\d+/\d+/goals$').hasMatch(path)) return ok(fixture('goals'));
      if (path == '/api/v1/accounts') {
        return ok(fixture(req.url.queryParameters['type'] == 'wallet' ? 'accounts_wallet' : 'accounts_bank'));
      }
      if (path == '/api/v1/transfers') return ok(fixture('transfers'));
      return ok([]);
    });
    final budget = BudgetProvider(api: api);
    await budget.loadInitialData();
    expect(budget.loadError, isNull, reason: '${budget.loadError?.message}');
    return budget;
  }

  Future<void> pump(WidgetTester tester, BudgetProvider budget) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: budget,
      child: const MaterialApp(home: TransactionsScreen()),
    ));
    await tester.pump();
  }

  Finder rowWith(String name) => find.ancestor(of: find.text(name), matching: find.byType(SwipeRow)).first;
  String amountIn(WidgetTester tester, String name) => tester
      .widgetList<Text>(find.descendant(of: rowWith(name), matching: find.byType(Text)))
      .map((t) => t.data ?? '')
      .firstWhere((d) => d.contains('₹'));

  testWidgets('Paid shows every recorded row and its count, grouped by day', (tester) async {
    final budget = (await tester.runAsync(load))!;
    await pump(tester, budget);

    expect(find.descendant(of: find.byKey(const ValueKey('tab-paid')), matching: find.text('8')), findsOneWidget);
    for (final name in ['Groceries', 'Coffee', 'Shoes', 'Groceries refund', 'Freelance', 'Inter-Account Transfer']) {
      expect(find.text(name), findsOneWidget, reason: name);
    }
    final first = budget.transactionLists.recorded.first.date;
    expect(find.text(dayLabel(first, '1900-01-01').toUpperCase()), findsWidgets);
  });

  testWidgets('search keeps rows whose name, category or account match every word', (tester) async {
    final budget = (await tester.runAsync(load))!;
    await pump(tester, budget);

    await tester.enterText(find.byKey(const ValueKey('tx-search')), 'groc');
    await tester.pump();
    expect(find.text('Groceries'), findsOneWidget);
    expect(find.text('Groceries refund'), findsOneWidget);
    expect(find.text('Coffee'), findsNothing);
    expect(find.descendant(of: find.byKey(const ValueKey('tab-paid')), matching: find.text('2')), findsOneWidget);
  });

  testWidgets('Spending shelf totals paid spends only (no income, transfer, held, refund)', (tester) async {
    final budget = (await tester.runAsync(load))!;
    final spend = spendByCategory(budget.transactionLists.recorded);
    final spends = budget.transactionLists.recorded.where((t) => t.kind == TxKind.expense && t.amount > 0);
    expect(spend.total, spends.fold<int>(0, (s, t) => s + t.amount));
    expect(spends.map((t) => t.name), unorderedEquals(['Groceries', 'Coffee', 'Shoes']));

    await pump(tester, budget);
    expect(find.textContaining('Spending in '), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('tx-spend-shelf')));
    await tester.pump();
    expect(find.text('Spending by category'), findsOneWidget);
  });

  testWidgets('rows show the right sign and badge for each kind', (tester) async {
    final budget = (await tester.runAsync(load))!;
    await pump(tester, budget);

    expect(amountIn(tester, 'Groceries'), startsWith('-₹'));
    expect(amountIn(tester, 'Freelance'), startsWith('+₹'));
    expect(amountIn(tester, 'Groceries refund'), '+₹500.00', reason: 'no double minus');
    expect(amountIn(tester, 'Holding for Ravi'), startsWith('+₹'));
    expect(amountIn(tester, 'Inter-Account Transfer'), startsWith('₹'), reason: 'a transfer has no sign');

    // Caption: account · category; held/lent rows get their tag, a refund names what it refunds.
    String caption(String name) => tester
        .widgetList<Text>(find.descendant(of: rowWith(name), matching: find.byType(Text)))
        .map((t) => t.data ?? '')
        .firstWhere((d) => d.contains(' · '));
    expect(caption('Inter-Account Transfer'), contains(' → '));
    expect(caption('Inter-Account Transfer'), endsWith('Transfer'));
    expect(find.descendant(of: rowWith('Holding for Ravi'), matching: find.text('Held')), findsOneWidget);
    expect(find.descendant(of: rowWith('Groceries refund'), matching: find.text('Refund for Groceries')), findsOneWidget);
    expect(caption('Freelance'), contains('Income'));
  });

  testWidgets('goals load from their own endpoint (month detail has none)', (tester) async {
    final budget = (await tester.runAsync(load))!;
    expect(budget.evaluatedGoals.map((g) => g['name']), ['Headphones']);
  });

  testWidgets('the planned tab lists the bill due on its planned date', (tester) async {
    final budget = (await tester.runAsync(load))!;
    await pump(tester, budget);

    await tester.tap(find.byKey(const ValueKey('tab-planned')));
    await tester.pump();

    final rent = budget.transactionLists.planned.single;
    // The screen labels from the real today (the fixture's date can be today)
    final n = DateTime.now();
    final today = '${n.year}-${'${n.month}'.padLeft(2, '0')}-${'${n.day}'.padLeft(2, '0')}';
    expect(find.text('Rent'), findsOneWidget);
    expect(find.text('₹25,000.00'), findsOneWidget);
    final header = rent.schedule == TxSchedule.overdue ? 'OVERDUE' : dayLabel(rent.plannedDate!, today).toUpperCase();
    expect(find.text(header), findsOneWidget);
    expect(find.byKey(ValueKey('mark-paid-${rent.id}')), findsOneWidget);
  });
}
