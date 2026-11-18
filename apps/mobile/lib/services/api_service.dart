import 'dart:convert';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:http/http.dart' as http;
import 'storage_service.dart';

class ApiException implements Exception {
  final String message;
  final int statusCode;

  ApiException(this.message, [this.statusCode = 0]);

  @override
  String toString() => message;
}

/// Resources that have an /api/v1 route use it. Auth, settings and AI have no
/// v1 counterpart yet (docs/api-v1-migration.md).
const String _v1 = '/api/v1';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  String _baseUrl = StorageService.defaultBaseUrl;
  http.Client _client = http.Client();

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

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');
    final headers = await _headers();
    final encoded = body != null ? jsonEncode(body) : null;

    http.Response response;
    try {
      switch (method.toUpperCase()) {
        case 'GET':
          response = await _client.get(uri, headers: headers);
          break;
        case 'POST':
          response = await _client.post(uri, headers: headers, body: encoded);
          break;
        case 'PUT':
          response = await _client.put(uri, headers: headers, body: encoded);
          break;
        case 'PATCH':
          response = await _client.patch(uri, headers: headers, body: encoded);
          break;
        case 'DELETE':
          response = await _client.delete(uri, headers: headers);
          break;
        default:
          throw ApiException('Unsupported HTTP method $method');
      }
    } catch (e) {
      throw ApiException('Network connection failed. Verify host server at $_baseUrl ($e)');
    }

    dynamic responseData;
    try {
      if (response.body.isNotEmpty) {
        responseData = jsonDecode(response.body);
      }
    } catch (_) {
      responseData = null;
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      // Unwrap the response envelope { status: 'success', data, metadata, timestamp }
      if (responseData is Map && responseData['status'] == 'success' && responseData.containsKey('data')) {
        return responseData['data'];
      }
      return responseData;
    }

    String errorMsg = 'Request failed (${response.statusCode})';
    if (responseData is Map && responseData['error'] != null) {
      if (responseData['error'] is Map && responseData['error']['message'] != null) {
        errorMsg = responseData['error']['message'].toString();
      } else {
        errorMsg = responseData['error'].toString();
      }
    }
    throw ApiException(errorMsg, response.statusCode);
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
    final data = await _request('POST', '$_v1/periods/$year/$month/transactions', body: tx);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> updateTransaction(String id, Map<String, dynamic> updates) async {
    final data = await _request('PATCH', '$_v1/transactions/$id', body: updates);
    return Map<String, dynamic>.from(data);
  }

  Future<Map<String, dynamic>> payTransaction(String id, {String? accountId, num? amount, String? date}) async {
    final body = <String, dynamic>{};
    if (accountId != null) body['accountId'] = accountId;
    if (amount != null) body['amount'] = amount;
    if (date != null) body['date'] = date;
    final data = await _request('POST', '$_v1/transactions/$id/pay', body: body);
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
