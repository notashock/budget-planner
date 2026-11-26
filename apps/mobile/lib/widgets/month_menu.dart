import 'package:flutter/material.dart';

import '../modals/month_modals.dart';
import '../providers/budget_view.dart';
import '../theme/app_palette.dart';
import 'min_tap.dart';

const _monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "Nov 2026 ▾" in the header of the screens that depend on the month
/// (Plan, Transactions; Apple-style plan §3). Also rolls over to the next month;
/// months are never created by hand (same as web).
class MonthMenu extends StatelessWidget {
  const MonthMenu({super.key});

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final p = context.palette;
    final year = budget.currentYear;
    final month = budget.currentMonth;
    String label(int y, int m) => '${_monthsShort[(m - 1).clamp(0, 11)]} $y';

    return PopupMenuButton<String>(
      key: const ValueKey('header-month'),
      tooltip: 'Choose month',
      onSelected: (val) {
        if (val == '__rollover__') {
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
        for (final m in budget.months)
          () {
            final y = (num.tryParse('${m['year']}') ?? year).toInt();
            final mo = (num.tryParse('${m['month']}') ?? month).toInt();
            final selected = y == year && mo == month;
            return PopupMenuItem<String>(
              value: '$y-$mo',
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(label(y, mo), style: TextStyle(fontWeight: selected ? FontWeight.bold : FontWeight.normal)),
                if (selected) const Icon(Icons.check, size: 14),
              ]),
            );
          }(),
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          value: '__rollover__',
          child: Row(children: [Icon(Icons.refresh, size: 16), SizedBox(width: 8), Text('Rollover Month')]),
        ),
      ],
      child: MinTap(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(label(year, month),
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.primary)),
            Icon(Icons.keyboard_arrow_down, size: 18, color: p.textSecondary),
          ]),
        ),
      ),
    );
  }
}
