import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../models/goal.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../modals/unified_entry_modal.dart';
import '../widgets/acct_inset.dart';
import '../widgets/confirm_dialog.dart';
import '../widgets/min_tap.dart';
import '../widgets/web_icons.dart';

/// Web's GoalsScreen groups, in its order.
enum GoalKind { ready, saving, scheduled, later, past }

GoalKind goalKind(Goal g) {
  if (g.isClosed) return GoalKind.past;
  if (g.status == GoalStatus.scheduled) return GoalKind.scheduled;
  if (g.isDeferred) return GoalKind.later;
  final rec = g.recommendation;
  return rec != null && rec.feasible && rec.recommendedDate != null ? GoalKind.ready : GoalKind.saving;
}

String _money(int minor) => formatCurrency(minor);

String goalCaption(Goal g) {
  final rec = g.recommendation;
  return switch (goalKind(g)) {
    GoalKind.ready => 'Safe from ${formatDisplayDate(rec!.recommendedDate!)}',
    // Not evaluated is not the same as not affordable: say which.
    GoalKind.saving => rec == null
        ? 'No safe purchase date checked yet'
        : rec.projectedFloorDeficit != null
            ? '${_money(rec.projectedFloorDeficit!.abs())} short this month'
            : "Doesn't fit this month",
    GoalKind.scheduled => 'In this month’s plan',
    GoalKind.later => 'Deferred to next month',
    GoalKind.past => g.status == GoalStatus.dropped ? 'Dropped' : 'Bought',
  };
}

/// Shown by the header's ⋯ menu ("Past goals").
final goalsShowPast = ValueNotifier<bool>(false);

Future<void> _sheet(BuildContext context, Widget child) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => child,
    );

void _newGoal(BuildContext context) => _sheet(context, const UnifiedEntryModal(initialType: EntryType.goal));

/// Runs a goal action and reports a failure instead of dropping it.
Future<void> _run(BuildContext context, Future<void> Function() action) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    await action();
  } catch (e) {
    messenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
  }
}

/// The Goals header: ＋ (new goal) and, once there are past goals, ⋯ to show them.
class GoalsHeaderActions extends StatelessWidget {
  const GoalsHeaderActions({super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final hasPast = context.select<BudgetProvider, bool>((b) => b.goalModels.any((g) => g.isClosed));
    return Row(mainAxisSize: MainAxisSize.min, children: [
      MinTap(
        child: Tooltip(
          message: 'New goal',
          child: InkWell(
            key: const ValueKey('goals-add'),
            borderRadius: BorderRadius.circular(17),
            onTap: () => _newGoal(context),
            child: Container(
              width: 32,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: p.indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(17)),
              child: WebIcon(WebIcons.plus, size: 16, color: p.indigo, semanticLabel: 'New goal'),
            ),
          ),
        ),
      ),
      if (hasPast)
        ValueListenableBuilder<bool>(
          valueListenable: goalsShowPast,
          builder: (context, showPast, _) => PopupMenuButton<VoidCallback>(
            key: const ValueKey('goals-options'),
            tooltip: 'Goal options',
            onSelected: (apply) => apply(),
            itemBuilder: (_) => [
              PopupMenuItem(
                value: () => goalsShowPast.value = !showPast,
                child: Text(showPast ? 'Hide past goals' : 'Past goals'),
              ),
            ],
            child: const MinTap(child: AcctDots()),
          ),
        ),
    ]);
  }
}

/// Web's GoalsScreen: a "Ready to buy" shelf (fits this month without dropping
/// below the minimum), then Saving, Scheduled and Later lists. A goal opens its
/// own page with its one action.
class GoalsScreen extends StatelessWidget {
  const GoalsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Only the goals: other provider changes do not rebuild this screen.
    final goals = context.select<BudgetProvider, List<Goal>>((b) => b.goalModels);
    return ValueListenableBuilder<bool>(
      valueListenable: goalsShowPast,
      builder: (context, showPast, _) {
        final groups = {for (final k in GoalKind.values) k: <Goal>[]};
        for (final g in goals) {
          groups[goalKind(g)]!.add(g);
        }
        final hasCurrent = goals.length > groups[GoalKind.past]!.length;

        Widget list(String title, GoalKind kind) {
          final l = groups[kind]!;
          if (l.isEmpty) return const SizedBox.shrink();
          return AcctSection(
            title: title,
            child: AcctInset(children: [
              for (final g in l)
                AcctRow(
                  key: ValueKey('goal-${g.id}'),
                  title: g.name.isEmpty ? 'Purchase Goal' : g.name,
                  caption: goalCaption(g),
                  amount: _money(g.targetAmount),
                  onTap: () => GoalPage.open(context, g.id),
                ),
            ]),
          );
        }

        return Scaffold(
          body: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(14, 4, 14, MediaQuery.paddingOf(context).bottom + 16), // clears the dock
            children: [
              if (groups[GoalKind.ready]!.isNotEmpty)
                AcctSection(title: 'Ready to buy', child: _Shelf(groups[GoalKind.ready]!)),
              list('Saving', GoalKind.saving),
              list('Scheduled', GoalKind.scheduled),
              list('Later', GoalKind.later),
              if (showPast) list('Past goals', GoalKind.past),
              if (!hasCurrent && !(showPast && groups[GoalKind.past]!.isNotEmpty))
                AcctEmpty(label: 'Add something you want to buy', onAdd: () => _newGoal(context)),
            ],
          ),
        );
      },
    );
  }
}

/// Web's .goal-shelf: cards about half the width, scrolling sideways.
class _Shelf extends StatelessWidget {
  const _Shelf(this.goals);
  final List<Goal> goals;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final w = (MediaQuery.sizeOf(context).width - 28) * 0.46;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final (i, g) in goals.indexed) ...[
          if (i > 0) const SizedBox(width: 10),
          SizedBox(
            width: w < 150 ? 150 : w,
            child: Material(
              color: p.surface,
              borderRadius: BorderRadius.circular(14),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                key: ValueKey('goal-${g.id}'),
                onTap: () => GoalPage.open(context, g.id),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(g.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w500, color: p.text)),
                    const SizedBox(height: 4),
                    Text(_money(g.targetAmount),
                        style: AppTypography.inter(fontSize: 20, fontWeight: FontWeight.w700, color: p.text)),
                    const SizedBox(height: 4),
                    Text(goalCaption(g), style: AppTypography.inter(fontSize: 12, color: p.good)),
                  ]),
                ),
              ),
            ),
          ),
        ],
      ]),
    );
  }
}

/// A goal's own page (web's renderGoalPage): price, verdict, details, one action.
class GoalPage extends StatefulWidget {
  const GoalPage({super.key, required this.goalId});
  final String goalId;

  static Future<void> open(BuildContext context, String id) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => GoalPage(goalId: id)));

  @override
  State<GoalPage> createState() => _GoalPageState();
}

class _GoalPageState extends State<GoalPage> {
  bool _busy = false;

  Future<void> _act(Future<void> Function() fn) async {
    if (_busy) return;
    setState(() => _busy = true);
    await _run(context, fn);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final budget = context.watch<BudgetProvider>();
    final g = budget.goalModels.where((x) => x.id == widget.goalId).firstOrNull;
    if (g == null) return const Scaffold(body: SizedBox.shrink());
    final name = g.name.isEmpty ? 'Purchase Goal' : g.name;
    final kind = goalKind(g);
    final rec = g.recommendation;

    final (String label, Future<void> Function() fn)? action = switch (kind) {
      GoalKind.ready => (_busy ? 'Scheduling…' : 'Schedule', () => budget.convertGoalToTransaction(g.id)),
      GoalKind.saving => (_busy ? 'Deferring…' : 'Defer to next month', () => budget.deferGoal(g.id)),
      GoalKind.later => (_busy ? 'Reactivating…' : 'Reactivate', () => budget.reactivateGoal(g.id)),
      _ => null,
    };

    final bold = AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w700, color: p.text);
    final (WebIconData icon, Color iconColor, List<InlineSpan> verdict) = switch (kind) {
      GoalKind.ready => (WebIcons.calendar, p.good, [
          const TextSpan(text: 'Fits this month. Safe to buy from '),
          TextSpan(text: formatDisplayDate(rec!.recommendedDate!), style: bold),
          if (rec.savingsBuffer != null && rec.savingsBuffer! > 0) ...[
            const TextSpan(text: ', keeping '),
            TextSpan(text: _money(rec.savingsBuffer!), style: bold),
            const TextSpan(text: ' spare'),
          ],
          const TextSpan(text: '.'),
        ]),
      GoalKind.saving => (WebIcons.alertTriangle, p.bad, [
          if (rec == null)
            const TextSpan(text: 'No safe purchase date checked yet.')
          else ...[
            const TextSpan(text: 'Doesn’t fit this month'),
            if (rec.projectedFloorDeficit != null) ...[
              const TextSpan(text: ': it would take you '),
              TextSpan(text: _money(rec.projectedFloorDeficit!.abs()), style: bold),
              TextSpan(
                  text: ' below your minimum'
                      '${rec.lowestDate != null ? ' on ${formatDisplayDate(rec.lowestDate!)}' : ''}'),
            ],
            const TextSpan(text: '.'),
          ],
        ]),
      GoalKind.scheduled => (WebIcons.checkCircle, p.good, [const TextSpan(text: 'Scheduled in this month’s plan.')]),
      GoalKind.later => (WebIcons.alertTriangle, p.textMuted, [const TextSpan(text: 'Deferred to next month.')]),
      GoalKind.past => (WebIcons.checkCircle, p.textMuted, [TextSpan(text: '${goalCaption(g)}.')]),
    };

    Future<void> delete() async {
      final ok = await confirmDestructive(
        context,
        title: 'Delete "$name"?',
        // The server keeps a scheduled goal's planned transaction (goal_id is set null).
        message: g.status == GoalStatus.scheduled
            ? 'Its planned transaction stays in your plan. Cancel it from Transactions if you no longer need it.'
            : "This can't be undone.",
      );
      if (!ok || !context.mounted) return;
      Navigator.of(context).pop();
      await _run(context, () => budget.deleteGoal(g.id));
    }

    Widget kv(String k, String v) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(children: [
            Expanded(child: Text(k, style: AppTypography.inter(fontSize: 14, color: p.text))),
            const SizedBox(width: 12),
            Flexible(child: Text(v, textAlign: TextAlign.end, style: AppTypography.inter(fontSize: 14, color: p.text))),
          ]),
        );

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
          children: [
            Row(children: [
              TextButton(
                key: const ValueKey('goal-back'),
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(foregroundColor: p.indigo, padding: const EdgeInsets.symmetric(horizontal: 4), minimumSize: const Size(48, 48)),
                child: Text('‹ Goals', style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w500, color: p.indigo)),
              ),
            ]),
            Row(children: [
              Expanded(
                child: Text(name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.inter(fontSize: 28, fontWeight: FontWeight.w700, color: p.text)),
              ),
              PopupMenuButton<VoidCallback>(
                key: ValueKey('goal-menu-${g.id}'),
                tooltip: 'More actions for $name',
                onSelected: (apply) => apply(),
                itemBuilder: (_) => [
                  PopupMenuItem(
                    key: ValueKey('edit-goal-${g.id}'),
                    value: () => _sheet(context, UnifiedEntryModal(initialType: EntryType.goal, initialGoal: g)),
                    child: const Text('Edit goal'),
                  ),
                  PopupMenuItem(
                    key: ValueKey('delete-goal-${g.id}'),
                    value: delete,
                    child: Text('Delete', style: TextStyle(color: p.bad)),
                  ),
                ],
                child: const MinTap(child: AcctDots()),
              ),
            ]),
            // Hero: the price and its priority
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 4, 0, 20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_money(g.targetAmount),
                    style: AppTypography.inter(fontSize: 36, fontWeight: FontWeight.w700, height: 1.1, color: p.text)),
                const SizedBox(height: 4),
                Text('${g.priority.label} priority', style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
              ]),
            ),
            Container(
              key: const ValueKey('goal-verdict'),
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(color: p.surface, borderRadius: BorderRadius.circular(14)),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Padding(padding: const EdgeInsets.only(top: 2), child: WebIcon(icon, size: 14, color: iconColor)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text.rich(TextSpan(children: verdict),
                      style: AppTypography.inter(fontSize: 14, color: p.text)),
                ),
              ]),
            ),
            AcctInset(children: [
              kv('Pay from', budget.accountName(g.fundingAccountId) ?? 'Primary account'),
              if (g.targetDate != null) kv('Wanted by', formatDisplayDate(g.targetDate!)),
            ]),
            if (action != null) ...[
              const SizedBox(height: 16),
              ElevatedButton(
                key: ValueKey('goal-action-${g.id}'),
                onPressed: _busy ? null : () => _act(action.$2),
                style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                child: Text(action.$1),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
