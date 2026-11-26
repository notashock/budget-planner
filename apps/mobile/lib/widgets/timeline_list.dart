// The Plan page's day-by-day list, drawn like web's TimelineList
// (apps/web/src/components/TimelineList.jsx; sizes measured at 393 px).
import 'package:flutter/material.dart';

import '../engine/engine.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import 'min_tap.dart';
import 'web_icons.dart';

class TimelineListWidget extends StatefulWidget {
  final SimulationResult simulation;
  final int safetyFloor;
  final int? selectedDay;
  final int? currentDay;
  final ValueChanged<int?>? onSelectDay;
  final String currencySymbol;

  /// Account id → name, for the account line under each entry.
  final Map<String, String> accountNames;

  /// The account the page is filtered to, if any (shown next to the title).
  final String? accountName;
  final bool accountIsWallet;
  final void Function(TimelineEvent event)? onPay;
  final void Function(TimelineEvent event)? onEdit;

  const TimelineListWidget({
    super.key,
    required this.simulation,
    required this.safetyFloor,
    this.selectedDay,
    this.currentDay,
    this.onSelectDay,
    this.currencySymbol = kDefaultCurrencySymbol,
    this.accountNames = const {},
    this.accountName,
    this.accountIsWallet = false,
    this.onPay,
    this.onEdit,
  });

  @override
  State<TimelineListWidget> createState() => _TimelineListWidgetState();
}

/// One timeline entry with web's derived flags.
class _Row {
  _Row(this.e, String today, int? currentDay, int floor) {
    final r = e.raw;
    itemType = r['itemType']?.toString() ?? '';
    isTransfer = itemType == 'transfer' || e.type == 'transfer';
    isSalary = r['isSalary'] == true || itemType == 'salary';
    isActual = r['isActual'] == true;
    isPaid = r['isPaid'] == true;
    isPending = r['isPending'] == true;
    isGoal = r['origin'] == 'goal' || e.origin == 'goal';
    isPlanned = !isTransfer &&
        !isActual &&
        !isPaid &&
        (itemType == 'planned-item' ||
            itemType == 'planned-transaction' ||
            r['isPlanned'] == true ||
            isPending ||
            r['status'] == 'planned' ||
            e.amount < 0);
    isOverdue = isPlanned && (isPending || (e.date.isNotEmpty ? e.date.compareTo(today) < 0 : e.day < (currentDay ?? 30)));
    isDue = isPlanned && !isOverdue && (e.date.isNotEmpty ? e.date == today : e.day == currentDay);
    isCredit = e.amount > 0 || isSalary;
    isWallet = r['walletId'] != null || e.accountType == 'wallet' || r['sourceType'] == 'wallet';
    isBreach = e.runningBalance < floor;
    isNearFloor = !isBreach && floor > 0 && e.runningBalance <= floor * 1.15;
  }

  final TimelineEvent e;
  late final String itemType;
  late final bool isTransfer, isSalary, isActual, isPaid, isPending, isGoal, isPlanned, isOverdue, isDue;
  late final bool isCredit, isWallet, isBreach, isNearFloor;

  String get label => (e.raw['label'] ?? e.name).toString();
}

class _TimelineListWidgetState extends State<TimelineListWidget> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final now = DateTime.now();
    String two(int n) => n.toString().padLeft(2, '0');
    final today = '${now.year}-${two(now.month)}-${two(now.day)}';
    final rows = [
      for (final e in widget.simulation.allEvents) _Row(e, today, widget.currentDay, widget.safetyFloor),
    ];

    final counts = {
      'all': rows.length,
      'incomes': rows.where((r) => r.e.amount > 0).length,
      'planned': rows.where((r) => !r.isActual && r.e.amount < 0).length,
      'pending': rows.where((r) => r.isPending).length,
      'actuals': rows.where((r) => r.isActual).length,
      'breaches': rows.where((r) => r.isBreach).length,
    };
    bool keep(_Row r) {
      if (widget.selectedDay != null && r.e.day != widget.selectedDay) return false;
      return switch (_filter) {
        'incomes' => r.e.amount > 0,
        'planned' => !r.isActual && r.e.amount < 0,
        'pending' => r.isPending,
        'actuals' => r.isActual,
        'breaches' => r.isBreach,
        _ => true,
      };
    }

    final shown = rows.where(keep).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _header(p),
        const SizedBox(height: 10),
        if (rows.isEmpty)
          _empty(p, WebIcons.calendar, 'No Timeline Events',
              widget.accountName != null
                  ? 'No timeline events recorded for ${widget.accountName} this month.'
                  : 'No timeline events generated for this month.',
              dayReset: widget.accountName != null && widget.selectedDay != null)
        else ...[
          _filters(p, counts),
          const SizedBox(height: 10),
          if (shown.isEmpty)
            _empty(p, WebIcons.checkCircle, null, 'No events match the selected filter.', reset: true)
          else
            _list(p, shown, today),
        ],
      ],
    );
  }

  Widget _header(AppPalette p) {
    return Wrap(
      spacing: 12,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Semantics(
          header: true,
          child: Text('Timeline',
              style: AppTypography.inter(fontSize: 18, fontWeight: FontWeight.w700, color: p.text, letterSpacing: -0.36)),
        ),
        if (widget.accountName != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: p.surfaceSubtle,
              border: Border.all(color: p.border),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              WebIcon(widget.accountIsWallet ? WebIcons.wallet : WebIcons.buildingLibrary, size: 11, color: p.textSecondary),
              const SizedBox(width: 4),
              Text(widget.accountName!, style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w600, color: p.text)),
              if (widget.safetyFloor > 0)
                Text(' • Min Floor ${formatCurrency(widget.safetyFloor, symbol: widget.currencySymbol)}',
                    style: AppTypography.inter(fontSize: 11, color: p.textMuted)),
            ]),
          ),
        if (widget.selectedDay != null)
          Row(mainAxisSize: MainAxisSize.min, children: [
            Text('Day ${widget.selectedDay} filtered',
                style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: p.textSecondary)),
            const SizedBox(width: 6),
            TextButton(onPressed: () => widget.onSelectDay?.call(null), child: const Text('Show all days')),
          ]),
      ],
    );
  }

  /// web's segmented bar: a 36 px track, 28 px tabs; each tab takes taps over 48 dp.
  Widget _filters(AppPalette p, Map<String, int> counts) => Semantics(
        container: true,
        label: 'Timeline Filters',
        child: _filterTabs(p, counts),
      );

  Widget _filterTabs(AppPalette p, Map<String, int> counts) {
    final tabs = [
      ('all', 'All'),
      ('incomes', 'Income'),
      ('planned', 'Planned'),
      if (counts['pending']! > 0) ('pending', 'Pending'),
      ('actuals', 'Paid'),
      ('breaches', 'Below minimum'),
    ];
    return SizedBox(
      height: 48,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Stack(children: [
          Positioned.fill(
            top: 6,
            bottom: 6,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: p.surfaceSubtle,
                border: Border.all(color: p.border),
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: Row(children: [
              for (final (i, (id, label)) in tabs.indexed) ...[
                if (i > 0) const SizedBox(width: 2),
                _tab(p, id, label, counts[id]!),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _tab(AppPalette p, String id, String label, int count) {
    final active = _filter == id;
    return Semantics(
      selected: active,
      button: true,
      label: '$label, $count',
      excludeSemantics: true,
      onTap: () => setState(() => _filter = id),
      child: InkWell(
        key: Key('timeline-filter-$id'),
        onTap: () => setState(() => _filter = id),
        child: SizedBox(
          height: 48,
          child: Center(
            child: Container(
              height: 28,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: active
                  ? BoxDecoration(
                      color: p.surface,
                      borderRadius: BorderRadius.circular(7),
                      boxShadow: const [
                        BoxShadow(color: Color(0x14000000), blurRadius: 3, offset: Offset(0, 1)),
                        BoxShadow(color: Color(0x0A000000), blurRadius: 1, offset: Offset(0, 0.5)),
                      ],
                    )
                  : null,
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(label,
                    style: AppTypography.inter(
                        fontSize: 12,
                        fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                        color: active ? p.text : p.textSecondary)),
                const SizedBox(width: 6),
                Text('$count', style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w600, color: p.textMuted)),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _empty(AppPalette p, WebIconData icon, String? title, String body, {bool reset = false, bool dayReset = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
      child: Column(children: [
        WebIcon(icon, size: 24, color: p.textMuted),
        if (title != null) ...[
          const SizedBox(height: 8),
          Text(title, style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w600, color: p.text)),
        ],
        const SizedBox(height: 4),
        Text(body, textAlign: TextAlign.center, style: AppTypography.inter(fontSize: 13, color: p.textSecondary)),
        if (reset)
          TextButton(
            onPressed: () {
              setState(() => _filter = 'all');
              widget.onSelectDay?.call(null);
            },
            child: const Text('Reset all filters'),
          ),
        if (dayReset)
          TextButton(onPressed: () => widget.onSelectDay?.call(null), child: const Text('Reset day filter')),
      ]),
    );
  }

  Widget _list(AppPalette p, List<_Row> rows, String today) {
    final groups = <String, ({int net, int count})>{};
    for (final r in rows) {
      final g = groups[r.e.date] ?? (net: 0, count: 0);
      groups[r.e.date] = (net: g.net + r.e.amount, count: g.count + 1);
    }
    final cd = widget.currentDay;
    final children = <Widget>[];
    for (final (i, r) in rows.indexed) {
      final prev = i == 0 ? null : rows[i - 1];
      if (cd != null && widget.selectedDay == null && r.e.day >= cd && (prev == null || prev.e.day < cd)) {
        children.add(_todayDivider(p, today, first: i == 0));
      }
      if (prev == null || prev.e.date != r.e.date) {
        children.add(_dayHeader(p, r.e.date, groups[r.e.date]!, today));
      } else {
        children.add(Padding(
          padding: const EdgeInsets.only(left: 60, right: 14),
          child: Divider(height: 1, thickness: 1, color: p.border),
        ));
      }
      children.add(_row(p, r));
    }
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: p.surface,
        border: Border.all(color: p.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
    );
  }

  Widget _todayDivider(AppPalette p, String today, {required bool first}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
      decoration: BoxDecoration(
        color: p.surfaceSubtle,
        border: Border(
          top: first ? BorderSide.none : BorderSide(color: p.border),
          bottom: BorderSide(color: p.border),
        ),
      ),
      child: Row(children: [
        Expanded(child: Container(height: 1, color: p.border)),
        const SizedBox(width: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            color: p.surface,
            border: Border.all(color: p.border),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            WebIcon(WebIcons.mapPin, size: 12, color: p.text),
            const SizedBox(width: 5),
            Text('TODAY (${formatDisplayDate(today).toUpperCase()})',
                style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w700, color: p.text, letterSpacing: 0.44)),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(child: Container(height: 1, color: p.border)),
      ]),
    );
  }

  Widget _dayHeader(AppPalette p, String date, ({int net, int count}) g, String today) {
    final netColour = g.net > 0 ? p.good : (g.net < 0 ? p.bad : p.textSecondary);
    return Semantics(
      header: true,
      child: Container(
        color: p.surfaceSubtle,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        child: Row(children: [
          Expanded(
            child: Row(children: [
              Flexible(
                child: Text(formatDisplayDate(date),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: p.text)),
              ),
              if (relativeDateBadge(date, today) case final badge?) ...[
                const SizedBox(width: 8),
                Flexible(
                  child: Text(badge,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.inter(
                          fontSize: 11, fontWeight: FontWeight.w700, color: date == today ? p.accent : p.textMuted)),
                ),
              ],
            ]),
          ),
          const SizedBox(width: 10),
          Text('${g.count} ${g.count == 1 ? 'entry' : 'entries'}',
              style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
          const SizedBox(width: 10),
          Text('${g.net > 0 ? '+' : ''}${formatCurrency(g.net, symbol: widget.currencySymbol)}',
              style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w700, color: netColour)),
        ]),
      ),
    );
  }

  // web's glyph tones (transactions-inset-list.css), the same in both themes.
  static const _glyph = {
    'transfer': Color(0xFF6366F1),
    'goal': Color(0xFF8B5CF6),
    'credit': Color(0xFF10B981),
    'overdue': Color(0xFFEF4444),
    'due': Color(0xFFF59E0B),
    'wallet': Color(0xFFF59E0B),
    'upcoming': Color(0xFF6366F1),
    'debit': Color(0xFF3B82F6),
  };

  /// web's getCategoryInfo(): which icon the glyph box draws.
  WebIconData _categoryIcon(_Row r) {
    final cat = (r.e.raw['category'] ?? r.e.raw['tag'] ?? '').toString().toLowerCase();
    final label = r.label.toLowerCase();
    bool any(String s, List<String> words) => words.any(s.contains);
    if (r.isTransfer) return WebIcons.arrowRightLeft;
    if (r.isSalary || cat.contains('salary') || label.contains('salary')) return WebIcons.trendingUp;
    if (r.isGoal || cat.contains('goal')) return WebIcons.target;
    if (cat.contains('travel') ||
        any(label, ['travel', 'uber', 'ola', 'fuel', 'petrol', 'flight', 'metro'])) {
      return WebIcons.mapPin;
    }
    if (cat.contains('util') || any(label, ['bill', 'electric', 'wifi', 'rent', 'water'])) return WebIcons.zap;
    if (r.e.amount > 0 || r.itemType.contains('income')) return WebIcons.banknote;
    return WebIcons.tag;
  }

  String _accountLine(_Row r) {
    final raw = r.e.raw;
    final name = widget.accountName ??
        widget.accountNames[(raw['bankAccountId'] ?? raw['walletId'] ?? r.e.accountId ?? '').toString()] ??
        (r.isWallet ? 'Wallet' : 'Bank Account');
    if (r.isTransfer) {
      String n(Object? id) => widget.accountNames['${id ?? ''}'] ?? 'Account';
      return 'transfer • ${n(raw['sourceBankAccountId'] ?? raw['sourceWalletId'])} → '
          '${n(raw['destinationBankAccountId'] ?? raw['destinationWalletId'])}';
    }
    final income = r.isSalary || r.itemType == 'actual-income' || r.e.type == 'income' || r.itemType == 'income';
    if (!income) return name;
    final base = r.itemType == 'actual-income'
        ? 'income • actual credited'
        : r.isSalary
            ? (r.isActual ? 'salary • credited' : 'salary • planned')
            : '${(r.itemType.isEmpty ? 'planned' : r.itemType).replaceFirst('-', ' ')} ${r.isActual ? '• actual' : '• planned'}';
    return '$base • $name';
  }

  Widget _tag(String text, Color fg, Color bg, Color border, {WebIconData? icon, FontWeight weight = FontWeight.w600}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg, border: Border.all(color: border), borderRadius: BorderRadius.circular(6)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[WebIcon(icon, size: 10, color: fg, strokeWidth: 2.6), const SizedBox(width: 3)],
        Flexible(
          child: Text(text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.inter(fontSize: 11, fontWeight: weight, color: fg, letterSpacing: 0.22)),
        ),
      ]),
    );
  }

  List<Widget> _tags(AppPalette p, _Row r) {
    const red = Color(0xFFEF4444), amber = Color(0xFFD97706);
    final originalDay = r.e.raw['originalDay'];
    return [
      if (r.isTransfer)
        _tag('Transfer', p.accent, const Color(0x1F6366F1), const Color(0x406366F1), icon: WebIcons.arrowRightLeft),
      if (r.isGoal) _tag('Goal', const Color(0xFF8B5CF6), const Color(0x1A8B5CF6), const Color(0x408B5CF6), icon: WebIcons.target),
      if (r.isPending) _tag('Pending', red, const Color(0x1FEF4444), const Color(0x47EF4444), weight: FontWeight.w700),
      if (r.isSalary && r.isActual)
        _tag('Credited', p.good, p.good.withValues(alpha: 0.12), p.good.withValues(alpha: 0.25), icon: WebIcons.check),
      if (r.isPaid && originalDay != null && originalDay != r.e.day && !r.isPending)
        _tag('Orig Day $originalDay', p.textMuted, p.surfaceSubtle, p.border),
      if (r.isPlanned && r.isOverdue)
        _tag('Overdue', red, const Color(0x1FEF4444), const Color(0x47EF4444), icon: WebIcons.alertTriangle, weight: FontWeight.w700),
      if (r.isPlanned && r.isDue) _tag('Due', amber, const Color(0x1FF59E0B), const Color(0x47F59E0B), icon: WebIcons.calendar),
      if (r.isPlanned && !r.isOverdue && !r.isDue) _tag('Upcoming', p.textMuted, p.surfaceSubtle, p.border, weight: FontWeight.w500),
      if (!r.isPlanned && !r.isTransfer && !r.isSalary && (r.isActual || r.isPaid || r.e.status == 'successful'))
        _tag('Settled', p.textMuted, p.surfaceSubtle, p.border),
    ].map((t) => Padding(padding: const EdgeInsets.only(left: 7), child: t)).toList();
  }

  Widget _row(AppPalette p, _Row r) {
    final glyph = _glyph[r.isTransfer
        ? 'transfer'
        : r.isGoal
            ? 'goal'
            : r.isCredit
                ? 'credit'
                : r.isOverdue
                    ? 'overdue'
                    : r.isDue
                        ? 'due'
                        : r.isWallet
                            ? 'wallet'
                            : r.isPlanned
                                ? 'upcoming'
                                : 'debit']!;
    final selected = widget.selectedDay == r.e.day;
    final transferAmount = (num.tryParse('${r.e.raw['transferAmount']}') ?? 0).round();
    final (amount, amountColour) = r.isTransfer && widget.accountName == null
        ? ('⇄ ${formatCurrency(transferAmount, symbol: widget.currencySymbol)}', p.accent)
        : r.e.amount > 0
            ? ('+${formatCurrency(r.e.amount, symbol: widget.currencySymbol)}', p.good)
            : (formatCurrency(r.e.amount, symbol: widget.currencySymbol), p.text);
    final (chipFg, chipBg, chipBorder) = r.isBreach
        ? (p.bad, const Color(0x1FF43F5E), const Color(0x59F43F5E))
        : r.isNearFloor
            ? (p.warn, const Color(0x1FF59E0B), const Color(0x4DF59E0B))
            : (p.good, p.good.withValues(alpha: 0.1), p.good.withValues(alpha: 0.25));
    final edge = r.isOverdue ? const Color(0xFFEF4444) : (r.isDue ? const Color(0xFFF59E0B) : null);
    final rowBg = selected ? p.surfaceHover : (r.isBreach ? p.badSubtle : null);

    return Material(
      color: rowBg ?? Colors.transparent,
      child: InkWell(
        onTap: () => widget.onSelectDay?.call(selected ? null : r.e.day),
        child: Container(
          decoration: edge == null ? null : BoxDecoration(border: Border(left: BorderSide(color: edge, width: 3))),
          padding: EdgeInsets.fromLTRB(edge == null ? 14 : 11, 11, 14, 11),
          child: Row(children: [
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: glyph.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(9)),
              child: WebIcon(_categoryIcon(r), color: glyph),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                // Tags drop under the title when large text leaves no room.
                Wrap(crossAxisAlignment: WrapCrossAlignment.center, runSpacing: 3, children: [
                  Text(r.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w600, color: p.text, height: 1.3)),
                  ..._tags(p, r),
                ]),
                const SizedBox(height: 3),
                Row(children: [
                  WebIcon(
                      r.isTransfer ? WebIcons.arrowRightLeft : (r.isWallet ? WebIcons.wallet : WebIcons.buildingLibrary),
                      size: 11,
                      color: p.textSecondary),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(_accountLine(r),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.inter(fontSize: 12, color: p.textSecondary)),
                  ),
                ]),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6.5, vertical: 1.5),
                  decoration: BoxDecoration(
                      color: chipBg, border: Border.all(color: chipBorder), borderRadius: BorderRadius.circular(4)),
                  child: Text('${r.isBreach ? '▲ ' : ''}bal: ${formatCurrency(r.e.runningBalance, symbol: widget.currencySymbol)}',
                      style: AppTypography.mono(
                          fontSize: 11, fontWeight: r.isBreach ? FontWeight.w700 : FontWeight.w600, color: chipFg)),
                ),
              ]),
            ),
            const SizedBox(width: 12),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(amount,
                  style: AppTypography.mono(fontSize: 15, fontWeight: FontWeight.w700, color: amountColour, letterSpacing: -0.15)),
              if (r.isPlanned && widget.onPay != null)
                MinTap(
                  child: Semantics(
                    button: true,
                    label: 'Mark as Paid (Settle)',
                    excludeSemantics: true,
                    onTap: () => widget.onPay!(r.e),
                    child: InkWell(
                      onTap: () => widget.onPay!(r.e),
                      borderRadius: BorderRadius.circular(5),
                      child: Container(
                        height: 24,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        decoration: BoxDecoration(color: p.text, borderRadius: BorderRadius.circular(5)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          WebIcon(WebIcons.checkCircle, size: 12, color: p.bg, strokeWidth: 2.4),
                          const SizedBox(width: 4),
                          Text('Mark as Paid', style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w600, color: p.bg)),
                        ]),
                      ),
                    ),
                  ),
                ),
              if (widget.onEdit != null && r.e.transactionId != null)
                IconButton(
                  tooltip: 'Edit entry',
                  constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                  onPressed: () => widget.onEdit!(r.e),
                  icon: WebIcon(WebIcons.edit, size: 13, color: p.textMuted),
                ),
            ]),
          ]),
        ),
      ),
    );
  }
}

/// Web's getRelativeDateBadge: Today, Tomorrow, Yesterday, "In 3 days", "In 2w", "4d ago", "2w ago" (up to four weeks).
String? relativeDateBadge(String date, String today) {
  final a = DateTime.tryParse(date), b = DateTime.tryParse(today);
  if (a == null || b == null) return null;
  final diff = DateTime.utc(a.year, a.month, a.day).difference(DateTime.utc(b.year, b.month, b.day)).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Tomorrow';
  if (diff == -1) return 'Yesterday';
  if (diff > 1 && diff <= 7) return 'In $diff days';
  if (diff > 7 && diff <= 28) return 'In ${(diff / 7).round()}w';
  if (diff < -1 && diff >= -7) return '${-diff}d ago';
  if (diff < -7 && diff >= -28) return '${(-diff / 7).round()}w ago';
  return null;
}
