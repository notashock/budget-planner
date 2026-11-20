import 'transaction.dart';

/// Filters on the "recorded" (successful) tab.
enum RecordedFilter { all, expense, income }

/// Filters on the "planned" tab.
enum PlannedFilter { all, due, overdue, goal }

/// The Transactions screen's lists, built once per load instead of on every
/// rebuild. Each chip count uses the same test as the list it opens, so they
/// always agree.
class TransactionLists {
  /// Successful transactions, newest first.
  final List<Transaction> recorded;

  /// Planned transactions, earliest due first.
  final List<Transaction> planned;

  TransactionLists._(this.recorded, this.planned);

  static final TransactionLists empty = TransactionLists._(const [], const []);

  factory TransactionLists.from(Iterable<Transaction> all) {
    final recorded = all.where((t) => t.isSuccessful).toList()
      ..sort((a, b) {
        final byDate = b.date.compareTo(a.date);
        return byDate != 0 ? byDate : a.id.compareTo(b.id);
      });
    final planned = all.where((t) => t.isPlanned).toList()
      ..sort((a, b) {
        final byDue = a.dueDate.compareTo(b.dueDate);
        return byDue != 0 ? byDue : a.id.compareTo(b.id);
      });
    return TransactionLists._(
      List.unmodifiable(recorded),
      List.unmodifiable(planned),
    );
  }

  /// Expenses means spending (spends and their refunds): transfers and
  /// held/lent money are neither expense nor income.
  static bool matchesRecorded(Transaction t, RecordedFilter f) => switch (f) {
    RecordedFilter.all => true,
    RecordedFilter.expense => t.isSpending,
    RecordedFilter.income => t.kind == TxKind.income,
  };

  static bool matchesPlanned(Transaction t, PlannedFilter f) => switch (f) {
    PlannedFilter.all => true,
    PlannedFilter.due => t.schedule == TxSchedule.due,
    PlannedFilter.overdue => t.schedule == TxSchedule.overdue,
    PlannedFilter.goal => t.isFromGoal,
  };

  late final Map<RecordedFilter, List<Transaction>> _recordedBy = {
    for (final f in RecordedFilter.values)
      f: List.unmodifiable(recorded.where((t) => matchesRecorded(t, f))),
  };

  late final Map<PlannedFilter, List<Transaction>> _plannedBy = {
    for (final f in PlannedFilter.values)
      f: List.unmodifiable(planned.where((t) => matchesPlanned(t, f))),
  };

  List<Transaction> recordedWhere(RecordedFilter f) => _recordedBy[f]!;
  List<Transaction> plannedWhere(PlannedFilter f) => _plannedBy[f]!;
}
