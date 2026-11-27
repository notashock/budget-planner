import 'package:budget_mobile/modals/held_lent_modal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/widgets/account_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fake_font_http.dart';
import 'helpers/fixture_budget.dart';

/// The Move tab's "A person" form laid out like web's HeldLentForm.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  useFakeFontHttp();

  const main = '00000000-0000-4000-8000-000000000003';
  const upi = '00000000-0000-4000-8000-000000000010';

  Future<void> pumpForm(WidgetTester tester, BudgetProvider budget, {String action = 'lend', String? account}) async {
    tester.view.physicalSize = const Size(1080, 2600);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: budget,
      child: MaterialApp(
        home: Scaffold(body: SingleChildScrollView(child: HeldLentForm(initialAction: action, initialAccountId: account))),
      ),
    ));
    for (var i = 0; i < 4; i++) {
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    }
    await tester.pump();
  }

  String selectedAccount(WidgetTester tester) => tester.widget<AccountSelector>(find.byType(AccountSelector)).selectedAccountId!;

  testWidgets('four actions in one segmented track; amount and date share a row; pay-back date is optional', (tester) async {
    final budget = (await tester.runAsync(FixtureBudget().load))!;
    await pumpForm(tester, budget);

    final segments = [for (final k in ['hold', 'return', 'lend', 'repaid']) tester.getRect(find.byKey(ValueKey('hl-action-$k')))];
    for (final r in segments.skip(1)) {
      expect((r.top - segments.first.top).abs(), lessThan(1), reason: 'one row');
      expect((r.width - segments.first.width).abs(), lessThan(1), reason: 'equal widths');
    }
    expect(tester.getRect(find.byKey(const ValueKey('hl-amount'))).top,
        closeTo(tester.getRect(find.byKey(const ValueKey('hl-date'))).top, 1));
    expect(find.text("They'll pay back by (optional)"), findsOneWidget);
    expect(find.text('No date'), findsOneWidget);
    expect(find.text('Lend'), findsWidgets);
  });

  testWidgets('Got back defaults to the account the lent money left', (tester) async {
    final budget = (await tester.runAsync(FixtureBudget().load))!;
    await pumpForm(tester, budget, action: 'repaid', account: main);

    expect(find.textContaining('Asha'), findsWidgets);
    expect(selectedAccount(tester), upi, reason: "Asha's loan left UPI");
    expect(find.byKey(const ValueKey('hl-account-mismatch')), findsNothing);
  });
}
