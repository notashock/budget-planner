import 'package:flutter/material.dart';
import '../engine/currency.dart';
import '../engine/simulator.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

void showMonthReviewModal(
  BuildContext context, {
  required Map<String, dynamic> month,
  required SimulationResult simulation,
  required int safetyFloor,
  String currencySymbol = '₹',
}) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  final bg = isDark ? const Color(0xFF101013) : Colors.white;
  final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
  final text = isDark ? AppColors.darkText : AppColors.lightText;
  final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
  final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

  final totalOutflow = simulation.totalPlannedExpenses + simulation.totalActualExpenses;
  final netCashflow = simulation.totalIncome - totalOutflow;
  final isBreached = simulation.lowestBalance < safetyFloor;

  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: bg,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      return DraggableScrollableSheet(
        initialChildSize: 0.75,
        maxChildSize: 0.92,
        minChildSize: 0.5,
        expand: false,
        builder: (_, scrollController) {
          return SingleChildScrollView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'MONTH REVIEW',
                          style: AppTypography.inter(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                            color: textSecondary,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${month['month'] ?? 1}/${month['year'] ?? 2026} Performance',
                          style: AppTypography.cardTitle(color: text),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: Icon(Icons.close, size: 20, color: textMuted),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Divider(color: border, height: 1),
                const SizedBox(height: 16),

                // Key Performance Indicators Grid
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: border),
                  ),
                  child: Column(
                    children: [
                      _buildReviewRow('Opening Balance', formatCurrency(simulation.openingBalance, symbol: currencySymbol), text, textMuted),
                      const SizedBox(height: 8),
                      _buildReviewRow('Total Income', '+${formatCurrency(simulation.totalIncome, symbol: currencySymbol)}', AppColors.green, textMuted),
                      const SizedBox(height: 8),
                      _buildReviewRow('Total Outflow', '-${formatCurrency(totalOutflow, symbol: currencySymbol)}', AppColors.red, textMuted),
                      const SizedBox(height: 8),
                      Divider(color: border, height: 1),
                      const SizedBox(height: 8),
                      _buildReviewRow(
                        'Net Trajectory',
                        '${netCashflow >= 0 ? '+' : ''}${formatCurrency(netCashflow, symbol: currencySymbol)}',
                        netCashflow >= 0 ? AppColors.green : AppColors.red,
                        text,
                        isBold: true,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Floor & Safety Analysis
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: isBreached ? AppColors.red.withAlpha(120) : border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'SAFETY FLOOR ANALYSIS',
                            style: AppTypography.inter(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                              color: textSecondary,
                            ),
                          ),
                          if (isBreached)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.red.withAlpha(25),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: AppColors.red.withAlpha(80)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.warning_amber_rounded, size: 10, color: AppColors.red),
                                  const SizedBox(width: 3),
                                  Text(
                                    'BREACHED',
                                    style: AppTypography.inter(
                                      fontSize: 9.5,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.red,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      _buildReviewRow('Configured Safety Floor', formatCurrency(safetyFloor, symbol: currencySymbol), text, textMuted),
                      const SizedBox(height: 8),
                      _buildReviewRow(
                        'Lowest Balance',
                        formatCurrency(simulation.lowestBalance, symbol: currencySymbol),
                        isBreached ? AppColors.red : text,
                        textMuted,
                      ),
                      const SizedBox(height: 8),
                      _buildReviewRow(
                        'Lowest Point Day',
                        'Day ${simulation.lowestBalanceDay}',
                        text,
                        textMuted,
                      ),
                      const SizedBox(height: 8),
                      _buildReviewRow(
                        'Safe Velocity Pace',
                        '${formatCurrency(simulation.safeVelocity.safeDailyAmount, symbol: currencySymbol)} / day',
                        text,
                        textMuted,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Close Button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isDark ? Colors.white : Colors.black,
                      foregroundColor: isDark ? Colors.black : Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                    ),
                    child: Text(
                      'Done',
                      style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      );
    },
  );
}

Widget _buildReviewRow(
  String label,
  String value,
  Color valueColor,
  Color labelColor, {
  bool isBold = false,
}) {
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(
        label,
        style: AppTypography.inter(
          fontSize: 12,
          fontWeight: isBold ? FontWeight.w600 : FontWeight.w400,
          color: labelColor,
        ),
      ),
      Text(
        value,
        style: AppTypography.mono(
          fontSize: 12.5,
          fontWeight: isBold ? FontWeight.w700 : FontWeight.w600,
          color: valueColor,
        ),
      ),
    ],
  );
}
