import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/providers/app_lock_provider.dart';
import 'package:budget_mobile/providers/auth_provider.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/providers/theme_provider.dart';
import 'package:budget_mobile/screens/plan_screen.dart';
import 'package:budget_mobile/widgets/app_dock.dart';
import 'package:budget_mobile/widgets/month_menu.dart';
import 'package:budget_mobile/widgets/screen_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
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

  Widget shell() => Column(children: [
        const Expanded(child: ScreenHeader(title: 'Transactions', actions: [MonthMenu()], child: SizedBox.expand())),
        AppDock(index: 0, onTab: (_) {}),
      ]);

  for (final (width, scale) in [(360.0, 1.0), (393.0, 1.0), (393.0, 1.3), (320.0, 1.0), (393.0, 2.0)]) {
    testWidgets('the header and dock fit ${width.toInt()} dp at ${scale}x text', (tester) async {
      final budget = await loaded(tester);
      await pumpAt(tester, shell(), budget, width: width, textScale: scale);
      expect(tester.takeException(), isNull, reason: 'no RenderFlex overflow');
      expect(find.byKey(const ValueKey('header-month')), findsOneWidget);
      for (final tab in ['Plan', 'Transactions', 'Goals', 'Accounts']) {
        expect(find.byKey(ValueKey('dock-tab-$tab')), findsOneWidget);
      }
    });
  }

  testWidgets('the You sheet holds salary, assistant, appearance, app lock, server and sign-out', (tester) async {
    final budget = await loaded(tester);
    await pumpAt(tester, shell(), budget, width: 393);

    expect(tester.getSize(find.byKey(const ValueKey('dock-you'))).height, greaterThanOrEqualTo(48));
    await tester.tap(find.byKey(const ValueKey('dock-you')));
    await tester.pumpAndSettle();
    for (final label in ['Salary schedule', 'Assistant', 'Appearance', 'App lock', 'Server settings', 'Sign out']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
  });

  testWidgets('screen readers can activate the Today bar and every tab', (tester) async {
    final handle = tester.ensureSemantics();
    final budget = await loaded(tester);
    await pumpAt(tester, shell(), budget, width: 393);
    for (final label in ['Add spend', 'Plan', 'Transactions', 'Goals', 'Accounts']) {
      final node = tester.getSemantics(find.descendant(of: find.byType(AppDock), matching: find.bySemanticsLabel(label)));
      expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue, reason: label);
    }
    handle.dispose();
  });

  testWidgets('the Today bar opens the entry sheet on Spend', (tester) async {
    final budget = await loaded(tester);
    await pumpAt(tester, shell(), budget, width: 393);
    await tester.tap(find.byKey(const ValueKey('today-bar')));
    await tester.pumpAndSettle();
    final sheet = tester.widget<UnifiedEntryModal>(find.byType(UnifiedEntryModal));
    expect(sheet.initialType, EntryType.transaction);
  });

  testWidgets('the large title hands over to the compact bar on scroll', (tester) async {
    final budget = await loaded(tester);
    await pumpAt(
        tester,
        ScreenHeader(
          title: 'Goals',
          child: ListView(children: [for (var i = 0; i < 60; i++) ListTile(title: Text('row $i'))]),
        ),
        budget,
        width: 393);
    double largeOpacity() => tester
        .widget<Opacity>(find.ancestor(of: find.text('Goals').last, matching: find.byType(Opacity)).first)
        .opacity;
    expect(find.text('Goals'), findsNWidgets(2), reason: 'large title shown, compact one hidden');
    expect(largeOpacity(), 1.0);
    await tester.drag(find.text('row 3'), const Offset(0, -400));
    await tester.pumpAndSettle();
    expect(find.text('Goals'), findsOneWidget, reason: 'only the compact title once scrolled');
  });

  testWidgets('months are never created by hand (same as web)', (tester) async {
    final budget = await loaded(tester, newUser: true);
    await pumpAt(tester, const PlanScreen(), budget, width: 393);
    expect(budget.monthMissing, isTrue);
    expect(find.textContaining('Create'), findsNothing);

    await pumpAt(tester, shell(), budget, width: 393);
    await tester.tap(find.byKey(const ValueKey('header-month')));
    await tester.pumpAndSettle();
    expect(find.text('Create Month'), findsNothing);
    expect(find.text('Rollover Month'), findsOneWidget);
  });
}
