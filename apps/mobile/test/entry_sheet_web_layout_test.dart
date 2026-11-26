// The entry sheet laid out as on web: top bar, tabs, hero amount, grouped
// rows, edit summary with Delete / Change type, and web's footer.
import 'package:flutter/material.dart';
import 'package:budget_mobile/models/transaction.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/services/entry_memory.dart';
import 'package:budget_mobile/services/outbox.dart';

class FakeBudget extends BudgetProvider {
  FakeBudget({this.noAccounts = false});
  final bool noAccounts;
  final List<Map<String, dynamic>> created = [];
  final Map<String, Map<String, dynamic>> updated = {};
  final List<String> deleted = [];

  @override
  List<dynamic> get bankAccounts =>
      noAccounts ? const [] : [{'_id': 'b1', 'name': 'Main Bank', 'isPrimary': true, 'openingBalance': 1000000}];

  @override
  List<dynamic> get wallets => noAccounts ? const [] : [{'_id': 'w1', 'name': 'Cash', 'openingBalance': 20000}];

  @override
  List<dynamic> get creditCards => const [];

  @override
  Future<WriteResult> addTransaction(Map<String, dynamic> tx) async {
    created.add(tx);
    return WriteResult.saved;
  }

  @override
  Future<void> updateTransaction(String id, Map<String, dynamic> updates) async => updated[id] = updates;

  @override
  Future<void> deleteTransaction(String id) async => deleted.add(id);
}

Future<FakeBudget> pumpSheet(WidgetTester tester, Widget sheet, {bool noAccounts = false}) async {
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final budget = FakeBudget(noAccounts: noAccounts);
  await tester.pumpWidget(
    ChangeNotifierProvider<BudgetProvider>.value(
      value: budget,
      child: MaterialApp(
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showModalBottomSheet(context: ctx, isScrollControlled: true, builder: (_) => sheet),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return budget;
}

Future<void> tapKey(WidgetTester tester, String key) async {
  final f = find.byKey(ValueKey(key));
  await tester.ensureVisible(f);
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Transaction tea() => Transaction.fromJson(const {
      '_id': 't1', 'title': 'Tea', 'amount': 2000, 'status': 'successful', 'date': '2026-11-10',
      'category': 'Food', 'accountId': 'b1',
    });

Transaction rentPlan() => Transaction.fromJson(const {
      '_id': 'p1', 'title': 'Rent', 'amount': 1500000, 'plannedAmount': 1500000, 'status': 'planned',
      'date': '2026-11-05', 'plannedDate': '2026-11-05', 'category': 'Other', 'accountId': 'b1',
    });

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    EntryMemory.resetForTest();
  });

  testWidgets('a new entry: Cancel, title and Add in the top bar; Spending tab first', (tester) async {
    await pumpSheet(tester, const UnifiedEntryModal());
    expect(find.text('Cancel'), findsOneWidget);
    expect(find.text('New spend'), findsOneWidget);
    expect(find.text('Add'), findsOneWidget);
    expect(find.text('Expense Debit'), findsOneWidget);
    expect(find.text('Add & log another'), findsOneWidget);

    await tapKey(tester, 'entry-refund-toggle');
    expect(find.text('New refund'), findsOneWidget);
    expect(find.text('Credit / Refund'), findsOneWidget);
  });

  testWidgets('income: its own quick amounts and the salary note, no salary card', (tester) async {
    await pumpSheet(tester, const UnifiedEntryModal(initialType: EntryType.income));
    expect(find.text('New income'), findsOneWidget);
    expect(find.text('10k'), findsOneWidget);
    expect(find.byKey(const ValueKey('entry-income-note')), findsOneWidget);
    expect(find.text('SCHEDULED MONTHLY SALARY'), findsNothing);
    expect(find.text('Into'), findsOneWidget);
  });

  testWidgets('a new plan: Variable info, a day stepper when recurring, and Already paid? switches to spend', (tester) async {
    await pumpSheet(tester, const UnifiedEntryModal(initialType: EntryType.item));
    expect(find.text('New plan'), findsOneWidget);

    await tapKey(tester, 'entry-variable-info');
    expect(find.text('Expense Rollover Mode'), findsOneWidget);
    await tester.tap(find.text('Got it'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Recurring'));
    await tester.pumpAndSettle();
    expect(find.text('New recurring bill'), findsOneWidget);
    final day = tester.widget<Text>(find.byKey(const ValueKey('entry-day'))).data!;
    await tapKey(tester, 'entry-day-plus');
    expect(tester.widget<Text>(find.byKey(const ValueKey('entry-day'))).data, isNot(day));

    await tapKey(tester, 'entry-already-paid');
    expect(find.text('New spend'), findsOneWidget);
  });

  testWidgets('no accounts: Bank Account Required and Add is off', (tester) async {
    await pumpSheet(tester, const UnifiedEntryModal(), noAccounts: true);
    expect(find.text('Bank Account Required'), findsOneWidget);
    expect(find.text('+ Add Bank Account'), findsOneWidget);
    expect(tester.widget<TextButton>(find.byKey(const ValueKey('entry-primary'))).onPressed, isNull);
  });

  testWidgets('editing lists what changes, then saves', (tester) async {
    final budget = await pumpSheet(tester, UnifiedEntryModal(initialType: EntryType.transaction, initialTransaction: tea()));
    expect(find.text('No changes yet'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('entry-amount')), '25');
    await tester.pump();
    expect(find.textContaining(RegExp(r'^Changing: Amount ₹20(.00)? → ₹25')), findsOneWidget);
    await tapKey(tester, 'entry-primary');
    expect(budget.updated['t1']!['amount'], 2500);
  });

  testWidgets('Delete asks inline, Keep backs out, Delete removes it', (tester) async {
    final budget = await pumpSheet(tester, UnifiedEntryModal(initialType: EntryType.transaction, initialTransaction: tea()));
    await tapKey(tester, 'entry-delete');
    expect(find.text("Delete this spend? This can't be undone."), findsOneWidget);
    await tester.tap(find.text('Keep'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('entry-delete-confirm')), findsNothing);

    await tapKey(tester, 'entry-delete');
    await tapKey(tester, 'entry-delete-confirm-btn');
    expect(budget.deleted, ['t1']);
    expect(find.byType(UnifiedEntryModal), findsNothing);
  });

  testWidgets('Change type reopens as income with the same values and replaces the spend on save', (tester) async {
    final budget = await pumpSheet(tester, UnifiedEntryModal(initialType: EntryType.transaction, initialTransaction: tea()));
    await tapKey(tester, 'entry-change-type');
    expect(find.text('The spend is replaced once the new entry is saved.'), findsOneWidget);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Income'));
    await tester.pumpAndSettle();

    expect(find.text('New income'), findsOneWidget);
    expect(find.widgetWithText(TextField, '20'), findsOneWidget);
    await tapKey(tester, 'entry-primary');
    expect(budget.created.single['isIncome'], isTrue);
    expect(budget.created.single['amount'], 2000);
    expect(budget.deleted, ['t1']);
  });

  testWidgets('editing a plan: the Payment pending switch marks it paid', (tester) async {
    final budget = await pumpSheet(tester, UnifiedEntryModal(initialType: EntryType.item, initialTransaction: rentPlan()));
    expect(find.text('Edit plan'), findsOneWidget);
    expect(find.text('Editing Planned Commitment'), findsOneWidget);
    expect(find.text('Payment pending'), findsOneWidget);
    await tapKey(tester, 'entry-paid-toggle');
    expect(find.text('Payment done'), findsOneWidget);
    expect(find.textContaining('Status Pending → Paid'), findsOneWidget);
    await tapKey(tester, 'entry-primary');
    expect(budget.updated['p1']!['isPaid'], isTrue);
  });
}
