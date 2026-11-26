import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../models/person_fund.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../modals/held_lent_modal.dart';

/// Held & Lent: money you hold for others and money others owe you (ADR 0069).
/// Neither is income or spending; money you hold is kept out of Safe-to-Spend.
class HeldLentSection extends StatefulWidget {
  const HeldLentSection({super.key});

  @override
  State<HeldLentSection> createState() => _HeldLentSectionState();
}

class _HeldLentSectionState extends State<HeldLentSection> {
  List<PersonFund> _funds = [];
  int _held = 0;
  int _lent = 0;
  bool _showSettled = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await Provider.of<BudgetProvider>(context, listen: false).getPersonFundsTyped();
      if (!mounted) return;
      setState(() {
        _funds = res.funds;
        _held = res.totalHeld;
        _lent = res.totalLent;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not load people.');
    }
  }

  Future<void> _open({String action = 'hold', String? fundId}) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => HeldLentModal(initialAction: action, initialFundId: fundId),
    );
    if (saved == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final muted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    final open = _funds.where((f) => f.status != FundStatus.settled).toList();
    final settledCount = _funds.length - open.length;
    final visible = _showSettled ? _funds : open;

    Widget total(String label, int amount, String note) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border.all(color: border),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label.toUpperCase(), style: AppTypography.sectionHeader(color: muted)),
                const SizedBox(height: 4),
                Text(formatCurrencyWhole(amount), style: AppTypography.cardTitle(color: text)),
                const SizedBox(height: 2),
                Text(note, style: TextStyle(fontSize: 11, color: muted)),
              ],
            ),
          ),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Held & Lent', style: AppTypography.cardTitle(color: text)),
            TextButton.icon(
              icon: const Icon(Icons.add, size: 15),
              label: Text('New entry', style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600)),
              onPressed: () => _open(),
            ),
          ],
        ),
        Text('Not income or spending.', style: TextStyle(fontSize: 12, color: muted)),
        const SizedBox(height: 10),
        Row(
          children: [
            total('You hold', _held, 'Kept out of Safe-to-Spend'),
            const SizedBox(width: 10),
            total('Owed to you', _lent, "Not counted until it's back"),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: TextStyle(color: context.palette.badInk, fontSize: 12)),
        ],
        const SizedBox(height: 10),
        if (visible.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              _funds.isEmpty ? 'Nothing here yet.' : 'Everything is settled.',
              style: TextStyle(fontSize: 13, color: muted),
            ),
          )
        else
          ...visible.map((f) {
            final isHeld = f.direction == FundDirection.held;
            final settled = f.status == FundStatus.settled;
            final out = f.outstanding;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                color: surface,
                border: Border.all(color: border),
                borderRadius: BorderRadius.circular(10),
              ),
              child: ListTile(
                leading: const CircleAvatar(radius: 16, child: Icon(Icons.person_outline, size: 16)),
                title: Text(f.personName, style: TextStyle(color: text, fontWeight: FontWeight.w500)),
                subtitle: Text(
                  settled ? 'Settled' : (isHeld ? 'You hold their money' : 'Owes you'),
                  style: TextStyle(fontSize: 12, color: muted),
                ),
                trailing: Text(
                  formatCurrencyWhole(out < 0 ? 0 : out),
                  style: TextStyle(fontWeight: FontWeight.w600, color: settled ? muted : (isHeld ? context.palette.indigo : text)),
                ),
                onTap: settled
                    ? () => _open(action: isHeld ? 'hold' : 'lend', fundId: f.id)
                    : () => _open(action: isHeld ? 'return' : 'repaid', fundId: f.id),
              ),
            );
          }),
        if (settledCount > 0)
          TextButton(
            onPressed: () => setState(() => _showSettled = !_showSettled),
            child: Text(_showSettled ? 'Hide settled' : 'Show settled ($settledCount)'),
          ),
      ],
    );
  }
}
