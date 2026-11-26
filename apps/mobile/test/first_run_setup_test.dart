import 'dart:convert';

import 'package:budget_mobile/main.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/screens/onboarding_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fixture_budget.dart';

/// First-run setup (web's OnboardingModal, Apple setup-assistant style).
void main() {
  Future<(FixtureBudget, BudgetProvider)> newUser(WidgetTester tester) async {
    final fb = FixtureBudget()
      ..onWrite = (req) async => okJson(req.url.path == '/api/v1/accounts'
          ? {'id': 'acc-new', 'name': (jsonDecode(req.body) as Map)['name']}
          : <String, dynamic>{});
    final budget = (await tester.runAsync(() => fb.load(edit: (f) {
          f['accounts_bank'] = <dynamic>[];
          f['accounts_wallet'] = <dynamic>[];
        })))!;
    return (fb, budget);
  }

  Future<void> pumpShell(WidgetTester tester, BudgetProvider budget) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ChangeNotifierProvider.value(value: budget, child: const MaterialApp(home: AppShell())));
    await tester.pump();
  }

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 5; i++) {
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    }
    await tester.pumpAndSettle();
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    await tester.tap(find.byKey(ValueKey(key)));
    await settle(tester);
  }

  testWidgets('a user with no accounts gets setup, not an empty app', (tester) async {
    final (_, budget) = await newUser(tester);
    expect(budget.needsSetup, isTrue);
    await pumpShell(tester, budget);
    expect(find.byType(OnboardingScreen), findsOneWidget);
    expect(find.text('Welcome to Budget Planner'), findsOneWidget);
  });

  testWidgets('an account is required; the salary path saves the template once', (tester) async {
    final (fb, budget) = await newUser(tester);
    await pumpShell(tester, budget);

    await tapKey(tester, 'ob-get-started');
    expect(find.text('Add your main account'), findsOneWidget);
    await tapKey(tester, 'ob-continue');
    expect(find.text('Please provide an account name.'), findsOneWidget);
    expect(fb.writes, isEmpty);

    await tester.enterText(find.byKey(const ValueKey('ob-account-name')), 'HDFC');
    await tester.enterText(find.byKey(const ValueKey('ob-balance')), '25000');
    await tapKey(tester, 'ob-continue');
    expect(find.text('How are you paid?'), findsOneWidget);
    final create = fb.requests.singleWhere((r) => r.method == 'POST' && r.url.path == '/api/v1/accounts');
    expect(jsonDecode(create.body), containsPair('openingBalance', 2500000));
    expect(jsonDecode(create.body), containsPair('isPrimary', true));

    // Back to fix the account updates it; no second account
    await tapKey(tester, 'ob-back');
    await tapKey(tester, 'ob-continue');
    expect(fb.writes.where((w) => w == 'POST /api/v1/accounts'), hasLength(1));
    expect(fb.writes, contains('PATCH /api/v1/accounts/acc-new'));

    await tapKey(tester, 'ob-continue'); // Regular salary is the default
    expect(find.text('Your salary'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('ob-salary-amount')), '80000');
    await tapKey(tester, 'ob-finish');

    final tpl = fb.requests.singleWhere((r) => r.url.path == '/api/salary-templates');
    expect(jsonDecode(tpl.body), allOf(containsPair('amount', 8000000), containsPair('receivingAccountId', 'acc-new')));
    expect(find.text('You’re all set'), findsOneWidget);
  });

  testWidgets('variable income skips the salary page', (tester) async {
    final (fb, budget) = await newUser(tester);
    await pumpShell(tester, budget);

    await tapKey(tester, 'ob-get-started');
    await tapKey(tester, 'ob-seg-wallet');
    await tester.enterText(find.byKey(const ValueKey('ob-account-name')), 'Paytm');
    await tapKey(tester, 'ob-continue');
    await tapKey(tester, 'ob-income-irregular');
    expect(find.text('Finish'), findsOneWidget);
    await tapKey(tester, 'ob-continue');

    expect(find.text('You’re all set'), findsOneWidget);
    expect(fb.writes, contains('PUT /api/settings'));
    expect(fb.writes.where((w) => w.contains('salary-templates')), isEmpty);
    expect(jsonDecode(fb.requests.firstWhere((r) => r.method == 'POST').body), containsPair('type', 'wallet'));
  });
}
