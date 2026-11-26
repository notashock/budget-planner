import 'dart:convert';

import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/services/storage_service.dart';
import 'package:budget_mobile/widgets/entry_summary_chips.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fixture_budget.dart';
import 'helpers/real_fonts.dart';

/// Upgrade plan 3.6 / entry-forms plan 5.1: date and account as one row of
/// chips in Spend, Income and Plan.
void main() {
  Future<(FixtureBudget, BudgetProvider)> openSheet(WidgetTester tester,
      {EntryType type = EntryType.transaction, double text = 1.0}) async {
    tester.view.devicePixelRatio = 2.75;
    tester.view.physicalSize = const Size(393 * 2.75, 852 * 2.75);
    addTearDown(tester.view.reset);
    final fb = FixtureBudget();
    late BudgetProvider budget;
    await tester.runAsync(() async {
      await loadAppFonts();
      budget = await fb.load(prefs: const {StorageService.keyUser: '{"id":"user-a"}'});
    });
    await tester.pumpWidget(ChangeNotifierProvider<BudgetProvider>.value(
      value: budget,
      child: MaterialApp(
        builder: (context, app) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(text)),
          child: app!,
        ),
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showModalBottomSheet<void>(
                  context: ctx,
                  isScrollControlled: true,
                  builder: (_) => UnifiedEntryModal(initialType: type),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pumpAndSettle();
    return (fb, budget);
  }

  testWidgets('Spend shows the default account and Today as grouped rows, account first (as on web)', (tester) async {
    await openSheet(tester);
    final date = find.byKey(const ValueKey('entry-date-chip'));
    final account = find.byKey(const ValueKey('entry-account-chip'));
    expect(find.descendant(of: date, matching: find.text('Today')), findsOneWidget);
    expect(find.descendant(of: account, matching: find.textContaining('Main')), findsOneWidget);
    expect(find.text('Paid from'), findsOneWidget);
    expect(find.text('When'), findsOneWidget);
    expect(tester.getRect(account).top, lessThan(tester.getRect(date).top));
  });

  testWidgets('choosing a wallet from the chip updates it, and the spend is saved to it', (tester) async {
    final (fb, _) = await openSheet(tester);
    await tester.tap(find.byKey(const ValueKey('entry-account-chip')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Wallet').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('entry-account-done')));
    await tester.pumpAndSettle();
    expect(
        find.descendant(of: find.byKey(const ValueKey('entry-account-chip')), matching: find.textContaining('UPI')),
        findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('entry-amount')), '120');
    await tester.pump();
    final save = find.byKey(const ValueKey('entry-primary'));
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    // The sheet closes at once and the write runs in the background (ADR 0071)
    bool posted() => fb.requests.any((r) => r.method == 'POST' && r.url.path.endsWith('/transactions'));
    for (var i = 0; i < 50 && !posted(); i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
      await tester.pump(const Duration(milliseconds: 10));
    }

    final post = fb.requests.lastWhere((r) => r.method == 'POST' && r.url.path.endsWith('/transactions'));
    final body = jsonDecode(post.body) as Map;
    expect(body['walletId'] ?? body['accountId'], isNotNull);
    expect(body['accountType'], 'wallet');
  });

  testWidgets('screen readers can activate both chips', (tester) async {
    final handle = tester.ensureSemantics();
    await openSheet(tester);
    for (final label in [RegExp(r'^When: '), RegExp(r'^Paid from: ')]) {
      final node = tester.getSemantics(find.bySemanticsLabel(label));
      expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue, reason: '$label');
    }
    handle.dispose();
  });

  testWidgets('a recurring plan has no date chip (it has a day of the month)', (tester) async {
    await openSheet(tester, type: EntryType.item);
    expect(find.byKey(const ValueKey('entry-date-chip')), findsOneWidget);
    await tester.tap(find.text('Recurring'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('entry-date-chip')), findsNothing);
    expect(find.byKey(const ValueKey('entry-account-chip')), findsOneWidget);
  });

  testWidgets('the chips fit at 200 % text (they wrap and ellipsize)', (tester) async {
    await openSheet(tester, text: 2.0);
    expect(tester.takeException(), isNull);
  });

  test('date chip words', () {
    final now = DateTime(2026, 11, 20, 10);
    expect(EntrySummaryChips.dateLabel(DateTime(2026, 11, 20), now: now), 'Today');
    expect(EntrySummaryChips.dateLabel(DateTime(2026, 11, 19), now: now), 'Yesterday');
    expect(EntrySummaryChips.dateLabel(DateTime(2026, 11, 14), now: now), 'Sat, 14 Nov');
  });
}
