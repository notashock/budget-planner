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
      'periods', 'month_detail', 'goals', 'accounts_bank', 'accounts_wallet', 'transfers',
    ])
      n: fixture(n),
  };
  final List<http.Request> requests = [];
  late final BudgetProvider budget;

  Future<BudgetProvider> load({void Function(Map<String, dynamic> f)? edit}) async {
    SharedPreferences.setMockInitialValues({});
    edit?.call(fixtures);
    final api = ApiService()
      ..updateBaseUrl('http://api.test')
      ..retryDelay = Duration.zero;
    api.client = MockClient((req) async {
      requests.add(req);
      final path = req.url.path;
      if (req.method != 'GET') return okJson(<String, dynamic>{});
      if (path == '/api/settings') return okJson(<String, dynamic>{});
      if (path == '/api/v1/periods') return okJson(fixtures['periods']);
      if (RegExp(r'^/api/v1/periods/\d+/\d+$').hasMatch(path)) return okJson(fixtures['month_detail']);
      if (RegExp(r'^/api/v1/periods/\d+/\d+/goals$').hasMatch(path)) return okJson(fixtures['goals']);
      if (path == '/api/v1/accounts') {
        return okJson(fixtures[req.url.queryParameters['type'] == 'wallet' ? 'accounts_wallet' : 'accounts_bank']);
      }
      if (path == '/api/v1/transfers') return okJson(fixtures['transfers']);
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
