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
  FakeBudget({this.extra = const []});
  final List<Map<String, dynamic>> extra;
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
        ...extra,
      ];

  @override
  Future<Map<String, dynamic>> getPersonFunds() async => {'funds': []};

  @override
  Future<WriteResult> addTransaction(Map<String, dynamic> tx) async {
    created.add(tx);
    return WriteResult.saved;
  }
}

Future<FakeBudget> pumpSheet(WidgetTester tester, {Map<String, dynamic>? item, List<Map<String, dynamic>> extra = const []}) async {
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final budget = FakeBudget(extra: extra);
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
                  // Editing opens on a recorded transaction (status: successful).
                  builder: (_) => UnifiedEntryModal(
                    initialTransaction: item == null ? null : Transaction.fromJson({'status': 'successful', ...item}),
                  ),
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
    await tester.tap(find.byKey(const ValueKey('entry-refund-toggle')));
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

    await tester.enterText(find.byKey(const ValueKey('entry-amount')), '1500');
    await tester.ensureVisible(find.byKey(const ValueKey('entry-primary')));
    await tester.tap(find.byKey(const ValueKey('entry-primary')));
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

  group('several refunds on one spend use what is left, not the original amount', () {
    // Shoes: 4,500 paid, 1,500 already refunded by r1
    const r2 = {'_id': 'r2', 'title': 'Shoe refund 2', 'amount': -200000, 'status': 'successful', 'origin': 'spot', 'refundTargetTransactionId': 't1', 'date': '2026-11-17'};

    Future<void> pickShoes(WidgetTester tester) async {
      await tester.tap(find.byKey(const ValueKey('entry-refund-toggle')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('refund-for')));
      await tester.pumpAndSettle();
    }

    testWidgets('the remaining amount goes down with each linked refund', (tester) async {
      await pumpSheet(tester);
      await pickShoes(tester);
      expect(find.textContaining('Shoes · ₹3,000.00 left of ₹4,500.00'), findsWidgets);
    });

    testWidgets('after a second refund only 1,000 is left', (tester) async {
      await pumpSheet(tester, extra: [r2]);
      await pickShoes(tester);
      expect(find.textContaining('Shoes · ₹1,000.00 left of ₹4,500.00'), findsWidgets);
    });

    testWidgets('refunds cannot add up to more than the spend', (tester) async {
      final budget = await pumpSheet(tester, extra: [r2]);
      await pickShoes(tester);
      await tester.tap(find.textContaining('Shoes · ').last);
      await tester.pumpAndSettle();
      // 1,500 fits the original 4,500 but not the 1,000 left
      await tester.enterText(find.byKey(const ValueKey('entry-amount')), '1500');
      await tester.ensureVisible(find.byKey(const ValueKey('entry-primary')));
      await tester.tap(find.byKey(const ValueKey('entry-primary')));
      await tester.pumpAndSettle();
      expect(budget.created, isEmpty);
      expect(find.text('Only ₹1,000.00 of Shoes is left to refund.'), findsOneWidget);

      await tester.enterText(find.byKey(const ValueKey('entry-amount')), '1000');
      await tester.ensureVisible(find.byKey(const ValueKey('entry-primary')));
      await tester.tap(find.byKey(const ValueKey('entry-primary')));
      await tester.pumpAndSettle();
      expect(budget.created, hasLength(1));
      expect(budget.created.single['amount'], -100000);
    });

    testWidgets('a fully refunded spend is no longer offered', (tester) async {
      await pumpSheet(tester, extra: [
        {...r2, 'amount': -300000},
        {'_id': 't2', 'title': 'Tea', 'amount': 2000, 'status': 'successful', 'origin': 'spot', 'date': '2026-11-15'},
      ]);
      await pickShoes(tester);
      expect(find.textContaining('Tea · '), findsWidgets);
      expect(find.textContaining('Shoes · '), findsNothing);
    });
  });
}
