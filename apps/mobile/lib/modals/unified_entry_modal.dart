import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import '../widgets/app_date_picker.dart';
import '../widgets/account_selector.dart';

enum EntryType { transaction, income, item, goal, transfer }

class UnifiedEntryModal extends StatefulWidget {
  final EntryType initialType;

  const UnifiedEntryModal({super.key, this.initialType = EntryType.transaction});

  @override
  State<UnifiedEntryModal> createState() => _UnifiedEntryModalState();
}

class _UnifiedEntryModalState extends State<UnifiedEntryModal> {
  late EntryType _activeType;

  // Form Controllers
  final _nameCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _dayCtrl = TextEditingController(text: '${DateTime.now().day}');
  final _customCategoryCtrl = TextEditingController();

  // Selected State
  String _txType = 'expense'; // 'expense' | 'income'
  String _itemType = 'one-time'; // 'one-time' | 'recurring'
  bool _isFixed = false; // "Variable or not" toggle for planned expenses
  String _incSource = 'Salary'; // 'Salary' | 'Freelance' | 'Bonus' | 'Investment' | 'Other'
  int _goalPriority = 1; // 0 = High, 1 = Med, 2 = Low

  // Account State (Explicit Bank & Wallet Selection)
  String _accountType = 'bank'; // 'bank' | 'wallet'
  String? _selectedAccountId;

  // Transfer specific accounts
  String _sourceAccountType = 'bank';
  String? _sourceAccountId;
  String _destAccountType = 'wallet';
  String? _destAccountId;

  bool _submitting = false;

  // Server-authoritative goal recommendation state
  Timer? _debounceTimer;
  RecommendationResult? _serverGoalRec;
  bool _loadingGoalRec = false;

  // Date selection for one-time items, transactions, transfers, income, and goals
  late DateTime _selectedDate;

  // Category Selection
  final List<String> _quickCategories = const ['Food', 'Travel', 'Health', 'Other'];
  String _selectedCategory = 'Food';
  bool _isCustomCategory = false;

  @override
  void initState() {
    super.initState();
    _activeType = widget.initialType;
    final now = DateTime.now();
    _selectedDate = now;
    _amountCtrl.addListener(_onAmountChanged);

    final budget = Provider.of<BudgetProvider>(context, listen: false);
    if (budget.bankAccounts.isNotEmpty) {
      _accountType = 'bank';
      final primary = budget.bankAccounts.firstWhere((b) => b['isPrimary'] == true, orElse: () => budget.bankAccounts.first);
      _selectedAccountId = (primary['_id'] ?? primary['id'])?.toString();
    } else if (budget.wallets.isNotEmpty) {
      _accountType = 'wallet';
      final primary = budget.wallets.firstWhere((w) => w['isPrimary'] == true, orElse: () => budget.wallets.first);
      _selectedAccountId = (primary['_id'] ?? primary['id'])?.toString();
    }

    _sourceAccountType = 'bank';
    _sourceAccountId = budget.bankAccounts.isNotEmpty
        ? (budget.bankAccounts.first['_id'] ?? budget.bankAccounts.first['id'])?.toString()
        : (budget.wallets.isNotEmpty ? (budget.wallets.first['_id'] ?? budget.wallets.first['id'])?.toString() : null);

    _destAccountType = budget.wallets.isNotEmpty ? 'wallet' : 'bank';
    _destAccountId = budget.wallets.isNotEmpty
        ? (budget.wallets.first['_id'] ?? budget.wallets.first['id'])?.toString()
        : (budget.bankAccounts.length > 1 ? (budget.bankAccounts[1]['_id'] ?? budget.bankAccounts[1]['id'])?.toString() : null);

    if (_activeType == EntryType.goal) {
      _fetchGoalRecommendation();
    }
  }


  void _onAmountChanged() {
    if (_activeType == EntryType.goal) {
      _debounceTimer?.cancel();
      _debounceTimer = Timer(const Duration(milliseconds: 350), _fetchGoalRecommendation);
    }
  }

  Future<void> _fetchGoalRecommendation() async {
    final amt = toMinorUnits(num.tryParse(_amountCtrl.text) ?? 0);
    if (amt <= 0) {
      if (mounted) setState(() => _serverGoalRec = null);
      return;
    }
    if (mounted) setState(() => _loadingGoalRec = true);
    try {
      final budget = Provider.of<BudgetProvider>(context, listen: false);
      final res = await budget.recommendPurchaseDate(amt);
      if (mounted) {
        setState(() {
          _loadingGoalRec = false;
          _serverGoalRec = res.isNotEmpty ? RecommendationResult.fromJson(res) : null;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingGoalRec = false);
    }
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _nameCtrl.dispose();
    _amountCtrl.dispose();
    _dayCtrl.dispose();
    _customCategoryCtrl.dispose();
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
    final accounts = budget.allAccounts;

    final rawMonth = budget.activeMonth;
    final Map<String, dynamic> monthData = (rawMonth != null && rawMonth['month'] is Map)
        ? Map<String, dynamic>.from(rawMonth['month'] as Map)
        : (rawMonth ?? {});

    final num salaryAmt = monthData['incomeAmount'] ?? 0;
    String salaryBankName = 'Unassigned';
    final rawSalaryBank = monthData['salaryBankAccountId'];
    final targetBankId = (rawSalaryBank is Map) ? (rawSalaryBank['_id'] ?? rawSalaryBank['id']) : rawSalaryBank;
    if (targetBankId != null) {
      for (final a in accounts) {
        if ((a['_id'] ?? a['id'])?.toString() == targetBankId.toString()) {
          salaryBankName = a['name']?.toString() ?? 'Assigned Bank';
          break;
        }
      }
    }
    final salaryDayLabel = monthData['incomeCreditDate']?.toString() ?? 'Day ${monthData['incomeCreditDay'] ?? 1}';

    final isRecurring = _activeType == EntryType.item && _itemType == 'recurring';

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
                    'Quick Log & Schedule',
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
              const SizedBox(height: 12),

              // Segmented Tabs
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildTab(EntryType.transaction, 'Actual Spend', isDark),
                    const SizedBox(width: 6),
                    _buildTab(EntryType.income, 'Log Income', isDark),
                    const SizedBox(width: 6),
                    _buildTab(EntryType.item, 'Planned Expense', isDark),
                    const SizedBox(width: 6),
                    _buildTab(EntryType.goal, 'Purchase Goal', isDark),
                    const SizedBox(width: 6),
                    _buildTab(EntryType.transfer, 'Transfer', isDark),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Scheduled Monthly Salary Info Card for Income Mode (matching web)
              if (_activeType == EntryType.income && salaryAmt > 0) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'SCHEDULED MONTHLY SALARY',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                            ),
                          ),
                          Text(
                            '+${formatCurrency(salaryAmt)}',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              fontFamily: 'monospace',
                              color: AppColors.green,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Deposit Target: $salaryBankName',
                            style: TextStyle(
                              fontSize: 11,
                              color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted,
                            ),
                          ),
                          Text(
                            'Day: $salaryDayLabel',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: isDark ? AppColors.darkText : AppColors.lightText,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],

              // Type specific options
              if (_activeType == EntryType.transaction) ...[
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Center(child: Text('Expense')),
                        selected: _txType == 'expense',
                        onSelected: (_) => setState(() => _txType = 'expense'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ChoiceChip(
                        label: const Center(child: Text('Credit / Refund')),
                        selected: _txType == 'income',
                        onSelected: (_) => setState(() => _txType = 'income'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ] else if (_activeType == EntryType.income) ...[
                // Income Source Pills
                Text(
                  'Income Source / Category',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  children: ['Salary', 'Freelance', 'Bonus', 'Investment', 'Other'].map((src) {
                    final isSel = _incSource == src;
                    return ChoiceChip(
                      label: Text(src),
                      selected: isSel,
                      onSelected: (_) => setState(() => _incSource = src),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 14),
              ] else if (_activeType == EntryType.item) ...[
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Center(child: Text('One-Time')),
                        selected: _itemType == 'one-time',
                        onSelected: (_) => setState(() => _itemType = 'one-time'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ChoiceChip(
                        label: const Center(child: Text('Recurring (Monthly)')),
                        selected: _itemType == 'recurring',
                        onSelected: (_) => setState(() => _itemType = 'recurring'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Variable or Fixed Toggle Switch (Requirement 7)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                  child: SwitchListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      _isFixed ? 'Fixed Expense (Auto-carry forward)' : 'Variable Expense (Flexible)',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkText : AppColors.lightText,
                      ),
                    ),
                    subtitle: Text(
                      _isFixed
                          ? 'Fixed items automatically carry forward to next month on rollover.'
                          : 'Variable items stay within this cycle.',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted,
                      ),
                    ),
                    value: _isFixed,
                    activeTrackColor: AppColors.green,
                    onChanged: (val) => setState(() => _isFixed = val),
                  ),
                ),
                const SizedBox(height: 12),
              ] else if (_activeType == EntryType.goal) ...[
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Center(child: Text('High')),
                        selected: _goalPriority == 0,
                        onSelected: (_) => setState(() => _goalPriority = 0),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: ChoiceChip(
                        label: const Center(child: Text('Medium')),
                        selected: _goalPriority == 1,
                        onSelected: (_) => setState(() => _goalPriority = 1),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: ChoiceChip(
                        label: const Center(child: Text('Low')),
                        selected: _goalPriority == 2,
                        onSelected: (_) => setState(() => _goalPriority = 2),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],

              // Name / Description field
              TextField(
                controller: _nameCtrl,
                decoration: InputDecoration(
                  labelText: _activeType == EntryType.goal
                      ? 'Goal Name (e.g. New Headphones)'
                      : (_activeType == EntryType.income
                          ? 'Note / Payer Reference (optional)'
                          : (_activeType == EntryType.item ? 'Item Name (e.g. Internet Bill)' : 'Description')),
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),

              // Amount Field
              TextField(
                controller: _amountCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: _activeType == EntryType.income ? 'Income (₹) *' : 'Amount (₹) *',
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),

              // Date Picker or Recurring Day
              if (isRecurring)
                TextField(
                  controller: _dayCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Day of Month (1-31)', border: OutlineInputBorder()),
                )
              else
                AppDatePickerField(
                  label: _activeType == EntryType.goal
                      ? 'Target Date'
                      : (_activeType == EntryType.income ? 'Deposit Date' : 'Date'),
                  selectedDate: _selectedDate,
                  onDateSelected: (d) {
                    setState(() {
                      _selectedDate = d;
                      _dayCtrl.text = '${d.day}';
                    });
                  },
                ),
              const SizedBox(height: 12),


              // Purchase Goal Algorithm Recommendation Badge (Server Authoritative)
              if (_activeType == EntryType.goal) ...[
                if (_loadingGoalRec)
                  Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                    ),
                    child: Row(
                      children: [
                        const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                        const SizedBox(width: 10),
                        Text(
                          'Calculating optimal purchase date on server...',
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                          ),
                        ),
                      ],
                    ),
                  )
                else if (_serverGoalRec != null) ...[
                  Builder(
                    builder: (context) {
                      final goalRec = _serverGoalRec!;
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: goalRec.feasible ? AppColors.green.withAlpha(20) : AppColors.red.withAlpha(20),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: goalRec.feasible ? AppColors.green.withAlpha(100) : AppColors.red.withAlpha(100),
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              goalRec.feasible ? Icons.auto_awesome : Icons.warning_amber_rounded,
                              size: 18,
                              color: goalRec.feasible ? AppColors.green : AppColors.red,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    goalRec.feasible
                                        ? 'Recommended Date: ${goalRec.recommendedDate} (Day ${goalRec.recommendedDay})'
                                        : 'Deficit Risk: Floor breach predicted',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                      color: goalRec.feasible ? AppColors.green : AppColors.red,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    goalRec.feasible
                                        ? 'Leaves buffer of ${formatCurrency(goalRec.savingsBuffer)} above safety floor.'
                                        : 'Purchasing this cycle breaches your configured safety floor.',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (goalRec.feasible && goalRec.recommendedDate != null)
                              TextButton(
                                onPressed: () {
                                  try {
                                    final parsed = DateTime.parse(goalRec.recommendedDate!);
                                    setState(() {
                                      _selectedDate = parsed;
                                      _dayCtrl.text = '${parsed.day}';
                                    });
                                  } catch (_) {}
                                },
                                child: const Text('Apply Date', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                ],
                const SizedBox(height: 12),
              ],

              // Account Selector (Bank Account / Wallet)
              if (_activeType != EntryType.goal && _activeType != EntryType.transfer) ...[
                AccountSelector(
                  label: _activeType == EntryType.income ? 'Deposited To Account' : 'Payment Account',
                  accountType: _accountType,
                  selectedAccountId: _selectedAccountId,
                  bankAccounts: budget.bankAccounts,
                  wallets: budget.wallets,
                  isRequired: _activeType == EntryType.income,
                  onChanged: (newType, newId) {
                    setState(() {
                      _accountType = newType;
                      _selectedAccountId = newId;
                    });
                  },
                ),
              ] else if (_activeType == EntryType.transfer) ...[
                AccountSelector(
                  label: 'Source Account (From)',
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
                  label: 'Destination Account (To)',
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
              ],


              // Selectable Categories matching Web
              if (_activeType == EntryType.item || (_activeType == EntryType.transaction && _txType != 'income')) ...[
                const SizedBox(height: 14),
                Text(
                  'Category',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ..._quickCategories.map((cat) {
                      final isSelected = !_isCustomCategory && _selectedCategory == cat;
                      return ChoiceChip(
                        label: Text(cat),
                        selected: isSelected,
                        onSelected: (_) => setState(() {
                          _selectedCategory = cat;
                          _isCustomCategory = false;
                        }),
                      );
                    }),
                    ChoiceChip(
                      label: const Text('Custom...'),
                      selected: _isCustomCategory,
                      onSelected: (_) => setState(() {
                        _isCustomCategory = true;
                      }),
                    ),
                  ],
                ),
                if (_isCustomCategory) ...[
                  const SizedBox(height: 10),
                  TextField(
                    controller: _customCategoryCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Custom Category (e.g. Rent, Utilities)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ],
              const SizedBox(height: 20),

              // Submit Button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _activeType == EntryType.income
                        ? AppColors.green
                        : (isDark ? Colors.white : Colors.black),
                    foregroundColor: _activeType == EntryType.income
                        ? Colors.white
                        : (isDark ? Colors.black : Colors.white),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: _submitting ? null : _handleSubmit,
                  child: _submitting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(
                          _activeType == EntryType.income
                              ? 'Log Income Inflow'
                              : 'Add ${_titleForType(_activeType)}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTab(EntryType type, String title, bool isDark) {
    final isSelected = _activeType == type;
    return InkWell(
      onTap: () {
        setState(() => _activeType = type);
        if (type == EntryType.goal) {
          _fetchGoalRecommendation();
        }
      },
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? (type == EntryType.income ? AppColors.green : (isDark ? Colors.white : Colors.black))
              : (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          title,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: isSelected
                ? Colors.white
                : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
          ),
        ),
      ),
    );
  }

  String _titleForType(EntryType type) {
    switch (type) {
      case EntryType.transaction:
        return 'Actual Spend';
      case EntryType.income:
        return 'Income';
      case EntryType.item:
        return 'Planned Commitment';
      case EntryType.goal:
        return 'Purchase Goal';
      case EntryType.transfer:
        return 'Transfer';
    }
  }

  Future<void> _handleSubmit() async {
    final budget = context.read<BudgetProvider>();
    final amt = toMinorUnits(num.tryParse(_amountCtrl.text) ?? 0);
    final isRecurring = _activeType == EntryType.item && _itemType == 'recurring';
    final day = isRecurring ? (int.tryParse(_dayCtrl.text) ?? 1) : _selectedDate.day;
    final dateStr = _formatDateYmd(_selectedDate);
    final name = _nameCtrl.text.trim().isEmpty ? 'Entry' : _nameCtrl.text.trim();

    if (amt <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter a valid amount')));
      return;
    }

    setState(() => _submitting = true);

    try {
      final isWallet = _accountType == 'wallet';
      final cat = _isCustomCategory ? _customCategoryCtrl.text.trim() : _selectedCategory;

      if (_activeType == EntryType.income) {
        if (_selectedAccountId == null) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select a destination Bank Account or Wallet')));
          setState(() => _submitting = false);
          return;
        }

        final incNote = _nameCtrl.text.trim();
        await budget.addTransaction({
          'amount': amt,
          'isIncome': true,
          'tag': _incSource,
          'category': _incSource,
          'note': incNote,
          'description': incNote.isNotEmpty ? incNote : '$_incSource Inflow',
          'date': dateStr,
          'day': _selectedDate.day,
          'type': 'income',
          'accountType': isWallet ? 'wallet' : 'bank',
          if (!isWallet) 'bankAccountId': _selectedAccountId,
          if (isWallet) 'walletId': _selectedAccountId,
        });
      } else if (_activeType == EntryType.transaction) {
        final isTxIncome = _txType == 'income';
        await budget.addTransaction({
          'description': name,
          'amount': amt,
          'day': day,
          'date': dateStr,
          'type': _txType,
          'isIncome': isTxIncome,
          'category': isTxIncome ? 'Credit' : (cat.isNotEmpty ? cat : 'Other'),
          'tag': isTxIncome ? 'Credit' : (cat.isNotEmpty ? cat : 'Other'),
          if (_selectedAccountId != null) ...{
            'accountType': isWallet ? 'wallet' : 'bank',
            if (!isWallet) 'bankAccountId': _selectedAccountId,
            if (isWallet) 'walletId': _selectedAccountId,
          },
        });
      } else if (_activeType == EntryType.item) {
        await budget.addItem({
          'name': name,
          'amount': amt,
          'day': day,
          'dayOfMonth': isRecurring ? day : null,
          'date': isRecurring ? null : dateStr,
          'type': _itemType,
          'category': cat.isNotEmpty ? cat : 'Other',
          'isFixed': _isFixed,
          if (_selectedAccountId != null) ...{
            'accountType': isWallet ? 'wallet' : 'bank',
            if (!isWallet) 'bankAccountId': _selectedAccountId,
            if (isWallet) 'walletId': _selectedAccountId,
          },
        });

      } else if (_activeType == EntryType.goal) {
        await budget.addGoal({
          'name': name,
          'targetAmount': amt,
          'priority': _goalPriority,
          'targetDate': dateStr,
        });
      } else if (_activeType == EntryType.transfer) {
        final srcId = _sourceAccountId;
        final dstId = _destAccountId;
        final isSrcWallet = _sourceAccountType == 'wallet';
        final isDstWallet = _destAccountType == 'wallet';

        if (srcId == null || dstId == null || (srcId == dstId && _sourceAccountType == _destAccountType)) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select distinct source and destination accounts')));
          setState(() => _submitting = false);
          return;
        }

        await budget.addTransfer({
          'sourceType': isSrcWallet ? 'wallet' : 'bank',
          'sourceBankAccountId': isSrcWallet ? null : srcId,
          'sourceWalletId': isSrcWallet ? srcId : null,
          'destinationType': isDstWallet ? 'wallet' : 'bank',
          'destinationBankAccountId': isDstWallet ? null : dstId,
          'destinationWalletId': isDstWallet ? dstId : null,
          'amount': amt,
          'date': dateStr,
          'note': name,
        });
      }


      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
