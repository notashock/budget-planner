import 'package:budget_mobile/providers/app_lock_provider.dart';
import 'package:budget_mobile/providers/auth_provider.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/providers/theme_provider.dart';
import 'package:budget_mobile/screens/accounts_screen.dart';
import 'package:budget_mobile/screens/goals_screen.dart';
import 'package:budget_mobile/screens/plan_screen.dart';
import 'package:budget_mobile/screens/transactions_screen.dart';
import 'package:budget_mobile/theme/app_theme.dart';
import 'package:budget_mobile/widgets/header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fake_device_auth.dart';
import 'helpers/fixture_budget.dart';
import 'helpers/real_fonts.dart';

/// Upgrade plan 3.2: every tappable thing is at least 48 x 48 dp (Android's
/// guideline), on each tab with the recorded month loaded, at phone width.
void main() {
  for (final (name, screen) in <(String, Widget)>[
    ('header', const HeaderWidget()),
    ('Plan', const PlanScreen()),
    ('Transactions', const TransactionsScreen()),
    ('Goals', const GoalsScreen()),
    ('Accounts', const AccountsScreen()),
  ]) {
    testWidgets('$name: tap targets are at least 48 dp', (tester) async {
      tester.view.devicePixelRatio = 2.75;
      tester.view.physicalSize = const Size(393 * 2.75, 852 * 2.75);
      addTearDown(tester.view.reset);
      final handle = tester.ensureSemantics();

      late BudgetProvider budget;
      await tester.runAsync(() async {
        // Real fonts, so widths match the phone (not the 1-em test glyphs)
        await loadAppFonts();
        budget = await FixtureBudget().load();
      });
      await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider<BudgetProvider>.value(value: budget),
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
          ChangeNotifierProvider(create: (_) => AuthProvider()),
          ChangeNotifierProvider(
            create: (_) => AppLockProvider(authenticator: FakeAuthenticator(), screenSecurity: FakeScreenSecurity()),
          ),
        ],
        child: MaterialApp(theme: AppTheme.lightTheme, home: Scaffold(body: screen)),
      ));
      await tester.pump();

      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      handle.dispose();
    });
  }
}
