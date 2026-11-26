import 'package:flutter/material.dart';

import '../modals/month_modals.dart';
import '../providers/budget_view.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import 'acct_inset.dart' show AcctTag;
import 'min_tap.dart';
import 'web_icons.dart';

const _monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

String _name(int y, int m) => '${_monthNames[(m - 1).clamp(0, 11)]} $y';

/// Where a month sits against today, by web's MonthMenu rules.
enum MonthPlace { past, active, future }

MonthPlace monthPlace(Map m, DateTime now) {
  final today = '${now.year}-${'${now.month}'.padLeft(2, '0')}-${'${now.day}'.padLeft(2, '0')}';
  final y = (num.tryParse('${m['year']}') ?? 0).toInt();
  final mo = (num.tryParse('${m['month']}') ?? 0).toInt();
  final end = m['endDate'] as String?;
  final start = m['startDate'] as String?;
  final before = y < now.year || (y == now.year && mo < now.month);
  final after = y > now.year || (y == now.year && mo > now.month);
  if (end != null ? end.compareTo(today) < 0 : before) return MonthPlace.past;
  if ((start != null && start.compareTo(today) > 0) || after || m['isClosed'] == true) return MonthPlace.future;
  return MonthPlace.active;
}

/// Web's MonthMenu in the Plan and Transactions headers: the active planning
/// cycle (or "Start {next month}" when there is none), then past months as
/// read-only previews. Months are never created by hand.
class MonthMenu extends StatelessWidget {
  const MonthMenu({super.key});

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final p = context.palette;
    final year = budget.currentYear;
    final month = budget.currentMonth;
    final now = DateTime.now();
    final months = budget.months.whereType<Map>().toList();
    final active = months.where((m) => monthPlace(m, now) == MonthPlace.active).toList();
    final past = months.where((m) => monthPlace(m, now) == MonthPlace.past).toList();
    final next = month == 12 ? _name(year + 1, 1) : _name(year, month + 1);
    final selectedIsPast = past.any((m) => '${m['year']}' == '$year' && '${m['month']}' == '$month');

    PopupMenuItem<String> heading(String text) => PopupMenuItem<String>(
          enabled: false,
          height: 28,
          child: Text(text.toUpperCase(),
              style: AppTypography.inter(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: p.textMuted)),
        );

    PopupMenuItem<String> monthItem(Map m, String tag) {
      final y = (num.tryParse('${m['year']}') ?? year).toInt();
      final mo = (num.tryParse('${m['month']}') ?? month).toInt();
      final selected = y == year && mo == month;
      return PopupMenuItem<String>(
        key: ValueKey('month-$y-$mo'),
        value: '$y-$mo',
        child: Row(children: [
          Text(_name(y, mo),
              style: AppTypography.inter(
                  fontSize: 13, fontWeight: selected ? FontWeight.w600 : FontWeight.w400, color: selected ? p.accent : p.text)),
          const SizedBox(width: 6),
          AcctTag(tag),
          const Spacer(),
          if (selected) Text('●', style: TextStyle(fontSize: 10, color: p.text)),
        ]),
      );
    }

    return PopupMenuButton<String>(
      key: const ValueKey('header-month'),
      tooltip: 'Select month',
      constraints: const BoxConstraints(minWidth: 240),
      onSelected: (val) {
        if (val == '__start__') {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => const RolloverModal(),
          );
          return;
        }
        final parts = val.split('-');
        if (parts.length == 2) budget.switchMonth(int.parse(parts[0]), int.parse(parts[1]));
      },
      itemBuilder: (context) => [
        heading('Active planning cycle'),
        if (active.isEmpty) ...[
          PopupMenuItem<String>(
            enabled: false,
            height: 28,
            child: Text('No active planning cycle', style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
          ),
          PopupMenuItem<String>(
            key: const ValueKey('header-start-month'),
            value: '__start__',
            child: Row(children: [
              WebIcon(WebIcons.plus, size: 13, color: p.accent),
              const SizedBox(width: 6),
              Text('Start ${months.isEmpty ? 'Next Month' : next}',
                  style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: p.accent)),
            ]),
          ),
        ] else
          for (final m in active) monthItem(m, 'Current'),
        if (past.isNotEmpty) ...[
          const PopupMenuDivider(),
          heading('Previous month previews (read-only)'),
          for (final m in past) monthItem(m, 'Preview'),
        ],
      ],
      child: MinTap(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(_name(year, month), style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: p.text)),
            if (selectedIsPast) ...[const SizedBox(width: 6), const AcctTag('Preview')],
            const SizedBox(width: 6),
            WebIcon(WebIcons.chevronDown, size: 11, color: p.text.withValues(alpha: 0.5)),
          ]),
        ),
      ),
    );
  }
}
