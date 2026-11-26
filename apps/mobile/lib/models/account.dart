import 'json_read.dart';

enum AccountKind { bank, wallet, cash, creditCard }

/// A bank account, wallet, cash or credit card (all share /api/v1/accounts).
class Account {
  final String id;
  final String name;
  final AccountKind kind;
  final String? subtype;

  /// Last digits the user gave for the account number (shown as •••• 1234).
  final String? accountNumberMasked;
  final String? institution;

  /// Wallets: 'digital', 'cash', ...
  final String? walletType;

  /// Cards: what is owed, when the server sends it (simulation and /cards rows).
  final int? outstanding;

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
    this.accountNumberMasked,
    this.institution,
    this.walletType,
    this.outstanding,
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
      accountNumberMasked: r.optString('accountNumberMasked'),
      institution: r.optString('institution'),
      walletType: r.optString('walletType'),
      outstanding: r.optMoney('outstanding'),
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

/// What is owed on a card: [outstanding] if sent, else minus its balance.
extension CardOwed on Account {
  int? get owed => outstanding ?? (currentBalance == null ? null : -currentBalance!);
}

/// The bill to act on now (`openBill` on a /cards row): a draft to confirm,
/// or a confirmed bill with something left to pay.
class CardBill {
  final String statementId;
  final int amount;
  final int remaining;
  final int? minimumDue;
  final String dueDate;
  final bool isDraft;
  final bool isOverdue;

  const CardBill({
    required this.statementId,
    required this.amount,
    required this.remaining,
    required this.dueDate,
    this.minimumDue,
    this.isDraft = false,
    this.isOverdue = false,
  });

  factory CardBill.fromJson(Object? source) {
    final r = JsonReader('CardBill', source);
    return CardBill(
      statementId: r.string('statementId'),
      amount: r.money('amount'),
      remaining: r.money('remaining'),
      minimumDue: r.optMoney('minimumDue'),
      dueDate: r.date('dueDate'),
      isDraft: r.flag('isDraft'),
      isOverdue: r.flag('isOverdue'),
    );
  }
}

enum StatementStatus { draft, open, paid, carried, unknown }

/// One generated card bill (card_statements).
class CardStatement {
  final String id;
  final String cycleStart;
  final String cycleEnd;
  final String dueDate;

  /// What the app worked out from the card's own entries.
  final int computedAmount;

  /// Net spend in this cycle (what the bill adds on top of anything carried).
  final int newSpend;

  /// What the user confirmed from the bank's statement, once confirmed.
  final int? statementAmount;
  final int? minimumDue;
  final StatementStatus status;

  const CardStatement({
    required this.id,
    required this.cycleStart,
    required this.cycleEnd,
    required this.dueDate,
    required this.computedAmount,
    required this.status,
    this.newSpend = 0,
    this.statementAmount,
    this.minimumDue,
  });

  static const _statuses = {
    'draft': StatementStatus.draft,
    'open': StatementStatus.open,
    'paid': StatementStatus.paid,
    'carried': StatementStatus.carried,
  };

  factory CardStatement.fromJson(Object? source) {
    final r = JsonReader('CardStatement', source);
    return CardStatement(
      id: r.string('id', aliases: ['_id']),
      cycleStart: r.date('cycleStart'),
      cycleEnd: r.date('cycleEnd'),
      dueDate: r.date('dueDate'),
      computedAmount: r.money('computedAmount'),
      newSpend: r.optMoney('newSpend') ?? 0,
      statementAmount: r.optMoney('statementAmount'),
      minimumDue: r.optMoney('minimumDue'),
      status: _statuses[r.optString('status')] ?? StatementStatus.unknown,
    );
  }

  /// The amount to start from when confirming: confirmed, else computed.
  int get billAmount => statementAmount ?? computedAmount;
}

/// The in-app Card Payability Score (CONTEXT.md; not a bureau score).
class CardPayability {
  final int score;
  final String band;
  final String bandLabel;
  final String statement;
  final int? safeCardSpendPerDay;

  const CardPayability({
    required this.score,
    required this.band,
    required this.bandLabel,
    required this.statement,
    this.safeCardSpendPerDay,
  });

  factory CardPayability.fromJson(Object? source) {
    final r = JsonReader('CardPayability', source);
    return CardPayability(
      score: r.optInt('score') ?? 0,
      band: r.optString('band') ?? '',
      bandLabel: r.optString('bandLabel') ?? '',
      statement: r.optString('statement') ?? '',
      safeCardSpendPerDay: r.optMoney('safeCardSpendPerDay'),
    );
  }
}

/// A card from /api/v1/cards: the account plus what is owed, this cycle and its bills.
class CreditCardSummary {
  final Account account;
  final int outstanding;
  final int? availableCredit;
  final double? utilization;
  final int unbilledSoFar;
  final String? cycleStart;
  final String? cycleEnd;
  final String? cycleDueDate;
  final CardBill? openBill;
  final List<CardStatement> statements;

  const CreditCardSummary({
    required this.account,
    required this.outstanding,
    this.availableCredit,
    this.utilization,
    this.unbilledSoFar = 0,
    this.cycleStart,
    this.cycleEnd,
    this.cycleDueDate,
    this.openBill,
    this.statements = const [],
  });

  factory CreditCardSummary.fromJson(Object? source) {
    final r = JsonReader('CreditCardSummary', source);
    final bill = r.json['openBill'];
    return CreditCardSummary(
      account: Account.fromJson(r.json, fallbackKind: AccountKind.creditCard),
      outstanding: r.money('outstanding'),
      availableCredit: r.optMoney('availableCredit'),
      utilization: r.optDouble('utilization'),
      unbilledSoFar: r.optMoney('unbilledSoFar') ?? 0,
      cycleStart: r.optDate('cycleStart'),
      cycleEnd: r.optDate('cycleEnd'),
      cycleDueDate: r.optDate('cycleDueDate'),
      openBill: bill == null ? null : CardBill.fromJson(bill),
      statements: r.list('statements', CardStatement.fromJson),
    );
  }

  /// The draft statement behind [openBill], when the bill still needs confirming.
  /// (Statements carry `status`, not `isDraft`; only the open bill has that flag.)
  CardStatement? get draftToConfirm {
    final bill = openBill;
    if (bill == null || !bill.isDraft) return null;
    for (final st in statements) {
      if (st.id == bill.statementId) return st;
    }
    return null;
  }
}

/// A card as the month simulation reports it: owed today and the payability score.
class SimulatedCard {
  final Account account;
  final CardPayability? payability;

  /// The bill to pay now, if any.
  final CardBill? openBill;

  const SimulatedCard({required this.account, this.payability, this.openBill});

  factory SimulatedCard.fromJson(Object? source) {
    final r = JsonReader('SimulatedCard', source);
    final p = r.json['payability'];
    final bill = r.json['openBill'];
    return SimulatedCard(
      account: Account.fromJson(r.json, fallbackKind: AccountKind.creditCard),
      payability: p == null ? null : CardPayability.fromJson(p),
      openBill: bill == null ? null : CardBill.fromJson(bill),
    );
  }
}
