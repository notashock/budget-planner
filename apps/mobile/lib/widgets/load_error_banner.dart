import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../providers/budget_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Quiet strip shown above the tabs when the last load failed but earlier data
/// is still on screen: "Offline · showing data from 10:42" with a Retry.
/// When there is no data at all, screens show [LoadErrorView] instead.
class LoadErrorBanner extends StatelessWidget {
  const LoadErrorBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final error = context.select<BudgetProvider, BudgetLoadError?>((b) => b.loadError);
    if (error == null || !error.hasData || error.isSessionExpired) return const SizedBox.shrink();

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final since = error.lastLoadedAt == null ? '' : ' from ${DateFormat.jm().format(error.lastLoadedAt!)}';
    final label = error.isOffline
        ? 'Offline · showing data$since'
        : "Couldn't refresh · showing data$since";

    return Semantics(
      liveRegion: true,
      child: Material(
        color: AppColors.amberSubtle,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 4, 4, 4),
          child: Row(
            children: [
              Icon(error.isOffline ? Icons.cloud_off_outlined : Icons.error_outline, size: 16, color: AppColors.amber),
              const SizedBox(width: 8),
              Expanded(
                child: Text(label, style: AppTypography.inter(fontSize: 12, color: textColor)),
              ),
              TextButton(
                onPressed: () => context.read<BudgetProvider>().refresh(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
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
