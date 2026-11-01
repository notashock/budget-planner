import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../modals/unified_entry_modal.dart';

class GoalsScreen extends StatelessWidget {
  const GoalsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final goals = budget.evaluatedGoals;

    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    return Scaffold(
      body: goals.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.track_changes_rounded, size: 28, color: textMuted),
                  const SizedBox(height: 8),
                  Text(
                    'No purchase goals',
                    style: AppTypography.inter(fontSize: 13, color: textMuted),
                  ),
                ],
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              itemCount: goals.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final g = goals[index];
                final id = (g['_id'] ?? g['id']).toString();
                final name = g['name']?.toString() ?? 'Purchase Goal';
                final amount = num.tryParse('${g['targetAmount']}') ?? 0;
                final priority = (num.tryParse('${g['priority']}') ?? 1).toInt();
                final status = g['status']?.toString() ?? 'active';

                final rec = g['recommendation'] is Map ? g['recommendation'] as Map : null;
                final bool feasible = rec?['feasible'] == true;
                final String? recDate = rec?['recommendedDate']?.toString();
                final int? recDay = rec?['recommendedDay'] as int?;

                Color prioColor = textMuted;
                String prioLabel = 'Medium';
                if (priority == 0) {
                  prioColor = AppColors.red;
                  prioLabel = 'High';
                } else if (priority == 2) {
                  prioColor = Colors.blue;
                  prioLabel = 'Low';
                }

                return Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: feasible ? AppColors.green.withAlpha(70) : border,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header: Name & Priority Pill
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              name,
                              style: AppTypography.inter(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w700,
                                color: text,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: prioColor.withAlpha(20),
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: prioColor.withAlpha(70), width: 0.8),
                            ),
                            child: Text(
                              prioLabel,
                              style: AppTypography.inter(fontSize: 10, fontWeight: FontWeight.w700, color: prioColor),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),

                      // Cost
                      Text(
                        formatCurrency(amount),
                        style: AppTypography.mono(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: text,
                        ),
                      ),
                      const SizedBox(height: 10),

                      // Recommendation Badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: feasible
                              ? AppColors.green.withAlpha(18)
                              : (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: feasible ? AppColors.green.withAlpha(60) : border,
                            width: 0.8,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              feasible ? Icons.auto_awesome : Icons.info_outline,
                              size: 15,
                              color: feasible ? AppColors.green : textMuted,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                feasible && recDay != null
                                    ? 'Safe purchase date: Day $recDay ($recDate)'
                                    : (rec?['explanation'] ?? 'Floor breach risk this month. Deferral recommended.'),
                                style: AppTypography.inter(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w500,
                                  color: feasible ? AppColors.green : textSecondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),

                      // Actions Row: Convert, Defer, Delete
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          if (feasible && status != 'scheduled')
                            TextButton.icon(
                              icon: const Icon(Icons.calendar_today, size: 14),
                              label: Text('Schedule Transaction', style: AppTypography.inter(fontSize: 11.5, fontWeight: FontWeight.w600)),
                              onPressed: () => budget.convertGoalToTransaction(id),
                            ),
                          TextButton(
                            child: Text(
                              status == 'deferred' ? 'Reactivate' : 'Defer',
                              style: AppTypography.inter(fontSize: 11.5, fontWeight: FontWeight.w600),
                            ),
                            onPressed: () {
                              if (status == 'deferred') {
                                budget.reactivateGoal(id);
                              } else {
                                budget.deferGoal(id);
                              }
                            },
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline, size: 16),
                            color: textMuted,
                            onPressed: () => budget.deleteGoal(id),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: isDark ? Colors.white : Colors.black,
        foregroundColor: isDark ? Colors.black : Colors.white,
        child: const Icon(Icons.add),
        onPressed: () {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => const UnifiedEntryModal(initialType: EntryType.goal),
          );
        },
      ),
    );
  }
}
