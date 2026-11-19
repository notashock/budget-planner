import 'dart:async';

import 'package:budget_mobile/services/device_auth_service.dart';

/// Scripted stand-in for the phone's fingerprint / face / screen lock.
class FakeAuthenticator implements DeviceAuthenticator {
  bool available;

  /// Answer for the next prompts; when [pending] is set, prompts wait on it.
  bool succeed;
  Completer<bool>? pending;
  final List<String> prompts = [];

  FakeAuthenticator({this.available = true, this.succeed = true});

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<bool> authenticate(String reason) {
    prompts.add(reason);
    return pending?.future ?? Future.value(succeed);
  }
}

class FakeScreenSecurity implements ScreenSecurity {
  final List<bool> calls = [];
  bool get secure => calls.isNotEmpty && calls.last;

  @override
  Future<void> setSecure(bool secure) async => calls.add(secure);
}
