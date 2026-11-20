// Boots the real app entry widget so a broken main.dart fails a test,
// not just the release build.
import 'dart:async';
import 'dart:io';

import 'package:budget_mobile/main.dart';
import 'package:budget_mobile/providers/auth_provider.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/providers/theme_provider.dart';
import 'package:budget_mobile/screens/auth_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

// google_fonts fetches fonts over HTTP; answer every request with an empty 200.
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
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;
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

  testWidgets('app boots to the sign-in screen when no token is stored', (tester) async {
    SharedPreferences.setMockInitialValues({});

    final theme = ThemeProvider();
    final auth = AuthProvider();
    await tester.runAsync(() async {
      await theme.init();
      await auth.init();
    });

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: theme),
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider(create: (_) => BudgetProvider()),
        ],
        child: const BudgetMobileApp(),
      ),
    );
    await tester.pump();

    expect(auth.isLoading, isFalse);
    expect(auth.isAuthenticated, isFalse);
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.byType(AuthScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
