import 'package:flutter_test/flutter_test.dart';
import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/widgets/floor_breach_notice.dart';

void main() {
  group('B7: entry names never fall back to "Entry"', () {
    test('uses what the user typed', () {
      expect(resolveEntryName('  Groceries ', 'Food', 'Actual Spend'), 'Groceries');
    });
    test('falls back to the category, like web', () {
      expect(resolveEntryName('', 'Travel', 'Actual Spend'), 'Travel');
    });
    test('falls back to the entry type when there is no category', () {
      expect(resolveEntryName('', ' ', 'Transfer'), 'Transfer');
    });
  });

  group('B8: safety-floor check', () {
    final bank = {'_id': 'b1', 'name': 'Main', 'openingBalance': 1000000, 'minimumBalance': 500000};

    test('flags an outflow that crosses the floor', () {
      expect(checkFloor(bank, 400000)!.breaches, isFalse);
      final c = checkFloor(bank, 600000)!;
      expect(c.breaches, isTrue);
      expect(c.balanceAfter, 400000);
    });

    test('prefers the simulated balance and leaves out held money', () {
      final c = checkFloor(bank, 200000, simulatedBalance: 900000, heldForOthers: 300000)!;
      expect(c.balanceAfter, 400000);
      expect(c.breaches, isTrue);
    });

    test('nothing to check without a floor, account or outflow', () {
      expect(checkFloor({'name': 'Cash', 'openingBalance': 100}, 50), isNull);
      expect(checkFloor(null, 50), isNull);
      expect(checkFloor(bank, 0), isNull);
    });
  });
}
