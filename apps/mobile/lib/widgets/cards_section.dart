import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../engine/engine.dart';
import '../models/account.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../modals/card_modals.dart';
import 'acct_inset.dart';
import 'web_icons.dart';

String _shortDate(String? iso) {
  final s = iso ?? '';
  final parts = s.split('-');
  if (parts.length != 3) return s.isEmpty ? '—' : s;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final m = int.tryParse(parts[1]) ?? 1;
  return '${int.tryParse(parts[2]) ?? parts[2]} ${months[(m - 1).clamp(0, 11)]}';
}

Color _bandColor(BuildContext context, String? band) {
  switch (band) {
    case 'over':
      return context.palette.badInk;
    case 'tight':
      return context.palette.warnInk;
    default:
      return context.palette.goodInk;
  }
}

/// Credit cards (ADR 0070): what is owed, bills to confirm or pay, and the
/// Card Payability Score with what to do about it.
class CardsSection extends StatefulWidget {
  const CardsSection({super.key, this.reload});

  /// Reloads the cards when it changes (the Accounts header's ＋ menu adds one).
  final Listenable? reload;

  @override
  State<CardsSection> createState() => _CardsSectionState();
}

/// Web's CardsPanel: "CARDS" over inset rows that expand in place.
class _CardsSectionState extends State<CardsSection> {
  List<CreditCardSummary> _cards = [];
  String? _error;
  String? _expanded;

  @override
  void initState() {
    super.initState();
    widget.reload?.addListener(_load);
    _load();
  }

  @override
  void dispose() {
    widget.reload?.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await Provider.of<BudgetProvider>(context, listen: false).getCardSummaries();
      if (!mounted) return;
      setState(() {
        _cards = list;
        _error = null;
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load cards.');
    }
  }

  Future<void> _sheet(Widget child) async {
    final saved = await showModalBottomSheet<Object>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => child,
    );
    if (saved != true && saved != 'pay') return;
    await _load();
    if (saved == 'pay' && child is ConfirmBillModal && mounted) {
      final fresh = _cards.where((c) => c.account.id == child.card.account.id).firstOrNull;
      if (fresh?.openBill != null) await _sheet(PayBillModal(card: fresh!, bill: fresh.openBill!));
    }
  }

  static String _money(int minor) => formatCurrency(minor, digits: MoneyDigits.auto);
  static String _day(String? iso) => iso == null || iso.isEmpty ? '—' : _shortDate(iso);

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final p = context.palette;

    // The payability score comes with the month simulation, the bills with /cards.
    final scores = <String, CardPayability>{
      for (final c in budget.simulatedCards)
        if (c.payability != null) c.account.id: c.payability!,
    };

    return AcctSection(
      title: 'Cards',
      foot: 'Card spending counts on the day you swipe. Paying the bill moves money from your bank and isn’t counted again.',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!, style: TextStyle(color: p.badInk, fontSize: 12)),
          ),
        if (_cards.isEmpty)
          AcctEmpty(label: 'Add a credit card', onAdd: () => _sheet(const AddCardModal()))
        else
          AcctInset(children: [for (final card in _cards) _row(context, p, card, scores[card.account.id])]),
      ]),
    );
  }

  Widget _row(BuildContext context, AppPalette p, CreditCardSummary card, CardPayability? score) {
    final id = card.account.id;
    final owed = card.outstanding;
    final limit = card.account.creditLimit ?? 0;
    final util = limit > 0 ? (owed / limit).clamp(0.0, 1.0) : null;
    final bill = card.openBill;
    // A new bill is confirmed first.
    final draft = card.draftToConfirm;
    final overdue = draft == null && (bill?.isOverdue ?? false);
    final (String caption, Color? tone) = bill != null && draft != null
        ? ('Bill ready to check · due ${_day(bill.dueDate)}', p.warnInk)
        : bill != null && bill.isOverdue
            ? ('Overdue since ${_day(bill.dueDate)}', p.bad)
            : bill != null
                ? ('Bill ${_money(bill.remaining)} · due ${_day(bill.dueDate)}', null)
                : ('Next bill ${_day(card.cycleEnd)}', null);
    final open = _expanded == id;
    String billText(CardBill b) {
      if (draft != null) return 'Bill ready: ${_money(b.amount)}, due ${_day(b.dueDate)}. Check it against your bank.';
      final min = b.minimumDue;
      final minText = min != null && min > 0 ? ' (minimum ${_money(min < b.remaining ? min : b.remaining)})' : '';
      return '${b.isOverdue ? 'Overdue: ' : 'Bill due '}${_money(b.remaining)}${b.isOverdue ? ' since ' : ' by '}${_day(b.dueDate)}$minText';
    }

    return AcctRow(
      key: ValueKey('card-$id'),
      icon: AcctIconKind.card,
      title: card.account.name.isEmpty ? 'Card' : card.account.name,
      caption: caption,
      captionColor: tone,
      amount: '${owed > 0 ? '−' : ''}${_money(owed)}',
      open: open,
      onTap: () => setState(() => _expanded = open ? null : id),
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('OWED NOW', style: AppTypography.inter(fontSize: 11, letterSpacing: 0.44, color: p.textSecondary)),
        Wrap(crossAxisAlignment: WrapCrossAlignment.end, spacing: 8, children: [
          Text(_money(owed), style: AppTypography.inter(fontSize: 20, fontWeight: FontWeight.w600, color: p.text)),
          if (limit > 0) Text('of ${_money(limit)} limit', style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
        ]),
        if (util != null) ...[
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: util,
              minHeight: 6,
              backgroundColor: p.surfaceSubtle,
              color: util > 0.8 ? p.bad : (util > 0.5 ? p.warn : p.text),
            ),
          ),
        ],
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          for (final (label, value) in [
            ('Spent this cycle', _money(card.unbilledSoFar)),
            ('Next bill', _day(card.cycleEnd)),
            ('That bill is due', _day(card.cycleDueDate)),
          ])
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: AppTypography.inter(fontSize: 11, color: p.textMuted)),
                const SizedBox(height: 2),
                Text(value, style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w500, color: p.text)),
              ]),
            ),
        ]),
        if (bill != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: overdue ? p.badSubtle : p.surfaceSubtle,
              border: Border.all(color: overdue ? p.bad.withValues(alpha: 0.3) : p.border),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(children: [
              Expanded(
                child: Text(billText(bill),
                    style: AppTypography.inter(fontSize: 12, color: overdue ? p.badInk : p.textSecondary)),
              ),
              const SizedBox(width: 12),
              AcctButton(
                draft != null ? 'Confirm' : 'Pay bill',
                key: ValueKey('card-bill-action-$id'),
                primary: true,
                onPressed: () => draft != null
                    ? _sheet(ConfirmBillModal(card: card, statement: draft))
                    : _sheet(PayBillModal(card: card, bill: bill)),
              ),
            ]),
          ),
        ],
        if (score != null) ...[
          const SizedBox(height: 12),
          Divider(height: 1, color: p.borderSubtle),
          const SizedBox(height: 12),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(
              width: 56,
              height: 56,
              child: Stack(fit: StackFit.expand, children: [
                CircularProgressIndicator(
                  value: score.score / 100,
                  strokeWidth: 6,
                  strokeCap: StrokeCap.round,
                  backgroundColor: p.surfaceSubtle,
                  color: _bandColor(context, score.band),
                ),
                Center(
                  child: Text('${score.score}',
                      style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w700, color: p.text)),
                ),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Payability: ${score.bandLabel}',
                    style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: _bandColor(context, score.band))),
                const SizedBox(height: 2),
                Text(score.statement, style: AppTypography.inter(fontSize: 12, height: 1.5, color: p.textSecondary)),
              ]),
            ),
          ]),
        ],
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: AcctButton('Edit card',
              key: ValueKey('edit-card-$id'), icon: WebIcons.edit, onPressed: () => _sheet(AddCardModal(card: card))),
        ),
      ]),
    );
  }
}
