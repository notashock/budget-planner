import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../models/account.dart';
import '../theme/app_palette.dart';
import 'card_modals.dart' show AppSheet;

/// Web's bank account types (AccountsScreen "Account Type").
const bankAccountTypes = [('checking', 'Checking'), ('savings', 'Savings'), ('salary', 'Salary'), ('other', 'Other')];

/// Web's wallet types ("Wallet Type").
const walletTypes = [('cash', 'Cash Envelope'), ('digital', 'Digital Wallet'), ('other', 'Other')];

/// Opens the add / edit sheet for a bank account or wallet.
Future<void> showAccountForm(BuildContext context, {required bool isBank, Account? account}) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => EditAccountModal(account: account, isBank: isBank),
    );

/// Add or edit a bank account or wallet, with web's fields, order and labels.
class EditAccountModal extends StatefulWidget {
  /// Null adds a new one.
  final Account? account;
  final bool isBank;

  const EditAccountModal({super.key, this.account, required this.isBank});

  @override
  State<EditAccountModal> createState() => _EditAccountModalState();
}

class _EditAccountModalState extends State<EditAccountModal> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _institutionCtrl;
  late final TextEditingController _minBalCtrl;
  late final TextEditingController _maskCtrl;
  late final TextEditingController _openingCtrl;
  late String _type;
  late int _originalOpening;
  bool _isPrimary = false;
  bool _submitting = false;
  String? _nameError;
  String? _error;

  bool get _isEdit => widget.account != null;

  static String _major(int minor) => minor == 0 ? '' : (minor / 100).toStringAsFixed(minor % 100 == 0 ? 0 : 2);

  @override
  void initState() {
    super.initState();
    final acc = widget.account;
    _nameCtrl = TextEditingController(text: acc?.name ?? '');
    _institutionCtrl = TextEditingController(text: acc?.institution ?? '');
    _minBalCtrl = TextEditingController(text: _major(acc?.minimumBalance ?? 0));
    _maskCtrl = TextEditingController(text: acc?.accountNumberMasked ?? '');
    _originalOpening = acc?.openingBalance ?? 0;
    _openingCtrl = TextEditingController(text: _isEdit ? '${_originalOpening / 100}'.replaceAll(RegExp(r'\.0$'), '') : '');
    final types = widget.isBank ? bankAccountTypes : walletTypes;
    final current = widget.isBank ? acc?.subtype : (acc?.walletType ?? acc?.subtype);
    _type = types.any((t) => t.$1 == current) ? current! : types.first.$1;
    if (acc != null) {
      _isPrimary = acc.isPrimary;
    } else {
      // The first one of its kind starts as primary, as on web
      final budget = context.read<BudgetProvider>();
      _isPrimary = (widget.isBank ? budget.bankAccountModels : budget.walletModels).isEmpty;
    }
  }

  @override
  void dispose() {
    for (final c in [_nameCtrl, _institutionCtrl, _minBalCtrl, _maskCtrl, _openingCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  int _minor(TextEditingController c) => toMinorUnits(num.tryParse(c.text.replaceAll(RegExp(r'[^0-9.-]'), '')) ?? 0);

  Future<void> _handleSubmit() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) return setState(() => _nameError = 'Enter a name');
    setState(() {
      _submitting = true;
      _nameError = null;
      _error = null;
    });
    final budget = context.read<BudgetProvider>();
    final opening = _minor(_openingCtrl);
    // Editing sends the opening balance only when it changed: it rewrites every past balance
    final openingUpdate = !_isEdit || opening != _originalOpening ? {'openingBalance': opening} : <String, dynamic>{};
    final navigator = Navigator.of(context);
    try {
      if (widget.isBank) {
        final body = {
          'name': name,
          'institution': _institutionCtrl.text.trim(),
          'accountType': _type,
          'accountNumberMasked': _maskCtrl.text.trim(),
          'minimumBalance': _minor(_minBalCtrl),
          'isPrimary': _isPrimary,
          ...openingUpdate,
        };
        _isEdit ? await budget.updateBankAccount(widget.account!.id, body) : await budget.addBankAccount(body);
      } else {
        final body = {
          'name': name,
          'walletType': _type,
          'minimumBalance': _minor(_minBalCtrl),
          'isPrimary': _isPrimary,
          ...openingUpdate,
        };
        _isEdit ? await budget.updateWallet(widget.account!.id, body) : await budget.addWallet(body);
      }
      navigator.pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().isNotEmpty
            ? e.toString()
            : 'Could not save this ${widget.isBank ? 'account' : 'wallet'}. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _pair(Widget a, Widget b) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: a),
        const SizedBox(width: 10),
        Expanded(child: b),
      ]);

  Widget _money(TextEditingController c, String label, {Key? key, bool signed = false}) => TextField(
        key: key,
        controller: c,
        keyboardType: TextInputType.numberWithOptions(decimal: true, signed: signed),
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(labelText: '$label ($moneySymbol)', hintText: '0.00'),
      );

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final bank = widget.isBank;
    final types = bank ? bankAccountTypes : walletTypes;
    final typeField = DropdownButtonFormField<String>(
      key: const ValueKey('account-type-select'),
      initialValue: _type,
      isExpanded: true,
      decoration: InputDecoration(labelText: bank ? 'Account Type' : 'Wallet Type'),
      items: [for (final (v, l) in types) DropdownMenuItem(value: v, child: Text(l))],
      onChanged: (v) => setState(() => _type = v ?? _type),
    );
    final shift = _isEdit ? _minor(_openingCtrl) - _originalOpening : 0;
    final opening = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _money(_openingCtrl, 'Opening Balance', key: const ValueKey('account-opening'), signed: true),
      if (shift != 0)
        Padding(
          key: const ValueKey('opening-balance-warning'),
          padding: const EdgeInsets.only(top: 6),
          child: Text(
            'Changing this shifts every balance since ${widget.account!.name.isEmpty ? 'this account' : widget.account!.name} was added by '
            '${shift > 0 ? '+' : '−'}${formatCurrency(shift.abs())}.',
            style: TextStyle(fontSize: 12, color: p.warnInk),
          ),
        ),
    ]);

    final title = bank ? (_isEdit ? 'Edit Bank Account' : 'Add Bank Account') : (_isEdit ? 'Edit Wallet' : 'Add Wallet');
    final submitLabel = _submitting ? 'Saving...' : (_isEdit ? 'Save Changes' : (bank ? 'Create Account' : 'Create Wallet'));

    return AppSheet(title: title, children: [
      const SizedBox(height: 4),
      TextField(
        key: const ValueKey('add-account-name'),
        controller: _nameCtrl,
        decoration: InputDecoration(
          labelText: bank ? 'Account Name *' : 'Wallet Name *',
          hintText: bank ? 'e.g. HDFC Salary, Chase Checking' : 'e.g. Physical Cash, Paytm Wallet',
          errorText: _nameError,
        ),
      ),
      const SizedBox(height: 12),
      if (bank) ...[
        TextField(
          key: const ValueKey('account-institution'),
          controller: _institutionCtrl,
          decoration: const InputDecoration(labelText: 'Financial Institution', hintText: 'e.g. HDFC Bank, Chase, SBI'),
        ),
        const SizedBox(height: 12),
        _pair(
          typeField,
          TextField(
            key: const ValueKey('add-account-mask'),
            controller: _maskCtrl,
            decoration: const InputDecoration(labelText: 'Masked Number', hintText: 'e.g. •••• 4021'),
          ),
        ),
      ] else
        typeField,
      const SizedBox(height: 12),
      _pair(opening, _money(_minBalCtrl, 'Min Balance', key: const ValueKey('account-min-balance'))),
      CheckboxListTile(
        key: const ValueKey('account-primary'),
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        value: _isPrimary,
        onChanged: (v) => setState(() => _isPrimary = v ?? false),
        title: Text(
          bank ? 'Set as primary bank account (pre-selected in entries)' : 'Set as primary wallet (pre-selected in entries)',
          style: TextStyle(fontSize: 13, color: p.text),
        ),
      ),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(_error!, style: TextStyle(color: p.badInk, fontSize: 13)),
        ),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel'))),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton(
            key: const ValueKey('add-account-submit'),
            onPressed: _submitting ? null : _handleSubmit,
            child: Text(submitLabel),
          ),
        ),
      ]),
    ]);
  }
}
