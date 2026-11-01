import 'dart:async';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:budget_mobile/theme/app_colors.dart';
import 'package:budget_mobile/widgets/step_line_chart.dart';
import 'package:budget_mobile/engine/simulator.dart';

class _FakeHttpClient extends Fake implements HttpClient {
  @override
  bool autoUncompress = true;
  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _FakeHttpRequest();
}

class _FakeHttpRequest extends Fake implements HttpClientRequest {
  @override
  final HttpHeaders headers = _FakeHttpHeaders();
  @override
  Future<HttpClientResponse> close() async => _FakeHttpResponse();
}

class _FakeHttpHeaders extends Fake implements HttpHeaders {
  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {}
}

class _FakeHttpResponse extends Fake implements HttpClientResponse {
  @override
  int get statusCode => 200;
  @override
  int get contentLength => 0;
  @override
  HttpClientResponseCompressionState get compressionState => HttpClientResponseCompressionState.notCompressed;
  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int>)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    return const Stream<List<int>>.empty().listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }
}

class _TestHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => _FakeHttpClient();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = _TestHttpOverrides();

  test('AppColors verify constants', () {
    expect(AppColors.green, isNotNull);
    expect(AppColors.amber, isNotNull);
    expect(AppColors.red, isNotNull);
  });

  testWidgets('StepLineChartWidget renders with salaryCreditDay and displays Salary Credit legend', (tester) async {
    final simulation = SimulationResult(
      openingBalance: 100000,
      closingBalance: 150000,
      lowestBalance: 90000,
      lowestBalanceDay: 5,
      totalIncome: 100000,
      totalPlannedExpenses: 50000,
      totalActualExpenses: 0,
      todaysBalance: 120000,
      days: List.generate(
        30,
        (i) => TimelineDay(
          day: i + 1,
          date: '2026-10-${(i + 1).toString().padLeft(2, '0')}',
          openingBalance: 100000 + (i * 1000),
          closingBalance: 100000 + (i * 1000),
          totalInflow: 0,
          totalOutflow: 0,
          events: [],
          hasBreach: false,
        ),
      ),
      allEvents: [],
      breaches: [],
      safeVelocity: SafeVelocity(
        safeDailyAmount: 2000,
        remainingDays: 15,
        availableBudget: 30000,
        status: 'healthy',
      ),
      accountBalances: {},
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StepLineChartWidget(
            simulation: simulation,
            safetyFloor: 50000,
            daysInMonth: 30,
            currentDay: 18,
            salaryCreditDay: 25,
            currencySymbol: '₹',
          ),
        ),
      ),
    );

    expect(find.text('CASHFLOW TRAJECTORY'), findsOneWidget);
    expect(find.text('Daily Balance'), findsOneWidget);
    expect(find.text('Safety Floor'), findsOneWidget);
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Salary Credit'), findsOneWidget);
  });
}
