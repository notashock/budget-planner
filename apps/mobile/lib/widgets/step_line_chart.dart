import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../engine/currency.dart';
import '../engine/simulator.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

class StepLineChartWidget extends StatefulWidget {
  final SimulationResult simulation;
  final int safetyFloor;
  final int daysInMonth;
  final int? currentDay;
  final int? salaryCreditDay;
  final int? selectedDay;
  final ValueChanged<int?>? onSelectDay;
  final VoidCallback? onOpenReview;
  final String currencySymbol;

  const StepLineChartWidget({
    super.key,
    required this.simulation,
    required this.safetyFloor,
    required this.daysInMonth,
    this.currentDay,
    this.salaryCreditDay,
    this.selectedDay,
    this.onSelectDay,
    this.onOpenReview,
    this.currencySymbol = '₹',
  });

  @override
  State<StepLineChartWidget> createState() => _StepLineChartWidgetState();
}

class _StepLineChartWidgetState extends State<StepLineChartWidget> {
  int? _hoveredDay;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    final days = widget.simulation.days;
    final activeScrubDay = _hoveredDay ?? widget.selectedDay;

    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header: Title + Legend + Month Review Button
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text(
                      'CASHFLOW TRAJECTORY',
                      style: AppTypography.inter(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                        color: textSecondary,
                      ),
                    ),
                  ],
                ),
                if (widget.onOpenReview != null)
                  InkWell(
                    onTap: widget.onOpenReview,
                    borderRadius: BorderRadius.circular(6),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: border, width: 1),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.insights_outlined, size: 12, color: textSecondary),
                          const SizedBox(width: 4),
                          Text(
                            'Month Review',
                            style: AppTypography.inter(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Legend Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                _buildLegendItem(
                  color: isDark ? AppColors.darkText : AppColors.lightText,
                  label: 'Daily Balance',
                  isDashed: false,
                  textStyle: AppTypography.inter(fontSize: 10, color: textMuted),
                ),
                const SizedBox(width: 14),
                _buildLegendItem(
                  color: AppColors.red,
                  label: 'Safety Floor',
                  isDashed: true,
                  textStyle: AppTypography.inter(fontSize: 10, color: textMuted),
                ),
                if (widget.currentDay != null) ...[
                  const SizedBox(width: 14),
                  _buildLegendItem(
                    color: AppColors.amber,
                    label: 'Today',
                    isDashed: false,
                    isDot: true,
                    textStyle: AppTypography.inter(fontSize: 10, color: textMuted),
                  ),
                ],
                if (widget.salaryCreditDay != null) ...[
                  const SizedBox(width: 14),
                  _buildLegendItem(
                    color: AppColors.green,
                    label: 'Salary Credit',
                    isDashed: true,
                    textStyle: AppTypography.inter(fontSize: 10, color: textMuted),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Chart Canvas with Scrub Tooltip
          SizedBox(
            height: 190,
            child: LayoutBuilder(
              builder: (context, constraints) {
                if (days.isEmpty) {
                  return Center(
                    child: Text('No trajectory points', style: AppTypography.inter(color: textMuted)),
                  );
                }

                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onPanDown: (details) => _handleScrub(details.localPosition, constraints.maxWidth),
                  onPanUpdate: (details) => _handleScrub(details.localPosition, constraints.maxWidth),
                  onPanEnd: (_) => setState(() => _hoveredDay = null),
                  onPanCancel: () => setState(() => _hoveredDay = null),
                  onTapUp: (details) => _handleScrub(details.localPosition, constraints.maxWidth),
                  child: Stack(
                    children: [
                      CustomPaint(
                        size: Size(constraints.maxWidth, constraints.maxHeight),
                        painter: _FritschCarlsonChartPainter(
                          days: days,
                          safetyFloor: widget.safetyFloor,
                          daysInMonth: widget.daysInMonth,
                          currentDay: widget.currentDay,
                          salaryCreditDay: widget.salaryCreditDay,
                          activeScrubDay: activeScrubDay,
                          isDark: isDark,
                          currencySymbol: widget.currencySymbol,
                        ),
                      ),
                      // Tooltip Card Overlay
                      if (activeScrubDay != null)
                        _buildScrubTooltip(
                          activeScrubDay,
                          days,
                          constraints.maxWidth,
                          isDark,
                          border,
                          text,
                          textMuted,
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 6),
        ],
      ),
    );
  }

  void _handleScrub(Offset localPos, double width) {
    const double paddingLeft = 48.0;
    const double paddingRight = 14.0;
    final chartWidth = width - paddingLeft - paddingRight;
    if (chartWidth <= 0 || widget.simulation.days.isEmpty) return;

    final days = widget.simulation.days;
    final minDay = days.first.day;
    final maxDay = days.last.day;
    final daySpan = math.max(maxDay - minDay, 1);

    final clampedX = (localPos.dx - paddingLeft).clamp(0.0, chartWidth);
    final ratio = clampedX / chartWidth;
    final targetDay = (ratio * daySpan).round() + minDay;

    setState(() => _hoveredDay = targetDay);
    widget.onSelectDay?.call(targetDay);
  }

  Widget _buildLegendItem({
    required Color color,
    required String label,
    required bool isDashed,
    bool isDot = false,
    required TextStyle textStyle,
  }) {
    return Row(
      children: [
        if (isDot)
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          )
        else
          Container(
            width: 14,
            height: 2,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(1),
            ),
          ),
        const SizedBox(width: 5),
        Text(label, style: textStyle),
      ],
    );
  }

  Widget _buildScrubTooltip(
    int day,
    List<TimelineDay> days,
    double totalWidth,
    bool isDark,
    Color border,
    Color text,
    Color textMuted,
  ) {
    final tDay = days.firstWhere(
      (d) => d.day == day,
      orElse: () => days.last,
    );

    final minDay = days.isNotEmpty ? days.first.day : 1;
    final maxDay = days.isNotEmpty ? days.last.day : widget.daysInMonth;
    final daySpan = math.max(maxDay - minDay, 1);

    const double paddingLeft = 48.0;
    const double paddingRight = 14.0;
    final chartWidth = totalWidth - paddingLeft - paddingRight;
    final xPos = paddingLeft + ((day - minDay) / daySpan) * chartWidth;
    final isRightSide = xPos > (totalWidth * 0.55);

    final isBreached = tDay.closingBalance < widget.safetyFloor;

    return Positioned(
      top: 6,
      left: isRightSide ? (xPos - 130).clamp(10.0, totalWidth - 140) : (xPos + 10).clamp(10.0, totalWidth - 140),
      child: IgnorePointer(
        child: Container(
          width: 125,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF18181B) : Colors.white,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
              color: isBreached ? AppColors.red : border,
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha(isDark ? 80 : 30),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Day $day',
                    style: AppTypography.inter(fontSize: 10, fontWeight: FontWeight.w700, color: text),
                  ),
                  Text(
                    formatDisplayDate(tDay.date, includeWeekday: false),
                    style: AppTypography.inter(fontSize: 9.5, color: textMuted),
                  ),
                ],
              ),
              const SizedBox(height: 3),
              Text(
                formatCurrency(tDay.closingBalance, symbol: widget.currencySymbol),
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: isBreached ? AppColors.red : text,
                ),
              ),
              if (tDay.events.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    '${tDay.events.length} transaction${tDay.events.length > 1 ? 's' : ''}',
                    style: AppTypography.inter(fontSize: 9, color: textMuted),
                  ),
                ),
              if (widget.salaryCreditDay != null && day == widget.salaryCreditDay)
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1.5),
                  decoration: BoxDecoration(
                    color: AppColors.green.withAlpha(25),
                    borderRadius: BorderRadius.circular(3),
                    border: Border.all(color: AppColors.green.withAlpha(120), width: 0.8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 4,
                        height: 4,
                        decoration: const BoxDecoration(
                          color: AppColors.green,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 3),
                      Text(
                        'Salary Credit Day',
                        style: AppTypography.inter(
                          fontSize: 8.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.green,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FritschCarlsonChartPainter extends CustomPainter {
  final List<TimelineDay> days;
  final int safetyFloor;
  final int daysInMonth;
  final int? currentDay;
  final int? salaryCreditDay;
  final int? activeScrubDay;
  final bool isDark;
  final String currencySymbol;

  _FritschCarlsonChartPainter({
    required this.days,
    required this.safetyFloor,
    required this.daysInMonth,
    this.currentDay,
    this.salaryCreditDay,
    this.activeScrubDay,
    required this.isDark,
    required this.currencySymbol,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (days.isEmpty) return;

    const double paddingLeft = 48.0;
    const double paddingRight = 14.0;
    const double paddingTop = 12.0;
    const double paddingBottom = 22.0;

    final double width = size.width - paddingLeft - paddingRight;
    final double height = size.height - paddingTop - paddingBottom;
    if (width <= 0 || height <= 0) return;

    // Calculate Y range - starts from 0 (or lower if debt / negative balance), never above 0.
    int actualMin = safetyFloor;
    int actualMax = safetyFloor;

    for (final d in days) {
      if (d.closingBalance < actualMin) actualMin = d.closingBalance;
      if (d.closingBalance > actualMax) actualMax = d.closingBalance;
    }

    final int minVal = actualMin < 0 ? actualMin : 0;
    final int maxVal = math.max(actualMax, 1000);
    final int range = math.max(maxVal - minVal, 1000);

    final int yMin = minVal < 0 ? minVal - (range * 0.03).round() : 0;
    final int yMax = maxVal + (range * 0.05).round();
    final int yRange = math.max(yMax - yMin, 1);

    double mapY(int val) {
      final double normalized = (val - yMin) / yRange;
      return paddingTop + height - (normalized * height);
    }

    final int minDay = days.first.day;
    final int maxDay = days.last.day;
    final int daySpan = math.max(maxDay - minDay, 1);

    double mapX(int day) {
      final double normalized = (day - minDay) / daySpan;
      return paddingLeft + (normalized * width);
    }

    // Colors
    final gridLineColor = isDark ? const Color(0x1AFFFFFF) : const Color(0x14000000);
    final labelTextColor = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final lineColor = isDark ? AppColors.darkText : AppColors.lightText;

    // 1. Draw Grid lines & Y Axis ticks (including baseline 0)
    final gridPaint = Paint()
      ..color = gridLineColor
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    final ticks = [yMin, yMin + (yRange * 0.5).round(), yMax];
    for (final tickVal in ticks) {
      final y = mapY(tickVal);
      canvas.drawLine(Offset(paddingLeft, y), Offset(size.width - paddingRight, y), gridPaint);

      final tickText = formatCompactCurrency(tickVal, symbol: currencySymbol);
      final textPainter = TextPainter(
        text: TextSpan(
          text: tickText,
          style: AppTypography.mono(fontSize: 9, color: labelTextColor, fontWeight: tickVal == yMin ? FontWeight.w700 : FontWeight.w400),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      textPainter.paint(canvas, Offset(paddingLeft - textPainter.width - 5, y - textPainter.height / 2));
    }

    // 2. Safety Floor line (Dashed)
    final floorY = mapY(safetyFloor);
    _drawDashedLine(
      canvas,
      Offset(paddingLeft, floorY),
      Offset(size.width - paddingRight, floorY),
      AppColors.red.withAlpha(160),
      dashWidth: 4,
      dashSpace: 3,
    );

    // 3. Current Day marker (Today)
    if (currentDay != null && currentDay! >= minDay && currentDay! <= maxDay) {
      final todayX = mapX(currentDay!);
      canvas.drawLine(
        Offset(todayX, paddingTop),
        Offset(todayX, size.height - paddingBottom),
        Paint()
          ..color = AppColors.amber.withAlpha(80)
          ..strokeWidth = 1.2,
      );
    }

    // 3b. Salary Credit Day marker (continuous timeline support)
    if (salaryCreditDay != null && salaryCreditDay! >= minDay && salaryCreditDay! <= maxDay) {
      final salX = mapX(salaryCreditDay!);
      _drawDashedLine(
        canvas,
        Offset(salX, paddingTop),
        Offset(salX, size.height - paddingBottom),
        AppColors.green.withAlpha(190),
        dashWidth: 3,
        dashSpace: 3,
      );
      // Pin dot at the top of the salary vertical line
      canvas.drawCircle(Offset(salX, paddingTop + 2), 3.5, Paint()..color = AppColors.green);
      canvas.drawCircle(Offset(salX, paddingTop + 2), 1.5, Paint()..color = Colors.white);
    }

    // 4. Fritsch-Carlson Monotonic Cubic Spline Curve
    final points = <Offset>[];
    for (final d in days) {
      points.add(Offset(mapX(d.day), mapY(d.closingBalance)));
    }

    final splinePath = _buildMonotoneCubicSpline(points);

    // Gradient fill below spline
    final fillPath = Path.from(splinePath)
      ..lineTo(mapX(days.last.day), size.height - paddingBottom)
      ..lineTo(mapX(days.first.day), size.height - paddingBottom)
      ..close();

    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          lineColor.withAlpha(isDark ? 40 : 25),
          lineColor.withAlpha(0),
        ],
      ).createShader(Rect.fromLTWH(paddingLeft, paddingTop, width, height));

    canvas.drawPath(fillPath, fillPaint);

    // Spline stroke
    final strokePaint = Paint()
      ..color = lineColor
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas.drawPath(splinePath, strokePaint);

    // 5. Active Scrubber Vertical Line & Pin
    if (activeScrubDay != null) {
      final scrubX = mapX(activeScrubDay!);
      final scrubDayObj = days.firstWhere((d) => d.day == activeScrubDay, orElse: () => days.last);
      final scrubY = mapY(scrubDayObj.closingBalance);

      // Vertical guide line
      canvas.drawLine(
        Offset(scrubX, paddingTop),
        Offset(scrubX, size.height - paddingBottom),
        Paint()
          ..color = lineColor.withAlpha(100)
          ..strokeWidth = 1.0,
      );

      // Scrubber point on curve
      canvas.drawCircle(
        Offset(scrubX, scrubY),
        4.5,
        Paint()..color = lineColor,
      );
      canvas.drawCircle(
        Offset(scrubX, scrubY),
        2.5,
        Paint()..color = isDark ? AppColors.darkSurface : AppColors.lightSurface,
      );
    }

    // 6. X-axis day indicators (continuous month timeline support)
    final List<int> dayTicks = [];
    if (minDay < 0) {
      dayTicks.add(minDay);
    }
    if (!dayTicks.contains(1)) {
      dayTicks.add(1);
    }
    final midDay = ((maxDay + 1) / 2).round();
    if (!dayTicks.contains(midDay) && midDay < maxDay) {
      dayTicks.add(midDay);
    }
    if (!dayTicks.contains(maxDay)) {
      dayTicks.add(maxDay);
    }

    for (final d in dayTicks) {
      final x = mapX(d);
      final tDay = days.firstWhere((element) => element.day == d, orElse: () => days.first);
      String label = 'Day $d';
      if (d < 0 || d == 1) {
        label = formatDisplayDate(tDay.date, includeWeekday: false);
      }
      final textPainter = TextPainter(
        text: TextSpan(
          text: label,
          style: AppTypography.mono(fontSize: 8.5, color: labelTextColor, fontWeight: FontWeight.w600),
        ),
        textDirection: TextDirection.ltr,
      )..layout();

      double textX = x - textPainter.width / 2;
      if (d == minDay) textX = math.max(paddingLeft, textX);
      if (d == maxDay) textX = math.min(size.width - paddingRight - textPainter.width, textX);

      textPainter.paint(canvas, Offset(textX, size.height - paddingBottom + 5));
    }
  }

  Path _buildMonotoneCubicSpline(List<Offset> pts) {
    final path = Path();
    final n = pts.length;
    if (n == 0) return path;
    if (n == 1) {
      path.moveTo(pts[0].dx, pts[0].dy);
      return path;
    }
    if (n == 2) {
      path.moveTo(pts[0].dx, pts[0].dy);
      path.lineTo(pts[1].dx, pts[1].dy);
      return path;
    }

    // 1. Calculate secant slopes
    final dxs = <double>[];
    final dys = <double>[];
    final slopes = <double>[];
    for (int i = 0; i < n - 1; i++) {
      final dx = pts[i + 1].dx - pts[i].dx;
      final dy = pts[i + 1].dy - pts[i].dy;
      dxs.add(dx);
      dys.add(dy);
      slopes.add(dx == 0 ? 0.0 : dy / dx);
    }

    // 2. Initialize tangents
    final m = List<double>.filled(n, 0.0);
    m[0] = slopes[0];
    for (int i = 1; i < n - 1; i++) {
      if (slopes[i - 1] * slopes[i] <= 0) {
        m[i] = 0.0;
      } else {
        m[i] = (slopes[i - 1] + slopes[i]) / 2.0;
      }
    }
    m[n - 1] = slopes[n - 2];

    // 3. Fritsch-Carlson monotonicity check & scale
    for (int i = 0; i < n - 1; i++) {
      if (dys[i] == 0) {
        m[i] = 0.0;
        m[i + 1] = 0.0;
      } else {
        final alpha = m[i] / slopes[i];
        final beta = m[i + 1] / slopes[i];
        if (alpha < 0) m[i] = 0.0;
        if (beta < 0) m[i + 1] = 0.0;
        final s = alpha * alpha + beta * beta;
        if (s > 9.0) {
          final tau = 3.0 / math.sqrt(s);
          m[i] = tau * alpha * slopes[i];
          m[i + 1] = tau * beta * slopes[i];
        }
      }
    }

    // 4. Build cubic bezier path
    path.moveTo(pts[0].dx, pts[0].dy);
    for (int i = 0; i < n - 1; i++) {
      final p1 = pts[i];
      final p2 = pts[i + 1];
      final dx = dxs[i];

      final cp1x = p1.dx + dx / 3.0;
      final cp1y = p1.dy + (m[i] * dx) / 3.0;
      final cp2x = p2.dx - dx / 3.0;
      final cp2y = p2.dy - (m[i + 1] * dx) / 3.0;

      path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.dx, p2.dy);
    }

    return path;
  }

  void _drawDashedLine(
    Canvas canvas,
    Offset start,
    Offset end,
    Color color, {
    double dashWidth = 4.0,
    double dashSpace = 3.0,
  }) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke;

    double currentX = start.dx;

    while (currentX < end.dx) {
      final nextX = math.min(currentX + dashWidth, end.dx);
      canvas.drawLine(Offset(currentX, start.dy), Offset(nextX, start.dy), paint);
      currentX += dashWidth + dashSpace;
    }
  }

  @override
  bool shouldRepaint(covariant _FritschCarlsonChartPainter oldDelegate) {
    return oldDelegate.days != days ||
        oldDelegate.safetyFloor != safetyFloor ||
        oldDelegate.activeScrubDay != activeScrubDay ||
        oldDelegate.currentDay != currentDay ||
        oldDelegate.isDark != isDark;
  }
}
