import 'package:intl/intl.dart';

/// Money and date formatting (upgrade plan 3.4). Amounts are minor units
/// (paise); the rules mirror the web engine (`packages/engine/src/index.js`
/// formatCurrency / formatCurrencyWhole, and the chart's formatChartTick).

/// Used when a month carries no symbol (the server's default).
const String kDefaultCurrencySymbol = '₹';

/// Amounts and dates follow the Indian system: 1,30,000 and lakh/crore.
const String kMoneyLocale = 'en_IN';

/// Symbol of the month on screen. BudgetProvider sets it whenever a month
/// loads, so formatting without an explicit symbol follows the month.
// shortcut: one app-wide value, fine while one month is on screen at a time;
// pass `symbol:` explicitly if two currencies ever show together.
String moneySymbol = kDefaultCurrencySymbol;

int toMinorUnits(num major, {int scale = 100}) {
  return (major * scale).round();
}

double toMajorUnits(num minor, {int scale = 100}) {
  return minor / scale;
}

/// How many decimals an amount shows.
enum MoneyDigits {
  /// Always paise (₹1,250.00): lists and the ledger.
  two,

  /// Whole rupees, rounded (₹1,250): headline figures and totals.
  whole,

  /// Paise only when there are any (₹1,250 / ₹1,250.50).
  auto,
}

/// Indian grouping with the month's symbol: ₹1,30,000.00, -₹50.25.
String formatCurrency(num minor, {String? symbol, int scale = 100, MoneyDigits digits = MoneyDigits.two}) {
  final major = toMajorUnits(minor, scale: scale);
  final abs = major.abs();
  final decimals = switch (digits) {
    MoneyDigits.two => 2,
    MoneyDigits.whole => 0,
    MoneyDigits.auto => ((abs * 100).round() % 100 == 0) ? 0 : 2,
  };
  final formatted = NumberFormat.currency(symbol: '', locale: kMoneyLocale, decimalDigits: decimals)
      .format(abs)
      .trim();
  // No "-₹0" when a tiny negative rounds to zero
  final sign = major < 0 && formatted.replaceAll(RegExp(r'[0,.]'), '').isNotEmpty ? '-' : '';
  return '$sign${symbol ?? moneySymbol}$formatted';
}

/// Whole-rupee headline figure (rounded): ₹10,909.
String formatCurrencyWhole(num minor, {String? symbol, int scale = 100}) =>
    formatCurrency(minor, symbol: symbol, scale: scale, digits: MoneyDigits.whole);

/// Short figures for chart axes and pills, in the Indian system: the full
/// figure under ₹10,000, then k (thousand), L (lakh) and Cr (crore), with at
/// most one decimal: ₹9,500, ₹12.5k, ₹1.3L, ₹2Cr.
String formatCompactCurrency(num minor, {String? symbol, int scale = 100}) {
  final major = toMajorUnits(minor, scale: scale).abs();
  final sign = minor < 0 && major >= 0.5 ? '-' : '';
  final sym = symbol ?? moneySymbol;
  String compact(double n) {
    final r = (n * 10).round() / 10;
    return r == r.roundToDouble() ? r.toStringAsFixed(0) : r.toStringAsFixed(1);
  }

  if (major >= 10000000) return '$sign$sym${compact(major / 10000000)}Cr';
  if (major >= 100000) return '$sign$sym${compact(major / 100000)}L';
  if (major >= 10000) return '$sign$sym${compact(major / 1000)}k';
  return '$sign$sym${NumberFormat.decimalPattern(kMoneyLocale).format(major.round())}';
}

/// 'YYYY-MM-DD' as the Indian short form: 'Fri, 18 Sep' or '18 Sep'.
String formatDisplayDate(String? dateStr, {bool includeWeekday = true}) {
  if (dateStr == null || dateStr.trim().isEmpty) return '';
  final parts = dateStr.trim().split('-');
  if (parts.length != 3) return dateStr;

  final year = int.tryParse(parts[0]) ?? 2026;
  final month = int.tryParse(parts[1]) ?? 1;
  final day = int.tryParse(parts[2]) ?? 1;

  final date = DateTime.utc(year, month, day);
  // Indian day-month order. en_US names are the same English words, and unlike
  // en_IN they need no initializeDateFormatting() before use.
  final pattern = includeWeekday ? 'EEE, d MMM' : 'd MMM';
  return DateFormat(pattern, 'en_US').format(date);
}
