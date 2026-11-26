import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../engine/engine.dart';
import '../models/account.dart';
import '../models/goal.dart';
import '../models/month_detail.dart';
import '../models/person_fund.dart';
import '../models/transaction.dart';
import '../engine/category_suggest.dart';
import '../engine/entry_assists.dart';
import 'mark_paid_modal.dart';
import 'salary_safeline_modal.dart';
import '../services/entry_memory.dart';
import '../services/outbox.dart';
import '../widgets/confirm_dialog.dart';
import '../theme/app_form.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';
import 'held_lent_modal.dart';
import '../widgets/floor_breach_notice.dart';
import '../widgets/app_date_picker.dart';
import '../widgets/entry_summary_chips.dart';
import '../widgets/web_icons.dart';
import '../theme/app_typography.dart';
import '../screens/onboarding_screen.dart' show SetupGroup, SetupRow, SetupSegmented;
import '../screens/accounts_screen.dart' show showAddAccountDialog;

enum EntryType { transaction, income, item, goal, transfer }

/// Name saved for an entry: what the user typed, else the category (as on web),
/// else the entry type's title. Never a generic "Entry".
String resolveEntryName(String typed, String category, String typeTitle) {
  final t = typed.trim();
  if (t.isNotEmpty) return t;
  final c = category.trim();
  return c.isNotEmpty ? c : typeTitle;
}

/// What "Change type" carries into the sheet that replaces an entry.
class EntryCarry {
  const EntryCarry({
    required this.amountText,
    required this.date,
    required this.note,
    required this.accountType,
    this.accountId,
    required this.category,
  });
  final String amountText;
  final DateTime date;
  final String note;
  final String accountType;
  final String? accountId;
  final String category;
}

class UnifiedEntryModal extends StatefulWidget {
  final EntryType initialType;

  /// A transfer opened from an account page starts from that account (web's "Transfer from Account").
  final String? initialSourceAccountId;

  /// Editing: the transaction or planned bill to change. The type is locked
  /// while editing, as on web.
  final Transaction? initialTransaction;

  /// Editing: the purchase goal to change.
  final Goal? initialGoal;

  /// Change type: the values carried over from the entry being replaced.
  final EntryCarry? carry;

  /// Change type: the entry deleted once this new one saves.
  final Transaction? replaces;

  const UnifiedEntryModal({
    super.key,
    this.initialType = EntryType.transaction,
    this.initialSourceAccountId,
    this.initialTransaction,
    this.initialGoal,
    this.carry,
    this.replaces,
  });

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

  // Editing: the plan's paid switch, the inline delete / change-type menus,
  // and the values the "Changing: …" line compares against
  bool _isPaid = false;
  bool _confirmDelete = false;
  bool _showConvert = false;
  bool _deleting = false;
  Map<String, String>? _editSnapshot;

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

  /// Web's QUICK_INCREMENTS per tab.
  static const Map<EntryType, List<int>> quickIncrements = {
    EntryType.transaction: [100, 500, 1000, 2000],
    EntryType.item: [100, 500, 1000, 2000],
    EntryType.income: [500, 1000, 5000, 10000],
    EntryType.transfer: [500, 1000, 2000, 5000],
  };
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
  List<PersonFund> _personFunds = const [];
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
    if (!_isEditing) {
      // Only for the held/lent hint, which is a nicety: no people means no hint.
      budget.getPersonFundsTyped().then((res) {
        if (mounted) setState(() => _personFunds = res.funds);
      }).catchError((Object _) {});
    }
    final banks = budget.bankAccountModels;
    final wallets = budget.walletModels;
    if (banks.isNotEmpty) {
      _accountType = 'bank';
      _selectedAccountId = banks.firstWhere((b) => b.isPrimary, orElse: () => banks.first).id;
    } else if (wallets.isNotEmpty) {
      _accountType = 'wallet';
      _selectedAccountId = wallets.firstWhere((w) => w.isPrimary, orElse: () => wallets.first).id;
    }

    _sourceAccountType = 'bank';
    _sourceAccountId = banks.isNotEmpty ? banks.first.id : (wallets.isNotEmpty ? wallets.first.id : null);

    _destAccountType = wallets.isNotEmpty ? 'wallet' : 'bank';
    _destAccountId = wallets.isNotEmpty ? wallets.first.id : (banks.length > 1 ? banks[1].id : null);

    final from = widget.initialSourceAccountId;
    final fromWallet = wallets.any((w) => w.id == from);
    if (from != null && (fromWallet || banks.any((b) => b.id == from))) {
      _sourceAccountType = fromWallet ? 'wallet' : 'bank';
      _sourceAccountId = from;
      if (_destAccountId == from) {
        // Move to the first other account: a bank when the source is a wallet, else any
        final others = [...(fromWallet ? banks : wallets), ...banks, ...wallets].where((a) => a.id != from);
        _destAccountId = others.isEmpty ? null : others.first.id;
        _destAccountType = others.isNotEmpty && wallets.any((w) => w.id == others.first.id) ? 'wallet' : 'bank';
      }
    }

    if (_activeType == EntryType.goal) {
      _fetchGoalRecommendation();
    }

    if (widget.initialTransaction != null) _prefillFromTransaction(budget, widget.initialTransaction!);
    if (widget.initialGoal != null) _prefillFromGoal(widget.initialGoal!);
    if (widget.carry != null) _prefillFromCarry(widget.carry!);
    if (_isEditing) _editSnapshot = _editValues(budget);

    // Remembered: the account used last time for this kind of entry
    EntryMemory.load().then((memory) {
      if (!mounted) return;
      _memory = memory;
      if (_isEditing) return;
      final remembered = memory.accountFor(_activeType.name);
      if (remembered == null) return;
      final type = remembered['accountType']!;
      final id = remembered['accountId']!;
      final pool = type == 'wallet'
          ? budget.walletModels
          : (type == 'credit_card' ? budget.cardAccountModels : budget.bankAccountModels);
      final cardsAllowed = _activeType == EntryType.transaction || _activeType == EntryType.item;
      if ((type == 'credit_card' && !cardsAllowed) || !pool.any((a) => a.id == id)) return;
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

  bool get _isEditing => widget.initialTransaction != null || widget.initialGoal != null;

  /// Recorded spends a refund can be linked to, newest first.
  List<Transaction> _refundTargets(BudgetProvider budget) {
    final editingId = _isEditing ? _editId : null;
    final list = budget.transactionModels
        .where((t) =>
            t.id != editingId &&
            t.isSuccessful &&
            t.kind == TxKind.expense &&
            t.origin != TxOrigin.salary &&
            // A fully refunded spend can't take another refund
            (_refundRemaining(budget, t) > 0 || t.id == _refundTargetId))
        .toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    return list.take(100).toList();
  }

  /// What is left to refund on a spend: its amount minus the refunds already
  /// linked to it (ADR 0062), leaving out the refund being edited. Never the
  /// spend's original amount on its own.
  int _refundRemaining(BudgetProvider budget, Transaction spend) {
    final editingId = _isEditing ? _editId : null;
    var refunded = 0;
    for (final t in budget.transactionModels) {
      if (t.refundTargetTransactionId != spend.id) continue;
      if (editingId != null && t.id == editingId) continue;
      if (t.amount < 0) refunded += t.amount.abs();
    }
    final left = spend.amount.abs() - refunded;
    return left > 0 ? left : 0;
  }

  Transaction? _transactionById(BudgetProvider budget, String? id) {
    if (id == null) return null;
    for (final t in budget.transactionModels) {
      if (t.id == id) return t;
    }
    return null;
  }

  /// The spend this refund is (or will be) linked to, if it is in the list.
  Transaction? _linkedSpend(BudgetProvider budget) => _transactionById(
        budget,
        _isEditing ? widget.initialTransaction?.refundTargetTransactionId : _refundTargetId,
      );

  String _txLabel(Transaction t, {int? remaining}) {
    final name = t.name.isNotEmpty ? t.name : (t.category.isNotEmpty ? t.category : 'Spend');
    final paid = t.amount.abs();
    final amountText = remaining != null && remaining < paid
        ? '${formatCurrency(remaining)} left of ${formatCurrency(paid)}'
        : formatCurrency(paid);
    return '$name · $amountText · ${t.date}';
  }

  /// 'bank' | 'wallet' | 'credit_card' for an account id, or null when not loaded.
  String? _accountTypeOf(BudgetProvider budget, String? id) => switch (budget.accountById(id)?.kind) {
        AccountKind.wallet => 'wallet',
        AccountKind.creditCard => 'credit_card',
        null => null,
        _ => 'bank',
      };

  /// "Refund for": pick the spend this refund gives money back for. Set when the
  /// refund is created; shown read-only when editing (the server doesn't change it).
  Widget _buildRefundLink(BudgetProvider budget) {
    final targets = _refundTargets(budget);
    if (_isEditing) {
      final linkedId = widget.initialTransaction?.refundTargetTransactionId;
      final linked = _transactionById(budget, linkedId);
      return Text(
        linked != null ? 'Refund for ${_txLabel(linked)}' : (linkedId != null ? 'Linked to an earlier spend.' : 'Not linked to a spend.'),
        key: const ValueKey('refund-link-readonly'),
        style: const TextStyle(fontSize: 12),
      );
    }
    final valid = targets.any((t) => t.id == _refundTargetId);
    return DropdownButtonFormField<String?>(
      borderRadius: BorderRadius.circular(8), // web .app-dropdown-menu
      key: const ValueKey('refund-for'),
      initialValue: valid ? _refundTargetId : null,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Refund for'),
      items: [
        const DropdownMenuItem<String?>(value: null, child: Text('Not linked to a spend')),
        ...targets.map((t) => DropdownMenuItem<String?>(
              value: t.id,
              child: Text(_txLabel(t, remaining: _refundRemaining(budget, t)), overflow: TextOverflow.ellipsis),
            )),
      ],
      onChanged: (id) => setState(() {
        _refundTargetId = id;
        if (id == null) return;
        final target = targets.firstWhere((t) => t.id == id);
        // Same category and account as the spend being refunded, unless already chosen
        final cat = target.category;
        if (!_categoryTouched && _quickCategories.contains(cat)) {
          _selectedCategory = cat;
          _isCustomCategory = false;
        }
        final accType = _accountTypeOf(budget, target.accountId);
        if (accType != null) {
          _accountType = accType;
          _selectedAccountId = target.accountId;
        }
        if (_nameCtrl.text.trim().isEmpty) {
          _nameCtrl.text = 'Refund: ${target.name.isEmpty ? 'spend' : target.name}';
        }
      }),
    );
  }

  String get _editId => widget.initialTransaction?.id ?? widget.initialGoal?.id ?? '';

  void _setAmountText(int minor) {
    final amt = minor.abs();
    if (amt > 0) _amountCtrl.text = (amt / 100).toStringAsFixed(amt % 100 == 0 ? 0 : 2);
  }

  /// Fill the form from the transaction being edited, so saving without changes
  /// sends back what was there.
  void _prefillFromTransaction(BudgetProvider budget, Transaction t) {
    _setAmountText(t.isPlanned ? (t.plannedAmount ?? t.amount) : t.amount);
    _nameCtrl.text = t.name;
    final parsed = DateTime.tryParse(t.isPlanned ? t.dueDate : t.date);
    if (parsed != null) _selectedDate = parsed;

    final cat = t.category;
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
    if (_activeType == EntryType.transaction && t.amount < 0) _txType = 'income';
    if (_activeType == EntryType.item) {
      // Transactions store `recurrence`; the old check read the legacy item
      // field `type == 'recurring'`, so a recurring bill reopened as one-time.
      _itemType = t.recurrence != null ? 'recurring' : 'one-time';
      if (_itemType == 'recurring') _dayCtrl.text = '${parsed?.day ?? 1}';
      _isPaid = !t.isPlanned;
    }
    final accType = _accountTypeOf(budget, t.accountId);
    if (t.accountId != null) {
      _accountType = accType ?? 'bank';
      _selectedAccountId = t.accountId;
    }
  }

  void _prefillFromCarry(EntryCarry c) {
    _amountCtrl.text = c.amountText;
    _nameCtrl.text = c.note;
    _selectedDate = c.date;
    if (c.accountId != null && c.accountType != 'credit_card') {
      _accountType = c.accountType;
      _selectedAccountId = c.accountId;
      _sourceAccountType = c.accountType;
      _sourceAccountId = c.accountId;
    }
    if (_activeType == EntryType.income) {
      if (_incomeSources.contains(c.category)) _incSource = c.category;
    } else if (c.category.isNotEmpty) {
      if (_quickCategories.contains(c.category)) {
        _selectedCategory = c.category;
      } else {
        _isCustomCategory = true;
        _customCategoryCtrl.text = c.category;
      }
      _categoryTouched = true;
    }
  }

  void _prefillFromGoal(Goal g) {
    _setAmountText(g.targetAmount);
    _nameCtrl.text = g.name;
    _goalPriority = g.priority.rank;
  }

  // Save helpers: update when editing, create otherwise.
  // A new spend, refund or income does not wait for the server (upgrade plan
  // 2.8, ADR 0071): it shows as "Saving…" in the sync strip and the sheet
  // closes. Only a refusal comes back, as a snackbar.
  Future<void> _saveTx(BudgetProvider budget, Map<String, dynamic> payload, {required String label}) async {
    if (_isEditing) return budget.updateTransaction(_editId, payload);
    // Replacing an entry: the original goes only once this one is saved
    if (widget.replaces != null) {
      await budget.addTransaction(payload);
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    unawaited(budget.addTransaction(payload).then((result) {
      if (result == WriteResult.queued) {
        messenger.showSnackBar(SnackBar(
          content: Text('No connection. \u201c$label\u201d is saved on this phone and will sync.'),
        ));
      }
    }, onError: (Object e) {
      messenger.showSnackBar(SnackBar(content: Text('Couldn\u2019t save \u201c$label\u201d: $e')));
    }));
  }

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
    final budget = context.budgetView();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final month = budget.monthInfo;
    final isRecurring = _activeType == EntryType.item && _itemType == 'recurring';
    final noAccounts = budget.bankAccountModels.isEmpty && budget.walletModels.isEmpty;

    // Ask before throwing away a half-filled entry (back button, Cancel)
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
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Web's sheet top bar: Cancel | title | primary action
              _buildTopBar(budget, noAccounts),
              const SizedBox(height: 12),

              if (_isEditing && _activeType != EntryType.goal)
                _buildEditBadge()
              else if (widget.initialType != EntryType.goal && !_isEditing)
                Row(
                  children: [
                    _buildTab(EntryType.transaction, 'Spending', WebIcons.zap, isDark),
                    const SizedBox(width: 4),
                    _buildTab(EntryType.income, 'Income', WebIcons.trendingUp, isDark),
                    const SizedBox(width: 4),
                    _buildTab(EntryType.item, 'Plan', WebIcons.plus, isDark),
                    const SizedBox(width: 4),
                    _buildTab(EntryType.transfer, 'Move', WebIcons.arrowRightLeft, isDark),
                  ],
                ),

              if (_sessionCount > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '$_sessionCount added · ${formatCurrency(_sessionTotal)}',
                    key: const ValueKey('entry-session'),
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.palette.goodInk),
                  ),
                ),

              // Move: where the money goes
              if (_activeType == EntryType.transfer && !_isEditing) ...[
                const SizedBox(height: 12),
                SetupSegmented(
                  value: _moveTarget,
                  options: [
                    ('account', 'My accounts', null),
                    if (budget.simulatedCards.isNotEmpty) ('card', 'Pay a card', null),
                    ('person', 'A person', null),
                  ],
                  onChanged: (v) => setState(() {
                    _moveTarget = v;
                    if (v == 'card') _cardId ??= budget.simulatedCards.first.account.id;
                  }),
                ),
              ],
              const SizedBox(height: 16),

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
              // Slot 1: amount label and its modifier (spend / refund, one-time / recurring)
              _buildAmountLabelRow(),
              const SizedBox(height: 6),
              _buildHeroAmount(),
              if (_activeType != EntryType.goal) ...[
                const SizedBox(height: 8),
                _buildQuickRow(),
              ],
              if (_activeType == EntryType.goal) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    for (final (rank, label) in const [(0, 'High'), (1, 'Medium'), (2, 'Low')]) ...[
                      if (rank > 0) const SizedBox(width: 6),
                      Expanded(
                        child: ChoiceChip(
                          label: Center(child: Text(label)),
                          selected: _goalPriority == rank,
                          onSelected: (_) => setState(() => _goalPriority = rank),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
              const SizedBox(height: 14),

              if (_activeType == EntryType.transaction && _txType == 'income') ...[
                _buildRefundLink(budget),
                const SizedBox(height: 12),
              ],

              if (noAccounts && _activeType != EntryType.transfer && _activeType != EntryType.goal)
                _buildNoAccounts()
              else if (_activeType != EntryType.transfer)
                _buildRows(budget, isRecurring),

              if (_activeType == EntryType.income)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(
                    'Note: Your primary monthly salary is managed in Salary schedule. Use this form to record ad-hoc earnings, bonuses, or side income.',
                    key: const ValueKey('entry-income-note'),
                    style: TextStyle(fontSize: 12, color: context.palette.textMuted),
                  ),
                ),

              // Purchase Goal Algorithm Recommendation Badge (Server Authoritative)
              if (_activeType == EntryType.goal) ...[
                const SizedBox(height: 12),
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
                          color: goalRec.feasible ? context.palette.good.withAlpha(20) : context.palette.bad.withAlpha(20),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: goalRec.feasible ? context.palette.good.withAlpha(100) : context.palette.bad.withAlpha(100),
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              goalRec.feasible ? Icons.auto_awesome : Icons.warning_amber_rounded,
                              size: 18,
                              color: goalRec.feasible ? context.palette.goodInk : context.palette.badInk,
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
                                      color: goalRec.feasible ? context.palette.goodInk : context.palette.badInk,
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
              ],

              if (_activeType == EntryType.transfer) ...[
                _buildMoveRows(budget),
                const SizedBox(height: 12),
                if (_moveTarget == 'card') ...[
                  Text('Card to pay *', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary)),
                  const SizedBox(height: AppForm.fieldGap),
                  ...budget.simulatedCards.map((card) {
                    final id = card.account.id;
                    final remaining = card.openBill?.remaining ?? 0;
                    final owed = card.account.owed ?? 0;
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
                              Text(card.account.name.isEmpty ? 'Card' : card.account.name, style: const TextStyle(fontWeight: FontWeight.w600)),
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
                    final remaining = card?.openBill?.remaining ?? 0;
                    final minimum = card?.openBill?.minimumDue ?? 0;
                    final owed = card?.account.owed ?? 0;
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
                  const SizedBox(height: 6),
                  Text("Paying a card moves money from your account to the card. It isn't counted as spending again.",
                      style: TextStyle(fontSize: 11.5, color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary)),
                ] else
                  _buildMoveTo(budget),
                const SizedBox(height: 8),
                Text("Moving money between your own accounts doesn't change your total cash.",
                    style: TextStyle(fontSize: 11.5, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted)),
              ],

              // Smart assists: rebuilt as the amount or description changes
              if (!_isEditing && (_activeType == EntryType.transaction || _activeType == EntryType.income))
                AnimatedBuilder(
                  animation: Listenable.merge([_amountCtrl, _nameCtrl]),
                  builder: (context, _) => _buildAssist(budget, month, isDark),
                ),
              // Safety floor: spending from, or moving money out of, a bank account or wallet
              if ((_activeType == EntryType.transaction && _txType == 'expense') || _activeType == EntryType.transfer)
                FloorBreachNotice(
                  amountController: _amountCtrl,
                  accountId: _activeType == EntryType.transfer ? _sourceAccountId : _selectedAccountId,
                  showWhenSafe: true,
                  alreadyCounted: _savedSpendIn(_selectedAccountId),
                ),

              if (_isEditing) _buildEditSummary(budget),
              const SizedBox(height: 12),
              _buildFooter(noAccounts),
              ],
            ],
          ),
        ),
      ),
    ),
    );
  }

  // ---- Web layout pieces ------------------------------------------------

  String _sheetTitle(BudgetProvider budget) {
    if (_isPersonMove) return 'Held & Lent';
    final verb = _isEditing ? 'Edit' : 'New';
    switch (_activeType) {
      case EntryType.transaction:
        return '$verb ${_txType == 'income' ? 'refund' : 'spend'}';
      case EntryType.income:
        return '$verb income';
      case EntryType.item:
        return _isEditing ? 'Edit plan' : (_itemType == 'recurring' ? 'New recurring bill' : 'New plan');
      case EntryType.goal:
        return _isEditing ? 'Edit purchase goal' : 'New purchase goal';
      case EntryType.transfer:
        return _isEditing ? 'Edit transfer' : (_moveTarget == 'card' ? 'Pay a card' : 'Move money');
    }
  }

  String _sheetAction(BudgetProvider budget) {
    if (_submitting) return _isEditing ? 'Saving…' : 'Adding…';
    if (_isEditing) return 'Save';
    if (_activeType == EntryType.transfer && _moveTarget == 'card') {
      return 'Pay ${_selectedCard(budget)?.account.name ?? 'card'}';
    }
    return 'Add';
  }

  Widget _buildTopBar(BudgetProvider budget, bool noAccounts) {
    final p = context.palette;
    final blocked = noAccounts && _activeType != EntryType.transfer && _activeType != EntryType.goal;
    final isRefund = _activeType == EntryType.transaction && _txType == 'income';
    return Row(
      children: [
        SizedBox(
          width: 88,
          child: Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              key: const ValueKey('entry-cancel'),
              // maybePop goes through the discard guard
              onPressed: () => Navigator.maybePop(context),
              child: const Text('Cancel'),
            ),
          ),
        ),
        Expanded(
          child: Text(
            _sheetTitle(budget),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.inter(fontSize: 16, fontWeight: FontWeight.w700, color: p.text),
          ),
        ),
        SizedBox(
          width: 88,
          child: Align(
            alignment: Alignment.centerRight,
            child: _isPersonMove
                ? const SizedBox.shrink()
                : TextButton(
                    key: const ValueKey('entry-primary'),
                    onPressed: _submitting || blocked ? null : () => _handleSubmit(),
                    child: Text(
                      _sheetAction(budget),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontWeight: FontWeight.w700, color: isRefund ? p.goodInk : null),
                    ),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _buildEditBadge() {
    final p = context.palette;
    final t = widget.initialTransaction;
    final (icon, label) = switch (_activeType) {
      EntryType.transaction => (WebIcons.zap, _txType == 'income' ? 'Editing Credit / Refund' : 'Editing Settled Expense'),
      EntryType.income => (WebIcons.trendingUp, t?.origin == TxOrigin.salary ? 'Editing Salary Credit' : 'Editing Income Credit'),
      EntryType.item => (WebIcons.plus, t?.recurrence != null ? 'Editing Recurring Commitment' : 'Editing Planned Commitment'),
      _ => (WebIcons.arrowRightLeft, 'Editing Transfer'),
    };
    return Container(
      key: const ValueKey('entry-edit-badge'),
      constraints: const BoxConstraints(minHeight: AppForm.controlHeight),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(color: p.surfaceSubtle, borderRadius: BorderRadius.circular(8)),
      child: Row(
        children: [
          WebIcon(icon, size: 14, color: p.text),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: p.text)),
          ),
          Tooltip(
            message: 'Type is locked during edit to maintain ledger consistency',
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              WebIcon(WebIcons.lock, size: 11, color: p.textMuted),
              const SizedBox(width: 4),
              Text('Type Locked', style: AppTypography.inter(fontSize: 11, color: p.textMuted)),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _buildAmountLabelRow() {
    final p = context.palette;
    final label = switch (_activeType) {
      EntryType.transaction => 'Amount ($moneySymbol)',
      EntryType.income => 'Income Amount ($moneySymbol) *',
      EntryType.item => 'Planned amount ($moneySymbol)',
      EntryType.transfer => 'Transfer Amount ($moneySymbol) *',
      EntryType.goal => 'Target amount ($moneySymbol) *',
    };
    final isRefund = _txType == 'income';
    return Row(
      children: [
        Expanded(
          child: Text(label, style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: p.textSecondary)),
        ),
        if (_activeType == EntryType.transaction)
          Semantics(
            button: true,
            toggled: isRefund,
            child: InkWell(
              key: const ValueKey('entry-refund-toggle'),
              borderRadius: BorderRadius.circular(999),
              onTap: () => setState(() {
                _txType = isRefund ? 'expense' : 'income';
                _refundTargetId = null;
              }),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44),
                child: Center(
                  widthFactor: 1,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: isRefund ? p.good.withAlpha(28) : p.surfaceSubtle,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: isRefund ? p.good.withAlpha(110) : p.border),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      if (isRefund) ...[WebIcon(WebIcons.checkCircle, size: 12, color: p.goodInk), const SizedBox(width: 4)],
                      Text(isRefund ? 'Credit / Refund' : 'Expense Debit',
                          style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: isRefund ? p.goodInk : p.textSecondary)),
                    ]),
                  ),
                ),
              ),
            ),
          ),
        if (_activeType == EntryType.item)
          SizedBox(
            width: 190,
            child: SetupSegmented(
              value: _itemType,
              options: const [('one-time', 'One-Time', null), ('recurring', 'Recurring', null)],
              onChanged: (v) => setState(() => _itemType = v),
            ),
          ),
      ],
    );
  }

  Widget _buildHeroAmount() {
    final p = context.palette;
    return Row(
      children: [
        Text(moneySymbol, style: AppTypography.inter(fontSize: 28, fontWeight: FontWeight.w500, color: p.textMuted)),
        const SizedBox(width: 6),
        Expanded(
          child: TextField(
            key: const ValueKey('entry-amount'),
            controller: _amountCtrl,
            focusNode: _amountFocus,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: AppTypography.inter(fontSize: 32, fontWeight: FontWeight.w700, color: p.text)
                .copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
            decoration: InputDecoration.collapsed(
              hintText: '0.00',
              hintStyle: AppTypography.inter(fontSize: 32, fontWeight: FontWeight.w700, color: p.textMuted),
            ),
          ),
        ),
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: _amountCtrl,
          builder: (_, v, _) => v.text.isEmpty
              ? const SizedBox.shrink()
              : TextButton(
                  key: const ValueKey('entry-amount-clear'),
                  onPressed: () {
                    _amountCtrl.clear();
                    _amountFocus.requestFocus();
                  },
                  child: const Text('Clear'),
                ),
        ),
      ],
    );
  }

  Widget _buildQuickRow() {
    final p = context.palette;
    final incs = quickIncrements[_activeType] ?? quickAmounts;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: incs
                .map((v) => ActionChip(
                      label: Text(v >= 1000 ? '${v ~/ 1000}k' : '$v'),
                      onPressed: () {
                        setState(() => _amountCtrl.text = '$v');
                        _amountFocus.requestFocus();
                      },
                    ))
                .toList(),
          ),
        ),
        if (_activeType == EntryType.item)
          Row(mainAxisSize: MainAxisSize.min, children: [
            Checkbox(
              key: const ValueKey('entry-variable'),
              value: !_isFixed,
              semanticLabel: 'Variable expense',
              onChanged: (v) => setState(() => _isFixed = !(v ?? false)),
            ),
            Text('Variable', style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: p.text)),
            IconButton(
              key: const ValueKey('entry-variable-info'),
              tooltip: 'About Variable vs Fixed expenses',
              onPressed: _showVariableInfo,
              icon: Text('ℹ', style: TextStyle(fontSize: 16, color: p.textSecondary)),
            ),
          ]),
      ],
    );
  }

  Future<void> _showVariableInfo() => showDialog<void>(
        context: context,
        builder: (ctx) {
          final p = ctx.palette;
          Widget item(String title, String body) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w700, color: p.text)),
                  const SizedBox(height: 2),
                  Text(body, style: AppTypography.inter(fontSize: 12, color: p.textSecondary)),
                ]),
              );
          return AlertDialog(
            title: Row(children: [
              const Expanded(child: Text('Expense Rollover Mode')),
              IconButton(
                tooltip: 'Close info',
                onPressed: () => Navigator.pop(ctx),
                icon: WebIcon(WebIcons.x, size: 14, color: p.textSecondary),
              ),
            ]),
            content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              item('Fixed (Default)', 'Automatically carries forward into next month\'s safe-to-spend allowance on rollover.'),
              item('Variable', 'One-time commitment for this month only; drops automatically upon rollover.'),
            ]),
            actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Got it'))],
          );
        },
      );

  Widget _rowInput(TextEditingController ctrl, String hint, {Key? key, ValueChanged<String>? onChanged}) {
    final p = context.palette;
    return TextField(
      key: key,
      controller: ctrl,
      onChanged: onChanged,
      textAlign: TextAlign.end,
      textCapitalization: TextCapitalization.sentences,
      style: AppTypography.inter(fontSize: 16, color: p.text),
      decoration: InputDecoration.collapsed(
        hintText: hint,
        hintStyle: AppTypography.inter(fontSize: 16, color: p.textMuted),
      ).copyWith(
        constraints: const BoxConstraints(minHeight: 44),
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
      ),
    );
  }

  /// A grouped row's value that opens a picker: the value, then a chevron.
  Widget _rowValue(String value, VoidCallback onTap, {required Key key, required String semantics, Color? color}) {
    final p = context.palette;
    return Semantics(
      button: true,
      label: '$semantics: $value. Change',
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        key: key,
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Flexible(
              child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.end,
                  style: AppTypography.inter(fontSize: 16, color: color ?? p.textSecondary)),
            ),
            const SizedBox(width: 4),
            WebIcon(WebIcons.chevronRight, size: 14, color: p.textMuted),
          ]),
        ),
      ),
    );
  }

  Future<String?> _pickFrom(String title, List<String> options, String current) => showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        builder: (sheet) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(title, style: AppTypography.inter(fontSize: 16, fontWeight: FontWeight.w700, color: sheet.palette.text)),
            ),
            for (final o in options)
              ListTile(
                key: ValueKey('entry-pick-$o'),
                title: Text(o),
                trailing: o == current ? WebIcon(WebIcons.check, size: 16, color: sheet.palette.text) : null,
                onTap: () => Navigator.pop(sheet, o),
              ),
          ]),
        ),
      );

  static const _incomeSources = ['Salary', 'Freelance', 'Bonus', 'Investment', 'Other'];

  Widget _buildRows(BudgetProvider budget, bool isRecurring) {
    final p = context.palette;
    final isGoal = _activeType == EntryType.goal;
    final hasCategory = _activeType == EntryType.transaction || _activeType == EntryType.item;
    final (nameLabel, hint) = switch (_activeType) {
      EntryType.item => ('Name *', 'Rent, electricity…'),
      EntryType.income => ('What for', 'Salary payout…'),
      EntryType.goal => ('Goal name', 'New headphones'),
      _ => ('What for', 'Grocery, metro…'),
    };
    final accountLabel = switch (_activeType) {
      EntryType.income => 'Into',
      EntryType.item => 'Pay from',
      _ => 'Paid from',
    };
    final account = budget.accountById(_selectedAccountId);
    final accountText = account == null
        ? (_activeType == EntryType.income ? 'Choose account' : 'No account')
        : (account.name.isEmpty ? 'Account' : account.name);
    final category = _isCustomCategory ? 'Custom' : _selectedCategory;

    Future<void> pickDate() async {
      final picked = await _pickEntryDate();
      if (picked != null) {
        setState(() {
          _selectedDate = picked;
          _dayCtrl.text = '${picked.day}';
        });
      }
    }

    return SetupGroup(children: [
      SetupRow(
        label: nameLabel,
        child: _rowInput(_nameCtrl, hint, key: const ValueKey('entry-name'), onChanged: _onDescriptionChanged),
      ),
      if (hasCategory)
        SetupRow(
          label: _tagSuggested ? 'Category · suggested' : 'Category',
          labelWidth: _tagSuggested ? 150 : 104,
          child: _rowValue(category, () async {
            final picked = await _pickFrom('Category', [..._quickCategories, 'Custom…'], _isCustomCategory ? 'Custom…' : _selectedCategory);
            if (picked == null) return;
            setState(() {
              _categoryTouched = true;
              _tagSuggested = false;
              if (picked == 'Custom…') {
                _isCustomCategory = true;
              } else {
                _isCustomCategory = false;
                _selectedCategory = picked;
              }
            });
          }, key: const ValueKey('entry-category'), semantics: 'Category'),
        ),
      if (hasCategory && _isCustomCategory)
        SetupRow(label: 'Custom', child: _rowInput(_customCategoryCtrl, 'Rent, Utilities…', key: const ValueKey('entry-custom-category'))),
      if (_activeType == EntryType.income)
        SetupRow(
          label: 'Source',
          child: _rowValue(_incSource, () async {
            final picked = await _pickFrom('Source', _incomeSources, _incSource);
            if (picked != null) setState(() => _incSource = picked);
          }, key: const ValueKey('entry-source'), semantics: 'Source'),
        ),
      if (!isGoal)
        SetupRow(
          label: accountLabel,
          child: _rowValue(
            accountText,
            () => EntrySummaryChips(
              date: _selectedDate,
              onDate: (_) {},
              accountLabel: accountLabel,
              accountType: _accountType,
              accountId: _selectedAccountId,
              banks: budget.bankAccountModels,
              wallets: budget.walletModels,
              cards: hasCategory ? budget.cardAccountModels : const [],
              accountRequired: _activeType == EntryType.income,
              onAccount: (type, id) => setState(() {
                _accountType = type;
                _selectedAccountId = id;
              }),
            ).pickAccount(context),
            key: const ValueKey('entry-account-chip'),
            semantics: accountLabel,
            color: account == null && _activeType == EntryType.income ? p.warnInk : null,
          ),
        ),
      if (isRecurring)
        SetupRow(label: 'When', child: _buildDayStepper())
      else
        SetupRow(
          label: isGoal ? 'Target date' : 'When',
          child: _rowValue(EntrySummaryChips.dateLabel(_selectedDate), pickDate,
              key: const ValueKey('entry-date-chip'), semantics: isGoal ? 'Target date' : 'When'),
        ),
    ]);
  }

  /// Move form, as on web: Note / From / When grouped rows.
  Widget _buildMoveRows(BudgetProvider budget) {
    final label = _moveTarget == 'card' ? 'Pay from' : 'From';
    final src = budget.accountById(_sourceAccountId);
    return SetupGroup(children: [
      SetupRow(label: 'Note', child: _rowInput(_nameCtrl, 'Optional', key: const ValueKey('entry-name'))),
      SetupRow(
        label: label,
        child: _rowValue(
          src == null ? 'Choose account' : (src.name.isEmpty ? 'Account' : src.name),
          () => _pickMoveAccount(budget, label, _sourceAccountType, _sourceAccountId, (t, id) {
            _sourceAccountType = t;
            _sourceAccountId = id;
          }),
          key: const ValueKey('move-from'),
          semantics: label,
        ),
      ),
      SetupRow(
        label: 'When',
        child: _rowValue(EntrySummaryChips.dateLabel(_selectedDate), () async {
          final picked = await _pickEntryDate();
          if (picked != null) setState(() => _selectedDate = picked);
        }, key: const ValueKey('entry-date-chip'), semantics: 'When'),
      ),
    ]);
  }

  /// "To" with web's Invert button, then the destination row.
  Widget _buildMoveTo(BudgetProvider budget) {
    final p = context.palette;
    final dst = budget.accountById(_destAccountId);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Text('To', style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: p.textSecondary)),
        const Spacer(),
        TextButton.icon(
          key: const ValueKey('move-invert'),
          onPressed: () => setState(() {
            final t = _sourceAccountType, id = _sourceAccountId;
            _sourceAccountType = _destAccountType;
            _sourceAccountId = _destAccountId;
            _destAccountType = t;
            _destAccountId = id;
          }),
          icon: const Icon(Icons.swap_vert, size: 16),
          label: const Text('Invert'),
        ),
      ]),
      SetupGroup(children: [
        SetupRow(
          label: 'Account',
          child: _rowValue(
            dst == null ? 'Choose account' : (dst.name.isEmpty ? 'Account' : dst.name),
            () => _pickMoveAccount(budget, 'To', _destAccountType, _destAccountId, (t, id) {
              _destAccountType = t;
              _destAccountId = id;
            }),
            key: const ValueKey('move-to'),
            semantics: 'To',
          ),
        ),
      ]),
    ]);
  }

  Future<void> _pickMoveAccount(BudgetProvider budget, String label, String type, String? id, void Function(String, String?) set) =>
      EntrySummaryChips(
        date: _selectedDate,
        onDate: (_) {},
        accountLabel: label,
        accountType: type,
        accountId: id,
        banks: budget.bankAccountModels,
        wallets: budget.walletModels,
        accountRequired: true,
        onAccount: (t, i) => setState(() => set(t, i)),
      ).pickAccount(context);

  /// The saved spend being edited is already out of [accountId]'s balance.
  int _savedSpendIn(String? accountId) {
    final t = widget.initialTransaction;
    if (_activeType != EntryType.transaction || t == null || t.isPlanned || t.accountId != accountId) return 0;
    return t.amount;
  }

  DateTime get _today {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  /// Spends, income and moves can't be dated after today; a one-time plan can't be before it.
  Future<DateTime?> _pickEntryDate() {
    final logged = _activeType == EntryType.transaction || _activeType == EntryType.income || _activeType == EntryType.transfer;
    final plan = _activeType == EntryType.item && !_isPaid;
    return showAppDatePicker(context, _selectedDate,
        firstDate: plan ? _today : null, lastDate: logged ? _today : null);
  }

  /// The date the entry had before editing ('' for a new entry).
  String get _originalDate {
    final t = widget.initialTransaction;
    if (t == null) return '';
    final raw = t.isPlanned ? t.dueDate : t.date;
    return raw.length >= 10 ? raw.substring(0, 10) : raw;
  }

  String? _dateRuleError(String dateStr, bool isRecurring) {
    if (dateStr == _originalDate) return null;
    final day = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day);
    if ((_activeType == EntryType.transaction || _activeType == EntryType.income) && day.isAfter(_today)) {
      return "A spend or income can't be dated in the future.";
    }
    if (_activeType == EntryType.item && !isRecurring && !_isPaid && day.isBefore(_today)) {
      return "A planned payment can't be dated in the past.";
    }
    return null;
  }

  Widget _buildDayStepper() {
    final p = context.palette;
    final day = (int.tryParse(_dayCtrl.text) ?? 1).clamp(1, 31);
    void set(int d) => setState(() => _dayCtrl.text = '${d.clamp(1, 31)}');
    return Semantics(
      label: 'Day of month (1 - 31)',
      value: '$day',
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(
          key: const ValueKey('entry-day-minus'),
          tooltip: 'Earlier day',
          onPressed: day > 1 ? () => set(day - 1) : null,
          icon: const Icon(Icons.remove, size: 18),
        ),
        SizedBox(
          width: 64,
          child: Text('Day $day', key: const ValueKey('entry-day'), textAlign: TextAlign.center,
              style: AppTypography.inter(fontSize: 16, fontWeight: FontWeight.w600, color: p.text)),
        ),
        IconButton(
          key: const ValueKey('entry-day-plus'),
          tooltip: 'Later day',
          onPressed: day < 31 ? () => set(day + 1) : null,
          icon: const Icon(Icons.add, size: 18),
        ),
      ]),
    );
  }

  Widget _buildNoAccounts() {
    final p = context.palette;
    return Container(
      key: const ValueKey('entry-no-accounts'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: p.warn.withAlpha(24),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: p.warn.withAlpha(90)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Bank Account Required', style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w700, color: p.warnInk)),
        const SizedBox(height: 4),
        Text('You must register a bank account before recording transactions.',
            style: AppTypography.inter(fontSize: 12, color: p.textSecondary)),
        const SizedBox(height: 8),
        TextButton(
          key: const ValueKey('entry-add-bank'),
          onPressed: () => showAddAccountDialog(context, isBank: true),
          child: const Text('+ Add Bank Account'),
        ),
      ]),
    );
  }

  /// What each field shows, for the "Changing: …" line while editing.
  Map<String, String> _editValues(BudgetProvider budget) {
    final amt = toMinorUnits(num.tryParse(_amountCtrl.text) ?? 0);
    final recurring = _activeType == EntryType.item && _itemType == 'recurring';
    return {
      'Amount': formatCurrency(amt),
      if (_activeType != EntryType.goal) ...{
        (recurring ? 'Day' : 'Date'): recurring ? _dayCtrl.text : EntrySummaryChips.dateLabel(_selectedDate),
        'Account': budget.accountById(_selectedAccountId)?.name ?? '',
      },
      'Name': _nameCtrl.text.trim(),
      if (_activeType == EntryType.transaction || _activeType == EntryType.item)
        'Category': _isCustomCategory ? _customCategoryCtrl.text.trim() : _selectedCategory,
      if (_activeType == EntryType.income) 'Source': _incSource,
      if (_activeType == EntryType.transaction) 'Type': _txType == 'income' ? 'Refund' : 'Spend',
      if (_activeType == EntryType.item) ...{
        'Repeat': recurring ? 'Monthly' : 'One-time',
        'Rollover': _isFixed ? 'Fixed' : 'Variable',
        'Status': _isPaid ? 'Paid' : 'Pending',
      },
      if (_activeType == EntryType.goal) 'Priority': const ['High', 'Medium', 'Low'][_goalPriority.clamp(0, 2)],
    };
  }

  Widget _buildEditSummary(BudgetProvider budget) {
    final p = context.palette;
    final kind = _activeType == EntryType.item
        ? 'planned bill'
        : (_activeType == EntryType.income ? 'income' : (_activeType == EntryType.goal ? 'goal' : 'spend'));
    final canConvert = widget.initialTransaction != null &&
        (_activeType == EntryType.transaction || _activeType == EntryType.income);
    return AnimatedBuilder(
      animation: Listenable.merge([_amountCtrl, _nameCtrl, _customCategoryCtrl, _dayCtrl]),
      builder: (context, _) {
        final now = _editValues(budget);
        final before = _editSnapshot ?? now;
        final changes = [
          for (final e in now.entries)
            if (before.containsKey(e.key) && before[e.key] != e.value) (e.key, before[e.key]!, e.value),
        ];
        String dash(String s) => s.isEmpty ? '—' : s;
        return Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(
              changes.isEmpty
                  ? 'No changes yet'
                  : 'Changing: ${changes.map((c) => '${c.$1} ${dash(c.$2)} → ${dash(c.$3)}').join(' · ')}',
              key: const ValueKey('entry-edit-summary'),
              style: AppTypography.inter(fontSize: 12, color: p.textSecondary),
            ),
            if (!_confirmDelete)
              Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                if (canConvert)
                  TextButton(
                    key: const ValueKey('entry-change-type'),
                    onPressed: () => setState(() => _showConvert = !_showConvert),
                    child: const Text('Change type'),
                  ),
                TextButton(
                  key: const ValueKey('entry-delete'),
                  onPressed: () => setState(() => _confirmDelete = true),
                  style: TextButton.styleFrom(foregroundColor: p.badInk),
                  child: const Text('Delete'),
                ),
              ]),
            if (canConvert && _showConvert && !_confirmDelete)
              _inlineConfirm(
                key: const ValueKey('entry-convert-menu'),
                text: 'Change this $kind to:',
                hint: 'The $kind is replaced once the new entry is saved.',
                actions: [
                  for (final (target, label) in const [
                    (EntryType.transaction, 'Spend'),
                    (EntryType.income, 'Income'),
                    (EntryType.transfer, 'Move'),
                  ])
                    if (target != _activeType)
                      OutlinedButton(onPressed: () => _convertTo(budget, target), child: Text(label)),
                ],
              ),
            if (_confirmDelete)
              _inlineConfirm(
                key: const ValueKey('entry-delete-confirm'),
                text: 'Delete this $kind? This can\'t be undone.',
                actions: [
                  OutlinedButton(onPressed: () => setState(() => _confirmDelete = false), child: const Text('Keep')),
                  FilledButton(
                    key: const ValueKey('entry-delete-confirm-btn'),
                    style: FilledButton.styleFrom(backgroundColor: p.badInk),
                    onPressed: _deleting ? null : () => _deleteEntry(budget),
                    child: Text(_deleting ? 'Deleting…' : 'Delete'),
                  ),
                ],
              ),
          ]),
        );
      },
    );
  }

  Widget _inlineConfirm({required Key key, required String text, String? hint, required List<Widget> actions}) {
    final p = context.palette;
    return Container(
      key: key,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: p.surfaceSubtle, borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(text, style: AppTypography.inter(fontSize: 13, color: p.text)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: actions),
        if (hint != null) ...[
          const SizedBox(height: 6),
          Text(hint, style: AppTypography.inter(fontSize: 11, color: p.textMuted)),
        ],
      ]),
    );
  }

  Future<void> _deleteEntry(BudgetProvider budget) async {
    setState(() => _deleting = true);
    try {
      if (widget.initialGoal != null) {
        await budget.deleteGoal(_editId);
      } else {
        await budget.deleteTransaction(_editId);
      }
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete. Please try again.')));
      setState(() => _confirmDelete = false);
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  /// Change type: reopen the sheet on the new tab with the same values; the
  /// original is deleted only once the new entry saves (as on web).
  void _convertTo(BudgetProvider budget, EntryType target) {
    final original = widget.initialTransaction!;
    final carry = EntryCarry(
      amountText: _amountCtrl.text.trim(),
      date: _selectedDate,
      note: _nameCtrl.text.trim(),
      accountType: _accountType,
      accountId: _selectedAccountId,
      category: _activeType == EntryType.income
          ? _incSource
          : (_isCustomCategory ? _customCategoryCtrl.text.trim() : _selectedCategory),
    );
    final navigator = Navigator.of(context);
    navigator.pop();
    showModalBottomSheet<void>(
      context: navigator.context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => UnifiedEntryModal(initialType: target, carry: carry, replaces: original),
    );
  }

  Widget _buildFooter(bool noAccounts) {
    final p = context.palette;
    final isPlan = _activeType == EntryType.item;
    if (!isPlan && !_canAddAnother) return const SizedBox.shrink();
    return Row(
      children: [
        if (isPlan && !_isEditing)
          Flexible(
            child: TextButton(
              key: const ValueKey('entry-already-paid'),
              onPressed: () => setState(() => _activeType = EntryType.transaction),
              child: const Text('Already paid? Log it as spend', overflow: TextOverflow.ellipsis),
            ),
          )
        else if (isPlan)
          Flexible(
            child: Semantics(
              toggled: _isPaid,
              label: _isPaid ? 'Payment done' : 'Payment pending',
              child: InkWell(
                key: const ValueKey('entry-paid-toggle'),
                onTap: () => setState(() => _isPaid = !_isPaid),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  ExcludeSemantics(
                    child: Switch(value: _isPaid, onChanged: (v) => setState(() => _isPaid = v)),
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(_isPaid ? 'Payment done' : 'Payment pending',
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: _isPaid ? p.goodInk : p.textSecondary)),
                  ),
                ]),
              ),
            ),
          ),
        const Spacer(),
        if (_canAddAnother)
          Flexible(
            child: TextButton(
              key: const ValueKey('save-add-another'),
              onPressed: _submitting || noAccounts ? null : () => _handleSubmit(again: true),
              child: const Text('Add & log another', overflow: TextOverflow.ellipsis),
            ),
          ),
      ],
    );
  }

  /// One assist at a time: planned bill > duplicate salary > someone else's money.
  Widget _buildAssist(BudgetProvider budget, MonthInfo? month, bool isDark) {
    final amount = toMinorUnits(num.tryParse(_amountCtrl.text) ?? 0);
    final description = _nameCtrl.text;
    final navigator = Navigator.of(context);

    Widget banner(String key, String message, List<Widget> actions, {bool warn = false}) => Container(
          key: ValueKey(key),
          margin: const EdgeInsets.only(top: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: warn ? context.palette.warn.withAlpha(25) : context.palette.indigo.withAlpha(20),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: warn ? context.palette.warn.withAlpha(90) : context.palette.indigo.withAlpha(70)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(message, style: const TextStyle(fontSize: 13, height: 1.35)),
            const SizedBox(height: 6),
            Wrap(spacing: 8, children: actions),
          ]),
        );

    // A spend that pays a planned bill
    if (_activeType == EntryType.transaction && _txType == 'expense' && !_dismissedAssists.contains('bill')) {
      final planned = budget.transactionModels.where((t) => t.isPlanned).toList();
      final bill = findBillMatch(planned, amount: amount, description: description, today: _formatDateYmd(DateTime.now()));
      if (bill != null) {
        return banner('assist-bill', 'Paying ${bill.name.isEmpty ? 'a planned bill' : bill.name} (${formatCurrency(bill.displayAmount)})?', [
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
      final salary = detectDuplicateSalary(description: description, amount: amount, month: month);
      if (salary != null) {
        return banner(
          'assist-salary',
          'Your ${formatCurrency(salary.amount)} salary${salary.date != null ? ' on ${salary.date}' : ''} is already in the plan. Logging it here counts it twice.',
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
        final action = hint.action;
        final who = hint.personName.isEmpty ? 'someone' : hint.personName;
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
              final fund = hint.fund;
              _personAction = action;
              _personFundId = fund?.id;
              _personName = fund == null ? hint.personName : '';
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

  bool get _canAddAnother =>
      !_isEditing &&
      (_activeType == EntryType.transaction || _activeType == EntryType.income || _activeType == EntryType.item);

  bool get _isPersonMove => _activeType == EntryType.transfer && _moveTarget == 'person';


  SimulatedCard? _selectedCard(BudgetProvider budget) {
    for (final c in budget.simulatedCards) {
      if (c.account.id == _cardId) return c;
    }
    return null;
  }

  Widget _buildTab(EntryType type, String title, WebIconData icon, bool isDark) {
    final isSelected = _activeType == type;
    final fg = isSelected
        ? (type == EntryType.income ? Colors.white : Theme.of(context).colorScheme.onPrimary)
        : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary);
    return Expanded(
      child: Semantics(
        selected: isSelected,
        button: true,
        child: InkWell(
          key: ValueKey('entry-tab-${type.name}'),
          onTap: () {
            setState(() => _activeType = type);
            if (type == EntryType.goal) _fetchGoalRecommendation();
          },
          borderRadius: BorderRadius.circular(6),
          child: Container(
            constraints: const BoxConstraints(minHeight: AppForm.controlHeight),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              color: isSelected
                  ? (type == EntryType.income ? context.palette.goodInk : Theme.of(context).colorScheme.primary)
                  : (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              WebIcon(icon, size: 13, color: fg),
              const SizedBox(width: 4),
              Flexible(
                child: Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: fg)),
              ),
            ]),
          ),
        ),
      ),
    );
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
    final dateError = _dateRuleError(dateStr, isRecurring);
    if (dateError != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(dateError)));
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
        await _saveTx(budget, label: incNote.isNotEmpty ? incNote : '$_incSource income', {
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
          final spendName = linked.name.isEmpty ? 'this spend' : linked.name;
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(left > 0
                ? 'Only ${formatCurrency(left)} of $spendName is left to refund.'
                : '$spendName is already fully refunded.'),
          ));
          setState(() => _submitting = false);
          return;
        }
        await _saveTx(budget, label: name, {
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
          if (_isEditing) 'isPaid': _isPaid,
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
              : (toCard ? '${_selectedCard(budget)?.account.name ?? 'Card'} bill' : name),
        });
      }


      if (widget.replaces != null) await budget.deleteTransaction(widget.replaces!.id);

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
