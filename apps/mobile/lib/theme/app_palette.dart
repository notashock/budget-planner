import 'package:flutter/material.dart';

/// The design tokens of `apps/web/src/styles/tokens.css`, per brightness
/// (upgrade plan 3.1). `test/design_tokens_test.dart` reads that file and
/// fails if a value here drifts from the web.
///
/// Status colours change with the theme (lighter in dark mode, as on web) and
/// carry meaning: [good] money in / healthy, [bad] money out / breach, [warn]
/// close to the floor. The `*Ink` colours are for status text on its own
/// tint (`*Subtle`), where the plain colour is too light to read.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  final Color bg, surface, surfaceSubtle, surfaceHover;
  final Color border, borderSubtle, borderStrong;
  final Color text, textSecondary, textMuted, accent;
  final Color good, goodSubtle, goodInk;
  final Color bad, badSubtle, badInk;
  final Color warn, warnSubtle, warnInk;
  final Color indigo, goal;

  const AppPalette({
    required this.bg,
    required this.surface,
    required this.surfaceSubtle,
    required this.surfaceHover,
    required this.border,
    required this.borderSubtle,
    required this.borderStrong,
    required this.text,
    required this.textSecondary,
    required this.textMuted,
    required this.accent,
    required this.good,
    required this.goodSubtle,
    required this.goodInk,
    required this.bad,
    required this.badSubtle,
    required this.badInk,
    required this.warn,
    required this.warnSubtle,
    required this.warnInk,
    required this.indigo,
    required this.goal,
  });

  /// `:root` in tokens.css.
  static const light = AppPalette(
    bg: Color(0xFFFCFCFD),
    surface: Color(0xFFFFFFFF),
    surfaceSubtle: Color(0xFFF4F4F6),
    surfaceHover: Color(0xFFECECEE),
    border: Color(0xFFE4E4E7),
    borderSubtle: Color(0xFFF0F0F3),
    borderStrong: Color(0xFFD4D4D8),
    text: Color(0xFF09090B),
    textSecondary: Color(0xFF52525B),
    textMuted: Color(0xFF67676F),
    accent: Color(0xFF4F46E5), // --brand (indigo)
    good: Color(0xFF10B981),
    goodSubtle: Color(0x1410B981), // rgba(16, 185, 129, 0.08)
    goodInk: Color(0xFF047857),
    bad: Color(0xFFF43F5E),
    badSubtle: Color(0x14F43F5E), // rgba(244, 63, 94, 0.08)
    badInk: Color(0xFFBE123C),
    warn: Color(0xFFF59E0B),
    warnSubtle: Color(0x14F59E0B), // rgba(245, 158, 11, 0.08)
    warnInk: Color(0xFFB45309),
    indigo: Color(0xFF6366F1),
    goal: Color(0xFFEA580C),
  );

  /// `[data-theme="dark"]` in tokens.css.
  static const dark = AppPalette(
    bg: Color(0xFF09090B),
    surface: Color(0xFF111114),
    surfaceSubtle: Color(0xFF18181C),
    surfaceHover: Color(0xFF222226),
    border: Color(0xFF27272A),
    borderSubtle: Color(0xFF1C1C20),
    borderStrong: Color(0xFF3F3F46),
    text: Color(0xFFF4F4F5),
    textSecondary: Color(0xFFA1A1AA),
    textMuted: Color(0xFF8A8A93),
    accent: Color(0xFF8B85FF), // --brand (indigo)
    good: Color(0xFF34D399),
    goodSubtle: Color(0x1A34D399), // rgba(52, 211, 153, 0.1)
    goodInk: Color(0xFF6EE7B7),
    bad: Color(0xFFFB7185),
    badSubtle: Color(0x1AFB7185), // rgba(251, 113, 133, 0.1)
    badInk: Color(0xFFFDA4AF),
    warn: Color(0xFFFBBF24),
    warnSubtle: Color(0x1AFBBF24), // rgba(251, 191, 36, 0.1)
    warnInk: Color(0xFFFCD34D),
    indigo: Color(0xFF818CF8),
    goal: Color(0xFFFB923C),
  );

  /// The palette of the nearest theme; the light one if a test pumps a bare
  /// MaterialApp without the app's theme.
  static AppPalette of(BuildContext context) => Theme.of(context).extension<AppPalette>() ?? light;

  @override
  AppPalette copyWith({Color? accent}) => AppPalette(
        bg: bg,
        surface: surface,
        surfaceSubtle: surfaceSubtle,
        surfaceHover: surfaceHover,
        border: border,
        borderSubtle: borderSubtle,
        borderStrong: borderStrong,
        text: text,
        textSecondary: textSecondary,
        textMuted: textMuted,
        accent: accent ?? this.accent,
        good: good,
        goodSubtle: goodSubtle,
        goodInk: goodInk,
        bad: bad,
        badSubtle: badSubtle,
        badInk: badInk,
        warn: warn,
        warnSubtle: warnSubtle,
        warnInk: warnInk,
        indigo: indigo,
        goal: goal,
      );

  @override
  AppPalette lerp(AppPalette? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppPalette(
      bg: l(bg, other.bg),
      surface: l(surface, other.surface),
      surfaceSubtle: l(surfaceSubtle, other.surfaceSubtle),
      surfaceHover: l(surfaceHover, other.surfaceHover),
      border: l(border, other.border),
      borderSubtle: l(borderSubtle, other.borderSubtle),
      borderStrong: l(borderStrong, other.borderStrong),
      text: l(text, other.text),
      textSecondary: l(textSecondary, other.textSecondary),
      textMuted: l(textMuted, other.textMuted),
      accent: l(accent, other.accent),
      good: l(good, other.good),
      goodSubtle: l(goodSubtle, other.goodSubtle),
      goodInk: l(goodInk, other.goodInk),
      bad: l(bad, other.bad),
      badSubtle: l(badSubtle, other.badSubtle),
      badInk: l(badInk, other.badInk),
      warn: l(warn, other.warn),
      warnSubtle: l(warnSubtle, other.warnSubtle),
      warnInk: l(warnInk, other.warnInk),
      indigo: l(indigo, other.indigo),
      goal: l(goal, other.goal),
    );
  }
}

extension AppPaletteContext on BuildContext {
  /// The design tokens for the current theme (light or dark).
  AppPalette get palette => AppPalette.of(this);
}
