import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../engine/category_suggest.dart';
import '../engine/entry_assists.dart';
import 'mark_paid_modal.dart';
import 'salary_safeline_modal.dart';
import '../services/entry_memory.dart';
import '../widgets/confirm_dialog.dart';
import '../theme/app_form.dart';
import '../theme/app_colors.dart';
import 'held_lent_modal.dart';
import '../widgets/floor_breach_notice.dart';
import '../widgets/app_date_picker.dart';
import '../widgets/account_selector.dart';

enum EntryType { transaction, income, item, goal, transfer }

/// Name saved for an entry: what the user typed, else the category (as on web),
/// else the entry type's title. Never a generic "Entry".
String resolveEntryName(String typed, String category, String typeTitle) {
  final t = typed.trim();
  if (t.isNotEmpty) return t;
  final c = category.trim();
  return c.isNotEmpty ? c : typeTitle;
}

class UnifiedEntryModal extends StatefulWidget {
  final EntryType initialType;

  /// Editing: the record to change (a transaction, planned bill or goal). The type
  /// is locked while editing, as on web.
  final Map<String, dynamic>? initialItem;

  const UnifiedEntryModal({super.key, this.initialType = EntryType.transaction, this.initialItem});

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

  // Move tab: 'account' (between my accounts), 'card' (pay a card bill), 'person' (held / lent)
  String _moveTarget = 'account';

  // Refund: the recorded spend it gives money back for (ADR 0062)
  String? _refundTargetId;
  String? _cardId;

  // Server-authoritative goal recommendation state
  Timer? _debounceTimer;
  RecommendationResult? _serverGoalRec;
  bool _loadingGoalRec = false;

  // Date selection for one-time items, transactions, transfers, income, and goals
  late DateTime _selectedDate;

  // Category Selection
  final List<String> _quickCategories = const ['Food', 'Travel', 'Utilities', 'Health', 'Other'];

  /// Quick amounts (major units). Tapping one sets the amount.
  static const List<int> quickAmounts = [100, 500, 1000, 2000];
  String _selectedCategory = 'Food';
  bool _isCustomCategory = false;

  // Category suggestion stops once the user picks a category
  bool _categoryTouched = false;
  bool _tagSuggested = false;
  EntryMemory? _memory;

  // "Save & add another": entries saved since the sheet opened
  int _sessionCount = 0;
  int _sessionTotal = 0;
  final FocusNode _amountFocus = FocusNode();
  late final BudgetProvider _budgetRef;

  // Smart assists: people (for the held/lent hint), dismissed hints, the person preset
  List<dynamic> _personFunds = const [];
  final Set<String> _dismissedAssists = {};
  String? _personAction;
  String? _personFundId;
  String _personName = '';

  @override
  void initState() {
    super.initState();
    _activeType = widget.initialType;
    final now = DateTime.now();
    _selectedDate = now;
    _amountCtrl.addListener(_onAmountChanged);

    final budget = Provider.of<BudgetProvider>(context, listen: false);
    _budgetRef = budget;
    if (widget.initialItem == null) {
      budget.getPersonFunds().then((res) {
        if (!mounted) return;
        final list = res['funds'];
        if (list is List) setState(() => _personFunds = list);
      }).catchError((_) {});
    }
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

    if (widget.initialItem != null) _prefillFromItem(budget);

    // Remembered: the account used last time for this kind of entry
    EntryMemory.load().then((memory) {
      if (!mounted) return;
      _memory = memory;
      if (_isEditing) return;
      final remembered = memory.accountFor(_activeType.name);
      if (remembered == null) return;
      final type = remembered['accountType']!;
      final id = remembered['accountId']!;
      final pool = type == 'wallet' ? budget.wallets : (type == 'credit_card' ? budget.creditCards : budget.bankAccounts);
      final cardsAllowed = _activeType == EntryType.transaction || _activeType == EntryType.item;
      if ((type == 'credit_card' && !cardsAllowed) || !pool.any((a) => (a['_id'] ?? a['id'])?.toString() == id)) return;
      setState(() {
        if (_activeType == EntryType.transfer) {
          if (type == 'credit_card') return;
          _sourceAccountType = type;
          _sourceAccountId = id;
        } else {
          _accountType = type;
          _selectedAccountId = id;
        }
      });
    });
  }

  bool get _isEditing => widget.initialItem != null;

  /// Recorded spends a refund can be linked to, newest first.
  List<Map<String, dynamic>> _refundTargets(BudgetProvider budget) {
    const passThrough = ['held_in', 'held_return', 'lent_out', 'lent_repaid'];
    final editingId = _isEditing ? _editId : null;
    final list = budget.transactions
        .whereType<Map>()
        .map((t) => Map<String, dynamic>.from(t))
        .where((t) {
          final id = (t['_id'] ?? t['id'])?.toString();
          final amount = num.tryParse('${t['amount'] ?? 0}') ?? 0;
          return id != null &&
              id != editingId &&
              t['status'] == 'successful' &&
              amount > 0 &&
              t['isIncome'] != true &&
              t['origin'] != 'transfer' &&
              t['origin'] != 'salary' &&
              !passThrough.contains(t['origin']) &&
              // A fully refunded spend can't take another refund
              (_refundRemaining(budget, t) > 0 || id == _refundTargetId);
        })
        .toList()
      ..sort((a, b) => '${b['date'] ?? ''}'.compareTo('${a['date'] ?? ''}'));
    return list.take(100).toList();
  }

  /// What is left to refund on a spend: its amount minus the refunds already
  /// linked to it (ADR 0062), leaving out the refund being edited. Never the
  /// spend's original amount on its own.
  int _refundRemaining(BudgetProvider budget, Map<String, dynamic> spend) {
    final spendId = (spend['_id'] ?? spend['id'])?.toString();
    final editingId = _isEditing ? _editId : null;
    var refunded = 0;
    for (final t in budget.transactions.whereType<Map>()) {
      if (spendId == null || t['refundTargetTransactionId']?.toString() != spendId) continue;
      if (editingId != null && (t['_id'] ?? t['id'])?.toString() == editingId) continue;
      final amount = num.tryParse('${t['amount'] ?? 0}') ?? 0;
      if (amount < 0) refunded += amount.round().abs();
    }
    final left = _minorOf(spend['amount']) - refunded;
    return left > 0 ? left : 0;
  }

  /// The spend this refund is (or will be) linked to, if it is in the list.
  Map<String, dynamic>? _linkedSpend(BudgetProvider budget) {
    final String? id = _isEditing ? (widget.initialItem?['refundTargetTransactionId']?.toString()) : _refundTargetId;
    if (id == null) return null;
    for (final t in budget.transactions.whereType<Map>()) {
      if ((t['_id'] ?? t['id'])?.toString() == id) return Map<String, dynamic>.from(t);
    }
    return null;
  }

  String _txLabel(Map<String, dynamic> t, {int? remaining}) {
    final name = (t['title'] ?? t['name'] ?? t['description'] ?? t['category'] ?? 'Spend').toString();
    final date = t['date']?.toString();
    final paid = _minorOf(t['amount']);
    final amountText = remaining != null && remaining < paid
        ? '${formatCurrency(remaining)} left of ${formatCurrency(paid)}'
        : formatCurrency(paid);
    return '$name · $amountText${date != null && date.length >= 10 ? ' · ${date.substring(0, 10)}' : ''}';
  }

  /// "Refund for": pick the spend this refund gives money back for. Set when the
  /// refund is created; shown read-only when editing (the server doesn't change it).
  Widget _buildRefundLink(BudgetProvider budget) {
    final targets = _refundTargets(budget);
    if (_isEditing) {
      final linkedId = widget.initialItem?['refundTargetTransactionId']?.toString();
      Map<String, dynamic>? linked;
      for (final t in budget.transactions.whereType<Map>()) {
        if ((t['_id'] ?? t['id'])?.toString() == linkedId) linked = Map<String, dynamic>.from(t);
      }
      return Text(
        linked != null ? 'Refund for ${_txLabel(linked)}' : (linkedId != null ? 'Linked to an earlier spend.' : 'Not linked to a spend.'),
        key: const ValueKey('refund-link-readonly'),
        style: const TextStyle(fontSize: 12),
      );
    }
    final valid = targets.any((t) => (t['_id'] ?? t['id']).toString() == _refundTargetId);
    return DropdownButtonFormField<String?>(
      key: const ValueKey('refund-for'),
      initialValue: valid ? _refundTargetId : null,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Refund for'),
      items: [
        const DropdownMenuItem<String?>(value: null, child: Text('Not linked to a spend')),
        ...targets.map((t) => DropdownMenuItem<String?>(
              value: (t['_id'] ?? t['id']).toString(),
              child: Text(_txLabel(t, remaining: _refundRemaining(budget, t)), overflow: TextOverflow.ellipsis),
            )),
      ],
      onChanged: (id) => setState(() {
        _refundTargetId = id;
        if (id == null) return;
        final target = targets.firstWhere((t) => (t['_id'] ?? t['id']).toString() == id);
        // Same category and account as the spend being refunded, unless already chosen
        final cat = (target['category'] ?? '').toString();
        if (!_categoryTouched && _quickCategories.contains(cat)) {
          _selectedCategory = cat;
          _isCustomCategory = false;
        }
        final acc = _plainId(target['accountId']) ?? _plainId(target['bankAccountId']) ?? _plainId(target['walletId']);
        if (acc != null) {
          bool inList(List<dynamic> l) => l.any((a) => _plainId(a) == acc);
          if (inList(budget.bankAccounts) || inList(budget.wallets) || inList(budget.creditCards)) {
            _accountType = inList(budget.wallets) ? 'wallet' : (inList(budget.creditCards) ? 'credit_card' : 'bank');
            _selectedAccountId = acc;
          }
        }
        if (_nameCtrl.text.trim().isEmpty) {
          _nameCtrl.text = 'Refund: ${(target['title'] ?? target['name'] ?? 'spend')}';
        }
      }),
    );
  }

  String? _plainId(dynamic v) => v is Map ? (v['_id'] ?? v['id'])?.toString() : v?.toString();

  String get _editId => (widget.initialItem?['_id'] ?? widget.initialItem?['id'] ?? '').toString();

  /// Fill the form from the record being edited, so saving without changes
  /// sends back what was there.
  void _prefillFromItem(BudgetProvider budget) {
    final item = widget.initialItem!;
    final rawAmount = num.tryParse('${item['amount'] ?? item['targetAmount'] ?? item['plannedAmount'] ?? 0}') ?? 0;
    final amt = rawAmount.abs();
    if (amt > 0) _amountCtrl.text = (amt / 100).toStringAsFixed(amt % 100 == 0 ? 0 : 2);
    _nameCtrl.text = (item['title'] ?? item['name'] ?? item['description'] ?? '').toString();
    final parsed = DateTime.tryParse('${item['date'] ?? ''}');
    if (parsed != null) _selectedDate = parsed;

    if (_activeType == EntryType.goal) {
      _goalPriority = (num.tryParse('${item['priority'] ?? 1}') ?? 1).toInt();
      return;
    }
    final cat = (item['category'] ?? item['tag'] ?? '').toString();
    if (_activeType == EntryType.income) {
      if (cat.isNotEmpty) _incSource = cat;
    } else if (cat.isNotEmpty) {
      if (_quickCategories.contains(cat)) {
        _selectedCategory = cat;
      } else {
        _isCustomCategory = true;
        _customCategoryCtrl.text = cat;
      }
      _categoryTouched = true;
    }
    if (_activeType == EntryType.transaction && rawAmount < 0) _txType = 'income';
    if (_activeType == EntryType.item) {
      _itemType = item['type'] == 'recurring' ? 'recurring' : 'one-time';
      if (_itemType == 'recurring') _dayCtrl.text = '${item['dayOfMonth'] ?? 1}';
      _isFixed = item['isFixed'] == true;
    }
    final accId = _plainId(item['accountId']) ?? _plainId(item['bankAccountId']) ?? _plainId(item['walletId']);
    if (accId != null && accId.isNotEmpty) {
      bool inList(List<dynamic> l) => l.any((a) => _plainId(a) == accId);
      _accountType = inList(budget.wallets) ? 'wallet' : (inList(budget.creditCards) ? 'credit_card' : 'bank');
      _selectedAccountId = accId;
    }
  }

  // Save helpers: update when editing, create otherwise
  Future<void> _saveTx(BudgetProvider budget, Map<String, dynamic> payload) =>
      _isEditing ? budget.updateTransaction(_editId, payload) : budget.addTransaction(payload);

  Future<void> _saveItem(BudgetProvider budget, Map<String, dynamic> payload) =>
      _isEditing ? budget.updateItem(_editId, payload) : budget.addItem(payload);

  Future<void> _saveGoal(BudgetProvider budget, Map<String, dynamic> payload) => _isEditing
      ? budget.updateGoal(_editId, {
          'name': payload['name'],
          'targetAmount': payload['targetAmount'],
          'priority': payload['priority'],
        })
      : budget.addGoal(payload);

  bool get _isDirty => _amountCtrl.text.trim().isNotEmpty || _nameCtrl.text.trim().isNotEmpty;

  void _onDescriptionChanged(String value) {
    if (_categoryTouched) return;
    if (_activeType != EntryType.transaction && _activeType != EntryType.item) return;
    final suggested = suggestCategory(value, allowed: _quickCategories, remembered: _memory?.categoryFor);
    if (suggested != null && (suggested != _selectedCategory || _isCustomCategory)) {
      setState(() {
        _selectedCategory = suggested;
        _isCustomCategory = false;
        _tagSuggested = true;
      });
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
      // Captured in initState: this can run from a timer after the sheet has closed
      final res = await _budgetRef.recommendPurchaseDate(amt);
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
    _amountFocus.dispose();
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

    // Ask before throwing away a half-filled entry (back button, close icon)
    // canPop stays false and the check happens when the pop is attempted: typing
    // doesn't rebuild the sheet, so a build-time "is it dirty" would be stale.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        if (!_isDirty || _submitting) {
          navigator.pop();
          return;
        }
        final discard = await confirmDestructive(
          context,
          title: 'Discard this entry?',
          message: 'What you typed will be lost.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep editing',
        );
        if (discard && mounted) {
          _amountCtrl.clear();
          _nameCtrl.clear();
          navigator.pop();
        }
      },
      child: Padding(
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
                  // Expanded: a long title ("Edit purchase goal") must not push the close button off
                  Expanded(
                    child: Text(
                      _isEditing
                          ? 'Edit ${_titleForType(_activeType).toLowerCase()}'
                          : (widget.initialType == EntryType.goal ? 'New purchase goal' : 'New entry'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: isDark ? AppColors.darkText : AppColors.lightText,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    // maybePop goes through the discard guard
                    onPressed: () => Navigator.maybePop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Segmented tabs: four equal segments, no horizontal scrolling
              if (widget.initialType != EntryType.goal && !_isEditing)
                Row(
                  children: [
                    _buildTab(EntryType.transaction, 'Spend', isDark),
                    const SizedBox(width: 4),
                    _buildTab(EntryType.income, 'Income', isDark),
                    const SizedBox(width: 4),
                    _buildTab(EntryType.item, 'Plan', isDark),
                    const SizedBox(width: 4),
                    _buildTab(EntryType.transfer, 'Move', isDark),
                  ],
                ),

              // Move: where the money goes
              if (_activeType == EntryType.transfer) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ChoiceChip(
                      label: const Text('My accounts'),
                      selected: _moveTarget == 'account',
                      onSelected: (_) => setState(() => _moveTarget = 'account'),
                    ),
                    if (budget.creditCards.isNotEmpty)
                      ChoiceChip(
                        label: const Text('Pay a card'),
                        selected: _moveTarget == 'card',
                        onSelected: (_) => setState(() {
                          _moveTarget = 'card';
                          _cardId ??= _idOf(budget.creditCards.first);
                        }),
                      ),
                    ChoiceChip(
                      label: const Text('A person'),
                      selected: _moveTarget == 'person',
                      onSelected: (_) => setState(() => _moveTarget = 'person'),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 16),

              if (_sessionCount > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    '$_sessionCount added · ${formatCurrency(_sessionTotal)}',
                    key: const ValueKey('entry-session'),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.green),
                  ),
                ),

              if (_isPersonMove)
                HeldLentForm(
                  initialAction: _personAction ?? 'lend',
                  initialFundId: _personFundId,
                  initialPersonName: _personName,
                  initialAmount: _amountCtrl.text.trim(),
                  initialNote: _nameCtrl.text.trim(),
                  initialDate: _selectedDate,
                  initialAccountId: _sourceAccountId,
                  onSaved: () => Navigator.pop(context),
                ),

              if (!_isPersonMove) ...[
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
                          // Flexible: the label shrinks on narrow phones instead of overflowing
                          Flexible(
                            child: Text(
                              'SCHEDULED MONTHLY SALARY',
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.5,
                                color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                              ),
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
                          Flexible(
                            child: Text(
                              'Deposit Target: $salaryBankName',
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted,
                              ),
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
                        onSelected: (_) => setState(() {
                          _txType = 'expense';
                          _refundTargetId = null;
                        }),
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
                if (_txType == 'income') ...[
                  _buildRefundLink(budget),
                  const SizedBox(height: 12),
                ],
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
                onChanged: _onDescriptionChanged,
                decoration: InputDecoration(
                  labelText: _activeType == EntryType.goal
                      ? 'Goal Name (e.g. New Headphones)'
                      : (_activeType == EntryType.income
                          ? 'Note / Payer Reference (optional)'
                          : (_activeType == EntryType.item ? 'Item Name (e.g. Internet Bill)' : 'Description')),
                ),
              ),
              const SizedBox(height: 12),

              // Amount Field
              TextField(
                controller: _amountCtrl,
                focusNode: _amountFocus,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: _activeType == EntryType.income ? 'Income (₹) *' : 'Amount (₹) *',
                ),
              ),
              if (_activeType != EntryType.goal) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: quickAmounts.map((v) => ActionChip(
                        label: Text(v >= 1000 ? '${v ~/ 1000}k' : '$v'),
                        onPressed: () => setState(() => _amountCtrl.text = '$v'),
                      )).toList(),
                ),
              ],
              const SizedBox(height: 12),

              // Date Picker or Recurring Day
              if (isRecurring)
                TextField(
                  controller: _dayCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Day of Month (1-31)'),
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
                        // Expanded: the fixed-width text overflowed narrow phones
                        Expanded(
                          child: Text(
                            'Calculating optimal purchase date on server...',
                            style: TextStyle(
                              fontSize: 11,
                              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                            ),
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
                  bankAccounts: budget.bankAccountModels,
                  wallets: budget.walletModels,
                  creditCards: _activeType == EntryType.transaction || _activeType == EntryType.item ? budget.cardAccountModels : const [],
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
                  label: _moveTarget == 'card' ? 'Pay from' : 'Source Account (From)',
                  accountType: _sourceAccountType,
                  selectedAccountId: _sourceAccountId,
                  bankAccounts: budget.bankAccountModels,
                  wallets: budget.walletModels,
                  isRequired: true,
                  onChanged: (newType, newId) {
                    setState(() {
                      _sourceAccountType = newType;
                      _sourceAccountId = newId;
                    });
                  },
                ),
                const SizedBox(height: 12),
                if (_moveTarget == 'card') ...[
                  Text('Card to pay', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary)),
                  const SizedBox(height: AppForm.fieldGap),
                  ...budget.creditCards.map((c) {
                    final card = Map<String, dynamic>.from(c as Map);
                    final id = _idOf(card);
                    final bill = card['openBill'] is Map ? Map<String, dynamic>.from(card['openBill'] as Map) : null;
                    final remaining = (num.tryParse('${bill?['remaining'] ?? 0}') ?? 0).round();
                    final owed = (num.tryParse('${card['outstanding'] ?? 0}') ?? 0).round();
                    final selected = id == _cardId;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: InkWell(
                        borderRadius: AppForm.radius,
                        onTap: () => setState(() => _cardId = id),
                        child: Container(
                          width: double.infinity,
                          constraints: const BoxConstraints(minHeight: AppForm.controlHeight),
                          padding: AppForm.fieldPadding,
                          decoration: BoxDecoration(
                            color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                            borderRadius: AppForm.radius,
                            border: Border.all(
                              color: selected ? (isDark ? AppColors.darkText : AppColors.lightText) : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                              width: selected ? 1.5 : 1,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(card['name']?.toString() ?? 'Card', style: const TextStyle(fontWeight: FontWeight.w600)),
                              Text(
                                'Owes ${formatCurrency(owed)}${remaining > 0 ? ' · bill ${formatCurrency(remaining)}' : ''}',
                                style: TextStyle(fontSize: 12, color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }),
                  Builder(builder: (_) {
                    final card = _selectedCard(budget);
                    final bill = card != null && card['openBill'] is Map ? Map<String, dynamic>.from(card['openBill'] as Map) : null;
                    final remaining = (num.tryParse('${bill?['remaining'] ?? 0}') ?? 0).round();
                    final minimum = (num.tryParse('${bill?['minimumDue'] ?? 0}') ?? 0).round();
                    final owed = (num.tryParse('${card?['outstanding'] ?? 0}') ?? 0).round();
                    String major(int minor) => (minor / 100).toStringAsFixed(2);
                    return Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (remaining > 0)
                          ActionChip(label: Text('Bill ${formatCurrency(remaining)}'), onPressed: () => setState(() => _amountCtrl.text = major(remaining))),
                        if (minimum > 0)
                          ActionChip(label: Text('Minimum ${formatCurrency(minimum < remaining || remaining == 0 ? minimum : remaining)}'), onPressed: () => setState(() => _amountCtrl.text = major(minimum < remaining || remaining == 0 ? minimum : remaining))),
                        if (owed > 0)
                          ActionChip(label: Text('All owed ${formatCurrency(owed)}'), onPressed: () => setState(() => _amountCtrl.text = major(owed))),
                      ],
                    );
                  }),
                ] else
                AccountSelector(
                  label: 'Destination Account (To)',
                  accountType: _destAccountType,
                  selectedAccountId: _destAccountId,
                  bankAccounts: budget.bankAccountModels,
                  wallets: budget.walletModels,
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
              if (_activeType == EntryType.item || _activeType == EntryType.transaction) ...[
                const SizedBox(height: 14),
                Text(
                  _tagSuggested ? 'Category · suggested' : 'Category',
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
                          _categoryTouched = true;
                          _tagSuggested = false;
                        }),
                      );
                    }),
                    ChoiceChip(
                      label: const Text('Custom...'),
                      selected: _isCustomCategory,
                      onSelected: (_) => setState(() {
                        _isCustomCategory = true;
                        _categoryTouched = true;
                        _tagSuggested = false;
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
                    ),
                  ),
                ],
              ],
              // Smart assists: rebuilt as the amount or description changes
              if (!_isEditing && (_activeType == EntryType.transaction || _activeType == EntryType.income))
                AnimatedBuilder(
                  animation: Listenable.merge([_amountCtrl, _nameCtrl]),
                  builder: (context, _) => _buildAssist(budget, monthData, isDark),
                ),
              // Safety floor: spending from, or moving money out of, a bank account or wallet
              if ((_activeType == EntryType.transaction && _txType == 'expense') || _activeType == EntryType.transfer)
                FloorBreachNotice(
                  amountController: _amountCtrl,
                  accountId: _activeType == EntryType.transfer ? _sourceAccountId : _selectedAccountId,
                  showWhenSafe: true,
                ),
              const SizedBox(height: 20),

              if (_canAddAnother) ...[
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    key: const ValueKey('save-add-another'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(AppForm.controlHeight),
                      shape: RoundedRectangleBorder(borderRadius: AppForm.radius),
                    ),
                    onPressed: _submitting ? null : () => _handleSubmit(again: true),
                    child: const Text('Save & add another'),
                  ),
                ),
                const SizedBox(height: 8),
              ],

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
                  onPressed: _submitting ? null : () => _handleSubmit(),
                  child: _submitting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(
                          _isEditing
                              ? 'Save changes'
                              : _activeType == EntryType.income
                              ? 'Log Income Inflow'
                              : (_activeType == EntryType.transfer
                                  ? (_moveTarget == 'card' ? 'Pay ${_selectedCard(budget)?['name'] ?? 'card'}' : 'Record transfer')
                                  : 'Add ${_titleForType(_activeType)}'),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                ),
              ),
              ],
            ],
          ),
        ),
      ),
    ),
    );
  }

  /// One assist at a time: planned bill > duplicate salary > someone else's money.
  Widget _buildAssist(BudgetProvider budget, Map<String, dynamic> monthData, bool isDark) {
    final amount = toMinorUnits(num.tryParse(_amountCtrl.text) ?? 0);
    final description = _nameCtrl.text;
    final navigator = Navigator.of(context);

    Widget banner(String key, String message, List<Widget> actions, {bool warn = false}) => Container(
          key: ValueKey(key),
          margin: const EdgeInsets.only(top: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: warn ? AppColors.amber.withAlpha(25) : AppColors.primary.withAlpha(20),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: warn ? AppColors.amber.withAlpha(90) : AppColors.primary.withAlpha(70)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(message, style: const TextStyle(fontSize: 13, height: 1.35)),
            const SizedBox(height: 6),
            Wrap(spacing: 8, children: actions),
          ]),
        );

    // A spend that pays a planned bill
    if (_activeType == EntryType.transaction && _txType == 'expense' && !_dismissedAssists.contains('bill')) {
      final planned = budget.transactions.where((t) => t is Map && t['status'] == 'planned').toList();
      final bill = findBillMatch(planned, amount: amount, description: description, today: _formatDateYmd(DateTime.now()));
      if (bill != null) {
        return banner('assist-bill', 'Paying ${bill['name'] ?? bill['title'] ?? 'a planned bill'} (${formatCurrency(_minorOf(bill['plannedAmount'] ?? bill['amount']))})?', [
          TextButton(onPressed: () => setState(() => _dismissedAssists.add('bill')), child: const Text('No')),
          FilledButton(
            onPressed: () {
              final rootContext = navigator.context;
              navigator.pop();
              showModalBottomSheet(
                context: rootContext,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => MarkPaidModal(transaction: bill),
              );
            },
            child: const Text('Yes, mark it paid'),
          ),
        ]);
      }
    }

    // Salary already in the plan
    if (_activeType == EntryType.income && !_dismissedAssists.contains('salary')) {
      final salary = detectDuplicateSalary(description: description, amount: amount, month: monthData);
      if (salary != null) {
        return banner(
          'assist-salary',
          'Your ${formatCurrency(salary['amount'] as int)} salary${salary['date'] != null ? ' on ${salary['date']}' : ''} is already in the plan. Logging it here counts it twice.',
          [
            TextButton(onPressed: () => setState(() => _dismissedAssists.add('salary')), child: const Text("It's extra income")),
            FilledButton(
              onPressed: () {
                final rootContext = navigator.context;
                navigator.pop();
                showModalBottomSheet(
                  context: rootContext,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => const SalarySafelineModal(),
                );
              },
              child: const Text('Update salary instead'),
            ),
          ],
          warn: true,
        );
      }
    }

    // Someone else's money
    if (!_dismissedAssists.contains('person')) {
      final flow = _activeType == EntryType.income || _txType == 'income' ? 'in' : 'out';
      final hint = detectPersonHint(description: description, flow: flow, funds: _personFunds);
      if (hint != null) {
        final action = hint['action'] as String;
        final who = (hint['personName'] as String).isEmpty ? 'someone' : hint['personName'] as String;
        final possessive = who == 'someone' ? "someone's" : "$who's";
        final question = {
          'hold': 'Is this $possessive money to keep?',
          'repaid': 'Is $who paying back money you lent?',
          'lend': 'Lending this to $who?',
          'return': 'Giving back $possessive money?',
        }[action]!;
        return banner('assist-person', "$question It wouldn't count as ${flow == 'in' ? 'income' : 'spending'}.", [
          TextButton(onPressed: () => setState(() => _dismissedAssists.add('person')), child: const Text('No')),
          FilledButton(
            onPressed: () => setState(() {
              final fund = hint['fund'] as Map<String, dynamic>?;
              _personAction = action;
              _personFundId = fund?['id']?.toString();
              _personName = fund == null ? hint['personName'] as String : '';
              _sourceAccountId = _selectedAccountId ?? _sourceAccountId;
              _activeType = EntryType.transfer;
              _moveTarget = 'person';
            }),
            child: Text('Track as ${action == 'hold' || action == 'return' ? 'held' : 'lent'}'),
          ),
        ]);
      }
    }
    return const SizedBox.shrink();
  }

  int _minorOf(dynamic v) => (num.tryParse('${v ?? 0}') ?? 0).round().abs();

  bool get _canAddAnother =>
      !_isEditing &&
      (_activeType == EntryType.transaction || _activeType == EntryType.income || _activeType == EntryType.item);

  bool get _isPersonMove => _activeType == EntryType.transfer && _moveTarget == 'person';

  String? _idOf(dynamic a) => (a is Map ? (a['_id'] ?? a['id']) : null)?.toString();

  Map<String, dynamic>? _selectedCard(BudgetProvider budget) {
    for (final c in budget.creditCards) {
      if (_idOf(c) == _cardId) return Map<String, dynamic>.from(c as Map);
    }
    return null;
  }

  Widget _buildTab(EntryType type, String title, bool isDark) {
    final isSelected = _activeType == type;
    return Expanded(child: InkWell(
      onTap: () {
        setState(() => _activeType = type);
        if (type == EntryType.goal) {
          _fetchGoalRecommendation();
        }
      },
      borderRadius: BorderRadius.circular(6),
      child: Container(
        constraints: const BoxConstraints(minHeight: AppForm.controlHeight),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? (type == EntryType.income ? AppColors.green : (isDark ? Colors.white : Colors.black))
              : (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isSelected
                ? (type == EntryType.income ? Colors.white : (isDark ? Colors.black : Colors.white))
                : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
          ),
        ),
      ),
    ));
  }

  String _titleForType(EntryType type) {
    switch (type) {
      case EntryType.transaction:
        return 'Spend';
      case EntryType.income:
        return 'Income';
      case EntryType.item:
        return 'Planned Bill';
      case EntryType.goal:
        return 'Purchase Goal';
      case EntryType.transfer:
        return 'Move';
    }
  }

  Future<void> _handleSubmit({bool again = false}) async {
    final budget = context.read<BudgetProvider>();
    final amt = toMinorUnits(num.tryParse(_amountCtrl.text) ?? 0);
    final isRecurring = _activeType == EntryType.item && _itemType == 'recurring';
    final day = isRecurring ? (int.tryParse(_dayCtrl.text) ?? 1) : _selectedDate.day;
    final dateStr = _formatDateYmd(_selectedDate);
    final typedCategory = _isCustomCategory ? _customCategoryCtrl.text.trim() : _selectedCategory;
    final name = resolveEntryName(_nameCtrl.text, typedCategory, _titleForType(_activeType));

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
        await _saveTx(budget, {
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
        // "Credit / Refund" is a refund: a negative spend (as on web and per the server),
        // not income, so it reduces spending in its category instead of inflating income
        final isRefund = _txType == 'income';
        // Refunds linked to one spend can't add up to more than was paid
        final linked = isRefund ? _linkedSpend(budget) : null;
        if (linked != null && amt > _refundRemaining(budget, linked)) {
          final left = _refundRemaining(budget, linked);
          final spendName = (linked['title'] ?? linked['name'] ?? 'this spend').toString();
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(left > 0
                ? 'Only ${formatCurrency(left)} of $spendName is left to refund.'
                : '$spendName is already fully refunded.'),
          ));
          setState(() => _submitting = false);
          return;
        }
        await _saveTx(budget, {
          'description': name,
          'amount': isRefund ? -amt : amt,
          'day': day,
          'date': dateStr,
          'type': 'expense',
          'isIncome': false,
          if (isRefund) 'isRefund': true,
          if (isRefund && _refundTargetId != null && !_isEditing) 'refundTargetTransactionId': _refundTargetId,
          'category': cat.isNotEmpty ? cat : 'Other',
          'tag': cat.isNotEmpty ? cat : 'Other',
          if (_selectedAccountId != null) ...{
            'accountId': _selectedAccountId,
            'accountType': _accountType == 'credit_card' ? 'credit_card' : (isWallet ? 'wallet' : 'bank'),
            if (!isWallet && _accountType != 'credit_card') 'bankAccountId': _selectedAccountId,
            if (isWallet) 'walletId': _selectedAccountId,
          },
        });
      } else if (_activeType == EntryType.item) {
        await _saveItem(budget, {
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
        await _saveGoal(budget, {
          'name': name,
          'targetAmount': amt,
          'priority': _goalPriority,
          'targetDate': dateStr,
        });
      } else if (_activeType == EntryType.transfer) {
        final toCard = _moveTarget == 'card';
        final srcId = _sourceAccountId;
        final dstId = toCard ? _cardId : _destAccountId;
        final isSrcWallet = _sourceAccountType == 'wallet';
        final isDstWallet = !toCard && _destAccountType == 'wallet';

        if (srcId == null || dstId == null || (!toCard && srcId == dstId && _sourceAccountType == _destAccountType)) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select distinct source and destination accounts')));
          setState(() => _submitting = false);
          return;
        }

        await budget.addTransfer({
          'sourceType': isSrcWallet ? 'wallet' : 'bank',
          'sourceBankAccountId': isSrcWallet ? null : srcId,
          'sourceWalletId': isSrcWallet ? srcId : null,
          'sourceAccountId': srcId,
          // Paying a card is a transfer into the card (ADR 0070)
          'destinationType': toCard ? 'credit_card' : (isDstWallet ? 'wallet' : 'bank'),
          'destinationAccountId': dstId,
          'destinationBankAccountId': toCard || isDstWallet ? null : dstId,
          'destinationWalletId': isDstWallet ? dstId : null,
          'amount': amt,
          'date': dateStr,
          'note': _nameCtrl.text.trim().isNotEmpty
              ? _nameCtrl.text.trim()
              : (toCard ? '${_selectedCard(budget)?['name'] ?? 'Card'} bill' : name),
        });
      }


      // Remember the account (and the category for this description) for next time
      final memory = _memory ?? await EntryMemory.load();
      if (_isEditing) {
        if (mounted) Navigator.pop(context);
        return;
      }
      if (_activeType == EntryType.transfer) {
        await memory.rememberAccount('transfer', _sourceAccountType, _sourceAccountId);
      } else {
        await memory.rememberAccount(_activeType.name, _accountType, _selectedAccountId);
      }
      if ((_activeType == EntryType.transaction || _activeType == EntryType.item) && _nameCtrl.text.trim().isNotEmpty && cat.isNotEmpty) {
        await memory.rememberCategory(_nameCtrl.text, cat);
      }

      if (!mounted) return;
      if (again && _canAddAnother) {
        // Keep the tab, date and account; clear what changes per entry
        setState(() {
          _sessionCount += 1;
          _sessionTotal += amt;
          _amountCtrl.clear();
          _nameCtrl.clear();
          _customCategoryCtrl.clear();
          _isCustomCategory = false;
          _categoryTouched = false;
          _tagSuggested = false;
          _selectedCategory = 'Food';
        });
        _amountFocus.requestFocus();
      } else {
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
