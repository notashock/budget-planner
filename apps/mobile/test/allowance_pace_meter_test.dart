// The Plan page's unplanned-allowance card, laid out as web's AllowancePaceMeter.
import 'package:budget_mobile/widgets/plan_glance.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:budget_mobile/theme/app_theme.dart';

Widget host(Widget child) => MaterialApp(theme: AppTheme.lightTheme, home: Scaffold(body: child));

void main() {
  testWidgets('over pace: status, figures, expected line and note', (tester) async {
    await tester.pumpWidget(host(const AllowancePaceMeter(
      unplannedAllowance: 1000000, totalUnplannedSpent: 620000, daysElapsed: 15, daysInMonth: 30, currencySymbol: '₹',
    )));
    expect(find.text('Unplanned allowance'), findsOneWidget);
    expect(find.text('Over pace'), findsOneWidget);
    expect(find.text('of ₹10,000 used'), findsOneWidget);
    expect(find.textContaining('Expected by today'), findsOneWidget);
    expect(find.textContaining('ahead of an even pace for day 15.'), findsOneWidget);
  });

  testWidgets('nothing without an allowance', (tester) async {
    await tester.pumpWidget(host(const AllowancePaceMeter(
      unplannedAllowance: 0, totalUnplannedSpent: 0, daysElapsed: 1, daysInMonth: 30, currencySymbol: '₹',
    )));
    expect(find.byKey(const ValueKey('allowance-pace')), findsNothing);
  });
}
