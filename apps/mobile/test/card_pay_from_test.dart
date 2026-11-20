import 'package:budget_mobile/models/account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:budget_mobile/modals/card_modals.dart';

void main() {
  Account bank(Map<String, dynamic> j) => Account.fromJson(j, fallbackKind: AccountKind.bank);
  final banks = [
    bank({'_id': 'b1', 'name': 'Main', 'isPrimary': true}),
    bank({'_id': 'b2', 'name': 'Second'}),
  ];
  final wallets = [
    Account.fromJson({'_id': 'w1', 'name': 'Cash'}, fallbackKind: AccountKind.wallet),
  ];

  group('payFromAccountType', () {
    test('a wallet id opens the wallet list', () {
      expect(payFromAccountType('w1', banks, wallets), 'wallet');
    });
    test('a bank id opens the bank list', () {
      expect(payFromAccountType('b2', banks, wallets), 'bank');
    });
    test('no id: wallet only when there are no banks', () {
      expect(payFromAccountType(null, const [], wallets), 'wallet');
      expect(payFromAccountType(null, banks, wallets), 'bank');
    });
  });

  group('defaultPayFromAccountId', () {
    test('prefers the primary bank', () {
      expect(defaultPayFromAccountId(banks, wallets), 'b1');
    });
    test('falls back to the first wallet when there are no banks', () {
      expect(defaultPayFromAccountId(const [], wallets), 'w1');
    });
    test('null when there are no accounts', () {
      expect(defaultPayFromAccountId(const [], const []), isNull);
    });
  });
}
