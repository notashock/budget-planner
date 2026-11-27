import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/month_detail.dart';
import '../engine/currency.dart';
import '../models/simulation.dart';
import '../providers/budget_provider.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../widgets/tab_states.dart';
import '../widgets/web_icons.dart';

/// Web's MonthEndReviewModal: safety cushion hero, unplanned vs committed,
/// fixed & recurring commitments, spending by category, next month's cushion
/// and the assistant's insight. The figures come from the server's review.
void showMonthReviewModal(
  BuildContext context, {
  required MonthInfo month,
  required SimulationResult simulation,
  required int safetyFloor,
  String currencySymbol = kDefaultCurrencySymbol,
  String? accountId,
  Widget? planDetails,
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.palette.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) => DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (_, scroll) => MonthReviewSheet(
        month: month,
        simulation: simulation,
        currencySymbol: currencySymbol,
        scrollController: scroll,
        accountId: accountId,
        planDetails: planDetails,
      ),
    ),
  );
}

class MonthReviewSheet extends StatefulWidget {
  const MonthReviewSheet({
    super.key,
    required this.month,
    required this.simulation,
    this.currencySymbol = kDefaultCurrencySymbol,
    this.scrollController,
    this.accountId,
    this.planDetails,
  });

  final MonthInfo month;
  final SimulationResult simulation;
  final String currencySymbol;
  final ScrollController? scrollController;

  /// The account the Plan tab is filtered to: the review then covers only it, like [simulation].
  final String? accountId;

  /// The Plan tab's month figures, chart and pace meter, shown above the review.
  final Widget? planDetails;

  @override
  State<MonthReviewSheet> createState() => _MonthReviewSheetState();
}

class _MonthReviewSheetState extends State<MonthReviewSheet> {
  Map<String, dynamic>? _review;
  String? _error;

  @override
  void initState() {
    super.initState();
    final budget = context.read<BudgetProvider>();
    budget.api.getMonthEndReview(widget.month.year, widget.month.month, accountId: widget.accountId).then((r) {
      if (mounted) setState(() => _review = r);
    }).catchError((Object e) {
      if (mounted) setState(() => _error = 'Failed to load review');
    });
  }

  int _int(Object? v) => (num.tryParse('${v ?? 0}') ?? 0).round();
  String _money(int v) => formatCurrency(v, symbol: widget.currencySymbol);

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final budget = context.read<BudgetProvider>();
    final review = _review;

    // Recurring commitments, as web reads them from the month's items
    final recurring = [
      for (final raw in budget.transactions)
        if (raw is Map &&
            raw['recurrence'] != null &&
            raw['status'] != 'cancelled' &&
            (widget.accountId == null || raw['accountId'] == widget.accountId))
          raw,
    ];
    final fixed = recurring.where((i) => i['isFixed'] == true).toList();
    int amountOf(Map i) => _int(i['plannedAmount'] ?? i['amount']).abs();
    final totalRecurring = recurring.fold<int>(0, (s, i) => s + amountOf(i));
    final totalFixed = fixed.fold<int>(0, (s, i) => s + amountOf(i));

    final sv = widget.simulation.safeVelocity;
    final cushion = sv.freeSurplus ?? (review != null ? _int(review['unplannedAllowance']) : 0);
    final perDay = sv.safeDailyAmount;
    final unplanned = review == null ? 0 : _int(review['totalUnplannedActual']);

    TextStyle label() => AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w600, color: p.textSecondary);
    TextStyle note() => AppTypography.inter(fontSize: 11, color: p.textMuted);
    TextStyle money(double size, {Color? color}) => AppTypography.inter(fontSize: size, fontWeight: FontWeight.w700, color: color ?? p.text)
        .copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

    Widget card({required Widget child, Key? key}) => Container(
          key: key,
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: p.surfaceSubtle,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: p.border),
          ),
          child: child,
        );

    Widget tile(String title, String value, String sub, {Color? color}) => Expanded(
          child: card(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: label()),
              const SizedBox(height: 4),
              Text(value, style: money(17, color: color)),
              const SizedBox(height: 2),
              Text(sub, style: note()),
            ]),
          ),
        );

    Widget header(String title, String trailing) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(children: [
            Expanded(child: Text(title, style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w700, color: p.text))),
            Text(trailing, style: note()),
          ]),
        );

    final body = <Widget>[];
    if (_error != null) {
      body.add(Padding(padding: const EdgeInsets.all(16), child: Text(_error!, style: AppTypography.inter(fontSize: 13, color: p.badInk))));
    } else if (review == null) {
      body.add(const SkeletonLines(key: ValueKey('review-loading'), lines: [1, 1, 0.6, 1, 0.8, 0.5], lineHeight: 44));
    } else {
      final tags = (review['tagBreakdown'] is Map ? Map<String, dynamic>.from(review['tagBreakdown'] as Map) : <String, dynamic>{})
          .entries
          .toList()
        ..sort((a, b) => _int((b.value as Map?)?['total']).compareTo(_int((a.value as Map?)?['total'])));
      final tagTotal = tags.fold<int>(0, (s, e) => s + _int((e.value as Map?)?['total']));
      final ai = review['aiExplanation'];

      body.addAll([
        // 1. Hero: safety cushion
        card(
          key: const ValueKey('review-hero'),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text('Safety cushion', style: label())),
              Text(sv.status, style: note()),
            ]),
            const SizedBox(height: 6),
            Text(_money(cushion), style: money(26)),
            const SizedBox(height: 6),
            Wrap(spacing: 12, runSpacing: 4, children: [
              Text('Daily spending limit: ${_money(perDay)}/day', style: note()),
              Text('Actual unplanned: ${_money(unplanned)}', style: note()),
            ]),
          ]),
        ),
        // 2. Bento row
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          tile('Actual Unplanned Spend', _money(unplanned),
              unplanned > cushion ? 'Exceeded survival cushion' : 'Within survival limits',
              color: unplanned > cushion ? p.badInk : null),
          const SizedBox(width: 10),
          tile('Committed Obligations', _money(totalRecurring),
              '${fixed.length} fixed rollovers • ${recurring.length - fixed.length} variable'),
        ]),
        // 3. Fixed & recurring commitments
        card(
          key: const ValueKey('review-commitments'),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            header('Fixed & recurring commitments', 'Total: ${_money(totalRecurring)}'),
            Row(children: [
              for (final (title, value, count, word) in [
                ('Fixed Rollovers', totalFixed, fixed.length, 'fixed'),
                ('Monthly Variable', totalRecurring - totalFixed, recurring.length - fixed.length, 'variable'),
              ]) ...[
                if (word == 'variable') const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: p.surface, borderRadius: BorderRadius.circular(8), border: Border.all(color: p.border)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(title, style: label()),
                      Text(_money(value), style: money(15)),
                      Text('$count $word item${count == 1 ? '' : 's'}', style: note()),
                    ]),
                  ),
                ),
              ],
            ]),
            const SizedBox(height: 10),
            if (recurring.isEmpty)
              Text('No recurring commitments configured for this month.', style: note())
            else
              for (final i in recurring)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    Text('Day ${DateTime.tryParse('${i['plannedDate'] ?? i['date'] ?? ''}')?.day ?? _int(i['dayOfMonth'] ?? 1)}', style: note()),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('${i['title'] ?? i['name'] ?? ''}', overflow: TextOverflow.ellipsis,
                          style: AppTypography.inter(fontSize: 13, color: p.text)),
                    ),
                    if (i['isFixed'] == true) ...[
                      Text('Fixed Rollover', style: note().copyWith(color: p.goodInk)),
                      const SizedBox(width: 8),
                    ],
                    Text(_money(amountOf(i)), style: money(13)),
                  ]),
                ),
          ]),
        ),
        // 4. Spending by category
        card(
          key: const ValueKey('review-categories'),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            header('Spending by category', '${tags.length} categories'),
            if (tags.isEmpty)
              Text('No categorized spending recorded this month.', style: note())
            else
              for (final e in tags)
                Builder(builder: (_) {
                  final total = _int((e.value as Map?)?['total']);
                  final count = _int((e.value as Map?)?['count']);
                  final pct = tagTotal > 0 ? (total * 100 / tagTotal).round() : 0;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Row(children: [
                        Text(e.key, style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: p.text)),
                        const SizedBox(width: 6),
                        Expanded(child: Text('$count ${count == 1 ? 'entry' : 'entries'}', style: note())),
                        Text('$pct%', style: note()),
                        const SizedBox(width: 8),
                        Text(_money(total), style: money(13)),
                      ]),
                      const SizedBox(height: 4),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: pct.clamp(3, 100) / 100,
                          minHeight: 5,
                          backgroundColor: p.borderSubtle,
                          color: p.text,
                        ),
                      ),
                    ]),
                  );
                }),
          ]),
        ),
        // 5. Suggested cushion
        card(
          key: const ValueKey('review-next-cushion'),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text('Suggested safety cushion for next month', style: label())),
              Text('Your pace + 10% buffer', style: note()),
            ]),
            const SizedBox(height: 6),
            Text(_money(_int(review['suggestedNextMonthAllowance'])), style: money(20)),
            const SizedBox(height: 4),
            Text('Based on how fast you actually spent this month, plus a 10% buffer to protect your safety floor and bills.', style: note()),
          ]),
        ),
        // 6. Assistant insight
        if (ai is String && ai.trim().isNotEmpty)
          card(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                WebIcon(WebIcons.sparkles, size: 13, color: p.text),
                const SizedBox(width: 6),
                Text('Assistant Spending Insight', style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w700, color: p.text)),
              ]),
              const SizedBox(height: 6),
              Text(ai, style: AppTypography.inter(fontSize: 13, color: p.textSecondary)),
            ]),
          ),
      ]);
    }

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        Center(
          child: Container(width: 40, height: 4, decoration: BoxDecoration(color: p.border, borderRadius: BorderRadius.circular(2))),
        ),
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text('Month Review', style: AppTypography.inter(fontSize: 17, fontWeight: FontWeight.w700, color: p.text)),
                const SizedBox(width: 8),
                Text('Unified View', style: note()),
              ]),
              const SizedBox(height: 2),
              Text('How this month went against your plan, your bills and your safety cushion', style: note()),
            ]),
          ),
          IconButton(
            tooltip: 'Close modal',
            onPressed: () => Navigator.pop(context),
            icon: WebIcon(WebIcons.x, size: 14, color: p.textSecondary),
          ),
        ]),
        const SizedBox(height: 12),
        if (widget.planDetails != null) ...[widget.planDetails!, const SizedBox(height: 12)],
        ...body,
      ],
    );
  }
}
