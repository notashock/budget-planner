import 'package:flutter/material.dart';

/// Design tokens mapping 1:1 with Swiss Linear Monochrome theme in apps/web/src/index.css

class AppColors {
  // Light Theme Tokens
  static const lightBg = Color(0xFFFFFFFF);
  static const lightSurface = Color(0xFFFAFAFA);
  static const lightSurfaceSubtle = Color(0xFFF4F4F5);
  static const lightSurfaceHover = Color(0xFFEEEEEE);
  static const lightBorder = Color(0xFFE4E4E7);
  static const lightBorderSubtle = Color(0xFFF0F0F2);
  static const lightBorderStrong = Color(0xFFD4D4D8);
  static const lightText = Color(0xFF09090B);
  static const lightTextSecondary = Color(0xFF52525B);
  static const lightTextMuted = Color(0xFF71717A);
  static const lightAccent = Color(0xFF09090B);

  // Dark Theme Tokens
  static const darkBg = Color(0xFF09090B);
  static const darkSurface = Color(0xFF101013);
  static const darkSurfaceSubtle = Color(0xFF18181B);
  static const darkSurfaceHover = Color(0xFF1F1F23);
  static const darkBorder = Color(0xFF27272A);
  static const darkBorderSubtle = Color(0xFF1C1C1F);
  static const darkBorderStrong = Color(0xFF3F3F46);
  static const darkText = Color(0xFFF4F4F5);
  static const darkTextSecondary = Color(0xFFA1A1AA);
  static const darkTextMuted = Color(0xFF71717A);
  static const darkAccent = Color(0xFFFFFFFF);

  // Status Colors (Subtle & High Contrast)
  static const green = Color(0xFF10B981);
  static const greenSubtle = Color(0x1A10B981);
  static const red = Color(0xFFEF4444);
  static const redSubtle = Color(0x1AEF4444);
  static const amber = Color(0xFFF59E0B);
  static const amberSubtle = Color(0x1AF59E0B);

  // General theme tokens
  static const primary = Color(0xFF6366F1);
  static const darkBackground = darkBg;
  static const lightBackground = lightBg;
}
