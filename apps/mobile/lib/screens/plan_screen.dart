import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../engine/engine.dart';
import '../providers/budget_provider.dart';
import '../widgets/summary_cards.dart';
import '../widgets/step_line_chart.dart';
import '../widgets/timeline_list.dart';
import '../modals/month_review_modal.dart';
import '../modals/unified_entry_modal.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

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
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    if (budget.isLoading && budget.simulation == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (budget.activeMonth == null) {
      return Center(
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
            ],
          ),
        ),
      );
    }

    final rawMonth = budget.activeMonth;
    final Map<String, dynamic>? monthData = (rawMonth != null && rawMonth['month'] is Map)
        ? Map<String, dynamic>.from(rawMonth['month'] as Map)
        : rawMonth;

    final currencySymbol = (monthData?['currencySymbol'] ?? '₹').toString();
    final activeSimulation = _resolveActiveSimulation(budget, _selectedAccountId);
    final isFilteringAccount = _selectedAccountId != 'all';

    final selectedAccount = _resolveSelectedAccount(budget, _selectedAccountId);
    final activeSafetyFloor = isFilteringAccount
        ? (num.tryParse('${selectedAccount?['minimumBalance'] ?? 0}') ?? 0).round()
        : (num.tryParse('${monthData?['safetyFloor'] ?? 0}') ?? 0).round();

    final now = DateTime.now();
    final monthYear = (num.tryParse('${monthData?['year']}') ?? now.year).toInt();
    final monthNum = (num.tryParse('${monthData?['month']}') ?? now.month).toInt();
    final isCurrentMonth = monthYear == now.year && monthNum == now.month;
    final currentDay = isCurrentMonth ? now.day : null;

    final incomeCreditDay = (num.tryParse('${monthData?['incomeCreditDay'] ?? 1}') ?? 1).toInt();
    final isSalaryCredited = monthData?['isSalaryCredited'] == true;
    final salaryCreditedDate = monthData?['salaryCreditedDate']?.toString();

    int? salaryCreditDay;
    if (salaryCreditedDate != null && salaryCreditedDate.isNotEmpty) {
      salaryCreditDay = getRelativeDay(salaryCreditedDate, monthYear, monthNum);
    }
    salaryCreditDay ??= incomeCreditDay;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => budget.refresh(),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 90),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 1. Account Filter Pill Track (Horizontal Scroll)
              _buildAccountFilterBar(budget, isDark, border, text, textSecondary, currencySymbol),
              const SizedBox(height: 10),

              // 2. Isolated Account Notification Banner (if filtered)
              if (isFilteringAccount && selectedAccount != null) ...[
                _buildIsolatedAccountBanner(
                  selectedAccount,
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

              // 4. Cashflow Trajectory Chart (Curved Spline)
              StepLineChartWidget(
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
                    month: budget.activeMonth ?? {},
                    simulation: activeSimulation,
                    safetyFloor: activeSafetyFloor,
                    currencySymbol: currencySymbol,
                  );
                },
              ),
              const SizedBox(height: 12),

              // 5. Detailed KPI Grid (2x2 Bento)
              DetailedKpiGrid(
                incomeAmount: activeSimulation.totalIncome,
                incomeCreditDay: incomeCreditDay,
                isSalaryCredited: isSalaryCredited,
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
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: isDark ? Colors.white : Colors.black,
        foregroundColor: isDark ? Colors.black : Colors.white,
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
    final bankAccounts = budget.bankAccounts;
    final wallets = budget.wallets;
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
              final accId = (b['_id'] ?? b['id'])?.toString() ?? '';
              final accSim = budget.accountSimulations[accId];
              final todayBal = accSim?.todaysBalance ??
                  budget.simulation?.accountBalances[accId] ??
                  (num.tryParse('${b['currentBalance'] ?? b['openingBalance'] ?? 0}') ?? 0).round();
              final minBal = (num.tryParse('${b['minimumBalance'] ?? 0}') ?? 0).round();
              final isBreached = todayBal < minBal;

              return _buildFilterPill(
                id: accId,
                label: (b['name'] ?? 'Bank').toString(),
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
              final accId = (w['_id'] ?? w['id'])?.toString() ?? '';
              final accSim = budget.accountSimulations[accId];
              final todayBal = accSim?.todaysBalance ??
                  budget.simulation?.accountBalances[accId] ??
                  (num.tryParse('${w['currentBalance'] ?? w['openingBalance'] ?? 0}') ?? 0).round();
              final minBal = (num.tryParse('${w['minimumBalance'] ?? 0}') ?? 0).round();
              final isBreached = todayBal < minBal;

              return _buildFilterPill(
                id: accId,
                label: (w['name'] ?? 'Wallet').toString(),
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
    String currencySymbol = '₹',
  }) {
    final activeBg = isDark ? Colors.white : Colors.black;
    final activeText = isDark ? Colors.black : Colors.white;
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
            color: isSelected ? activeBg : (hasBreach ? AppColors.red.withAlpha(120) : border),
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
                '• ${formatCurrency(amount, symbol: currencySymbol)}',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: isSelected ? activeText : (hasBreach ? AppColors.red : (isDark ? Colors.white.withAlpha(220) : Colors.black.withAlpha(200))),
                ),
              ),
            ],
            if (hasBreach) ...[
              const SizedBox(width: 3),
              Icon(
                Icons.warning_amber_rounded,
                size: 9,
                color: isSelected ? activeText : AppColors.red,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildIsolatedAccountBanner(
    Map<String, dynamic> account,
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
                  account['type'] == 'wallet' ? Icons.account_balance_wallet_outlined : Icons.account_balance,
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
                          text: '${account['name']} ',
                          style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w700, color: text),
                        ),
                        if (safetyFloor > 0)
                          TextSpan(
                            text: '• Min: ${formatCurrency(safetyFloor, symbol: currencySymbol)} ',
                            style: AppTypography.mono(fontSize: 10.5, color: textSecondary),
                          ),
                        TextSpan(
                          text: '• End: ${formatCurrency(endingBalance, symbol: currencySymbol)}',
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

  String? _extractId(dynamic obj) {
    if (obj == null) return null;
    if (obj is Map) {
      return (obj['_id'] ?? obj['id'])?.toString();
    }
    return obj.toString();
  }

  SimulationResult _resolveActiveSimulation(BudgetProvider budget, String selectedAccountId) {
    final unified = budget.simulation;
    if (selectedAccountId == 'all' || unified == null) {
      return unified ??
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
    }

    // 1. Authoritative Backend Calculation (ADR 0052)
    final serverSim = budget.getAccountSimulation(selectedAccountId);
    if (serverSim != null) {
      return serverSim;
    }

    // 2. Offline Fallback
    final account = _resolveSelectedAccount(budget, selectedAccountId);
    if (account == null) return unified;

    final opening = (num.tryParse('${account['openingBalance'] ?? account['currentBalance'] ?? 0}') ?? 0).round();
    final minBal = (num.tryParse('${account['minimumBalance'] ?? 0}') ?? 0).round();

    final rawMonth = budget.activeMonth;
    final Map<String, dynamic> monthData = (rawMonth != null && rawMonth['month'] is Map)
        ? Map<String, dynamic>.from(rawMonth['month'] as Map)
        : (rawMonth ?? {});

    final designatedSalaryBankId = _extractId(monthData['salaryBankAccountId']);

    final isBank = account['type'] == 'bank';
    final isPrimaryBank = isBank && account['isPrimary'] == true;
    final isSoleBank = isBank && budget.bankAccounts.length == 1;
    final isDesignatedSalaryBank = designatedSalaryBankId != null && designatedSalaryBankId == selectedAccountId;

    // A bank receives salary if explicitly designated, or if unconfigured and it's the primary/sole bank
    final receivesSalary = isDesignatedSalaryBank ||
        (designatedSalaryBankId == null && (isPrimaryBank || isSoleBank));

    // Fallback account for legacy unassigned entries: only primary bank, designated salary bank, or sole bank
    final isFallbackAccount = isPrimaryBank || isDesignatedSalaryBank || isSoleBank;

    // Filter Items strictly to this account
    final filteredItems = budget.items.where((it) {
      final bId = _extractId(it['bankAccountId']);
      final wId = _extractId(it['walletId']);
      final sBankId = _extractId(it['sourceBankAccountId']);
      final dBankId = _extractId(it['destinationBankAccountId']);

      if (bId == selectedAccountId || wId == selectedAccountId) return true;
      if (sBankId == selectedAccountId || dBankId == selectedAccountId) return true;

      // If item has no account assigned at all, attribute to fallback bank
      if (bId == null && wId == null && sBankId == null && dBankId == null) {
        return isFallbackAccount;
      }
      return false;
    }).toList();

    // Filter Transactions strictly to this account
    final filteredTransactions = budget.transactions.where((tx) {
      final bId = _extractId(tx['bankAccountId']);
      final wId = _extractId(tx['walletId']);

      if (bId == selectedAccountId || wId == selectedAccountId) return true;

      // If transaction has no account assigned, attribute to fallback bank
      if (bId == null && wId == null) {
        return isFallbackAccount;
      }
      return false;
    }).toList();

    // Filter Transfers strictly to this account
    final filteredTransfers = budget.transfers.where((tr) {
      final s = _extractId(tr['sourceBankAccountId'] ?? tr['sourceWalletId']);
      final d = _extractId(tr['destinationBankAccountId'] ?? tr['destinationWalletId']);
      return s == selectedAccountId || d == selectedAccountId;
    }).toList();

    return simulate(
      settings: {
        'openingBalance': opening,
        'safetyFloor': minBal,
        'incomeAmount': receivesSalary ? (num.tryParse('${monthData['incomeAmount'] ?? 0}') ?? 0).round() : 0,
        'incomeCreditDay': (num.tryParse('${monthData['incomeCreditDay'] ?? 1}') ?? 1).toInt(),
        'salaryBankAccountId': designatedSalaryBankId,
        'isSalaryCredited': monthData['isSalaryCredited'] == true,
        'salaryCreditedDate': monthData['salaryCreditedDate']?.toString(),
      },
      items: filteredItems,
      month: monthData,
      transactions: filteredTransactions,
      goals: budget.goals,
      transfers: filteredTransfers,
      accounts: [account],
    );
  }

  Map<String, dynamic>? _resolveSelectedAccount(BudgetProvider budget, String selectedAccountId) {
    if (selectedAccountId == 'all') return null;

    for (final b in budget.bankAccounts) {
      if (_extractId(b) == selectedAccountId) {
        return Map<String, dynamic>.from(b as Map)..putIfAbsent('type', () => 'bank');
      }
    }
    for (final w in budget.wallets) {
      if (_extractId(w) == selectedAccountId) {
        return Map<String, dynamic>.from(w as Map)..putIfAbsent('type', () => 'wallet');
      }
    }
    return null;
  }
}
