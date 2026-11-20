import 'dart:convert';
import 'dart:io';

import 'package:budget_mobile/models/account.dart';
import 'package:budget_mobile/models/goal.dart';
import 'package:budget_mobile/models/json_read.dart';
import 'package:budget_mobile/models/month_detail.dart';
import 'package:budget_mobile/models/person_fund.dart';
import 'package:budget_mobile/models/simulation.dart';
import 'package:budget_mobile/models/transaction.dart';
import 'package:budget_mobile/models/transaction_lists.dart';
import 'package:budget_mobile/models/transfer.dart';
import 'package:flutter_test/flutter_test.dart';

/// The typed models against responses recorded from the real server
/// (upgrade plan 1.1 and 1.10). Re-record with
/// `RECORD_MOBILE_FIXTURES=1 npx vitest run test/mobile_contract_fixtures.test.js`
/// in apps/server; that test also fails CI if the server drops a field these use.
dynamic fixture(String name) => jsonDecode(File('test/fixtures/api/$name.json').readAsStringSync());

void main() {
  group('recorded fixtures parse', () {
    test('month detail: month, every transaction, accounts and the simulation', () {
      final raw = fixture('month_detail') as Map<String, dynamic>;
      final detail = MonthDetail.fromJson(raw);

      expect(detail.month.safetyFloor, 500000);
      expect(detail.month.currencySymbol, isNotEmpty);
      expect(detail.transactions, hasLength(8));
      expect(detail.bankAccounts.single.kind, AccountKind.bank);
      expect(detail.wallets.single.kind, AccountKind.wallet);
      expect(() => SimulationResult.fromJson(Map<String, dynamic>.from(raw['simulation'] as Map)), returnsNormally);
    });

    test('accounts, cards, goals, person funds, transfers and periods', () {
      final bank = (fixture('accounts_bank') as List).map((a) => Account.fromJson(a)).single;
      final wallet = (fixture('accounts_wallet') as List).map((a) => Account.fromJson(a)).single;
      final cards = (fixture('cards') as List).map(CreditCardSummary.fromJson).toList();
      final card = cards.firstWhere((c) => c.account.name == 'Visa');
      final goal = (fixture('goals') as List).map(Goal.fromJson).single;
      final funds = PersonFunds.fromJson(fixture('person_funds'));

      expect(bank.isPrimary, isTrue);
      expect(bank.currentBalance, isNotNull);
      expect(wallet.kind, AccountKind.wallet);
      expect(card.account.isCard, isTrue);
      expect(card.account.isLiquid, isFalse);
      expect(card.account.currentBalance, -card.outstanding);
      expect(card.account.creditLimit, 10000000);
      expect(goal.status, GoalStatus.logged);
      expect(goal.targetAmount, 800000);
      final held = funds.funds.firstWhere((f) => f.direction == FundDirection.held);
      final lent = funds.funds.firstWhere((f) => f.direction == FundDirection.lent);
      expect(funds.totalHeld, held.outstanding);
      expect(funds.totalLent, lent.outstanding);
      expect(fixture('transfers') as List, isNotEmpty);
      expect(fixture('periods') as List, isNotEmpty);
    });
  });

  group('transfers, goals and month header', () {
    test('a recorded transfer parses with both account ids and its day', () {
      final t = Transfer.fromJson((fixture('transfers') as List).single);
      expect(t.sourceAccountId, isNot(t.destinationAccountId));
      expect(t.amount, 100000);
      expect(t.day, int.parse(t.date.substring(8)));
    });

    test('goal statuses are the ones the server sets', () {
      Goal g(String status) => Goal.fromJson({'id': 'g', 'name': 'X', 'targetAmount': 100, 'status': status});
      expect(g('logged').status, GoalStatus.logged);
      expect(g('active').status, GoalStatus.active);
      expect(g('deferred').status, GoalStatus.deferred);
      expect(g('deferred').isDeferred, isTrue);
      expect(g('scheduled').canSchedule, isFalse);
      expect(g('something-new').status, GoalStatus.unknown);
    });

    test('a goal can be scheduled only when the engine found a safe day', () {
      final base = {'id': 'g', 'name': 'X', 'targetAmount': 100, 'status': 'active'};
      expect(Goal.fromJson(base).canSchedule, isFalse, reason: 'not evaluated');
      expect(Goal.fromJson({...base, 'recommendation': {'feasible': false}}).canSchedule, isFalse);
      expect(Goal.fromJson({...base, 'recommendation': {'feasible': true, 'recommendedDay': 3}}).canSchedule, isTrue);
    });

    test('the month header carries the salary day', () {
      final m = MonthDetail.fromJson(fixture('month_detail')).month;
      expect(m.incomeCreditDay, 1);
      expect(m.year, greaterThan(2000));
    });
  });

  group('transaction kinds from the recorded month', () {
    late Map<String, Transaction> byName;
    setUp(() {
      final txs = MonthDetail.fromJson(fixture('month_detail')).transactions;
      byName = {for (final t in txs) t.name: t};
    });

    test('each recorded transaction is exactly one kind', () {
      expect(byName['Freelance']!.kind, TxKind.income);
      expect(byName['Groceries']!.kind, TxKind.expense);
      expect(byName['Coffee']!.kind, TxKind.expense);
      expect(byName['Shoes']!.kind, TxKind.expense, reason: 'a card swipe is spending');
      expect(byName['Inter-Account Transfer']!.kind, TxKind.transfer);
      expect(byName['Holding for Ravi']!.kind, TxKind.passThroughIn);
      expect(byName['Lent to Asha']!.kind, TxKind.passThroughOut);
      expect(byName['Rent']!.isPlanned, isTrue);
    });

    test('a transfer moves money and held money is never income', () {
      expect(byName['Inter-Account Transfer']!.flow, MoneyFlow.moved);
      expect(byName['Inter-Account Transfer']!.isSpending, isFalse);
      expect(byName['Holding for Ravi']!.flow, MoneyFlow.moneyIn);
      expect(byName['Holding for Ravi']!.kind, isNot(TxKind.income));
    });

    test('a planned bill is due on its planned date', () {
      final rent = byName['Rent']!;
      expect(rent.dueDate, rent.plannedDate);
      expect(rent.displayAmount, 2500000);
    });
  });

  group('lists and chip counts agree', () {
    late TransactionLists lists;
    setUp(() => lists = TransactionLists.from(MonthDetail.fromJson(fixture('month_detail')).transactions));

    test('Expenses holds only spending: no transfer, no held money', () {
      final names = lists.recordedWhere(RecordedFilter.expense).map((t) => t.name).toSet();
      expect(names, {'Groceries', 'Coffee', 'Shoes'});
    });

    test('Incomes holds only income', () {
      expect(lists.recordedWhere(RecordedFilter.income).map((t) => t.name), ['Freelance']);
    });

    test('recorded is newest first; planned is earliest due first', () {
      final dates = lists.recorded.map((t) => t.date).toList();
      expect(dates, [...dates]..sort((a, b) => b.compareTo(a)));
      expect(lists.planned.single.name, 'Rent');
      expect(lists.recordedWhere(RecordedFilter.all), hasLength(7));
    });
  });

  group('refunds', () {
    final refund = Transaction.fromJson({
      'id': 'r1', 'name': 'Shoe refund', 'amount': -150000, 'status': 'successful',
      'origin': 'spot', 'date': '2026-11-16', 'refundTargetTransactionId': 't1',
    });

    test('are spending that brings money in, shown without a double minus', () {
      expect(refund.kind, TxKind.refund);
      expect(refund.isSpending, isTrue);
      expect(refund.flow, MoneyFlow.moneyIn);
      expect(refund.displayAmount, 150000);
      expect(refund.sourceLabel, 'Refund');
    });
  });

  group('bad data fails loudly', () {
    Map<String, dynamic> tx([Map<String, dynamic> over = const {}]) => {
          'id': 't', 'name': 'X', 'amount': 100, 'status': 'successful', 'date': '2026-11-01', ...over,
        };

    test('missing or fractional amount', () {
      expect(() => Transaction.fromJson(tx()..remove('amount')), throwsA(isA<ModelParseException>()));
      expect(() => Transaction.fromJson(tx({'amount': 12.5})), throwsA(isA<ModelParseException>()));
      expect(() => Transaction.fromJson(tx({'amount': '100'})), throwsA(isA<ModelParseException>()));
    });

    test('unknown status or malformed date', () {
      expect(() => Transaction.fromJson(tx({'status': 'paid'})), throwsA(isA<ModelParseException>()));
      expect(() => Transaction.fromJson(tx({'date': '19/11/2026'})), throwsA(isA<ModelParseException>()));
    });

    test('an origin the app does not know yet is kept as "other", not an error', () {
      final t = Transaction.fromJson(tx({'origin': 'cashback'}));
      expect(t.origin, TxOrigin.other);
      expect(t.kind, TxKind.expense);
    });

    test('the message names the model and field', () {
      expect(
        () => Transaction.fromJson(tx({'amount': 12.5})),
        throwsA(isA<ModelParseException>().having((e) => e.message, 'message', contains('Transaction.amount'))),
      );
    });
  });
}
