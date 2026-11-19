import 'dart:convert';

import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/screens/plan_screen.dart';
import 'package:budget_mobile/services/api_service.dart';
import 'package:budget_mobile/widgets/load_error_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_font_http.dart';

/// A failed load must never look like an empty month (upgrade plan 1.2, T7).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  useFakeFontHttp();

  final api = ApiService();
  final now = DateTime.now();

  http.Response ok(Object? data) => http.Response(jsonEncode({'status': 'success', 'data': data}), 200);
  http.Response fail(int status) =>
      http.Response(jsonEncode({'status': 'error', 'error': {'code': 'E', 'message': 'boom'}}), status);

  Future<BudgetProvider> providerWith(int monthStatus) async {
    SharedPreferences.setMockInitialValues({});
    api.updateBaseUrl('http://api.test');
    api.retryDelay = Duration.zero;
    api.client = MockClient((req) async {
      final path = req.url.path;
      if (path == '/api/settings') return ok(<String, dynamic>{});
      if (path == '/api/v1/periods') return ok([{'year': now.year, 'month': now.month}]);
      if (RegExp(r'^/api/v1/periods/\d+/\d+$').hasMatch(path)) return fail(monthStatus);
      return ok([]);
    });
    final budget = BudgetProvider(api: api);
    await budget.loadInitialData();
    return budget;
  }

  Widget host(BudgetProvider budget, Widget child) => ChangeNotifierProvider.value(
        value: budget,
        child: MaterialApp(home: Scaffold(body: child)),
      );

  testWidgets('a server error with nothing loaded shows an error with Try again, not "no month"', (tester) async {
    final budget = await tester.runAsync(() => providerWith(500));
    await tester.pumpWidget(host(budget!, const PlanScreen()));
    await tester.pump();

    expect(find.byType(LoadErrorView), findsOneWidget);
    expect(find.text("Couldn't load this month"), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    expect(find.text('No Active Budget Month'), findsNothing);
  });

  testWidgets('a month that does not exist (404) shows the "no month" state', (tester) async {
    final budget = await tester.runAsync(() => providerWith(404));
    await tester.pumpWidget(host(budget!, const PlanScreen()));
    await tester.pump();

    expect(find.byType(LoadErrorView), findsNothing);
    expect(find.text('No Active Budget Month'), findsOneWidget);
  });

  testWidgets('the banner stays hidden when there is no stale data to label', (tester) async {
    final budget = await tester.runAsync(() => providerWith(500));
    await tester.pumpWidget(host(budget!, const LoadErrorBanner()));
    await tester.pump();

    expect(find.text('Retry'), findsNothing);
  });
}
