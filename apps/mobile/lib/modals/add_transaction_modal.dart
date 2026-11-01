import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../theme/app_colors.dart';
import '../widgets/app_date_picker.dart';
import '../widgets/account_selector.dart';

class AddTransactionModal extends StatefulWidget {
  final String initialStatus; // 'planned' | 'successful'

  const AddTransactionModal({
    super.key,
    this.initialStatus = 'successful',
  });

  @override
  State<AddTransactionModal> createState() => _AddTransactionModalState();
}

class _AddTransactionModalState extends State<AddTransactionModal> {
  final _nameCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();

  late String _status; // 'planned' | 'successful'
  late DateTime _selectedDate;
  String _category = 'General';
  final String _recurrence = 'none';
  bool _isIncome = false;

  String _accountType = 'bank';
  String? _selectedAccountId;
  bool _submitting = false;

  final List<String> _expenseCategories = [
    'General',
    'Food',
    'Travel',
    'Health',
    'Entertainment',
    'Bills',
    'Shopping',
    'Other'
  ];

  final List<String> _incomeCategories = [
    'Salary',
    'Bonus',
    'Investment',
    'Gift',
    'Other'
  ];

  @override
  void initState() {
    super.initState();
    _status = widget.initialStatus;
    _selectedDate = DateTime.now();

    final budget = Provider.of<BudgetProvider>(context, listen: false);
    if (budget.bankAccounts.isNotEmpty) {
      _accountType = 'bank';
      _selectedAccountId = (budget.bankAccounts.first['_id'] ?? budget.bankAccounts.first['id'])?.toString();
    } else if (budget.wallets.isNotEmpty) {
      _accountType = 'wallet';
      _selectedAccountId = (budget.wallets.first['_id'] ?? budget.wallets.first['id'])?.toString();
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  String _formatDateYmd(DateTime d) {
    String pad(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${pad(d.month)}-${pad(d.day)}';
  }

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a description / name')),
      );
      return;
    }

    final double? parsed = double.tryParse(_amountCtrl.text.trim());
    if (parsed == null || parsed <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }

    setState(() => _submitting = true);
    final budget = context.read<BudgetProvider>();
    final amountInCents = (parsed * 100).round();
    final dateStr = _formatDateYmd(_selectedDate);

    final payload = <String, dynamic>{
      'name': name,
      'status': _status,
      'origin': _status == 'planned' ? 'planned' : 'spot',
      'amount': amountInCents,
      'date': dateStr,
      'category': _category,
      'note': _noteCtrl.text.trim(),
      'isIncome': _isIncome,
      'type': _isIncome ? 'income' : 'expense',
      'accountId': _selectedAccountId,
    };

    if (_status == 'planned') {
      payload['plannedAmount'] = amountInCents;
      payload['plannedDate'] = dateStr;
      if (_recurrence != 'none') {
        payload['recurrence'] = _recurrence;
      }
    }

    try {
      await budget.addTransaction(payload);
      if (mounted) {
        Navigator.of(context).pop(true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_status == 'planned'
                ? 'Planned commitment created'
                : 'Transaction recorded successfully'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save transaction: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final currency = budget.activeMonth?['currencySymbol']?.toString() ?? '₹';
    final categories = _isIncome ? _incomeCategories : _expenseCategories;

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
              // Header & Close
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Add Transaction',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.close, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Segmented Status Toggle: [ Successful / Paid ] [ Planned Commitment ]
              Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _status = 'successful'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: _status == 'successful'
                                ? (_isIncome ? AppColors.green : AppColors.primary)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            'Successful (Paid)',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: _status == 'successful'
                                  ? Colors.white
                                  : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _status = 'planned'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: _status == 'planned' ? AppColors.amber : Colors.transparent,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            'Planned Commitment',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: _status == 'planned'
                                  ? Colors.black87
                                  : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Income vs Expense Segmented Control
              Row(
                children: [
                  ChoiceChip(
                    label: const Text('Expense'),
                    selected: !_isIncome,
                    onSelected: (val) {
                      if (val) {
                        setState(() {
                          _isIncome = false;
                          _category = 'General';
                        });
                      }
                    },
                    selectedColor: AppColors.red.withAlpha(30),
                  ),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: const Text('Income'),
                    selected: _isIncome,
                    onSelected: (val) {
                      if (val) {
                        setState(() {
                          _isIncome = true;
                          _category = 'Salary';
                        });
                      }
                    },
                    selectedColor: AppColors.green.withAlpha(30),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Name / Description
              Text(
                'Description / Name *',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                ),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: _nameCtrl,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: isDark ? AppColors.darkText : AppColors.lightText,
                ),
                decoration: InputDecoration(
                  hintText: _isIncome ? 'e.g. Freelance project' : 'e.g. Grocery store, Netflix',
                  filled: true,
                  fillColor: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                ),
              ),
              const SizedBox(height: 14),

              // Amount
              Text(
                _status == 'planned' ? 'Planned Amount *' : 'Amount *',
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
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                ),
              ),
              const SizedBox(height: 14),

              // Date Picker
              AppDatePickerField(
                label: _status == 'planned' ? 'Planned Date *' : 'Transaction Date *',
                selectedDate: _selectedDate,
                onDateSelected: (newDate) => setState(() => _selectedDate = newDate),
              ),
              const SizedBox(height: 14),

              // Category Dropdown
              Text(
                'Category',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                ),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: categories.contains(_category) ? _category : categories.first,
                    isExpanded: true,
                    dropdownColor: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                    items: categories.map((cat) {
                      return DropdownMenuItem(
                        value: cat,
                        child: Text(cat, style: TextStyle(color: isDark ? AppColors.darkText : AppColors.lightText)),
                      );
                    }).toList(),
                    onChanged: (val) {
                      if (val != null) setState(() => _category = val);
                    },
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // Account Selector
              AccountSelector(
                label: _status == 'planned' ? 'Target Account (Optional)' : 'Account *',
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
              const SizedBox(height: 20),

              // Submit Button
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: _status == 'planned' ? AppColors.amber : AppColors.primary,
                  foregroundColor: _status == 'planned' ? Colors.black87 : Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(
                        _status == 'planned' ? 'Add Planned Commitment' : 'Record Transaction',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
