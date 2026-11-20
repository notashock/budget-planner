import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../engine/engine.dart';
import '../models/account.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../modals/card_modals.dart';

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
      return context.palette.bad;
    case 'tight':
      return context.palette.warn;
    default:
      return context.palette.good;
  }
}

/// Credit cards (ADR 0070): what is owed, bills to confirm or pay, and the
/// Card Payability Score with what to do about it.
class CardsSection extends StatefulWidget {
  const CardsSection({super.key});

  @override
  State<CardsSection> createState() => _CardsSectionState();
}

class _CardsSectionState extends State<CardsSection> {
  List<CreditCardSummary> _cards = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
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
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => child,
    );
    if (saved == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final muted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    // The payability score comes with the month simulation, the bills with /cards.
    final scores = <String, CardPayability>{
      for (final c in budget.simulatedCards)
        if (c.payability != null) c.account.id: c.payability!,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(child: Text('Credit cards', style: AppTypography.cardTitle(color: text))),
            TextButton.icon(
              icon: const Icon(Icons.add, size: 15),
              label: Text('Add card', style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600)),
              onPressed: () => _sheet(const AddCardModal()),
            ),
          ],
        ),
        Text('Swipes count on the day and are set aside from Safe-to-Spend. Paying the bill isn\'t counted again.',
            style: TextStyle(fontSize: 12, color: muted)),
        const SizedBox(height: 10),
        if (_error != null) Text(_error!, style: TextStyle(color: context.palette.bad, fontSize: 12)),
        if (_cards.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text('No cards yet.', style: TextStyle(fontSize: 13, color: muted)),
          )
        else
          ..._cards.map((card) {
            final account = card.account;
            final id = account.id;
            final owed = card.outstanding;
            final limit = account.creditLimit ?? 0;
            final util = limit > 0 ? (owed / limit).clamp(0.0, 1.0) : null;
            final bill = card.openBill;
            // A new bill is confirmed first. (The old code looked for `isDraft` on
            // the statement, which only the open bill carries, so Confirm never showed.)
            final draft = card.draftToConfirm;
            final score = scores[id];
            final overdue = bill?.isOverdue ?? false;

            return Container(
              key: ValueKey('card-$id'),
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: surface, border: Border.all(color: border), borderRadius: BorderRadius.circular(10)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.credit_card, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(account.name.isEmpty ? 'Card' : account.name,
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w600, color: text)),
                    ),
                    Flexible(
                      child: Text(
                        'Bill day ${account.statementDay ?? '—'} · due day ${account.dueDay ?? '—'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11, color: muted),
                      ),
                    ),
                    IconButton(
                      key: ValueKey('edit-card-$id'),
                      tooltip: 'Edit card',
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      onPressed: () => _sheet(AddCardModal(card: card)),
                    ),
                  ]),
                  const SizedBox(height: 10),
                  Text('OWED NOW', style: AppTypography.sectionHeader(color: muted)),
                  Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(formatCurrencyWhole(owed), style: AppTypography.cardTitle(color: text)),
                    if (limit > 0) ...[
                      const SizedBox(width: 6),
                      Text('of ${formatCurrencyWhole(limit)}', style: TextStyle(fontSize: 12, color: muted)),
                    ],
                  ]),
                  if (util != null) ...[
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: util,
                        minHeight: 6,
                        backgroundColor: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                        color: util > 0.8 ? context.palette.bad : (util > 0.5 ? context.palette.warn : text),
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Text(
                    'This cycle ${formatCurrencyWhole(card.unbilledSoFar)} · next bill ${_shortDate(card.cycleEnd)} · due ${_shortDate(card.cycleDueDate)}',
                    style: TextStyle(fontSize: 12, color: muted),
                  ),
                  if (bill != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: overdue ? context.palette.badSubtle : (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(children: [
                        Expanded(
                          child: Text(
                            draft != null
                                ? 'Bill ready: ${formatCurrencyWhole(draft.billAmount)}, due ${_shortDate(bill.dueDate)}'
                                : '${overdue ? 'Overdue' : 'Bill due'}: ${formatCurrencyWhole(bill.remaining)} by ${_shortDate(bill.dueDate)}',
                            style: TextStyle(fontSize: 12, color: overdue ? context.palette.bad : text),
                          ),
                        ),
                        TextButton(
                          key: ValueKey('card-bill-action-$id'),
                          onPressed: () => draft != null
                              ? _sheet(ConfirmBillModal(card: card, statement: draft))
                              : _sheet(PayBillModal(card: card, bill: bill)),
                          child: Text(draft != null ? 'Confirm' : 'Pay bill'),
                        ),
                      ]),
                    ),
                  ],
                  if (score != null) ...[
                    const SizedBox(height: 10),
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SizedBox(
                        width: 44,
                        height: 44,
                        child: Stack(alignment: Alignment.center, children: [
                          CircularProgressIndicator(
                            value: score.score / 100,
                            strokeWidth: 5,
                            backgroundColor: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                            color: _bandColor(context, score.band),
                          ),
                          Text('${score.score}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: text)),
                        ]),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Payability: ${score.bandLabel}',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _bandColor(context, score.band))),
                          const SizedBox(height: 2),
                          Text(score.statement, style: TextStyle(fontSize: 12, color: muted, height: 1.4)),
                        ]),
                      ),
                    ]),
                  ],
                ],
              ),
            );
          }),
      ],
    );
  }
}
