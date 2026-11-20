import 'dart:async';
import 'dart:convert';

import 'package:budget_mobile/providers/app_lock_provider.dart';
import 'package:budget_mobile/providers/auth_provider.dart';
import 'package:budget_mobile/services/api_service.dart';
import 'package:budget_mobile/widgets/app_lock_gate.dart';
import 'package:budget_mobile/widgets/app_lock_settings_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_device_auth.dart';
import 'helpers/fake_font_http.dart';

/// The lock covers everything, including open sheets, and always has a way out.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  useFakeFontHttp();

  late FakeAuthenticator auth;
  late FakeScreenSecurity screen;
  late AppLockProvider lock;
  late List<String> requests;

  setUp(() {
    auth = FakeAuthenticator();
    screen = FakeScreenSecurity();
    requests = [];
    ApiService()
      ..updateBaseUrl('http://api.test')
      ..client = MockClient((req) async {
        requests.add('${req.method} ${req.url.path}');
        return http.Response(jsonEncode({'status': 'success', 'data': <String, dynamic>{}}), 200);
      });
  });

  Future<void> start(WidgetTester tester, {required bool lockOn, bool signedIn = true}) async {
    SharedPreferences.setMockInitialValues({AppLockProvider.keyEnabled: lockOn});
    lock = AppLockProvider(authenticator: auth, screenSecurity: screen);
    await tester.runAsync(lock.init);
    await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: lock),
        ChangeNotifierProvider(create: (_) => AuthProvider()),
      ],
      child: MaterialApp(
        builder: (context, child) => AppLockGate(signedIn: signedIn, child: child!),
        home: Builder(
          builder: (context) => Scaffold(
            body: Column(children: [
              const Text('Balance ₹12,345.00'),
              TextButton(
                onPressed: () => showModalBottomSheet(
                  context: context,
                  builder: (_) => const Text('Open entry sheet'),
                ),
                child: const Text('Open sheet'),
              ),
              TextButton(onPressed: () => AppLockSettingsSheet.show(context), child: const Text('Lock settings')),
            ]),
          ),
        ),
      ),
    ));
    await tester.pump();
  }

  testWidgets('locked: the app, including an open sheet, is hidden behind the lock screen', (tester) async {
    auth.pending = Completer<bool>(); // the automatic prompt waits
    await start(tester, lockOn: false);
    await tester.tap(find.text('Open sheet'));
    await tester.pumpAndSettle();
    expect(find.text('Open entry sheet'), findsOneWidget);

    // Locks on top of the open sheet (e.g. back from the background).
    await tester.runAsync(() async {
      auth.pending = null;
      await lock.enable();
    });
    SharedPreferences.setMockInitialValues({AppLockProvider.keyEnabled: true});
    auth.pending = Completer<bool>();
    await tester.runAsync(lock.init);
    await tester.pump();

    expect(find.text('Budget Planner is locked'), findsOneWidget);
    expect(find.text('Balance ₹12,345.00'), findsNothing);
    expect(find.text('Open entry sheet'), findsNothing);
    auth.pending!.complete(false);
  });

  testWidgets('unlocks with the phone lock and keeps the app where it was', (tester) async {
    auth.succeed = false; // the automatic prompt on open is cancelled
    await start(tester, lockOn: true);
    await tester.pump();
    expect(find.text('Budget Planner is locked'), findsOneWidget);
    expect(find.textContaining("Couldn't confirm"), findsOneWidget);

    auth.succeed = true;
    await tester.tap(find.byKey(const ValueKey('app-lock-unlock')));
    await tester.pump();
    await tester.pump();

    expect(find.text('Budget Planner is locked'), findsNothing);
    expect(find.text('Balance ₹12,345.00'), findsOneWidget);
  });

  testWidgets('"Sign out instead" is always there and clears the lock', (tester) async {
    auth.succeed = false;
    await start(tester, lockOn: true);
    await tester.pump();

    await tester.tap(find.byKey(const ValueKey('app-lock-sign-out')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();

    expect(requests, contains('POST /api/auth/logout'));
    expect(lock.isLocked, isFalse);
  });

  testWidgets('signed out: nothing to protect, no lock screen', (tester) async {
    auth.pending = Completer<bool>();
    await start(tester, lockOn: true, signedIn: false);
    expect(find.text('Budget Planner is locked'), findsNothing);
    expect(find.text('Balance ₹12,345.00'), findsOneWidget);
  });

  testWidgets('covers the screen while the app is not in front', (tester) async {
    await start(tester, lockOn: false);
    await tester.runAsync(lock.enable);
    lock.handleLifecycle(AppLifecycleState.inactive);
    await tester.pump();
    expect(find.byKey(const ValueKey('privacy-shield')), findsOneWidget);
    lock.handleLifecycle(AppLifecycleState.resumed);
    await tester.pump();
    expect(find.byKey(const ValueKey('privacy-shield')), findsNothing);
  });

  testWidgets('settings: turning it on asks for the phone lock; a failed check leaves it off', (tester) async {
    await start(tester, lockOn: false);
    await tester.tap(find.text('Lock settings'));
    await tester.pumpAndSettle();

    auth.succeed = false;
    await tester.tap(find.byKey(const ValueKey('app-lock-switch')));
    await tester.pumpAndSettle();
    expect(lock.isEnabled, isFalse);
    expect(find.textContaining("couldn't confirm it's you"), findsOneWidget);

    auth.succeed = true;
    await tester.tap(find.byKey(const ValueKey('app-lock-switch')));
    await tester.pumpAndSettle();
    expect(lock.isEnabled, isTrue);
    expect(screen.secure, isTrue);
    expect(find.byKey(const ValueKey('app-lock-after-immediately')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('app-lock-after-fiveMinutes')));
    await tester.pumpAndSettle();
    expect(lock.lockAfter, LockAfter.fiveMinutes);
  });

  testWidgets('settings: without a screen lock on the phone the switch is disabled and says why', (tester) async {
    auth.available = false;
    await start(tester, lockOn: false);
    await tester.tap(find.text('Lock settings'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Set up a screen lock'), findsOneWidget);
    final tile = tester.widget<SwitchListTile>(find.byKey(const ValueKey('app-lock-switch')));
    expect(tile.onChanged, isNull);
  });
}
