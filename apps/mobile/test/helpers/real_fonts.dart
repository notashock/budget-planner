import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Loads the bundled Inter and JetBrains Mono (every weight the app uses), so
/// a layout test measures text like the phone does. Without it, tests use the
/// test font, where every glyph is 1 em wide and rows overflow that fit on a
/// real phone. Call it before pumping, inside `tester.runAsync`.
Future<void> loadAppFonts() async {
  for (final w in [FontWeight.w400, FontWeight.w500, FontWeight.w600, FontWeight.w700, FontWeight.w800]) {
    GoogleFonts.inter(fontWeight: w);
    GoogleFonts.jetBrainsMono(fontWeight: w);
  }
  await GoogleFonts.pendingFonts();
}
