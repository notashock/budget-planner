// Date rules (no spend in the future, no plan in the past) and the Move form's
// grouped rows, as on web.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/services/entry_memory.dart';
import 'entry_sheet_web_layout_test.dart' show pumpSheet, tapKey;

EntryCarry carry(DateTime date) => EntryCarry(
      amountText: '100', date: date, note: 'Lunch', accountType: 'bank', accountId: 'b1', category: 'Food',
    );

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    EntryMemory.resetForTest();
  });

  final now = DateTime.now();
  final tomorrow = DateTime(now.year, now.month, now.day + 1);
  final yesterday = DateTime(now.year, now.month, now.day - 1);

  testWidgets('a spend dated tomorrow is refused', (tester) async {
    final budget = await pumpSheet(tester, UnifiedEntryModal(initialType: EntryType.transaction, carry: carry(tomorrow)));
    await tapKey(tester, 'entry-primary');
    expect(find.text("A spend or income can't be dated in the future."), findsOneWidget);
    expect(budget.created, isEmpty);
  });

  testWidgets('a one-time plan dated yesterday is refused', (tester) async {
    final budget = await pumpSheet(tester, UnifiedEntryModal(initialType: EntryType.item, carry: carry(yesterday)));
    await tapKey(tester, 'entry-primary');
    expect(find.text("A planned payment can't be dated in the past."), findsOneWidget);
    expect(budget.created, isEmpty);
  });

  testWidgets('Move: Note, From and When rows; To with Invert', (tester) async {
    await pumpSheet(tester, const UnifiedEntryModal(initialType: EntryType.transfer));
    for (final k in ['entry-name', 'move-from', 'entry-date-chip', 'move-to', 'move-invert']) {
      expect(find.byKey(ValueKey(k)), findsOneWidget, reason: k);
    }
    expect(find.text("Moving money between your own accounts doesn't change your total cash."), findsOneWidget);
  });
}
