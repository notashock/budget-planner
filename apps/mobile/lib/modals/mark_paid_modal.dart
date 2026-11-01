import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import '../widgets/app_date_picker.dart';
import '../widgets/account_selector.dart';

class MarkPaidModal extends StatefulWidget {
  final Map<String, dynamic> transaction;

  const MarkPaidModal({
    super.key,
    required this.transaction,
  });

  @override
  State<MarkPaidModal> createState() => _MarkPaidModalState();
}

class _MarkPaidModalState extends State<MarkPaidModal> {
  final _amountCtrl = TextEditingController();
  late DateTime _selectedDate;
  String _accountType = 'bank';
  String? _selectedAccountId;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final tx = widget.transaction;
    final num plannedRaw = tx['plannedAmount'] ?? tx['amount'] ?? 0;
    _amountCtrl.text = (plannedRaw / 100).toStringAsFixed(2);
    _selectedDate = DateTime.now();

    final budget = Provider.of<BudgetProvider>(context, listen: false);
    final String? txAccId = tx['accountId']?.toString();

    // Check if tx account is a wallet
    final isWallet = budget.wallets.any((w) => (w['_id'] ?? w['id'])?.toString() == txAccId);
    if (isWallet) {
      _accountType = 'wallet';
      _selectedAccountId = txAccId;
    } else if (txAccId != null && budget.bankAccounts.any((b) => (b['_id'] ?? b['id'])?.toString() == txAccId)) {
      _accountType = 'bank';
      _selectedAccountId = txAccId;
    } else if (budget.bankAccounts.isNotEmpty) {
      _accountType = 'bank';
      _selectedAccountId = (budget.bankAccounts.first['_id'] ?? budget.bankAccounts.first['id'])?.toString();
    } else if (budget.wallets.isNotEmpty) {
      _accountType = 'wallet';
      _selectedAccountId = (budget.wallets.first['_id'] ?? budget.wallets.first['id'])?.toString();
    }
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    super.dispose();
  }

  String _formatDateYmd(DateTime d) {
    String pad(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${pad(d.month)}-${pad(d.day)}';
  }

  Future<void> _submit() async {
    final double? parsed = double.tryParse(_amountCtrl.text.trim());
    if (parsed == null || parsed <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid payment amount')),
      );
      return;
    }

    setState(() => _submitting = true);
    final budget = context.read<BudgetProvider>();
    final txId = (widget.transaction['id'] ?? widget.transaction['_id']).toString();
    final amountInCents = (parsed * 100).round();
    final dateStr = _formatDateYmd(_selectedDate);

    try {
      await budget.payTransaction(
        txId,
        accountId: _selectedAccountId,
        amount: amountInCents,
        date: dateStr,
      );
      if (mounted) {
        Navigator.of(context).pop(true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Transaction successfully marked as paid')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to mark paid: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final tx = widget.transaction;
    final name = tx['name']?.toString() ?? 'Planned Transaction';
    final currency = budget.activeMonth?['currencySymbol']?.toString() ?? '₹';
    final num plannedRaw = tx['plannedAmount'] ?? tx['amount'] ?? 0;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Mark as Paid',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: isDark ? AppColors.darkText : AppColors.lightText,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          name,
                          style: TextStyle(
                            fontSize: 13,
                            color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.close, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Planned Reference Pill
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Planned Commitment',
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                    Text(
                      formatCurrency(plannedRaw, symbol: currency),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkText : AppColors.lightText,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Actual Amount Input
              Text(
                'Actual Amount Paid *',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                ),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: _amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                autofocus: false,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.darkText : AppColors.lightText,
                ),
                decoration: InputDecoration(
                  prefixText: '$currency ',
                  hintText: '0.00',
                  filled: true,
                  fillColor: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: AppColors.primary, width: 1.5),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                ),
              ),
              const SizedBox(height: 16),

              // Payment Date Picker
              AppDatePickerField(
                label: 'Payment Date *',
                selectedDate: _selectedDate,
                onDateSelected: (newDate) => setState(() => _selectedDate = newDate),
              ),
              const SizedBox(height: 16),

              // Disbursement Account Selector
              AccountSelector(
                label: 'Paid From Account',
                accountType: _accountType,
                selectedAccountId: _selectedAccountId,
                bankAccounts: budget.bankAccounts,
                wallets: budget.wallets,
                onChanged: (newType, newId) {
                  setState(() {
                    _accountType = newType;
                    _selectedAccountId = newId;
                  });
                },
              ),
              const SizedBox(height: 24),

              // Confirm Button
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.green,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                icon: _submitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.check_circle_outline, size: 18),
                label: Text(
                  _submitting ? 'Recording Payment...' : 'Confirm Payment',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                ),
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
