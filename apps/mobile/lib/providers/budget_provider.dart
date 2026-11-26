import 'dart:async';

import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/outbox.dart';
import '../services/storage_service.dart';
import '../engine/engine.dart';
import '../models/account.dart';
import '../models/goal.dart';
import '../models/month_detail.dart';
import '../models/person_fund.dart';
import '../models/transaction.dart';
import '../models/transfer.dart';
import '../models/transaction_lists.dart';

/// Why the last load did not complete. The data already on screen is kept;
/// [hasData] says whether there is any to show.
class BudgetLoadError {
  final ApiErrorKind kind;
  final String message;
  final bool hasData;

  /// When data was last loaded successfully, if ever.
  final DateTime? lastLoadedAt;

  const BudgetLoadError({
    required this.kind,
    required this.message,
    required this.hasData,
    this.lastLoadedAt,
  });

  bool get isOffline => kind == ApiErrorKind.offline || kind == ApiErrorKind.timeout;
  bool get isSessionExpired => kind == ApiErrorKind.unauthorized;
}

/// The month to open when the current calendar month has no plan: the latest
/// month on or before [today], else the earliest one after it.
/// Returns null when [months] is empty. Does not depend on the server's order.
/// Web's isFuturePeriod: not started yet. A month named after a later month
/// than today is future unless 15 days after its start fall in that month (a
/// salary cycle named December can start on 30 Nov; a ghost month cannot).
bool isFuturePeriod(Map m, DateTime today) {
  String iso(DateTime d) => '${d.year}-${'${d.month}'.padLeft(2, '0')}-${'${d.day}'.padLeft(2, '0')}';
  final start = m['startDate'] is String ? m['startDate'] as String : null;
  if (start != null && start.compareTo(iso(today)) > 0) return true;
  final y = num.tryParse('${m['year']}')?.toInt() ?? 0;
  final mo = num.tryParse('${m['month']}')?.toInt() ?? 0;
  final namedLater = y > today.year || (y == today.year && mo > today.month);
  if (!namedLater || start == null) return namedLater;
  final p = start.split('-').map(int.parse).toList();
  final mid = DateTime.utc(p[0], p[1], p[2] + 15);
  return !(mid.year == y && mid.month == mo);
}

({int year, int month})? pickInitialMonth(List<dynamic> months, DateTime today) {
  final parsed = <({int year, int month})>[];
  final today0 = '${today.year}-${'${today.month}'.padLeft(2, '0')}-${'${today.day}'.padLeft(2, '0')}';
  for (final m in months) {
    if (m is! Map) continue;
    // The cycle that contains today wins (a salary cycle can be named after the next month)
    final start = m['startDate'], end = m['endDate'];
    if (start is String && end is String && end.compareTo(today0) >= 0 && !isFuturePeriod(m, today) && m['isClosed'] != true) {
      final y = num.tryParse('${m['year']}')?.toInt(), mo = num.tryParse('${m['month']}')?.toInt();
      if (y != null && mo != null) return (year: y, month: mo);
    }
    final y = num.tryParse('${m['year']}')?.toInt();
    final mo = num.tryParse('${m['month']}')?.toInt();
    if (y == null || mo == null || mo < 1 || mo > 12) continue;
    parsed.add((year: y, month: mo));
  }
  if (parsed.isEmpty) return null;
  int key(({int year, int month}) m) => m.year * 12 + m.month;
  final todayKey = today.year * 12 + today.month;
  parsed.sort((a, b) => key(a).compareTo(key(b)));
  final exact = parsed.where((m) => key(m) == todayKey);
  if (exact.isNotEmpty) return exact.first;
  final past = parsed.where((m) => key(m) < todayKey);
  if (past.isNotEmpty) return past.last;
  return parsed.first;
}

class BudgetProvider with ChangeNotifier {
  BudgetProvider({ApiService? api}) : _api = api ?? ApiService();

  final ApiService _api;

  // Initial loads and month switches in flight (pull-to-refresh is not counted).
  int _loadingOps = 0;
  String? _error;
  BudgetLoadError? _loadError;
  DateTime? _lastLoadedAt;
  bool _monthMissing = false;

  // Writes run one at a time, in the order they were made.
  Future<void> _writeChain = Future<void>.value();
  int _pendingWrites = 0;

  // Each load gets a number; a load that finishes after a newer one started is dropped.
  int _loadGeneration = 0;

  int _currentYear = DateTime.now().year;
  int _currentMonth = DateTime.now().month;

  List<dynamic> _months = [];
  Map<String, dynamic>? _activeMonthDetail;
  List<dynamic> _items = [];
  List<dynamic> _transactions = [];
  MonthInfo? _monthInfo;

  // Typed views of the raw lists, parsed once per source list (upgrade plan
  // 1.1). Derived from the raw getters, so a subclass that overrides those
  // (test fakes) gets matching typed lists. A load validates every row first
  // (_loadMonth / _applyMonthDetail) and seeds this cache.
  final Map<String, (Object, Object)> _typedCache = {};

  T _typed<T extends Object>(String key, Object source, T Function() parse) {
    final hit = _typedCache[key];
    if (hit != null && identical(hit.$1, source)) return hit.$2 as T;
    final parsed = parse();
    _typedCache[key] = (source, parsed);
    return parsed;
  }

  void _seed(String key, Object source, Object parsed) => _typedCache[key] = (source, parsed);

  List<T> _typedList<T>(String key, List<dynamic> source, T Function(Object?) parse) =>
      _typed<List<T>>(key, source, () => List<T>.unmodifiable(source.map(parse)));
  List<dynamic> _goals = [];
  List<dynamic> _evaluatedGoals = [];
  List<dynamic> _bankAccounts = [];
  bool _accountsKnown = false;

  /// The server answered and the user has no bank account or wallet yet:
  /// first-run setup (web's showOnboarding).
  bool get needsSetup => _accountsKnown && _bankAccounts.isEmpty && _wallets.isEmpty;

  /// Setup creates accounts and settings through the API directly.
  ApiService get api => _api;
  List<dynamic> _wallets = [];
  List<dynamic> _transfers = [];
  List<dynamic> _creditCards = [];
  Map<String, dynamic> _userSettings = {};

  SimulationResult? _simulation;
  Map<String, SimulationResult> _accountSimulations = {};

  // Getters
  bool get isLoading => _loadingOps > 0;

  // Bumped whenever loaded month data is replaced (upgrade plan 2.2).
  int _dataVersion = 0;

  /// What the tab screens and the header draw from, as one comparable value:
  /// `context.select((b) => b.viewState)` rebuilds them when data, the month,
  /// loading or the load error change, and not for a save in flight or the
  /// sync strip (all five tabs stay alive in an IndexedStack).
  ({int data, int year, int month, bool loading, bool missing, BudgetLoadError? error}) get viewState => (
        data: _dataVersion,
        year: _currentYear,
        month: _currentMonth,
        loading: isLoading,
        missing: _monthMissing,
        error: _loadError,
      );

  /// Message of the last failure, load or write-then-reload.
  String? get error => _error;

  /// Set when the last load failed for any reason other than "this month does
  /// not exist". Cleared by the next successful load.
  BudgetLoadError? get loadError => _loadError;

  /// When month data was last loaded successfully.
  DateTime? get lastLoadedAt => _lastLoadedAt;

  /// True only when the server said the selected month does not exist (404).
  bool get monthMissing => _monthMissing;

  /// A write is queued or in flight; forms should not allow a second submit.
  bool get isSaving => _pendingWrites > 0;

  int get currentYear => _currentYear;
  int get currentMonth => _currentMonth;
  List<dynamic> get months => _months;
  Map<String, dynamic>? get activeMonth => _activeMonthDetail;
  List<dynamic> get items => _items;
  List<dynamic> get transactions => _transactions;

  /// The month's transactions as typed models (upgrade plan 1.1).
  List<Transaction> get transactionModels => _typedList('transactions', transactions, Transaction.fromJson);

  /// Sorted and filtered lists for the Transactions screen, built once per load.
  TransactionLists get transactionLists {
    final models = transactionModels;
    return _typed('transactionLists', models, () => TransactionLists.from(models));
  }

  /// The selected month's header, typed; null when no month is loaded.
  MonthInfo? get monthInfo => _monthInfo;
  List<Account> get bankAccountModels =>
      _typedList('banks', bankAccounts, (a) => Account.fromJson(a, fallbackKind: AccountKind.bank));
  List<Account> get walletModels =>
      _typedList('wallets', wallets, (a) => Account.fromJson(a, fallbackKind: AccountKind.wallet));

  /// Cards as the month simulation reports them (owed today, payability score).
  List<SimulatedCard> get simulatedCards => _typedList('cards', creditCards, SimulatedCard.fromJson);

  /// Cards as accounts, for account pickers.
  List<Account> get cardAccountModels {
    final cards = simulatedCards;
    return _typed('cardAccounts', cards, () => List<Account>.unmodifiable(cards.map((c) => c.account)));
  }

  /// Goals with the engine's recommendation, in the server's (priority) order.
  List<Goal> get goalModels => _typedList('goals', evaluatedGoals, Goal.fromJson);
  List<Transfer> get transferModels => _typedList('transfers', transfers, Transfer.fromJson);

  /// A bank, wallet or card by id; null when it is not loaded.
  Account? accountById(String? id) {
    if (id == null) return null;
    for (final a in [...bankAccountModels, ...walletModels, ...cardAccountModels]) {
      if (a.id == id) return a;
    }
    return null;
  }

  /// Name of a bank, wallet or card by id, for lists that only carry ids
  /// (transfers); null when the account is not loaded.
  String? accountName(String? id) => accountById(id)?.name;
  List<dynamic> get goals => _goals;
  List<dynamic> get evaluatedGoals => _evaluatedGoals;
  List<dynamic> get bankAccounts => _bankAccounts;
  List<dynamic> get wallets => _wallets;
  /// Credit cards with what is owed and the payability score (from the server simulation)
  List<dynamic> get creditCards => _creditCards;
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

  /// Sum of today's balances across banks and wallets, or null when any
  /// account has no current balance (an opening balance is not today's).
  int? get totalAccountsBalance {
    int sum = 0;
    for (var a in allAccounts) {
      if (a is! Map) continue;
      final current = num.tryParse('${a['currentBalance']}');
      if (current == null) return null;
      sum += current.round();
    }
    return sum;
  }

  Future<Map<String, dynamic>> recommendPurchaseDate(num purchaseAmount) async {
    try {
      return await _api.recommendPurchaseDate(_currentYear, _currentMonth, purchaseAmount);
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  bool get _hasMonthData => _activeMonthDetail != null;

  void _recordLoadFailure(Object e) {
    final kind = e is ApiException ? e.kind : ApiErrorKind.badResponse;
    _error = e.toString();
    _loadError = BudgetLoadError(
      kind: kind,
      message: e.toString(),
      hasData: _hasMonthData,
      lastLoadedAt: _lastLoadedAt,
    );
  }

  void _recordLoadSuccess() {
    _error = null;
    _loadError = null;
    _lastLoadedAt = DateTime.now();
    _cachedAt = null;
    // The server answered: a good moment to send what waits.
    if (_hasSendable) scheduleMicrotask(syncNow);
  }

  Future<void> loadInitialData() async {
    final generation = ++_loadGeneration;
    _loadingOps++;
    _error = null;
    notifyListeners();

    try {
      await _restoreOutbox();
      final restored = await _restoreCache();
      if (restored) notifyListeners();
      final settings = await _api.getSettings();
      final monthsList = await _api.getMonths();
      if (generation != _loadGeneration) return;
      _userSettings = settings;
      _months = monthsList;
      _dataVersion++;

      // A restored cache only stands in until the server answers: the start
      // month is chosen from today, as without a cache.
      final hasCurrent = !restored && _months.any((m) =>
          m is Map &&
          '${m['year']}' == '$_currentYear' &&
          '${m['month']}' == '$_currentMonth');
      if (!hasCurrent) {
        final pick = pickInitialMonth(_months, DateTime.now());
        if (pick != null) {
          _currentYear = pick.year;
          _currentMonth = pick.month;
        }
      }
      _homeMonth = (year: _currentYear, month: _currentMonth);

      await _loadMonth(generation);
    } catch (e) {
      if (generation == _loadGeneration) _recordLoadFailure(e);
    } finally {
      _loadingOps--;
      notifyListeners();
    }
  }

  Future<void> switchMonth(int year, int month) async {
    final generation = ++_loadGeneration;
    _currentYear = year;
    _currentMonth = month;
    _loadingOps++;
    notifyListeners();

    try {
      await _loadMonth(generation);
    } catch (e) {
      if (generation == _loadGeneration) _recordLoadFailure(e);
    } finally {
      _loadingOps--;
      notifyListeners();
    }
  }

  /// Reloads the selected month. Never throws: a failure is kept in [loadError]
  /// and the data already loaded stays on screen.
  Future<void> refresh() async {
    final generation = ++_loadGeneration;
    try {
      await _loadMonth(generation);
    } catch (e) {
      if (generation == _loadGeneration) _recordLoadFailure(e);
    } finally {
      if (generation == _loadGeneration) notifyListeners();
    }
  }

  /// Loads month detail and goals, and applies them only if no newer load
  /// started meanwhile. A 404 on the month means it does not exist; any other
  /// failure is rethrown and leaves the current data in place.
  ///
  /// Two requests, in parallel (upgrade plan 2.1): month detail already carries
  /// the active banks, wallets and the month's transfers. Only a missing month
  /// needs the accounts fetched on their own.
  Future<void> _loadMonth(int generation) async {
    final year = _currentYear, month = _currentMonth;
    final owner = await StorageService.getToken();
    final detailFuture = _api.getMonthDetail(year, month);
    // Month detail carries no goals: they have their own (evaluated) list.
    final goalsFuture = _api.getGoals(year, month);
    // Not awaited when the month is missing; keep its 404 from going uncaught.
    goalsFuture.then((_) {}, onError: (Object _) {});

    Map<String, dynamic>? detail;
    try {
      detail = await detailFuture;
    } on ApiException catch (e) {
      if (e.kind != ApiErrorKind.notFound) rethrow;
    }
    final missing = detail == null;

    final List<dynamic> banks, wallets, transfers, goals;
    if (missing) {
      final accounts = await Future.wait([_api.getBankAccounts(), _api.getWallets()]);
      banks = accounts[0];
      wallets = accounts[1];
      transfers = const [];
      goals = const [];
    } else {
      banks = _listIn(detail, 'bankAccounts');
      wallets = _listIn(detail, 'wallets');
      transfers = _listIn(detail, 'transfers');
      goals = await goalsFuture;
    }

    if (generation != _loadGeneration) return;

    _apply(detail, goals: goals, banks: banks, wallets: wallets, transfers: transfers);
    _recordLoadSuccess();
    if (detail != null) _saveCache(year, month, detail, goals, owner);
  }

  /// Applies one month's data. Reads everything before applying anything: one
  /// unreadable row leaves the whole previous state in place and throws
  /// [ApiException] (badResponse). A null [detail] means the month does not exist.
  void _apply(
    Map<String, dynamic>? detail, {
    required List<dynamic> goals,
    required List<dynamic> banks,
    required List<dynamic> wallets,
    required List<dynamic> transfers,
  }) {
    final missing = detail == null;
    _dataVersion++;
    final MonthInfo? monthInfo;
    final List<Account> bankModels;
    final List<Account> walletModels;
    final List<Goal> goalModels;
    final List<Transfer> transferModels;
    try {
      monthInfo = missing ? null : MonthInfo.fromJson(_monthOf(detail));
      bankModels = List.unmodifiable(banks.map((a) => Account.fromJson(a, fallbackKind: AccountKind.bank)));
      walletModels = List.unmodifiable(wallets.map((a) => Account.fromJson(a, fallbackKind: AccountKind.wallet)));
      goalModels = List.unmodifiable(goals.map(Goal.fromJson));
      transferModels = List.unmodifiable(transfers.map(Transfer.fromJson));
    } on FormatException catch (e) {
      throw ApiException('Data from the server could not be read (${e.message}).', 200, ApiErrorKind.badResponse);
    }

    if (missing) {
      _monthMissing = true;
      _activeMonthDetail = null;
      _items = [];
      _transactions = [];
      _goals = [];
      _evaluatedGoals = [];
      _monthInfo = null;
      _simulation = null;
      _accountSimulations = {};
    } else {
      _monthMissing = false;
      _applyMonthDetail(detail);
      _goals = goals;
      _evaluatedGoals = goals;
      _monthInfo = monthInfo;
      moneySymbol = monthInfo?.currencySymbol ?? kDefaultCurrencySymbol;
    }
    _bankAccounts = banks;
    _wallets = wallets;
    _accountsKnown = true;
    _transfers = transfers;
    _seed('goals', _evaluatedGoals, goalModels);
    _seed('banks', banks, bankModels);
    _seed('wallets', wallets, walletModels);
    _seed('transfers', transfers, transferModels);
  }

  // ---- Read cache (upgrade plan 2.6) ----
  // The last month loaded from the server is kept on the device, so a cold
  // start shows it at once (marked with its time) while the reload runs, and
  // an offline start still has something to show. Balances are never computed
  // here: these are the server's own figures from that moment (ADR 0052).

  DateTime? _cachedAt;

  // The month a cold start opens; only it is cached, so browsing other months
  // does not change what the next start shows first.
  ({int year, int month})? _homeMonth;

  /// Set while the data on screen came from the device cache and the server
  /// has not answered yet: when that data was loaded from the server.
  DateTime? get showingSavedDataFrom => _cachedAt;

  /// Shows the cached month if nothing is loaded yet. Returns whether it did.
  Future<bool> _restoreCache() async {
    if (_hasMonthData) return false;
    final saved = await StorageService.readMonthCache();
    if (saved == null || _hasMonthData) return false;
    try {
      final detail = Map<String, dynamic>.from(saved['detail'] as Map);
      final savedAt = DateTime.parse(saved['savedAt'] as String);
      final year = saved['year'] as int, month = saved['month'] as int;
      _apply(
        detail,
        goals: saved['goals'] as List,
        banks: _listIn(detail, 'bankAccounts'),
        wallets: _listIn(detail, 'wallets'),
        transfers: _listIn(detail, 'transfers'),
      );
      _currentYear = year;
      _currentMonth = month;
      _lastLoadedAt = savedAt;
      _cachedAt = savedAt;
      return true;
    } catch (_) {
      // Unreadable (an older app version wrote it): drop it, load as usual.
      await StorageService.clearMonthCache();
      return false;
    }
  }

  /// Saves the month just loaded, unless the user signed out (or another
  /// user signed in) while it loaded: [owner] is the token the load started with.
  void _saveCache(int year, int month, Map<String, dynamic> detail, List<dynamic> goals, String? owner) {
    if (owner == null || _homeMonth != (year: year, month: month)) return;
    StorageService.writeMonthCache({
      'year': year,
      'month': month,
      'savedAt': DateTime.now().toIso8601String(),
      'detail': detail,
      'goals': goals,
    }, owner: owner);
  }

  Map<String, dynamic>? _monthOf(Map<String, dynamic> detail) =>
      detail['month'] is Map ? Map<String, dynamic>.from(detail['month'] as Map) : detail;

  /// A list the month detail must carry; a missing one is an unreadable
  /// response, not an empty list (an empty account list would look real).
  static List<dynamic> _listIn(Map<String, dynamic> detail, String key) {
    final value = detail[key];
    if (value is List) return value;
    throw ApiException('Month data from the server has no $key list.', 200, ApiErrorKind.badResponse);
  }

  /// Throws [ApiException] (badResponse) if the simulation or any transaction
  /// cannot be read; nothing is applied then, so a stale or half-read month is
  /// never shown as current.
  void _applyMonthDetail(Map<String, dynamic> detail) {
    SimulationResult? simulation;
    final accountSims = <String, SimulationResult>{};
    final rawTransactions = detail['transactions'] is List ? detail['transactions'] as List : const [];
    final simCards = detail['simulation'] is Map ? (detail['simulation'] as Map)['cards'] : null;
    final List<dynamic>? rawCards = (simCards is List && simCards.isNotEmpty)
        ? simCards
        : (detail['creditCards'] is List ? detail['creditCards'] as List : null);
    List<Transaction> transactionModels;
    List<SimulatedCard>? cardModels;
    try {
      transactionModels = List.unmodifiable(rawTransactions.map(Transaction.fromJson));
      cardModels = rawCards == null ? null : List.unmodifiable(rawCards.map(SimulatedCard.fromJson));
    } on FormatException catch (e) {
      throw ApiException('A transaction or card from the server could not be read (${e.message}).', 200,
          ApiErrorKind.badResponse);
    }
    try {
      if (detail['simulation'] is Map) {
        simulation = SimulationResult.fromJson(Map<String, dynamic>.from(detail['simulation'] as Map));
      }
      if (detail['accountSimulations'] is Map) {
        (detail['accountSimulations'] as Map).forEach((key, val) {
          if (val is Map) {
            accountSims[key.toString()] = SimulationResult.fromJson(Map<String, dynamic>.from(val));
          }
        });
      }
    } catch (e) {
      throw ApiException('The plan from the server could not be read ($e).', 200, ApiErrorKind.badResponse);
    }

    _activeMonthDetail = _monthOf(detail);
    _items = detail['items'] is List ? detail['items'] as List : [];
    _transactions = rawTransactions;
    _seed('transactions', rawTransactions, transactionModels);
    if (rawCards != null) {
      _creditCards = rawCards;
      _seed('cards', rawCards, cardModels!);
    }
    // Centralized Backend Simulation Deserialization (ADR 0052)
    _simulation = simulation;
    _accountSimulations = accountSims;
  }

  /// Runs [op] after every earlier write has finished, then reloads. The
  /// returned future fails with the write's error; a failed reload after a
  /// successful write is kept in [loadError] instead, since the write did happen.
  Future<void> _write(Future<void> Function() op, {Future<void> Function()? reload}) {
    _pendingWrites++;
    notifyListeners();
    final run = _writeChain.then((_) async {
      try {
        await op();
        await (reload ?? refresh)();
      } finally {
        _pendingWrites--;
        notifyListeners();
      }
    });
    // The chain keeps going after a failed write.
    _writeChain = run.catchError((Object _) {});
    return run;
  }

  // Month actions
  Future<void> rolloverMonth({bool carryBalance = true, bool rolloverUnpaid = false}) => _write(() async {
      await _api.rolloverMonth(_currentYear, _currentMonth, carryBalance: carryBalance, rolloverUnpaid: rolloverUnpaid);
  }, reload: loadInitialData);

  Future<void> deleteMonth({bool force = false}) => _write(() async {
      await _api.deleteMonth(_currentYear, _currentMonth, force: force);
  }, reload: loadInitialData);

  Future<void> updateSalaryFloor({
    num? income,
    num? floor,
    int? creditDay,
    String? bankAccountId,
    String? salaryCreditedDate,
    bool? isSalaryCredited,
  }) => _write(() async {
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
  });

  Future<void> creditSalary({num? amount, String? bankAccountId, String? date}) => _write(() async {
      await _api.creditSalary(_currentYear, _currentMonth, {
        if (amount != null) 'amount': amount,
        if (bankAccountId != null) 'bankAccountId': bankAccountId,
        if (date != null) 'date': date,
      });
  });

  // Unified Transactions
  /// A spend, refund or income. Captured on the phone first (ADR 0071): it
  /// returns [WriteResult.queued] when the server can't be reached, and
  /// throws only when the server refuses it.
  Future<WriteResult> addTransaction(Map<String, dynamic> tx) {
    final isIncome = tx['isIncome'] == true || tx['type'] == 'income';
    final amount = num.tryParse('${tx['amount']}')?.round().abs() ?? 0;
    return _capture(
      kind: isIncome ? OutboxKind.income : OutboxKind.spend,
      path: ApiService.createTransactionPath(_currentYear, _currentMonth),
      body: tx,
      label: '${tx['description'] ?? tx['name'] ?? tx['category'] ?? (isIncome ? 'Income' : 'Spend')}',
      amount: amount,
    );
  }

  Future<void> updateTransaction(String id, Map<String, dynamic> updates) => _write(() async {
      await _api.updateTransaction(id, updates);
  });

  /// Marks a planned transaction paid; captured like [addTransaction].
  Future<WriteResult> payTransaction(String id, {String? accountId, num? amount, String? date}) {
    Transaction? tx;
    for (final t in transactionModels) {
      if (t.id == id) tx = t;
    }
    return _capture(
      kind: OutboxKind.markPaid,
      path: ApiService.payTransactionPath(id),
      body: ApiService.payBody(accountId: accountId, amount: amount, date: date),
      label: tx?.name ?? 'Payment',
      amount: (amount ?? tx?.plannedAmount ?? tx?.amount ?? 0).round().abs(),
    );
  }

  Future<void> cancelTransaction(String id, {String? goalAction}) => _write(() async {
      await _api.cancelTransaction(id, goalAction: goalAction);
  });

  Future<void> deleteTransaction(String id) => _write(() async {
      await _api.deleteTransaction(id);
  });

  // Credit cards
  Future<List<dynamic>> getCards() => _api.getCards();

  /// GET /api/v1/cards, typed: each card with its open bill and statements.
  Future<List<CreditCardSummary>> getCardSummaries() async =>
      (await getCards()).map(CreditCardSummary.fromJson).toList();

  Future<void> createCard(Map<String, dynamic> body) => _write(() async {
      await _api.createCard(body);
  });

  /// Cards are accounts of type credit_card: edits and removal go through /accounts.
  Future<void> updateCard(String id, Map<String, dynamic> updates) => _write(() async {
      await _api.updateBankAccount(id, updates);
  });

  Future<void> archiveCard(String id) => _write(() async {
      await _api.deleteBankAccount(id);
  });

  Future<void> confirmCardStatement(String statementId, Map<String, dynamic> body) => _write(() async {
      await _api.confirmCardStatement(statementId, body);
  });

  Future<void> payCardStatement(String statementId, Map<String, dynamic> body) => _write(() async {
      await _api.payCardStatement(statementId, body);
  });

  // Held & Lent money: someone's money with you, or yours with them (never income or expense)
  Future<Map<String, dynamic>> getPersonFunds() => _api.getPersonFunds();

  /// The server's net worth for the open month (bank + wallets + lent − cards − held), or null.
  Future<Map<String, dynamic>?> getNetWorth() async {
    try {
      final nw = (await _api.getMonthSummary(_currentYear, _currentMonth))['netWorth'];
      return nw is Map<String, dynamic> ? nw : null;
    } catch (_) {
      return null;
    }
  }

  /// GET /api/v1/person-funds, typed.
  Future<PersonFunds> getPersonFundsTyped() async => PersonFunds.fromJson(await getPersonFunds());

  Future<Map<String, dynamic>> getPersonFund(String id) => _api.getPersonFund(id);

  Future<void> createPersonFund(Map<String, dynamic> body) => _write(() async {
      await _api.createPersonFund(body);
  });

  Future<void> addPersonFundEntry(String id, Map<String, dynamic> body) => _write(() async {
      await _api.addPersonFundEntry(id, body);
  });

  Future<void> reclassifyTransaction(String id, Map<String, dynamic> body) => _write(() async {
      await _api.reclassifyTransaction(id, body);
  });

  /// PUT /api/settings (e.g. the assistant switch); the saved values show at once.
  Future<void> updateUserSettings(Map<String, dynamic> updates) async {
    await _api.updateSettings(updates);
    _userSettings = {..._userSettings, ...updates};
    _dataVersion++; // screens watching viewState redraw
    notifyListeners();
  }

  // Legacy item aliases for backwards compatibility
  // A planned bill is not captured offline (ADR 0071): it waits for the server.
  Future<void> addItem(Map<String, dynamic> item) => _write(() async {
        await _api.createTransaction(_currentYear, _currentMonth, {
          ...item,
          'status': item['isPaid'] == true ? 'successful' : 'planned',
          'origin': 'planned',
          'plannedAmount': item['plannedAmount'] ?? item['amount'],
          'plannedDate': item['plannedDate'] ?? item['date'],
        });
      });

  Future<void> updateItem(String id, Map<String, dynamic> updates) => updateTransaction(id, updates);

  Future<void> deleteItem(String id) => deleteTransaction(id);

  // Goals
  Future<void> addGoal(Map<String, dynamic> goal) => _write(() async {
      await _api.createGoal(_currentYear, _currentMonth, goal);
  });

  Future<void> convertGoalToTransaction(String id) => _write(() async {
      await _api.convertGoalToTransaction(id);
  });

  Future<void> convertGoalToItem(String id) => convertGoalToTransaction(id);

  Future<void> deferGoal(String id) => _write(() async {
      await _api.deferGoal(id);
  });

  Future<void> reactivateGoal(String id) => _write(() async {
      await _api.reactivateGoal(id);
  });

  Future<void> deleteGoal(String id) => _write(() async {
      await _api.deleteGoal(id);
  });

  Future<void> updateGoal(String id, Map<String, dynamic> updates) => _write(() async {
      await _api.updateGoal(id, updates);
  });

  // Accounts & Wallets
  Future<void> addBankAccount(Map<String, dynamic> body) => _write(() async {
      await _api.createBankAccount(body);
  });

  Future<void> updateBankAccount(String id, Map<String, dynamic> updates) => _write(() async {
      await _api.updateBankAccount(id, updates);
  });

  Future<void> deleteBankAccount(String id) => _write(() async {
      await _api.deleteBankAccount(id);
  });

  Future<void> addWallet(Map<String, dynamic> body) => _write(() async {
      await _api.createWallet(body);
  });

  Future<void> updateWallet(String id, Map<String, dynamic> updates) => _write(() async {
      await _api.updateWallet(id, updates);
  });

  Future<void> deleteWallet(String id) => _write(() async {
      await _api.deleteWallet(id);
  });

  // Transfers
  Future<void> addTransfer(Map<String, dynamic> body) => _write(() async {
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
  });

  Future<void> deleteTransfer(String id) => _write(() async {
      await _api.deleteTransfer(id);
  });

  // ---- Outbox (upgrade plan 2.7 / 2.8, ADR 0071) ----
  // Spends, income and mark-paid are saved on the phone before they are sent
  // (write-ahead), then sent with the key they were captured with. While one
  // is on its way it shows as "Saving…"; when the server can't be reached it
  // stays as "waiting to sync" and is sent after the next good load, or every
  // [syncRetryInterval]. Balances never change on the phone (ADR 0052): they
  // update when the server has the entry.

  List<OutboxEntry> _outbox = [];
  bool _outboxLoaded = false;
  String? _owner;
  final Set<String> _sendingKeys = {};
  bool _syncing = false;
  Timer? _retryTimer;
  final StreamController<String> _notices = StreamController<String>.broadcast();

  /// How often waiting entries are retried while the app runs.
  Duration syncRetryInterval = const Duration(seconds: 30);

  /// Messages for a snackbar: background sends the server refused.
  Stream<String> get notices => _notices.stream;

  /// This user's captured entries, oldest first.
  List<OutboxEntry> get pendingEntries => List.unmodifiable(_outbox.where((e) => e.owner == _owner));

  /// The entry is being sent right now.
  bool isSending(String key) => _sendingKeys.contains(key);

  bool get _hasSendable {
    final now = DateTime.now();
    return _outbox.any(
        (e) => e.owner == _owner && e.error == null && !e.isStale(now) && !_sendingKeys.contains(e.key));
  }

  Future<void> _restoreOutbox() async {
    _owner = await StorageService.getUserId();
    if (_outboxLoaded) return;
    _outbox = await OutboxStore.read();
    _outboxLoaded = true;
  }

  Future<void> _saveOutbox() => OutboxStore.write(_outbox);

  void _replace(String key, OutboxEntry? entry) {
    final i = _outbox.indexWhere((e) => e.key == key);
    if (i < 0) return;
    if (entry == null) {
      _outbox.removeAt(i);
    } else {
      _outbox[i] = entry;
    }
  }

  /// Wait and send again later, or give up? 401 waits for a new sign-in; 409
  /// in progress means the first attempt is still running on the server.
  static bool _worthRetrying(ApiException e) =>
      e.isTransient ||
      e.kind == ApiErrorKind.unauthorized ||
      (e.statusCode == 409 && e.code == 'IDEMPOTENCY_IN_PROGRESS');

  Future<WriteResult> _capture({
    required OutboxKind kind,
    required String path,
    required Map<String, dynamic> body,
    required String label,
    required int amount,
  }) async {
    final key = newIdempotencyKey();
    // Saving from the first moment, so a form can't submit twice meanwhile;
    // _write takes over the count without a gap.
    _pendingWrites++;
    notifyListeners();
    final String? owner;
    try {
      await _restoreOutbox();
      owner = _owner;
      if (owner != null) {
        _outbox.add(OutboxEntry(
          key: key,
          kind: kind,
          path: path,
          body: body,
          label: label,
          amount: amount,
          createdAt: DateTime.now(),
          owner: owner,
        ));
        _sendingKeys.add(key);
        notifyListeners();
        await _saveOutbox();
      }
    } finally {
      _pendingWrites--;
    }
    if (owner == null) {
      // No known user to own it (signed in before this version): a plain write.
      await _write(() => _api.sendCapturedWrite(path, body, key));
      return WriteResult.saved;
    }

    var result = WriteResult.queued;
    try {
      await _write(() async {
        try {
          await _api.sendCapturedWrite(path, body, key);
          result = WriteResult.saved;
          _replace(key, null);
        } on ApiException catch (e) {
          if (_worthRetrying(e)) return; // stays in the outbox
          _replace(key, null); // refused: nothing to send again
          rethrow;
        } finally {
          _sendingKeys.remove(key);
          await _saveOutbox();
        }
      }, reload: () async {
        if (result == WriteResult.saved) await refresh();
      });
    } finally {
      _armRetry();
      notifyListeners();
    }
    return result;
  }

  /// Sends this user's waiting entries, oldest first. Stops at the first one
  /// the server can't take yet; a refused one is kept with its reason.
  /// [include] also sends entries that were refused before or are old.
  Future<void> syncNow({Set<String> include = const {}}) async {
    if (_syncing) return;
    _syncing = true;
    _retryTimer?.cancel();
    _retryTimer = null;
    var sent = false;
    try {
      final now = DateTime.now();
      final due = _outbox
          .where((e) =>
              e.owner == _owner &&
              !_sendingKeys.contains(e.key) &&
              (include.contains(e.key) || (e.error == null && !e.isStale(now))))
          .toList();
      for (final entry in due) {
        _sendingKeys.add(entry.key);
        notifyListeners();
        try {
          await _write(() => _api.sendCapturedWrite(entry.path, entry.body, entry.key), reload: () async {});
          _replace(entry.key, null);
          sent = true;
        } on ApiException catch (e) {
          if (_worthRetrying(e)) break;
          _replace(entry.key, entry.withError(e.message));
          _notices.add('Couldn’t save “${entry.label}”: ${e.message}');
        } finally {
          _sendingKeys.remove(entry.key);
          await _saveOutbox();
        }
      }
    } finally {
      _syncing = false;
      notifyListeners();
    }
    if (sent) await refresh();
    _armRetry();
  }

  /// Sends one entry now, even if it was refused before or is old.
  Future<void> retryEntry(String key) {
    final i = _outbox.indexWhere((e) => e.key == key);
    if (i >= 0) _outbox[i] = _outbox[i].withError(null);
    return syncNow(include: {key});
  }

  /// Drops an entry without sending it.
  Future<void> discardEntry(String key) async {
    if (_sendingKeys.contains(key)) return;
    _replace(key, null);
    notifyListeners();
    await _saveOutbox();
  }

  void _armRetry() {
    if (_retryTimer != null || !_hasSendable) return;
    _retryTimer = Timer(syncRetryInterval, () {
      _retryTimer = null;
      syncNow();
    });
  }

  @override
  void dispose() {
    _retryTimer?.cancel();
    _notices.close();
    super.dispose();
  }
}
