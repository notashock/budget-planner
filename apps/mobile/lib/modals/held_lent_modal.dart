import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../engine/engine.dart';
import '../models/person_fund.dart';
import '../theme/app_form.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';
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
        _applySettleAccount();
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
    final p = context.palette;
    final selected = _selected;

    // A return or repayment goes back through the account the money sits in (web's settleAccount)
    final settleId = !_current.startsNew && selected != null ? selected.raw['settleAccountId']?.toString() : null;
    String? nameOf(String? id) {
      for (final a in [...budget.bankAccountModels, ...budget.walletModels]) {
        if (a.id == id) return a.name;
      }
      return null;
    }
    final heldIn = nameOf(settleId);
    final picked = nameOf(_accountId) ?? 'this account';
    final mismatch = heldIn != null && settleId != _accountId;
    final noAccounts = budget.bankAccountModels.isEmpty && budget.walletModels.isEmpty;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Web's .hl-actions: four equal segments in one track
        Semantics(
          label: 'What happened',
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: p.surfaceSubtle,
              border: Border.all(color: p.border),
              borderRadius: BorderRadius.circular(10),
            ),
            // One height for all four, like web's grid track
            child: IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final a in heldLentActions)
                Expanded(
                  child: Semantics(
                    button: true,
                    inMutuallyExclusiveGroup: true,
                    selected: _action == a.key,
                    child: GestureDetector(
                      key: ValueKey('hl-action-${a.key}'),
                      behavior: HitTestBehavior.opaque,
                      onTap: () => setState(() {
                        _action = a.key;
                        _syncFund();
                        _applySettleAccount();
                      }),
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 44),
                        alignment: Alignment.center,
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                        decoration: _action == a.key
                            ? BoxDecoration(
                                color: p.surface,
                                borderRadius: BorderRadius.circular(7),
                                border: Border.all(color: p.borderStrong),
                              )
                            : null,
                        child: Text(a.label,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: _action == a.key ? p.text : p.textSecondary,
                            )),
                      ),
                    ),
                  ),
                ),
            ])),
          ),
        ),
        const SizedBox(height: 8),
        Text("${_current.hint} It won't count as income or spending.",
            style: TextStyle(fontSize: 12, color: p.textMuted, height: 1.45)),
        const SizedBox(height: 14),
        DropdownButtonFormField<String>(
          borderRadius: BorderRadius.circular(8), // web .app-dropdown-menu
          key: ValueKey('person-$_action-${_matching.length}'),
          initialValue: _fundId,
          isExpanded: true,
          decoration: InputDecoration(labelText: _current.direction == 'held' ? 'Whose money' : 'Who'),
          items: [
            ..._matching.map((f) {
              final out = f.outstanding;
              final suffix = out > 0 ? ' (${formatCurrency(out)} ${f.direction == FundDirection.held ? 'held' : 'owed'})' : '';
              return DropdownMenuItem(value: f.id, child: Text('${f.personName}$suffix'));
            }),
            if (_current.startsNew) const DropdownMenuItem(value: _newPerson, child: Text('+ New person')),
            if (!_current.startsNew && _matching.isEmpty) const DropdownMenuItem<String>(value: null, child: Text('No one yet')),
          ],
          onChanged: (v) => setState(() {
            _fundId = v;
            _applySettleAccount();
          }),
        ),
        if (_fundId == _newPerson) ...[
          const SizedBox(height: 8),
          Semantics(
            label: 'Person name',
            child: TextField(
              key: const ValueKey('hl-person-name'),
              controller: _nameCtrl,
              maxLength: 80,
              autofocus: true,
              decoration: const InputDecoration(hintText: 'Name', counterText: ''),
            ),
          ),
        ],
        const SizedBox(height: 12),
        // Web's .hl-row: amount and date side by side
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              TextField(
                key: const ValueKey('hl-amount'),
                controller: _amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: 'Amount ($moneySymbol)', hintText: '0'),
              ),
              if (!_current.startsNew && selected != null)
                TextButton(
                  onPressed: () => setState(() => _amountCtrl.text = (selected.outstanding / 100).toString()),
                  child: Text('All ${formatCurrency(selected.outstanding)}'),
                ),
            ]),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _DateBox(
              key: const ValueKey('hl-date'),
              label: 'Date',
              value: _date,
              onChanged: (d) => setState(() => _date = d ?? _date),
            ),
          ),
        ]),
        const SizedBox(height: 12),
        if (noAccounts)
          Text('Add a bank account or wallet first.', style: TextStyle(fontSize: 12, color: p.textMuted))
        else
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
        if (mismatch && selected != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _current.key == 'return'
                  ? "${selected.personName}'s money went into $heldIn. Returning it from $picked lowers $picked."
                  : 'The money lent to ${selected.personName} left $heldIn. This puts it into $picked.',
              key: const ValueKey('hl-account-mismatch'),
              style: TextStyle(fontSize: 12, color: p.warnInk, height: 1.45),
            ),
          ),
        if (_current.startsNew) ...[
          const SizedBox(height: 12),
          _DateBox(
            key: const ValueKey('expected-date'),
            label: "${_current.key == 'lend' ? "They'll pay back by" : 'Give back by'} (optional)",
            value: _expectedDate,
            empty: 'No date',
            notBefore: DateTime.now(),
            onChanged: (d) => setState(() => _expectedDate = d),
          ),
        ],
        const SizedBox(height: 12),
        TextField(
          controller: _noteCtrl,
          maxLength: 200,
          decoration: const InputDecoration(labelText: 'Note (optional)', counterText: ''),
        ),
        // Lending spends your own money; returning held money doesn't (it was never yours)
        if (_current.key == 'lend') FloorBreachNotice(amountController: _amountCtrl, accountId: _accountId),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: p.badInk, fontSize: 13)),
        ],
        const SizedBox(height: 18),
        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: Theme.of(context).colorScheme.primary,
            foregroundColor: Theme.of(context).colorScheme.onPrimary,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          onPressed: _submitting || _accountId == null || noAccounts ? null : _submit,
          child: Text(_submitting ? 'Saving…' : _current.label),
        ),
      ],
    );
  }

  /// Return / Got back: move to the account the person's money sits in.
  void _applySettleAccount() {
    if (_current.startsNew) return;
    final id = _selected?.raw['settleAccountId']?.toString();
    if (id == null) return;
    final budget = Provider.of<BudgetProvider>(context, listen: false);
    if (budget.bankAccountModels.any((b) => b.id == id)) {
      _accountType = 'bank';
      _accountId = id;
    } else if (budget.walletModels.any((w) => w.id == id)) {
      _accountType = 'wallet';
      _accountId = id;
    }
  }
}

/// A compact date field (web's DatePicker compact): label, the date or [empty],
/// a clear button when [empty] is set, and the app's calendar on tap.
class _DateBox extends StatelessWidget {
  const _DateBox({super.key, required this.label, required this.value, required this.onChanged, this.empty, this.notBefore});
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;
  final String? empty;
  final DateTime? notBefore;

  String _ymd(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final v = value;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () async {
        final floor = notBefore;
        final start = v ?? (floor == null ? DateTime.now() : floor.add(const Duration(days: 7)));
        final picked = await showAppDatePicker(context, start);
        if (picked == null) return;
        if (floor != null && picked.isBefore(DateTime(floor.year, floor.month, floor.day))) return;
        onChanged(picked);
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: v != null && empty != null
              ? IconButton(tooltip: 'Remove date', icon: const Icon(Icons.close, size: 16), onPressed: () => onChanged(null))
              : const Icon(Icons.calendar_today_outlined, size: 16),
        ),
        child: Text(v == null ? empty ?? '' : formatDisplayDate(_ymd(v), includeWeekday: false),
            maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
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
