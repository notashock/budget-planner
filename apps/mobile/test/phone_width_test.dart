import 'package:budget_mobile/modals/month_modals.dart';
import 'package:budget_mobile/providers/app_lock_provider.dart';
import 'package:budget_mobile/providers/auth_provider.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/providers/theme_provider.dart';
import 'package:budget_mobile/screens/plan_screen.dart';
import 'package:budget_mobile/widgets/header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fake_device_auth.dart';
import 'helpers/fixture_budget.dart';

/// Found on a real phone (Xiaomi, 393 dp wide, Phase 3 device check): the
/// header overflowed by 10 px and a new user had no way to create a month.
/// Widget tests ran at 800 dp, where neither shows.
void main() {
  Future<BudgetProvider> loaded(WidgetTester tester, {bool newUser = false}) async {
    late BudgetProvider budget;
    await tester.runAsync(() async {
      final fb = FixtureBudget()..monthMissing = newUser;
      budget = await fb.load(edit: newUser ? (f) => f['periods'] = <dynamic>[] : null);
    });
    return budget;
  }

  Future<void> pumpAt(WidgetTester tester, Widget child, BudgetProvider budget,
      {required double width, double textScale = 1.0}) async {
    tester.view.devicePixelRatio = 2.75;
    tester.view.physicalSize = Size(width * 2.75, 800 * 2.75);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider<BudgetProvider>.value(value: budget),
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(
          create: (_) => AppLockProvider(authenticator: FakeAuthenticator(), screenSecurity: FakeScreenSecurity()),
        ),
      ],
      child: MaterialApp(
        builder: (context, app) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
          child: app!,
        ),
        home: Scaffold(body: child),
      ),
    ));
    await tester.pump();
  }

  for (final (width, scale) in [(360.0, 1.0), (393.0, 1.0), (393.0, 1.3), (320.0, 1.0)]) {
    testWidgets('the header fits ${width.toInt()} dp at ${scale}x text', (tester) async {
      final budget = await loaded(tester);
      await pumpAt(tester, const HeaderWidget(), budget, width: width, textScale: scale);
      expect(tester.takeException(), isNull, reason: 'no RenderFlex overflow');
      expect(find.byKey(const ValueKey('header-more')), findsOneWidget);
    });
  }

  testWidgets('theme, app lock, server settings and sign-out are in the More menu, 48 dp tall', (tester) async {
    final budget = await loaded(tester);
    await pumpAt(tester, const HeaderWidget(), budget, width: 393);

    expect(tester.getSize(find.byKey(const ValueKey('header-more'))).height, greaterThanOrEqualTo(48));
    await tester.tap(find.byKey(const ValueKey('header-more')));
    await tester.pumpAndSettle();
    expect(find.text('Server settings'), findsOneWidget);
    expect(find.text('Sign out'), findsOneWidget);
    expect(find.textContaining('App lock:'), findsOneWidget);
    expect(find.textContaining('Theme:'), findsOneWidget);
  });

  testWidgets('a new user can create the month from the empty Plan', (tester) async {
    final budget = await loaded(tester, newUser: true);
    await pumpAt(tester, const PlanScreen(), budget, width: 393);

    expect(budget.monthMissing, isTrue);
    final create = find.byKey(const ValueKey('plan-create-month'));
    expect(create, findsOneWidget);
    await tester.tap(create);
    await tester.pumpAndSettle();
    expect(find.byType(CreateMonthModal), findsOneWidget);
    final modal = tester.widget<CreateMonthModal>(find.byType(CreateMonthModal));
    expect((modal.year, modal.month), (budget.currentYear, budget.currentMonth));
  });
}
