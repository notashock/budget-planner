import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../engine/engine.dart';
import '../models/person_fund.dart';
import '../theme/app_form.dart';
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

  FundDirection get fundDirection => direction == 'held' ? FundDirection.held : FundDirection.lent;
}

const heldLentActions = <HeldLentAction>[
  HeldLentAction('hold', 'held', 'in', 'Receive to hold', "Someone's money is coming to you. You'll give it back."),
  HeldLentAction('return', 'held', 'out', 'Return', 'You are giving back money you were holding.'),
  HeldLentAction('lend', 'lent', 'out', 'Lend', 'Your money is going to someone. They will pay it back.'),
  HeldLentAction('repaid', 'lent', 'in', 'Got back', 'Someone is paying back money you lent.'),
];

const _newPerson = '__new__';

/// The Held & Lent form on its own (no sheet chrome), so it can sit in its own
/// sheet or inside the entry sheet's Move tab ("A person").
class HeldLentForm extends StatefulWidget {
  final String initialAction;
  final String? initialFundId;

  /// Values carried over from the entry sheet, so switching to Held/Lent keeps what was typed.
  final String initialAmount;
  final String initialNote;
  final DateTime? initialDate;
  final String? initialAccountId;

  /// A name suggested by the entry sheet ("from Ravi"), used when adding a new person.
  final String initialPersonName;

  /// Called after a successful save.
  final VoidCallback? onSaved;

  const HeldLentForm({
    super.key,
    this.initialAction = 'hold',
    this.initialFundId,
    this.initialAmount = '',
    this.initialNote = '',
    this.initialDate,
    this.initialAccountId,
    this.initialPersonName = '',
    this.onSaved,
  });

  @override
  State<HeldLentForm> createState() => _HeldLentFormState();
}

class _HeldLentFormState extends State<HeldLentForm> {
  final _amountCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  late String _action;
  String? _fundId;
  List<PersonFund> _funds = [];
  DateTime _date = DateTime.now();
  String _accountType = 'bank';
  String? _accountId;
  bool _submitting = false;
  String? _error;
  // Lend / hold: when the money should come back or be given back (optional)
  DateTime? _expectedDate;

  HeldLentAction get _current => heldLentActions.firstWhere((a) => a.key == _action, orElse: () => heldLentActions.first);

  @override
  void initState() {
    super.initState();
    _action = widget.initialAction;
    _fundId = widget.initialFundId;
    _nameCtrl.text = widget.initialPersonName;
    _amountCtrl.text = widget.initialAmount;
    _noteCtrl.text = widget.initialNote;
    if (widget.initialDate != null) _date = widget.initialDate!;
    final budget = Provider.of<BudgetProvider>(context, listen: false);
    // Held and lent money moves through a bank account or wallet, never a card
    final banks = budget.bankAccountModels;
    final wallets = budget.walletModels;
    final carried = widget.initialAccountId;
    if (carried != null && banks.any((b) => b.id == carried)) {
      _accountId = carried;
    } else if (carried != null && wallets.any((w) => w.id == carried)) {
      _accountType = 'wallet';
      _accountId = carried;
    } else if (banks.isNotEmpty) {
      _accountId = banks.firstWhere((b) => b.isPrimary, orElse: () => banks.first).id;
    } else if (wallets.isNotEmpty) {
      _accountType = 'wallet';
      _accountId = wallets.first.id;
    }
    budget.getPersonFundsTyped().then((res) {
      if (!mounted) return;
      setState(() {
        _funds = res.funds;
        _syncFund();
      });
    }).catchError((Object _) {
      // Without the list, a Return or Got back would wrongly say no one owes you.
      if (mounted) setState(() => _error = 'Could not load people. Check your connection and try again.');
    });
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _nameCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  List<PersonFund> get _matching => _funds.where((f) {
        if (f.direction != _current.fundDirection) return false;
        return _current.startsNew || f.outstanding > 0 || f.id == _fundId;
      }).toList();

  void _syncFund() {
    final ids = _matching.map((f) => f.id).toList();
    if (_fundId == _newPerson && _current.startsNew) return;
    if (_fundId != null && ids.contains(_fundId)) return;
    _fundId = ids.isNotEmpty ? ids.first : (_current.startsNew ? _newPerson : null);
  }

  PersonFund? get _selected {
    for (final f in _funds) {
      if (f.id == _fundId) return f;
    }
    return null;
  }

  String _ymd(DateTime d) {
    String pad(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${pad(d.month)}-${pad(d.day)}';
  }

  Future<void> _submit() async {
    // A second tap before the button redraws must not save it twice
    if (_submitting) return;
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
    if (!_current.startsNew && selected != null && amt > selected.outstanding) {
      setState(() => _error = 'That is more than the ${formatCurrency(selected.outstanding)} outstanding with ${selected.personName}.');
      return;
    }
    if (_fundId == _newPerson && _nameCtrl.text.trim().isEmpty) {
      setState(() => _error = "Enter the person's name.");
      return;
    }
    _submitting = true;
    setState(() {});
    // Filed under the month being viewed, like other entries
    final monthRef = {'year': budget.currentYear, 'month': budget.currentMonth};
    try {
      if (_fundId == _newPerson) {
        await budget.createPersonFund({
          'personName': _nameCtrl.text.trim(),
          'direction': _current.direction,
          'amount': amt,
          'date': _ymd(_date),
          'accountId': _accountId,
          'entryNote': _noteCtrl.text.trim(),
          if (_expectedDate != null) 'expectedSettleDate': _ymd(_expectedDate!),
          ...monthRef,
        });
      } else {
        await budget.addPersonFundEntry(_fundId!, {
          'flow': _current.flow,
          'amount': amt,
          'date': _ymd(_date),
          'accountId': _accountId,
          'note': _noteCtrl.text.trim(),
          ...monthRef,
        });
      }
      widget.onSaved?.call();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      _submitting = false;
      if (mounted) setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final selected = _selected;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
                ),
                items: [
                  ..._matching.map((f) {
                    final out = f.outstanding;
                    final suffix = out > 0 ? ' (${formatCurrency(out)} ${f.direction == FundDirection.held ? 'held' : 'owed'})' : '';
                    return DropdownMenuItem(value: f.id, child: Text('${f.personName}$suffix'));
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
                  decoration: const InputDecoration(labelText: 'Name', counterText: ''),
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Amount (₹) *'),
              ),
              if (!_current.startsNew && selected != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _amountCtrl.text = (selected.outstanding / 100).toString()),
                    child: Text('All ${formatCurrency(selected.outstanding)}'),
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
                bankAccounts: budget.bankAccountModels,
                wallets: budget.walletModels,
                isRequired: true,
                onChanged: (t, id) => setState(() {
                  _accountType = t;
                  _accountId = id;
                }),
              ),
              if (_current.startsNew) ...[
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(
                    child: Text(
                      _expectedDate == null
                          ? (_current.key == 'lend' ? "They'll pay back by: no date" : 'Give back by: no date')
                          : '${_current.key == 'lend' ? "They'll pay back by" : 'Give back by'} ${_ymd(_expectedDate!)}',
                      key: const ValueKey('expected-date'),
                      style: TextStyle(fontSize: 13, color: muted),
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      final now = DateTime.now();
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: _expectedDate ?? now.add(const Duration(days: 7)),
                        firstDate: DateTime(now.year, now.month, now.day),
                        lastDate: DateTime(now.year + 5),
                      );
                      if (picked != null && mounted) setState(() => _expectedDate = picked);
                    },
                    child: Text(_expectedDate == null ? 'Add date' : 'Change'),
                  ),
                  if (_expectedDate != null)
                    IconButton(
                      tooltip: 'Remove date',
                      icon: const Icon(Icons.close, size: 16),
                      onPressed: () => setState(() => _expectedDate = null),
                    ),
                ]),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _noteCtrl,
                decoration: const InputDecoration(labelText: 'Note (optional)'),
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
    );
  }
}

/// Held & Lent in its own bottom sheet (People section, card actions).
class HeldLentModal extends StatelessWidget {
  final String initialAction;
  final String? initialFundId;
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
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: AppForm.sheetPadding,
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
              HeldLentForm(
                initialAction: initialAction,
                initialFundId: initialFundId,
                initialAmount: initialAmount,
                initialNote: initialNote,
                initialDate: initialDate,
                initialAccountId: initialAccountId,
                onSaved: () => Navigator.pop(context, true),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
