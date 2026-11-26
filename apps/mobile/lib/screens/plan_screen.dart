import 'package:flutter/material.dart';
import '../engine/engine.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../models/account.dart';
import '../widgets/summary_cards.dart';
import '../widgets/step_line_chart.dart';
import '../widgets/timeline_list.dart';
import '../modals/month_review_modal.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../engine/plan_insights.dart';
import '../services/outbox.dart' show WriteResult;
import '../modals/transaction_detail_modal.dart' show canEditTransaction, openEditTransaction;
import '../widgets/plan_glance.dart';
import '../widgets/irregular_dashboard.dart';
import '../engine/income_engine.dart';
import '../widgets/web_icons.dart';

class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key});

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  int? _selectedDay;
  String _selectedAccountId = 'all';
  // shortcut: not remembered across launches (web keeps it in localStorage); persist if users ask.
  bool _detailsOpen = false;

  void _toggleDetails() => setState(() => _detailsOpen = !_detailsOpen);

  Future<void> _payUpcoming(BuildContext context, BudgetProvider budget, TimelineEvent e, String today, String? scopeAccountId) async {
    final messenger = ScaffoldMessenger.of(context);
    final id = e.transactionId ?? e.id;
    final name = e.name.isEmpty ? 'Payment' : e.name;
    try {
      final result = await budget.payTransaction(id, accountId: e.accountId ?? scopeAccountId, amount: -e.amount, date: today);
      messenger.showSnackBar(SnackBar(
        content: Text(result == WriteResult.queued
            ? 'No connection. The payment is saved on this phone and will sync.'
            : 'Marked “$name” paid'),
      ));
    } catch (err) {
      messenger.showSnackBar(SnackBar(content: Text('Couldn’t mark “$name” paid: $err')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    final month = budget.monthInfo;
    // As web: no salary month, or an irregular-income user, sees runway and cashflow instead
    if (month == null || budget.userSettings['incomeMode'] == 'irregular') {
      return _buildIrregular(budget, isDark, border, text, textSecondary,
          month?.currencySymbol ?? '${budget.userSettings['currencySymbol'] ?? kDefaultCurrencySymbol}');
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
    // The engine counts a salary cycle from its first day, so take today's day from it
    final engineDay = _unifiedSimulation(budget).currentDay;
    final currentDay = engineDay != null ? (engineDay >= 1 ? engineDay : null) : (isCurrentMonth ? now.day : null);

    int? salaryCreditDay;
    final salaryCreditedDate = month.salaryCreditedDate;
    if (salaryCreditedDate != null) {
      salaryCreditDay = getRelativeDay(salaryCreditedDate, monthYear, monthNum);
    }
    salaryCreditDay ??= month.incomeCreditDay;

    final sv = activeSimulation.safeVelocity;
    final verdict = getMonthVerdict(
      lowestBalance: upcomingLow(activeSimulation, currentDay),
      safetyFloor: activeSafetyFloor,
      paceStatus: sv.status,
      safeRate: sv.safeDailyAmount,
    );
    String iso(int y, int m, int d) => '$y-${m.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';
    final realToday = iso(now.year, now.month, now.day);
    // "Today" for Due soon: the real date this month, day 1 when planning ahead, none for past months.
    final isFutureMonth = monthYear > now.year || (monthYear == now.year && monthNum > now.month);
    final upcomingToday = isCurrentMonth ? realToday : (isFutureMonth ? iso(monthYear, monthNum, 1) : null);

    return Scaffold(
      body: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(10, 2, 10, MediaQuery.paddingOf(context).bottom + 16), // clears the dock
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

              // 3. At a glance (web's .plan-glance): one number, where today's
              // money is promised, and what's due. The rest is behind Details.
              MonthHealthHero(
                rate: activeSimulation.safeVelocity.safeDailyAmount,
                daysLeft: activeSimulation.safeVelocity.remainingDays,
                verdict: verdict,
                balances: [for (final d in activeSimulation.days) d.closingBalance],
                currentDay: currentDay,
                currencySymbol: currencySymbol,
                detailsOpen: _detailsOpen,
                onToggleDetails: _toggleDetails,
              ),
              const SizedBox(height: 12),
              CashAllocationBar(
                todayBalance: activeSimulation.todaysBalance,
                allocation: buildCashAllocation(
                  todayBalance: activeSimulation.todaysBalance,
                  committedUpcomingItems: sv.committedUpcomingItems,
                  safetyFloor: activeSafetyFloor,
                  goalReserve: sv.goalReserve,
                  heldReserve: sv.heldReserve,
                  cardReserve: sv.cardReserve,
                  freeSurplus: sv.freeSurplus,
                ),
                currencySymbol: currencySymbol,
              ),
              if (upcomingToday != null) ...[
                const SizedBox(height: 12),
                DueSoonCard(
                  events: activeSimulation.allEvents,
                  today: upcomingToday,
                  currencySymbol: currencySymbol,
                  onPay: (e) => _payUpcoming(context, budget, e, realToday, selectedAccount?.id),
                ),
              ],
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: Semantics(
                  button: true,
                  expanded: _detailsOpen,
                  excludeSemantics: true,
                  label: _detailsOpen ? 'Hide details' : 'Details',
                  onTap: _toggleDetails,
                  child: InkWell(
                    key: const Key('plan-details-toggle'),
                    onTap: _toggleDetails,
                    borderRadius: BorderRadius.circular(8),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 48),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Text(_detailsOpen ? 'Hide details' : 'Details',
                              style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: textSecondary)),
                          const SizedBox(width: 4),
                          AnimatedRotation(
                            turns: _detailsOpen ? 0.25 : 0,
                            duration: const Duration(milliseconds: 150),
                            child: Text('›',
                                style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w600, color: textSecondary)),
                          ),
                        ]),
                      ),
                    ),
                  ),
                ),
              ),
              if (_detailsOpen) ...[
              const SizedBox(height: 10),
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
              AllowancePaceMeter(
                unplannedAllowance: activeSimulation.unplannedAllowance,
                totalUnplannedSpent: activeSimulation.totalUnplannedSpent,
                daysElapsed: activeSimulation.daysElapsed ?? _unifiedSimulation(budget).daysElapsed ?? 1,
                daysInMonth: activeSimulation.daysInMonth ??
                    _unifiedSimulation(budget).daysInMonth ??
                    (activeSimulation.days.isNotEmpty ? activeSimulation.days.length : 30),
                currencySymbol: currencySymbol,
              ),
              ],
              const SizedBox(height: 12),

              // 6. Interactive Timeline Card
              TimelineListWidget(
                simulation: activeSimulation,
                safetyFloor: activeSafetyFloor,
                selectedDay: _selectedDay,
                currentDay: currentDay,
                onSelectDay: (day) => setState(() => _selectedDay = day),
                currencySymbol: currencySymbol,
                accountNames: {for (final a in [...budget.bankAccountModels, ...budget.walletModels]) a.id: a.name},
                accountName: isFilteringAccount ? selectedAccount!.name : null,
                accountIsWallet: selectedAccount?.kind == AccountKind.wallet,
                onPay: (e) => _payUpcoming(context, budget, e, realToday, selectedAccount?.id),
                onEdit: (e) {
                  for (final t in budget.transactionModels) {
                    if (t.id == e.transactionId && canEditTransaction(t)) {
                      openEditTransaction(context, t);
                      return;
                    }
                  }
                },
              ),
            ],
          ),
        ),
    );
  }

  Widget _buildIrregular(BudgetProvider budget, bool isDark, Color border, Color text, Color textSecondary, String currencySymbol) {
    final metrics = calculateIrregularMetrics(
      transactions: budget.transactions,
      accounts: [...budget.bankAccounts, ...budget.wallets],
    );
    return Scaffold(
      body: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(10, 2, 10, MediaQuery.paddingOf(context).bottom + 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _buildAccountFilterBar(budget, isDark, border, text, textSecondary, currencySymbol),
          const SizedBox(height: 10),
          RunwayGauge(metrics: metrics, currencySymbol: currencySymbol),
          const SizedBox(height: 10),
          IrregularHeroCards(metrics: metrics, currencySymbol: currencySymbol),
          const SizedBox(height: 10),
          CashflowAnalysisCard(metrics: metrics, currencySymbol: currencySymbol),
        ]),
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
    final accounts = [
      for (final b in budget.bankAccountModels) (b, WebIcons.buildingLibrary, 'Bank'),
      for (final w in budget.walletModels) (w, WebIcons.wallet, 'Wallet'),
    ];
    if (accounts.isEmpty) return const SizedBox.shrink();

    // web's liveBalance(): this month, the account's own balance; other months,
    // the simulation's. Never the opening balance in place of today's.
    final now = DateTime.now();
    final month = budget.monthInfo;
    final isThisMonth = month == null || (month.year == now.year && month.month == now.month);
    int? todayOf(Account a) => isThisMonth && a.currentBalance != null
        ? a.currentBalance
        : budget.accountSimulations[a.id]?.todaysBalance ?? budget.simulation?.accountBalances[a.id] ?? a.currentBalance;
    // web's "All" pill is the sum of the account pills.
    final all = accounts.fold<int>(0, (sum, x) => sum + (todayOf(x.$1) ?? 0));

    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _buildFilterPill(id: 'all', label: 'All', amount: all, currencySymbol: currencySymbol),
          for (final (a, icon, fallback) in accounts) ...[
            const SizedBox(width: 6),
            Builder(builder: (_) {
              final bal = todayOf(a);
              return _buildFilterPill(
                id: a.id,
                label: a.name.isEmpty ? fallback : a.name,
                amount: bal,
                icon: icon,
                hasBreach: bal != null && bal < a.minimumBalance,
                headroom: a.minimumBalance > 0 && bal != null ? getHeadroom(bal, a.minimumBalance) : null,
                currencySymbol: currencySymbol,
              );
            }),
          ],
        ],
      ),
    );
  }

  /// web's `.account-filter-pill`: surface pill, the selected one inverted
  /// (text colour background), with a 2 px headroom bar along the bottom.
  Widget _buildFilterPill({
    required String id,
    required String label,
    int? amount,
    WebIconData? icon,
    bool hasBreach = false,
    Headroom? headroom,
    String currencySymbol = kDefaultCurrencySymbol,
  }) {
    final p = context.palette;
    final isSelected = _selectedAccountId == id;
    final fg = isSelected ? p.bg : p.textSecondary;
    final headroomColour = switch (headroom?.status) { 'breached' => p.bad, 'warning' => p.warn, _ => p.good };
    return Semantics(
      selected: isSelected,
      button: true,
      child: Material(
        color: isSelected ? p.text : p.surface,
        shape: StadiumBorder(side: BorderSide(color: isSelected ? p.text : (hasBreach ? p.bad : p.border))),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => setState(() {
            _selectedAccountId = id;
            _selectedDay = null; // reset day filter when switching account
          }),
          child: Stack(children: [
            Container(
              constraints: const BoxConstraints(minHeight: 34),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (icon != null) ...[WebIcon(icon, size: 12, color: fg), const SizedBox(width: 6)],
                Text(label,
                    style: AppTypography.inter(
                        fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500, color: fg)),
                if (amount != null) ...[
                  const SizedBox(width: 6),
                  Opacity(
                    opacity: isSelected ? 1 : 0.8,
                    child: Text(formatCurrencyWhole(amount, symbol: currencySymbol),
                        style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w700, color: fg)),
                  ),
                ],
                if (hasBreach) ...[const SizedBox(width: 6), WebIcon(WebIcons.alertTriangle, size: 10, color: p.bad)],
              ]),
            ),
            if (headroom != null)
              Positioned(
                left: 0,
                bottom: 0,
                right: 0,
                child: FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: headroom.ratio < 0.06 ? 0.06 : headroom.ratio,
                  child: Container(height: 2, color: headroomColour),
                ),
              ),
          ]),
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
                WebIcon(
                  account.kind == AccountKind.wallet ? WebIcons.wallet : WebIcons.buildingLibrary,
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
                        const TextSpan(text: 'Showing only '),
                        TextSpan(
                          text: account.name,
                          style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w700, color: text),
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
