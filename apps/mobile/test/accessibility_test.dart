import 'package:budget_mobile/providers/app_lock_provider.dart';
import 'package:budget_mobile/providers/auth_provider.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/providers/theme_provider.dart';
import 'package:budget_mobile/screens/accounts_screen.dart';
import 'package:budget_mobile/screens/goals_screen.dart';
import 'package:budget_mobile/screens/plan_screen.dart';
import 'package:budget_mobile/screens/transactions_screen.dart';
import 'dart:io';

import 'package:budget_mobile/theme/app_palette.dart';
import 'package:budget_mobile/theme/app_theme.dart';
import 'package:budget_mobile/widgets/app_dock.dart';
import 'package:budget_mobile/widgets/month_menu.dart';
import 'package:budget_mobile/widgets/screen_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fake_device_auth.dart';
import 'helpers/fixture_budget.dart';
import 'helpers/real_fonts.dart';

/// Upgrade plan 3.3: TalkBack can name everything you can tap, text meets
/// WCAG AA contrast in both themes, and 200 % system text fits at phone width.
///
/// Contrast is checked from the colours, not with Flutter's pixel-sampling
/// `textContrastGuideline`: on this app it under-reads thin 10-11 px Inter
/// (muted text at a computed 5.1:1 measured 3.3) and mixes in borders and
/// legend swatches inside a label's box (an ink badge at 5:1 measured 1.6).
void main() {
  final screens = <(String, Widget)>[
    ('header and dock', Column(children: [
      const Expanded(child: ScreenHeader(title: 'Transactions', actions: [MonthMenu()], child: SizedBox.expand())),
      AppDock(index: 1, onTab: (_) {}),
    ])),
    ('Plan', const PlanScreen()),
    ('Transactions', const TransactionsScreen()),
    ('Goals', const GoalsScreen()),
    ('Accounts', const AccountsScreen()),
  ];

  Future<void> pump(WidgetTester tester, Widget screen, {ThemeMode mode = ThemeMode.light, double text = 1.0}) async {
    tester.view.devicePixelRatio = 2.75;
    tester.view.physicalSize = const Size(393 * 2.75, 852 * 2.75);
    addTearDown(tester.view.reset);
    late BudgetProvider budget;
    await tester.runAsync(() async {
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
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: mode,
        builder: (context, app) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(text)),
          child: app!,
        ),
        home: Scaffold(body: screen),
      ),
    ));
    await tester.pump();
  }

  for (final (name, screen) in screens) {
    testWidgets('$name: everything tappable has a label', (tester) async {
      final handle = tester.ensureSemantics();
      await pump(tester, screen);
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      handle.dispose();
    });

    testWidgets('$name: 200 % text fits at 393 dp', (tester) async {
      await pump(tester, screen, text: 2.0);
      expect(tester.takeException(), isNull);
    });
  }

  // The rows that reflow at 200 % must still look like rows at 1x (found on
  // the phone: a Wrap stretched "Month Review" to full width on its own line).
  testWidgets('Plan at 1x: Details stays on the Timeline heading line', (tester) async {
    await pump(tester, const PlanScreen());
    final details = tester.getRect(find.byKey(const Key('plan-details-toggle')));
    final title = tester.getRect(find.text('Timeline'));
    expect(details.top, lessThan(title.bottom), reason: 'Details stays on the heading line');
    expect(details.width, lessThan(200));
  });

  double contrast(Color a, Color b) {
    final la = a.computeLuminance(), lb = b.computeLuminance();
    return (la > lb ? la + 0.05 : lb + 0.05) / (la > lb ? lb + 0.05 : la + 0.05);
  }

  for (final (name, p) in [('light', AppPalette.light), ('dark', AppPalette.dark)]) {
    test('$name: every text colour meets AA (4.5:1) on every surface and tint it is drawn on', () {
      final surfaces = {'bg': p.bg, 'surface': p.surface, 'surfaceSubtle': p.surfaceSubtle};
      final textColours = {
        'text': p.text,
        'textSecondary': p.textSecondary,
        'textMuted': p.textMuted,
        'goodInk': p.goodInk,
        'badInk': p.badInk,
        'warnInk': p.warnInk,
      };
      final failures = <String>[];
      textColours.forEach((t, fg) {
        surfaces.forEach((s, bg) {
          final r = contrast(fg, bg);
          if (r < 4.5) failures.add('$t on $s: ${r.toStringAsFixed(2)}');
        });
      });
      // status text sits on its own tint (badges, banners)
      for (final (t, fg, tint) in [
        ('goodInk', p.goodInk, p.goodSubtle),
        ('badInk', p.badInk, p.badSubtle),
        ('warnInk', p.warnInk, p.warnSubtle),
      ]) {
        final r = contrast(fg, Color.alphaBlend(tint, p.surface));
        if (r < 4.5) failures.add('$t on its tint: ${r.toStringAsFixed(2)}');
      }
      expect(failures, isEmpty);
    });
  }

  test('status text uses the ink colours, never the bright fill colours', () {
    // good / bad / warn are for fills, tints and chart lines; light-mode text
    // in them is 2.0-3.7:1. Allowed: Subtle tints, Ink, and .withAlpha fills.
    final bright = RegExp(r'context\.palette\.(good|bad|warn)(?!Subtle|Ink|\.withAlpha|\.withValues)');
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      final lines = f.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (bright.hasMatch(lines[i])) offenders.add('${f.path}:${i + 1}');
      }
    }
    expect(offenders, isEmpty);
  });
}
