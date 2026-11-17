import 'dart:convert';

import 'package:budget_mobile/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:budget_mobile/services/storage_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Pins each ApiService call to the HTTP method and path it must use, so the
/// app stays on /api/v1 (see docs/api-v1-migration.md).
void main() {
  late List<http.Request> sent;
  final api = ApiService();

  setUp(() {
    SharedPreferences.setMockInitialValues({StorageService.keyToken: 'test-token'});
    sent = [];
    api.updateBaseUrl('http://api.test');
    api.client = MockClient((request) async {
      sent.add(request);
      return http.Response(jsonEncode({'status': 'success', 'data': <String, dynamic>{}}), 200);
    });
  });

  Future<String> call(Future<dynamic> Function() fn) async {
    await fn();
    expect(sent, hasLength(1));
    final req = sent.single;
    final query = req.url.hasQuery ? '?${req.url.query}' : '';
    return '${req.method} ${req.url.path}$query';
  }

  final cases = <String, Future<dynamic> Function()>{
    'GET /api/v1/periods': () => api.getMonths(),
    'POST /api/v1/periods': () => api.createMonth({'year': 2026, 'month': 11}),
    'GET /api/v1/periods/2026/11': () => api.getMonthDetail(2026, 11),
    'PATCH /api/v1/periods/2026/11': () => api.updateMonth(2026, 11, {'safetyFloor': 100}),
    'POST /api/v1/periods/2026/11/credit-salary': () => api.creditSalary(2026, 11),
    'POST /api/v1/periods/2026/11/rollover': () => api.rolloverMonth(2026, 11),
    'DELETE /api/v1/periods/2026/11?force=true': () => api.deleteMonth(2026, 11, force: true),
    'POST /api/v1/periods/2026/11/recommend-purchase-date': () => api.recommendPurchaseDate(2026, 11, 500),
    'GET /api/v1/periods/2026/11/transactions': () => api.getTransactions(2026, 11),
    'POST /api/v1/periods/2026/11/transactions': () => api.createTransaction(2026, 11, {'amount': 1}),
    'PATCH /api/v1/transactions/tx1': () => api.updateTransaction('tx1', {'amount': 2}),
    'POST /api/v1/transactions/tx1/pay': () => api.payTransaction('tx1', amount: 3),
    'POST /api/v1/transactions/tx1/cancel': () => api.cancelTransaction('tx1'),
    'DELETE /api/v1/transactions/tx1': () => api.deleteTransaction('tx1'),
    'GET /api/v1/periods/2026/11/goals': () => api.getGoals(2026, 11),
    'POST /api/v1/periods/2026/11/goals': () => api.createGoal(2026, 11, {'name': 'Bike'}),
    'POST /api/v1/goals/g1/schedule': () => api.convertGoalToTransaction('g1'),
    'POST /api/v1/goals/g1/defer': () => api.deferGoal('g1'),
    'POST /api/v1/goals/g1/reactivate': () => api.reactivateGoal('g1'),
    'DELETE /api/v1/goals/g1': () => api.deleteGoal('g1'),
    'GET /api/v1/accounts?type=bank': () => api.getBankAccounts(),
    'GET /api/v1/accounts?type=bank&includeArchived=true': () => api.getBankAccounts(true),
    'POST /api/v1/accounts': () => api.createBankAccount({'name': 'HDFC'}),
    'PATCH /api/v1/accounts/a1': () => api.updateBankAccount('a1', {'name': 'X'}),
    'DELETE /api/v1/accounts/a1': () => api.deleteBankAccount('a1'),
    'GET /api/v1/accounts?type=wallet': () => api.getWallets(),
    'PATCH /api/v1/accounts/w1': () => api.updateWallet('w1', {'name': 'Y'}),
    'DELETE /api/v1/accounts/w1': () => api.deleteWallet('w1'),
    'GET /api/v1/transfers?monthId=m1': () => api.getTransfers('m1'),
    'POST /api/v1/transfers': () => api.createTransfer({'amount': 5}),
    'DELETE /api/v1/transfers/t1': () => api.deleteTransfer('t1'),
  };

  cases.forEach((expected, fn) {
    test(expected, () async {
      expect(await call(fn), expected);
    });
  });

  test('item aliases go to the v1 transaction routes', () async {
    expect(await call(() => api.createItem(2026, 11, {'name': 'Rent', 'amount': 10})), 'POST /api/v1/periods/2026/11/transactions');
    sent.clear();
    expect(await call(() => api.updateItem('i1', {'amount': 11})), 'PATCH /api/v1/transactions/i1');
    sent.clear();
    expect(await call(() => api.deleteItem('i1')), 'DELETE /api/v1/transactions/i1');
  });

  test('createWallet posts type wallet to /api/v1/accounts with the bearer token', () async {
    expect(await call(() => api.createWallet({'name': 'UPI', 'walletType': 'digital'})), 'POST /api/v1/accounts');
    final req = sent.single;
    expect(jsonDecode(req.body), {'name': 'UPI', 'walletType': 'digital', 'type': 'wallet'});
    expect(req.headers['Authorization'], 'Bearer test-token');
  });

  test('unwraps the envelope and surfaces envelope errors', () async {
    api.client = MockClient((request) async => http.Response(
          jsonEncode({'status': 'success', 'data': [{'id': 'a1'}]}),
          200,
        ));
    expect(await api.getBankAccounts(), [{'id': 'a1'}]);

    api.client = MockClient((request) async => http.Response(
          jsonEncode({'status': 'error', 'error': {'code': 'VALIDATION_ERROR', 'message': 'Account name is required'}}),
          400,
        ));
    await expectLater(
      api.createBankAccount({}),
      throwsA(isA<ApiException>()
          .having((e) => e.message, 'message', 'Account name is required')
          .having((e) => e.statusCode, 'statusCode', 400)),
    );
  });
}
