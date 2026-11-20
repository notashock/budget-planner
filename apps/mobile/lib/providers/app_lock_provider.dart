import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/device_auth_service.dart';

/// How long the app may stay in the background before it locks.
enum LockAfter {
  immediately(Duration.zero, 'Immediately'),
  thirtySeconds(Duration(seconds: 30), 'After 30 seconds'),
  oneMinute(Duration(minutes: 1), 'After 1 minute'),
  fiveMinutes(Duration(minutes: 5), 'After 5 minutes');

  final Duration delay;
  final String label;
  const LockAfter(this.delay, this.label);
}

/// Opt-in app lock (upgrade plan 1.9) using the phone's own fingerprint, face
/// or screen lock.
///
/// - Turning it on needs one successful authentication, so nobody enables a
///   lock they cannot open.
/// - Only real backgrounding (paused / hidden) starts the lock timer. Brief
///   interruptions (notification shade, the system prompt itself) only cover
///   the screen, and lifecycle changes during a prompt are ignored, so a
///   successful unlock cannot re-lock straight away.
/// - While locked, the user can always sign out instead (see AppLockScreen),
///   so a failed sensor never locks anyone out of their account.
class AppLockProvider with ChangeNotifier {
  AppLockProvider({
    DeviceAuthenticator? authenticator,
    ScreenSecurity? screenSecurity,
    DateTime Function()? clock,
  })  : _auth = authenticator ?? LocalDeviceAuthenticator(),
        _screen = screenSecurity ?? AndroidScreenSecurity(),
        _now = clock ?? DateTime.now;

  static const String keyEnabled = 'app_lock_enabled';
  static const String keyLockAfter = 'app_lock_after';

  final DeviceAuthenticator _auth;
  final ScreenSecurity _screen;
  final DateTime Function() _now;

  bool _available = false;
  bool _enabled = false;
  LockAfter _lockAfter = LockAfter.thirtySeconds;
  bool _locked = false;
  bool _obscured = false;
  bool _authenticating = false;
  DateTime? _backgroundedAt;

  /// The device can authenticate (has a screen lock or biometrics).
  bool get isAvailable => _available;
  bool get isEnabled => _enabled;
  LockAfter get lockAfter => _lockAfter;

  /// The app contents must not be shown until [unlock] succeeds.
  bool get isLocked => _enabled && _locked;

  /// The app is not in front: cover its contents (app switcher, shade).
  bool get isObscured => _enabled && _obscured;

  bool get isAuthenticating => _authenticating;

  Future<void> init() async {
    _available = await _auth.isAvailable();
    final prefs = await SharedPreferences.getInstance();
    _enabled = prefs.getBool(keyEnabled) ?? false;
    _lockAfter = LockAfter.values.firstWhere(
      (l) => l.name == prefs.getString(keyLockAfter),
      orElse: () => LockAfter.thirtySeconds,
    );
    // A lock the device can no longer open (screen lock removed) is switched
    // off rather than trapping the user; their account still needs a password.
    if (_enabled && !_available) {
      _enabled = false;
      await prefs.setBool(keyEnabled, false);
    }
    _locked = _enabled; // Cold start: locked.
    await _screen.setSecure(_enabled);
    notifyListeners();
  }

  void handleLifecycle(AppLifecycleState state) {
    if (!_enabled || _authenticating) return;
    switch (state) {
      case AppLifecycleState.inactive:
        if (!_obscured) {
          _obscured = true;
          notifyListeners();
        }
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        _obscured = true;
        _backgroundedAt ??= _now();
        notifyListeners();
      case AppLifecycleState.resumed:
        final since = _backgroundedAt;
        _backgroundedAt = null;
        _obscured = false;
        if (since != null && _now().difference(since) >= _lockAfter.delay) {
          _locked = true;
        }
        notifyListeners();
      case AppLifecycleState.detached:
        break;
    }
  }

  /// Shows the system prompt; unlocks on success.
  Future<bool> unlock() async {
    if (!isLocked) return true;
    final ok = await _prompt('Unlock Budget Planner');
    if (ok) {
      _locked = false;
      notifyListeners();
    }
    return ok;
  }

  /// Turns the lock on after one successful authentication. Returns whether it is on.
  Future<bool> enable() async {
    if (_enabled) return true;
    if (!_available) return false;
    final ok = await _prompt('Confirm it is you to turn on App lock');
    if (!ok) return false;
    _enabled = true;
    _locked = false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(keyEnabled, true);
    await _screen.setSecure(true);
    notifyListeners();
    return true;
  }

  Future<void> disable() async {
    _enabled = false;
    _locked = false;
    _obscured = false;
    _backgroundedAt = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(keyEnabled, false);
    await _screen.setSecure(false);
    notifyListeners();
  }

  Future<void> setLockAfter(LockAfter value) async {
    _lockAfter = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyLockAfter, value.name);
    notifyListeners();
  }

  /// Signing out clears the lock: the next sign-in needs the password anyway.
  void onSignedOut() {
    if (!_locked && !_obscured) return;
    _locked = false;
    _obscured = false;
    notifyListeners();
  }

  Future<bool> _prompt(String reason) async {
    if (_authenticating) return false;
    _authenticating = true;
    notifyListeners();
    try {
      return await _auth.authenticate(reason);
    } finally {
      _authenticating = false;
      // The prompt took the app through inactive/resumed: it is in front now.
      _obscured = false;
      _backgroundedAt = null;
      notifyListeners();
    }
  }
}
