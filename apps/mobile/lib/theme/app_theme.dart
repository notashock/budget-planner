import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_form.dart';
import 'app_palette.dart';

/// Material 3 themes built from the shared design tokens (upgrade plan 3.1).
class AppTheme {
  /// Card corners, as `--card-radius` on web.
  static const double cardRadius = 12;

  static ThemeData get lightTheme => build(Brightness.light);
  static ThemeData get darkTheme => build(Brightness.dark);

  /// [accent] replaces the monochrome accent (buttons, focus, selection) with
  /// the device's colour when the user turns on device colours. Neutrals and
  /// the good / bad / warn colours never change: they carry meaning.
  static ThemeData build(Brightness brightness, {Color? accent}) {
    final isDark = brightness == Brightness.dark;
    final base = isDark ? AppPalette.dark : AppPalette.light;
    final p = accent == null ? base : base.copyWith(accent: accent);
    final onAccent = ThemeData.estimateBrightnessForColor(p.accent) == Brightness.dark ? Colors.white : Colors.black;

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      extensions: [p],
      scaffoldBackgroundColor: p.bg,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: p.accent,
        onPrimary: onAccent,
        secondary: p.indigo,
        onSecondary: Colors.white,
        error: p.bad,
        onError: Colors.white,
        surface: p.surface,
        onSurface: p.text,
        onSurfaceVariant: p.textSecondary,
        surfaceContainerLowest: p.bg,
        surfaceContainerLow: p.surface,
        surfaceContainer: p.surfaceSubtle,
        surfaceContainerHigh: p.surfaceSubtle,
        surfaceContainerHighest: p.surfaceHover,
        outline: p.border,
        outlineVariant: p.borderSubtle,
      ),
      dividerColor: p.border,
      // Android 14+ predictive back: the page follows the back gesture
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      }),
      cardTheme: CardThemeData(
        color: p.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: p.border, width: 1),
          borderRadius: const BorderRadius.all(Radius.circular(cardRadius)),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: p.bg,
        foregroundColor: p.text,
        elevation: 0,
        scrolledUnderElevation: 0,
        systemOverlayStyle: isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: p.bg,
        selectedItemColor: p.text,
        unselectedItemColor: p.textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? p.surfaceHover : p.text,
        contentTextStyle: TextStyle(color: isDark ? p.text : p.bg),
        actionTextColor: accent ?? (isDark ? p.goodInk : const Color(0xFF6EE7B7)),
      ),
      inputDecorationTheme: AppForm.inputTheme(isDark: isDark),
      chipTheme: AppForm.chipTheme(isDark: isDark),
      textTheme: GoogleFonts.interTextTheme((isDark ? ThemeData.dark() : ThemeData.light()).textTheme)
          .apply(bodyColor: p.text, displayColor: p.text),
    );
  }
}
