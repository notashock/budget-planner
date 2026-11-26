// The irregular-income Plan view, as web's PlanScreen irregular branch:
// RunwayGauge, IrregularHeroCards and "Cashflow & Earnings Analysis".
import 'package:flutter/material.dart';

import '../engine/engine.dart';
import '../engine/income_engine.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import 'plan_glance.dart' show PlanCard;
import 'web_icons.dart';

TextStyle _inter(double size, FontWeight weight, Color color, {double? letterSpacing}) =>
    AppTypography.inter(fontSize: size, fontWeight: weight, color: color, letterSpacing: letterSpacing);

String _months(int n) => '$n month${n == 1 ? '' : 's'}';

/// Emergency runway on a months scale with the 3- and 6-month benchmarks as bands.
class RunwayGauge extends StatelessWidget {
  const RunwayGauge({super.key, required this.metrics, required this.currencySymbol});
  final IrregularMetrics metrics;
  final String currencySymbol;

  static const _notes = {
    'healthy': 'A full emergency fund: six months or more of average spending.',
    'building': 'Building toward a full emergency fund of six months.',
    'low': 'Under three months of cover. Building this up is the first priority.',
  };

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final band = getRunwayBand(metrics.isIndefinite ? double.infinity : metrics.runwayMonths);
    final months = metrics.isIndefinite ? null : (metrics.runwayMonths < 0 ? 0.0 : metrics.runwayMonths);
    final scaleMax = ((months ?? 0) + 1).ceil().clamp(9, 24);
    final marker = months == null ? 1.0 : (months / scaleMax).clamp(0.0, 1.0);
    final (fg, bg, icon) = switch (band.key) {
      'healthy' => (p.good, p.goodSubtle, WebIcons.checkCircle),
      'building' => (p.warnInk, p.warnSubtle, WebIcons.alertTriangle),
      _ => (p.badInk, p.badSubtle, WebIcons.shieldAlert),
    };
    String money(int v) => formatCurrency(v, symbol: currencySymbol);
    final n = metrics.monthsOfHistory;

    return PlanCard(
      key: const ValueKey('runway-card'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Semantics(header: true, child: Text('Emergency runway', style: _inter(13, FontWeight.w600, p.text)))),
          Container(
            height: 22,
            padding: const EdgeInsets.symmetric(horizontal: 9),
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              WebIcon(icon, size: 12, color: fg),
              const SizedBox(width: 5),
              Text(band.label, style: _inter(11, FontWeight.w600, fg)),
            ]),
          ),
        ]),
        const SizedBox(height: 8),
        Wrap(crossAxisAlignment: WrapCrossAlignment.end, spacing: 6, children: [
          Text(months == null ? 'Indefinite' : months.toStringAsFixed(1),
              style: _inter(32, FontWeight.w700, p.text, letterSpacing: -0.96).copyWith(height: 1.05)),
          if (months != null)
            Padding(padding: const EdgeInsets.only(bottom: 3), child: Text('months', style: _inter(14, FontWeight.w400, p.textSecondary))),
        ]),
        const SizedBox(height: 12),
        Semantics(
          label: months == null
              ? 'Runway indefinite: no spending recorded'
              : 'Runway ${months.toStringAsFixed(1)} months; benchmarks at 3 and 6 months',
          child: LayoutBuilder(builder: (context, c) {
            final w = c.maxWidth;
            double x(num m) => w * m / scaleMax;
            Widget bandBox(double left, double width, Color color, Color edge, BorderRadius r) => Positioned(
                  left: left,
                  width: width,
                  top: 5,
                  bottom: 5,
                  child: Container(decoration: BoxDecoration(color: color, borderRadius: r, border: Border.all(color: edge))),
                );
            const pill = Radius.circular(999);
            return Column(children: [
              SizedBox(
                height: 22,
                child: Stack(clipBehavior: Clip.none, children: [
                  bandBox(0, x(3), p.badSubtle, p.bad.withAlpha(60), const BorderRadius.horizontal(left: pill)),
                  bandBox(x(3), x(3), p.warnSubtle, p.warn.withAlpha(60), BorderRadius.zero),
                  bandBox(x(6), w - x(6), p.goodSubtle, p.good.withAlpha(60), const BorderRadius.horizontal(right: pill)),
                  Positioned(
                    left: (w * marker - 2).clamp(0, w - 4).toDouble(),
                    top: 0,
                    bottom: 0,
                    child: Container(width: 4, decoration: BoxDecoration(color: p.text, borderRadius: BorderRadius.circular(2))),
                  ),
                ]),
              ),
              SizedBox(
                height: 16,
                child: Stack(children: [
                  Positioned(left: 0, child: Text('0', style: _inter(10, FontWeight.w400, p.textMuted))),
                  Positioned(left: x(3) - 12, child: Text('3 mo', style: _inter(10, FontWeight.w400, p.textMuted))),
                  Positioned(left: x(6) - 12, child: Text('6 mo', style: _inter(10, FontWeight.w400, p.textMuted))),
                  Positioned(right: 0, child: Text('$scaleMax mo', style: _inter(10, FontWeight.w400, p.textMuted))),
                ]),
              ),
            ]);
          }),
        ),
        const SizedBox(height: 8),
        Text(
          months == null
              ? 'No spending recorded yet, so balances are not being drawn down.'
              : '${money(metrics.currentBalance)} covers ${months.toStringAsFixed(1)} months of average spending '
                  '(${money(metrics.avgMonthlySpending)}/mo). ${_notes[band.key]}',
          style: _inter(12, FontWeight.w400, p.textMuted),
        ),
        const SizedBox(height: 4),
        Text(
          'Based on ${_months(n)} of history${n < 3 ? '. This will steady as more months are recorded.' : '.'}',
          style: _inter(12, FontWeight.w400, p.textMuted),
        ),
      ]),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.label, required this.value, this.unit, required this.sub, this.valueColor, this.negative = false});
  final String label, value, sub;
  final String? unit;
  final Color? valueColor;
  final bool negative;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: p.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: negative ? p.bad.withAlpha(120) : p.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: _inter(11.5, FontWeight.w500, p.textMuted)),
        const SizedBox(height: 6),
        Text.rich(TextSpan(children: [
          TextSpan(text: value, style: _inter(18, FontWeight.w700, valueColor ?? p.text)),
          if (unit != null) TextSpan(text: unit, style: _inter(11, FontWeight.w500, p.textMuted)),
        ])),
        const SizedBox(height: 4),
        Text(sub, style: _inter(11, FontWeight.w400, p.textMuted)),
      ]),
    );
  }
}

/// Smoothed income, average spending, savings rate and liquid balance (2 × 2 on a phone, as web below 1024px).
class IrregularHeroCards extends StatelessWidget {
  const IrregularHeroCards({super.key, required this.metrics, required this.currencySymbol});
  final IrregularMetrics metrics;
  final String currencySymbol;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final m = metrics;
    String whole(int v) => formatCurrencyWhole(v, symbol: currencySymbol);
    String money(int v) => formatCurrency(v, symbol: currencySymbol);
    final period = 'Last ${_months(m.monthsOfHistory)}';
    final net = m.trailing12mIncome - m.trailing12mSpending.abs();
    final rate = m.trailing12mIncome > 0 ? net / m.trailing12mIncome : null;
    Widget row(Widget a, Widget b) => IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(child: a), const SizedBox(width: 10), Expanded(child: b)]),
        );
    return Column(children: [
      row(
        _Kpi(label: 'Smoothed income', value: whole(m.smoothedMonthlyIncome), unit: ' / mo', valueColor: p.good,
            sub: '$period: ${money(m.trailing12mIncome)}'),
        _Kpi(label: 'Avg monthly spending', value: whole(m.avgMonthlySpending), unit: ' / mo',
            sub: '$period: ${money(m.trailing12mSpending)}'),
      ),
      const SizedBox(height: 10),
      row(
        _Kpi(
          label: 'Savings rate',
          value: rate == null ? '—' : '${(rate * 100).round()}%',
          valueColor: net < 0 ? p.badInk : null,
          negative: net < 0,
          sub: rate == null
              ? 'No income in the last ${_months(m.monthsOfHistory)}'
              : '${net >= 0 ? '+' : ''}${money(net)} kept over ${_months(m.monthsOfHistory)}',
        ),
        _Kpi(label: 'Total liquid balance', value: whole(m.currentBalance), sub: 'Across all accounts'),
      ),
    ]);
  }
}

/// "Cashflow & Earnings Analysis" with Trailing 12M / Quarterly / Yearly.
class CashflowAnalysisCard extends StatefulWidget {
  const CashflowAnalysisCard({super.key, required this.metrics, required this.currencySymbol});
  final IrregularMetrics metrics;
  final String currencySymbol;

  @override
  State<CashflowAnalysisCard> createState() => _CashflowAnalysisCardState();
}

class _CashflowAnalysisCardState extends State<CashflowAnalysisCard> {
  String _timeframe = 'trailing12m';

  String _money(int v) => formatCurrency(v, symbol: widget.currencySymbol);
  String _signed(int v) => '${v >= 0 ? '+' : ''}${_money(v)}';

  Widget _pill(String id, String label) {
    final p = context.palette;
    final active = _timeframe == id;
    return Semantics(
      button: true,
      selected: active,
      child: InkWell(
        key: ValueKey('timeframe-$id'),
        borderRadius: BorderRadius.circular(999),
        onTap: () => setState(() => _timeframe = id),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: active ? p.text : p.surfaceSubtle,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: active ? p.text : p.border),
          ),
          child: Text(label, style: _inter(12, FontWeight.w600, active ? p.surface : p.textSecondary)),
        ),
      ),
    );
  }

  Widget _table(List<String> headers, List<List<(String, Color?)>> rows) {
    final p = context.palette;
    Widget cell(String t, {Color? color, bool head = false}) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
          child: Text(t, style: _inter(head ? 11 : 12, head ? FontWeight.w600 : FontWeight.w500, color ?? (head ? p.textMuted : p.text))),
        );
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Table(
        defaultColumnWidth: const IntrinsicColumnWidth(),
        border: TableBorder(horizontalInside: BorderSide(color: p.borderSubtle)),
        children: [
          TableRow(children: [for (final h in headers) cell(h, head: true)]),
          for (final r in rows) TableRow(children: [for (final (t, c) in r) cell(t, color: c)]),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final m = widget.metrics;
    Widget body;
    if (_timeframe == 'quarterly') {
      body = m.quarterly.isEmpty
          ? _empty('No quarterly transaction history found yet.', 'Transactions you log will be automatically aggregated by quarter and year.')
          : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              _QuarterlyBars(quarters: m.quarterly, money: _signed),
              const SizedBox(height: 10),
              _table(['Period', 'Income', 'Spending', 'Net savings'], [
                for (final q in m.quarterly)
                  [(q.key, null), ('+${_money(q.income)}', p.good), ('-${_money(q.spending)}', null), (_signed(q.net), q.net >= 0 ? p.good : p.badInk)],
              ]),
            ]);
    } else if (_timeframe == 'ytd') {
      body = m.yearly.isEmpty
          ? _empty('No yearly transaction records found.', null)
          : _table(['Year', 'Total Inflow', 'Total Outflow', 'Net Cashflow'], [
              for (final y in m.yearly)
                [('${y.year}', null), ('+${_money(y.income)}', p.good), ('-${_money(y.spending)}', null), (_signed(y.net), y.net >= 0 ? p.good : p.badInk)],
            ]);
    } else {
      Widget box(String label, String value, Color color, String note) => Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: p.surfaceSubtle, borderRadius: BorderRadius.circular(8), border: Border.all(color: p.border)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: _inter(11, FontWeight.w500, p.textMuted)),
              const SizedBox(height: 4),
              Text(value, style: _inter(16, FontWeight.w700, color)),
              const SizedBox(height: 4),
              Text(note, style: _inter(11, FontWeight.w400, p.textMuted)),
            ]),
          );
      body = IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(child: box('Trailing 12-Month Inflow', '+${_money(m.trailing12mIncome)}', p.good,
              'Smoothed Monthly: ${_money(m.smoothedMonthlyIncome)} / mo')),
          const SizedBox(width: 12),
          Expanded(child: box('Trailing 12-Month Outflow', '-${_money(m.trailing12mSpending)}', p.badInk,
              'Average Burn: ${_money(m.avgMonthlySpending)} / mo')),
        ]),
      );
    }
    return PlanCard(
      key: const ValueKey('cashflow-analysis'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Semantics(header: true, child: Text('Cashflow & Earnings Analysis', style: _inter(14, FontWeight.w600, p.text))),
        const SizedBox(height: 4),
        Text('Income and spending averaged over the months you have recorded.', style: _inter(12, FontWeight.w400, p.textSecondary)),
        const SizedBox(height: 10),
        Wrap(spacing: 6, runSpacing: 6, children: [
          _pill('trailing12m', 'Trailing 12M'),
          _pill('quarterly', 'Quarterly'),
          _pill('ytd', 'Yearly'),
        ]),
        const SizedBox(height: 12),
        body,
      ]),
    );
  }

  Widget _empty(String text, String? sub) {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 28),
      decoration: BoxDecoration(color: p.surfaceSubtle, borderRadius: BorderRadius.circular(12), border: Border.all(color: p.border)),
      child: Column(children: [
        Text(text, textAlign: TextAlign.center, style: _inter(13, FontWeight.w400, p.textSecondary)),
        if (sub != null) ...[
          const SizedBox(height: 4),
          Text(sub, textAlign: TextAlign.center, style: _inter(11, FontWeight.w400, p.textMuted)),
        ],
      ]),
    );
  }
}

/// Paired income / spending bars per quarter on one scale, net in text.
class _QuarterlyBars extends StatelessWidget {
  const _QuarterlyBars({required this.quarters, required this.money});
  final List<PeriodTotals> quarters;
  final String Function(int) money;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    var max = 1;
    for (final q in quarters) {
      if (q.income > max) max = q.income;
      if (q.spending > max) max = q.spending;
    }
    Widget swatch(Color c, String t) => Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 6),
          Text(t, style: _inter(11, FontWeight.w500, p.textSecondary)),
        ]);
    Widget bar(int v, Color c) => LayoutBuilder(
          builder: (context, cons) => Align(
            alignment: Alignment.centerLeft,
            child: Container(width: cons.maxWidth * v / max, height: 6, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
          ),
        );
    return ExcludeSemantics(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Wrap(spacing: 14, children: [swatch(p.good, 'Income'), swatch(p.indigo, 'Spending')]),
        const SizedBox(height: 8),
        for (final q in quarters)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(children: [
              SizedBox(width: 64, child: Text(q.key, style: _inter(11, FontWeight.w500, p.textSecondary))),
              Expanded(child: Column(children: [bar(q.income, p.good), const SizedBox(height: 3), bar(q.spending, p.indigo)])),
              const SizedBox(width: 8),
              Text(money(q.net), style: _inter(11, FontWeight.w600, q.net >= 0 ? p.good : p.badInk)),
            ]),
          ),
      ]),
    );
  }
}
