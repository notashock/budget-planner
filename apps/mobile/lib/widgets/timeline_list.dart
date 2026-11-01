import 'package:flutter/material.dart';
import '../engine/currency.dart';
import '../engine/simulator.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../modals/transaction_detail_modal.dart';

class TimelineListWidget extends StatefulWidget {
  final SimulationResult simulation;
  final int safetyFloor;
  final int? selectedDay;
  final int? currentDay;
  final ValueChanged<int?>? onSelectDay;
  final String currencySymbol;
  final void Function(TimelineEvent event)? onEventTap;

  const TimelineListWidget({
    super.key,
    required this.simulation,
    required this.safetyFloor,
    this.selectedDay,
    this.currentDay,
    this.onSelectDay,
    this.currencySymbol = '₹',
    this.onEventTap,
  });

  @override
  State<TimelineListWidget> createState() => _TimelineListWidgetState();
}

class _TimelineDayGroup {
  final int day;
  final String date;
  final List<TimelineEvent> events;

  _TimelineDayGroup({required this.day, required this.date, required this.events});

  int get netAmount => events.fold(0, (sum, e) => sum + e.amount);
}

class _TimelineListWidgetState extends State<TimelineListWidget> {
  String _filterType = 'all'; // 'all', 'incomes', 'planned', 'pending', 'actuals', 'breaches'
  final Set<String> _expandedDays = {};

  String _normalizeSpendingCategory(String? cat) {
    if (cat == null || cat.trim().isEmpty) return 'General';
    final lower = cat.trim().toLowerCase();
    if (lower == 'food') return 'Food';
    if (lower == 'travel') return 'Travel';
    if (lower == 'health') return 'Health';
    if (lower == 'other') return 'Other';
    return 'General';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    final allEvents = widget.simulation.allEvents;

    final baseEvents = widget.selectedDay != null
        ? allEvents.where((e) => e.day == widget.selectedDay).toList()
        : allEvents;

    // Calculate counts
    final counts = {
      'all': baseEvents.length,
      'incomes': baseEvents.where((e) => e.amount > 0).length,
      'planned': baseEvents.where((e) => (!e.isPaid || e.status == 'planned') && e.amount < 0).length,
      'successful': baseEvents.where((e) => e.isPaid || e.status == 'successful').length,
      'breaches': baseEvents.where((e) => e.runningBalance < widget.safetyFloor).length,
    };

    // Filter events
    final filteredEvents = allEvents.where((e) {
      if (widget.selectedDay != null && e.day != widget.selectedDay) {
        return false;
      }
      switch (_filterType) {
        case 'incomes':
          return e.amount > 0;
        case 'planned':
          return (!e.isPaid || e.status == 'planned') && e.amount < 0;
        case 'successful':
        case 'actuals':
          return e.isPaid || e.status == 'successful';
        case 'breaches':
          return e.runningBalance < widget.safetyFloor;
        default:
          return true;
      }
    }).toList();

    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Card Header: Title + Day filter pill
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text(
                      'INTERACTIVE TIMELINE',
                      style: AppTypography.inter(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                        color: textSecondary,
                      ),
                    ),
                  ],
                ),
                if (widget.selectedDay != null)
                  InkWell(
                    onTap: () => widget.onSelectDay?.call(null),
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
                          Text(
                            'Day ${widget.selectedDay} (${filteredEvents.length})',
                            style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w600, color: text),
                          ),
                          const SizedBox(width: 4),
                          Icon(Icons.close, size: 12, color: textMuted),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Filter Tabs (Horizontal scroll)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Row(
              children: [
                _buildFilterPill('all', 'All (${counts['all']})', isDark, border, text),
                const SizedBox(width: 6),
                _buildFilterPill('incomes', 'Incomes (${counts['incomes']})', isDark, border, text),
                const SizedBox(width: 6),
                _buildFilterPill('planned', 'Planned (${counts['planned']})', isDark, border, text),
                const SizedBox(width: 6),
                _buildFilterPill('successful', 'Successful (${counts['successful']})', isDark, border, text),
                const SizedBox(width: 6),
                _buildFilterPill('breaches', 'Breaches (${counts['breaches']})', isDark, border, text, isBreachPill: true),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Divider(color: border, height: 1, thickness: 1),

          // Events List
          if (filteredEvents.isEmpty)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Center(
                child: Text(
                  'No transactions match the selected filter.',
                  style: AppTypography.inter(fontSize: 12, color: textMuted),
                ),
              ),
            )
          else
            _buildEventsListWithTodayMarker(filteredEvents, isDark, border, text, textSecondary, textMuted),
        ],
      ),
    );
  }

  Widget _buildFilterPill(
    String type,
    String label,
    bool isDark,
    Color border,
    Color text, {
    bool isBreachPill = false,
  }) {
    final isActive = _filterType == type;
    final activeBg = isDark ? Colors.white : Colors.black;
    final activeText = isDark ? Colors.black : Colors.white;

    Color inactiveBg = isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle;
    Color inactiveBorder = isBreachPill ? AppColors.red.withAlpha(100) : border;

    return InkWell(
      onTap: () => setState(() => _filterType = type),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4.5),
        decoration: BoxDecoration(
          color: isActive ? activeBg : inactiveBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isActive ? activeBg : inactiveBorder, width: 1),
        ),
        child: Text(
          label,
          style: AppTypography.inter(
            fontSize: 11,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
            color: isActive ? activeText : (isBreachPill ? AppColors.red : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary)),
          ),
        ),
      ),
    );
  }

  Widget _buildEventsListWithTodayMarker(
    List<TimelineEvent> events,
    bool isDark,
    Color border,
    Color text,
    Color textSecondary,
    Color textMuted,
  ) {
    final currentDay = widget.currentDay;
    bool todayMarkerInserted = false;

    // Group events occurring on the same date/day together
    final groups = <_TimelineDayGroup>[];
    for (final ev in events) {
      if (groups.isNotEmpty &&
          (groups.last.date.isNotEmpty && ev.date.isNotEmpty
              ? groups.last.date == ev.date
              : groups.last.day == ev.day)) {
        groups.last.events.add(ev);
      } else {
        groups.add(_TimelineDayGroup(day: ev.day, date: ev.date, events: [ev]));
      }
    }

    final widgets = <Widget>[];

    for (int i = 0; i < groups.length; i++) {
      final grp = groups[i];

      // Insert TODAY pin if passing today
      if (currentDay != null && !todayMarkerInserted && grp.day >= currentDay) {
        widgets.add(_buildTodayDivider(isDark, border));
        todayMarkerInserted = true;
      }

      if (grp.events.length == 1) {
        widgets.add(_buildEventRow(grp.events.first, isDark, border, text, textSecondary, textMuted));
      } else {
        widgets.add(_buildGroupedDayRow(grp, isDark, border, text, textSecondary, textMuted));
      }

      if (i < groups.length - 1) {
        widgets.add(Divider(color: border.withAlpha(60), height: 1, thickness: 0.5));
      }
    }

    // If all events are before today, insert today at end
    if (currentDay != null && !todayMarkerInserted) {
      widgets.add(_buildTodayDivider(isDark, border));
    }

    return Column(children: widgets);
  }

  Widget _buildTodayDivider(bool isDark, Color border) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: isDark ? const Color(0x1AF59E0B) : const Color(0x14F59E0B),
        border: Border.symmetric(
          horizontal: BorderSide(color: AppColors.amber.withAlpha(80), width: 1),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(Icons.location_on, size: 13, color: AppColors.amber),
              const SizedBox(width: 5),
              Text(
                'TODAY',
                style: AppTypography.inter(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                  color: AppColors.amber,
                ),
              ),
            ],
          ),
          Text(
            widget.currentDay != null ? 'Day ${widget.currentDay}' : '',
            style: AppTypography.mono(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: AppColors.amber,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGroupedDayRow(
    _TimelineDayGroup grp,
    bool isDark,
    Color border,
    Color text,
    Color textSecondary,
    Color textMuted,
  ) {
    final groupKey = grp.date.isNotEmpty ? grp.date : 'day_${grp.day}';
    final isExpanded = _expandedDays.contains(groupKey);
    final net = grp.netAmount;
    final isNetPositive = net > 0;
    final isNetNegative = net < 0;

    String dayPart = '${grp.day}';
    String monthPart = '';
    if (grp.date.isNotEmpty) {
      final parts = grp.date.split('-');
      if (parts.length >= 3) {
        dayPart = '${int.tryParse(parts[2]) ?? grp.day}';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        final mIdx = (int.tryParse(parts[1]) ?? 1) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          monthPart = months[mIdx];
        }
      }
    }

    final summaryNames = grp.events
        .map((e) => (e.description != null && e.description!.isNotEmpty) ? e.description! : e.name)
        .join(', ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: () {
            setState(() {
              if (isExpanded) {
                _expandedDays.remove(groupKey);
              } else {
                _expandedDays.add(groupKey);
              }
            });
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Date Chip
                Container(
                  width: 46,
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: border, width: 1),
                  ),
                  child: Column(
                    children: [
                      Text(
                        monthPart.isNotEmpty ? monthPart : (grp.day < 0 ? 'Prev' : 'Day'),
                        style: AppTypography.inter(fontSize: 8.5, fontWeight: FontWeight.w600, color: textMuted),
                      ),
                      Text(
                        dayPart,
                        style: AppTypography.mono(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: text,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),

                // Middle: Transaction count & descriptions
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${grp.events.length} transactions',
                        style: AppTypography.inter(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: text,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        summaryNames,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.inter(fontSize: 11, color: textMuted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),

                // Net amount & chevron
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '${isNetPositive ? '+' : ''}${formatCurrency(net, symbol: widget.currencySymbol)}',
                          style: AppTypography.mono(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: isNetPositive ? AppColors.green : (isNetNegative ? AppColors.red : textSecondary),
                          ),
                        ),
                        Text(
                          'net for day',
                          style: AppTypography.inter(fontSize: 9, color: textMuted),
                        ),
                      ],
                    ),
                    const SizedBox(width: 4),
                    AnimatedRotation(
                      turns: isExpanded ? 0.5 : 0.0,
                      duration: const Duration(milliseconds: 240),
                      curve: Curves.easeInOutCubic,
                      child: Icon(
                        Icons.keyboard_arrow_down,
                        size: 20,
                        color: textMuted,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),

        // Sleek Animated Expansion for Transactions
        AnimatedCrossFade(
          firstChild: const SizedBox(width: double.infinity, height: 0),
          secondChild: Container(
            margin: const EdgeInsets.fromLTRB(20, 0, 14, 8),
            decoration: BoxDecoration(
              color: isDark ? Colors.white.withAlpha(6) : Colors.black.withAlpha(5),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: border.withAlpha(80), width: 0.8),
            ),
            child: Column(
              children: [
                for (int j = 0; j < grp.events.length; j++) ...[
                  _buildEventRow(grp.events[j], isDark, border, text, textSecondary, textMuted, isGroupChild: true),
                  if (j < grp.events.length - 1)
                    Divider(color: border.withAlpha(40), height: 1, thickness: 0.5),
                ],
              ],
            ),
          ),
          crossFadeState: isExpanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 240),
          firstCurve: Curves.easeInOutCubic,
          secondCurve: Curves.easeInOutCubic,
          sizeCurve: Curves.easeInOutCubic,
        ),
      ],
    );
  }

  Widget _buildEventRow(
    TimelineEvent ev,
    bool isDark,
    Color border,
    Color text,
    Color textSecondary,
    Color textMuted, {
    bool isGroupChild = false,
  }) {
    final isIncome = ev.amount > 0;
    final isBreached = ev.runningBalance < widget.safetyFloor;

    return InkWell(
      onTap: () {
        if (widget.onEventTap != null) {
          widget.onEventTap!(ev);
        } else {
          _showEventDetailSheet(context, ev);
        }
      },
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: isGroupChild ? 10 : 14, vertical: isGroupChild ? 8 : 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            if (isGroupChild)
              Container(
                width: 24,
                alignment: Alignment.center,
                child: Icon(Icons.subdirectory_arrow_right, size: 16, color: textMuted),
              )
            else
              // Date Chip (Calendar Date)
              Builder(
                builder: (_) {
                  String dayPart = '${ev.day}';
                  String monthPart = '';
                  if (ev.date.isNotEmpty) {
                    final parts = ev.date.split('-');
                    if (parts.length >= 3) {
                      dayPart = '${int.tryParse(parts[2]) ?? ev.day}';
                      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      final mIdx = (int.tryParse(parts[1]) ?? 1) - 1;
                      if (mIdx >= 0 && mIdx < 12) {
                        monthPart = months[mIdx];
                      }
                    }
                  }
                  return Container(
                    width: 46,
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: border, width: 1),
                    ),
                    child: Column(
                      children: [
                        Text(
                          monthPart.isNotEmpty ? monthPart : (ev.day < 0 ? 'Prev' : 'Day'),
                          style: AppTypography.inter(fontSize: 8.5, fontWeight: FontWeight.w600, color: textMuted),
                        ),
                        Text(
                          dayPart,
                          style: AppTypography.mono(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: text,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            const SizedBox(width: 10),

            // Middle Column: Description/Name with ellipsis, Category, Pills
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (ev.description != null && ev.description!.isNotEmpty) ? ev.description! : ev.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.inter(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: text,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Wrap(
                    spacing: 4,
                    runSpacing: 2,
                    children: [
                      if (isIncome)
                        _buildStatusPill(
                          'Inflow • ${ev.category != null && ev.category!.isNotEmpty ? ev.category! : 'Income'}',
                          AppColors.green,
                          isDark,
                          AppColors.green.withAlpha(80),
                          bg: AppColors.green.withAlpha(25),
                        )
                      else
                        _buildStatusPill(
                          _normalizeSpendingCategory(ev.category),
                          textMuted,
                          isDark,
                          border,
                        ),
                      if (ev.isPaid)
                        _buildStatusPill(
                          isIncome ? 'Credited' : 'Paid',
                          AppColors.green,
                          isDark,
                          AppColors.green.withAlpha(80),
                          bg: AppColors.green.withAlpha(25),
                          icon: Icons.check_circle_rounded,
                        )
                      else if (ev.derivedStatus == 'overdue')
                        _buildStatusPill(
                          'Overdue',
                          AppColors.red,
                          isDark,
                          AppColors.red.withAlpha(80),
                          bg: AppColors.red.withAlpha(25),
                          icon: Icons.error_outline,
                        )
                      else if (ev.derivedStatus == 'due')
                        _buildStatusPill(
                          'Due',
                          AppColors.amber,
                          isDark,
                          AppColors.amber.withAlpha(80),
                          bg: AppColors.amber.withAlpha(25),
                          icon: Icons.schedule,
                        )
                      else
                        _buildStatusPill(
                          'Planned',
                          textSecondary,
                          isDark,
                          border,
                        ),
                      if (ev.type == 'transfer')
                        _buildStatusPill(
                          'Transfer',
                          AppColors.amber,
                          isDark,
                          AppColors.amber.withAlpha(80),
                          bg: AppColors.amber.withAlpha(25),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),

            // Right Column: Amount & Running Balance Pill
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Builder(
                  builder: (_) {
                    final isTransfer = ev.type == 'transfer' || ev.raw['itemType'] == 'transfer';
                    final trAmt = (num.tryParse('${ev.raw['transferAmount']}') ?? 0).toInt();
                    final displayAmt = (isTransfer && ev.amount == 0 && trAmt > 0) ? trAmt : ev.amount.abs();
                    final String amountLabel = isTransfer && ev.amount == 0
                        ? formatCurrency(displayAmt, symbol: widget.currencySymbol)
                        : '${isIncome ? '+' : '-'}${formatCurrency(displayAmt, symbol: widget.currencySymbol)}';
                    return Text(
                      amountLabel,
                      style: AppTypography.mono(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: isTransfer
                            ? AppColors.amber
                            : (isIncome ? AppColors.green : AppColors.red),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 3),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                  decoration: BoxDecoration(
                    color: isBreached ? AppColors.red.withAlpha(20) : (isDark ? Colors.white.withAlpha(12) : Colors.black.withAlpha(8)),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: isBreached ? AppColors.red.withAlpha(100) : border,
                      width: 0.8,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Bal: ${formatCurrency(ev.runningBalance, symbol: widget.currencySymbol)}',
                        style: AppTypography.mono(
                          fontSize: 10,
                          color: isBreached ? AppColors.red : (isDark ? Colors.white70 : Colors.black87),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (isBreached) ...[
                        const SizedBox(width: 3),
                        const Icon(
                          Icons.warning_amber_rounded,
                          size: 9,
                          color: AppColors.red,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusPill(
    String label,
    Color textColor,
    bool isDark,
    Color borderColor, {
    Color? bg,
    IconData? icon,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: bg ?? (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: borderColor, width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 9, color: textColor),
            const SizedBox(width: 3),
          ],
          Text(
            label,
            style: AppTypography.inter(
              fontSize: 9.5,
              fontWeight: FontWeight.w600,
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }

  void _showEventDetailSheet(BuildContext context, TimelineEvent ev) {
    TransactionDetailModal.show(context, timelineEvent: ev, currencySymbol: widget.currencySymbol);
  }
}
