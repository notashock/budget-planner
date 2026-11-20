import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../engine/engine.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../models/account.dart';
import '../widgets/summary_cards.dart';
import '../widgets/step_line_chart.dart';
import '../widgets/timeline_list.dart';
import '../modals/month_modals.dart';
import '../modals/month_review_modal.dart';
import '../modals/unified_entry_modal.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../widgets/tab_states.dart';

class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key});

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  int? _selectedDay;
  String _selectedAccountId = 'all';

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    final month = budget.monthInfo;
    if (month == null) {
      return ScrollableEmpty(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'No Active Budget Month',
                style: AppTypography.cardTitle(color: text),
              ),
              const SizedBox(height: 8),
              Text(
                'Create or select a budget month to view your cashflow plan.',
                textAlign: TextAlign.center,
                style: AppTypography.inter(fontSize: 13, color: textMuted),
              ),
              const SizedBox(height: 20),
              // First run (upgrade plan 3.8): a new user had no way forward here.
              FilledButton.icon(
                key: const ValueKey('plan-create-month'),
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => CreateMonthModal(year: budget.currentYear, month: budget.currentMonth),
                ),
                icon: const Icon(Icons.add),
                label: Text('Create ${DateFormat.MMMM().format(DateTime(budget.currentYear, budget.currentMonth))} ${budget.currentYear}'),
              ),
            ],
          ),
        ),
      );
    }

    final currencySymbol = month.currencySymbol;

    // An account view needs that account's own simulation from the server. If it
    // is not there (yet), show the all-accounts view honestly, not all-accounts
    // numbers under one account's name.
    final selectedAccount = _resolveSelectedAccount(budget, _selectedAccountId);
    final accountSimulation =
        selectedAccount == null ? null : budget.getAccountSimulation(selectedAccount.id);
    final isFilteringAccount = accountSimulation != null;
    final activeSimulation = accountSimulation ?? _unifiedSimulation(budget);
    final activeSafetyFloor = isFilteringAccount ? selectedAccount!.minimumBalance : month.safetyFloor;

    final now = DateTime.now();
    final monthYear = month.year;
    final monthNum = month.month;
    final isCurrentMonth = monthYear == now.year && monthNum == now.month;
    final currentDay = isCurrentMonth ? now.day : null;

    int? salaryCreditDay;
    final salaryCreditedDate = month.salaryCreditedDate;
    if (salaryCreditedDate != null) {
      salaryCreditDay = getRelativeDay(salaryCreditedDate, monthYear, monthNum);
    }
    salaryCreditDay ??= month.incomeCreditDay;

    return Scaffold(
      body: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 90),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 1. Account Filter Pill Track (Horizontal Scroll)
              _buildAccountFilterBar(budget, isDark, border, text, textSecondary, currencySymbol),
              const SizedBox(height: 10),

              // 2. Isolated Account Notification Banner (if filtered)
              if (isFilteringAccount) ...[
                _buildIsolatedAccountBanner(
                  selectedAccount!,
                  activeSafetyFloor,
                  activeSimulation.closingBalance,
                  currencySymbol,
                  isDark,
                  border,
                  text,
                  textSecondary,
                ),
                const SizedBox(height: 12),
              ],

              // 3. Safe Velocity Hero Card
              SafeVelocityCard(
                safeVelocity: activeSimulation.safeVelocity,
                currencySymbol: currencySymbol,
              ),
              const SizedBox(height: 12),

              // 4. Cashflow Trajectory Chart (Curved Spline). Own layer, so
              // scrolling the page doesn't repaint it (upgrade plan 2.9).
              RepaintBoundary(
                child: StepLineChartWidget(
                  simulation: activeSimulation,
                  safetyFloor: activeSafetyFloor,
                  daysInMonth: activeSimulation.days.isNotEmpty ? activeSimulation.days.length : 30,
                  currentDay: currentDay,
                  salaryCreditDay: salaryCreditDay,
                  selectedDay: _selectedDay,
                  onSelectDay: (day) => setState(() => _selectedDay = day),
                  currencySymbol: currencySymbol,
                  onOpenReview: () {
                    showMonthReviewModal(
                      context,
                      month: month,
                      simulation: activeSimulation,
                      safetyFloor: activeSafetyFloor,
                      currencySymbol: currencySymbol,
                    );
                  },
                ),
              ),
              const SizedBox(height: 12),

              // 5. Detailed KPI Grid (2x2 Bento)
              DetailedKpiGrid(
                incomeAmount: activeSimulation.totalIncome,
                incomeCreditDay: month.incomeCreditDay,
                isSalaryCredited: month.isSalaryCredited,
                salaryCreditedDate: salaryCreditedDate,
                totalExpenses: activeSimulation.totalPlannedExpenses + activeSimulation.totalActualExpenses,
                expenseOccurrencesCount: activeSimulation.allEvents.where((e) => e.amount < 0).length,
                todayBalance: activeSimulation.todaysBalance,
                endingBalance: activeSimulation.closingBalance,
                lowestBalance: activeSimulation.lowestBalance,
                lowestDate: activeSimulation.days.isNotEmpty
                    ? activeSimulation.days.firstWhere((d) => d.day == activeSimulation.lowestBalanceDay, orElse: () => activeSimulation.days.first).date
                    : '',
                safetyFloor: activeSafetyFloor,
                currencySymbol: currencySymbol,
              ),
              const SizedBox(height: 12),

              // 6. Interactive Timeline Card
              TimelineListWidget(
                simulation: activeSimulation,
                safetyFloor: activeSafetyFloor,
                selectedDay: _selectedDay,
                currentDay: currentDay,
                onSelectDay: (day) => setState(() => _selectedDay = day),
                currencySymbol: currencySymbol,
              ),
            ],
          ),
        ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Theme.of(context).colorScheme.onPrimary,
        elevation: 2,
        icon: const Icon(Icons.add, size: 18),
        label: Text('New Entry', style: AppTypography.inter(fontSize: 12.5, fontWeight: FontWeight.w700)),
        onPressed: () {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => const UnifiedEntryModal(),
          );
        },
      ),
    );
  }

  Widget _buildAccountFilterBar(
    BudgetProvider budget,
    bool isDark,
    Color border,
    Color text,
    Color textSecondary,
    String currencySymbol,
  ) {
    final bankAccounts = budget.bankAccountModels;
    final wallets = budget.walletModels;
    final hasAccounts = bankAccounts.isNotEmpty || wallets.isNotEmpty;

    if (!hasAccounts) return const SizedBox.shrink();

    final int unifiedTodayBal = budget.simulation?.todaysBalance ?? 0;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          // All Accounts (Unified)
          _buildFilterPill(
            id: 'all',
            label: 'All Accounts',
            amount: unifiedTodayBal,
            isSelected: _selectedAccountId == 'all',
            isDark: isDark,
            border: border,
            text: text,
            textSecondary: textSecondary,
            currencySymbol: currencySymbol,
          ),
          const SizedBox(width: 6),

          // Bank Accounts
          for (final b in bankAccounts) ...[
            Builder(builder: (_) {
              final accId = b.id;
              // Never the opening balance in place of today's: unknown shows no amount.
              final int? todayBal = budget.accountSimulations[accId]?.todaysBalance ??
                  budget.simulation?.accountBalances[accId] ??
                  b.currentBalance;
              final isBreached = todayBal != null && todayBal < b.minimumBalance;

              return _buildFilterPill(
                id: accId,
                label: b.name.isEmpty ? 'Bank' : b.name,
                amount: todayBal,
                icon: Icons.account_balance,
                hasBreach: isBreached,
                isSelected: _selectedAccountId == accId,
                isDark: isDark,
                border: border,
                text: text,
                textSecondary: textSecondary,
                currencySymbol: currencySymbol,
              );
            }),
            const SizedBox(width: 6),
          ],

          // Wallets
          for (final w in wallets) ...[
            Builder(builder: (_) {
              final accId = w.id;
              // Never the opening balance in place of today's: unknown shows no amount.
              final int? todayBal = budget.accountSimulations[accId]?.todaysBalance ??
                  budget.simulation?.accountBalances[accId] ??
                  w.currentBalance;
              final isBreached = todayBal != null && todayBal < w.minimumBalance;

              return _buildFilterPill(
                id: accId,
                label: w.name.isEmpty ? 'Wallet' : w.name,
                amount: todayBal,
                icon: Icons.account_balance_wallet_outlined,
                hasBreach: isBreached,
                isSelected: _selectedAccountId == accId,
                isDark: isDark,
                border: border,
                text: text,
                textSecondary: textSecondary,
                currencySymbol: currencySymbol,
              );
            }),
            const SizedBox(width: 6),
          ],
        ],
      ),
    );
  }

  Widget _buildFilterPill({
    required String id,
    required String label,
    int? amount,
    IconData? icon,
    bool hasBreach = false,
    required bool isSelected,
    required bool isDark,
    required Color border,
    required Color text,
    required Color textSecondary,
    String currencySymbol = kDefaultCurrencySymbol,
  }) {
    final activeBg = Theme.of(context).colorScheme.primary;
    final activeText = Theme.of(context).colorScheme.onPrimary;
    final inactiveBg = isDark ? AppColors.darkSurface : AppColors.lightSurface;

    return InkWell(
      onTap: () => setState(() {
        _selectedAccountId = id;
        _selectedDay = null; // reset day filter when switching account
      }),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected ? activeBg : inactiveBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? activeBg : (hasBreach ? context.palette.bad.withAlpha(120) : border),
            width: 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 12, color: isSelected ? activeText : textSecondary),
              const SizedBox(width: 5),
            ],
            Text(
              label,
              style: AppTypography.inter(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? activeText : text,
              ),
            ),
            if (amount != null) ...[
              const SizedBox(width: 5),
              Text(
                '• ${formatCurrencyWhole(amount, symbol: currencySymbol)}',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: isSelected ? activeText : (hasBreach ? context.palette.badInk : (isDark ? Colors.white.withAlpha(220) : Colors.black.withAlpha(200))),
                ),
              ),
            ],
            if (hasBreach) ...[
              const SizedBox(width: 3),
              Icon(
                Icons.warning_amber_rounded,
                size: 9,
                color: isSelected ? activeText : context.palette.badInk,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildIsolatedAccountBanner(
    Account account,
    int safetyFloor,
    int endingBalance,
    String currencySymbol,
    bool isDark,
    Color border,
    Color text,
    Color textSecondary,
  ) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: border, width: 1),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Row(
              children: [
                Icon(
                  account.kind == AccountKind.wallet ? Icons.account_balance_wallet_outlined : Icons.account_balance,
                  size: 13,
                  color: textSecondary,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: RichText(
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    text: TextSpan(
                      style: AppTypography.inter(fontSize: 11, color: textSecondary),
                      children: [
                        const TextSpan(text: 'Viewing isolated trajectory for '),
                        TextSpan(
                          text: '${account.name} ',
                          style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w700, color: text),
                        ),
                        if (safetyFloor > 0)
                          TextSpan(
                            text: '• Min: ${formatCurrencyWhole(safetyFloor, symbol: currencySymbol)} ',
                            style: AppTypography.mono(fontSize: 10.5, color: textSecondary),
                          ),
                        TextSpan(
                          text: '• End: ${formatCurrencyWhole(endingBalance, symbol: currencySymbol)}',
                          style: AppTypography.mono(fontSize: 10.5, color: textSecondary),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          InkWell(
            onTap: () => setState(() => _selectedAccountId = 'all'),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              child: Text(
                'Reset',
                style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w700, color: text),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// The all-accounts simulation, or an empty one before the first load.
  SimulationResult _unifiedSimulation(BudgetProvider budget) =>
      budget.simulation ??
      SimulationResult(
        openingBalance: 0,
        closingBalance: 0,
        lowestBalance: 0,
        lowestBalanceDay: 1,
        totalIncome: 0,
        totalPlannedExpenses: 0,
        totalActualExpenses: 0,
        todaysBalance: 0,
        days: [],
        allEvents: [],
        breaches: [],
        safeVelocity: SafeVelocity(safeDailyAmount: 0, remainingDays: 1, availableBudget: 0, status: 'healthy'),
        accountBalances: {},
      );

  Account? _resolveSelectedAccount(BudgetProvider budget, String selectedAccountId) {
    if (selectedAccountId == 'all') return null;
    for (final a in [...budget.bankAccountModels, ...budget.walletModels]) {
      if (a.id == selectedAccountId) return a;
    }
    return null;
  }
}
