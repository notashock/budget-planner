import 'package:flutter/material.dart';
import 'package:budget_mobile/models/account.dart';
import 'package:budget_mobile/models/goal.dart';
import 'package:budget_mobile/models/transaction.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/modals/edit_account_modal.dart';
import 'package:budget_mobile/modals/card_modals.dart';
import 'package:budget_mobile/services/entry_memory.dart';

/// Budget data without a server; records what the sheets change.
class FakeBudget extends BudgetProvider {
  final List<Map<String, dynamic>> created = [];
  final Map<String, Map<String, dynamic>> updated = {};
  final List<String> archived = [];

  @override
  List<dynamic> get bankAccounts => [
        {'_id': 'b1', 'name': 'Main Bank', 'isPrimary': true, 'openingBalance': 1000000},
      ];

  @override
  List<dynamic> get wallets => [
        {'_id': 'w1', 'name': 'Cash', 'openingBalance': 20000},
      ];

  @override
  List<dynamic> get creditCards => const [];

  @override
  Future<void> addTransaction(Map<String, dynamic> tx) async => created.add(tx);

  @override
  Future<void> updateTransaction(String id, Map<String, dynamic> updates) async => updated[id] = updates;

  @override
  Future<void> updateGoal(String id, Map<String, dynamic> updates) async => updated[id] = updates;

  @override
  Future<void> updateBankAccount(String id, Map<String, dynamic> updates) async => updated[id] = updates;

  @override
  Future<void> updateCard(String id, Map<String, dynamic> updates) async => updated[id] = updates;

  @override
  Future<void> archiveCard(String id) async => archived.add(id);
}

Future<FakeBudget> pumpSheet(WidgetTester tester, Widget sheet) async {
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final budget = FakeBudget();
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

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    EntryMemory.resetForTest();
  });

  testWidgets('edit a spend: filled in, type locked, saved as an update', (tester) async {
    final budget = await pumpSheet(
      tester,
      UnifiedEntryModal(
        initialType: EntryType.transaction,
        initialTransaction: Transaction.fromJson(const {
          '_id': 't1', 'title': 'Tea', 'amount': 2000, 'status': 'successful', 'date': '2026-11-10',
          'category': 'Travel', 'accountId': 'w1',
        }),
      ),
    );
    expect(find.text('Edit spend'), findsOneWidget);
    expect(find.text('Move'), findsNothing, reason: 'tabs are hidden while editing');
    expect(find.widgetWithText(TextField, '20'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Tea'), findsOneWidget);
    expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Travel')).selected, isTrue);
    expect(find.byKey(const ValueKey('save-add-another')), findsNothing);

    await tester.enterText(find.widgetWithText(TextField, '20'), '25');
    await tester.ensureVisible(find.text('Save changes'));
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();

    expect(budget.created, isEmpty);
    expect(budget.updated['t1'], isNotNull);
    expect(budget.updated['t1']!['amount'], 2500);
    expect(budget.updated['t1']!['category'], 'Travel');
    expect(budget.updated['t1']!['walletId'], 'w1');
  });

  testWidgets('edit a goal: name, price and priority are updated', (tester) async {
    final budget = await pumpSheet(
      tester,
      UnifiedEntryModal(
        initialType: EntryType.goal,
        initialGoal: Goal.fromJson(const {'_id': 'g1', 'name': 'Headphones', 'targetAmount': 1500000, 'priority': 2}),
      ),
    );
    expect(find.text('Edit purchase goal'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, '15000'), '14000');
    await tester.ensureVisible(find.text('Save changes'));
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();
    expect(budget.updated['g1'], {'name': 'Headphones', 'targetAmount': 1400000, 'priority': 2});
  });

  testWidgets('account edit: changing the opening balance warns and is sent; untouched it is not', (tester) async {
    final budget = await pumpSheet(
      tester,
      EditAccountModal(account: Account.fromJson({'_id': 'b1', 'name': 'Main Bank', 'type': 'bank', 'openingBalance': 1000000}), isBank: true),
    );
    final opening = find.widgetWithText(TextField, 'Opening balance (₹)');
    expect(find.byKey(const ValueKey('opening-balance-warning')), findsNothing);
    await tester.enterText(opening, '10500');
    await tester.pump();
    expect(find.byKey(const ValueKey('opening-balance-warning')), findsOneWidget);
    expect(find.textContaining('+₹500'), findsOneWidget);
    await tester.ensureVisible(find.text('Save Changes'));
    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();
    expect(budget.updated['b1']!['openingBalance'], 1050000);
  });

  testWidgets('account edit without touching the opening balance does not send it', (tester) async {
    final budget = await pumpSheet(
      tester,
      EditAccountModal(account: Account.fromJson({'_id': 'b1', 'name': 'Main Bank', 'type': 'bank', 'openingBalance': 1000000}), isBank: true),
    );
    await tester.ensureVisible(find.text('Save Changes'));
    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();
    expect(budget.updated['b1']!.containsKey('openingBalance'), isFalse);
  });

  testWidgets('card edit: filled in, owed change warns, card can be removed', (tester) async {
    final budget = await pumpSheet(
      tester,
      AddCardModal(card: CreditCardSummary.fromJson({
        'id': 'c1', 'name': 'Visa', 'type': 'credit_card', 'creditLimit': 5000000, 'openingBalance': -100000,
        'outstanding': 100000, 'statementDay': 20, 'dueDay': 8, 'payFromAccountId': 'b1',
      })),
    );
    expect(find.text('Edit card'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Visa'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, '1000'), '1500');
    await tester.pump();
    expect(find.byKey(const ValueKey('card-owed-warning')), findsOneWidget);

    await tester.ensureVisible(find.text('Remove card'));
    await tester.tap(find.text('Remove card'));
    await tester.pump();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    expect(budget.archived, ['c1']);
  });
}
