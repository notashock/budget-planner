import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/services/storage_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart' as widgets show debugOnRebuildDirtyWidget;
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fixture_budget.dart';

/// Upgrade plan 2.3 (P6): the entry sheet is a 1,500-line widget, so what
/// rebuilds it matters. Typing must not, and neither must save progress or the
/// sync strip; new month data must.
void main() {
  testWidgets('typing and save progress do not rebuild the sheet; new data does', (tester) async {
    tester.view.physicalSize = const Size(1080, 2600);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    final fb = FixtureBudget();
    late BudgetProvider budget;
    await tester.runAsync(() async {
      budget = await fb.load(prefs: const {StorageService.keyUser: '{"id":"user-a"}'});
    });

    await tester.pumpWidget(ChangeNotifierProvider<BudgetProvider>.value(
      value: budget,
      child: MaterialApp(
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showModalBottomSheet<void>(
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
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    var sheetBuilds = 0;
    widgets.debugOnRebuildDirtyWidget = (element, _) {
      if (element.widget is UnifiedEntryModal) sheetBuilds++;
    };
    addTearDown(() => widgets.debugOnRebuildDirtyWidget = null);

    // Typing an amount and a description
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(1), '1');
    await tester.pump();
    await tester.enterText(fields.at(1), '12');
    await tester.pump();
    await tester.enterText(fields.at(1), '120');
    await tester.pump();
    expect(sheetBuilds, 0, reason: 'a keystroke must not rebuild the whole sheet');

    // Save progress and the sync strip: an entry kept offline notifies, but
    // the month on screen is the same
    fb.offline = true;
    await tester.runAsync(() => budget.addTransaction({'description': 'Tea', 'amount': 2000}));
    await tester.pump();
    expect(budget.pendingEntries, hasLength(1));
    expect(sheetBuilds, 0, reason: 'save progress must not rebuild the sheet');

    // New month data does
    fb.offline = false;
    await tester.runAsync(() => budget.refresh());
    await tester.pump();
    expect(sheetBuilds, greaterThan(0));
  });
}
