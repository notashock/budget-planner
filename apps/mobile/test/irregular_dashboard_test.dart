// The irregular-income Plan view: runway, hero cards and the cashflow timeframes.
import 'package:budget_mobile/engine/income_engine.dart';
import 'package:budget_mobile/theme/app_theme.dart';
import 'package:budget_mobile/widgets/irregular_dashboard.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final metrics = calculateIrregularMetrics(
    accounts: [
      {'id': 'a', 'openingBalance': 300000, 'openingBalanceDate': '2026-08-01'},
    ],
    transactions: [
      {'id': '1', 'amount': 90000, 'date': '2026-08-10', 'isIncome': true, 'status': 'successful'},
      {'id': '2', 'amount': 60000, 'date': '2026-09-05', 'status': 'successful'},
      {'id': '3', 'amount': 30000, 'date': '2026-10-05', 'status': 'successful'},
    ],
    asOfDate: '2026-10-20',
  );

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 3200);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.lightTheme,
      home: Scaffold(
        body: SingleChildScrollView(
          child: Column(children: [
            RunwayGauge(metrics: metrics, currencySymbol: '₹'),
            IrregularHeroCards(metrics: metrics, currencySymbol: '₹'),
            CashflowAnalysisCard(metrics: metrics, currencySymbol: '₹'),
          ]),
        ),
      ),
    ));
  }

  testWidgets('runway, hero cards and trailing 12 months', (tester) async {
    await pump(tester);
    expect(find.text('Emergency runway'), findsOneWidget);
    expect(find.text('10.0'), findsOneWidget);
    expect(find.text('6+ months'), findsOneWidget);
    expect(find.text('Based on 3 months of history.'), findsOneWidget);
    expect(find.text('Smoothed income'), findsOneWidget);
    expect(find.text('Savings rate'), findsOneWidget);
    expect(find.text('0%'), findsOneWidget);
    expect(find.text('Trailing 12-Month Inflow'), findsOneWidget);
  });

  testWidgets('Quarterly and Yearly show their tables', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const ValueKey('timeframe-quarterly')));
    await tester.pump();
    expect(find.text('Net savings'), findsOneWidget);
    expect(find.text('2026-Q3'), findsNWidgets(2)); // bar label and table row
    await tester.tap(find.byKey(const ValueKey('timeframe-ytd')));
    await tester.pump();
    expect(find.text('Net Cashflow'), findsOneWidget);
    expect(find.text('2026'), findsOneWidget);
  });
}
