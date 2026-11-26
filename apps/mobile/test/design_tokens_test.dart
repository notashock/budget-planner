import 'dart:io';

import 'package:budget_mobile/theme/app_colors.dart';
import 'package:budget_mobile/theme/app_palette.dart';
import 'package:budget_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Upgrade plan 3.1: mobile and web share one set of design tokens. This reads
/// the web's tokens.css and fails when a mobile value drifts from it.
void main() {
  final css = File('../web/src/styles/tokens.css').readAsStringSync();

  Map<String, Color> block(String selector) {
    final start = css.indexOf('$selector {');
    expect(start, isNonNegative, reason: '$selector block in tokens.css');
    final body = css.substring(start, css.indexOf('}', start));
    final out = <String, Color>{};
    for (final m in RegExp(r'--([\w-]+):\s*([^;]+);').allMatches(body)) {
      final v = m.group(2)!.trim();
      final hex = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(v);
      final rgba = RegExp(r'^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$').firstMatch(v);
      if (hex != null) {
        out[m.group(1)!] = Color(0xFF000000 | int.parse(hex.group(1)!, radix: 16));
      } else if (rgba != null) {
        final a = (double.parse(rgba.group(4)!) * 255).round();
        out[m.group(1)!] = Color.fromARGB(
            a, int.parse(rgba.group(1)!), int.parse(rgba.group(2)!), int.parse(rgba.group(3)!));
      }
    }
    return out;
  }

  Map<String, Color> fields(AppPalette p) => {
        'bg': p.bg,
        'surface': p.surface,
        'surface-subtle': p.surfaceSubtle,
        'surface-hover': p.surfaceHover,
        'border': p.border,
        'border-subtle': p.borderSubtle,
        'border-strong': p.borderStrong,
        'text': p.text,
        'text-secondary': p.textSecondary,
        'text-muted': p.textMuted,
        'brand': p.accent,
        'success': p.good,
        'success-subtle': p.goodSubtle,
        'good-ink': p.goodInk,
        'danger': p.bad,
        'danger-subtle': p.badSubtle,
        'bad-ink': p.badInk,
        'warning': p.warn,
        'warning-subtle': p.warnSubtle,
        'warn-ink': p.warnInk,
        'indigo': p.indigo,
        'goal': p.goal,
      };

  for (final (name, selector, palette) in [
    ('light', ':root', AppPalette.light),
    ('dark', '[data-theme="dark"]', AppPalette.dark),
  ]) {
    test('$name palette matches tokens.css', () {
      final web = block(selector);
      fields(palette).forEach((token, mobile) {
        expect(web.containsKey(token), isTrue, reason: '--$token missing from tokens.css $selector');
        expect(mobile.toARGB32(), web[token]!.toARGB32(),
            reason: '--$token: web ${web[token]}, mobile $mobile');
      });
    });
  }

  test('the isDark constants equal the palette', () {
    expect(
      [AppColors.lightBg, AppColors.lightSurface, AppColors.lightSurfaceSubtle, AppColors.lightBorder, AppColors.lightText, AppColors.lightTextMuted],
      [AppPalette.light.bg, AppPalette.light.surface, AppPalette.light.surfaceSubtle, AppPalette.light.border, AppPalette.light.text, AppPalette.light.textMuted],
    );
    expect(
      [AppColors.darkBg, AppColors.darkSurface, AppColors.darkSurfaceSubtle, AppColors.darkBorder, AppColors.darkText, AppColors.darkTextMuted],
      [AppPalette.dark.bg, AppPalette.dark.surface, AppPalette.dark.surfaceSubtle, AppPalette.dark.border, AppPalette.dark.text, AppPalette.dark.textMuted],
    );
  });

  test('themes carry the palette for their brightness; a device accent changes only the accent', () {
    expect(AppTheme.lightTheme.extension<AppPalette>()!.bad, AppPalette.light.bad);
    expect(AppTheme.darkTheme.extension<AppPalette>()!.bad, AppPalette.dark.bad);
    expect(AppTheme.darkTheme.colorScheme.error, AppPalette.dark.bad);

    final tinted = AppTheme.build(Brightness.light, accent: const Color(0xFF1E88E5));
    expect(tinted.colorScheme.primary, const Color(0xFF1E88E5));
    final p = tinted.extension<AppPalette>()!;
    expect((p.good, p.bad, p.warn, p.bg), (AppPalette.light.good, AppPalette.light.bad, AppPalette.light.warn, AppPalette.light.bg));
  });

  testWidgets('context.palette follows the theme', (tester) async {
    late AppPalette seen;
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      home: Builder(builder: (context) {
        seen = context.palette;
        return const SizedBox();
      }),
    ));
    expect(seen.good, AppPalette.dark.good);
  });
}
