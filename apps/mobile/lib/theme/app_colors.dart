import 'package:flutter/material.dart';

/// Neutral tokens of `apps/web/src/styles/tokens.css`, for code that picks
/// light or dark itself (`isDark ? AppColors.darkText : AppColors.lightText`).
/// New code reads `context.palette` (app_palette.dart), which also has the
/// status colours (good / bad / warn) that change with the theme.
/// `test/design_tokens_test.dart` keeps these equal to the web.
class AppColors {
  // :root
  static const lightBg = Color(0xFFFCFCFD);
  static const lightSurface = Color(0xFFFFFFFF);
  static const lightSurfaceSubtle = Color(0xFFF4F4F6);
  static const lightSurfaceHover = Color(0xFFECECEE);
  static const lightBorder = Color(0xFFE4E4E7);
  static const lightBorderSubtle = Color(0xFFF0F0F3);
  static const lightBorderStrong = Color(0xFFD4D4D8);
  static const lightText = Color(0xFF09090B);
  static const lightTextSecondary = Color(0xFF52525B);
  static const lightTextMuted = Color(0xFF67676F);
  static const lightAccent = Color(0xFF09090B);

  // [data-theme="dark"]
  static const darkBg = Color(0xFF09090B);
  static const darkSurface = Color(0xFF111114);
  static const darkSurfaceSubtle = Color(0xFF18181C);
  static const darkSurfaceHover = Color(0xFF222226);
  static const darkBorder = Color(0xFF27272A);
  static const darkBorderSubtle = Color(0xFF1C1C20);
  static const darkBorderStrong = Color(0xFF3F3F46);
  static const darkText = Color(0xFFF4F4F5);
  static const darkTextSecondary = Color(0xFFA1A1AA);
  static const darkTextMuted = Color(0xFF8A8A93);
  static const darkAccent = Color(0xFFFFFFFF);

  static const darkBackground = darkBg;
  static const lightBackground = lightBg;
}
