import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Exact typography tokens matching apps/web/src/index.css:
/// - Inter for UI headings, titles, labels, badges, body text
/// - JetBrains Mono for tabular numbers, currency amounts, dates, and metric values
class AppTypography {
  // Sans-serif / Inter styles
  static TextStyle inter({
    double fontSize = 13.0,
    FontWeight fontWeight = FontWeight.normal,
    Color? color,
    double? letterSpacing,
    double? height,
  }) {
    return GoogleFonts.inter(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
    );
  }

  // Monospace / JetBrains Mono styles (tabular numerals)
  static TextStyle mono({
    double fontSize = 13.0,
    FontWeight fontWeight = FontWeight.normal,
    Color? color,
    double? letterSpacing,
    double? height,
  }) {
    return GoogleFonts.jetBrainsMono(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
    );
  }

  // Common Typography Hierarchy
  static TextStyle hero({Color? color}) => GoogleFonts.jetBrainsMono(
        fontSize: 26.0,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.6,
        color: color,
      );

  static TextStyle sectionHeader({Color? color}) => GoogleFonts.inter(
        fontSize: 11.5,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.8,
        color: color,
      );

  static TextStyle cardTitle({Color? color}) => GoogleFonts.inter(
        fontSize: 14.0,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
        color: color,
      );

  static TextStyle label({Color? color}) => GoogleFonts.inter(
        fontSize: 12.0,
        fontWeight: FontWeight.w500,
        color: color,
      );

  static TextStyle subtext({Color? color}) => GoogleFonts.inter(
        fontSize: 11.0,
        fontWeight: FontWeight.w400,
        color: color,
      );

  static TextStyle pill({Color? color}) => GoogleFonts.inter(
        fontSize: 11.0,
        fontWeight: FontWeight.w600,
        color: color,
      );

  static TextStyle tabularAmount({
    double fontSize = 14.0,
    FontWeight fontWeight = FontWeight.w600,
    Color? color,
  }) =>
      GoogleFonts.jetBrainsMono(
        fontSize: fontSize,
        fontWeight: fontWeight,
        color: color,
      );
}
