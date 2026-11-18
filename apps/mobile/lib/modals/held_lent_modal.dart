import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import '../widgets/floor_breach_notice.dart';
import '../widgets/app_date_picker.dart';
import '../widgets/account_selector.dart';

/// One of the four Held & Lent cash movements (ADR 0069). None is income or spending.
class HeldLentAction {
  final String key;
  final String direction; // 'held' | 'lent'
  final String flow; // 'in' | 'out'
  final String label;
  final String hint;
  const HeldLentAction(this.key, this.direction, this.flow, this.label, this.hint);

  bool get startsNew => key == 'hold' || key == 'lend';
}

const heldLentActions = <HeldLentAction>[
  HeldLentAction('hold', 'held', 'in', 'Receive to hold', "Someone's money is coming to you. You'll give it back."),
  HeldLentAction('return', 'held', 'out', 'Return', 'You are giving back money you were holding.'),
  HeldLentAction('lend', 'lent', 'out', 'Lend', 'Your money is going to someone. They will pay it back.'),
  HeldLentAction('repaid', 'lent', 'in', 'Got back', 'Someone is paying back money you lent.'),
];

const _newPerson = '__new__';

class HeldLentModal extends StatefulWidget {
  final String initialAction;
  final String? initialFundId;

  /// Values carried over from the entry sheet, so switching to Held/Lent keeps what was typed.
  final String initialAmount;
  final String initialNote;
  final DateTime? initialDate;
  final String? initialAccountId;

  const HeldLentModal({
    super.key,
    this.initialAction = 'hold',
    this.initialFundId,
    this.initialAmount = '',
    this.initialNote = '',
    this.initialDate,
    this.initialAccountId,
  });

  @override
  State<HeldLentModal> createState() => _HeldLentModalState();
}

class _HeldLentModalState extends State<HeldLentModal> {
  final _amountCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  late String _action;
  String? _fundId;
  List<Map<String, dynamic>> _funds = [];
  DateTime _date = DateTime.now();
  String _accountType = 'bank';
  String? _accountId;
  bool _submitting = false;
  String? _error;

  HeldLentAction get _current => heldLentActions.firstWhere((a) => a.key == _action, orElse: () => heldLentActions.first);

  @override
  void initState() {
    super.initState();
    _action = widget.initialAction;
    _fundId = widget.initialFundId;
    _amountCtrl.text = widget.initialAmount;
    _noteCtrl.text = widget.initialNote;
    if (widget.initialDate != null) _date = widget.initialDate!;
    final budget = Provider.of<BudgetProvider>(context, listen: false);
    String? idOf(dynamic a) => (a is Map ? (a['_id'] ?? a['id']) : null)?.toString();
    // Held and lent money moves through a bank account or wallet, never a card
    final carried = widget.initialAccountId;
    if (carried != null && budget.bankAccounts.any((b) => idOf(b) == carried)) {
      _accountId = carried;
    } else if (carried != null && budget.wallets.any((w) => idOf(w) == carried)) {
      _accountType = 'wallet';
      _accountId = carried;
    } else if (budget.bankAccounts.isNotEmpty) {
      final primary = budget.bankAccounts.firstWhere((b) => b['isPrimary'] == true, orElse: () => budget.bankAccounts.first);
      _accountId = (primary['_id'] ?? primary['id'])?.toString();
    } else if (budget.wallets.isNotEmpty) {
      _accountType = 'wallet';
      _accountId = (budget.wallets.first['_id'] ?? budget.wallets.first['id'])?.toString();
    }
    budget.getPersonFunds().then((res) {
      if (!mounted) return;
      final list = res['funds'] is List ? res['funds'] as List : [];
      setState(() {
        _funds = list.map((f) => Map<String, dynamic>.from(f as Map)).toList();
        _syncFund();
      });
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _nameCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  int _outstandingOf(Map<String, dynamic> f) => (num.tryParse('${f['outstanding'] ?? 0}') ?? 0).round();

  List<Map<String, dynamic>> get _matching => _funds.where((f) {
        if (f['direction'] != _current.direction) return false;
        return _current.startsNew || _outstandingOf(f) > 0 || f['id']?.toString() == _fundId;
      }).toList();

  void _syncFund() {
    final ids = _matching.map((f) => f['id'].toString()).toList();
    if (_fundId == _newPerson && _current.startsNew) return;
    if (_fundId != null && ids.contains(_fundId)) return;
    _fundId = ids.isNotEmpty ? ids.first : (_current.startsNew ? _newPerson : null);
  }

  Map<String, dynamic>? get _selected {
    for (final f in _funds) {
      if (f['id']?.toString() == _fundId) return f;
    }
    return null;
  }

  String _ymd(DateTime d) {
    String pad(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${pad(d.month)}-${pad(d.day)}';
  }

  Future<void> _submit() async {
    final budget = Provider.of<BudgetProvider>(context, listen: false);
    final amt = toMinorUnits(num.tryParse(_amountCtrl.text) ?? 0);
    setState(() => _error = null);
    if (amt <= 0) {
      setState(() => _error = 'Enter an amount above zero.');
      return;
    }
    final selected = _selected;
    if (!_current.startsNew && selected == null) {
      setState(() => _error = _current.direction == 'held' ? 'No one has money held with you yet.' : 'No one owes you money yet.');
      return;
    }
    if (!_current.startsNew && selected != null && amt > _outstandingOf(selected)) {
      setState(() => _error = 'That is more than the ${formatCurrency(_outstandingOf(selected))} outstanding with ${selected['personName']}.');
      return;
    }
    if (_fundId == _newPerson && _nameCtrl.text.trim().isEmpty) {
      setState(() => _error = "Enter the person's name.");
      return;
    }
    setState(() => _submitting = true);
    final navigator = Navigator.of(context);
    try {
      if (_fundId == _newPerson) {
        await budget.createPersonFund({
          'personName': _nameCtrl.text.trim(),
          'direction': _current.direction,
          'amount': amt,
          'date': _ymd(_date),
          'accountId': _accountId,
          'entryNote': _noteCtrl.text.trim(),
        });
      } else {
        await budget.addPersonFundEntry(_fundId!, {
          'flow': _current.flow,
          'amount': amt,
          'date': _ymd(_date),
          'accountId': _accountId,
          'note': _noteCtrl.text.trim(),
        });
      }
      navigator.pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final muted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final selected = _selected;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Held & Lent money', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: text)),
                  IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => Navigator.pop(context)),
                ],
              ),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: heldLentActions.map((a) => ChoiceChip(
                      label: Text(a.label),
                      selected: _action == a.key,
                      onSelected: (_) => setState(() {
                        _action = a.key;
                        _syncFund();
                      }),
                    )).toList(),
              ),
              const SizedBox(height: 8),
              Text("${_current.hint} It won't count as income or spending.", style: TextStyle(fontSize: 12, color: muted)),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                key: ValueKey('person-$_action-${_matching.length}'),
                initialValue: _fundId,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: _current.direction == 'held' ? 'Whose money' : 'Who',
                  border: const OutlineInputBorder(),
                ),
                items: [
                  ..._matching.map((f) {
                    final out = _outstandingOf(f);
                    final suffix = out > 0 ? ' (${formatCurrency(out)} ${f['direction'] == 'held' ? 'held' : 'owed'})' : '';
                    return DropdownMenuItem(value: f['id'].toString(), child: Text('${f['personName']}$suffix'));
                  }),
                  if (_current.startsNew) const DropdownMenuItem(value: _newPerson, child: Text('+ New person')),
                ],
                onChanged: (v) => setState(() => _fundId = v),
              ),
              if (_fundId == _newPerson) ...[
                const SizedBox(height: 10),
                TextField(
                  controller: _nameCtrl,
                  maxLength: 80,
                  decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder(), counterText: ''),
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Amount (₹) *', border: OutlineInputBorder()),
              ),
              if (!_current.startsNew && selected != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _amountCtrl.text = (_outstandingOf(selected) / 100).toString()),
                    child: Text('All ${formatCurrency(_outstandingOf(selected))}'),
                  ),
                ),
              const SizedBox(height: 12),
              AppDatePickerField(
                label: 'Date',
                selectedDate: _date,
                onDateSelected: (d) => setState(() => _date = d),
              ),
              const SizedBox(height: 12),
              AccountSelector(
                label: _current.flow == 'in' ? 'Into account' : 'From account',
                accountType: _accountType,
                selectedAccountId: _accountId,
                bankAccounts: budget.bankAccounts,
                wallets: budget.wallets,
                isRequired: true,
                onChanged: (t, id) => setState(() {
                  _accountType = t;
                  _accountId = id;
                }),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteCtrl,
                decoration: const InputDecoration(labelText: 'Note (optional)', border: OutlineInputBorder()),
              ),
              // Lending spends your own money; returning held money doesn't (it was never yours)
              if (_current.key == 'lend')
                FloorBreachNotice(amountController: _amountCtrl, accountId: _accountId),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.red, fontSize: 13)),
              ],
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isDark ? Colors.white : Colors.black,
                    foregroundColor: isDark ? Colors.black : Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: _submitting || _accountId == null ? null : _submit,
                  child: Text(_submitting ? 'Saving…' : _current.label),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
