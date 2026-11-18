import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/modals/held_lent_modal.dart';
import 'package:budget_mobile/engine/entry_assists.dart';
import 'package:budget_mobile/services/entry_memory.dart';

String today() {
  final d = DateTime.now();
  String p(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${p(d.month)}-${p(d.day)}';
}

class FakeBudget extends BudgetProvider {
  @override
  List<dynamic> get bankAccounts => [
        {'_id': 'b1', 'name': 'Main Bank', 'isPrimary': true, 'openingBalance': 1000000},
      ];

  @override
  List<dynamic> get wallets => const [];

  @override
  List<dynamic> get creditCards => const [];

  @override
  List<dynamic> get transactions => [
        {'_id': 'p1', 'name': 'Rent', 'amount': 1500000, 'status': 'planned', 'date': today()},
      ];

  @override
  Map<String, dynamic>? get activeMonth => {'incomeAmount': 8500000, 'incomeCreditDate': '2026-11-30'};

  @override
  Future<Map<String, dynamic>> getPersonFunds() async => {'funds': []};
}

Future<void> pumpSheet(WidgetTester tester, {EntryType type = EntryType.transaction}) async {
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ChangeNotifierProvider<BudgetProvider>.value(
      value: FakeBudget(),
      child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: UnifiedEntryModal(initialType: type)))),
    ),
  );
  await tester.pumpAndSettle();
}

Finder field(String label) => find.widgetWithText(TextField, label);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    EntryMemory.resetForTest();
  });

  group('assists (pure)', () {
    final rent = {'_id': 'p1', 'name': 'Rent', 'amount': 1500000, 'status': 'planned', 'date': '2026-11-20'};

    test('bill match: within 10%, by name, not when paid or far off', () {
      expect(findBillMatch([rent], amount: 1400000, today: '2026-11-18')?['_id'], 'p1');
      expect(findBillMatch([rent], amount: 1300000, today: '2026-11-18'), isNull);
      expect(findBillMatch([rent], amount: 0, description: 'rent for Nov', today: '2026-11-18')?['_id'], 'p1');
      expect(findBillMatch([{...rent, 'status': 'successful'}], amount: 1500000, today: '2026-11-18'), isNull);
      expect(findBillMatch([{...rent, 'date': '2026-12-30'}], amount: 1500000, today: '2026-11-18'), isNull);
    });

    test('duplicate salary: wording or the scheduled amount', () {
      final month = {'incomeAmount': 8500000, 'incomeCreditDate': '2026-11-30'};
      expect(detectDuplicateSalary(description: 'Nov salary', amount: 1, month: month)?['amount'], 8500000);
      expect(detectDuplicateSalary(description: 'Bonus', amount: 8400000, month: month), isNotNull);
      expect(detectDuplicateSalary(description: 'Freelance', amount: 500000, month: month), isNull);
    });

    test('person hint: names and wording', () {
      final ravi = {'id': 'f1', 'personName': 'Ravi', 'direction': 'lent', 'outstanding': 300000};
      expect(detectPersonHint(description: 'Ravi paid', flow: 'in', funds: [ravi])?['action'], 'repaid');
      expect(detectPersonHint(description: 'Cash from Meera to keep', flow: 'in')?['personName'], 'Meera');
      expect(detectPersonHint(description: 'Lent to Arjun', flow: 'out')?['action'], 'lend');
      expect(detectPersonHint(description: 'Groceries', flow: 'out'), isNull);
    });
  });

  testWidgets('a spend close to a planned bill asks "Paying Rent?"', (tester) async {
    await pumpSheet(tester);
    await tester.enterText(field('Amount (₹) *'), '14500');
    await tester.pump();
    expect(find.byKey(const ValueKey('assist-bill')), findsOneWidget);
    expect(find.textContaining('Paying Rent'), findsOneWidget);
    final no = find.descendant(of: find.byKey(const ValueKey('assist-bill')), matching: find.text('No'));
    await tester.ensureVisible(no);
    await tester.tap(no);
    await tester.pump();
    expect(find.byKey(const ValueKey('assist-bill')), findsNothing);
  });

  testWidgets('income that looks like salary warns', (tester) async {
    await pumpSheet(tester, type: EntryType.income);
    await tester.enterText(field('Note / Payer Reference (optional)'), 'November salary');
    await tester.pump();
    expect(find.byKey(const ValueKey('assist-salary')), findsOneWidget);
    expect(find.textContaining('already in the plan'), findsOneWidget);
  });

  testWidgets('someone else\'s money: Track as held opens Held & Lent with the name', (tester) async {
    await pumpSheet(tester, type: EntryType.income);
    await tester.enterText(field('Income (₹) *'), '2000');
    await tester.enterText(field('Note / Payer Reference (optional)'), 'Cash from Meera to keep');
    await tester.pump();
    expect(find.byKey(const ValueKey('assist-person')), findsOneWidget);
    await tester.ensureVisible(find.text('Track as held'));
    await tester.tap(find.text('Track as held'));
    await tester.pumpAndSettle();
    expect(find.byType(HeldLentForm), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Meera'), findsOneWidget);
    expect(find.byKey(const ValueKey('expected-date')), findsOneWidget);
  });
}
