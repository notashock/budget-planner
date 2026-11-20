import 'json_read.dart';

enum AccountKind { bank, wallet, cash, creditCard }

/// A bank account, wallet, cash or credit card (all share /api/v1/accounts).
class Account {
  final String id;
  final String name;
  final AccountKind kind;
  final String? subtype;

  /// Today's balance in minor units; null when the server did not send one
  /// (an opening balance is never shown in its place). Negative on a card: owed.
  final int? currentBalance;
  final int openingBalance;
  final int minimumBalance;
  final bool isPrimary;
  final bool isArchived;
  final String? color;

  // Credit card only (ADR 0070).
  final int? creditLimit;
  final int? statementDay;
  final int? dueDay;
  final String? payFromAccountId;

  final Map<String, dynamic> raw;

  const Account({
    required this.id,
    required this.name,
    required this.kind,
    this.subtype,
    this.currentBalance,
    this.openingBalance = 0,
    this.minimumBalance = 0,
    this.isPrimary = false,
    this.isArchived = false,
    this.color,
    this.creditLimit,
    this.statementDay,
    this.dueDay,
    this.payFromAccountId,
    this.raw = const {},
  });

  static const _kinds = {
    'bank': AccountKind.bank,
    'wallet': AccountKind.wallet,
    'cash': AccountKind.cash,
    'credit_card': AccountKind.creditCard,
  };

  /// [fallbackKind] is for lists the server filtered by type (e.g. `?type=wallet`)
  /// whose rows predate the `type` column.
  factory Account.fromJson(Object? source, {AccountKind? fallbackKind}) {
    final r = JsonReader('Account', source);
    final rawKind = r.optString('type');
    final kind =
        _kinds[rawKind] ??
        fallbackKind ??
        (throw ModelParseException(
          'Account',
          'type',
          rawKind,
          'is not bank, wallet, cash or credit_card',
        ));
    return Account(
      id: r.string('id', aliases: ['_id']),
      name: r.optString('name') ?? '',
      kind: kind,
      subtype: r.optString('subtype'),
      currentBalance: r.optMoney('currentBalance'),
      openingBalance: r.optMoney('openingBalance') ?? 0,
      minimumBalance: r.optMoney('minimumBalance') ?? 0,
      isPrimary: r.flag('isPrimary'),
      isArchived: r.flag('isArchived'),
      color: r.optString('color'),
      creditLimit: r.optMoney('creditLimit'),
      statementDay: r.optInt('statementDay'),
      dueDay: r.optInt('dueDay'),
      payFromAccountId: r.optString('payFromAccountId'),
      raw: r.json,
    );
  }

  bool get isCard => kind == AccountKind.creditCard;

  /// Cash the user can spend: never a card (ADR 0070).
  bool get isLiquid => !isCard && !isArchived;
}

/// A card from /api/v1/cards: the account plus what is owed and this cycle.
class CreditCardSummary {
  final Account account;
  final int outstanding;
  final int? availableCredit;
  final double? utilization;
  final String? cycleStart;
  final String? cycleEnd;
  final String? cycleDueDate;

  const CreditCardSummary({
    required this.account,
    required this.outstanding,
    this.availableCredit,
    this.utilization,
    this.cycleStart,
    this.cycleEnd,
    this.cycleDueDate,
  });

  factory CreditCardSummary.fromJson(Object? source) {
    final r = JsonReader('CreditCardSummary', source);
    return CreditCardSummary(
      account: Account.fromJson(r.json, fallbackKind: AccountKind.creditCard),
      outstanding: r.money('outstanding'),
      availableCredit: r.optMoney('availableCredit'),
      utilization: r.optDouble('utilization'),
      cycleStart: r.optDate('cycleStart'),
      cycleEnd: r.optDate('cycleEnd'),
      cycleDueDate: r.optDate('cycleDueDate'),
    );
  }
}
