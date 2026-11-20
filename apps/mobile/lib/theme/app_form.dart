import 'package:flutter/material.dart';
import 'app_colors.dart';
import 'app_palette.dart';

/// Form sizing and spacing shared by every entry and edit sheet. Mirrors the web
/// tokens in apps/web/src/styles/tokens.css (--control-h, --field-radius, ...)
/// so both apps' forms look and feel the same.
class AppForm {
  AppForm._();

  /// Minimum height of inputs, pickers and buttons (touch target).
  static const double controlHeight = 44;

  /// Chips, quick amounts and segmented options.
  static const double controlHeightSm = 36;

  static const double fieldRadius = 8;

  /// Label -> field and field -> hint.
  static const double fieldGap = 8;

  /// Between field groups.
  static const double formGap = 16;

  /// Bottom-sheet padding: 16 at the sides (as web phones), a little less on top
  /// because the sheet header carries its own spacing.
  static const EdgeInsets sheetPadding = EdgeInsets.fromLTRB(16, 16, 16, 20);

  static const EdgeInsets fieldPadding = EdgeInsets.symmetric(horizontal: 12, vertical: 12);

  static BorderRadius get radius => BorderRadius.circular(fieldRadius);

  /// One input look for every TextField / dropdown: filled, 8px radius,
  /// labels always above the value, same focus and error borders.
  static InputDecorationTheme inputTheme({required bool isDark}) {
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final focus = isDark ? AppColors.darkText : AppColors.lightText;
    final palette = isDark ? AppPalette.dark : AppPalette.light;
    OutlineInputBorder outline(Color c, [double w = 1]) =>
        OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: c, width: w));
    return InputDecorationTheme(
      filled: true,
      fillColor: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
      contentPadding: fieldPadding,
      constraints: const BoxConstraints(minHeight: controlHeight),
      floatingLabelBehavior: FloatingLabelBehavior.always,
      labelStyle: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
      ),
      floatingLabelStyle: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: focus,
      ),
      hintStyle: TextStyle(color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted),
      helperStyle: TextStyle(fontSize: 12, color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
      errorStyle: TextStyle(fontSize: 12, color: palette.bad),
      border: outline(border),
      enabledBorder: outline(border),
      focusedBorder: outline(focus, 1.5),
      errorBorder: outline(palette.bad),
      focusedErrorBorder: outline(palette.bad, 1.5),
      disabledBorder: outline(border.withAlpha(120)),
    );
  }

  static ChipThemeData chipTheme({required bool isDark}) {
    return ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: radius),
      side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
    );
  }
}
