import 'account.dart';
import 'json_read.dart';
import 'transaction.dart';

/// The month (budget period) header from GET /api/v1/periods/:y/:m.
class MonthInfo {
  final String id;
  final int year;
  final int month;
  final int openingBalance;
  final int incomeAmount;
  final int safetyFloor;
  final String currencySymbol;
  final bool isSalaryCredited;
  final String? salaryCreditedDate;
  final String? incomeCreditDate;
  final String? salaryAccountId;

  /// Day of the month the salary is planned to arrive.
  final int incomeCreditDay;
  final bool isClosed;
  final Map<String, dynamic> raw;

  const MonthInfo({
    required this.id,
    required this.year,
    required this.month,
    this.openingBalance = 0,
    this.incomeAmount = 0,
    this.safetyFloor = 0,
    this.currencySymbol = '₹',
    this.isSalaryCredited = false,
    this.salaryCreditedDate,
    this.incomeCreditDate,
    this.salaryAccountId,
    this.incomeCreditDay = 1,
    this.isClosed = false,
    this.raw = const {},
  });

  factory MonthInfo.fromJson(Object? source) {
    final r = JsonReader('MonthInfo', source);
    final month = r.optInt('month');
    if (month == null || month < 1 || month > 12) {
      throw ModelParseException(
        'MonthInfo',
        'month',
        r.json['month'],
        'must be 1-12',
      );
    }
    final year = r.optInt('year');
    if (year == null) {
      throw ModelParseException('MonthInfo', 'year', null, 'is required');
    }
    return MonthInfo(
      id: r.string('id', aliases: ['_id']),
      year: year,
      month: month,
      openingBalance: r.optMoney('openingBalance') ?? 0,
      incomeAmount: r.optMoney('incomeAmount') ?? 0,
      safetyFloor: r.optMoney('safetyFloor') ?? 0,
      currencySymbol: r.optString('currencySymbol') ?? '₹',
      isSalaryCredited: r.flag('isSalaryCredited'),
      salaryCreditedDate: r.optDate('salaryCreditedDate'),
      incomeCreditDate: r.optDate('incomeCreditDate'),
      salaryAccountId: r.optString('salaryAccountId'),
      incomeCreditDay: r.optInt('incomeCreditDay') ??
          int.tryParse(r.optDate('incomeCreditDate')?.substring(8) ?? '') ??
          1,
      isClosed: r.flag('isClosed'),
      raw: r.json,
    );
  }
}

/// The parts of the month response the typed screens use. The simulation is
/// read separately by SimulationResult.
class MonthDetail {
  final MonthInfo month;
  final List<Transaction> transactions;
  final List<Account> bankAccounts;
  final List<Account> wallets;

  const MonthDetail({
    required this.month,
    required this.transactions,
    this.bankAccounts = const [],
    this.wallets = const [],
  });

  factory MonthDetail.fromJson(Object? source) {
    final r = JsonReader('MonthDetail', source);
    return MonthDetail(
      month: MonthInfo.fromJson(r.json['month']),
      transactions: r.list('transactions', Transaction.fromJson),
      bankAccounts: r.list(
        'bankAccounts',
        (a) => Account.fromJson(a, fallbackKind: AccountKind.bank),
      ),
      wallets: r.list(
        'wallets',
        (a) => Account.fromJson(a, fallbackKind: AccountKind.wallet),
      ),
    );
  }
}
