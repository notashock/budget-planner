import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import '../widgets/account_selector.dart';
import '../widgets/app_date_picker.dart';

int _int(dynamic v) => (num.tryParse('${v ?? 0}') ?? 0).round();

String _ymd(DateTime d) {
  String pad(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${pad(d.month)}-${pad(d.day)}';
}

String? _accountIdOf(dynamic a) => (a is Map ? (a['_id'] ?? a['id']) : null)?.toString();

/// The account type ('bank' | 'wallet') a card bill is paid from. The account
/// selector lists one type at a time, so the sheet must open on the right one.
String payFromAccountType(String? accountId, List<dynamic> bankAccounts, List<dynamic> wallets) {
  if (accountId != null && wallets.any((w) => _accountIdOf(w) == accountId)) return 'wallet';
  if (accountId == null && bankAccounts.isEmpty && wallets.isNotEmpty) return 'wallet';
  return 'bank';
}

/// Default pay-from account: the primary bank, else the first bank, else the first wallet.
String? defaultPayFromAccountId(List<dynamic> bankAccounts, List<dynamic> wallets) {
  if (bankAccounts.isNotEmpty) {
    for (final b in bankAccounts) {
      if (b is Map && b['isPrimary'] == true) return _accountIdOf(b);
    }
    return _accountIdOf(bankAccounts.first);
  }
  return wallets.isNotEmpty ? _accountIdOf(wallets.first) : null;
}

/// Shared bottom-sheet frame for the card sheets.
class _Sheet extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Sheet({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
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
                  Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: isDark ? AppColors.darkText : AppColors.lightText)),
                  IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => Navigator.pop(context)),
                ],
              ),
              ...children,
            ],
          ),
        ),
      ),
    );
  }
}

Widget _primaryButton(BuildContext context, String label, VoidCallback? onPressed) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  return SizedBox(
    width: double.infinity,
    child: ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: isDark ? Colors.white : Colors.black,
        foregroundColor: isDark ? Colors.black : Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      onPressed: onPressed,
      child: Text(label),
    ),
  );
}

/// Add a credit card. The bill generation day and due day are the user's own.
class AddCardModal extends StatefulWidget {
  const AddCardModal({super.key});

  @override
  State<AddCardModal> createState() => _AddCardModalState();
}

class _AddCardModalState extends State<AddCardModal> {
  final _name = TextEditingController();
  final _limit = TextEditingController();
  final _owed = TextEditingController();
  final _billDay = TextEditingController();
  final _dueDay = TextEditingController();
  String _payType = 'bank';
  String? _payFrom;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final budget = Provider.of<BudgetProvider>(context, listen: false);
    _payFrom = defaultPayFromAccountId(budget.bankAccounts, budget.wallets);
    _payType = payFromAccountType(_payFrom, budget.bankAccounts, budget.wallets);
  }

  @override
  void dispose() {
    for (final c in [_name, _limit, _owed, _billDay, _dueDay]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final sd = int.tryParse(_billDay.text);
    final dd = int.tryParse(_dueDay.text);
    if (_name.text.trim().isEmpty) return setState(() => _error = 'Give the card a name.');
    if (sd == null || sd < 1 || sd > 31) return setState(() => _error = 'Bill generation day must be between 1 and 31.');
    if (dd == null || dd < 1 || dd > 31) return setState(() => _error = 'Due day must be between 1 and 31.');
    setState(() {
      _saving = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await Provider.of<BudgetProvider>(context, listen: false).createCard({
        'name': _name.text.trim(),
        'creditLimit': toMinorUnits(num.tryParse(_limit.text) ?? 0),
        'currentOutstanding': toMinorUnits(num.tryParse(_owed.text) ?? 0),
        'statementDay': sd,
        'dueDay': dd,
        'payFromAccountId': _payFrom,
      });
      navigator.pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    return _Sheet(title: 'Add a credit card', children: [
      TextField(controller: _name, decoration: const InputDecoration(labelText: 'Card name *', border: OutlineInputBorder())),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: TextField(controller: _limit, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Credit limit (₹)', border: OutlineInputBorder()))),
        const SizedBox(width: 10),
        Expanded(child: TextField(controller: _owed, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Owed now (₹)', border: OutlineInputBorder()))),
      ]),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: TextField(controller: _billDay, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Bill day (1-31) *', border: OutlineInputBorder()))),
        const SizedBox(width: 10),
        Expanded(child: TextField(controller: _dueDay, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Due day (1-31) *', border: OutlineInputBorder()))),
      ]),
      const SizedBox(height: 10),
      AccountSelector(
        label: 'Pay the bill from',
        accountType: _payType,
        selectedAccountId: _payFrom,
        bankAccounts: budget.bankAccounts,
        wallets: budget.wallets,
        onChanged: (t, id) => setState(() {
          _payType = t;
          _payFrom = id;
        }),
      ),
      if (_error != null) ...[
        const SizedBox(height: 10),
        Text(_error!, style: const TextStyle(color: AppColors.red, fontSize: 13)),
      ],
      const SizedBox(height: 16),
      _primaryButton(context, _saving ? 'Saving…' : 'Add card', _saving ? null : _save),
    ]);
  }
}

/// Confirm a generated bill, editing it to match the bank's statement.
class ConfirmBillModal extends StatefulWidget {
  final Map<String, dynamic> card;
  final Map<String, dynamic> statement;
  const ConfirmBillModal({super.key, required this.card, required this.statement});

  @override
  State<ConfirmBillModal> createState() => _ConfirmBillModalState();
}

class _ConfirmBillModalState extends State<ConfirmBillModal> {
  late final TextEditingController _amount;
  final _minimum = TextEditingController();
  bool _logDiff = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _amount = TextEditingController(text: (_int(widget.statement['amount']) / 100).toString());
  }

  @override
  void dispose() {
    _amount.dispose();
    _minimum.dispose();
    super.dispose();
  }

  int get _diff => toMinorUnits(num.tryParse(_amount.text) ?? 0) - _int(widget.statement['computedAmount']);

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await Provider.of<BudgetProvider>(context, listen: false).confirmCardStatement(widget.statement['id'].toString(), {
        'statementAmount': toMinorUnits(num.tryParse(_amount.text) ?? 0),
        if (_minimum.text.trim().isNotEmpty) 'minimumDue': toMinorUnits(num.tryParse(_minimum.text) ?? 0),
        'logChargesDifference': _diff != 0 && _logDiff,
      });
      navigator.pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final diff = _diff;
    return _Sheet(title: 'Confirm ${widget.card['name']} bill', children: [
      Text(
        'The app worked out ${formatCurrency(_int(widget.statement['computedAmount']))} from your card entries. Change it if your bank\'s statement says otherwise.',
        style: const TextStyle(fontSize: 12),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _amount,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(labelText: 'Bill amount (₹)', border: OutlineInputBorder()),
      ),
      const SizedBox(height: 10),
      TextField(
        controller: _minimum,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: const InputDecoration(labelText: 'Minimum due (optional)', border: OutlineInputBorder()),
      ),
      if (diff != 0)
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _logDiff,
          onChanged: (v) => setState(() => _logDiff = v ?? false),
          title: Text(
            'Log the ${formatCurrency(diff.abs())} difference as card ${diff > 0 ? 'charges' : 'credit'}',
            style: const TextStyle(fontSize: 13),
          ),
        ),
      if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.red, fontSize: 13)),
      const SizedBox(height: 16),
      _primaryButton(context, _saving ? 'Saving…' : 'Confirm bill', _saving ? null : _save),
    ]);
  }
}

/// Pay a bill: full, minimum or another amount, from a bank account or wallet.
class PayBillModal extends StatefulWidget {
  final Map<String, dynamic> card;
  final Map<String, dynamic> bill;
  const PayBillModal({super.key, required this.card, required this.bill});

  @override
  State<PayBillModal> createState() => _PayBillModalState();
}

class _PayBillModalState extends State<PayBillModal> {
  String _choice = 'full';
  final _custom = TextEditingController();
  String _payType = 'bank';
  String? _payFrom;
  DateTime _date = DateTime.now();
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final budget = Provider.of<BudgetProvider>(context, listen: false);
    _payFrom = widget.card['payFromAccountId']?.toString() ??
        defaultPayFromAccountId(budget.bankAccounts, budget.wallets);
    _payType = payFromAccountType(_payFrom, budget.bankAccounts, budget.wallets);
  }

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  int get _amount {
    final remaining = _int(widget.bill['remaining']);
    if (_choice == 'full') return remaining;
    if (_choice == 'minimum') return _int(widget.bill['minimumDue']).clamp(0, remaining);
    return toMinorUnits(num.tryParse(_custom.text) ?? 0);
  }

  Future<void> _save() async {
    if (_amount <= 0) return setState(() => _error = 'Enter an amount to pay.');
    if (_payFrom == null) return setState(() => _error = 'Choose the account to pay from.');
    setState(() {
      _saving = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await Provider.of<BudgetProvider>(context, listen: false).payCardStatement(widget.bill['statementId'].toString(), {
        'amount': _amount,
        'fromAccountId': _payFrom,
        'date': _ymd(_date),
      });
      navigator.pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final hasMinimum = _int(widget.bill['minimumDue']) > 0;
    return _Sheet(title: 'Pay ${widget.card['name']} bill', children: [
      const Text('Paying moves money from your bank to the card. It isn\'t counted as spending again.', style: TextStyle(fontSize: 12)),
      const SizedBox(height: 12),
      Wrap(spacing: 6, children: [
        ChoiceChip(label: Text('Full ${formatCurrency(_int(widget.bill['remaining']))}'), selected: _choice == 'full', onSelected: (_) => setState(() => _choice = 'full')),
        if (hasMinimum)
          ChoiceChip(label: const Text('Minimum'), selected: _choice == 'minimum', onSelected: (_) => setState(() => _choice = 'minimum')),
        ChoiceChip(label: const Text('Other amount'), selected: _choice == 'custom', onSelected: (_) => setState(() => _choice = 'custom')),
      ]),
      if (_choice == 'custom') ...[
        const SizedBox(height: 10),
        TextField(
          controller: _custom,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Amount (₹)', border: OutlineInputBorder()),
        ),
      ],
      const SizedBox(height: 12),
      AccountSelector(
        label: 'From account',
        accountType: _payType,
        selectedAccountId: _payFrom,
        bankAccounts: budget.bankAccounts,
        wallets: budget.wallets,
        isRequired: true,
        onChanged: (t, id) => setState(() {
          _payType = t;
          _payFrom = id;
        }),
      ),
      const SizedBox(height: 12),
      AppDatePickerField(label: 'Date', selectedDate: _date, onDateSelected: (d) => setState(() => _date = d)),
      if (_error != null) ...[
        const SizedBox(height: 10),
        Text(_error!, style: const TextStyle(color: AppColors.red, fontSize: 13)),
      ],
      const SizedBox(height: 16),
      _primaryButton(context, _saving ? 'Saving…' : 'Pay ${formatCurrency(_amount)}', _saving ? null : _save),
    ]);
  }
}
