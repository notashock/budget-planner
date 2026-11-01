import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../modals/mark_paid_modal.dart';
import '../modals/add_transaction_modal.dart';
import '../modals/transaction_detail_modal.dart';

class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  // 'successful' | 'planned'
  String _activeTab = 'successful';

  // Filters within active tab
  String _successfulFilter = 'all'; // 'all' | 'expense' | 'income'
  String _plannedFilter = 'all'; // 'all' | 'due' | 'overdue' | 'goal'

  String _normalizeSpendingCategory(String? cat) {
    if (cat == null || cat.trim().isEmpty) return 'General';
    final lower = cat.trim().toLowerCase();
    if (lower == 'food') return 'Food';
    if (lower == 'travel') return 'Travel';
    if (lower == 'health') return 'Health';
    if (lower == 'other') return 'Other';
    return cat.trim();
  }

  Future<void> _handleCancelPlanned(BuildContext context, Map<String, dynamic> tx) async {
    final budget = context.read<BudgetProvider>();
    final txId = (tx['id'] ?? tx['_id']).toString();
    final isGoal = tx['origin'] == 'goal' || tx['goalId'] != null;

    if (isGoal) {
      // Goal cancellation prompt: Return to Logged vs Mark as Dropped
      final action = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cancel Goal Commitment'),
          content: const Text(
            'This planned transaction is linked to a purchase goal. What would you like to do with the goal?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'cancel_dialog'),
              child: const Text('Dismiss'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'keep_logged'),
              child: const Text('Return to Logged'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
              onPressed: () => Navigator.pop(ctx, 'drop'),
              child: const Text('Mark as Dropped', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );

      if (action == null || action == 'cancel_dialog') return;

      try {
        await budget.cancelTransaction(txId, goalAction: action);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(action == 'keep_logged'
                  ? 'Commitment cancelled; Goal returned to logged'
                  : 'Commitment cancelled; Goal dropped'),
            ),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to cancel: $e')),
          );
        }
      }
    } else {
      // Standard confirmation
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cancel Planned Commitment'),
          content: Text('Are you sure you want to cancel "${tx['name']}"?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Cancel Commitment', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );

      if (confirmed == true) {
        try {
          await budget.cancelTransaction(txId);
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Commitment cancelled')),
            );
          }
        } catch (e) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed to cancel: $e')),
            );
          }
        }
      }
    }
  }

  void _openMarkPaidModal(BuildContext context, Map<String, dynamic> tx) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => MarkPaidModal(transaction: tx),
    );
  }

  void _openAddModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AddTransactionModal(initialStatus: _activeTab),
    );
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? AppColors.darkBackground : AppColors.lightBackground;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final currency = budget.activeMonth?['currencySymbol']?.toString() ?? '₹';

    final allTransactions = budget.transactions.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();

    // Partition into successful and planned
    final successfulList = allTransactions.where((t) => t['status'] == 'successful').toList();
    final plannedList = allTransactions.where((t) => t['status'] == 'planned').toList();

    // Sort successful by date desc
    successfulList.sort((a, b) => (b['date']?.toString() ?? '').compareTo(a['date']?.toString() ?? ''));

    // Sort planned by plannedDate asc (due earliest first)
    plannedList.sort((a, b) {
      final da = (a['plannedDate'] ?? a['date'])?.toString() ?? '';
      final db = (b['plannedDate'] ?? b['date'])?.toString() ?? '';
      return da.compareTo(db);
    });

    // Apply secondary filters
    final displayedSuccessful = successfulList.where((t) {
      if (_successfulFilter == 'expense') return t['isIncome'] != true && t['type'] != 'income';
      if (_successfulFilter == 'income') return t['isIncome'] == true || t['type'] == 'income';
      return true;
    }).toList();

    final displayedPlanned = plannedList.where((t) {
      if (_plannedFilter == 'due') return t['derivedStatus'] == 'due';
      if (_plannedFilter == 'overdue') return t['derivedStatus'] == 'overdue';
      if (_plannedFilter == 'goal') return t['origin'] == 'goal' || t['goalId'] != null;
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: bg,
      body: Column(
        children: [
          // Segmented Navigation Header: [ Successful Transactions ] [ Planned Commitments ]
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            decoration: BoxDecoration(
              color: surface,
              border: Border(bottom: BorderSide(color: border, width: 1)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: border),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _activeTab = 'successful'),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              color: _activeTab == 'successful'
                                  ? (isDark ? AppColors.darkSurface : Colors.white)
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(8),
                              boxShadow: _activeTab == 'successful'
                                  ? [
                                      BoxShadow(
                                        color: Colors.black.withAlpha(20),
                                        blurRadius: 4,
                                        offset: const Offset(0, 1),
                                      ),
                                    ]
                                  : null,
                            ),
                            alignment: Alignment.center,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.check_circle_outline,
                                  size: 15,
                                  color: _activeTab == 'successful' ? AppColors.green : textSecondary,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'Successful (${successfulList.length})',
                                  style: AppTypography.inter(
                                    fontSize: 12.5,
                                    fontWeight: _activeTab == 'successful' ? FontWeight.w700 : FontWeight.w500,
                                    color: _activeTab == 'successful' ? text : textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _activeTab = 'planned'),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              color: _activeTab == 'planned'
                                  ? (isDark ? AppColors.darkSurface : Colors.white)
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(8),
                              boxShadow: _activeTab == 'planned'
                                  ? [
                                      BoxShadow(
                                        color: Colors.black.withAlpha(20),
                                        blurRadius: 4,
                                        offset: const Offset(0, 1),
                                      ),
                                    ]
                                  : null,
                            ),
                            alignment: Alignment.center,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.schedule,
                                  size: 15,
                                  color: _activeTab == 'planned' ? AppColors.amber : textSecondary,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'Planned (${plannedList.length})',
                                  style: AppTypography.inter(
                                    fontSize: 12.5,
                                    fontWeight: _activeTab == 'planned' ? FontWeight.w700 : FontWeight.w500,
                                    color: _activeTab == 'planned' ? text : textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),

                // Sub-filter chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _activeTab == 'successful'
                        ? [
                            _buildSubFilterChip('all', 'All (${successfulList.length})', _successfulFilter,
                                (val) => setState(() => _successfulFilter = val), isDark, border, text),
                            const SizedBox(width: 6),
                            _buildSubFilterChip(
                              'expense',
                              'Expenses (${successfulList.where((t) => t['isIncome'] != true && t['type'] != 'income').length})',
                              _successfulFilter,
                              (val) => setState(() => _successfulFilter = val),
                              isDark,
                              border,
                              text,
                            ),
                            const SizedBox(width: 6),
                            _buildSubFilterChip(
                              'income',
                              'Incomes (${successfulList.where((t) => t['isIncome'] == true || t['type'] == 'income').length})',
                              _successfulFilter,
                              (val) => setState(() => _successfulFilter = val),
                              isDark,
                              border,
                              text,
                            ),
                          ]
                        : [
                            _buildSubFilterChip('all', 'All (${plannedList.length})', _plannedFilter,
                                (val) => setState(() => _plannedFilter = val), isDark, border, text),
                            const SizedBox(width: 6),
                            _buildSubFilterChip(
                              'due',
                              'Due Soon (${plannedList.where((t) => t['derivedStatus'] == 'due').length})',
                              _plannedFilter,
                              (val) => setState(() => _plannedFilter = val),
                              isDark,
                              border,
                              text,
                            ),
                            const SizedBox(width: 6),
                            _buildSubFilterChip(
                              'overdue',
                              'Overdue (${plannedList.where((t) => t['derivedStatus'] == 'overdue').length})',
                              _plannedFilter,
                              (val) => setState(() => _plannedFilter = val),
                              isDark,
                              border,
                              text,
                            ),
                            const SizedBox(width: 6),
                            _buildSubFilterChip(
                              'goal',
                              'From Goals (${plannedList.where((t) => t['origin'] == 'goal' || t['goalId'] != null).length})',
                              _plannedFilter,
                              (val) => setState(() => _plannedFilter = val),
                              isDark,
                              border,
                              text,
                            ),
                          ],
                  ),
                ),
              ],
            ),
          ),

          // Main Transactions List
          Expanded(
            child: _activeTab == 'successful'
                ? _buildSuccessfulView(context, displayedSuccessful, isDark, surface, border, text, textSecondary, textMuted, currency)
                : _buildPlannedView(context, displayedPlanned, isDark, surface, border, text, textSecondary, textMuted, currency),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 3,
        icon: const Icon(Icons.add, size: 18),
        label: Text(
          _activeTab == 'planned' ? 'Add Planned' : 'Add Transaction',
          style: AppTypography.inter(fontWeight: FontWeight.w600, fontSize: 13),
        ),
        onPressed: () => _openAddModal(context),
      ),
    );
  }

  Widget _buildSubFilterChip(
    String key,
    String label,
    String current,
    ValueChanged<String> onSelected,
    bool isDark,
    Color border,
    Color text,
  ) {
    final active = key == current;
    return GestureDetector(
      onTap: () => onSelected(key),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: active
              ? (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: active ? AppColors.primary : border, width: active ? 1.2 : 0.8),
        ),
        child: Text(
          label,
          style: AppTypography.inter(
            fontSize: 11,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            color: active ? AppColors.primary : text,
          ),
        ),
      ),
    );
  }

  Widget _buildSuccessfulView(
    BuildContext context,
    List<Map<String, dynamic>> items,
    bool isDark,
    Color surface,
    Color border,
    Color text,
    Color textSecondary,
    Color textMuted,
    String currency,
  ) {
    if (items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.receipt_long_outlined, size: 48, color: textMuted),
            const SizedBox(height: 12),
            Text(
              'No successful transactions recorded',
              style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w600, color: textSecondary),
            ),
            const SizedBox(height: 4),
            Text(
              'Paid commitments and recorded transactions appear here',
              style: AppTypography.inter(fontSize: 12, color: textMuted),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 80),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, idx) {
        final tx = items[idx];
        final name = tx['name']?.toString() ?? 'Transaction';
        final isIncome = tx['isIncome'] == true || tx['type'] == 'income';
        final num amount = tx['amount'] ?? 0;
        final date = tx['date']?.toString() ?? '';
        final category = _normalizeSpendingCategory(tx['category']?.toString());
        final origin = tx['origin']?.toString() ?? 'spot';

        return InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () {
            showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              backgroundColor: Colors.transparent,
              builder: (_) => TransactionDetailModal(transactionData: tx),
            );
          },
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: border, width: 0.8),
            ),
            child: Row(
              children: [
                // Category Icon circle
                CircleAvatar(
                  radius: 18,
                  backgroundColor: isIncome ? AppColors.green.withAlpha(30) : AppColors.primary.withAlpha(20),
                  child: Icon(
                    isIncome ? Icons.arrow_downward : Icons.arrow_upward,
                    size: 16,
                    color: isIncome ? AppColors.green : AppColors.primary,
                  ),
                ),
                const SizedBox(width: 12),

                // Name & details
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: AppTypography.inter(fontSize: 13.5, fontWeight: FontWeight.w600, color: text),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Text(date, style: AppTypography.inter(fontSize: 11, color: textMuted)),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                            decoration: BoxDecoration(
                              color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: border, width: 0.5),
                            ),
                            child: Text(category, style: AppTypography.inter(fontSize: 10, color: textSecondary)),
                          ),
                          if (origin != 'spot') ...[
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                              decoration: BoxDecoration(
                                color: (origin == 'goal' ? Colors.purple : AppColors.amber).withAlpha(25),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                origin == 'goal' ? 'Goal' : 'Planned',
                                style: AppTypography.inter(
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w600,
                                  color: origin == 'goal' ? Colors.purple : AppColors.amber,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),

                // Amount
                Text(
                  '${isIncome ? '+' : '-'}${formatCurrency(amount, symbol: currency)}',
                  style: AppTypography.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: isIncome ? AppColors.green : text,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildPlannedView(
    BuildContext context,
    List<Map<String, dynamic>> items,
    bool isDark,
    Color surface,
    Color border,
    Color text,
    Color textSecondary,
    Color textMuted,
    String currency,
  ) {
    if (items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.schedule, size: 48, color: textMuted),
            const SizedBox(height: 12),
            Text(
              'No planned commitments',
              style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w600, color: textSecondary),
            ),
            const SizedBox(height: 4),
            Text(
              'Scheduled expenses and goals committed to budget appear here',
              style: AppTypography.inter(fontSize: 12, color: textMuted),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 80),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, idx) {
        final tx = items[idx];
        final name = tx['name']?.toString() ?? 'Planned Commitment';
        final num plannedAmount = tx['plannedAmount'] ?? tx['amount'] ?? 0;
        final date = (tx['plannedDate'] ?? tx['date'])?.toString() ?? '';
        final category = _normalizeSpendingCategory(tx['category']?.toString());
        final derivedStatus = tx['derivedStatus']?.toString() ?? 'planned';
        final origin = tx['origin']?.toString() ?? 'planned';

        Color badgeColor = textSecondary;
        String badgeLabel = 'Planned';
        IconData badgeIcon = Icons.schedule;

        if (derivedStatus == 'overdue') {
          badgeColor = AppColors.red;
          badgeLabel = 'Overdue';
          badgeIcon = Icons.error_outline;
        } else if (derivedStatus == 'due') {
          badgeColor = AppColors.amber;
          badgeLabel = 'Due Soon';
          badgeIcon = Icons.access_time_filled;
        }

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: derivedStatus == 'overdue'
                  ? AppColors.red.withAlpha(100)
                  : (derivedStatus == 'due' ? AppColors.amber.withAlpha(100) : border),
              width: derivedStatus == 'planned' ? 0.8 : 1.2,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Row: Name & Planned Amount
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w700, color: text),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    formatCurrency(plannedAmount, symbol: currency),
                    style: AppTypography.inter(fontSize: 14.5, fontWeight: FontWeight.w700, color: text),
                  ),
                ],
              ),
              const SizedBox(height: 6),

              // Status and category badges
              Row(
                children: [
                  // Due / Overdue badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: badgeColor.withAlpha(20),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: badgeColor.withAlpha(80), width: 0.6),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(badgeIcon, size: 11, color: badgeColor),
                        const SizedBox(width: 4),
                        Text(
                          badgeLabel,
                          style: AppTypography.inter(fontSize: 10.5, fontWeight: FontWeight.w700, color: badgeColor),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 6),

                  if (origin == 'goal') ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.purple.withAlpha(20),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: Colors.purple.withAlpha(80), width: 0.6),
                      ),
                      child: Text(
                        'Goal',
                        style: AppTypography.inter(fontSize: 10.5, fontWeight: FontWeight.w600, color: Colors.purple),
                      ),
                    ),
                    const SizedBox(width: 6),
                  ],

                  Text(
                    'Due $date',
                    style: AppTypography.inter(fontSize: 11, color: textMuted),
                  ),
                  const SizedBox(width: 6),
                  Text('• $category', style: AppTypography.inter(fontSize: 11, color: textSecondary)),
                ],
              ),
              const SizedBox(height: 12),

              // Action buttons row: [ Mark as Paid ] [ Cancel ]
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      side: BorderSide(color: border),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    icon: Icon(Icons.close, size: 13, color: textMuted),
                    label: Text(
                      'Cancel',
                      style: AppTypography.inter(fontSize: 11.5, fontWeight: FontWeight.w600, color: textSecondary),
                    ),
                    onPressed: () => _handleCancelPlanned(context, tx),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.green,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    icon: const Icon(Icons.check_circle_outline, size: 14),
                    label: Text(
                      'Mark as Paid',
                      style: AppTypography.inter(fontSize: 11.5, fontWeight: FontWeight.w700),
                    ),
                    onPressed: () => _openMarkPaidModal(context, tx),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}
