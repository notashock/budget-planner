import 'dart:convert';

import 'package:budget_mobile/modals/transaction_detail_modal.dart';
import 'package:budget_mobile/models/transaction.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/widgets/cards_section.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fake_font_http.dart';
import 'helpers/fixture_budget.dart';

/// The detail sheet and the card bill flow on the recorded month (upgrade plan 1.1).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  useFakeFontHttp();

  Future<void> pump(WidgetTester tester, BudgetProvider budget, Widget child) async {
    tester.view.physicalSize = const Size(1080, 4000);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: budget,
      child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child))),
    ));
    await tester.pump();
  }

  /// Lets queued writes (fake clock) and mock HTTP (real clock) finish.
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 5; i++) {
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    }
    await tester.pump();
  }

  Transaction named(BudgetProvider b, String name) => b.transactionModels.firstWhere((t) => t.name == name);
  String kindText(WidgetTester tester) => tester
      .widgetList<Text>(find.descendant(of: find.byKey(const ValueKey('detail-kind')), matching: find.byType(Text)))
      .single
      .data!;
  String amountText(WidgetTester tester) => tester.widget<Text>(find.byKey(const ValueKey('detail-amount'))).data!;

  group('detail sheet', () {
    testWidgets('labels each kind by what it is, not "EXPENSE OUTFLOW" for everything', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(() => fb.load(edit: (f) {
            final txs = (f['month_detail'] as Map)['transactions'] as List;
            final groceries = txs.firstWhere((t) => t['name'] == 'Groceries') as Map;
            txs.add({...groceries, 'id': 'r1', '_id': 'r1', 'name': 'Groceries refund', 'amount': -50000,
                'refundTargetTransactionId': groceries['id']});
          })))!;

      final expected = {
        'Groceries': ('EXPENSE OUTFLOW', '-'),
        'Freelance': ('INCOME INFLOW', '+'),
        'Groceries refund': ('REFUND', '+'),
        'Inter-Account Transfer': ('INTER-ACCOUNT TRANSFER', '₹'),
        'Holding for Ravi': ('HELD / LENT MONEY IN', '+'),
        'Lent to Asha': ('HELD / LENT MONEY OUT', '-'),
      };
      for (final entry in expected.entries) {
        await pump(tester, budget, TransactionDetailModal(transaction: named(budget, entry.key)));
        expect(kindText(tester), entry.value.$1, reason: entry.key);
        expect(amountText(tester), startsWith(entry.value.$2), reason: entry.key);
      }
    });

    testWidgets('a card swipe names the card; a transfer names both accounts', (tester) async {
      final budget = (await tester.runAsync(FixtureBudget().load))!;

      await pump(tester, budget, TransactionDetailModal(transaction: named(budget, 'Shoes')));
      expect(find.text('Visa (Card)'), findsOneWidget);
      expect(find.text('All Accounts / Primary'), findsNothing);

      await pump(tester, budget, TransactionDetailModal(transaction: named(budget, 'Inter-Account Transfer')));
      expect(find.text('Main (Bank)'), findsOneWidget);
      expect(find.text('UPI (Wallet)'), findsOneWidget);
    });

    testWidgets('opened from the Plan timeline it offers the actions (events carry transactionId, not id)',
        (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      final events = budget.simulation!.allEvents;

      final groceries = events.firstWhere((e) => e.name == 'Groceries');
      expect(groceries.id, isEmpty, reason: 'the recorded event really has no id');
      await pump(tester, budget, TransactionDetailModal(timelineEvent: groceries));
      expect(find.byKey(const ValueKey('edit-transaction')), findsOneWidget);
      expect(find.byKey(const ValueKey('detail-remove')), findsOneWidget);
      expect(find.text('Running Balance'), findsOneWidget);

      // The planned salary has no transaction behind it: shown, but read-only.
      final salary = events.firstWhere((e) => e.name == 'Salary');
      await pump(tester, budget, TransactionDetailModal(timelineEvent: salary));
      expect(find.byKey(const ValueKey('edit-transaction')), findsNothing);
      expect(find.byKey(const ValueKey('detail-remove')), findsNothing);
    });

    testWidgets('a planned bill can be marked paid, and cancelling asks first', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      final rent = named(budget, 'Rent');
      await pump(tester, budget, TransactionDetailModal(transaction: rent));

      expect(find.byKey(const ValueKey('detail-mark-paid')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('detail-remove')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel commitment'));
      await settle(tester);
      expect(fb.writes, ['POST /api/v1/transactions/${rent.id}/cancel']);
    });

    testWidgets('a transfer from the Accounts list deletes the transfer', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      final transfer = budget.transferModels.single;
      await pump(tester, budget, TransactionDetailModal(transfer: transfer));

      expect(find.byKey(const ValueKey('edit-transaction')), findsNothing, reason: 'transfers are deleted and logged again');
      await tester.tap(find.byKey(const ValueKey('detail-remove')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await settle(tester);
      expect(fb.writes, ['DELETE /api/v1/transfers/${transfer.id}']);
    });
  });

  group('card bills', () {
    String cardId(FixtureBudget fb, String name) =>
        (fb.fixtures['cards'] as List).firstWhere((c) => c['name'] == name)['id'] as String;

    testWidgets('a new (draft) bill offers Confirm, opening at the worked-out amount, not ₹0', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      await pump(tester, budget, const CardsSection());
      await settle(tester);

      final amex = cardId(fb, 'Amex');
      final action = find.byKey(ValueKey('card-bill-action-$amex'));
      expect(find.descendant(of: action, matching: find.text('Confirm')), findsOneWidget);
      expect(find.textContaining('Bill ready: ₹12,000,'), findsOneWidget, reason: 'card figures are whole rupees (3.4)');
      expect(find.byKey(ValueKey('card-bill-action-${cardId(fb, 'Visa')}')), findsNothing, reason: 'Visa has no bill yet');

      await tester.tap(action);
      await tester.pumpAndSettle();
      expect(find.text('Confirm Amex bill'), findsOneWidget);
      expect(find.widgetWithText(TextField, '12000'), findsOneWidget);

      // Confirming unchanged sends the worked-out amount and logs no difference.
      await tester.tap(find.text('Confirm bill'));
      await settle(tester);
      final post = fb.requests.lastWhere((r) => r.method == 'POST');
      final statementId = ((fb.fixtures['cards'] as List).firstWhere((c) => c['name'] == 'Amex')['openBill'] as Map)['statementId'];
      expect(post.url.path, '/api/v1/cards/statements/$statementId/confirm');
      final body = jsonDecode(post.body) as Map;
      expect(body['statementAmount'], 1200000);
      expect(body['logChargesDifference'], isFalse);
    });

    testWidgets('a confirmed bill offers Pay bill with the remaining amount', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(() => fb.load(edit: (f) {
            final amex = (f['cards'] as List).firstWhere((c) => c['name'] == 'Amex') as Map;
            (amex['openBill'] as Map)['isDraft'] = false;
            (amex['openBill'] as Map)['remaining'] = 700000;
          })))!;
      await pump(tester, budget, const CardsSection());
      await settle(tester);

      final action = find.byKey(ValueKey('card-bill-action-${cardId(fb, 'Amex')}'));
      expect(find.descendant(of: action, matching: find.text('Pay bill')), findsOneWidget);
      await tester.tap(action);
      await tester.pumpAndSettle();
      expect(find.text('Full ₹7,000.00'), findsOneWidget);
    });
  });
}
