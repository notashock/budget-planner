import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import '../widgets/app_date_picker.dart';
import '../widgets/account_selector.dart';

class TransferModal extends StatefulWidget {
  const TransferModal({super.key});

  @override
  State<TransferModal> createState() => _TransferModalState();
}

class _TransferModalState extends State<TransferModal> {
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  late DateTime _selectedDate;

  String _sourceAccountType = 'bank';
  String? _sourceAccountId;
  String _destAccountType = 'wallet';
  String? _destAccountId;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _selectedDate = DateTime.now();

    final budget = Provider.of<BudgetProvider>(context, listen: false);
    if (budget.bankAccounts.isNotEmpty) {
      _sourceAccountId = (budget.bankAccounts.first['_id'] ?? budget.bankAccounts.first['id'])?.toString();
    }
    if (budget.wallets.isNotEmpty) {
      _destAccountType = 'wallet';
      _destAccountId = (budget.wallets.first['_id'] ?? budget.wallets.first['id'])?.toString();
    } else if (budget.bankAccounts.length > 1) {
      _destAccountType = 'bank';
      _destAccountId = (budget.bankAccounts[1]['_id'] ?? budget.bankAccounts[1]['id'])?.toString();
    }
  }


  @override
  void dispose() {
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  String _formatDateYmd(DateTime d) {
    String pad(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${pad(d.month)}-${pad(d.day)}';
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
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
                  Text(
                    'Inter-Account Transfer',
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
              const SizedBox(height: 16),

              AccountSelector(
                label: 'From Account (Source)',
                accountType: _sourceAccountType,
                selectedAccountId: _sourceAccountId,
                bankAccounts: budget.bankAccounts,
                wallets: budget.wallets,
                isRequired: true,
                onChanged: (newType, newId) {
                  setState(() {
                    _sourceAccountType = newType;
                    _sourceAccountId = newId;
                  });
                },
              ),
              const SizedBox(height: 12),

              AccountSelector(
                label: 'To Account (Destination)',
                accountType: _destAccountType,
                selectedAccountId: _destAccountId,
                bankAccounts: budget.bankAccounts,
                wallets: budget.wallets,
                isRequired: true,
                onChanged: (newType, newId) {
                  setState(() {
                    _destAccountType = newType;
                    _destAccountId = newId;
                  });
                },
              ),
              const SizedBox(height: 12),

              TextField(
                controller: _amountCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Transfer Amount (₹) *', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),

              AppDatePickerField(
                label: 'Transfer Date',
                selectedDate: _selectedDate,
                onDateSelected: (d) {
                  setState(() {
                    _selectedDate = d;
                  });
                },
              ),
              const SizedBox(height: 12),

              TextField(
                controller: _noteCtrl,
                decoration: const InputDecoration(labelText: 'Note / Description (Optional)', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isDark ? Colors.white : Colors.black,
                    foregroundColor: isDark ? Colors.black : Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: _submitting || _sourceAccountId == null || _destAccountId == null
                      ? null
                      : () async {
                          if (_sourceAccountId == _destAccountId && _sourceAccountType == _destAccountType) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Source and destination accounts must be different')),
                            );
                            return;
                          }
                          setState(() => _submitting = true);
                          final amt = toMinorUnits(num.tryParse(_amountCtrl.text) ?? 0);
                          if (amt <= 0) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Please enter a valid transfer amount')),
                            );
                            setState(() => _submitting = false);
                            return;
                          }

                          final isSrcWallet = _sourceAccountType == 'wallet';
                          final isDstWallet = _destAccountType == 'wallet';

                          final navigator = Navigator.of(context);
                          final messenger = ScaffoldMessenger.of(context);
                          final dateStr = _formatDateYmd(_selectedDate);
                          final noteText = _noteCtrl.text.trim();

                          try {
                            await budget.addTransfer({
                              'sourceAccountId': _sourceAccountId,
                              'sourceType': _sourceAccountType,
                              'sourceBankAccountId': isSrcWallet ? null : _sourceAccountId,
                              'sourceWalletId': isSrcWallet ? _sourceAccountId : null,
                              'destinationAccountId': _destAccountId,
                              'destinationType': _destAccountType,
                              'destinationBankAccountId': isDstWallet ? null : _destAccountId,
                              'destinationWalletId': isDstWallet ? _destAccountId : null,
                              'amount': amt,
                              'date': dateStr,
                              'day': _selectedDate.day,
                              'note': noteText,
                              'description': noteText,
                            });
                            if (mounted) navigator.pop();
                          } catch (e) {

                            if (mounted) {
                              messenger.showSnackBar(
                                SnackBar(content: Text('Transfer failed: $e')),
                              );
                              setState(() => _submitting = false);
                            }
                          }
                        },
                  child: _submitting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Log Transfer', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
