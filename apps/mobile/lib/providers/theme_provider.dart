import 'package:flutter/material.dart';
import '../services/storage_service.dart';

class ThemeProvider with ChangeNotifier {
  ThemeMode _themeMode = ThemeMode.system;
  bool _deviceColors = false;

  ThemeMode get themeMode => _themeMode;

  /// Opt-in (upgrade plan 3.1): the accent follows the phone's wallpaper
  /// colours on Android 12+. Off by default; the app's look is monochrome.
  bool get deviceColors => _deviceColors;

  Future<void> setDeviceColors(bool on) async {
    _deviceColors = on;
    await StorageService.setDeviceColors(on);
    notifyListeners();
  }

  String get themeModeName {
    switch (_themeMode) {
      case ThemeMode.light:
        return 'light';
      case ThemeMode.dark:
        return 'dark';
      case ThemeMode.system:
        return 'system';
    }
  }

  Future<void> init() async {
    final mode = await StorageService.getThemeMode();
    switch (mode) {
      case 'light':
        _themeMode = ThemeMode.light;
        break;
      case 'dark':
        _themeMode = ThemeMode.dark;
        break;
      default:
        _themeMode = ThemeMode.system;
        break;
    }
    _deviceColors = await StorageService.getDeviceColors();
    notifyListeners();
  }

  Future<void> setTheme(ThemeMode mode) async {
    _themeMode = mode;
    await StorageService.setThemeMode(themeModeName);
    notifyListeners();
  }

  Future<void> cycleTheme() async {
    if (_themeMode == ThemeMode.system) {
      await setTheme(ThemeMode.light);
    } else if (_themeMode == ThemeMode.light) {
      await setTheme(ThemeMode.dark);
    } else {
      await setTheme(ThemeMode.system);
    }
  }
}
