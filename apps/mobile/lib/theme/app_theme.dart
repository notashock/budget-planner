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
    // Text on the accent: white or web's --brand-contrast, whichever contrasts
    // more (Flutter's brightness estimate calls #8B85FF dark and picks white, 3:1).
    const ink = Color(0xFF0B0A1F);
    final l = p.accent.computeLuminance();
    final onAccent = (1.05 / (l + 0.05)) >= ((l + 0.05) / (ink.computeLuminance() + 0.05)) ? Colors.white : ink;

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
      // Web's buttons (base.css): 8px radius, .btn-primary brand fill at 600,
      // plain buttons on the surface with a 1px border at 500. No elevation.
      elevatedButtonTheme: ElevatedButtonThemeData(style: _button(bg: p.accent, fg: onAccent, weight: FontWeight.w600)),
      filledButtonTheme: FilledButtonThemeData(style: _button(bg: p.accent, fg: onAccent, weight: FontWeight.w600)),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: _button(bg: p.surface, fg: p.text, weight: FontWeight.w500).copyWith(
          side: WidgetStatePropertyAll(BorderSide(color: p.border)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: p.text,
          shape: RoundedRectangleBorder(borderRadius: AppForm.radius),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
      ),
      // Web's .app-dropdown-menu: page background, border-strong, 8px radius, deep shadow.
      canvasColor: p.bg,
      popupMenuTheme: PopupMenuThemeData(
        color: p.bg,
        surfaceTintColor: Colors.transparent,
        elevation: 12,
        shadowColor: Colors.black.withAlpha(isDark ? 153 : 60),
        shape: RoundedRectangleBorder(
          borderRadius: AppForm.radius,
          side: BorderSide(color: p.borderStrong),
        ),
        menuPadding: const EdgeInsets.all(4),
        labelTextStyle: WidgetStatePropertyAll(TextStyle(fontSize: 13, color: p.text)),
      ),
      menuTheme: MenuThemeData(
        style: MenuStyle(
          backgroundColor: WidgetStatePropertyAll(p.bg),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
          padding: const WidgetStatePropertyAll(EdgeInsets.all(4)),
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(
            borderRadius: AppForm.radius,
            side: BorderSide(color: p.borderStrong),
          )),
        ),
      ),
      // Web's .modal-content on phones: surface, 18px top corners, 1px top border.
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: p.surface,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
          side: BorderSide(color: p.border),
        ),
      ),
      inputDecorationTheme: AppForm.inputTheme(isDark: isDark),
      chipTheme: AppForm.chipTheme(isDark: isDark, onSelected: onAccent),
      textTheme: GoogleFonts.interTextTheme((isDark ? ThemeData.dark() : ThemeData.light()).textTheme)
          .apply(bodyColor: p.text, displayColor: p.text),
    );
  }

  static ButtonStyle _button({required Color bg, required Color fg, required FontWeight weight}) =>
      ElevatedButton.styleFrom(
        backgroundColor: bg,
        foregroundColor: fg,
        elevation: 0,
        minimumSize: const Size(0, AppForm.controlHeight),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: AppForm.radius),
        textStyle: TextStyle(fontSize: 14, fontWeight: weight),
      );
}
