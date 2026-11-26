import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../providers/budget_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';

/// Quiet strip shown above the tabs when the last load failed but earlier data
/// is still on screen: "Offline · showing data from 10:42" with a Retry.
/// When there is no data at all, screens show [LoadErrorView] instead.
class LoadErrorBanner extends StatelessWidget {
  const LoadErrorBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final error = context.select<BudgetProvider, BudgetLoadError?>((b) => b.loadError);
    final savedFrom = context.select<BudgetProvider, DateTime?>((b) => b.showingSavedDataFrom);

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    if (error == null || !error.hasData || error.isSessionExpired) {
      if (error != null || savedFrom == null) return const SizedBox.shrink();
      // Cold start from the device cache (upgrade plan 2.6), reload under way.
      return _strip(
        context,
        icon: const SizedBox.square(dimension: 14, child: CircularProgressIndicator(strokeWidth: 2)),
        label: 'Showing saved data from ${formatLoadedAt(savedFrom)} · updating',
        textColor: textColor,
      );
    }

    final since = error.lastLoadedAt == null ? '' : ' from ${formatLoadedAt(error.lastLoadedAt!)}';
    final label = error.isOffline
        ? 'Offline · showing data$since'
        : "Couldn't refresh · showing data$since";
    return _strip(
        context,
      icon: Icon(error.isOffline ? Icons.cloud_off_outlined : Icons.error_outline, size: 16, color: context.palette.warnInk),
      label: label,
      textColor: textColor,
      action: TextButton(
        onPressed: () => context.read<BudgetProvider>().refresh(),
        child: const Text('Retry'),
      ),
    );
  }

  Widget _strip(BuildContext context, {required Widget icon, required String label, required Color textColor, Widget? action}) {
    return Semantics(
      liveRegion: true,
      child: Material(
        color: context.palette.warnSubtle,
        child: Padding(
          padding: action == null ? const EdgeInsets.fromLTRB(14, 12, 14, 12) : const EdgeInsets.fromLTRB(14, 4, 4, 4),
          child: Row(
            children: [
              icon,
              const SizedBox(width: 8),
              Expanded(
                child: Text(label, style: AppTypography.inter(fontSize: 12, color: textColor)),
              ),
              ?action,
            ],
          ),
        ),
      ),
    );
  }
}

/// "10:42 AM" for today, "18 Nov, 10:42 AM" for an earlier day.
String formatLoadedAt(DateTime at, {DateTime? now}) {
  final today = now ?? DateTime.now();
  final sameDay = at.year == today.year && at.month == today.month && at.day == today.day;
  return sameDay ? DateFormat.jm().format(at) : DateFormat('d MMM,').add_jm().format(at);
}

/// Full-screen state when a load failed and there is nothing to show.
/// Never shown for a month that does not exist (that is [BudgetProvider.monthMissing]).
class LoadErrorView extends StatelessWidget {
  final BudgetLoadError error;
  const LoadErrorView({super.key, required this.error});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final muted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final title = error.isOffline ? "You're offline" : "Couldn't load this month";
    final detail = error.isOffline
        ? 'Check your connection, then try again.'
        : error.message;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(error.isOffline ? Icons.cloud_off_outlined : Icons.error_outline, size: 36, color: muted),
            const SizedBox(height: 12),
            Text(title, style: AppTypography.cardTitle(color: text), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(detail, style: AppTypography.inter(fontSize: 13, color: muted), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => context.read<BudgetProvider>().loadInitialData(),
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
