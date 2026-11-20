// Smart assists for the entry sheet: a spend that pays a planned bill, income
// that is salary already in the plan, money that is someone else's.
//
// Mirrors apps/web/src/utils/entryAssists.js; keep the two in step (same rules,
// typed inputs here).

import '../models/month_detail.dart';
import '../models/person_fund.dart';
import '../models/transaction.dart';

List<String> _words(String text) =>
    text.toLowerCase().split(RegExp(r'[^a-z0-9]+')).where((w) => w.length > 2).toList();

int? _day(String? iso) {
  if (iso == null || iso.length < 10) return null;
  final d = DateTime.tryParse(iso.substring(0, 10));
  return d == null ? null : DateTime.utc(d.year, d.month, d.day).millisecondsSinceEpoch ~/ 86400000;
}

/// The unpaid planned bill a spend most likely pays, or null: overdue or due within
/// [windowDays], and either within 10% of the amount or sharing a word with its name.
Transaction? findBillMatch(
  List<Transaction> bills, {
  required int amount,
  String description = '',
  required String today,
  int windowDays = 7,
  double tolerance = 0.1,
}) {
  final descWords = _words(description).toSet();
  if (amount <= 0 && descWords.isEmpty) return null;
  final todayDay = _day(today);
  Transaction? best;
  double bestScore = double.infinity;
  for (final bill in bills) {
    if (!bill.isPlanned) continue;
    final planned = bill.displayAmount;
    final due = _day(bill.dueDate);
    if (todayDay != null && due != null && due - todayDay > windowDays) continue;
    final amountClose = amount > 0 && planned > 0 && (planned - amount).abs() <= planned * tolerance;
    final nameHit = _words(bill.name).any(descWords.contains);
    if (!amountClose && !nameHit) continue;
    final double score = (nameHit ? 0.0 : 1.0) + (amount > 0 && planned > 0 ? (planned - amount).abs() / planned : 1.0);
    if (score < bestScore) {
      bestScore = score;
      best = bill;
    }
  }
  return best;
}

/// The scheduled salary when an income entry looks like it, else null.
({int amount, String? date})? detectDuplicateSalary({String description = '', int amount = 0, MonthInfo? month}) {
  final salary = (month?.incomeAmount ?? 0).abs();
  if (salary == 0) return null;
  final saysSalary = RegExp(r'\b(salary|payroll|paycheck|pay ?slip|wages?)\b', caseSensitive: false).hasMatch(description);
  final sameAmount = amount > 0 && (amount - salary).abs() <= salary * 0.05;
  if (!saysSalary && !sameAmount) return null;
  return (amount: salary, date: month?.incomeCreditDate);
}

/// What [detectPersonHint] suggests: which held/lent action, for whom.
class PersonHint {
  /// 'hold' | 'repaid' | 'lend' | 'return'
  final String action;

  /// The person's existing record, when the description names them.
  final PersonFund? fund;
  final String personName;

  const PersonHint({required this.action, this.fund, this.personName = ''});
}

/// Someone else's money? The held/lent action to suggest, or null.
PersonHint? detectPersonHint({String description = '', required String flow, List<PersonFund> funds = const []}) {
  if (description.trim().isEmpty) return null;
  final lower = description.toLowerCase();
  PersonFund? fund;
  for (final f in funds) {
    final name = f.personName.toLowerCase().trim();
    if (name.length > 1 && RegExp('\\b${RegExp.escape(name)}\\b').hasMatch(lower)) {
      fund = f;
      break;
    }
  }
  final lendWords = RegExp(r'\b(lent|lend|loan|loaned|borrow(ed)?|owes?|repay|repaid|paid back|pay back)\b').hasMatch(lower);
  final holdWords = RegExp(r'\b(keep|keeping|hold|holding|safekeeping|return(ed)?|give back|gave back)\b').hasMatch(lower);
  if (fund == null && !lendWords && !holdWords) return null;

  String action;
  if (flow == 'in') {
    action = fund != null ? (fund.direction == FundDirection.lent ? 'repaid' : 'hold') : (lendWords ? 'repaid' : 'hold');
  } else {
    final outstanding = (fund?.outstanding ?? 0).abs();
    action = fund != null
        ? (fund.direction == FundDirection.held && outstanding > 0 ? 'return' : 'lend')
        : (holdWords ? 'return' : 'lend');
  }
  final named = RegExp(r'\b(?:from|to|for)\s+([A-Z][a-z]+)').firstMatch(description);
  return PersonHint(action: action, fund: fund, personName: fund?.personName ?? named?.group(1) ?? '');
}
