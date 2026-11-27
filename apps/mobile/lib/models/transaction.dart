import 'json_read.dart';

/// Stored lifecycle state (CONTEXT.md "Transaction").
enum TxStatus { planned, successful, cancelled }

/// Where a transaction came from. [other] keeps the app working if the server
/// adds an origin; it is shown as a plain entry.
enum TxOrigin {
  spot,
  planned,
  goal,
  transfer,
  salary,
  heldIn,
  heldReturn,
  lentOut,
  lentRepaid,
  other,
}

/// Server-derived schedule state of a planned transaction.
enum TxSchedule { planned, due, overdue, done, cancelled }

/// What a transaction is, for totals and display. Every transaction is exactly one.
enum TxKind {
  /// Money spent (counts toward spending).
  expense,

  /// A refund of a spend: a negative amount (ADR 0062). Reduces spending.
  refund,

  /// Money earned.
  income,

  /// Money moved between the user's own accounts, including card bill payments.
  /// Never income or expense.
  transfer,

  /// Held/lent money coming in (held_in, lent_repaid). Never income (ADR 0069).
  passThroughIn,

  /// Held/lent money going out (held_return, lent_out). Never expense (ADR 0069).
  passThroughOut,
}

enum MoneyFlow { moneyIn, moneyOut, moved }

class Transaction {
  final String id;
  final String name;
  final TxStatus status;
  final TxSchedule schedule;
  final TxOrigin origin;

  /// Minor units. Positive = debit; negative = refund/credit.
  final int amount;

  /// Effective date ('YYYY-MM-DD'); for a planned transaction, its date so far.
  final String date;
  final int? plannedAmount;
  final String? plannedDate;
  final String category;
  final String note;
  final bool isIncome;
  final String? accountId;
  final String? destinationAccountId;
  final String? goalId;
  final String? transferId;
  final String? personFundId;
  final String? refundTargetTransactionId;
  final String? recurrence;

  /// A monthly plan's day of the month.
  final int? recurrenceDay;

  /// Fixed: an unpaid one carries into the next cycle. Variable: it drops.
  final bool isFixed;

  /// The server JSON this was read from. Widgets not yet migrated to the model
  /// (detail and mark-paid sheets) still take the map.
  final Map<String, dynamic> raw;

  const Transaction({
    required this.id,
    required this.name,
    required this.status,
    required this.schedule,
    required this.origin,
    required this.amount,
    required this.date,
    this.plannedAmount,
    this.plannedDate,
    this.category = 'Other',
    this.note = '',
    this.isIncome = false,
    this.accountId,
    this.destinationAccountId,
    this.goalId,
    this.transferId,
    this.personFundId,
    this.refundTargetTransactionId,
    this.recurrence,
    this.recurrenceDay,
    this.isFixed = true,
    this.raw = const {},
  });

  static const _statuses = {
    'planned': TxStatus.planned,
    'successful': TxStatus.successful,
    'cancelled': TxStatus.cancelled,
  };

  static const _origins = {
    'spot': TxOrigin.spot,
    'planned': TxOrigin.planned,
    'goal': TxOrigin.goal,
    'transfer': TxOrigin.transfer,
    'salary': TxOrigin.salary,
    'held_in': TxOrigin.heldIn,
    'held_return': TxOrigin.heldReturn,
    'lent_out': TxOrigin.lentOut,
    'lent_repaid': TxOrigin.lentRepaid,
  };

  static const _schedules = {
    'planned': TxSchedule.planned,
    'due': TxSchedule.due,
    'overdue': TxSchedule.overdue,
    'successful': TxSchedule.done,
    'cancelled': TxSchedule.cancelled,
  };

  factory Transaction.fromJson(Object? source) {
    final r = JsonReader('Transaction', source);
    final rawStatus = r.string('status');
    final status =
        _statuses[rawStatus] ??
        (throw ModelParseException(
          'Transaction',
          'status',
          rawStatus,
          'is not planned, successful or cancelled',
        ));
    final origin = _origins[r.optString('origin')] ?? TxOrigin.other;
    final defaultSchedule = switch (status) {
      TxStatus.planned => TxSchedule.planned,
      TxStatus.successful => TxSchedule.done,
      TxStatus.cancelled => TxSchedule.cancelled,
    };
    return Transaction(
      id: r.string('id', aliases: ['_id']),
      name: r.optString('name', aliases: ['title']) ?? '',
      status: status,
      schedule: _schedules[r.optString('derivedStatus')] ?? defaultSchedule,
      origin: origin,
      amount: r.money('amount'),
      date: r.date('date'),
      plannedAmount: r.optMoney('plannedAmount'),
      plannedDate: r.optDate('plannedDate'),
      category: r.optString('category', aliases: ['tag']) ?? 'Other',
      note: r.optString('note') ?? '',
      isIncome: r.flag('isIncome') || r.json['type'] == 'income',
      accountId: r.optString('accountId', aliases: ['bankAccountId']),
      destinationAccountId: r.optString('destinationAccountId'),
      goalId: r.optString('goalId'),
      transferId: r.optString('transferId'),
      personFundId: r.optString('personFundId'),
      refundTargetTransactionId: r.optString('refundTargetTransactionId'),
      recurrence: r.optString('recurrence'),
      recurrenceDay: r.optInt('recurrenceDay'),
      isFixed: r.json['isFixed'] is bool ? r.json['isFixed'] as bool : true,
      raw: r.json,
    );
  }

  TxKind get kind {
    if (origin == TxOrigin.transfer || destinationAccountId != null) {
      return TxKind.transfer;
    }
    if (origin == TxOrigin.heldIn || origin == TxOrigin.lentRepaid) {
      return TxKind.passThroughIn;
    }
    if (origin == TxOrigin.heldReturn || origin == TxOrigin.lentOut) {
      return TxKind.passThroughOut;
    }
    if (isIncome) return TxKind.income;
    if (amount < 0) return TxKind.refund;
    return TxKind.expense;
  }

  MoneyFlow get flow => switch (kind) {
    TxKind.income || TxKind.refund || TxKind.passThroughIn => MoneyFlow.moneyIn,
    TxKind.expense || TxKind.passThroughOut => MoneyFlow.moneyOut,
    TxKind.transfer => MoneyFlow.moved,
  };

  bool get isPlanned => status == TxStatus.planned;
  bool get isSuccessful => status == TxStatus.successful;
  bool get isPassThrough =>
      kind == TxKind.passThroughIn || kind == TxKind.passThroughOut;

  /// Spending side of the ledger: expenses and their refunds.
  bool get isSpending => kind == TxKind.expense || kind == TxKind.refund;

  bool get isFromGoal => origin == TxOrigin.goal || goalId != null;

  /// What a planned transaction is due on.
  String get dueDate => plannedDate ?? date;

  /// Amount to show without a sign: the planned amount while planned.
  int get displayAmount =>
      (isPlanned ? (plannedAmount ?? amount) : amount).abs();

  /// Short label for the row badge, or null for a plain spot entry.
  String? get sourceLabel => switch (origin) {
    TxOrigin.goal => 'Goal',
    TxOrigin.planned => 'Planned',
    TxOrigin.salary => 'Salary',
    TxOrigin.transfer => 'Transfer',
    TxOrigin.heldIn || TxOrigin.heldReturn => 'Held',
    TxOrigin.lentOut || TxOrigin.lentRepaid => 'Lent',
    TxOrigin.spot || TxOrigin.other => kind == TxKind.refund ? 'Refund' : null,
  };
}
