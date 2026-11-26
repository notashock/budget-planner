import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../models/person_fund.dart';
import '../theme/app_palette.dart';
import '../modals/held_lent_modal.dart';
import '../modals/person_edit_sheets.dart';
import 'acct_inset.dart';
import 'confirm_dialog.dart';
import 'min_tap.dart';

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

  /// Entries per person, loaded when their row opens (web's PeoplePanel).
  final Map<String, List<Map<String, dynamic>>> _entries = {};

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

  Future<void> _loadEntries(String fundId) async {
    List<Map<String, dynamic>> list;
    try {
      final full = await Provider.of<BudgetProvider>(context, listen: false).getPersonFund(fundId);
      list = [for (final e in (full['entries'] as List? ?? const [])) Map<String, dynamic>.from(e as Map)];
    } catch (_) {
      list = [];
    }
    if (mounted) setState(() => _entries[fundId] = list);
  }

  void _toggle(PersonFund f) {
    if (_expanded == f.id) return setState(() => _expanded = null);
    setState(() => _expanded = f.id);
    _loadEntries(f.id);
  }

  /// After any change: reload the list, keep the open person open with fresh entries.
  Future<void> _saved() async {
    _entries.clear();
    await _load();
    if (_expanded != null) await _loadEntries(_expanded!);
  }

  Future<void> _sheet(Widget child) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => child,
    );
    if (saved == true) await _saved();
  }

  Future<void> _open({String action = 'hold', String? fundId}) =>
      _sheet(HeldLentModal(initialAction: action, initialFundId: fundId));

  /// Runs a confirmed delete; a failure shows in a SnackBar like web's inline error.
  Future<void> _delete({required String title, required String body, required Future<void> Function() run}) async {
    if (!await confirmDestructive(context, title: title, message: body, cancelLabel: 'Cancel')) return;
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await run();
      await _saved();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.toString().isEmpty ? 'Could not delete.' : e.toString())));
    }
  }

  Future<void> _deletePerson(PersonFund f) => _delete(
        title: 'Delete ${f.personName}?',
        body: f.entryCount > 0
            ? 'Their entries are deleted too, and every balance they touched goes back. This can’t be undone.'
            : 'This can’t be undone.',
        run: () async {
          await Provider.of<BudgetProvider>(context, listen: false).deletePersonFund(f.id, withEntries: true);
          _expanded = null;
        },
      );

  Future<void> _deleteEntry(Map<String, dynamic> e) => _delete(
        title: 'Delete “${_verb(e)}” of ${_money(_abs(e))}?',
        body: 'The account balance it moved goes back. This can’t be undone.',
        run: () => Provider.of<BudgetProvider>(context, listen: false).deleteTransaction('${e['id'] ?? e['_id']}'),
      );

  static String _verb(Map<String, dynamic> e) => heldLentVerb[e['origin']] ?? '${e['name'] ?? ''}';
  static int _abs(Map<String, dynamic> e) => ((e['amount'] as num?) ?? 0).toInt().abs();
  static String _day(Map<String, dynamic> e) => formatDisplayDate('${e['date'] ?? ''}', includeWeekday: false);

  Widget _menu(String label, List<(String, bool, VoidCallback)> items, {Key? key}) => PopupMenuButton<VoidCallback>(
        key: key,
        tooltip: label,
        onSelected: (run) => run(),
        itemBuilder: (_) => [
          for (final (text, danger, run) in items)
            PopupMenuItem(
              value: run,
              child: Text(text, style: danger ? TextStyle(color: context.palette.bad) : null),
            ),
        ],
        child: const MinTap(child: AcctDots()),
      );

  Widget _body(PersonFund f, bool isHeld) {
    final p = context.palette;
    final list = _entries[f.id]?.where((e) => e['status'] != 'cancelled').toList();
    final muted = TextStyle(fontSize: 12, color: p.textMuted);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Expanded(
          child: Wrap(spacing: 8, runSpacing: 8, children: [
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
        ),
        _menu('More actions for ${f.personName}', key: ValueKey('person-menu-${f.id}'), [
          ('Edit details', false, () => _sheet(PersonEditSheet(fund: f))),
          ('Delete person', true, () => _deletePerson(f)),
        ]),
      ]),
      if ((f.note ?? '').isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(f.note!, style: TextStyle(fontSize: 13, color: p.textSecondary)),
        ),
      const SizedBox(height: 6),
      if (list == null)
        Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text('Loading…', style: muted))
      else if (list.isEmpty)
        Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text('No entries yet.', style: muted))
      else
        for (final e in list)
          Row(key: ValueKey('hl-entry-${e['id'] ?? e['_id']}'), children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${_verb(e)}${e['status'] == 'planned' ? ' (planned)' : ''}', style: TextStyle(fontSize: 13, color: p.text)),
                Text(_day(e), style: muted),
              ]),
            ),
            Text(
              '${e['origin'] == 'held_in' || e['origin'] == 'lent_repaid' ? '+' : '−'}${_money(_abs(e))}',
              style: TextStyle(fontSize: 13, color: p.text, fontFeatures: const [FontFeature.tabularFigures()]),
            ),
            _menu('Actions for ${_verb(e)} on ${_day(e)}', key: ValueKey('hl-entry-menu-${e['id'] ?? e['_id']}'), [
              ('Edit', false, () => _sheet(HeldLentEntryEditSheet(entry: e))),
              ('Delete', true, () => _deleteEntry(e)),
            ]),
          ]),
    ]);
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
                  onTap: () => _toggle(f),
                  body: _body(f, isHeld),
                );
              }(),
          ]),
      ]),
    );
  }
}
