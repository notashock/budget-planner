import 'dart:async';

import 'package:budget_mobile/providers/app_lock_provider.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_device_auth.dart';

/// App lock rules (upgrade plan 1.9).
void main() {
  late FakeAuthenticator auth;
  late FakeScreenSecurity screen;
  late DateTime now;

  AppLockProvider make() => AppLockProvider(authenticator: auth, screenSecurity: screen, clock: () => now);

  Future<AppLockProvider> enabled({LockAfter after = LockAfter.thirtySeconds}) async {
    SharedPreferences.setMockInitialValues({
      AppLockProvider.keyEnabled: true,
      AppLockProvider.keyLockAfter: after.name,
    });
    final lock = make();
    await lock.init();
    expect(await lock.unlock(), isTrue);
    return lock;
  }

  void background(AppLockProvider lock, Duration away) {
    lock.handleLifecycle(AppLifecycleState.inactive);
    lock.handleLifecycle(AppLifecycleState.hidden);
    lock.handleLifecycle(AppLifecycleState.paused);
    now = now.add(away);
    lock.handleLifecycle(AppLifecycleState.inactive);
    lock.handleLifecycle(AppLifecycleState.resumed);
  }

  setUp(() {
    auth = FakeAuthenticator();
    screen = FakeScreenSecurity();
    now = DateTime(2026, 11, 19, 10);
    SharedPreferences.setMockInitialValues({});
  });

  group('turning it on and off', () {
    test('is off by default and never locks', () async {
      final lock = make();
      await lock.init();
      expect(lock.isEnabled, isFalse);
      expect(lock.isLocked, isFalse);
      background(lock, const Duration(hours: 1));
      expect(lock.isLocked, isFalse);
      expect(lock.isObscured, isFalse);
      expect(screen.secure, isFalse);
    });

    test('turning it on needs one successful authentication', () async {
      final lock = make();
      await lock.init();

      auth.succeed = false;
      expect(await lock.enable(), isFalse);
      expect(lock.isEnabled, isFalse);
      expect((await SharedPreferences.getInstance()).getBool(AppLockProvider.keyEnabled), isNot(true));

      auth.succeed = true;
      expect(await lock.enable(), isTrue);
      expect(lock.isEnabled, isTrue);
      expect(lock.isLocked, isFalse, reason: 'just confirmed: not locked now');
      expect(screen.secure, isTrue);
      expect((await SharedPreferences.getInstance()).getBool(AppLockProvider.keyEnabled), isTrue);
    });

    test('cannot be turned on without a screen lock on the phone', () async {
      auth.available = false;
      final lock = make();
      await lock.init();
      expect(await lock.enable(), isFalse);
      expect(auth.prompts, isEmpty);
    });

    test('turning it off unlocks and allows screenshots again', () async {
      final lock = await enabled(after: LockAfter.immediately);
      background(lock, const Duration(seconds: 5));
      expect(lock.isLocked, isTrue);

      await lock.disable();
      expect(lock.isLocked, isFalse);
      expect(screen.secure, isFalse);
    });
  });

  group('cold start', () {
    test('starts locked when on, with screenshots blocked', () async {
      SharedPreferences.setMockInitialValues({AppLockProvider.keyEnabled: true});
      final lock = make();
      await lock.init();
      expect(lock.isLocked, isTrue);
      expect(screen.secure, isTrue);
    });

    test('switches itself off if the phone no longer has a screen lock, instead of trapping the user', () async {
      SharedPreferences.setMockInitialValues({AppLockProvider.keyEnabled: true});
      auth.available = false;
      final lock = make();
      await lock.init();
      expect(lock.isEnabled, isFalse);
      expect(lock.isLocked, isFalse);
    });

    test('remembers when to lock', () async {
      final first = make();
      await first.init();
      await first.setLockAfter(LockAfter.fiveMinutes);
      final second = make();
      await second.init();
      expect(second.lockAfter, LockAfter.fiveMinutes);
    });
  });

  group('backgrounding', () {
    test('locks after the chosen delay, not before', () async {
      final lock = await enabled(after: LockAfter.thirtySeconds);
      background(lock, const Duration(seconds: 29));
      expect(lock.isLocked, isFalse);
      background(lock, const Duration(seconds: 30));
      expect(lock.isLocked, isTrue);
    });

    test('a brief interruption (notification shade) only covers the screen', () async {
      final lock = await enabled(after: LockAfter.immediately);
      lock.handleLifecycle(AppLifecycleState.inactive);
      expect(lock.isObscured, isTrue);
      now = now.add(const Duration(minutes: 2));
      lock.handleLifecycle(AppLifecycleState.resumed);
      expect(lock.isObscured, isFalse);
      expect(lock.isLocked, isFalse, reason: 'inactive alone is not backgrounding');
    });

    test('covers the screen whenever the app is not in front', () async {
      final lock = await enabled();
      lock.handleLifecycle(AppLifecycleState.paused);
      expect(lock.isObscured, isTrue);
    });
  });

  group('unlocking', () {
    test('a failed or cancelled prompt keeps it locked', () async {
      SharedPreferences.setMockInitialValues({AppLockProvider.keyEnabled: true});
      final lock = make();
      await lock.init();
      auth.succeed = false;
      expect(await lock.unlock(), isFalse);
      expect(lock.isLocked, isTrue);
    });

    test('the prompt itself (app goes inactive/paused) cannot re-lock right after success', () async {
      SharedPreferences.setMockInitialValues({
        AppLockProvider.keyEnabled: true,
        AppLockProvider.keyLockAfter: LockAfter.immediately.name,
      });
      final lock = make();
      await lock.init();

      auth.pending = Completer<bool>();
      final unlocking = lock.unlock();
      expect(lock.isAuthenticating, isTrue);
      // What Android and iOS do while the system prompt is up.
      background(lock, const Duration(seconds: 3));
      auth.pending!.complete(true);
      expect(await unlocking, isTrue);

      expect(lock.isLocked, isFalse);
      expect(lock.isObscured, isFalse);
      lock.handleLifecycle(AppLifecycleState.resumed);
      expect(lock.isLocked, isFalse);
    });

    test('backgrounded during the prompt, success, then resumed: stays unlocked', () async {
      SharedPreferences.setMockInitialValues({
        AppLockProvider.keyEnabled: true,
        AppLockProvider.keyLockAfter: LockAfter.immediately.name,
      });
      final lock = make();
      await lock.init();

      auth.pending = Completer<bool>();
      final unlocking = lock.unlock();
      lock.handleLifecycle(AppLifecycleState.inactive);
      lock.handleLifecycle(AppLifecycleState.paused);
      now = now.add(const Duration(seconds: 3));
      auth.pending!.complete(true); // the prompt answers before the app is back in front
      expect(await unlocking, isTrue);
      lock.handleLifecycle(AppLifecycleState.inactive);
      lock.handleLifecycle(AppLifecycleState.resumed);

      expect(lock.isLocked, isFalse, reason: 'the time spent in the prompt is not time away');
      expect(lock.isObscured, isFalse);
    });

    test('a second unlock while a prompt is open does not open another prompt', () async {
      SharedPreferences.setMockInitialValues({AppLockProvider.keyEnabled: true});
      final lock = make();
      await lock.init();
      auth.pending = Completer<bool>();
      final first = lock.unlock();
      final second = await lock.unlock();
      expect(second, isFalse);
      expect(auth.prompts, hasLength(1));
      auth.pending!.complete(true);
      expect(await first, isTrue);
    });

    test('signing out clears the lock', () async {
      SharedPreferences.setMockInitialValues({AppLockProvider.keyEnabled: true});
      final lock = make();
      await lock.init();
      lock.onSignedOut();
      expect(lock.isLocked, isFalse);
    });
  });
}
