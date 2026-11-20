import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../models/goal.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../modals/unified_entry_modal.dart';
import '../widgets/confirm_dialog.dart';

class GoalsScreen extends StatelessWidget {
  const GoalsScreen({super.key});

  /// Runs a goal action and reports a failure instead of dropping it.
  static Future<void> _run(BuildContext context, Future<void> Function() action) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Only the goals: other provider changes do not rebuild this screen.
    final goals = context.select<BudgetProvider, List<Goal>>((b) => b.goalModels);
    final isDark = Theme.of(context).brightness == Brightness.dark;

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
                final budget = context.read<BudgetProvider>();
                final name = g.name.isEmpty ? 'Purchase Goal' : g.name;
                final rec = g.recommendation;
                final feasible = rec?.feasible ?? false;

                final prioColor = switch (g.priority) {
                  GoalPriority.high => context.palette.badInk,
                  GoalPriority.low => Colors.blue,
                  GoalPriority.medium => textMuted,
                };

                // Not evaluated is not the same as not affordable: say which.
                final String advice;
                if (g.isDeferred) {
                  advice = 'Deferred. Reactivate it to get a safe purchase date.';
                } else if (g.status == GoalStatus.scheduled) {
                  advice = rec?.recommendedDate != null
                      ? 'Scheduled for ${rec!.recommendedDate}.'
                      : 'Scheduled as a planned transaction.';
                } else if (rec == null) {
                  advice = 'No safe purchase date checked yet.';
                } else if (feasible && rec.recommendedDay != null) {
                  advice = 'Safe purchase date: Day ${rec.recommendedDay} (${rec.recommendedDate})';
                } else {
                  advice = rec.explanation ?? 'No safe day this month without going below your floor.';
                }

                return Container(
                  key: ValueKey('goal-${g.id}'),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: feasible ? context.palette.good.withAlpha(70) : border,
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
                              g.priority.label,
                              style: AppTypography.inter(fontSize: 10, fontWeight: FontWeight.w700, color: prioColor),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),

                      // Cost
                      Text(
                        formatCurrency(g.targetAmount),
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
                              ? context.palette.good.withAlpha(18)
                              : (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: feasible ? context.palette.good.withAlpha(60) : border,
                            width: 0.8,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              feasible ? Icons.auto_awesome : Icons.info_outline,
                              size: 15,
                              color: feasible ? context.palette.goodInk : textMuted,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                advice,
                                style: AppTypography.inter(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w500,
                                  color: feasible ? context.palette.goodInk : textSecondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),

                      // Actions Row: Schedule, Defer / Reactivate, Edit, Delete
                      Wrap(
                        alignment: WrapAlignment.end,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (g.canSchedule)
                            TextButton.icon(
                              icon: const Icon(Icons.calendar_today, size: 14),
                              label: Text('Schedule Transaction', style: AppTypography.inter(fontSize: 11.5, fontWeight: FontWeight.w600)),
                              onPressed: () => _run(context, () => budget.convertGoalToTransaction(g.id)),
                            ),
                          if (!g.isClosed)
                            TextButton(
                              key: ValueKey('goal-defer-${g.id}'),
                              child: Text(
                                g.isDeferred ? 'Reactivate' : 'Defer',
                                style: AppTypography.inter(fontSize: 11.5, fontWeight: FontWeight.w600),
                              ),
                              onPressed: () => _run(
                                context,
                                () => g.isDeferred ? budget.reactivateGoal(g.id) : budget.deferGoal(g.id),
                              ),
                            ),
                          IconButton(
                            key: ValueKey('edit-goal-${g.id}'),
                            tooltip: 'Edit goal',
                            icon: const Icon(Icons.edit_outlined, size: 16),
                            color: textMuted,
                            onPressed: () => showModalBottomSheet(
                              context: context,
                              isScrollControlled: true,
                              backgroundColor: Colors.transparent,
                              builder: (_) => UnifiedEntryModal(
                                initialType: EntryType.goal,
                                initialGoal: g,
                              ),
                            ),
                          ),
                          IconButton(
                            key: ValueKey('delete-goal-${g.id}'),
                            tooltip: 'Delete goal',
                            icon: const Icon(Icons.delete_outline, size: 16),
                            color: textMuted,
                            onPressed: () async {
                              final ok = await confirmDestructive(
                                context,
                                title: 'Delete "$name"?',
                                // The server keeps a scheduled goal's planned transaction (goal_id is set null).
                                message: g.status == GoalStatus.scheduled
                                    ? 'Its planned transaction stays in your plan. Cancel it from Transactions if you no longer need it.'
                                    : "This can't be undone.",
                              );
                              if (ok && context.mounted) await _run(context, () => budget.deleteGoal(g.id));
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
      floatingActionButton: FloatingActionButton(
        tooltip: 'Add goal',
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Theme.of(context).colorScheme.onPrimary,
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
