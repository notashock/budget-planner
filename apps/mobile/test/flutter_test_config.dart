import 'dart:async';

import 'package:budget_mobile/services/storage_service.dart';
import 'package:budget_mobile/theme/app_typography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

/// Runs before every test file. Secure storage is a platform plugin, so each
/// test starts with an empty in-memory keychain and no cached token.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  // As in the app: fonts come from the bundle, never the network.
  AppTypography.useBundledFonts();
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    StorageService.resetTokenCache();
  });
  await testMain();
}
