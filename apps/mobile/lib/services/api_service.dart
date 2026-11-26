import 'dart:async';
import 'dart:convert';
import 'dart:io' show SocketException;
import 'dart:math';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:http/http.dart' as http;
import 'storage_service.dart';

/// What went wrong with a request, so callers can react without parsing text.
enum ApiErrorKind {
  /// No connection, DNS failure, refused connection.
  offline,

  /// No answer within [ApiService.requestTimeout].
  timeout,

  /// 401: not signed in, or the token expired.
  unauthorized,

  /// 404: the resource does not exist (e.g. a month that was never created).
  notFound,

  /// 409: conflict, including a duplicate write still in progress.
  conflict,

  /// Other 4xx: the request was rejected (validation and similar).
  rejected,

  /// 5xx.
  server,

  /// The server answered 2xx with a body the app could not read.
  badResponse,
}

class ApiException implements Exception {
  final String message;
  final int statusCode;
  final ApiErrorKind kind;

  /// Server error code from the envelope, e.g. `VALIDATION_ERROR`.
  final String? code;

  ApiException(this.message, [this.statusCode = 0, ApiErrorKind? kind, this.code])
      : kind = kind ?? _kindForStatus(statusCode);

  static ApiErrorKind _kindForStatus(int status) {
    if (status == 401) return ApiErrorKind.unauthorized;
    if (status == 404) return ApiErrorKind.notFound;
    if (status == 409) return ApiErrorKind.conflict;
    if (status >= 500) return ApiErrorKind.server;
    if (status >= 400) return ApiErrorKind.rejected;
    return ApiErrorKind.badResponse;
  }

  /// The request may not have reached the server, or the server failed in a
  /// way that is not about this request.
  bool get isTransient =>
      kind == ApiErrorKind.offline || kind == ApiErrorKind.timeout || kind == ApiErrorKind.server;

  @override
  String toString() => message;
}

/// Resources that have an /api/v1 route use it. Auth, settings and AI have no
/// v1 counterpart yet (docs/api-v1-migration.md).
const String _v1 = '/api/v1';

final Random _random = Random.secure();

/// RFC 4122 version 4 UUID.
String newIdempotencyKey() {
  final b = List<int>.generate(16, (_) => _random.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-'
      '${h.substring(16, 20)}-${h.substring(20)}';
}

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  String _baseUrl = StorageService.defaultBaseUrl;
  http.Client _client = http.Client();

  /// How long one attempt may take before it fails with [ApiErrorKind.timeout].
  Duration requestTimeout = const Duration(seconds: 15);

  /// Pause before the single retry of a transient failure.
  Duration retryDelay = const Duration(milliseconds: 600);

  Future<void> init() async {
    _baseUrl = await StorageService.getBaseUrl();
  }

  void updateBaseUrl(String url) {
    _baseUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
  }

  String get baseUrl => _baseUrl;

  /// Swaps the HTTP client, e.g. for a `MockClient` in tests.
  @visibleForTesting
  set client(http.Client client) => _client = client;

  Future<Map<String, String>> _headers() async {
    final token = await StorageService.getToken();
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  static const Set<String> _writeMethods = {'POST', 'PUT', 'PATCH', 'DELETE'};

  /// Sends a request and returns the unwrapped envelope `data`.
  ///
  /// Writes to /api/v1 carry an `Idempotency-Key` that stays the same across
  /// the retry, so the server runs the write at most once
  /// (apps/server/src/middleware/idempotency.js). One retry is made for:
  /// - offline or timeout (any request with a key, and every GET);
  /// - 5xx on a GET or on a keyed write;
  /// - 409 `IDEMPOTENCY_IN_PROGRESS` (the first attempt is still running).
  /// A write without a key (auth, settings, AI) is resent only after a dropped
  /// connection, never after a timeout or a 5xx.
  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String? idempotencyKey,
  }) async {
    final verb = method.toUpperCase();
    if (verb != 'GET' && !_writeMethods.contains(verb)) {
      throw ApiException('Unsupported HTTP method $method', 0, ApiErrorKind.rejected);
    }
    final isWrite = _writeMethods.contains(verb);
    idempotencyKey ??= isWrite && path.startsWith(_v1) ? newIdempotencyKey() : null;
    final safeToResend = !isWrite || idempotencyKey != null;

    try {
      return await _send(verb, path, body, idempotencyKey);
    } on ApiException catch (e) {
      final inProgress = e.statusCode == 409 && e.code == 'IDEMPOTENCY_IN_PROGRESS';
      final retry = inProgress ||
          (safeToResend && e.isTransient) ||
          // Unkeyed writes are auth, settings and AI calls, which are harmless to
          // repeat after a dropped connection; a timeout is still not resent.
          (!safeToResend && e.kind == ApiErrorKind.offline);
      if (!retry) rethrow;
      await Future<void>.delayed(inProgress ? const Duration(seconds: 1) : retryDelay);
      return _send(verb, path, body, idempotencyKey);
    }
  }

  Future<dynamic> _send(String verb, String path, Map<String, dynamic>? body, String? idempotencyKey) async {
    final uri = Uri.parse('$_baseUrl$path');
    final headers = await _headers();
    if (idempotencyKey != null) headers['Idempotency-Key'] = idempotencyKey;
    final encoded = body != null ? jsonEncode(body) : null;

    http.Response response;
    try {
      final Future<http.Response> pending = switch (verb) {
        'GET' => _client.get(uri, headers: headers),
        'POST' => _client.post(uri, headers: headers, body: encoded),
        'PUT' => _client.put(uri, headers: headers, body: encoded),
        'PATCH' => _client.patch(uri, headers: headers, body: encoded),
        _ => _client.delete(uri, headers: headers),
      };
      response = await pending.timeout(requestTimeout);
    } on TimeoutException {
      throw ApiException(
        'The server did not answer in time. Check your connection and try again.',
        0,
        ApiErrorKind.timeout,
      );
    } on SocketException catch (e) {
      throw ApiException('No connection to the server at $_baseUrl (${e.message})', 0, ApiErrorKind.offline);
    } on http.ClientException catch (e) {
      throw ApiException('No connection to the server at $_baseUrl (${e.message})', 0, ApiErrorKind.offline);
    }

    dynamic responseData;
    var parsed = true;
    if (response.body.isNotEmpty) {
      try {
        responseData = jsonDecode(response.body);
      } catch (_) {
        parsed = false;
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (!parsed) {
        throw ApiException(
          'The server sent a response the app could not read (${response.statusCode}).',
          response.statusCode,
          ApiErrorKind.badResponse,
        );
      }
      // Unwrap the response envelope { status: 'success', data, metadata, timestamp }
      if (responseData is Map && responseData['status'] == 'success' && responseData.containsKey('data')) {
        return responseData['data'];
      }
      return responseData;
    }

    String errorMsg = 'Request failed (${response.statusCode})';
    String? code;
    if (responseData is Map && responseData['error'] != null) {
      final err = responseData['error'];
      if (err is Map) {
        if (err['message'] != null) errorMsg = err['message'].toString();
        if (err['code'] != null) code = err['code'].toString();
      } else {
        errorMsg = err.toString();
      }
    }
    throw ApiException(errorMsg, response.statusCode, null, code);
  }

  String _accountsPath(String? type, bool includeArchived) {
    final params = <String, String>{
      if (type != null) 'type': type,
      if (includeArchived) 'includeArchived': 'true',
    };
    final qs = Uri(queryParameters: params.isEmpty ? null : params).query;
    return '$_v1/accounts${qs.isEmpty ? '' : '?$qs'}';
  }

  // Auth Endpoints
  Future<Map<String, dynamic>> register(String email, String password) async {
    final data = await _request('POST', '/api/auth/register', body: {
      'email': email.trim().toLowerCase(),
      'password': password,
    });
    if (data is Map && data['token'] != null) {
      await StorageService.setToken(data['token'].toString());
    }
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final data = await _request('POST', '/api/auth/login', body: {
      'email': email.trim().toLowerCase(),
      'password': password,
    });
    if (data is Map && data['token'] != null) {
      await StorageService.setToken(data['token'].toString());
    }
    return Map<String, dynamic>.from(data);
  }

  Future<void> logout() async {
    try {
      await _request('POST', '/api/auth/logout');
    } finally {
      await StorageService.clearAll();
    }
  }

  Future<Map<String, dynamic>?> getMe() async {
    final data = await _request('GET', '/api/auth/me');
    if (data is Map<String, dynamic>) return data;
    return null;
  }

  // Settings
  Future<Map<String, dynamic>> getSettings() async {
    final data = await _request('GET', '/api/settings');
    return Map<String, dynamic>.from(data);
  }

  /// First-run setup's salary: amount, expectedCreditDay, receivingAccountId,
  /// periodType, effectiveDate, markCredited (as web's api.saveSalaryTemplate).
  Future<Map<String, dynamic>> saveSalaryTemplate(Map<String, dynamic> body) async {
    final data = await _request('POST', '/api/salary-templates', body: body);
    return data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
  }

  Future<Map<String, dynamic>> updateSettings(Map<String, dynamic> updates) async {
    final data = await _request('PUT', '/api/settings', body: updates);
    return Map<String, dynamic>.from(data);
  }

  // Budget periods (months)
  Future<List<dynamic>> getMonths() async {
    final data = await _request('GET', '$_v1/periods');
    return data is List ? data : [];
  }

  Future<Map<String, dynamic>> createMonth(Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/periods', body: body);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> getMonthDetail(int year, int month) async {
    final data = await _request('GET', '$_v1/periods/$year/$month');
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> updateMonth(int year, int month, Map<String, dynamic> updates) async {
    final data = await _request('PATCH', '$_v1/periods/$year/$month', body: updates);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> creditSalary(int year, int month, [Map<String, dynamic> data = const {}]) async {
    final res = await _request('POST', '$_v1/periods/$year/$month/credit-salary', body: data);
    return Map<String, dynamic>.from(res);
  }

  Future<Map<String, dynamic>> rolloverMonth(int year, int month, {bool carryBalance = true, bool rolloverUnpaid = false}) async {
    final res = await _request('POST', '$_v1/periods/$year/$month/rollover', body: {
      'carryBalance': carryBalance,
      'rolloverUnpaidOneTimeItems': rolloverUnpaid,
    });
    return Map<String, dynamic>.from(res);
  }

  Future<void> deleteMonth(int year, int month, {bool force = false}) async {
    await _request('DELETE', '$_v1/periods/$year/$month${force ? '?force=true' : ''}');
  }

  Future<Map<String, dynamic>> recommendPurchaseDate(int year, int month, num purchaseAmount) async {
    final data = await _request('POST', '$_v1/periods/$year/$month/recommend-purchase-date', body: {
      'amount': purchaseAmount,
      'purchaseAmount': purchaseAmount,
    });
    return data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
  }

  // Legacy Item Aliases (Delegating to unified Transactions)
  Future<Map<String, dynamic>> createItem(int year, int month, Map<String, dynamic> item) async {
    final payload = {
      ...item,
      'status': item['isPaid'] == true ? 'successful' : 'planned',
      'origin': 'planned',
      'plannedAmount': item['plannedAmount'] ?? item['amount'],
      'plannedDate': item['plannedDate'] ?? item['date'],
    };
    final data = await _request('POST', '$_v1/periods/$year/$month/transactions', body: payload);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> updateItem(String id, Map<String, dynamic> updates) => updateTransaction(id, updates);

  Future<void> deleteItem(String id) => deleteTransaction(id);

  // Unified Transactions
  Future<List<dynamic>> getTransactions(int year, int month) async {
    final data = await _request('GET', '$_v1/periods/$year/$month/transactions');
    return data is List ? data : [];
  }

  Future<Map<String, dynamic>> createTransaction(int year, int month, Map<String, dynamic> tx) async {
    final data = await _request('POST', createTransactionPath(year, month), body: tx);
    return Map<String, dynamic>.from(data);
  }

  static String createTransactionPath(int year, int month) => '$_v1/periods/$year/$month/transactions';
  static String payTransactionPath(String id) => '$_v1/transactions/$id/pay';

  /// Body of POST [payTransactionPath].
  static Map<String, dynamic> payBody({String? accountId, num? amount, String? date}) => {
        'accountId': ?accountId,
        'amount': ?amount,
        'date': ?date,
      };

  /// Sends a write captured in the outbox (ADR 0071) with the key it was
  /// captured with, so a replay of a write that already reached the server
  /// is answered from the server's idempotency store, not run again.
  Future<dynamic> sendCapturedWrite(String path, Map<String, dynamic> body, String idempotencyKey) =>
      _request('POST', path, body: body, idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> updateTransaction(String id, Map<String, dynamic> updates) async {
    final data = await _request('PATCH', '$_v1/transactions/$id', body: updates);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> payTransaction(String id, {String? accountId, num? amount, String? date}) async {
    final data = await _request('POST', payTransactionPath(id), body: payBody(accountId: accountId, amount: amount, date: date));
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> cancelTransaction(String id, {String? goalAction}) async {
    final body = <String, dynamic>{};
    if (goalAction != null) body['goalAction'] = goalAction;
    final data = await _request('POST', '$_v1/transactions/$id/cancel', body: body);
    return Map<String, dynamic>.from(data);
  }

  Future<void> deleteTransaction(String id) async {
    await _request('DELETE', '$_v1/transactions/$id');
  }

  // Goals
  Future<List<dynamic>> getGoals(int year, int month) async {
    final data = await _request('GET', '$_v1/periods/$year/$month/goals');
    return data is List ? data : [];
  }

  Future<Map<String, dynamic>> createGoal(int year, int month, Map<String, dynamic> goal) async {
    final data = await _request('POST', '$_v1/periods/$year/$month/goals', body: goal);
    return Map<String, dynamic>.from(data);
  }

  /// Schedules a goal as a planned transaction.
  Future<Map<String, dynamic>> convertGoalToTransaction(String id) async {
    final data = await _request('POST', '$_v1/goals/$id/schedule', body: const {});
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> convertGoalToItem(String id) => convertGoalToTransaction(id);

  Future<Map<String, dynamic>> deferGoal(String id) async {
    final data = await _request('POST', '$_v1/goals/$id/defer');
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> reactivateGoal(String id) async {
    final data = await _request('POST', '$_v1/goals/$id/reactivate');
    return Map<String, dynamic>.from(data);
  }

  Future<void> deleteGoal(String id) async {
    await _request('DELETE', '$_v1/goals/$id');
  }

  /// Edit a goal: name, targetAmount, priority, fundingAccountId.
  Future<Map<String, dynamic>> updateGoal(String id, Map<String, dynamic> updates) async {
    final data = await _request('PATCH', '$_v1/goals/$id', body: updates);
    return data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
  }

  // Bank Accounts (bank, wallet and cash share /api/v1/accounts; `type` narrows a list)
  Future<List<dynamic>> getBankAccounts([bool includeArchived = false]) async {
    final data = await _request('GET', _accountsPath('bank', includeArchived));
    return data is List ? data : [];
  }

  Future<Map<String, dynamic>> createBankAccount(Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/accounts', body: body);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> updateBankAccount(String id, Map<String, dynamic> updates) async {
    final data = await _request('PATCH', '$_v1/accounts/$id', body: updates);
    return Map<String, dynamic>.from(data);
  }

  Future<void> deleteBankAccount(String id) async {
    await _request('DELETE', '$_v1/accounts/$id');
  }

  // Wallets
  Future<List<dynamic>> getWallets([bool includeArchived = false]) async {
    final data = await _request('GET', _accountsPath('wallet', includeArchived));
    return data is List ? data : [];
  }

  Future<Map<String, dynamic>> createWallet(Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/accounts', body: {...body, 'type': 'wallet'});
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> updateWallet(String id, Map<String, dynamic> updates) async {
    final data = await _request('PATCH', '$_v1/accounts/$id', body: updates);
    return Map<String, dynamic>.from(data);
  }

  Future<void> deleteWallet(String id) async {
    await _request('DELETE', '$_v1/accounts/$id');
  }

  /// The month-end review (web getMonthEndReview): unplanned and matched spend,
  /// the category breakdown and the suggested cushion for next month.
  Future<Map<String, dynamic>> getMonthEndReview(int year, int month, {String? accountId}) async {
    final qs = accountId != null && accountId != 'all' ? '?accountId=${Uri.encodeQueryComponent(accountId)}' : '';
    final data = await _request('GET', '$_v1/periods/$year/$month/month-end-review$qs');
    return data is Map<String, dynamic> ? data : {};
  }

  /// The month summary; its netWorth is { total, cash, lent, cardsOwed, held } (web getMonthSummary).
  Future<Map<String, dynamic>> getMonthSummary(int year, int month) async {
    final data = await _request('GET', '$_v1/periods/$year/$month/summary');
    return data is Map<String, dynamic> ? data : {};
  }

  // Transfers
  Future<List<dynamic>> getTransfers([String? monthId]) async {
    final qs = monthId != null ? '?monthId=${Uri.encodeQueryComponent(monthId)}' : '';
    final data = await _request('GET', '$_v1/transfers$qs');
    return data is List ? data : [];
  }

  Future<Map<String, dynamic>> createTransfer(Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/transfers', body: body);
    return Map<String, dynamic>.from(data);
  }

  Future<void> deleteTransfer(String id) async {
    await _request('DELETE', '$_v1/transfers/$id');
  }

  // Credit cards (ADR 0070): created as accounts with type 'credit_card'
  Future<List<dynamic>> getCards() async {
    final data = await _request('GET', '$_v1/cards');
    return data is List ? data : [];
  }

  Future<Map<String, dynamic>> createCard(Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/accounts', body: {...body, 'type': 'credit_card'});
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> confirmCardStatement(String statementId, Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/cards/statements/$statementId/confirm', body: body);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> payCardStatement(String statementId, Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/cards/statements/$statementId/pay', body: body);
    return Map<String, dynamic>.from(data);
  }

  // Held & Lent money (ADR 0069): never income or expense
  Future<Map<String, dynamic>> getPersonFunds() async {
    final data = await _request('GET', '$_v1/person-funds');
    return data is Map ? Map<String, dynamic>.from(data) : {'funds': [], 'totals': {'held': 0, 'lent': 0}};
  }

  Future<Map<String, dynamic>> getPersonFund(String id) async {
    final data = await _request('GET', '$_v1/person-funds/$id');
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> createPersonFund(Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/person-funds', body: body);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> addPersonFundEntry(String id, Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/person-funds/$id/entries', body: body);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> reclassifyTransaction(String id, Map<String, dynamic> body) async {
    final data = await _request('POST', '$_v1/transactions/$id/reclassify', body: body);
    return Map<String, dynamic>.from(data);
  }

  // AI Assistant
  Future<Map<String, dynamic>> parseTextAi(String text) async {
    final data = await _request('POST', '/api/ai/parse-text', body: {'text': text});
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> explainTimelineAi(Map<String, dynamic> timelineSummary, int safetyFloor) async {
    final data = await _request('POST', '/api/ai/explain-timeline', body: {
      'timelineSummary': timelineSummary,
      'safetyFloor': safetyFloor,
    });
    return Map<String, dynamic>.from(data);
  }
}
