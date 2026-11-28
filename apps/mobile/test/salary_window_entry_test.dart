// Salary is logged from the entry sheet's Income tab, only in its window
// (payday ± 5 days after the last salary).
import 'package:budget_mobile/models/month_detail.dart';
import 'package:budget_mobile/models/salary_window.dart';
import 'package:budget_mobile/models/transaction.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

String _iso(DateTime d) => '${d.year}-${'${d.month}'.padLeft(2, '0')}-${'${d.day}'.padLeft(2, '0')}';
final _now = DateTime.now();
String _day(int offset) => _iso(DateTime(_now.year, _now.month, _now.day + offset));

/// The user's case: paid 30 Oct, payday 30 Nov, window 25 Nov – 5 Dec, today 28 Nov.
Map<String, dynamic> _window(String state, {String? today}) => {
      'lastCreditedDate': '2026-10-30', 'expectedDate': '2026-11-30', 'opensOn': '2026-11-25', 'closesOn': '2026-12-05',
      'state': state, 'today': today ?? '2026-11-28', 'amount': 8000000, 'accountId': 'b1',
      'period': {'year': 2026, 'month': 11, 'isSalaryCredited': true},
    };

class FakeBudget extends BudgetProvider {
  FakeBudget(this.window);
  final Map<String, dynamic> window;
  Map<String, dynamic>? credited;

  @override
  Future<SalaryWindow?> getSalaryWindow() async => SalaryWindow.fromJson(window);

  @override
  MonthInfo? get monthInfo => MonthInfo.fromJson(const {'_id': 'm1', 'year': 2026, 'month': 11, 'isSalaryCredited': true});

  @override
  List<dynamic> get bankAccounts => [{'_id': 'b1', 'name': 'HDFC', 'isPrimary': true, 'openingBalance': 0}];

  @override
  List<dynamic> get wallets => const [];

  @override
  List<dynamic> get creditCards => const [];

  @override
  List<dynamic> get transactions => [
        {'_id': 'rent', 'name': 'Rent', 'status': 'planned', 'origin': 'planned', 'amount': 2500000, 'date': '2026-11-28', 'isFixed': true, 'recurrence': 'monthly'},
        {'_id': 'dinner', 'name': 'Dinner', 'status': 'planned', 'origin': 'planned', 'amount': 200000, 'date': '2026-11-29', 'isFixed': false},
      ];

  @override
  Future<void> creditSalary({num? amount, String? bankAccountId, String? date, bool late = false, int? year, int? month}) async {
    credited = {'amount': amount, 'bank': bankAccountId, 'date': date, 'late': late, 'year': year, 'month': month};
  }
}

Future<FakeBudget> open(WidgetTester tester, Map<String, dynamic> window, {EntryType type = EntryType.income}) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final budget = FakeBudget(window);
  await tester.pumpWidget(ChangeNotifierProvider<BudgetProvider>.value(
    value: budget,
    child: MaterialApp(
      home: Builder(
        builder: (ctx) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => showModalBottomSheet(
                context: ctx,
                isScrollControlled: true,
                builder: (_) => UnifiedEntryModal(initialType: type),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  ));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return budget;
}

void main() {
  group('SalaryWindow', () {
    final w = SalaryWindow.fromJson(_window('open'));
    test('reads the window and the period it credits', () {
      expect((w.opensOn, w.closesOn, w.amount, w.year, w.month), ('2026-11-25', '2026-12-05', 8000000, 2026, 11));
      expect(w.message, 'Expected 30 Nov · can be logged 25 Nov – 5 Dec');
    });
    test('takes dates from the opening day to today, after the last salary', () {
      expect(w.allows('2026-11-24'), isFalse);
      expect(w.allows('2026-11-25'), isTrue);
      expect(w.allows('2026-11-28'), isTrue);
      expect(w.allows('2026-11-29'), isFalse); // after today
    });
    test('before and after the window', () {
      expect(SalaryWindow.fromJson(_window('before', today: '2026-11-20')).message, 'Next salary can be logged from 25 Nov');
      final late = SalaryWindow.fromJson(_window('late', today: '2026-12-07'));
      expect(late.message, 'Your salary was due by 5 Dec. Logging it now marks it late.');
      expect((late.canLog, late.isLate), (true, true));
    });
    test('carryPreview: unpaid Fixed moves, unpaid Variable drops, monthly plans repeat', () {
      final c = carryPreview(FakeBudget(_window('open')).transactions.map(Transaction.fromJson).toList());
      expect(c.moved, ['Rent']);
      expect(c.dropped, ['Dinner']);
      expect(c.repeated, ['Rent']);
    });
  });

  // The sheet dates the entry today, so these windows are built around the real today.
  testWidgets('inside the window: Salary is chosen (amount left empty), and logs the salary', (tester) async {
    final budget = await open(tester, {..._window('open'), 'lastCreditedDate': _day(-29), 'opensOn': _day(-3), 'closesOn': _day(7), 'today': _day(0)});
    expect(find.text('Salary'), findsOneWidget);
    expect(find.byKey(const ValueKey('entry-salary-window')), findsOneWidget);
    expect(find.text('Moves in, still owed (Fixed): Rent'), findsOneWidget);
    expect(find.text('Dropped (Variable, unpaid): Dinner'), findsOneWidget);
    expect(find.byKey(const ValueKey('entry-income-note')), findsNothing);
    // No autofill: the user types the amount
    expect(tester.widget<TextField>(find.byKey(const ValueKey('entry-amount'))).controller!.text, isEmpty);
    await tester.enterText(find.byKey(const ValueKey('entry-amount')), '80000');
    await tester.pump();

    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    expect(budget.credited, {'amount': 8000000, 'bank': 'b1', 'date': _day(0), 'late': false, 'year': 2026, 'month': 11});
    expect(find.text('Salary logged'), findsOneWidget);
  });

  testWidgets('Add spend inside the salary window opens with an empty amount', (tester) async {
    await open(tester, {..._window('open'), 'lastCreditedDate': _day(-29), 'opensOn': _day(-3), 'closesOn': _day(7), 'today': _day(0)},
        type: EntryType.transaction);
    expect(tester.widget<TextField>(find.byKey(const ValueKey('entry-amount'))).controller!.text, isEmpty);
  });

  testWidgets('before the window: Salary shows but is disabled, with when it opens', (tester) async {
    final budget = await open(tester, {..._window('before'), 'opensOn': _day(3), 'today': _day(0)});
    expect(find.byKey(const ValueKey('entry-income-note')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('entry-source')));
    await tester.pumpAndSettle();
    final tile = tester.widget<ListTile>(find.byKey(const ValueKey('entry-pick-Salary')));
    expect(tile.enabled, isFalse);
    expect(find.descendant(of: find.byKey(const ValueKey('entry-pick-Salary')), matching: find.textContaining('Next salary can be logged from')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('entry-pick-Salary')));
    await tester.pumpAndSettle();
    expect(budget.credited, isNull);
  });

  testWidgets('after the window: still loggable, sent as late', (tester) async {
    final budget = await open(tester, {..._window('late'), 'lastCreditedDate': _day(-40), 'opensOn': _day(-15), 'closesOn': _day(-5), 'today': _day(0)});
    expect(find.textContaining('Logging it now marks it late'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('entry-amount')), '80000');
    await tester.pump();
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    expect(budget.credited?['late'], isTrue);
  });
}
