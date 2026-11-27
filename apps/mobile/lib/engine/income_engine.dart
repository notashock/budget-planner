// Dart port of calculateIrregularMetrics (packages/engine/src/incomeEngine.js):
// balance, trailing income and spending, runway, and quarter / year totals for
// the irregular-income Plan view. income_engine_test.dart checks it.

class PeriodTotals {
  PeriodTotals(this.key, this.label, this.year);
  final String key; // 2026-Q4 or 2026
  final String label; // Q4 (quarters only)
  final int year;
  int income = 0, spending = 0;
  int get net => income - spending;
}

class IrregularMetrics {
  const IrregularMetrics({
    required this.currentBalance,
    required this.trailing12mIncome,
    required this.trailing12mSpending,
    required this.monthsOfHistory,
    required this.smoothedMonthlyIncome,
    required this.avgMonthlySpending,
    required this.runwayMonths,
    required this.isIndefinite,
    required this.quarterly,
    required this.yearly,
  });
  final int currentBalance, trailing12mIncome, trailing12mSpending, monthsOfHistory;
  final int smoothedMonthlyIncome, avgMonthlySpending;
  final double runwayMonths; // infinity when indefinite
  final bool isIndefinite;
  final List<PeriodTotals> quarterly, yearly;
}

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

int _money(Object? v) => (num.tryParse('${v ?? 0}') ?? 0).round();

String? _idOf(Object? raw) {
  if (raw == null) return null;
  if (raw is Map) return '${raw['_id'] ?? raw['id']}';
  return '$raw';
}

IrregularMetrics calculateIrregularMetrics({
  List<dynamic> transactions = const [],
  List<dynamic> accounts = const [],
  String? asOfDate,
  int windowMonths = 12,
}) {
  final now = DateTime.now(); // the user's date, not UTC's
  final today = asOfDate != null ? DateTime.parse(asOfDate) : DateTime.utc(now.year, now.month, now.day);
  final asOf = asOfDate ?? _iso(today);
  final windowStart = _iso(DateTime.utc(today.year, today.month - windowMonths, today.day));
  final accts = accounts.whereType<Map>().toList();
  final txs = transactions.whereType<Map>().toList();

  var currentBalance = accts.fold<int>(0, (s, a) => s + _money(a['openingBalance']));
  // An opening balance already includes everything before its date
  final openedOn = <String, String>{};
  for (final a in accts) {
    final d = a['openingBalanceDate'];
    if (d == null) continue;
    for (final id in [a['id'], a['_id'], a['altId']]) {
      if (id != null) openedOn['$id'] = '$d';
    }
  }
  String? accountOf(Map t) => _idOf(t['accountId'] ?? t['bankAccountId'] ?? t['walletId']);
  bool predates(Map t, String date) {
    final o = openedOn[accountOf(t) ?? ''];
    return o != null && date.compareTo(o) < 0;
  }

  var income12 = 0, spending12 = 0;
  final quarters = <String, PeriodTotals>{}, years = <String, PeriodTotals>{};

  for (final t in txs) {
    if (t['status'] != 'successful') continue;
    if (t['origin'] == 'transfer' ||
        t['category'] == 'Transfer' ||
        t['destinationAccountId'] != null ||
        t['itemType'] == 'transfer' ||
        t['isTransfer'] == true) {
      continue;
    }
    final date = '${t['date'] ?? ''}';
    final origin = t['origin'];
    // Held & Lent money changes cash on hand but is never income or spending
    final passSign = (origin == 'held_in' || origin == 'lent_repaid')
        ? 1
        : ((origin == 'held_return' || origin == 'lent_out') ? -1 : 0);
    if (passSign != 0) {
      if (date.compareTo(asOf) <= 0 && !predates(t, date)) currentBalance += passSign * _money(t['amount']).abs();
      continue;
    }
    final amount = _money(t['amount']);
    final isIncome = t['isIncome'] == true;
    if (date.compareTo(asOf) <= 0 && !predates(t, date)) currentBalance += isIncome ? amount : -amount;
    if (date.compareTo(windowStart) >= 0 && date.compareTo(asOf) <= 0) {
      if (isIncome) {
        income12 += amount;
      } else {
        spending12 += amount;
      }
    }
    final parts = date.split('-');
    if (parts.length == 3) {
      final y = int.tryParse(parts[0]) ?? 0;
      final q = ((int.tryParse(parts[1]) ?? 1) / 3).ceil();
      final qt = quarters.putIfAbsent('${parts[0]}-Q$q', () => PeriodTotals('${parts[0]}-Q$q', 'Q$q', y));
      final yt = years.putIfAbsent(parts[0], () => PeriodTotals(parts[0], '', y));
      if (isIncome) {
        qt.income += amount;
        yt.income += amount;
      } else {
        qt.spending += amount;
        yt.spending += amount;
      }
    }
  }

  // For "now", the accounts' ledger balances are the truth
  if (asOfDate == null && accts.isNotEmpty && accts.every((a) => a['currentBalance'] is num)) {
    currentBalance = accts.fold<int>(0, (s, a) => s + (a['currentBalance'] as num).round());
  }

  // Average over the months of history actually present, capped at the window
  final starts = <String>[
    for (final a in accts)
      if (a['openingBalanceDate'] != null) '${a['openingBalanceDate']}',
    for (final t in txs)
      if (t['status'] == 'successful' && t['date'] != null && '${t['date']}'.compareTo(asOf) <= 0) '${t['date']}',
  ]..sort();
  final earliest = starts.isNotEmpty ? starts.first : asOf;
  final historyStart = earliest.compareTo(windowStart) > 0 ? earliest : windowStart;
  int ym(String iso) {
    final p = iso.split('-');
    return int.parse(p[0]) * 12 + int.parse(p[1]);
  }

  final months = (ym(asOf) - ym(historyStart) + 1).clamp(1, windowMonths < 1 ? 12 : windowMonths);
  final smoothed = (income12 / months).round();
  final avgSpend = (spending12 / months).round();
  final avg = avgSpend < 0 ? 0 : avgSpend;

  double runway;
  var indefinite = false;
  if (avg == 0) {
    runway = double.infinity;
    indefinite = true;
  } else if (currentBalance <= 0) {
    runway = 0;
  } else {
    runway = (currentBalance / avg * 10).round() / 10;
  }

  final qKeys = quarters.keys.toList()..sort();
  final yKeys = years.keys.toList()..sort();
  return IrregularMetrics(
    currentBalance: currentBalance,
    trailing12mIncome: income12,
    trailing12mSpending: spending12,
    monthsOfHistory: months,
    smoothedMonthlyIncome: smoothed,
    avgMonthlySpending: avg,
    runwayMonths: runway,
    isIndefinite: indefinite,
    quarterly: [for (final k in qKeys) quarters[k]!],
    yearly: [for (final k in yKeys) years[k]!],
  );
}

/// Runway band against the 3- and 6-month benchmarks (getRunwayBand on web).
({String key, String label}) getRunwayBand(double months) {
  if (months == double.infinity) return (key: 'healthy', label: 'No spending recorded');
  if (months.isNaN || months < 3) return (key: 'low', label: 'Below 3 months');
  if (months < 6) return (key: 'building', label: '3–6 months');
  return (key: 'healthy', label: '6+ months');
}
