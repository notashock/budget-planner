import 'package:budget_mobile/engine/plan_insights.dart';
import 'package:budget_mobile/models/simulation.dart';
import 'package:budget_mobile/widgets/timeline_list.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fake_font_http.dart';
import 'helpers/fixture_budget.dart';

/// Timeline shows only today in the current month; month switches show the skeleton.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  useFakeFontHttp();

  String iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Three days around [mid], one spend on each.
  SimulationResult simAround(DateTime mid) {
    final dates = [for (final shift in [-1, 0, 1]) mid.add(Duration(days: shift))];
    final names = ['Yesterday spend', 'Today spend', 'Tomorrow spend'];
    return SimulationResult.fromJson({
      'days': [
        for (final (i, d) in dates.indexed)
          {'day': i + 1, 'date': iso(d), 'openingBalance': 100000, 'closingBalance': 99000},
      ],
      'allEvents': [
        for (final (i, d) in dates.indexed)
          {
            'id': 'e$i',
            'date': iso(d),
            'day': i + 1,
            'name': names[i],
            'amount': -1000,
            'runningBalance': 99000,
            'status': 'successful',
            'isPaid': true,
            'itemType': 'actual',
          },
      ],
    });
  }

  Future<void> pumpTimeline(WidgetTester tester, SimulationResult sim, {String? account, bool thisMonth = true}) async {
    // A month around today, or one two months back; the days list is sparse like the server's.
    final mid = thisMonth ? DateTime.now() : DateTime.now().subtract(const Duration(days: 60));
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: TimelineListWidget(
            simulation: sim,
            safetyFloor: 0,
            accountName: account,
            periodStart: iso(mid.subtract(const Duration(days: 10))),
            periodEnd: iso(mid.add(const Duration(days: 10))),
          ),
        ),
      ),
    ));
  }

  testWidgets("the current month's timeline lists only today's entries", (tester) async {
    await pumpTimeline(tester, simAround(DateTime.now()));
    expect(find.text('Today spend'), findsOneWidget);
    expect(find.text('Yesterday spend'), findsNothing);
    expect(find.text('Tomorrow spend'), findsNothing);
  });

  testWidgets("an account's timeline lists only that day too", (tester) async {
    await pumpTimeline(tester, simAround(DateTime.now()), account: 'HDFC');
    expect(find.text('Today spend'), findsOneWidget);
    expect(find.text('Yesterday spend'), findsNothing);
  });

  testWidgets('a month without today lists every day', (tester) async {
    await pumpTimeline(tester, simAround(DateTime.now().subtract(const Duration(days: 60))), thisMonth: false);
    for (final name in ['Yesterday spend', 'Today spend', 'Tomorrow spend']) {
      expect(find.text(name), findsOneWidget, reason: name);
    }
  });

  testWidgets('nothing today says so', (tester) async {
    final sim = simAround(DateTime.now());
    await pumpTimeline(
        tester,
        // Sparse like the server's: a day with no entries has no row
        SimulationResult.fromJson({'days': const [], 'allEvents': [for (final e in sim.allEvents) if (e.date != iso(DateTime.now())) e.raw]}));
    expect(find.text('Yesterday spend'), findsNothing);
    expect(find.text('Nothing today'), findsOneWidget);
  });

  test('a transfer, held/lent money or a card bill is not a spend', () {
    TimelineEvent e(String itemType, int amount) =>
        TimelineEvent.fromJson({'id': itemType, 'date': '2026-11-01', 'amount': amount, 'itemType': itemType});
    expect(isSpendEvent(e('actual', -500)), isTrue);
    expect(isSpendEvent(e('actual', 500)), isFalse);
    for (final t in ['transfer', 'pass-through', 'card-bill']) {
      expect(isSpendEvent(e(t, -500)), isFalse, reason: t);
    }
  });

  testWidgets('switching month counts as loading until the new month arrives', (tester) async {
    final fb = FixtureBudget();
    final budget = (await tester.runAsync(fb.load))!;
    expect(budget.isSwitchingMonth, isFalse);
    final info = budget.monthInfo!;
    await tester.runAsync(() async {
      final next = budget.switchMonth(info.year + 1, info.month);
      expect(budget.isSwitchingMonth, isTrue);
      await next;
    });
  });
}
