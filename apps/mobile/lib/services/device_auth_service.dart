import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

/// The phone's own lock: fingerprint / face, with the device PIN, pattern or
/// password as fallback. The app keeps no PIN of its own.
abstract class DeviceAuthenticator {
  /// True when the device has a screen lock or biometrics the app can use.
  Future<bool> isAvailable();

  /// Shows the system prompt. True only on success; false on cancel or failure.
  Future<bool> authenticate(String reason);
}

class LocalDeviceAuthenticator implements DeviceAuthenticator {
  final LocalAuthentication _auth = LocalAuthentication();

  @override
  Future<bool> isAvailable() async {
    try {
      // isDeviceSupported covers a device PIN/pattern even with no biometrics enrolled.
      return await _auth.isDeviceSupported();
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  @override
  Future<bool> authenticate(String reason) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          // Device PIN/pattern is allowed, so a broken sensor never locks the user out.
          biometricOnly: false,
          // Keep the prompt if the app is briefly backgrounded during it.
          stickyAuth: true,
          useErrorDialogs: true,
        ),
      );
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }
}

/// Keeps the app's contents out of screenshots and the Android recents
/// thumbnail (FLAG_SECURE). No-op on other platforms.
abstract class ScreenSecurity {
  Future<void> setSecure(bool secure);
}

class AndroidScreenSecurity implements ScreenSecurity {
  static const MethodChannel _channel = MethodChannel('budget_planner/screen_security');

  @override
  Future<void> setSecure(bool secure) async {
    if (defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _channel.invokeMethod<void>('setSecure', {'secure': secure});
    } on PlatformException {
      // Best effort: the lock still works without it.
    } on MissingPluginException {
      // Tests and platforms without the channel.
    }
  }
}
