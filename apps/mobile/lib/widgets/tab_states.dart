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
    // Another month is on its way: the old month's figures would read as the new one's.
    if (budget.isSwitchingMonth) return const TabSkeleton();

    return RefreshIndicator(
      // The tabs nest their lists (and horizontal chip rows) inside other
      // widgets: listen to any vertical scrollable, not only the outermost.
      notificationPredicate: (n) => n.metrics.axis == Axis.vertical,
      onRefresh: budget.refresh,
      child: child,
    );
  }
}

/// Fades its child in and out while something loads (web's .skeleton-pulse).
/// Holds still when the system asks for reduced motion.
class SkeletonPulse extends StatefulWidget {
  const SkeletonPulse({super.key, required this.child});
  final Widget child;

  @override
  State<SkeletonPulse> createState() => _SkeletonPulseState();
}

class _SkeletonPulseState extends State<SkeletonPulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.stop();
      _c.value = 1;
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      FadeTransition(opacity: Tween(begin: 0.45, end: 1.0).animate(_c), child: widget.child);
}

/// One grey placeholder block.
class SkeletonBlock extends StatelessWidget {
  const SkeletonBlock({super.key, required this.height, this.width, this.radius = 12, this.gap = 12});
  final double height;
  final double? width;
  final double radius;
  final double gap;

  @override
  Widget build(BuildContext context) => Container(
        height: height,
        width: width,
        margin: EdgeInsets.only(bottom: gap),
        decoration: BoxDecoration(color: context.palette.surfaceSubtle, borderRadius: BorderRadius.circular(radius)),
      );
}

/// Pulsing placeholder lines for a card or sheet that is still loading.
class SkeletonLines extends StatelessWidget {
  const SkeletonLines({super.key, this.lines = const [0.45, 1, 0.75], this.lineHeight = 14});
  final List<double> lines;
  final double lineHeight;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Loading',
        liveRegion: true,
        child: ExcludeSemantics(
          child: SkeletonPulse(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final w in lines)
                FractionallySizedBox(widthFactor: w, child: SkeletonBlock(height: lineHeight, radius: 6, gap: 8)),
            ]),
          ),
        ),
      );
}

/// Grey blocks in the shape of a tab while its first load runs, or another month loads.
class TabSkeleton extends StatelessWidget {
  const TabSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading',
      liveRegion: true,
      child: ExcludeSemantics(
        child: SkeletonPulse(
          child: ListView(
            key: const ValueKey('tab-skeleton'),
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            children: [
              const SkeletonBlock(height: 132),
              const SkeletonBlock(height: 220),
              Row(children: const [
                Expanded(child: SkeletonBlock(height: 84)),
                SizedBox(width: 12),
                Expanded(child: SkeletonBlock(height: 84)),
              ]),
              const SkeletonBlock(height: 18, width: 140),
              for (var i = 0; i < 4; i++) const SkeletonBlock(height: 56),
            ],
          ),
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
