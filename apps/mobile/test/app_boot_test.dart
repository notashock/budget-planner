// Boots the real app entry widget so a broken main.dart fails a test,
// not just the release build.
import 'package:budget_mobile/main.dart';
import 'package:budget_mobile/providers/app_lock_provider.dart';
import 'package:budget_mobile/providers/auth_provider.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/providers/theme_provider.dart';
import 'package:budget_mobile/screens/auth_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_device_auth.dart';
import 'helpers/fake_font_http.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  useFakeFontHttp();

  testWidgets('app boots to the sign-in screen when no token is stored', (tester) async {
    SharedPreferences.setMockInitialValues({});

    final theme = ThemeProvider();
    final auth = AuthProvider();
    final lock = AppLockProvider(authenticator: FakeAuthenticator(), screenSecurity: FakeScreenSecurity());
    await tester.runAsync(() async {
      await theme.init();
      await auth.init();
      await lock.init();
    });

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: theme),
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider.value(value: lock),
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
