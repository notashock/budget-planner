import 'dart:async';
import 'dart:convert';

import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Error tiers, month fallback, balances and write ordering (upgrade plan 1.2-1.4, 1.7).
void main() {
  final api = ApiService();
  late BudgetProvider budget;
  late List<http.Request> sent;
  late FutureOr<http.Response> Function(http.Request req) monthDetail;
  late List<Map<String, dynamic>> periods;
  late List<Map<String, dynamic>> banks;

  final now = DateTime.now();

  http.Response ok(Object? data) => http.Response(jsonEncode({'status': 'success', 'data': data}), 200);
  http.Response fail(int status, [String message = 'failed']) => http.Response(
        jsonEncode({'status': 'error', 'error': {'code': 'E$status', 'message': message}}),
        status,
      );

  Map<String, dynamic> detail({String name = 'Rent', int todaysBalance = 500000, Object? days}) => {
        'month': {'_id': 'm1', 'year': now.year, 'month': now.month, 'safetyFloor': 100000},
        'transactions': [
          {'id': 't1', 'name': name, 'status': 'successful', 'amount': 2000000, 'date': '2026-11-01'},
        ],
        'goals': [],
        'simulation': {
          'openingBalance': 1000000,
          'todaysBalance': todaysBalance,
          'days': days ?? [],
        },
      };

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    sent = [];
    periods = [
      {'year': now.year, 'month': now.month},
    ];
    banks = [
      {'id': 'b1', 'name': 'Main', 'currentBalance': 500000},
    ];
    monthDetail = (_) => ok(detail());
    api.updateBaseUrl('http://api.test');
    api.retryDelay = Duration.zero;
    api.requestTimeout = const Duration(seconds: 5);
    api.client = MockClient((req) async {
      sent.add(req);
      final path = req.url.path;
      if (path == '/api/settings') return ok(<String, dynamic>{});
      if (path == '/api/v1/periods' && req.method == 'GET') return ok(periods);
      if (RegExp(r'^/api/v1/periods/\d+/\d+$').hasMatch(path) && req.method == 'GET') return monthDetail(req);
      if (path == '/api/v1/accounts' && req.url.queryParameters['type'] == 'bank') return ok(banks);
      if (path == '/api/v1/accounts') return ok([]);
      if (path == '/api/v1/transfers') return ok([]);
      return ok(<String, dynamic>{});
    });
    budget = BudgetProvider(api: api);
  });

  group('error tiers', () {
    test('a 404 month is "missing", not an error', () async {
      monthDetail = (_) => fail(404, 'Month not found');
      await budget.loadInitialData();

      expect(budget.monthMissing, isTrue);
      expect(budget.activeMonth, isNull);
      expect(budget.loadError, isNull);
    });

    test('a 500 after a good load keeps the data and records the failure', () async {
      await budget.loadInitialData();
      expect(budget.transactions, hasLength(1));
      final loadedAt = budget.lastLoadedAt;

      monthDetail = (_) => fail(500, 'database unavailable');
      await budget.refresh();

      expect(budget.transactions, hasLength(1), reason: 'never wipe data on a non-404 failure');
      expect(budget.activeMonth, isNotNull);
      expect(budget.monthMissing, isFalse);
      expect(budget.loadError, isNotNull);
      expect(budget.loadError!.kind, ApiErrorKind.server);
      expect(budget.loadError!.hasData, isTrue);
      expect(budget.loadError!.lastLoadedAt, loadedAt);
      expect(budget.error, 'database unavailable');
    });

    test('offline on the first load is an offline error with no data, not an empty month', () async {
      api.client = MockClient((req) async => throw http.ClientException('Network is unreachable'));
      await budget.loadInitialData();

      expect(budget.monthMissing, isFalse);
      expect(budget.loadError?.isOffline, isTrue);
      expect(budget.loadError?.hasData, isFalse);
      expect(budget.isLoading, isFalse);
    });

    test('an unreadable simulation is an error, not a silently stale plan', () async {
      await budget.loadInitialData();
      monthDetail = (_) => ok(detail(name: 'Changed', days: ['not a day']));
      await budget.refresh();

      expect(budget.loadError?.kind, ApiErrorKind.badResponse);
      // Nothing from the unreadable response was applied.
      expect(budget.transactions.single['name'], 'Rent');
    });

    test('a 401 is reported as an expired session', () async {
      monthDetail = (_) => fail(401, 'Authentication required');
      await budget.loadInitialData();
      expect(budget.loadError?.isSessionExpired, isTrue);
    });

    test('the next good load clears the error', () async {
      monthDetail = (_) => fail(500);
      await budget.loadInitialData();
      expect(budget.loadError, isNotNull);

      monthDetail = (_) => ok(detail());
      await budget.refresh();
      expect(budget.loadError, isNull);
      expect(budget.error, isNull);
    });
  });

  group('month fallback', () {
    final today = DateTime(2026, 11, 19);

    test('picks the latest month on or before today, regardless of server order', () {
      final pick = pickInitialMonth([
        {'year': 2026, 'month': 9},
        {'year': 2027, 'month': 1},
        {'year': 2026, 'month': 10},
      ], today);
      expect(pick, (year: 2026, month: 10));
    });

    test('falls back to the earliest future month when all are ahead', () {
      final pick = pickInitialMonth([
        {'year': 2027, 'month': 3},
        {'year': 2026, 'month': 12},
      ], today);
      expect(pick, (year: 2026, month: 12));
    });

    test('ignores malformed rows and returns null for none', () {
      expect(pickInitialMonth([{'year': 'x'}, 'junk'], today), isNull);
      expect(pickInitialMonth([], today), isNull);
    });
  });

  group('balances', () {
    test('total is null when an account has no current balance', () async {
      banks = [
        {'id': 'b1', 'currentBalance': 500000},
        {'id': 'b2', 'openingBalance': 900000},
      ];
      await budget.loadInitialData();
      expect(budget.totalAccountsBalance, isNull);
    });

    test('total sums current balances', () async {
      banks = [
        {'id': 'b1', 'currentBalance': 500000},
        {'id': 'b2', 'currentBalance': 250000},
      ];
      await budget.loadInitialData();
      expect(budget.totalAccountsBalance, 750000);
    });
  });

  group('ordering', () {
    test('writes run one at a time, in order, and isSaving covers them', () async {
      await budget.loadInitialData();
      var inFlight = 0;
      var maxInFlight = 0;
      final order = <String>[];
      final base = api;
      base.client = MockClient((req) async {
        if (req.method == 'POST') {
          inFlight++;
          maxInFlight = inFlight > maxInFlight ? inFlight : maxInFlight;
          order.add((jsonDecode(req.body) as Map)['name'] as String);
          await Future<void>.delayed(const Duration(milliseconds: 20));
          inFlight--;
          return ok({'id': 'new'});
        }
        if (RegExp(r'^/api/v1/periods/\d+/\d+$').hasMatch(req.url.path)) return ok(detail());
        return ok([]);
      });

      final a = budget.addTransaction({'name': 'first', 'amount': 1});
      final b = budget.addTransaction({'name': 'second', 'amount': 2});
      expect(budget.isSaving, isTrue);
      await Future.wait([a, b]);

      expect(order, ['first', 'second']);
      expect(maxInFlight, 1);
      expect(budget.isSaving, isFalse);
    });

    test('a failed write fails its caller and does not block the next one', () async {
      await budget.loadInitialData();
      var posts = 0;
      api.client = MockClient((req) async {
        if (req.method == 'POST') {
          posts++;
          return posts == 1 ? fail(400, 'Amount is required') : ok({'id': 'new'});
        }
        if (RegExp(r'^/api/v1/periods/\d+/\d+$').hasMatch(req.url.path)) return ok(detail());
        return ok([]);
      });

      await expectLater(budget.addTransaction({'name': 'bad'}), throwsA(isA<ApiException>()));
      await budget.addTransaction({'name': 'good', 'amount': 1});
      expect(posts, 2);
      expect(budget.isSaving, isFalse);
    });

    test('a slow, older load does not overwrite a newer one', () async {
      await budget.loadInitialData();
      final slow = Completer<http.Response>();
      var calls = 0;
      monthDetail = (_) {
        calls++;
        return calls == 1 ? slow.future : ok(detail(name: 'Newer'));
      };

      final older = budget.refresh();
      await budget.refresh();
      slow.complete(ok(detail(name: 'Older')));
      await older;

      expect(budget.transactions.single['name'], 'Newer');
    });
  });
}
