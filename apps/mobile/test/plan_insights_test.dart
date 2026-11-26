import 'package:budget_mobile/engine/plan_insights.dart';
import 'package:budget_mobile/models/simulation.dart';
import 'package:flutter_test/flutter_test.dart';

TimelineEvent ev(String date, int amount, [Map<String, dynamic> extra = const {}]) =>
    TimelineEvent.fromJson({'date': date, 'amount': amount, 'label': 'x', ...extra});

void main() {
  group('buildCashAllocation (same as planInsights.js)', () {
    test('bills, then floor, then free', () {
      final a = buildCashAllocation(todayBalance: 203800, safetyFloor: 10000);
      expect(a.total, 203800);
      expect([for (final s in a.segments) '${s.key}:${s.amount}'], ['floor:10000', 'free:193800']);
    });
    test('obligations over the balance make a shortfall; goals never do', () {
      final a = buildCashAllocation(todayBalance: 5000, committedUpcomingItems: 4000, safetyFloor: 3000, goalReserve: 9000);
      expect([for (final s in a.segments) '${s.key}:${s.amount}'], ['committed:4000', 'floor:1000', 'shortfall:2000']);
      expect(a.total, 7000);
    });
    test('free never exceeds the engine figure', () {
      final a = buildCashAllocation(todayBalance: 10000, freeSurplus: 2500);
      expect(a.segments.single.amount, 2500);
    });
  });

  test('getHeadroom and getMonthVerdict', () {
    expect(getHeadroom(900, 1000).status, 'breached');
    expect(getHeadroom(1100, 1000).status, 'warning');
    expect(getHeadroom(5000, 1000).ratio, 0.8);
    expect(getMonthVerdict(lowestBalance: 900, safetyFloor: 1000, safeRate: 500).key, 'critical');
    expect(getMonthVerdict(lowestBalance: 9000, safetyFloor: 1000, safeRate: 0).key, 'tight');
    expect(getMonthVerdict(lowestBalance: 9000, safetyFloor: 1000, paceStatus: 'contracting', safeRate: 9).key, 'tight');
    expect(getMonthVerdict(lowestBalance: 9000, safetyFloor: 1000, safeRate: 9).label, 'On track');
  });

  test('getUpcomingOutflows: overdue first, window of 7 days, no paid or transfers', () {
    final r = getUpcomingOutflows([
      ev('2026-11-30', -500),
      ev('2026-11-20', -100, {'isPending': true, 'originalDate': '2026-11-18'}),
      ev('2026-11-26', -300),
      ev('2026-12-03', -900), // outside the window
      ev('2026-11-27', -700, {'isActual': true}),
      ev('2026-11-27', -800, {'transferId': 't1'}),
      ev('2026-12-01', 5000, {'isSalary': true}),
    ], '2026-11-26');
    expect([for (final i in r.items) i.outflow], [100, 300, 500]);
    expect(r.items.first.dueDate, '2026-11-18');
    expect(r.items[1].isDueToday, isTrue);
    expect(r.total, 900);
    expect(r.overdueCount, 1);
    expect(r.daysToSalary, 5);
  });

  group('getAllowancePace (same cases as the engine)', () {
    test('null without an allowance', () {
      expect(getAllowancePace(unplannedAllowance: 0, totalUnplannedSpent: 0), isNull);
    });
    test('flags spending ahead of the expected line', () {
      final p = getAllowancePace(unplannedAllowance: 1000000, totalUnplannedSpent: 620000, daysElapsed: 15, daysInMonth: 30)!;
      expect(p.expectedByToday, 500000);
      expect(p.delta, 120000);
      expect(p.status, 'over');
      expect(p.left, 380000);
    });
    test('a small deviation is on pace, a large underspend is under', () {
      expect(getAllowancePace(unplannedAllowance: 1000, totalUnplannedSpent: 520, daysElapsed: 15, daysInMonth: 30)!.status, 'on');
      expect(getAllowancePace(unplannedAllowance: 1000, totalUnplannedSpent: 100, daysElapsed: 15, daysInMonth: 30)!.status, 'under');
    });
    test('caps the used ratio at 1 when overspent', () {
      expect(getAllowancePace(unplannedAllowance: 1000, totalUnplannedSpent: 1500, daysElapsed: 30, daysInMonth: 30)!.usedRatio, 1);
    });
  });
}
