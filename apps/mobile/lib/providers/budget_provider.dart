import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../engine/engine.dart';

class BudgetProvider with ChangeNotifier {
  final ApiService _api = ApiService();

  bool _isLoading = false;
  String? _error;

  int _currentYear = DateTime.now().year;
  int _currentMonth = DateTime.now().month;

  List<dynamic> _months = [];
  Map<String, dynamic>? _activeMonthDetail;
  List<dynamic> _items = [];
  List<dynamic> _transactions = [];
  List<dynamic> _goals = [];
  List<dynamic> _evaluatedGoals = [];
  List<dynamic> _bankAccounts = [];
  List<dynamic> _wallets = [];
  List<dynamic> _transfers = [];
  Map<String, dynamic> _userSettings = {};

  SimulationResult? _simulation;
  Map<String, SimulationResult> _accountSimulations = {};

  // Getters
  bool get isLoading => _isLoading;
  String? get error => _error;
  int get currentYear => _currentYear;
  int get currentMonth => _currentMonth;
  List<dynamic> get months => _months;
  Map<String, dynamic>? get activeMonth => _activeMonthDetail;
  List<dynamic> get items => _items;
  List<dynamic> get transactions => _transactions;
  List<dynamic> get goals => _goals;
  List<dynamic> get evaluatedGoals => _evaluatedGoals;
  List<dynamic> get bankAccounts => _bankAccounts;
  List<dynamic> get wallets => _wallets;
  List<dynamic> get transfers => _transfers;
  Map<String, dynamic> get userSettings => _userSettings;
  SimulationResult? get simulation => _simulation;
  Map<String, SimulationResult> get accountSimulations => _accountSimulations;
  SimulationResult? getAccountSimulation(String accountId) => _accountSimulations[accountId];

  SalaryWindowStatus get salaryStatus => getSalaryWindowStatus(_activeMonthDetail);

  List<dynamic> get allAccounts {
    final list = <dynamic>[];
    for (var b in _bankAccounts) {
      if (b is Map) {
        list.add({...b, 'type': 'bank'});
      }
    }
    for (var w in _wallets) {
      if (w is Map) {
        list.add({...w, 'type': 'wallet'});
      }
    }
    return list;
  }

  int get totalAccountsBalance {
    int sum = 0;
    for (var a in allAccounts) {
      if (a is Map) {
        sum += (num.tryParse('${a['currentBalance'] ?? a['openingBalance'] ?? 0}') ?? 0).round();
      }
    }
    return sum;
  }

  void _runLocalEngine() {
    // Server is the single source of truth for simulation and velocity results.
    notifyListeners();
  }

  Future<Map<String, dynamic>> recommendPurchaseDate(num purchaseAmount) async {
    try {
      return await _api.recommendPurchaseDate(_currentYear, _currentMonth, purchaseAmount);
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  Future<void> loadInitialData() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final settings = await _api.getSettings();
      _userSettings = settings;

      final monthsList = await _api.getMonths();
      _months = monthsList;

      if (_months.isNotEmpty) {
        // Find match for current year/month or pick latest
        final match = _months.firstWhere(
          (m) => m['year'] == _currentYear && m['month'] == _currentMonth,
          orElse: () => _months.first,
        );
        _currentYear = (num.tryParse('${match['year']}') ?? DateTime.now().year).toInt();
        _currentMonth = (num.tryParse('${match['month']}') ?? DateTime.now().month).toInt();
      }

      await _fetchActiveMonthDetails();
      await _fetchAccountsAndTransfers();
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      _runLocalEngine();
    }
  }

  Future<void> switchMonth(int year, int month) async {
    _currentYear = year;
    _currentMonth = month;
    _isLoading = true;
    notifyListeners();

    try {
      await _fetchActiveMonthDetails();
      await _fetchAccountsAndTransfers();
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      _runLocalEngine();
    }
  }

  Future<void> _fetchActiveMonthDetails() async {
    try {
      final detail = await _api.getMonthDetail(_currentYear, _currentMonth);
      if (detail['month'] is Map) {
        _activeMonthDetail = Map<String, dynamic>.from(detail['month']);
      } else {
        _activeMonthDetail = detail;
      }
      _items = detail['items'] is List ? detail['items'] as List : [];
      _transactions = detail['transactions'] is List ? detail['transactions'] as List : [];
      _goals = detail['goals'] is List ? detail['goals'] as List : [];
      _evaluatedGoals = detail['evaluatedGoals'] is List
          ? detail['evaluatedGoals'] as List
          : _goals;
      if (detail['bankAccounts'] is List) _bankAccounts = detail['bankAccounts'] as List;
      if (detail['wallets'] is List) _wallets = detail['wallets'] as List;
      if (detail['transfers'] is List) _transfers = detail['transfers'] as List;

      // Centralized Backend Simulation Deserialization (ADR 0052)
      if (detail['simulation'] is Map) {
        try {
          _simulation = SimulationResult.fromJson(Map<String, dynamic>.from(detail['simulation'] as Map));
        } catch (_) {}
      }
      if (detail['accountSimulations'] is Map) {
        try {
          final accMap = detail['accountSimulations'] as Map;
          final parsed = <String, SimulationResult>{};
          accMap.forEach((key, val) {
            if (val is Map) {
              parsed[key.toString()] = SimulationResult.fromJson(Map<String, dynamic>.from(val));
            }
          });
          _accountSimulations = parsed;
        } catch (_) {}
      }
    } catch (_) {
      // Month might not exist yet
      _activeMonthDetail = null;
      _items = [];
      _transactions = [];
      _goals = [];
      _evaluatedGoals = [];
      _simulation = null;
      _accountSimulations = {};
    }
  }

  Future<void> _fetchAccountsAndTransfers() async {
    try {
      final banks = await _api.getBankAccounts();
      final wList = await _api.getWallets();
      _bankAccounts = banks;
      _wallets = wList;

      final trs = await _api.getTransfers(_activeMonthDetail?['_id']?.toString());
      _transfers = trs;
    } catch (_) {}
  }

  Future<void> refresh() async {
    await _fetchActiveMonthDetails();
    await _fetchAccountsAndTransfers();
    _runLocalEngine();
  }

  // Month actions
  Future<void> createMonth(int year, int month, {num opening = 0, num income = 0, num floor = 0, int creditDay = 1, bool carryoverBalance = false}) async {
    await _api.createMonth({
      'year': year,
      'month': month,
      'openingBalance': opening,
      'incomeAmount': income,
      'safetyFloor': floor,
      'incomeCreditDay': creditDay,
      'carryoverBalance': carryoverBalance,
    });
    await loadInitialData();
  }

  Future<void> rolloverMonth({bool carryBalance = true, bool rolloverUnpaid = false}) async {
    await _api.rolloverMonth(_currentYear, _currentMonth, carryBalance: carryBalance, rolloverUnpaid: rolloverUnpaid);
    await loadInitialData();
  }

  Future<void> deleteMonth({bool force = false}) async {
    await _api.deleteMonth(_currentYear, _currentMonth, force: force);
    await loadInitialData();
  }

  Future<void> updateSalaryFloor({
    num? income,
    num? floor,
    int? creditDay,
    String? bankAccountId,
    String? salaryCreditedDate,
    bool? isSalaryCredited,
  }) async {
    final updates = <String, dynamic>{};
    if (income != null) updates['incomeAmount'] = income;
    if (floor != null) updates['safetyFloor'] = floor;
    if (creditDay != null) updates['incomeCreditDay'] = creditDay;
    if (bankAccountId != null) updates['salaryBankAccountId'] = bankAccountId;
    if (salaryCreditedDate != null) {
      updates['salaryCreditedDate'] = salaryCreditedDate;
      updates['incomeCreditDate'] = salaryCreditedDate;
    }
    if (isSalaryCredited != null) updates['isSalaryCredited'] = isSalaryCredited;

    await _api.updateMonth(_currentYear, _currentMonth, updates);
    await refresh();
  }

  Future<void> creditSalary({num? amount, String? bankAccountId, String? date}) async {
    await _api.creditSalary(_currentYear, _currentMonth, {
      if (amount != null) 'amount': amount,
      if (bankAccountId != null) 'bankAccountId': bankAccountId,
      if (date != null) 'date': date,
    });
    await refresh();
  }

  // Unified Transactions
  Future<void> addTransaction(Map<String, dynamic> tx) async {
    await _api.createTransaction(_currentYear, _currentMonth, tx);
    await refresh();
  }

  Future<void> updateTransaction(String id, Map<String, dynamic> updates) async {
    await _api.updateTransaction(id, updates);
    await refresh();
  }

  Future<void> payTransaction(String id, {String? accountId, num? amount, String? date}) async {
    await _api.payTransaction(id, accountId: accountId, amount: amount, date: date);
    await refresh();
  }

  Future<void> cancelTransaction(String id, {String? goalAction}) async {
    await _api.cancelTransaction(id, goalAction: goalAction);
    await refresh();
  }

  Future<void> deleteTransaction(String id) async {
    await _api.deleteTransaction(id);
    await refresh();
  }

  // Legacy item aliases for backwards compatibility
  Future<void> addItem(Map<String, dynamic> item) => addTransaction({
    ...item,
    'status': item['isPaid'] == true ? 'successful' : 'planned',
    'origin': 'planned',
    'plannedAmount': item['plannedAmount'] ?? item['amount'],
    'plannedDate': item['plannedDate'] ?? item['date'],
  });

  Future<void> updateItem(String id, Map<String, dynamic> updates) => updateTransaction(id, updates);

  Future<void> deleteItem(String id) => deleteTransaction(id);

  // Goals
  Future<void> addGoal(Map<String, dynamic> goal) async {
    await _api.createGoal(_currentYear, _currentMonth, goal);
    await refresh();
  }

  Future<void> convertGoalToTransaction(String id) async {
    await _api.convertGoalToTransaction(id);
    await refresh();
  }

  Future<void> convertGoalToItem(String id) => convertGoalToTransaction(id);

  Future<void> deferGoal(String id) async {
    await _api.deferGoal(id);
    await refresh();
  }

  Future<void> reactivateGoal(String id) async {
    await _api.reactivateGoal(id);
    await refresh();
  }

  Future<void> deleteGoal(String id) async {
    await _api.deleteGoal(id);
    await refresh();
  }

  // Accounts & Wallets
  Future<void> addBankAccount(Map<String, dynamic> body) async {
    await _api.createBankAccount(body);
    await refresh();
  }

  Future<void> updateBankAccount(String id, Map<String, dynamic> updates) async {
    await _api.updateBankAccount(id, updates);
    await refresh();
  }

  Future<void> deleteBankAccount(String id) async {
    await _api.deleteBankAccount(id);
    await refresh();
  }

  Future<void> addWallet(Map<String, dynamic> body) async {
    await _api.createWallet(body);
    await refresh();
  }

  Future<void> updateWallet(String id, Map<String, dynamic> updates) async {
    await _api.updateWallet(id, updates);
    await refresh();
  }

  Future<void> deleteWallet(String id) async {
    await _api.deleteWallet(id);
    await refresh();
  }

  // Transfers
  Future<void> addTransfer(Map<String, dynamic> body) async {
    final mId = body['monthId'] ??
        _activeMonthDetail?['_id'] ??
        _activeMonthDetail?['id'] ??
        (activeMonth != null
            ? (activeMonth!['_id'] ??
                activeMonth!['id'] ??
                (activeMonth!['month'] is Map
                    ? (activeMonth!['month']['_id'] ?? activeMonth!['month']['id'])
                    : null))
            : null);
    await _api.createTransfer({
      ...body,
      if (mId != null) 'monthId': mId,
      'year': _currentYear,
      'month': _currentMonth,
    });
    await refresh();
  }

  Future<void> deleteTransfer(String id) async {
    await _api.deleteTransfer(id);
    await refresh();
  }
}
