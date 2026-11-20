import 'dart:async';
import 'dart:io';

import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/services/api_service.dart';
import 'package:budget_mobile/services/storage_service.dart';
import 'package:budget_mobile/widgets/load_error_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'helpers/fixture_budget.dart';

/// Upgrade plan Phase 2: 2.1 (one reload per save), 2.5 (bundled fonts) and
/// 2.6 (read cache on cold start).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<Map<String, dynamic>?> cacheWhenWritten() async {
    for (var i = 0; i < 50; i++) {
      final c = await StorageService.readMonthCache();
      if (c != null) return c;
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    return null;
  }

  /// A fresh provider (a cold start) on [client], keeping the device storage.
  BudgetProvider coldStart(MockClient client) {
    final api = ApiService()
      ..updateBaseUrl('http://api.test')
      ..retryDelay = Duration.zero
      ..client = client;
    return BudgetProvider(api: api);
  }

  final offline = MockClient((_) async => throw const SocketException('no network'));

  group('2.1 reload after a save', () {
    test('one write, then month detail and goals only', () async {
      final fb = FixtureBudget();
      await fb.load();
      fb.requests.clear();

      await fb.budget.addTransaction({'name': 'Tea', 'amount': 2000});

      final paths = [for (final r in fb.requests) '${r.method} ${r.url.path}'];
      expect(paths.where((p) => p.startsWith('POST')), hasLength(1));
      final gets = paths.where((p) => p.startsWith('GET')).toList();
      expect(gets, hasLength(2), reason: '$gets');
      expect(gets.any((p) => RegExp(r'/periods/\d+/\d+$').hasMatch(p)), isTrue);
      expect(gets.any((p) => p.endsWith('/goals')), isTrue);
    });

    test('accounts and transfers come from month detail', () async {
      final fb = FixtureBudget();
      final budget = await fb.load();
      expect(fb.requests.where((r) => r.url.path == '/api/v1/accounts' || r.url.path == '/api/v1/transfers'), isEmpty);
      expect(budget.bankAccountModels, isNotEmpty);
      expect(budget.walletModels, isNotEmpty);
      expect(budget.transferModels, isNotEmpty);
    });

    test('a month detail without its account lists is unreadable, not "no accounts"', () async {
      final fb = FixtureBudget();
      await fb.load();
      fb.fixtures['accounts_bank'] = null; // served as bankAccounts: null
      await fb.budget.refresh();
      expect(fb.budget.loadError?.kind, ApiErrorKind.badResponse);
      expect(fb.budget.bankAccountModels, isNotEmpty, reason: 'the earlier accounts stay');
    });
  });

  group('2.6 read cache', () {
    test('a cold start offline shows the last month with its time', () async {
      final fb = FixtureBudget();
      await StorageService.setToken('token-a');
      await fb.load();
      final saved = await cacheWhenWritten();
      expect(saved, isNotNull);

      final budget = coldStart(offline);
      await budget.loadInitialData();

      expect(budget.transactionModels, isNotEmpty);
      expect(budget.bankAccountModels.map((a) => a.id), fb.budget.bankAccountModels.map((a) => a.id));
      expect(budget.loadError?.isOffline, isTrue);
      expect(budget.loadError?.hasData, isTrue);
      expect(budget.lastLoadedAt, DateTime.parse(saved!['savedAt'] as String));
    });

    test('the saved month shows at once, marked, until the server answers', () async {
      final fb = FixtureBudget();
      await StorageService.setToken('token-a');
      await fb.load();
      await cacheWhenWritten();

      final gate = Completer<void>();
      final budget = coldStart(MockClient((req) async {
        await gate.future;
        return http.Response('{"status":"error","error":{"message":"x"}}', 503);
      }));
      final loading = budget.loadInitialData();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(budget.transactionModels, isNotEmpty);
      expect(budget.showingSavedDataFrom, isNotNull);

      gate.complete();
      await loading;
      expect(budget.loadError, isNotNull);
      expect(budget.transactionModels, isNotEmpty, reason: 'a failed reload keeps the saved data');
    });

    test('signing out (or any new token) deletes the saved month', () async {
      final fb = FixtureBudget();
      await StorageService.setToken('token-a');
      await fb.load();
      expect(await cacheWhenWritten(), isNotNull);

      await StorageService.setToken(null);
      expect(await StorageService.readMonthCache(), isNull);

      final budget = coldStart(offline);
      await budget.loadInitialData();
      expect(budget.loadError?.hasData, isFalse);
    });

    test('nothing is saved without a signed-in user', () async {
      final fb = FixtureBudget();
      await fb.load();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(await StorageService.readMonthCache(), isNull);
    });

    test('browsing another month does not replace the saved start month', () async {
      final fb = FixtureBudget();
      await StorageService.setToken('token-a');
      await fb.load();
      final home = await cacheWhenWritten();

      await fb.budget.switchMonth(2001, 1);
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final after = await StorageService.readMonthCache();
      expect([after!['year'], after['month']], [home!['year'], home['month']]);
    });

    test('an unreadable cache is dropped and the app loads as usual', () async {
      final fb = FixtureBudget();
      await StorageService.setToken('token-a');
      await fb.load();
      await cacheWhenWritten();
      await StorageService.writeMonthCache({'year': 2026, 'month': 11, 'savedAt': 'not a date'}, owner: 'token-a');

      final budget = coldStart(offline);
      await budget.loadInitialData();
      expect(budget.loadError?.hasData, isFalse);
      expect(await StorageService.readMonthCache(), isNull);
    });

    testWidgets('the banner says the data is saved and updating', (tester) async {
      final fb = FixtureBudget();
      final gate = Completer<void>();
      late BudgetProvider budget;
      late Future<void> loading;
      await tester.runAsync(() async {
        await StorageService.setToken('token-a');
        await fb.load();
        await cacheWhenWritten();
        budget = coldStart(MockClient((req) async {
          await gate.future;
          return http.Response('{}', 503);
        }));
        loading = budget.loadInitialData();
        await Future<void>.delayed(const Duration(milliseconds: 20));
      });

      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: budget,
        child: const MaterialApp(home: Scaffold(body: LoadErrorBanner())),
      ));
      expect(find.textContaining('Showing saved data from'), findsOneWidget);
      expect(find.textContaining('updating'), findsOneWidget);

      gate.complete();
      await tester.runAsync(() => loading);
      await tester.pump();
      expect(find.textContaining('Showing saved data'), findsNothing);
      expect(find.text('Retry'), findsOneWidget);
    });
  });

  group('2.2 what the tabs rebuild on', () {
    test('a save that is waiting, and the sync strip, leave viewState unchanged', () async {
      final fb = FixtureBudget();
      final budget = await fb.load(prefs: const {StorageService.keyUser: '{"id":"user-a"}'});
      final before = budget.viewState;
      var notified = 0;
      budget.addListener(() => notified++);

      fb.offline = true;
      await budget.addTransaction({'description': 'Tea', 'amount': 2000});

      expect(notified, greaterThan(0), reason: 'the strip and isSaving still update');
      expect(budget.viewState, before);
    });

    test('new data, a month switch or a load error change it', () async {
      final fb = FixtureBudget();
      final budget = await fb.load();
      final first = budget.viewState;

      await budget.refresh();
      final reloaded = budget.viewState;
      expect(reloaded, isNot(first));

      fb.offline = true;
      await budget.refresh();
      expect(budget.viewState.error, isNotNull);
      expect(budget.viewState.data, reloaded.data, reason: 'the data on screen did not change');
    });
  });

  test('formatLoadedAt shows the day only when it is not today', () {
    final now = DateTime(2026, 11, 20, 18);
    // intl puts a narrow no-break space before AM/PM
    String f(DateTime at) => formatLoadedAt(at, now: now).replaceAll(' ', ' ');
    expect(f(DateTime(2026, 11, 20, 10, 42)), '10:42 AM');
    expect(f(DateTime(2026, 11, 18, 10, 42)), '18 Nov, 10:42 AM');
  });

  test('2.5 every weight the app uses is bundled', () async {
    for (final family in ['Inter', 'JetBrainsMono']) {
      for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) {
        final data = await rootBundle.load('google_fonts/$family-$w.ttf');
        expect(data.lengthInBytes, greaterThan(50000), reason: '$family-$w');
      }
    }
  });
}
