import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/engine/category_suggest.dart';
import 'package:budget_mobile/services/entry_memory.dart';
import 'package:budget_mobile/services/outbox.dart';

/// Budget data without a server; records what the sheet saves.
class FakeBudget extends BudgetProvider {
  final List<Map<String, dynamic>> saved = [];

  @override
  List<dynamic> get bankAccounts => [
        // The server always sends today's balance (currentBalance); the sheet never uses openingBalance as today's.
        {'_id': 'b1', 'name': 'Main Bank', 'isPrimary': true, 'openingBalance': 1000000, 'currentBalance': 1000000, 'minimumBalance': 200000},
      ];

  @override
  List<dynamic> get wallets => [
        {'_id': 'w1', 'name': 'Cash', 'openingBalance': 20000},
      ];

  @override
  List<dynamic> get creditCards => const [];

  @override
  Future<WriteResult> addTransaction(Map<String, dynamic> tx) async {
    saved.add(tx);
    return WriteResult.saved;
  }
}

Future<FakeBudget> pumpSheet(WidgetTester tester) async {
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
                  builder: (_) => const UnifiedEntryModal(),
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

Finder field(String label) => find.widgetWithText(TextField, label);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    EntryMemory.resetForTest();
  });

  group('category suggestion', () {
    test('keywords, then what was saved before for the same description', () {
      expect(suggestCategory('Uber to office'), 'Travel');
      expect(suggestCategory('Apollo pharmacy'), 'Health');
      expect(suggestCategory('Gift for Priya'), isNull);
      expect(suggestCategory('Gift for Priya', remembered: (_) => 'Other'), 'Other');
      expect(suggestCategory('Uber', allowed: const ['Food']), isNull);
    });
  });

  group('remembered defaults', () {
    test('accounts per mode and categories per description survive a reload', () async {
      final memory = await EntryMemory.load();
      await memory.rememberAccount('transaction', 'wallet', 'w1');
      await memory.rememberCategory('Metro card', 'Travel');
      EntryMemory.resetForTest();
      final again = await EntryMemory.load();
      expect(again.accountFor('transaction'), {'accountType': 'wallet', 'accountId': 'w1'});
      expect(again.accountFor('income'), isNull);
      expect(again.categoryFor('metro  card'), 'Travel');
    });
  });

  testWidgets('quick amounts set the value', (tester) async {
    await pumpSheet(tester);
    await tester.tap(find.text('500'));
    await tester.pump();
    await tester.tap(find.text('1k'));
    await tester.pump();
    expect(find.widgetWithText(TextField, '1000'), findsOneWidget);
  });

  testWidgets('typing a description suggests the category', (tester) async {
    await pumpSheet(tester);
    await tester.enterText(field('Description'), 'Uber to office');
    await tester.pump();
    expect(find.text('Category · suggested'), findsOneWidget);
    final travel = tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Travel'));
    expect(travel.selected, isTrue);
  });

  testWidgets('Save & add another keeps the sheet open, clears the amount and counts', (tester) async {
    final budget = await pumpSheet(tester);
    await tester.enterText(field('Amount (₹) *'), '250');
    await tester.enterText(field('Description'), 'Coffee');
    await tester.ensureVisible(find.byKey(const ValueKey('save-add-another')));
    await tester.tap(find.byKey(const ValueKey('save-add-another')));
    await tester.pumpAndSettle();

    expect(budget.saved, hasLength(1));
    expect(budget.saved.first['amount'], 25000);
    expect(budget.saved.first['description'], 'Coffee');
    expect(find.byType(UnifiedEntryModal), findsOneWidget);
    expect(find.textContaining('1 added · ₹250'), findsOneWidget);
    expect(find.widgetWithText(TextField, '250'), findsNothing);

    final memory = await EntryMemory.load();
    expect(memory.accountFor('transaction')?['accountId'], 'b1');
    expect(memory.categoryFor('coffee'), 'Food');
  });

  testWidgets('closing a half-filled entry asks first', (tester) async {
    await pumpSheet(tester);
    await tester.enterText(field('Amount (₹) *'), '45');
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    expect(find.text('Discard this entry?'), findsOneWidget);
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.byType(UnifiedEntryModal), findsOneWidget);

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();
    expect(find.byType(UnifiedEntryModal), findsNothing);
  });

  testWidgets('shows the balance after a spend', (tester) async {
    await pumpSheet(tester);
    await tester.enterText(field('Amount (₹) *'), '1000');
    await tester.pump();
    expect(find.byKey(const ValueKey('consequence-line')), findsOneWidget);
    expect(find.textContaining('above floor'), findsOneWidget);
  });
}
