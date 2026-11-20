import 'dart:convert';
import 'dart:io';

import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Responses recorded from the real server (test/fixtures/api, see
/// apps/server/test/mobile_contract_fixtures.test.js).
dynamic fixture(String name) => jsonDecode(File('test/fixtures/api/$name.json').readAsStringSync());

/// UTF-8 bytes like the real server (the fixtures contain '₹').
http.Response okJson(Object? data) => http.Response.bytes(
      utf8.encode(jsonEncode({'status': 'success', 'data': data})),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

/// A provider loaded with the recorded month. [edit] may change any fixture
/// before it is served; every request is recorded in [requests].
class FixtureBudget {
  final Map<String, dynamic> fixtures = {
    for (final n in [
      'periods', 'month_detail', 'goals', 'accounts_bank', 'accounts_wallet', 'transfers', 'cards', 'person_funds',
    ])
      n: fixture(n),
  };
  final List<http.Request> requests = [];
  late final BudgetProvider budget;

  /// Every request fails as if the phone had no connection.
  bool offline = false;

  /// The selected month does not exist (404), as for a new user.
  bool monthMissing = false;

  /// Answers writes (default: an empty success).
  Future<http.Response> Function(http.Request req)? onWrite;

  late final MockClient client;

  /// [prefs] seeds the device storage (e.g. a signed-in user).
  Future<BudgetProvider> load({void Function(Map<String, dynamic> f)? edit, Map<String, Object> prefs = const {}}) async {
    SharedPreferences.setMockInitialValues(prefs);
    edit?.call(fixtures);
    final api = ApiService()
      ..updateBaseUrl('http://api.test')
      ..retryDelay = Duration.zero;
    api.client = client = MockClient((req) async {
      requests.add(req);
      if (offline) throw const SocketException('offline (test)');
      final path = req.url.path;
      if (req.method != 'GET') return onWrite == null ? okJson(<String, dynamic>{}) : onWrite!(req);
      if (path == '/api/settings') return okJson(<String, dynamic>{});
      if (path == '/api/v1/periods') return okJson(fixtures['periods']);
      if (monthMissing && RegExp(r'^/api/v1/periods/\d+/\d+(/goals)?$').hasMatch(path)) {
        return http.Response.bytes(
            utf8.encode(jsonEncode({'status': 'error', 'error': {'code': 'NOT_FOUND', 'message': 'Month not found'}})),
            404,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }
      if (RegExp(r'^/api/v1/periods/\d+/\d+$').hasMatch(path)) {
        // The server's month detail carries the same account and transfer rows
        // as their own endpoints; serve the (possibly edited) list fixtures.
        return okJson({
          ...fixtures['month_detail'] as Map<String, dynamic>,
          'bankAccounts': fixtures['accounts_bank'],
          'wallets': fixtures['accounts_wallet'],
          'transfers': fixtures['transfers'],
        });
      }
      if (RegExp(r'^/api/v1/periods/\d+/\d+/goals$').hasMatch(path)) return okJson(fixtures['goals']);
      if (path == '/api/v1/accounts') {
        return okJson(fixtures[req.url.queryParameters['type'] == 'wallet' ? 'accounts_wallet' : 'accounts_bank']);
      }
      if (path == '/api/v1/transfers') return okJson(fixtures['transfers']);
      if (path == '/api/v1/cards') return okJson(fixtures['cards']);
      if (path == '/api/v1/person-funds') return okJson(fixtures['person_funds']);
      return okJson([]);
    });
    budget = BudgetProvider(api: api);
    await budget.loadInitialData();
    expect(budget.loadError, isNull, reason: budget.loadError?.message);
    return budget;
  }

  /// Writes sent so far, as 'METHOD /path'.
  List<String> get writes =>
      [for (final r in requests) if (r.method != 'GET') '${r.method} ${r.url.path}'];
}
