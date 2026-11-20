import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/modals/held_lent_modal.dart';

/// Budget data without a server.
class FakeBudget extends BudgetProvider {
  final List<dynamic> cards;
  FakeBudget({this.cards = const []});

  @override
  List<dynamic> get bankAccounts => [
        {'_id': 'b1', 'name': 'Main Bank', 'isPrimary': true, 'openingBalance': 1000000},
      ];

  @override
  List<dynamic> get wallets => [
        {'_id': 'w1', 'name': 'Cash', 'openingBalance': 20000},
      ];

  @override
  List<dynamic> get creditCards => cards;

  @override
  Future<Map<String, dynamic>> getPersonFunds() async => {'funds': [], 'totals': {'held': 0, 'lent': 0}};
}

Future<void> pumpSheet(WidgetTester tester, FakeBudget budget, {EntryType type = EntryType.transaction}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ChangeNotifierProvider<BudgetProvider>.value(
      value: budget,
      child: MaterialApp(home: Scaffold(body: UnifiedEntryModal(initialType: type))),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('four tabs: Spend, Income, Plan, Move (no Goal, no separate Held/Lent)', (tester) async {
    await pumpSheet(tester, FakeBudget());
    for (final label in ['Spend', 'Income', 'Plan', 'Move']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(find.text('Purchase Goal'), findsNothing);
    expect(find.text('Held / Lent'), findsNothing);
  });

  testWidgets('Move offers My accounts and A person; Pay a card only with cards', (tester) async {
    await pumpSheet(tester, FakeBudget(), type: EntryType.transfer);
    expect(find.text('My accounts'), findsOneWidget);
    expect(find.text('A person'), findsOneWidget);
    expect(find.text('Pay a card'), findsNothing);

    await pumpSheet(tester, FakeBudget(cards: [
      // openBill as the server sends it (test/fixtures/api/month_detail.json, simulation.cards)
      {'id': 'c1', 'name': 'Visa', 'outstanding': 500000, 'openBill': {'statementId': 's1', 'amount': 300000, 'remaining': 300000, 'minimumDue': 50000, 'dueDate': '2026-11-28'}},
    ]), type: EntryType.transfer);
    expect(find.text('Pay a card'), findsOneWidget);
  });

  testWidgets('Move > A person shows Held & Lent inside the same sheet, keeping the amount', (tester) async {
    await pumpSheet(tester, FakeBudget(), type: EntryType.transfer);
    await tester.enterText(find.byType(TextField).first, '750');
    await tester.tap(find.text('A person'));
    await tester.pumpAndSettle();
    expect(find.byType(HeldLentForm), findsOneWidget);
    expect(find.text('750'), findsOneWidget);
  });

  testWidgets('Move > Pay a card lists the cards and bill amounts', (tester) async {
    await pumpSheet(tester, FakeBudget(cards: [
      // openBill as the server sends it (test/fixtures/api/month_detail.json, simulation.cards)
      {'id': 'c1', 'name': 'Visa', 'outstanding': 500000, 'openBill': {'statementId': 's1', 'amount': 300000, 'remaining': 300000, 'minimumDue': 50000, 'dueDate': '2026-11-28'}},
    ]), type: EntryType.transfer);
    await tester.tap(find.text('Pay a card'));
    await tester.pumpAndSettle();
    expect(find.text('Visa'), findsOneWidget);
    expect(find.textContaining('Bill ₹3,000'), findsWidgets);
    expect(find.text('Pay Visa'), findsOneWidget);
  });

  testWidgets('opened from Goals: the goal form without the tabs', (tester) async {
    await pumpSheet(tester, FakeBudget(), type: EntryType.goal);
    expect(find.text('New purchase goal'), findsOneWidget);
    expect(find.text('Move'), findsNothing);
  });
}
