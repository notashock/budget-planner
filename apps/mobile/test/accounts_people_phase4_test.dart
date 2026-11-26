import 'dart:convert';

import 'package:budget_mobile/modals/edit_account_modal.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/screens/plan_screen.dart';
import 'package:budget_mobile/widgets/cards_section.dart';
import 'package:budget_mobile/widgets/held_lent_section.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fake_font_http.dart';
import 'helpers/fixture_budget.dart';

// Phase 4 of the web parity plan: every account-page action web offers exists on the phone.
void main() {
  setUpAll(useFakeFontHttp);

  Future<void> pump(WidgetTester tester, BudgetProvider budget, Widget child, {bool wide = false}) async {
    tester.view.physicalSize = Size(wide ? 2400 : 1080, 4000);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: budget,
      // A whole screen brings its own Scaffold; a section or sheet gets one here
      child: MaterialApp(home: child is PlanScreen ? child : Scaffold(body: SingleChildScrollView(child: child))),
    ));
    await tester.pump();
  }

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 6; i++) {
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    }
    await tester.pumpAndSettle();
  }

  const ravi = '00000000-0000-4000-8000-000000000015';
  const entryId = 'e-ravi-1';
  void raviEntries(Map<String, dynamic> f) => f['/api/v1/person-funds/$ravi'] = {
        'id': ravi,
        'entries': [
          {'id': entryId, 'origin': 'held_in', 'name': 'Ravi', 'amount': 200000, 'date': '2026-11-19', 'status': 'successful'},
        ],
      };

  group('People', () {
    testWidgets('an open person lists their entries, with Edit details and Delete person in the menu', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(() => fb.load(edit: raviEntries)))!;
      await pump(tester, budget, const HeldLentSection());
      await settle(tester);

      await tester.tap(find.text('Ravi'));
      await settle(tester);
      expect(find.byKey(const ValueKey('hl-entry-$entryId')), findsOneWidget);
      expect(find.text('Received to hold'), findsOneWidget);
      expect(find.text('+₹2,000'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('person-menu-$ravi')));
      await tester.pumpAndSettle();
      expect(find.text('Delete person'), findsOneWidget);
      await tester.tap(find.text('Edit details'));
      await tester.pumpAndSettle();
      expect(find.text('Edit Ravi'), findsOneWidget);
      expect(find.text('Give back by'), findsOneWidget, reason: 'money held is given back, as web words it');
      await tester.enterText(find.byKey(const ValueKey('hl-edit-note')), 'Rent share');
      await tester.tap(find.byKey(const ValueKey('hl-save')));
      await settle(tester);

      final patch = fb.requests.lastWhere((r) => r.method == 'PATCH');
      expect(patch.url.path, '/api/v1/person-funds/$ravi');
      expect(jsonDecode(patch.body), {'personName': 'Ravi', 'note': 'Rent share', 'expectedSettleDate': null});
    });

    testWidgets('deleting a person asks first and deletes their entries with them', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(() => fb.load(edit: raviEntries)))!;
      await pump(tester, budget, const HeldLentSection());
      await settle(tester);
      await tester.tap(find.text('Ravi'));
      await settle(tester);

      await tester.tap(find.byKey(const ValueKey('person-menu-$ravi')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete person'));
      await tester.pumpAndSettle();
      expect(find.text('Delete Ravi?'), findsOneWidget);
      expect(find.textContaining('Their entries are deleted too'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(fb.writes, isEmpty);

      await tester.tap(find.byKey(const ValueKey('person-menu-$ravi')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete person'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await settle(tester);
      final del = fb.requests.lastWhere((r) => r.method == 'DELETE');
      expect(del.url.path, '/api/v1/person-funds/$ravi');
      expect(del.url.queryParameters['withEntries'], 'true');
    });

    testWidgets('an entry edits its amount and keeps its direction', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(() => fb.load(edit: raviEntries)))!;
      await pump(tester, budget, const HeldLentSection());
      await settle(tester);
      await tester.tap(find.text('Ravi'));
      await settle(tester);

      await tester.tap(find.byKey(const ValueKey('hl-entry-menu-$entryId')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit'));
      await tester.pumpAndSettle();
      expect(find.text('Edit “Received to hold”'), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('hl-entry-amount')), '1500');
      await tester.tap(find.byKey(const ValueKey('hl-save')));
      await settle(tester);
      final patch = fb.requests.lastWhere((r) => r.method == 'PATCH');
      expect(patch.url.path, '/api/v1/transactions/$entryId');
      expect(jsonDecode(patch.body), {'amount': 150000, 'date': '2026-11-19'});
    });
  });

  group('account form', () {
    testWidgets('adding a wallet offers web\'s wallet types and sends the one picked', (tester) async {
      final fb = FixtureBudget();
      final budget = (await tester.runAsync(fb.load))!;
      await pump(tester, budget, const EditAccountModal(isBank: false));

      expect(find.text('Add Wallet'), findsOneWidget);
      expect(find.text('Set as primary wallet (pre-selected in entries)'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('account-type-select')));
      await tester.pumpAndSettle();
      expect(find.text('Digital Wallet'), findsWidgets);
      await tester.tap(find.text('Digital Wallet').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('add-account-name')), 'Paytm');
      await tester.tap(find.text('Create Wallet'));
      await settle(tester);

      final post = fb.requests.lastWhere((r) => r.method == 'POST');
      final body = jsonDecode(post.body) as Map;
      expect(body['walletType'], 'digital');
      expect(body['name'], 'Paytm');
      expect(body['isPrimary'], isFalse, reason: 'the user already has a wallet');
    });

    testWidgets('a bank account has web\'s fields in web\'s order', (tester) async {
      final budget = (await tester.runAsync(FixtureBudget().load))!;
      await pump(tester, budget, const EditAccountModal(isBank: true));
      final labels = [
        'Account Name *', 'Financial Institution', 'Account Type', 'Masked Number', 'Opening Balance (₹)', 'Min Balance (₹)',
      ];
      final ys = [for (final l in labels) tester.getTopLeft(find.text(l)).dy];
      for (var i = 1; i < ys.length; i++) {
        expect(ys[i], greaterThanOrEqualTo(ys[i - 1]), reason: '${labels[i]} after ${labels[i - 1]}');
      }
      expect(find.text('Checking'), findsOneWidget, reason: 'a new bank starts as Checking, as on web');
      expect(find.text('Create Account'), findsOneWidget);
    });
  });

  testWidgets('Transfer from an account page starts from that account', (tester) async {
    final budget = (await tester.runAsync(FixtureBudget().load))!;
    const upi = '00000000-0000-4000-8000-000000000010';
    await pump(tester, budget, const UnifiedEntryModal(initialType: EntryType.transfer, initialSourceAccountId: upi));
    // The transfer form's "From" row (phase 1 layout) names the source account.
    expect(find.descendant(of: find.byKey(const ValueKey('move-from')), matching: find.text('UPI')), findsOneWidget);
  });

  testWidgets('Confirm & pay confirms the bill, then opens Pay on it', (tester) async {
    final fb = FixtureBudget();
    final budget = (await tester.runAsync(fb.load))!;
    // After the confirm the server returns the bill as open, not draft
    fb.onWrite = (req) async {
      final amex = (fb.fixtures['cards'] as List).firstWhere((c) => c['name'] == 'Amex') as Map;
      (amex['openBill'] as Map)['isDraft'] = false;
      return okJson(<String, dynamic>{});
    };
    await pump(tester, budget, const CardsSection());
    await settle(tester);
    await tester.tap(find.text('Amex'));
    await tester.pump();
    final amexId = ((fb.fixtures['cards'] as List).firstWhere((c) => c['name'] == 'Amex') as Map)['id'];
    await tester.tap(find.byKey(ValueKey('card-bill-action-$amexId')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Bill for '), findsOneWidget);
    expect(find.byKey(const ValueKey('bill-difference')), findsOneWidget);
    expect(find.text('Due date'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('confirm-and-pay')));
    await settle(tester);

    expect(fb.writes.single, endsWith('/confirm'));
    expect(find.text('Pay Amex bill'), findsOneWidget);
  });

  testWidgets('a user with no accounts sees Move my balance, and it creates the bank in one step', (tester) async {
    final fb = FixtureBudget();
    final budget = (await tester.runAsync(() => fb.load(edit: (f) {
          f['accounts_bank'] = [];
          f['accounts_wallet'] = [];
          f['/api/v1/accounts/migration-status'] = {
            'eligible': true,
            'stats': {'itemCount': 4, 'transactionCount': 9, 'currentOpeningBalance': 500000, 'currentIncomeAmount': 8000000},
          };
        })))!;
    await pump(tester, budget, const PlanScreen(), wide: true);
    await settle(tester);

    expect(find.byKey(const ValueKey('move-balance-banner')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('move-balance-open')));
    await tester.pumpAndSettle();
    expect(find.text('Move your balance into an account'), findsOneWidget);
    expect(find.text('4 items'), findsOneWidget);
    expect(find.text('9 records'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('migration-submit')));
    await tester.pump();
    expect(find.text('Please provide an account name and financial institution.'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('migration-bank-inst')), 'HDFC Bank');
    await tester.tap(find.byKey(const ValueKey('migration-submit')));
    await settle(tester);

    final post = fb.requests.lastWhere((r) => r.method == 'POST');
    expect(post.url.path, '/api/v1/accounts/migrate');
    expect(jsonDecode(post.body), {
      'name': 'Primary Checking', 'institution': 'HDFC Bank', 'accountType': 'checking', 'makePrimary': true, 'linkSalary': true,
    });
  });
}
