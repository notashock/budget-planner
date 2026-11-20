import 'dart:convert';

import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/screens/transactions_screen.dart';
import 'package:budget_mobile/services/storage_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fixture_budget.dart';

/// Upgrade plan 3.7: swipe a planned row right to mark it paid (sent only
/// after the Undo window), swipe a row left to edit it.
void main() {
  Future<(FixtureBudget, BudgetProvider)> pump(WidgetTester tester) async {
    tester.view.devicePixelRatio = 2.75;
    tester.view.physicalSize = const Size(393 * 2.75, 852 * 2.75);
    addTearDown(tester.view.reset);
    final fb = FixtureBudget();
    late BudgetProvider budget;
    await tester.runAsync(() async {
      budget = await fb.load(prefs: const {StorageService.keyUser: '{"id":"user-a"}'});
    });
    await tester.pumpWidget(ChangeNotifierProvider<BudgetProvider>.value(
      value: budget,
      child: const MaterialApp(home: Scaffold(body: TransactionsScreen())),
    ));
    await tester.pump();
    return (fb, budget);
  }

  Future<void> openPlanned(WidgetTester tester) async {
    await tester.tap(find.textContaining('Planned ('));
    await tester.pumpAndSettle();
  }

  List<String> pays(FixtureBudget fb) =>
      [for (final r in fb.requests) if (r.method == 'POST' && r.url.path.endsWith('/pay')) r.body];

  testWidgets('swipe right marks a planned bill paid after the Undo window', (tester) async {
    final (fb, budget) = await pump(tester);
    final rent = budget.transactionModels.firstWhere((t) => t.name == 'Rent');
    await openPlanned(tester);

    await tester.drag(find.text('Rent'), const Offset(300, 0));
    await tester.pumpAndSettle();
    expect(find.text('Marked “Rent” paid'), findsOneWidget);
    expect(find.text('Rent'), findsNothing, reason: 'hidden while it can be undone');
    expect(pays(fb), isEmpty, reason: 'nothing is sent before the Undo window ends');

    await tester.pump(const Duration(seconds: 5)); // snackbar times out
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();

    final body = jsonDecode(pays(fb).single) as Map;
    expect(body['amount'], rent.displayAmount);
    expect(body['accountId'], rent.accountId, reason: 'paid from the account it was planned on');
  });

  testWidgets('Undo sends nothing and brings the row back', (tester) async {
    final (fb, _) = await pump(tester);
    await openPlanned(tester);

    await tester.drag(find.text('Rent'), const Offset(300, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();

    expect(pays(fb), isEmpty);
    expect(find.text('Rent'), findsOneWidget);
  });

  testWidgets('swipe left opens the entry sheet to edit the row', (tester) async {
    await pump(tester);
    await tester.drag(find.text('Groceries'), const Offset(-300, 0));
    await tester.pumpAndSettle();
    final sheet = tester.widget<UnifiedEntryModal>(find.byType(UnifiedEntryModal));
    expect(sheet.initialTransaction?.name, 'Groceries');
  });

  testWidgets('a transfer is not offered for editing (deleted and logged again)', (tester) async {
    await pump(tester);
    await tester.drag(find.text('Inter-Account Transfer'), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(find.byType(UnifiedEntryModal), findsNothing);
  });

  testWidgets('screen readers get the swipe actions as actions', (tester) async {
    final handle = tester.ensureSemantics();
    await pump(tester);
    await openPlanned(tester);
    final node = tester.getSemantics(find.text('Rent'));
    final actions = <String>{};
    void collect(SemanticsNode? n) {
      while (n != null) {
        for (final id in n.getSemanticsData().customSemanticsActionIds ?? <int>[]) {
          actions.add(CustomSemanticsAction.getAction(id)!.label!);
        }
        n = n.parent;
      }
    }

    collect(node);
    expect(actions, containsAll(['Mark paid', 'Edit']));
    handle.dispose();
  });
}
