import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../models/account.dart';
import '../theme/app_form.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';

class EditAccountModal extends StatefulWidget {
  final Account account;
  final bool isBank;

  const EditAccountModal({
    super.key,
    required this.account,
    required this.isBank,
  });

  @override
  State<EditAccountModal> createState() => _EditAccountModalState();
}

class _EditAccountModalState extends State<EditAccountModal> {
  late TextEditingController _nameCtrl;
  late TextEditingController _institutionCtrl;
  late TextEditingController _minBalCtrl;
  late TextEditingController _maskCtrl;
  late TextEditingController _openingCtrl;
  late int _originalOpening;
  bool _isPrimary = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final acc = widget.account;
    _nameCtrl = TextEditingController(text: acc.name);
    _institutionCtrl = TextEditingController(text: acc.institution ?? '');
    final minBalMajor = toMajorUnits(acc.minimumBalance);
    _minBalCtrl = TextEditingController(text: minBalMajor > 0 ? '$minBalMajor' : '0');
    // The server's field is accountNumberMasked; the sheet read (and saved) 'accountNumberMask'.
    _maskCtrl = TextEditingController(text: acc.accountNumberMasked ?? '');
    _originalOpening = acc.openingBalance;
    _openingCtrl = TextEditingController(text: '${toMajorUnits(_originalOpening)}');
    _isPrimary = acc.isPrimary;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _institutionCtrl.dispose();
    _minBalCtrl.dispose();
    _maskCtrl.dispose();
    _openingCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Account name cannot be empty')));
      return;
    }

    setState(() => _submitting = true);
    final budget = context.read<BudgetProvider>();
    final id = widget.account.id;
    final minBal = toMinorUnits(num.tryParse(_minBalCtrl.text) ?? 0);
    final opening = toMinorUnits(num.tryParse(_openingCtrl.text) ?? 0);
    // Only send the opening balance when it changed: it rewrites every past balance
    final openingUpdate = opening != _originalOpening ? {'openingBalance': opening} : <String, dynamic>{};

    try {
      if (widget.isBank) {
        await budget.updateBankAccount(id, {
          'name': name,
          'institution': _institutionCtrl.text.trim(),
          'minimumBalance': minBal,
          'accountNumberMasked': _maskCtrl.text.trim(),
          'isPrimary': _isPrimary,
          ...openingUpdate,
        });
      } else {
        await budget.updateWallet(id, {
          'name': name,
          'minimumBalance': minBal,
          'isPrimary': _isPrimary,
          ...openingUpdate,
        });
      }

      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to update account: $e')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

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
                  Text(
                    'Edit ${widget.isBank ? 'Bank Account' : 'Wallet'}',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              TextField(
                controller: _nameCtrl,
                decoration: InputDecoration(
                  labelText: '${widget.isBank ? 'Bank' : 'Wallet'} Name',
                ),
              ),
              const SizedBox(height: 12),

              if (widget.isBank) ...[
                TextField(
                  controller: _institutionCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Institution (e.g. HDFC, SBI, ICICI)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _maskCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Account Number Mask (Last 4 digits)',
                  ),
                ),
                const SizedBox(height: 12),
              ],

              TextField(
                controller: _openingCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: 'Opening balance ($moneySymbol)'),
              ),
              Builder(builder: (_) {
                final shift = toMinorUnits(num.tryParse(_openingCtrl.text) ?? 0) - _originalOpening;
                if (shift == 0) return const SizedBox(height: 12);
                return Padding(
                  key: const ValueKey('opening-balance-warning'),
                  padding: const EdgeInsets.only(top: 6, bottom: 12),
                  child: Text(
                    'Changing this shifts every balance since ${widget.account.name.isEmpty ? 'this account' : widget.account.name} was added by '
                    '${shift > 0 ? '+' : '−'}${formatCurrency(shift.abs())}.',
                    style: TextStyle(fontSize: 12, color: context.palette.warn),
                  ),
                );
              }),

              TextField(
                controller: _minBalCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Minimum Safety Floor / Balance ($moneySymbol)',
                ),
              ),
              const SizedBox(height: 12),

              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _isPrimary,
                title: Text(
                  'Primary Account',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkText : AppColors.lightText,
                  ),
                ),
                subtitle: Text(
                  'Default destination for unassigned transactions & salary',
                  style: TextStyle(fontSize: 11, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted),
                ),
                activeTrackColor: context.palette.good,
                onChanged: (val) => setState(() => _isPrimary = val),
              ),
              const SizedBox(height: 20),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        foregroundColor: Theme.of(context).colorScheme.onPrimary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: _submitting ? null : _handleSubmit,
                      child: _submitting
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Save Changes', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
