import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../modals/mark_paid_modal.dart';
import '../modals/transaction_detail_modal.dart';
import '../models/transaction.dart';
import '../models/transaction_lists.dart';
import '../widgets/confirm_dialog.dart';
import '../widgets/min_tap.dart';
import '../widgets/web_icons.dart';
import '../services/outbox.dart' show WriteResult;
import '../widgets/swipe_row.dart';

/// Web's sort options (TransactionsScreen.jsx SORT_OPTIONS).
enum TxSort { recent, oldest, amountDesc, amountAsc }

const _sortLabels = {
  TxSort.recent: ('Most recent', 'Recent'),
  TxSort.oldest: ('Oldest first', 'Oldest'),
  TxSort.amountDesc: ('Amount: high to low', 'Amount ↓'),
  TxSort.amountAsc: ('Amount: low to high', 'Amount ↑'),
};

/// Planned "Status" filter: null is "All statuses", TxSchedule.planned is "Upcoming".
const _statusLabels = {null: 'All statuses', TxSchedule.due: 'Due', TxSchedule.overdue: 'Overdue', TxSchedule.planned: 'Upcoming'};

/// The Transactions filters, shared by the header's ⋯ menu and the screen.
class TxFilters extends ChangeNotifier {
  bool planned = false;
  String? accountId;
  TxSchedule? status;

  void update({bool? planned, String? accountId, bool clearAccount = false, TxSchedule? status, bool clearStatus = false}) {
    if (planned != null) this.planned = planned;
    if (accountId != null || clearAccount) this.accountId = accountId;
    if (status != null || clearStatus) this.status = status;
    notifyListeners();
  }
}

/// Every account's name by id (banks, wallets and cards), as web's accountLookupMap.
Map<String, String> _accountNames(BudgetProvider b) => {
      for (final a in [...b.bankAccounts, ...b.wallets, ...b.creditCards])
        if (a is Map && (a['id'] ?? a['_id']) != null) '${a['id'] ?? a['_id']}': '${a['name'] ?? ''}',
    };

/// Header "⋯": Account, plus Status on Planned (web's "Filter transactions" menu).
class TxFilterMenu extends StatelessWidget {
  const TxFilterMenu({super.key, required this.filters});

  final TxFilters filters;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ListenableBuilder(
      listenable: filters,
      builder: (context, _) => PopupMenuButton<VoidCallback>(
        key: const ValueKey('tx-filter-menu'),
        tooltip: 'Filter transactions',
        onSelected: (apply) => apply(),
        itemBuilder: (context) {
          final names = _accountNames(context.read<BudgetProvider>());
          PopupMenuEntry<VoidCallback> heading(String t) => PopupMenuItem(
                enabled: false,
                height: 32,
                child: Text(t.toUpperCase(),
                    style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: p.textMuted)),
              );
          PopupMenuEntry<VoidCallback> option(String label, bool checked, VoidCallback apply) => PopupMenuItem(
                value: apply,
                child: Row(children: [
                  Expanded(child: Text(label, overflow: TextOverflow.ellipsis)),
                  if (checked) WebIcon(WebIcons.check, size: 13, color: p.text),
                ]),
              );
          return [
            heading('Account'),
            option('All accounts', filters.accountId == null, () => filters.update(clearAccount: true)),
            for (final e in names.entries)
              option(e.value, filters.accountId == e.key, () => filters.update(accountId: e.key)),
            if (filters.planned) ...[
              heading('Status'),
              for (final e in _statusLabels.entries)
                option(e.value, filters.status == e.key, () => filters.update(status: e.key, clearStatus: e.key == null)),
            ],
          ];
        },
        child: MinTap(
          child: Container(
            width: 32,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: const Color(0x1A7F7F7F), borderRadius: BorderRadius.circular(17)),
            child: _Dots(color: p.textMuted),
          ),
        ),
      ),
    );
  }
}

class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key, this.filters});

  /// Shared with the header's [TxFilterMenu]; the screen keeps its own when null.
  final TxFilters? filters;

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  late final TxFilters _filters = widget.filters ?? TxFilters();

  // Swiped "paid" but still inside the Undo window: hidden from Planned, not
  // sent yet (upgrade plan 3.7). There is no "unpay", so undo means not sending.
  final Set<String> _paying = {};

  final _search = TextEditingController();
  TxSort _sort = TxSort.recent;
  bool _showBreakdown = false;

  @override
  void initState() {
    super.initState();
    _filters.addListener(_changed);
    _search.addListener(_changed);
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    _filters.removeListener(_changed);
    if (widget.filters == null) _filters.dispose();
    _search.dispose();
    super.dispose();
  }

  Future<void> _handleCancelPlanned(BuildContext context, Transaction tx) async {
    final budget = context.read<BudgetProvider>();
    final messenger = ScaffoldMessenger.of(context);
    String? goalAction;
    if (tx.isFromGoal) {
      // Goal cancellation prompt: Return to Logged vs Mark as Dropped
      final action = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cancel Goal Commitment'),
          content: const Text(
            'This planned transaction is linked to a purchase goal. What would you like to do with the goal?',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Dismiss')),
            TextButton(onPressed: () => Navigator.pop(ctx, 'keep_logged'), child: const Text('Return to Logged')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: context.palette.badInk),
              onPressed: () => Navigator.pop(ctx, 'drop'),
              child: const Text('Mark as Dropped', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );
      if (action == null) return;
      goalAction = action;
    } else {
      final ok = await confirmDestructive(
        context,
        title: 'Cancel scheduled transaction',
        message: 'Cancel scheduled transaction "${tx.name}"? It will be removed from your forecast.',
        confirmLabel: 'Cancel it',
      );
      if (!ok) return;
    }
    try {
      await budget.cancelTransaction(tx.id, goalAction: goalAction);
      messenger.showSnackBar(SnackBar(
        content: Text(switch (goalAction) {
          'keep_logged' => 'Commitment cancelled; Goal returned to logged',
          'drop' => 'Commitment cancelled; Goal dropped',
          _ => 'Commitment cancelled',
        }),
      ));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Failed to cancel: $e')));
    }
  }

  Future<void> _delete(BuildContext context, Transaction tx) async {
    final budget = context.read<BudgetProvider>();
    final messenger = ScaffoldMessenger.of(context);
    final ok = await confirmDestructive(context,
        title: 'Delete transaction', message: 'Delete "${tx.name.isEmpty ? 'this transaction' : tx.name}"?');
    if (!ok) return;
    try {
      await budget.deleteTransaction(tx.id);
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Failed to delete: $e')));
    }
  }

  /// Swipe right on a planned row: paid in full from its usual account today,
  /// sent when the Undo snackbar closes without Undo.
  void _swipePay(BuildContext context, Transaction tx) {
    final budget = context.read<BudgetProvider>();
    final messenger = ScaffoldMessenger.of(context);
    final from = defaultPayFrom(budget, tx);
    final name = tx.name.isEmpty ? 'Payment' : tx.name;
    final today = _today();
    var undone = false;
    setState(() => _paying.add(tx.id));
    messenger.hideCurrentSnackBar(); // an earlier swipe's snackbar closing sends that payment
    messenger
        .showSnackBar(SnackBar(
          content: Text('Marked “$name” paid'),
          duration: const Duration(seconds: 4),
          action: SnackBarAction(label: 'Undo', onPressed: () => undone = true),
        ))
        .closed
        .then((_) async {
      try {
        if (undone) return;
        final result = await budget.payTransaction(tx.id, accountId: from?.id, amount: tx.displayAmount, date: today);
        if (result == WriteResult.queued) {
          messenger.showSnackBar(const SnackBar(
            content: Text('No connection. The payment is saved on this phone and will sync.'),
          ));
        }
      } catch (e) {
        messenger.showSnackBar(SnackBar(content: Text('Couldn’t mark “$name” paid: $e')));
      } finally {
        if (mounted) setState(() => _paying.remove(tx.id));
      }
    });
  }

  void _openMarkPaidModal(BuildContext context, Transaction tx) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => MarkPaidModal(transaction: tx),
    );
  }

  static String _today() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  /// Account filter, then every search word in name, note, category or account names.
  List<Transaction> _filter(List<Transaction> list, Map<String, String> names) {
    final tokens = _search.text.trim().toLowerCase().split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList();
    final account = _filters.accountId;
    return list.where((t) {
      if (account != null && t.accountId != account && !(t.kind == TxKind.transfer && t.destinationAccountId == account)) {
        return false;
      }
      if (tokens.isEmpty) return true;
      final hay = '${t.name} ${t.note} ${t.category} ${names[t.accountId] ?? ''} ${names[t.destinationAccountId] ?? ''}'
          .toLowerCase();
      return tokens.every(hay.contains);
    }).toList();
  }

  void _sortList(List<Transaction> list, {required bool planned}) {
    int rank(Transaction t) => switch (t.schedule) { TxSchedule.overdue => 0, TxSchedule.due => 1, _ => 2 };
    String date(Transaction t) => planned ? t.dueDate : t.date;
    list.sort((a, b) => switch (_sort) {
          TxSort.amountDesc => b.displayAmount - a.displayAmount,
          TxSort.amountAsc => a.displayAmount - b.displayAmount,
          TxSort.oldest => date(a).compareTo(date(b)),
          TxSort.recent when planned => rank(a) != rank(b) ? rank(a) - rank(b) : date(a).compareTo(date(b)),
          TxSort.recent => date(b).compareTo(date(a)),
        });
  }

  @override
  Widget build(BuildContext context) {
    // Only the lists, currency, month and accounts: other provider changes do not rebuild this screen.
    final lists = context.select<BudgetProvider, TransactionLists>((b) => b.transactionLists);
    final currency = context.select<BudgetProvider, String>((b) => b.monthInfo?.currencySymbol ?? kDefaultCurrencySymbol);
    final month = context.select<BudgetProvider, int?>((b) => b.monthInfo?.month);
    context.select<BudgetProvider, Object>((b) => Object.hash(b.bankAccounts, b.wallets, b.creditCards));
    final names = _accountNames(context.read<BudgetProvider>());
    final p = context.palette;
    final planned = _filters.planned;

    final paid = _filter(lists.recorded, names);
    _sortList(paid, planned: false);
    final plannedAll = lists.planned.where((t) => !_paying.contains(t.id)).toList();
    final status = _filters.status;
    final shownPlanned = _filter(plannedAll, names).where((t) => status == null || t.schedule == status).toList();
    _sortList(shownPlanned, planned: true);
    final overdue = plannedAll.where((t) => t.schedule == TxSchedule.overdue).length;
    final due = plannedAll.where((t) => t.schedule == TxSchedule.due).length;

    final chips = [
      if (_filters.accountId != null)
        (names[_filters.accountId] ?? 'Account', () => _filters.update(clearAccount: true)),
      if (planned && status != null) (_statusLabels[status]!, () => _filters.update(clearStatus: true)),
    ];

    final grouped = _sort == TxSort.recent || _sort == TxSort.oldest;
    final list = planned ? shownPlanned : paid;
    final bottom = MediaQuery.paddingOf(context).bottom + 16; // clears the dock

    return Scaffold(
      backgroundColor: p.bg,
      body: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            sliver: SliverList.list(children: [
              _searchCapsule(p),
              const SizedBox(height: 14),
              _tabs(p, paid.length, shownPlanned.length, overdue, due),
              if (chips.isNotEmpty)
                Wrap(spacing: 8, children: [for (final (label, clear) in chips) _filterChip(p, label, clear)]),
              const SizedBox(height: 14),
              if (!planned) ..._spendingShelf(p, lists.recorded, month, currency),
            ]),
          ),
          if (list.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(20, 60, 20, bottom),
                child: Column(children: [
                  Text(planned ? 'All settled' : 'Nothing here yet',
                      style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w600, color: p.textSecondary)),
                  const SizedBox(height: 4),
                  Text(planned ? 'No planned payments match this filter.' : 'No paid transactions match this filter.',
                      style: AppTypography.inter(fontSize: 13, color: p.textMuted)),
                ]),
              ),
            )
          else
            SliverPadding(
              padding: EdgeInsets.fromLTRB(10, 0, 10, bottom),
              sliver: SliverList.list(children: [
                for (final (i, g) in _groups(list, planned: planned, grouped: grouped).indexed) ...[
                  if (i > 0) const SizedBox(height: 6),
                  if (g.label != null) _dayHeader(p, g.label!, g.overdue),
                  for (final (j, tx) in g.items.indexed)
                    _rowShell(p, first: j == 0, last: j == g.items.length - 1,
                        child: planned
                            ? _plannedRow(context, p, tx, currency, names, grouped)
                            : _paidRow(context, p, tx, currency, names, lists, grouped)),
                ],
              ]),
            ),
        ],
      ),
    );
  }

  // ---- Search + sort capsule (web .apple-search-sort-capsule, 34 px) -------
  Widget _searchCapsule(AppPalette p) {
    // The row is 48 dp so the sort and clear buttons meet the tap-target size;
    // the capsule itself is drawn 34 px tall like web.
    return SizedBox(
      height: MinTap.size,
      child: Stack(alignment: Alignment.center, children: [
        Positioned(
          left: 0,
          right: 0,
          height: 34,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: p.surfaceSubtle,
              border: Border.all(color: p.border),
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        Row(children: [
          Padding(
            padding: const EdgeInsets.only(left: 11, right: 7),
            child: WebIcon(WebIcons.search, size: 14, color: p.textMuted),
          ),
          Expanded(
            child: TextField(
              key: const ValueKey('tx-search'),
              controller: _search,
              style: AppTypography.inter(fontSize: 16, color: p.text),
              decoration: InputDecoration(
                isCollapsed: true,
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                hintText: 'Search',
                hintStyle: AppTypography.inter(fontSize: 16, color: p.textMuted),
              ),
            ),
          ),
          if (_search.text.isNotEmpty)
            InkWell(
              customBorder: const CircleBorder(),
              onTap: _search.clear,
              child: MinTap(child: WebIcon(WebIcons.x, size: 12, color: p.textMuted, semanticLabel: 'Clear search')),
            ),
          Container(width: 1, height: 18, color: p.border),
          const SizedBox(width: 4),
          PopupMenuButton<TxSort>(
            key: const ValueKey('tx-sort'),
            tooltip: 'Sort transactions: ${_sortLabels[_sort]!.$1}',
            onSelected: (s) => setState(() => _sort = s),
            itemBuilder: (context) => [
              PopupMenuItem(
                enabled: false,
                height: 32,
                child: Text('SORT BY',
                    style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: p.textMuted)),
              ),
              for (final s in TxSort.values)
                PopupMenuItem(
                  value: s,
                  child: Row(children: [
                    Expanded(child: Text(_sortLabels[s]!.$1)),
                    if (s == _sort) WebIcon(WebIcons.check, size: 13, strokeWidth: 2.4, color: p.text),
                  ]),
                ),
            ],
            child: MinTap(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  WebIcon(WebIcons.arrowRightLeft, size: 12, color: p.textSecondary),
                  const SizedBox(width: 5),
                  Text(_sortLabels[_sort]!.$2,
                      style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w500, color: p.textSecondary)),
                  const SizedBox(width: 5),
                  WebIcon(WebIcons.chevronDown, size: 10, color: p.textSecondary),
                ]),
              ),
            ),
          ),
          const SizedBox(width: 4),
        ]),
      ]),
    );
  }

  // ---- Paid / Planned segmented control (web .tx-section-tabs-bar) ---------
  Widget _tabs(AppPalette p, int paidCount, int plannedCount, int overdue, int due) {
    Widget pill(String text, {required bool active, bool urgent = false}) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 6.5, vertical: 1.5),
          decoration: BoxDecoration(
            color: urgent ? p.badSubtle : (active ? p.text : p.surfaceSubtle),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(text,
              style: AppTypography.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: urgent ? p.bad : (active ? p.bg : p.textMuted),
              )),
        );
    Widget tab(String key, String label, bool active, Widget count, VoidCallback onTap) => Expanded(child: Semantics(
          selected: active,
          button: true,
          child: GestureDetector(
            key: ValueKey(key),
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            // 48 dp tall to tap; the visible tab is 34 inside the 42 bar.
            child: Container(
              height: MinTap.size,
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: active ? p.surface : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: active ? const [BoxShadow(color: Color(0x14000000), blurRadius: 3, offset: Offset(0, 1))] : null,
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(label,
                      style: AppTypography.inter(
                        fontSize: 13,
                        fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                        letterSpacing: 0.52,
                        color: active ? p.text : p.textSecondary,
                      )),
                  const SizedBox(width: 7),
                  count,
                ]),
              ),
            ),
          ),
        ));
    final planned = _filters.planned;
    final urgent = overdue > 0 ? '$overdue Overdue' : (due > 0 ? '$due Due' : null);
    return Stack(children: [
      Positioned(
        left: 0,
        right: 0,
        top: 3,
        bottom: 3,
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
          tab('tab-paid', 'Paid', !planned, pill('$paidCount', active: !planned), () => _filters.update(planned: false)),
          const SizedBox(width: 3),
          tab('tab-planned', 'Planned', planned,
              urgent != null ? pill(urgent, active: planned, urgent: true) : pill('$plannedCount', active: planned),
              () => _filters.update(planned: true)),
        ]),
      ),
    ]);
  }

  Widget _filterChip(AppPalette p, String label, VoidCallback clear) => Semantics(
        button: true,
        label: 'Remove filter $label',
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: clear,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: MinTap.size),
            child: Align(
              widthFactor: 1,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: p.indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(label, style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: p.indigo)),
                  const SizedBox(width: 6),
                  WebIcon(WebIcons.x, size: 11, color: p.indigo),
                ]),
              ),
            ),
          ),
        ),
      );

  // ---- "Spending in November › ▇▅▃ ₹X" (web .tx-spend-shelf) ---------------
  List<Widget> _spendingShelf(AppPalette p, List<Transaction> recorded, int? month, String currency) {
    final spend = spendByCategory(recorded);
    if (spend.total <= 0) return const [];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    final monthName = month != null && month >= 1 && month <= 12 ? monthNames[month - 1] : 'this month';
    return [
      Semantics(
        button: true,
        expanded: _showBreakdown,
        child: InkWell(
          key: const ValueKey('tx-spend-shelf'),
          borderRadius: BorderRadius.circular(14),
          onTap: () => setState(() => _showBreakdown = !_showBreakdown),
          child: Container(
            constraints: const BoxConstraints(minHeight: MinTap.size),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: p.surface,
              border: Border.all(color: p.border),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(children: [
              Expanded(
                child: Row(children: [
                  Flexible(
                    child: Text('Spending in $monthName',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w600, color: p.text)),
                  ),
                  const SizedBox(width: 10),
                  AnimatedRotation(
                    turns: _showBreakdown ? 0.25 : 0,
                    duration: const Duration(milliseconds: 150),
                    child: Text('›', style: AppTypography.inter(fontSize: 15, color: p.text)),
                  ),
                ]),
              ),
              SizedBox(
                height: 18,
                child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  for (final (i, c) in spend.categories.indexed) ...[
                    if (i > 0) const SizedBox(width: 3),
                    Container(
                      width: 6,
                      height: 18 * (c.total / spend.max).clamp(0.18, 1.0),
                      decoration: BoxDecoration(
                        color: p.indigo.withValues(alpha: 0.75),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ],
                ]),
              ),
              const SizedBox(width: 10),
              Text(formatCurrencyWhole(spend.total, symbol: currency),
                  style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w600, color: p.text)),
            ]),
          ),
        ),
      ),
      const SizedBox(height: 14),
      if (_showBreakdown) ...[
        Transform.translate(offset: const Offset(0, -4), child: _breakdown(p, spend, currency)),
        const SizedBox(height: 10),
      ],
    ];
  }

  /// Web's CategoryBreakdown on the paid list: all bars are paid (solid indigo).
  Widget _breakdown(AppPalette p, SpendByCategory spend, String currency) {
    return Container(
      key: const ValueKey('tx-category-breakdown'),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: p.surface,
        border: Border.all(color: p.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: Text('Spending by category',
                style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: p.text)),
          ),
          Text(formatCurrencyWhole(spend.total, symbol: currency),
              style: AppTypography.inter(fontSize: 17, fontWeight: FontWeight.w700, color: p.text)),
        ]),
        for (final c in spend.categories) ...[
          const SizedBox(height: 9),
          Row(children: [
            SizedBox(
              width: 80,
              child: Text(c.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w500, color: p.text)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Align(
                alignment: Alignment.centerLeft,
                child: FractionallySizedBox(
                  widthFactor: spend.max > 0 ? (c.total / spend.max).clamp(0.02, 1.0) : 0,
                  child: Container(
                    height: 10,
                    decoration: BoxDecoration(
                      color: p.indigo,
                      borderRadius: const BorderRadius.horizontal(right: Radius.circular(4)),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(formatCurrencyWhole(c.total, symbol: currency),
                style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: p.text)),
          ]),
        ],
      ]),
    );
  }

  // ---- Day-grouped list ---------------------------------------------------
  List<_DayGroup> _groups(List<Transaction> list, {required bool planned, required bool grouped}) {
    if (!grouped) return [_DayGroup(null, false, list)];
    final today = _today();
    final groups = <_DayGroup>[];
    final byKey = <String, _DayGroup>{};
    for (final tx in list) {
      final overdue = planned && tx.schedule == TxSchedule.overdue;
      final raw = planned ? tx.dueDate : tx.date;
      final day = raw.length >= 10 ? raw.substring(0, 10) : raw;
      final key = overdue ? 'overdue' : (day.isEmpty ? 'none' : day);
      var g = byKey[key];
      if (g == null) {
        g = _DayGroup(overdue ? 'Overdue' : (day.isEmpty ? 'No date' : dayLabel(day, today)), overdue, []);
        byKey[key] = g;
        overdue ? groups.insert(0, g) : groups.add(g);
      }
      g.items.add(tx);
    }
    return groups;
  }

  Widget _dayHeader(AppPalette p, String label, bool overdue) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 8, 4, 6),
        child: Semantics(
          header: true,
          child: Text(label.toUpperCase(),
              style: AppTypography.inter(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.6,
                color: overdue ? p.bad : p.textMuted,
              )),
        ),
      );

  /// One row of a day's inset group: rounded at the group's ends, hairline between.
  Widget _rowShell(AppPalette p, {required bool first, required bool last, required Widget child}) {
    const r = Radius.circular(14);
    final radius = BorderRadius.vertical(top: first ? r : Radius.zero, bottom: last ? r : Radius.zero);
    return Material(
      color: p.surface,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: DecoratedBox(
        decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: p.border))),
        child: child,
      ),
    );
  }

  Widget _tag(String text, Color fg, Color bg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(4)),
        child: Text(text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w600, height: 1.3, color: fg)),
      );

  Widget _rowBody(AppPalette p, {Widget? leading, required String title, required List<Widget> tags, required String caption,
      required Widget amount, required Widget menu, Color? titleColor}) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 58),
      child: Row(children: [
        // The 48 dp tap areas of the leading and trailing buttons sit where web's padding is.
        leading ?? const SizedBox(width: 14),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(
                  child: Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w500, color: titleColor ?? p.text)),
                ),
                for (final t in tags) ...[const SizedBox(width: 6), Flexible(child: t)],
              ]),
              const SizedBox(height: 2),
              Text(caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
            ]),
          ),
        ),
        const SizedBox(width: 10),
        amount,
        const SizedBox(width: 2),
        menu,
      ]),
    );
  }

  Widget _rowMenu(AppPalette p, String title, List<(String, bool, VoidCallback)> items) {
    if (items.isEmpty) return const SizedBox(width: MinTap.size);
    return PopupMenuButton<VoidCallback>(
      tooltip: 'Actions for $title',
      onSelected: (apply) => apply(),
      itemBuilder: (context) => [
        for (final (label, danger, apply) in items)
          PopupMenuItem(value: apply, child: Text(label, style: TextStyle(color: danger ? p.bad : null))),
      ],
      child: MinTap(child: _Dots(color: p.textMuted)),
    );
  }

  Widget _paidRow(BuildContext context, AppPalette p, Transaction tx, String currency, Map<String, String> names,
      TransactionLists lists, bool grouped) {
    final kind = tx.kind;
    final isTransfer = kind == TxKind.transfer;
    final isPassThrough = tx.isPassThrough;
    final isRefund = kind == TxKind.refund;
    final isCredit = tx.flow == MoneyFlow.moneyIn;
    final passTag = switch (tx.origin) {
      TxOrigin.heldIn => 'Held',
      TxOrigin.heldReturn => 'Returned',
      TxOrigin.lentOut => 'Lent',
      TxOrigin.lentRepaid => 'Repaid',
      _ => null,
    };
    final amount = formatCurrency(tx.displayAmount, symbol: currency);
    final title = isTransfer
        ? (tx.name.isEmpty ? 'Inter-Account Transfer' : tx.name)
        : [tx.name, tx.note, tx.category].firstWhere((s) => s.isNotEmpty, orElse: () => 'Transaction');
    final accountText = isTransfer
        ? '${names[tx.accountId] ?? 'Source'} → ${names[tx.destinationAccountId] ?? 'Destination'}'
        : (names[tx.accountId] ?? 'Default Account');
    final categoryText = isTransfer
        ? 'Transfer'
        : passTag ?? (tx.isIncome ? 'Income' : (tx.category.isEmpty ? 'Uncategorised' : tx.category));
    final caption = [
      accountText,
      categoryText,
      if (!grouped) formatDisplayDate(tx.date),
      if (tx.note.isNotEmpty && tx.note != tx.name) tx.note,
    ].join(' · ');
    Transaction? original;
    if (isRefund && tx.refundTargetTransactionId != null) {
      for (final o in lists.recorded) {
        if (o.id == tx.refundTargetTransactionId) original = o;
      }
    }
    final canEdit = canEditTransaction(tx);

    return SwipeRow(
      id: tx.id,
      onEdit: canEdit ? () => openEditTransaction(context, tx) : null,
      child: InkWell(
        onTap: () => showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (_) => TransactionDetailModal(transaction: tx),
        ),
        child: _rowBody(
          p,
          title: title,
          tags: [
            if (tx.origin == TxOrigin.goal) _tag('Goal', const Color(0xFF8B5CF6), const Color(0x1A8B5CF6)),
            if (passTag != null) _tag(passTag, p.indigo, p.indigo.withValues(alpha: 0.1)),
            if (isRefund && tx.refundTargetTransactionId != null)
              _tag('Refund for ${original?.name ?? 'an earlier spend'}', p.textMuted, p.surfaceSubtle),
          ],
          caption: caption,
          amount: Text(isTransfer ? amount : '${isCredit ? '+' : '-'}$amount',
              style: AppTypography.inter(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: isTransfer ? p.accent : (isCredit ? p.goodInk : p.text),
              )),
          menu: _rowMenu(p, title, [
            if (!isPassThrough && canEdit) ('Edit', false, () => openEditTransaction(context, tx)),
            ('Delete', true, () => _delete(context, tx)),
          ]),
        ),
      ),
    );
  }

  Widget _plannedRow(BuildContext context, AppPalette p, Transaction tx, String currency, Map<String, String> names, bool grouped) {
    final isOverdue = tx.schedule == TxSchedule.overdue;
    final isDue = tx.schedule == TxSchedule.due;
    final title = tx.name.isEmpty ? tx.category : tx.name;
    final caption = [
      names[tx.accountId] ?? 'Default Account',
      tx.isIncome ? 'Income' : (tx.category.isEmpty ? 'Uncategorised' : tx.category),
      if (!grouped || isOverdue) formatDisplayDate(tx.dueDate),
    ].join(' · ');
    final amount = tx.origin == TxOrigin.salary && tx.displayAmount == 0 ? '—' : formatCurrency(tx.displayAmount, symbol: currency);

    return SwipeRow(
      id: tx.id,
      onMarkPaid: () => _swipePay(context, tx),
      onEdit: canEditTransaction(tx) ? () => openEditTransaction(context, tx) : null,
      child: _rowBody(
        p,
        leading: InkWell(
          key: ValueKey('mark-paid-${tx.id}'),
          customBorder: const CircleBorder(),
          onTap: () => _openMarkPaidModal(context, tx),
          child: MinTap(
            child: Semantics(
              label: 'Mark Paid',
              button: true,
              child: Container(
                // Web shows the check only on hover; phones have none, so the ring is empty.
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: isOverdue ? p.bad : p.textMuted, width: 1.5),
                ),
              ),
            ),
          ),
        ),
        title: title,
        titleColor: isOverdue ? p.bad : null,
        tags: [
          if (isDue) _tag('Due', const Color(0xFFD97706), const Color(0x1FF59E0B)),
          if (tx.origin == TxOrigin.goal) _tag('Goal', const Color(0xFF8B5CF6), const Color(0x1A8B5CF6)),
        ],
        caption: caption,
        amount: Text(amount,
            style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w600, color: isOverdue ? p.bad : p.text)),
        menu: _rowMenu(p, title, [('Cancel', true, () => _handleCancelPlanned(context, tx))]),
      ),
    );
  }
}

/// Web's "⋯" trigger, drawn (the glyph is missing from some phone fonts).
class _Dots extends StatelessWidget {
  const _Dots({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 0; i < 3; i++) ...[
          if (i > 0) const SizedBox(width: 3),
          Container(width: 3.5, height: 3.5, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        ],
      ]);
}

class _DayGroup {
  _DayGroup(this.label, this.overdue, this.items);
  final String? label;
  final bool overdue;
  final List<Transaction> items;
}

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// Web's dayLabel: "Today · Mon 23", "Yesterday · Sun 22", "Tomorrow · Tue 24", else "Thu, Nov 5".
String dayLabel(String date, String today) {
  final d = DateTime.tryParse(date);
  final t = DateTime.tryParse(today);
  if (d == null || t == null) return 'No date';
  final diff = DateTime.utc(d.year, d.month, d.day).difference(DateTime.utc(t.year, t.month, t.day)).inDays;
  final wd = _weekdays[d.weekday - 1];
  final short = '$wd ${d.day}';
  return switch (diff) {
    0 => 'Today · $short',
    -1 => 'Yesterday · $short',
    1 => 'Tomorrow · $short',
    _ => '$wd, ${_monthsShort[d.month - 1]} ${d.day}',
  };
}

class SpendCategory {
  const SpendCategory(this.name, this.total);
  final String name;
  final int total;
}

class SpendByCategory {
  const SpendByCategory(this.total, this.max, this.categories);
  final int total;
  final int max;
  final List<SpendCategory> categories;
}

/// Web's "Spending in {Month}": paid spends (no income, transfers, held/lent
/// or refunds) by category, largest first, top 5 plus "Other"
/// (engine groupSpendByCategory).
SpendByCategory spendByCategory(List<Transaction> recorded, {int topN = 5}) {
  final byKey = <String, (String, int)>{};
  for (final t in recorded) {
    if (t.kind != TxKind.expense || t.amount <= 0) continue;
    final name = t.category.trim().isEmpty ? 'Uncategorised' : t.category.trim();
    final key = name.toLowerCase();
    final prev = byKey[key];
    byKey[key] = (prev?.$1 ?? name, (prev?.$2 ?? 0) + t.amount);
  }
  var cats = byKey.values.map((e) => SpendCategory(e.$1, e.$2)).toList()
    ..sort((a, b) => b.total != a.total ? b.total - a.total : a.name.compareTo(b.name));
  final total = cats.fold(0, (s, c) => s + c.total);
  if (cats.length > topN + 1) {
    cats = [...cats.take(topN), SpendCategory('Other', cats.skip(topN).fold(0, (s, c) => s + c.total))];
  }
  return SpendByCategory(total, cats.fold(0, (m, c) => c.total > m ? c.total : m), cats);
}
