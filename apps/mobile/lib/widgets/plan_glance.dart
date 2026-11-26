// The top of the Plan page, drawn like web's MonthHealthHero, CashAllocationBar
// and UpcomingOutflows (sizes measured from the web page at 393 px wide).
import 'package:flutter/material.dart';

import '../engine/engine.dart';
import '../engine/plan_insights.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import 'web_icons.dart';

const _tabular = [FontFeature.tabularFigures()];

TextStyle _inter(double size, FontWeight weight, Color color, {double? letterSpacing}) =>
    AppTypography.inter(fontSize: size, fontWeight: weight, color: color, letterSpacing: letterSpacing)
        .copyWith(fontFeatures: _tabular);

/// web's `.summary-card`: surface, 1 px border, 14 radius.
class PlanCard extends StatelessWidget {
  const PlanCard({super.key, required this.child, this.padding = const EdgeInsets.fromLTRB(16, 14, 16, 14)});
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: p.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: p.border),
      ),
      child: child,
    );
  }
}

Color verdictColor(AppPalette p, MonthVerdict v) => switch (v.key) {
      'critical' => p.bad,
      'tight' => p.warn,
      _ => p.good,
    };

class MonthHealthHero extends StatelessWidget {
  const MonthHealthHero({
    super.key,
    required this.rate,
    required this.daysLeft,
    required this.verdict,
    required this.balances,
    required this.currentDay,
    required this.currencySymbol,
    required this.detailsOpen,
    required this.onToggleDetails,
  });

  final int rate;
  final int daysLeft;
  final MonthVerdict verdict;
  final List<int> balances;
  final int? currentDay;
  final String currencySymbol;
  final bool detailsOpen;
  final VoidCallback onToggleDetails;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final amount = formatCurrencyWhole((rate < 0 ? 0 : rate) ~/ 100 * 100, symbol: currencySymbol);
    final days = '$daysLeft ${daysLeft == 1 ? 'day' : 'days'} left';
    return Semantics(
      button: true,
      expanded: detailsOpen,
      label: '$amount safe to spend today, ${verdict.label}, $days. ${detailsOpen ? 'Hide' : 'Show'} details',
      excludeSemantics: true,
      onTap: onToggleDetails,
      child: Material(
        color: p.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: p.border)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: const Key('plan-hero'),
          onTap: onToggleDetails,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
            child: Column(
              children: [
                Text(amount,
                    style: _inter(32, FontWeight.w700, p.text, letterSpacing: -0.96).copyWith(height: 1.05)),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      key: Key('verdict-${verdict.key}'),
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(color: verdictColor(p, verdict), shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text('safe to spend today · $days',
                          style: AppTypography.inter(fontSize: 13, color: p.textSecondary)),
                    ),
                  ],
                ),
                if (balances.length >= 2) ...[
                  const SizedBox(height: 4 + 8),
                  SizedBox(
                    height: 48,
                    width: double.infinity,
                    child: CustomPaint(painter: _Sparkline(balances, currentDay, p.borderStrong, p.text)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Sparkline extends CustomPainter {
  _Sparkline(this.values, this.currentDay, this.planColor, this.pastColor);
  final List<int> values;
  final int? currentDay;
  final Color planColor, pastColor;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 3.0;
    final lo = values.reduce((a, b) => a < b ? a : b), hi = values.reduce((a, b) => a > b ? a : b);
    final span = (hi - lo) == 0 ? 1 : hi - lo;
    Offset pt(int i) => Offset(pad + i / (values.length - 1) * (size.width - 2 * pad),
        pad + (1 - (values[i] - lo) / span) * (size.height - 2 * pad));
    final today = currentDay == null ? values.length - 1 : currentDay!.clamp(1, values.length) - 1;
    Path line(int last) {
      final path = Path()..moveTo(pt(0).dx, pt(0).dy);
      for (var i = 1; i <= last; i++) {
        path.lineTo(pt(i).dx, pt(i).dy);
      }
      return path;
    }

    Paint stroke(Color c) => Paint()
      ..color = c
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(line(values.length - 1), stroke(planColor));
    canvas.drawPath(line(today), stroke(pastColor));
    canvas.drawCircle(pt(today), 3.5, Paint()..color = pastColor);
  }

  @override
  bool shouldRepaint(_Sparkline old) =>
      old.values != values || old.currentDay != currentDay || old.planColor != planColor || old.pastColor != pastColor;
}

const _segmentLabels = {
  'committed': 'Upcoming bills',
  'held': 'Held for others',
  'cards': 'Owed on cards',
  'floor': 'Keep at least',
  'goals': 'Goal savings',
  'free': 'Free to spend',
  'shortfall': 'Shortfall',
};

class CashAllocationBar extends StatelessWidget {
  const CashAllocationBar({super.key, required this.todayBalance, required this.allocation, required this.currencySymbol});
  final int todayBalance;
  final CashAllocation allocation;
  final String currencySymbol;

  Color _colour(AppPalette p, String key) => switch (key) {
        'committed' || 'held' => p.indigo,
        'cards' => p.warn,
        'floor' => p.borderStrong,
        'goals' => p.goal,
        'free' => p.good,
        _ => p.bad,
      };

  /// web hatches the floor (muted 45° lines) and cards, and dots held money,
  /// so the bar never relies on colour alone.
  Widget _swatch(AppPalette p, String key, BoxConstraints c) => Container(
        constraints: c,
        color: _colour(p, key),
        child: switch (key) {
          'floor' => CustomPaint(painter: _Pattern(p.textMuted, dots: false)),
          'cards' => CustomPaint(painter: _Pattern(p.surface.withValues(alpha: 0.55), dots: false)),
          'held' => CustomPaint(painter: _Pattern(p.surface.withValues(alpha: 0.6), dots: true)),
          _ => null,
        },
      );

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    if (allocation.total <= 0) return const SizedBox.shrink();
    String money(int v) => formatCurrencyWhole(v, symbol: currencySymbol);
    final summary = allocation.segments
        .map((s) => '${_segmentLabels[s.key]} ${money(s.amount)} (${(s.amount / allocation.total * 100).round()}%)')
        .join(', ');
    return PlanCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Expanded(child: Text("After today's bills", style: _inter(12, FontWeight.w600, p.textSecondary))),
            Text(money(todayBalance < 0 ? 0 : todayBalance), style: _inter(13, FontWeight.w600, p.text)),
          ]),
          const SizedBox(height: 8),
          Semantics(
            image: true,
            label: "Today's balance split: $summary",
            child: SizedBox(
              height: 8,
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final (i, s) in allocation.segments.indexed) ...[
                  if (i > 0) const SizedBox(width: 2),
                  Expanded(
                    flex: s.amount,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: _swatch(p, s.key, const BoxConstraints(minWidth: 3)),
                    ),
                  ),
                ],
              ]),
            ),
          ),
          const SizedBox(height: 8),
          for (final (i, s) in allocation.segments.indexed)
            Padding(
              padding: EdgeInsets.only(top: i == 0 ? 0 : 4),
              child: ExcludeSemantics(
                child: Row(children: [
                  ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: _swatch(p, s.key, const BoxConstraints.tightFor(width: 10, height: 10))),
                  const SizedBox(width: 6),
                  Expanded(child: Text(_segmentLabels[s.key]!, style: _inter(12, FontWeight.w400, p.textSecondary))),
                  Text(money(s.amount), style: _inter(12, FontWeight.w600, p.text)),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}

/// web's UpcomingOutflows with title "Due soon" and three rows.
class DueSoonCard extends StatelessWidget {
  const DueSoonCard({super.key, required this.events, required this.today, required this.currencySymbol, this.onPay, this.maxRows = 3});
  final List<TimelineEvent> events;
  final String today;
  final String currencySymbol;
  final void Function(TimelineEvent)? onPay;
  final int maxRows;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final r = getUpcomingOutflows(events, today);
    String money(int v) => formatCurrencyWhole(v, symbol: currencySymbol);
    final n = r.items.length;
    var sub = n == 0 ? 'No planned payments due.' : '$n payment${n == 1 ? '' : 's'}${r.overdueCount > 0 ? ' · ${r.overdueCount} overdue' : ''}';
    if (r.daysToSalary != null) {
      sub += r.daysToSalary == 0 ? ' · salary due today' : ' · ${r.daysToSalary} day${r.daysToSalary == 1 ? '' : 's'} to salary';
    }
    final shown = r.items.take(maxRows).toList();
    return PlanCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Expanded(child: Semantics(header: true, child: Text('Due soon', style: _inter(13, FontWeight.w600, p.text)))),
            Text(money(r.total), style: _inter(15, FontWeight.w700, p.text)),
          ]),
          const SizedBox(height: 2),
          Text(sub, style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
          const SizedBox(height: 10),
          if (n == 0)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: p.goodSubtle, borderRadius: BorderRadius.circular(10)),
              child: Row(children: [
                WebIcon(WebIcons.checkCircle, color: p.good),
                const SizedBox(width: 8),
                Expanded(child: Text('Nothing to pay this week.', style: _inter(13, FontWeight.w500, p.good))),
              ]),
            )
          else
            Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(border: Border.all(color: p.border), borderRadius: BorderRadius.circular(10)),
              child: Column(children: [
                for (final (i, item) in shown.indexed) _row(context, p, item, i > 0, money),
              ]),
            ),
          if (n > shown.length) ...[
            const SizedBox(height: 8),
            Text('+${n - shown.length} more in details.', style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
          ],
        ],
      ),
    );
  }

  Widget _row(BuildContext context, AppPalette p, UpcomingItem item, bool divider, String Function(int) money) {
    final e = item.event;
    final when = item.isOverdue
        ? 'Overdue · ${formatDisplayDate(item.dueDate)}'
        : item.isDueToday
            ? 'Due today'
            : formatDisplayDate(e.date);
    final bg = item.isOverdue ? p.badSubtle : (item.isDueToday ? p.warnSubtle : null);
    final name = e.name.isEmpty ? 'Planned payment' : e.name;
    final canPay = onPay != null && (e.transactionId ?? (e.id.isEmpty ? null : e.id)) != null;
    return Container(
      decoration: BoxDecoration(color: bg, border: divider ? Border(top: BorderSide(color: p.border)) : null),
      padding: const EdgeInsets.fromLTRB(12, 9, 10, 9),
      child: Row(children: [
        WebIcon(item.isOverdue ? WebIcons.alertTriangle : WebIcons.calendar,
            size: 13, color: item.isOverdue ? p.bad : p.textMuted),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: _inter(13, FontWeight.w600, p.text)),
            Text(when, style: AppTypography.inter(fontSize: 12, color: item.isOverdue ? p.badInk : p.textMuted)),
          ]),
        ),
        const SizedBox(width: 10),
        Text(money(item.outflow), style: _inter(13, FontWeight.w700, p.text)),
        if (canPay) ...[
          const SizedBox(width: 4),
          IconButton(
            tooltip: 'Mark $name as paid',
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            onPressed: () => onPay!(e),
            icon: WebIcon(WebIcons.checkCircle, size: 14, color: p.textSecondary),
          ),
        ],
      ]),
    );
  }
}

class _Pattern extends CustomPainter {
  _Pattern(this.color, {required this.dots});
  final Color color;
  final bool dots;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.5;
    if (dots) {
      for (var x = 2.0; x < size.width; x += 4) {
        for (var y = 2.0; y < size.height; y += 4) {
          canvas.drawCircle(Offset(x, y), 0.9, paint);
        }
      }
      return;
    }
    for (var x = -size.height; x < size.width; x += 4) {
      canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), paint);
    }
  }

  @override
  bool shouldRepaint(_Pattern old) => old.color != color || old.dots != dots;
}
