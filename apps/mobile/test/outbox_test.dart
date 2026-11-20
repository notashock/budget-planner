import 'dart:convert';
import 'dart:io';

import 'package:budget_mobile/providers/auth_provider.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/services/api_service.dart';
import 'package:budget_mobile/services/outbox.dart';
import 'package:budget_mobile/services/storage_service.dart';
import 'package:budget_mobile/widgets/sync_strip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fixture_budget.dart';

/// A server that keeps each idempotency key once, like
/// apps/server/src/middleware/idempotency.js, and can drop the response
/// after storing (the write arrived, the phone never heard back).
class FakeServer {
  final Map<String, Map<String, dynamic>> rows = {};
  int dropResponses = 0;

  Future<http.Response> handle(http.Request req) async {
    final key = req.headers['Idempotency-Key']!;
    rows.putIfAbsent(key, () => jsonDecode(req.body) as Map<String, dynamic>);
    if (dropResponses > 0) {
      dropResponses--;
      throw const SocketException('connection reset after the server stored it');
    }
    return okJson({'id': key});
  }
}

/// Upgrade plan 2.7 / 2.8, ADR 0071: offline capture, online truth.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const userA = {StorageService.keyUser: '{"id":"user-a","email":"a@test"}'};

  Map<String, dynamic> spend(String name, int amount) =>
      {'description': name, 'amount': amount, 'type': 'expense', 'isIncome': false, 'date': '2026-11-20'};

  List<http.Request> posts(FixtureBudget fb) => [for (final r in fb.requests) if (r.method == 'POST') r];

  test('online: saved at once, nothing left on the phone', () async {
    final fb = FixtureBudget();
    final budget = await fb.load(prefs: userA);

    final result = await budget.addTransaction(spend('Tea', 2000));

    expect(result, WriteResult.saved);
    expect(budget.pendingEntries, isEmpty);
    expect(await OutboxStore.read(), isEmpty);
    expect(posts(fb).single.headers['Idempotency-Key'], isNotEmpty);
  });

  test('offline: kept on the phone, then sent with the same key after the next good load', () async {
    final fb = FixtureBudget();
    final budget = await fb.load(prefs: userA);
    fb.offline = true;

    final result = await budget.addTransaction(spend('Tea', 2000));

    expect(result, WriteResult.queued);
    expect(budget.pendingEntries.single.label, 'Tea');
    expect(budget.pendingEntries.single.amount, 2000);
    expect((await OutboxStore.read()).single.owner, 'user-a');
    final key = budget.pendingEntries.single.key;

    fb.offline = false;
    fb.requests.clear();
    await budget.refresh();
    await pumpEventQueue();

    expect(posts(fb).single.headers['Idempotency-Key'], key);
    expect(budget.pendingEntries, isEmpty);
    expect(await OutboxStore.read(), isEmpty);
  });

  test('airplane mode: 3 spends, reconnect, exactly 3 on the server even when replies are lost', () async {
    final server = FakeServer();
    final fb = FixtureBudget()..onWrite = server.handle;
    final budget = await fb.load(prefs: userA);

    // The first one reaches the server but the reply is lost (twice: the
    // ApiService retry too), so the phone keeps it.
    server.dropResponses = 2;
    expect(await budget.addTransaction(spend('Tea', 2000)), WriteResult.queued);
    fb.offline = true;
    expect(await budget.addTransaction(spend('Bus', 3000)), WriteResult.queued);
    expect(await budget.addTransaction(spend('Lunch', 15000)), WriteResult.queued);
    expect(budget.pendingEntries, hasLength(3));

    fb.offline = false;
    await budget.syncNow();

    expect(budget.pendingEntries, isEmpty);
    expect(server.rows.values.map((r) => r['description']), ['Tea', 'Bus', 'Lunch']);
  });

  test('a refused spend is rolled back and the error reaches the caller', () async {
    final fb = FixtureBudget()
      ..onWrite = (_) async => http.Response(
            jsonEncode({'status': 'error', 'error': {'code': 'VALIDATION_ERROR', 'message': 'Amount is required'}}),
            400);
    final budget = await fb.load(prefs: userA);

    await expectLater(budget.addTransaction(spend('Tea', 0)), throwsA(isA<ApiException>()));
    expect(budget.pendingEntries, isEmpty);
    expect(await OutboxStore.read(), isEmpty);
  });

  test('a background send the server refuses is kept with its reason and announced', () async {
    final fb = FixtureBudget();
    final budget = await fb.load(prefs: userA);
    final notices = <String>[];
    budget.notices.listen(notices.add);
    fb.offline = true;
    await budget.addTransaction(spend('Tea', 2000));

    fb.offline = false;
    fb.onWrite = (_) async => http.Response(
        jsonEncode({'status': 'error', 'error': {'message': 'Month is closed'}}), 422);
    await budget.syncNow();
    await pumpEventQueue();

    expect(budget.pendingEntries.single.error, 'Month is closed');
    expect(notices.single, contains('Tea'));

    // Not sent again on its own...
    fb.requests.clear();
    await budget.syncNow();
    expect(posts(fb), isEmpty);

    // ...only when the user retries it.
    fb.onWrite = null;
    await budget.retryEntry(budget.pendingEntries.single.key);
    expect(budget.pendingEntries, isEmpty);
  });

  test('entries survive a restart and are sent after the first good load', () async {
    final fb = FixtureBudget();
    final budget = await fb.load(prefs: userA);
    fb.offline = true;
    await budget.addTransaction(spend('Tea', 2000));
    final key = budget.pendingEntries.single.key;

    // Cold start on the same device storage.
    fb.offline = false;
    fb.requests.clear();
    final restarted = BudgetProvider(api: ApiService()..client = fb.client);
    await restarted.loadInitialData();
    await pumpEventQueue();

    expect(posts(fb).single.headers['Idempotency-Key'], key);
    expect(restarted.pendingEntries, isEmpty);
  });

  test("another user never sees or sends someone else's entries", () async {
    final fb = FixtureBudget();
    final budget = await fb.load(prefs: userA);
    fb.offline = true;
    await budget.addTransaction(spend('Tea', 2000));

    await StorageService.setUser({'id': 'user-b'});
    fb.offline = false;
    fb.requests.clear();
    final other = BudgetProvider(api: ApiService()..client = fb.client);
    await other.loadInitialData();
    await pumpEventQueue();

    expect(other.pendingEntries, isEmpty);
    expect(posts(fb), isEmpty);
    expect(await OutboxStore.read(), hasLength(1), reason: "kept for user-a");
  });

  test('an entry older than the server remembers keys waits for the user', () async {
    final old = OutboxEntry(
      key: newIdempotencyKey(),
      kind: OutboxKind.spend,
      path: ApiService.createTransactionPath(2026, 11),
      body: spend('Old tea', 2000),
      label: 'Old tea',
      amount: 2000,
      createdAt: DateTime.now().subtract(const Duration(days: 7)),
      owner: 'user-a',
    );
    final fb = FixtureBudget();
    final budget = await fb.load(prefs: {
      ...userA,
      OutboxStore.storageKey: jsonEncode([old.toJson()]),
    });
    await pumpEventQueue();

    expect(posts(fb), isEmpty);
    expect(budget.pendingEntries.single.isStale(DateTime.now()), isTrue);

    await budget.retryEntry(old.key);
    expect(posts(fb).single.headers['Idempotency-Key'], old.key);
    expect(budget.pendingEntries, isEmpty);
  });

  test('discard drops an entry without sending it', () async {
    final fb = FixtureBudget();
    final budget = await fb.load(prefs: userA);
    fb.offline = true;
    await budget.addTransaction(spend('Tea', 2000));

    await budget.discardEntry(budget.pendingEntries.single.key);
    fb.offline = false;
    fb.requests.clear();
    await budget.syncNow();

    expect(budget.pendingEntries, isEmpty);
    expect(posts(fb), isEmpty);
  });

  test('mark paid offline is captured with its pay path and body', () async {
    final fb = FixtureBudget();
    final budget = await fb.load(prefs: userA);
    final bill = budget.transactionModels.firstWhere((t) => t.isPlanned);
    fb.offline = true;

    final result = await budget.payTransaction(bill.id, amount: 500000, date: '2026-11-20');

    expect(result, WriteResult.queued);
    final entry = budget.pendingEntries.single;
    expect(entry.kind, OutboxKind.markPaid);
    expect(entry.path, '/api/v1/transactions/${bill.id}/pay');
    expect(entry.body, {'amount': 500000, 'date': '2026-11-20'});
    expect(entry.label, bill.name);
  });

  test('a planned bill is not captured: it waits for the server', () async {
    final fb = FixtureBudget();
    final budget = await fb.load(prefs: userA);
    fb.offline = true;

    await expectLater(budget.addItem({'name': 'Rent', 'amount': 1000}), throwsA(isA<ApiException>()));
    expect(budget.pendingEntries, isEmpty);
  });

  group('starting offline', () {
    Future<AuthProvider> start(Map<String, Object> prefs, http.Client client) async {
      SharedPreferences.setMockInitialValues({StorageService.keyBaseUrl: 'http://api.test', ...prefs});
      await StorageService.setToken('token-a');
      await StorageService.setUser({'id': 'user-a', 'email': 'a@test'});
      ApiService()
        ..retryDelay = Duration.zero
        ..client = client;
      final auth = AuthProvider();
      await auth.init();
      return auth;
    }

    test('stays signed in as the last known user when the server is unreachable', () async {
      final auth = await start({}, MockClient((_) async => throw const SocketException('offline')));
      expect(auth.isAuthenticated, isTrue);
      expect(auth.user?['id'], 'user-a');
    });

    test('a rejected token still signs out', () async {
      final auth = await start({}, MockClient((_) async => http.Response('{"error":"expired"}', 401)));
      expect(auth.isAuthenticated, isFalse);
      expect(await StorageService.getToken(), isNull);
      expect(await StorageService.getUser(), isNull);
    });
  });

  testWidgets('the strip counts what waits and the sheet lists it', (tester) async {
    final fb = FixtureBudget();
    late BudgetProvider budget;
    await tester.runAsync(() async {
      budget = await fb.load(prefs: userA);
      fb.offline = true;
      await budget.addTransaction(spend('Tea', 2000));
      await budget.addTransaction(spend('Bus', 3000));
    });

    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: budget,
      child: const MaterialApp(home: Scaffold(body: SyncStrip())),
    ));
    expect(find.text('2 waiting to sync'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('sync-strip')));
    await tester.pumpAndSettle();
    expect(find.text('Spend · Tea'), findsOneWidget);
    expect(find.text('Spend · Bus'), findsOneWidget);
    expect(find.textContaining('Balances and Safe-to-Spend change once'), findsOneWidget);
  });
}
