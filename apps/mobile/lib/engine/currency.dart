import 'package:intl/intl.dart';

/// Currency and numeric formatters for minor units (e.g. paisa/cents) and major units.

int toMinorUnits(num major, {int scale = 100}) {
  return (major * scale).round();
}

double toMajorUnits(num minor, {int scale = 100}) {
  return minor / scale;
}

/// Formats minor units into Indian number formatting with currency symbol (e.g. ₹1,250.00).
String formatCurrency(num minor, {String symbol = '₹', int scale = 100}) {
  final major = toMajorUnits(minor, scale: scale);
  final absMajor = major.abs();

  final formatter = NumberFormat.currency(
    symbol: '',
    locale: 'en_IN',
    decimalDigits: 2,
  );

  final formattedNumber = formatter.format(absMajor).trim();
  final sign = major < 0 ? '-' : '';
  return '$sign$symbol$formattedNumber';
}

/// Formats compact monetary figures for charts (e.g. ₹500, ₹10k, ₹1.5m).
String formatCompactCurrency(num minor, {String symbol = '₹', int scale = 100}) {
  final major = toMajorUnits(minor, scale: scale).round();
  final absVal = major.abs();
  final sign = major < 0 ? '-' : '';

  if (absVal < 10000) {
    return '$sign$symbol$absVal';
  } else if (absVal < 1000000) {
    final k = (absVal / 1000).toStringAsFixed(absVal % 1000 == 0 ? 0 : 1);
    return '$sign$symbol${k}k';
  } else {
    final m = (absVal / 1000000).toStringAsFixed(absVal % 1000000 == 0 ? 0 : 1);
    return '$sign$symbol${m}m';
  }
}

/// Formats ISO date 'YYYY-MM-DD' into readable short string (e.g. 'Fri, Sep 18' or 'Sep 18').
String formatDisplayDate(String? dateStr, {bool includeWeekday = true}) {
  if (dateStr == null || dateStr.trim().isEmpty) return '';
  final parts = dateStr.trim().split('-');
  if (parts.length != 3) return dateStr;

  final year = int.tryParse(parts[0]) ?? 2026;
  final month = int.tryParse(parts[1]) ?? 1;
  final day = int.tryParse(parts[2]) ?? 1;

  final date = DateTime.utc(year, month, day);
  final pattern = includeWeekday ? 'EEE, MMM d' : 'MMM d';
  return DateFormat(pattern, 'en_US').format(date);
}
