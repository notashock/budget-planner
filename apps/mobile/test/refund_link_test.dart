import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/services/entry_memory.dart';

class FakeBudget extends BudgetProvider {
  final List<Map<String, dynamic>> created = [];

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
  List<dynamic> get transactions => [
        {'_id': 't1', 'title': 'Shoes', 'amount': 450000, 'status': 'successful', 'origin': 'spot', 'category': 'Health', 'accountId': 'w1', 'date': '2026-11-12'},
        {'_id': 't3', 'title': 'Salary', 'amount': 8500000, 'status': 'successful', 'isIncome': true, 'accountId': 'b1', 'date': '2026-11-01'},
        {'_id': 'p1', 'title': 'Rent', 'amount': 1500000, 'status': 'planned', 'date': '2026-11-20'},
        {'_id': 'r1', 'title': 'Shoe refund', 'amount': -150000, 'status': 'successful', 'origin': 'spot', 'refundTargetTransactionId': 't1', 'date': '2026-11-16'},
      ];

  @override
  Future<Map<String, dynamic>> getPersonFunds() async => {'funds': []};

  @override
  Future<void> addTransaction(Map<String, dynamic> tx) async => created.add(tx);
}

Future<FakeBudget> pumpSheet(WidgetTester tester, {Map<String, dynamic>? item}) async {
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
                onPressed: () => showModalBottomSheet(
                  context: ctx,
                  isScrollControlled: true,
                  builder: (_) => UnifiedEntryModal(initialItem: item),
                ),
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

  testWidgets('a refund links to a recorded spend and is saved as a negative spend', (tester) async {
    final budget = await pumpSheet(tester);
    await tester.tap(find.text('Credit / Refund'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('refund-for')));
    await tester.pumpAndSettle();
    // Only recorded spends: not income, planned bills or other refunds
    expect(find.textContaining('Shoes · '), findsWidgets);
    expect(find.textContaining('Salary · '), findsNothing);
    expect(find.textContaining('Rent · '), findsNothing);
    expect(find.textContaining('Shoe refund · '), findsNothing);
    await tester.tap(find.textContaining('Shoes · ').last);
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Amount (₹) *'), '1500');
    await tester.ensureVisible(find.text('Add Spend'));
    await tester.tap(find.text('Add Spend'));
    await tester.pumpAndSettle();

    expect(budget.created, hasLength(1));
    final tx = budget.created.single;
    expect(tx['amount'], -150000);
    expect(tx['isIncome'], false);
    expect(tx['isRefund'], true);
    expect(tx['refundTargetTransactionId'], 't1');
    expect(tx['category'], 'Health');
    expect(tx['walletId'], 'w1');
    expect(tx['description'], 'Refund: Shoes');
  });

  testWidgets('editing a refund shows its link read-only', (tester) async {
    await pumpSheet(tester, item: {
      '_id': 'r1', 'title': 'Shoe refund', 'amount': -150000, 'date': '2026-11-16', 'category': 'Health',
      'accountId': 'w1', 'refundTargetTransactionId': 't1',
    });
    expect(find.byKey(const ValueKey('refund-link-readonly')), findsOneWidget);
    expect(find.textContaining('Refund for Shoes'), findsOneWidget);
    expect(find.byKey(const ValueKey('refund-for')), findsNothing);
  });
}
