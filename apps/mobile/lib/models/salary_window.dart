import '../engine/currency.dart' show formatDisplayDate;
import 'json_read.dart';
import 'transaction.dart';

/// When the next salary can be logged: payday ± 5 days after the last salary
/// (GET /api/v1/periods/salary-window). The server enforces the same window.
class SalaryWindow {
  final String lastCreditedDate;
  final String expectedDate;
  final String opensOn;
  final String closesOn;

  /// 'before', 'open' or 'late' (after the window: logging it needs confirming).
  final String state;
  final String today;

  /// Minor units.
  final int amount;
  final String? accountId;

  /// The open period the salary is credited to.
  final int? year;
  final int? month;

  const SalaryWindow({
    required this.lastCreditedDate,
    required this.expectedDate,
    required this.opensOn,
    required this.closesOn,
    required this.state,
    required this.today,
    this.amount = 0,
    this.accountId,
    this.year,
    this.month,
  });

  factory SalaryWindow.fromJson(Object? source) {
    final r = JsonReader('SalaryWindow', source);
    final period = r.json['period'] is Map ? r.json['period'] as Map : const {};
    return SalaryWindow(
      lastCreditedDate: r.date('lastCreditedDate'),
      expectedDate: r.date('expectedDate'),
      opensOn: r.date('opensOn'),
      closesOn: r.date('closesOn'),
      state: r.optString('state') ?? 'open',
      today: r.date('today'),
      amount: r.optMoney('amount') ?? 0,
      accountId: r.optString('accountId'),
      year: num.tryParse('${period['year']}')?.toInt(),
      month: num.tryParse('${period['month']}')?.toInt(),
    );
  }

  bool get canLog => state != 'before';
  bool get isLate => state == 'late';

  String _d(String iso) => formatDisplayDate(iso, includeWeekday: false);

  /// One line for the Salary choice.
  String get message => switch (state) {
        'before' => 'Next salary can be logged from ${_d(opensOn)}',
        'late' => 'Your salary was due by ${_d(closesOn)}. Logging it now marks it late.',
        _ => 'Expected ${_d(expectedDate)} · can be logged ${_d(opensOn)} – ${_d(closesOn)}',
      };

  /// Whether [date] is one the server takes: from the window's opening (and after
  /// the last salary) up to today.
  bool allows(String date) =>
      date.compareTo(opensOn) >= 0 && date.compareTo(lastCreditedDate) > 0 && date.compareTo(today) <= 0;
}

/// What the next cycle gets from this one's plans (the server's carry rules):
/// unpaid Fixed plans move in, unpaid Variable ones drop, monthly ones repeat.
({List<String> moved, List<String> dropped, List<String> repeated}) carryPreview(List<Transaction> txs) {
  final moved = <String>[], dropped = <String>[], repeated = <String>{};
  for (final t in txs) {
    if (t.origin == TxOrigin.salary) continue;
    final name = t.name.isEmpty ? t.category : t.name;
    if (t.isPlanned) (t.isFixed ? moved : dropped).add(name);
    if (t.recurrence != null) repeated.add(name);
  }
  return (moved: moved, dropped: dropped, repeated: repeated.toList());
}
