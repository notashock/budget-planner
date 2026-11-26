import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../engine/engine.dart';
import '../models/person_fund.dart';
import '../models/transaction.dart';
import '../providers/budget_provider.dart';
import '../theme/app_form.dart';
import '../theme/app_palette.dart';

/// Web's rule: a goal, salary, transfer or held/lent row can't be moved.
bool canMoveToHeldLent(Transaction t) =>
    !t.isPassThrough && t.kind != TxKind.transfer && t.origin != TxOrigin.salary && !t.isFromGoal;

Future<void> showReclassifyHeldLent(BuildContext context, Transaction t) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ReclassifyHeldLentSheet(transaction: t),
    );

/// Web's ReclassifyHeldLentModal: an income or spend logged the old way becomes
/// held or lent money, so it stops counting (ADR 0069). The cash direction stays.
class ReclassifyHeldLentSheet extends StatefulWidget {
  const ReclassifyHeldLentSheet({super.key, required this.transaction});
  final Transaction transaction;

  @override
  State<ReclassifyHeldLentSheet> createState() => _ReclassifyHeldLentSheetState();
}

class _ReclassifyHeldLentSheetState extends State<ReclassifyHeldLentSheet> {
  static const _newPerson = '__new__';
  late final bool _cashIn = widget.transaction.kind == TxKind.income || widget.transaction.kind == TxKind.refund;
  late FundDirection _direction = _cashIn ? FundDirection.held : FundDirection.lent;
  List<PersonFund> _funds = const [];
  String _fundId = _newPerson;
  final _name = TextEditingController();
  String _error = '';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    context.read<BudgetProvider>().getPersonFundsTyped().then((f) {
      if (mounted) setState(() => _funds = f.funds);
    }).catchError((Object _) {});
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  String _meaning(FundDirection d) => switch (d) {
        FundDirection.held => _cashIn ? 'Someone gave you money to keep' : 'You gave back money you were keeping',
        FundDirection.lent => _cashIn ? 'Someone paid back money you lent' : 'You lent this money to someone',
      };

  Future<void> _submit() async {
    setState(() => _error = '');
    if (_fundId == _newPerson && _name.text.trim().isEmpty) {
      setState(() => _error = 'Enter the person’s name.');
      return;
    }
    setState(() => _saving = true);
    try {
      await context.read<BudgetProvider>().reclassifyTransaction(
            widget.transaction.id,
            _fundId == _newPerson ? {'personName': _name.text.trim(), 'direction': _direction.name} : {'personFundId': _fundId},
          );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().isEmpty ? 'Could not move this entry.' : e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = widget.transaction;
    final matching = _funds.where((f) => f.direction == _direction).toList();
    final fundId = matching.any((f) => f.id == _fundId) ? _fundId : _newPerson;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: AppForm.sheetPadding,
        decoration: BoxDecoration(
          color: p.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          border: Border.all(color: p.border),
        ),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            Text('Move to Held & Lent', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: p.text)),
            const SizedBox(height: 8),
            Text(
              '${t.name.isEmpty ? 'This entry' : t.name} (${formatCurrency(t.displayAmount.abs())}) will stop counting as '
              '${_cashIn ? 'income' : 'spending'}. Your balance stays the same.',
              style: TextStyle(fontSize: 13, color: p.textSecondary),
            ),
            const SizedBox(height: 12),
            Semantics(
              label: 'What was it',
              child: RadioGroup<FundDirection>(
                groupValue: _direction,
                onChanged: (v) {
                  if (v != null) setState(() => _direction = v);
                },
                child: Column(children: [
                  for (final d in FundDirection.values)
                    RadioListTile<FundDirection>(
                      key: ValueKey('rc-${d.name}'),
                      contentPadding: EdgeInsets.zero,
                      value: d,
                      title: Text(_meaning(d), style: TextStyle(fontSize: 13, color: p.text)),
                    ),
                ]),
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              key: ValueKey('rc-person-$_direction'),
              initialValue: fundId,
              decoration: const InputDecoration(labelText: 'Person'),
              items: [
                for (final f in matching) DropdownMenuItem(value: f.id, child: Text(f.personName)),
                const DropdownMenuItem(value: _newPerson, child: Text('+ New person')),
              ],
              onChanged: (v) => setState(() => _fundId = v ?? _newPerson),
            ),
            if (fundId == _newPerson) ...[
              const SizedBox(height: 10),
              TextField(
                key: const ValueKey('rc-person-name'),
                controller: _name,
                maxLength: 80,
                decoration: const InputDecoration(hintText: 'Name', labelText: 'Person name'),
              ),
            ],
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(_error, style: TextStyle(fontSize: 12, color: p.badInk)),
              ),
            const SizedBox(height: 14),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
              const SizedBox(width: 8),
              FilledButton(
                key: const ValueKey('rc-submit'),
                onPressed: _saving ? null : _submit,
                child: Text(_saving ? 'Moving…' : 'Move'),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}
