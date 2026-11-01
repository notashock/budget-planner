import 'package:flutter/material.dart';
import '../engine/currency.dart';
import '../engine/simulator.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Rebuild of SafeVelocityCard matching apps/web/src/components/SummaryCards.jsx
class SafeVelocityCard extends StatelessWidget {
  final SafeVelocity safeVelocity;
  final String currencySymbol;

  const SafeVelocityCard({
    super.key,
    required this.safeVelocity,
    this.currencySymbol = '₹',
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    Color badgeColor;
    Color badgeBg;
    String badgeLabel;

    switch (safeVelocity.status.toLowerCase()) {
      case 'critical':
      case 'breached':
        badgeColor = AppColors.red;
        badgeBg = isDark ? const Color(0x33EF4444) : const Color(0x1AEF4444);
        badgeLabel = 'critical';
        break;
      case 'tight':
        badgeColor = AppColors.amber;
        badgeBg = isDark ? const Color(0x33F59E0B) : const Color(0x1AF59E0B);
        badgeLabel = 'tight';
        break;
      default:
        badgeColor = AppColors.green;
        badgeBg = isDark ? const Color(0x3310B981) : const Color(0x1A10B981);
        badgeLabel = 'healthy';
        break;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top Row: Label + Status Badge + Days Left Pill
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(
                    'Dynamic Safe Velocity',
                    style: AppTypography.inter(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: textSecondary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: badgeBg,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: badgeColor.withAlpha(80), width: 1),
                    ),
                    child: Text(
                      badgeLabel,
                      style: AppTypography.inter(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: badgeColor,
                      ),
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: border, width: 1),
                ),
                child: Text(
                  '${safeVelocity.remainingDays} days left',
                  style: AppTypography.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: textSecondary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Hero Row: Large Tabular Amount + / day suffix
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                formatCurrency(safeVelocity.safeDailyAmount, symbol: currencySymbol),
                style: AppTypography.hero(color: text),
              ),
              const SizedBox(width: 6),
              Text(
                '/ day',
                style: AppTypography.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: textMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Divider
          Divider(color: border, height: 1, thickness: 1),
          const SizedBox(height: 10),

          // Footer Row: Committed bills + Burn pace
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              RichText(
                text: TextSpan(
                  style: AppTypography.inter(fontSize: 11.5, color: textMuted),
                  children: [
                    const TextSpan(text: 'Committed bills: '),
                    TextSpan(
                      text: formatCurrency(safeVelocity.committedUpcomingItems, symbol: currencySymbol),
                      style: AppTypography.mono(fontSize: 11.5, fontWeight: FontWeight.w700, color: text),
                    ),
                  ],
                ),
              ),
              RichText(
                text: TextSpan(
                  style: AppTypography.inter(fontSize: 11.5, color: textMuted),
                  children: [
                    const TextSpan(text: 'Burn pace: '),
                    TextSpan(
                      text: '${formatCurrency(safeVelocity.burnRatePerDay, symbol: currencySymbol)}/day',
                      style: AppTypography.mono(fontSize: 11.5, fontWeight: FontWeight.w700, color: text),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Rebuild of DetailedKpiGrid (2x2 Bento grid) matching apps/web/src/components/SummaryCards.jsx
class DetailedKpiGrid extends StatelessWidget {
  final int incomeAmount;
  final int incomeCreditDay;
  final bool isSalaryCredited;
  final String? salaryCreditedDate;
  final int totalExpenses;
  final int expenseOccurrencesCount;
  final int todayBalance;
  final int endingBalance;
  final int lowestBalance;
  final String lowestDate;
  final int safetyFloor;
  final String currencySymbol;

  const DetailedKpiGrid({
    super.key,
    required this.incomeAmount,
    required this.incomeCreditDay,
    this.isSalaryCredited = false,
    this.salaryCreditedDate,
    required this.totalExpenses,
    required this.expenseOccurrencesCount,
    required this.todayBalance,
    required this.endingBalance,
    required this.lowestBalance,
    required this.lowestDate,
    required this.safetyFloor,
    this.currencySymbol = '₹',
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isBreached = lowestBalance < safetyFloor;

    return Column(
      children: [
        // Row 1: Income and Expenses
        Row(
          children: [
            Expanded(
              child: _buildKpiCard(
                context,
                title: 'Monthly income',
                badgeText: isSalaryCredited ? 'Credited' : null,
                badgeIcon: isSalaryCredited ? Icons.check_circle_rounded : null,
                badgeColor: AppColors.green,
                amount: formatCurrency(incomeAmount, symbol: currencySymbol),
                subtext: isSalaryCredited && salaryCreditedDate != null
                    ? 'Credited on ${formatDisplayDate(salaryCreditedDate, includeWeekday: false)}'
                    : 'Credited on day $incomeCreditDay',
                isDark: isDark,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _buildKpiCard(
                context,
                title: 'Total expenses',
                amount: formatCurrency(totalExpenses, symbol: currencySymbol),
                subtext: 'Across $expenseOccurrencesCount occurrences',
                isDark: isDark,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),

        // Row 2: Today's balance and Lowest balance
        Row(
          children: [
            Expanded(
              child: _buildKpiCard(
                context,
                title: "Today's balance",
                amount: formatCurrency(todayBalance, symbol: currencySymbol),
                subtext: 'Month-end: ${formatCurrency(endingBalance, symbol: currencySymbol)}',
                isDark: isDark,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _buildKpiCard(
                context,
                title: 'Lowest balance',
                badgeText: isBreached ? 'Breach' : null,
                badgeIcon: isBreached ? Icons.warning_amber_rounded : null,
                badgeColor: AppColors.red,
                amount: formatCurrency(lowestBalance, symbol: currencySymbol),
                amountColor: isBreached ? AppColors.red : null,
                subtext: lowestDate.isNotEmpty ? 'On ${formatDisplayDate(lowestDate, includeWeekday: true)}' : 'N/A',
                isDark: isDark,
                isBreached: isBreached,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildKpiCard(
    BuildContext context, {
    required String title,
    String? badgeText,
    IconData? badgeIcon,
    Color? badgeColor,
    required String amount,
    Color? amountColor,
    required String subtext,
    required bool isDark,
    bool isBreached = false,
  }) {
    final bg = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isBreached
        ? AppColors.red.withAlpha(120)
        : (isDark ? AppColors.darkBorder : AppColors.lightBorder);
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: border, width: isBreached ? 1.5 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: AppTypography.inter(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w500,
                  color: textMuted,
                ),
              ),
              if (badgeText != null && badgeColor != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                  decoration: BoxDecoration(
                    color: badgeColor.withAlpha(25),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: badgeColor.withAlpha(80), width: 1),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (badgeIcon != null) ...[
                        Icon(badgeIcon, size: 9, color: badgeColor),
                        const SizedBox(width: 3),
                      ],
                      Text(
                        badgeText,
                        style: AppTypography.inter(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w700,
                          color: badgeColor,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            amount,
            style: AppTypography.mono(
              fontSize: 15.5,
              fontWeight: FontWeight.w700,
              color: amountColor ?? text,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            subtext,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.inter(
              fontSize: 10.5,
              fontWeight: FontWeight.w400,
              color: textMuted,
            ),
          ),
        ],
      ),
    );
  }
}
