import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  static const String keyToken = 'budget_auth_token';
  static const String keyTheme = 'budget_theme';
  static const String keyBaseUrl = 'budget_base_url';

  /// Server used until the user picks one in server settings. Set per build:
  /// `flutter build apk --dart-define=API_BASE_URL=https://api.example.com`.
  /// Release builds block plain HTTP, so give them an https:// URL.
  static const String defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:4000',
  );

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keyToken);
  }

  static Future<void> setToken(String? token) async {
    final prefs = await SharedPreferences.getInstance();
    if (token == null) {
      await prefs.remove(keyToken);
    } else {
      await prefs.setString(keyToken, token);
    }
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
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(keyToken);
  }
}
