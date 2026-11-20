import 'dart:convert';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  static const String keyToken = 'budget_auth_token';
  static const String keyTheme = 'budget_theme';
  static const String keyBaseUrl = 'budget_base_url';
  static const String keyMonthCache = 'budget_month_cache_v1';
  static const String keyUser = 'budget_user';

  /// Server used until the user picks one in server settings. Set per build:
  /// `flutter build apk --dart-define=API_BASE_URL=https://api.example.com`.
  /// Release builds block plain HTTP, so give them an https:// URL.
  static const String defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:4000',
  );

  // The auth token lives in the Android Keystore / iOS Keychain, never in
  // SharedPreferences. Older builds stored it under [keyToken] in
  // SharedPreferences; the first read moves it and deletes the old copy.
  static const FlutterSecureStorage _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  // Every request needs the token, so keep it in memory after the first read.
  static String? _token;
  static bool _tokenLoaded = false;

  static Future<String?> getToken() async {
    if (_tokenLoaded) return _token;

    var token = await _secure.read(key: keyToken);
    if (token == null || token.isEmpty) {
      final prefs = await SharedPreferences.getInstance();
      final legacy = prefs.getString(keyToken);
      if (legacy != null && legacy.isNotEmpty) {
        await _secure.write(key: keyToken, value: legacy);
        token = legacy;
      }
    }
    // Remove any plain-text copy, migrated or stale.
    final prefs = await SharedPreferences.getInstance();
    if (prefs.containsKey(keyToken)) await prefs.remove(keyToken);

    _token = (token == null || token.isEmpty) ? null : token;
    _tokenLoaded = true;
    return _token;
  }

  static Future<void> setToken(String? token) async {
    if (token == null || token.isEmpty) {
      await _secure.delete(key: keyToken);
      _token = null;
    } else {
      await _secure.write(key: keyToken, value: token);
      _token = token;
    }
    _tokenLoaded = true;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.containsKey(keyToken)) await prefs.remove(keyToken);
    // A new session (sign-in, sign-out, expiry) never sees the last one's month.
    await prefs.remove(keyMonthCache);
    if (token == null || token.isEmpty) await prefs.remove(keyUser);
  }

  /// The signed-in user as the server last described it (`id`, `email`), so
  /// the app can start offline and knows whose outbox entries to show.
  static Future<Map<String, dynamic>?> getUser() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(keyUser);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } on FormatException {
      return null;
    }
  }

  static Future<void> setUser(Map<String, dynamic>? user) async {
    final prefs = await SharedPreferences.getInstance();
    final id = user?['id'] ?? user?['_id'];
    if (id == null) {
      await prefs.remove(keyUser);
    } else {
      await prefs.setString(keyUser, jsonEncode({'id': '$id', 'email': ?user?['email']}));
    }
  }

  static Future<String?> getUserId() async => (await getUser())?['id'] as String?;

  /// The last month loaded from the server (see BudgetProvider), or null.
  static Future<Map<String, dynamic>?> readMonthCache() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(keyMonthCache);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } on FormatException {
      return null;
    }
  }

  /// Saves [data] only if [owner] is still the signed-in token.
  static Future<void> writeMonthCache(Map<String, dynamic> data, {required String owner}) async {
    final encoded = jsonEncode(data);
    if (await getToken() != owner) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyMonthCache, encoded);
  }

  static Future<void> clearMonthCache() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(keyMonthCache);
  }

  /// Forgets the in-memory token so the next read goes to storage.
  @visibleForTesting
  static void resetTokenCache() {
    _token = null;
    _tokenLoaded = false;
  }

  static Future<String> getThemeMode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keyTheme) ?? 'system';
  }

  static Future<void> setThemeMode(String mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyTheme, mode);
  }

  static Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keyBaseUrl) ?? defaultBaseUrl;
  }

  static Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyBaseUrl, url);
  }

  static Future<void> clearAll() async {
    await setToken(null);
  }
}
