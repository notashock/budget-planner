import 'package:budget_mobile/services/storage_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The auth token lives in secure storage only (upgrade plan 1.8).
void main() {
  const secure = FlutterSecureStorage();

  test('moves a token left in SharedPreferences by an older build, then deletes it', () async {
    SharedPreferences.setMockInitialValues({StorageService.keyToken: 'old-token'});

    expect(await StorageService.getToken(), 'old-token');

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey(StorageService.keyToken), isFalse);
    expect(await secure.read(key: StorageService.keyToken), 'old-token');
  });

  test('stores new tokens in secure storage, never in SharedPreferences', () async {
    SharedPreferences.setMockInitialValues({});
    await StorageService.setToken('new-token');

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(StorageService.keyToken), isNull);
    expect(await secure.read(key: StorageService.keyToken), 'new-token');

    StorageService.resetTokenCache();
    expect(await StorageService.getToken(), 'new-token');
  });

  test('signing out removes the token everywhere', () async {
    SharedPreferences.setMockInitialValues({});
    await StorageService.setToken('t');
    await StorageService.clearAll();

    expect(await StorageService.getToken(), isNull);
    expect(await secure.read(key: StorageService.keyToken), isNull);
    StorageService.resetTokenCache();
    expect(await StorageService.getToken(), isNull);
  });

  test('a secure token wins over a stale plain copy, and the plain copy is deleted', () async {
    FlutterSecureStorage.setMockInitialValues({StorageService.keyToken: 'secure-token'});
    SharedPreferences.setMockInitialValues({StorageService.keyToken: 'stale-token'});

    expect(await StorageService.getToken(), 'secure-token');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.containsKey(StorageService.keyToken), isFalse);
  });
}
