/// Calendar utilities for budget calculations.
/// Pure functions with zero system clock or timezone dependencies.
library;

/// Returns the number of days in a given calendar month (1-indexed month: 1 = Jan, 12 = Dec).
int getDaysInMonth(int year, int month) {
  // DateTime in UTC handles day 0 as the last day of the previous month
  final lastDay = DateTime.utc(year, month + 1, 0);
  return lastDay.day;
}

/// Clamps a day of month to the valid range for that specific month.
int clampDayToMonth(int day, int daysInMonth) {
  if (day < 1) return 1;
  return day > daysInMonth ? daysInMonth : day;
}

/// Formats year, month, and day into ISO date string 'YYYY-MM-DD'.
String formatDate(int year, int month, int day) {
  final y = year.toString().padLeft(4, '0');
  final m = month.toString().padLeft(2, '0');
  final d = day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

/// Computes the relative day offset for a given ISO date string relative to Day 1 of the planned month.
/// If date is before Day 1, returns a negative relative offset.
int getRelativeDay(String? dateStr, int year, int monthNum) {
  if (dateStr == null || dateStr.trim().isEmpty) return 1;
  final parts = dateStr.trim().split('-');
  if (parts.length < 3) return 1;

  final y = int.tryParse(parts[0]) ?? year;
  final m = int.tryParse(parts[1]) ?? monthNum;
  final d = int.tryParse(parts[2]) ?? 1;

  if (y == year && m == monthNum) {
    return d;
  }

  final firstOfMonth = DateTime.utc(year, monthNum, 1);
  final targetDate = DateTime.utc(y, m, d);
  final diffDays = targetDate.difference(firstOfMonth).inDays;

  if (diffDays <= 0) {
    return diffDays == 0 ? 1 : diffDays;
  }
  return d;
}

/// Returns the ISO date string 'YYYY-MM-DD' for a relative day index.
String getDateFromRelativeDay(int relativeDay, int year, int monthNum) {
  if (relativeDay >= 1) {
    return formatDate(year, monthNum, relativeDay);
  }
  final d = DateTime.utc(year, monthNum, 1).add(Duration(days: relativeDay));
  return formatDate(d.year, d.month, d.day);
}

/// Status of the salary window
class SalaryWindowStatus {
  final bool isLocked;
  final bool isUnconfigured;
  /// First-time setup after this month's window closed: saving locks it at once.
  final bool isMidMonthSetup;
  final String status;
  final String reason;
  final String tooltip;
  final String? windowStartDate;
  final String? windowEndDate;

  SalaryWindowStatus({
    required this.isLocked,
    required this.isUnconfigured,
    this.isMidMonthSetup = false,
    required this.status,
    required this.reason,
    required this.tooltip,
    this.windowStartDate,
    this.windowEndDate,
  });
}

/// The 10-day salary logging window and lock status (getSalaryWindowStatus on web):
/// 5 days before day 1 of the month through day 5.
SalaryWindowStatus getSalaryWindowStatus(Map<String, dynamic>? month, [DateTime? currentDate]) {
  if (month == null || month['year'] == null || month['month'] == null) {
    return SalaryWindowStatus(
      isLocked: false,
      isUnconfigured: true,
      status: 'unconfigured',
      reason: 'No active month',
      tooltip: 'No active month',
    );
  }

  final int year = (month['year'] as num).toInt();
  final int monthNum = (month['month'] as num).toInt();
  final windowStart = DateTime.utc(year, monthNum, 1 - 5);
  final windowEnd = DateTime.utc(year, monthNum, 5, 23, 59, 59, 999);
  final today = currentDate ?? DateTime.now();
  final now = DateTime.utc(today.year, today.month, today.day, 12);

  final startStr = formatDate(windowStart.year, windowStart.month, windowStart.day);
  final endStr = formatDate(windowEnd.year, windowEnd.month, windowEnd.day);
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  String friendly(DateTime d) => '${monthsShort[d.month - 1]} ${d.day}';

  final incomeAmount = num.tryParse('${month['incomeAmount'] ?? 0}') ?? 0;
  final bankId = month['salaryBankAccountId'];
  final isConfigured = incomeAmount > 0 && bankId != null && bankId.toString().isNotEmpty;

  SalaryWindowStatus result(String status, String tip, {bool locked = false, bool unconfigured = false, bool midMonth = false}) =>
      SalaryWindowStatus(
        isLocked: locked,
        isUnconfigured: unconfigured,
        isMidMonthSetup: midMonth,
        status: status,
        reason: tip,
        tooltip: tip,
        windowStartDate: startStr,
        windowEndDate: endStr,
      );

  if (!isConfigured) {
    final mid = now.isAfter(windowEnd);
    return result(
      'unconfigured',
      mid ? 'Configure monthly salary (mid-month setup will lock immediately until next month-end)' : 'Configure monthly salary',
      unconfigured: true,
      midMonth: mid,
    );
  }
  if (now.isBefore(windowStart)) {
    return result('before_window', 'Unlocks on ${friendly(windowStart)} — 5 days before month start', locked: true);
  }
  if (now.isAfter(windowEnd)) {
    return result('after_window', 'Window closed on ${friendly(windowEnd)}', locked: true);
  }
  return result('in_window', 'Salary logging open until ${friendly(windowEnd)}');
}
