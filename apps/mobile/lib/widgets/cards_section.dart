import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../modals/card_modals.dart';

int _int(dynamic v) => (num.tryParse('${v ?? 0}') ?? 0).round();

String _shortDate(dynamic iso) {
  final s = iso?.toString() ?? '';
  final parts = s.split('-');
  if (parts.length != 3) return s.isEmpty ? '—' : s;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final m = int.tryParse(parts[1]) ?? 1;
  return '${int.tryParse(parts[2]) ?? parts[2]} ${months[(m - 1).clamp(0, 11)]}';
}

Color _bandColor(String? band) {
  switch (band) {
    case 'over':
      return AppColors.red;
    case 'tight':
      return AppColors.amber;
    default:
      return AppColors.green;
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
  List<Map<String, dynamic>> _cards = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await Provider.of<BudgetProvider>(context, listen: false).getCards();
      if (!mounted) return;
      setState(() {
        _cards = list.map((c) => Map<String, dynamic>.from(c as Map)).toList();
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
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final muted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    final scores = <String, Map<String, dynamic>>{};
    for (final c in budget.creditCards) {
      final m = Map<String, dynamic>.from(c as Map);
      if (m['payability'] is Map) scores[m['id'].toString()] = Map<String, dynamic>.from(m['payability'] as Map);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Credit cards', style: AppTypography.cardTitle(color: text)),
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
        if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.red, fontSize: 12)),
        if (_cards.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text('No cards yet.', style: TextStyle(fontSize: 13, color: muted)),
          )
        else
          ..._cards.map((card) {
            final id = card['id'].toString();
            final owed = _int(card['outstanding']);
            final limit = _int(card['creditLimit']);
            final util = limit > 0 ? (owed / limit).clamp(0.0, 1.0) : null;
            final bill = card['openBill'] is Map ? Map<String, dynamic>.from(card['openBill'] as Map) : null;
            final statements = card['statements'] is List ? card['statements'] as List : [];
            Map<String, dynamic>? draft;
            for (final st in statements) {
              final m = Map<String, dynamic>.from(st as Map);
              if (bill != null && m['id'] == bill['statementId'] && m['isDraft'] == true) draft = m;
            }
            final score = scores[id];
            final overdue = bill?['isOverdue'] == true;

            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: surface, border: Border.all(color: border), borderRadius: BorderRadius.circular(10)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.credit_card, size: 18),
                    const SizedBox(width: 8),
                    Expanded(child: Text(card['name']?.toString() ?? 'Card', style: TextStyle(fontWeight: FontWeight.w600, color: text))),
                    Text('Bill day ${card['statementDay']} · due day ${card['dueDay']}', style: TextStyle(fontSize: 11, color: muted)),
                    IconButton(
                      key: ValueKey('edit-card-$id'),
                      tooltip: 'Edit card',
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      onPressed: () => _sheet(AddCardModal(card: Map<String, dynamic>.from(card as Map))),
                    ),
                  ]),
                  const SizedBox(height: 10),
                  Text('OWED NOW', style: AppTypography.sectionHeader(color: muted)),
                  Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(formatCurrency(owed), style: AppTypography.cardTitle(color: text)),
                    if (limit > 0) ...[
                      const SizedBox(width: 6),
                      Text('of ${formatCurrency(limit)}', style: TextStyle(fontSize: 12, color: muted)),
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
                        color: util > 0.8 ? AppColors.red : (util > 0.5 ? AppColors.amber : text),
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Text(
                    'This cycle ${formatCurrency(_int(card['unbilledSoFar']))} · next bill ${_shortDate(card['cycleEnd'])} · due ${_shortDate(card['cycleDueDate'])}',
                    style: TextStyle(fontSize: 12, color: muted),
                  ),
                  if (bill != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: overdue ? AppColors.redSubtle : (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(children: [
                        Expanded(
                          child: Text(
                            draft != null
                                ? 'Bill ready: ${formatCurrency(_int(bill['amount']))}, due ${_shortDate(bill['dueDate'])}'
                                : '${overdue ? 'Overdue' : 'Bill due'}: ${formatCurrency(_int(bill['remaining']))} by ${_shortDate(bill['dueDate'])}',
                            style: TextStyle(fontSize: 12, color: overdue ? AppColors.red : text),
                          ),
                        ),
                        TextButton(
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
                            value: _int(score['score']) / 100,
                            strokeWidth: 5,
                            backgroundColor: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                            color: _bandColor(score['band']?.toString()),
                          ),
                          Text('${_int(score['score'])}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: text)),
                        ]),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Payability: ${score['bandLabel'] ?? ''}',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _bandColor(score['band']?.toString()))),
                          const SizedBox(height: 2),
                          Text(score['statement']?.toString() ?? '', style: TextStyle(fontSize: 12, color: muted, height: 1.4)),
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
