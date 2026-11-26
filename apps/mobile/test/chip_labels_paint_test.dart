import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:budget_mobile/modals/unified_entry_modal.dart';
import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'helpers/fixture_budget.dart';
import 'helpers/real_fonts.dart';

/// Found on the phone (end-of-Phase-3 device pass): unselected chips in the
/// entry sheet (quick amounts, categories, Credit / Refund) had blank labels.
/// The chip theme's labelStyle had no colour, which drops Material's default
/// and paints white. Widget finders still "see" the text, so this test reads
/// the painted pixels.
void main() {
  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets('entry sheet chip labels are painted in a readable colour (${mode.name})', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(393, 900);
      addTearDown(tester.view.reset);
      late BudgetProvider budget;
      await tester.runAsync(() async {
        await loadAppFonts();
        budget = await FixtureBudget().load();
      });
      final key = GlobalKey();
      await tester.pumpWidget(ChangeNotifierProvider<BudgetProvider>.value(
        value: budget,
        child: MaterialApp(
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: mode,
          home: Scaffold(body: RepaintBoundary(key: key, child: const UnifiedEntryModal())),
        ),
      ));
      await tester.pumpAndSettle();

      final boundary = key.currentContext!.findRenderObject() as RenderRepaintBoundary;
      final bytes = (await tester.runAsync(() async {
        final img = await boundary.toImage();
        return img.toByteData(format: ui.ImageByteFormat.rawRgba);
      }))!;
      final width = boundary.size.width.toInt();

      // Spread of luminance inside a label's box: text drawn in the box's own
      // background colour (or not at all) has almost none.
      double spread(String label) {
        final r = tester.getRect(find.text(label).first);
        var lo = 999.0, hi = -1.0;
        for (var y = r.top.toInt(); y < r.bottom.toInt(); y++) {
          for (var x = r.left.toInt(); x < r.right.toInt(); x++) {
            final i = (y * width + x) * 4;
            final l = 0.299 * bytes.getUint8(i) + 0.587 * bytes.getUint8(i + 1) + 0.114 * bytes.getUint8(i + 2);
            if (l < lo) lo = l;
            if (l > hi) hi = l;
          }
        }
        return hi - lo;
      }

      // Unselected chips (the bug). The selected one ("Food") is checked by
      // colour below: its pixels measure differently on CI's Linux renderer.
      for (final label in ['100', '500', '1k', 'Expense Debit']) {
        // Blank labels measure ~0; 50 leaves room for softer anti-aliasing on CI's Linux fonts.
        expect(spread(label), greaterThan(50), reason: '"$label" is not visible');
      }
    });
  }

  test('a selected chip label reads on the accent (AA 4.5:1) in both themes', () {
    double contrast(Color a, Color b) {
      final la = a.computeLuminance(), lb = b.computeLuminance();
      return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
    }

    for (final theme in [AppTheme.lightTheme, AppTheme.darkTheme]) {
      final label = theme.chipTheme.labelStyle!.color as WidgetStateColor;
      final onAccent = label.resolve({WidgetState.selected});
      expect(contrast(onAccent, theme.colorScheme.primary), greaterThanOrEqualTo(4.5),
          reason: '${theme.brightness.name}: $onAccent on ${theme.colorScheme.primary}');
    }
  });
}

