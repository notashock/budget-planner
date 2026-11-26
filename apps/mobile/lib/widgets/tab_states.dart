import 'package:flutter/material.dart';

import '../providers/budget_view.dart';
import '../theme/app_palette.dart';
import 'load_error_banner.dart';

/// The states every data tab shares (upgrade plan 3.5, the error tiers of T7):
/// - first load, nothing to show yet: a skeleton, never an empty list that
///   would read as "no transactions";
/// - the load failed and there is nothing to show: the full-screen error with
///   Try again (tier c; a failure with data on screen is the banner, tier a);
/// - otherwise the tab, with pull-to-refresh.
class TabStates extends StatelessWidget {
  const TabStates({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final known = budget.activeMonth != null || budget.monthMissing;
    final error = budget.loadError;

    if (!known && error != null && !error.hasData) return LoadErrorView(error: error);
    if (!known && (budget.isLoading || error == null)) return const TabSkeleton();

    return RefreshIndicator(
      // The tabs nest their lists (and horizontal chip rows) inside other
      // widgets: listen to any vertical scrollable, not only the outermost.
      notificationPredicate: (n) => n.metrics.axis == Axis.vertical,
      onRefresh: budget.refresh,
      child: child,
    );
  }
}

/// Grey blocks in the shape of a tab while its first load runs.
class TabSkeleton extends StatelessWidget {
  const TabSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    Widget block(double height, {double? width}) => Container(
          height: height,
          width: width,
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(color: p.surfaceSubtle, borderRadius: BorderRadius.circular(12)),
        );
    return Semantics(
      label: 'Loading',
      liveRegion: true,
      child: ExcludeSemantics(
        child: ListView(
          key: const ValueKey('tab-skeleton'),
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          children: [
            block(132),
            block(220),
            Row(children: [Expanded(child: block(84)), const SizedBox(width: 12), Expanded(child: block(84))]),
            block(18, width: 140),
            for (var i = 0; i < 4; i++) block(56),
          ],
        ),
      ),
    );
  }
}

/// An empty state that fills the tab but can still be pulled to refresh.
class ScrollableEmpty extends StatelessWidget {
  const ScrollableEmpty({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Center(child: child),
          ),
        ),
      );
}
