import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../models/person_fund.dart';
import '../theme/app_palette.dart';
import '../modals/held_lent_modal.dart';
import 'acct_inset.dart';

/// Held & Lent: money you hold for others and money others owe you (ADR 0069).
/// Neither is income or spending; money you hold is kept out of Safe-to-Spend.
/// Web's PeoplePanel: "PEOPLE" over inset rows that expand to their actions.
class HeldLentSection extends StatefulWidget {
  const HeldLentSection({super.key, this.reload});

  /// Reloads when it changes (the Accounts header's ＋ menu adds a person).
  final Listenable? reload;

  @override
  State<HeldLentSection> createState() => _HeldLentSectionState();
}

class _HeldLentSectionState extends State<HeldLentSection> {
  List<PersonFund> _funds = [];
  int _held = 0;
  int _lent = 0;
  bool _showSettled = false;
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

  static String _money(int minor) => formatCurrency(minor, digits: MoneyDigits.auto);

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final open = _funds.where((f) => f.status != FundStatus.settled).toList();
    final settledCount = _funds.length - open.length;
    final visible = _showSettled ? _funds : open;
    final today = DateTime.now().toIso8601String().substring(0, 10);
    final totals = [
      if (_held > 0) 'You hold ${_money(_held)} for others (kept out of Safe-to-Spend)',
      if (_lent > 0) 'others owe you ${_money(_lent)}',
    ].join(' and ');

    return AcctSection(
      title: 'People',
      foot: totals.isEmpty ? null : '${totals[0].toUpperCase()}${totals.substring(1)}. Never counted as income or spending.',
      after: settledCount > 0
          ? Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _showSettled = !_showSettled),
                child: Text(_showSettled ? 'Hide settled' : 'Show settled ($settledCount)'),
              ),
            )
          : null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!, style: TextStyle(color: p.badInk, fontSize: 12)),
          ),
        if (visible.isEmpty)
          _funds.isNotEmpty
              ? const AcctEmpty(label: 'Everything is settled.')
              : AcctEmpty(label: 'Money you hold for someone or lent out', onAdd: () => _open())
        else
          AcctInset(children: [
            for (final f in visible)
              () {
                final isHeld = f.direction == FundDirection.held;
                final settled = f.status == FundStatus.settled;
                final by = f.expectedSettleDate;
                final late = !settled && by != null && by.compareTo(today) < 0;
                final caption = settled
                    ? 'Settled'
                    : '${isHeld ? 'You hold their money' : 'Owes you'}'
                        '${by != null ? ' · ${isHeld ? 'give back by' : 'back by'} ${formatDisplayDate(by, includeWeekday: false)}' : ''}';
                final isOpen = _expanded == f.id;
                return AcctRow(
                  key: ValueKey('person-${f.id}'),
                  icon: AcctIconKind.person,
                  title: f.personName,
                  caption: caption,
                  captionColor: late ? p.bad : null,
                  amount: _money(f.outstanding < 0 ? 0 : f.outstanding),
                  amountColor: settled ? p.textMuted : (isHeld ? p.indigo : p.text),
                  open: isOpen,
                  onTap: () => setState(() => _expanded = isOpen ? null : f.id),
                  body: Wrap(spacing: 8, runSpacing: 8, children: [
                    if (isHeld) ...[
                      if (f.outstanding > 0)
                        AcctButton('Return money', primary: true, onPressed: () => _open(action: 'return', fundId: f.id)),
                      AcctButton('Received more', onPressed: () => _open(action: 'hold', fundId: f.id)),
                    ] else ...[
                      if (f.outstanding > 0)
                        AcctButton('Got money back', primary: true, onPressed: () => _open(action: 'repaid', fundId: f.id)),
                      AcctButton('Lent more', onPressed: () => _open(action: 'lend', fundId: f.id)),
                    ],
                  ]),
                );
              }(),
          ]),
      ]),
    );
  }
}
