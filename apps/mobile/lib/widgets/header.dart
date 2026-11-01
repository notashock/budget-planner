import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../providers/theme_provider.dart';
import '../providers/auth_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import 'server_settings_dialog.dart';
import '../modals/month_modals.dart';
import '../modals/salary_safeline_modal.dart';

class HeaderWidget extends StatelessWidget {
  const HeaderWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final theme = context.watch<ThemeProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final months = budget.months;
    final int currentYear = budget.currentYear;
    final int currentMonth = budget.currentMonth;

    final monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final currentMonthLabel = '${monthsShort[(currentMonth - 1).clamp(0, 11)]} $currentYear';

    final int floor = (num.tryParse('${budget.activeMonth?['safetyFloor'] ?? 0}') ?? 0).round();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkBg : AppColors.lightBg,
        border: Border(
          bottom: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            width: 1,
          ),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Month Selector Menu
          PopupMenuButton<String>(
            color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
              side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
              ),
              child: Row(
                children: [
                  Text(
                    currentMonthLabel,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    Icons.keyboard_arrow_down,
                    size: 16,
                    color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted,
                  ),
                ],
              ),
            ),
            onSelected: (val) {
              if (val == '__new__') {
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => const CreateMonthModal(),
                );
              } else if (val == '__rollover__') {
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => const RolloverModal(),
                );
              } else {
                final parts = val.split('-');
                if (parts.length == 2) {
                  budget.switchMonth(int.parse(parts[0]), int.parse(parts[1]));
                }
              }
            },
            itemBuilder: (context) {
              return [
                ...months.map((m) {
                  final y = (num.tryParse('${m['year']}') ?? currentYear).toInt();
                  final mo = (num.tryParse('${m['month']}') ?? currentMonth).toInt();
                  final label = '${monthsShort[(mo - 1).clamp(0, 11)]} $y';
                  final isSelected = y == currentYear && mo == currentMonth;
                  return PopupMenuItem<String>(
                    value: '$y-$mo',
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          label,
                          style: TextStyle(
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            color: isDark ? AppColors.darkText : AppColors.lightText,
                          ),
                        ),
                        if (isSelected) const Icon(Icons.check, size: 14),
                      ],
                    ),
                  );
                }),
                const PopupMenuDivider(),
                const PopupMenuItem<String>(
                  value: '__new__',
                  child: Row(
                    children: [
                      Icon(Icons.add, size: 16),
                      SizedBox(width: 8),
                      Text('Create Month'),
                    ],
                  ),
                ),
                const PopupMenuItem<String>(
                  value: '__rollover__',
                  child: Row(
                    children: [
                      Icon(Icons.refresh, size: 16),
                      SizedBox(width: 8),
                      Text('Rollover Month'),
                    ],
                  ),
                ),
              ];
            },
          ),

          // Right Controls: Floor Pill, Theme Cycle, Server Settings, Logout
          Row(
            children: [
              // Salary & Floor Pill Button
              InkWell(
                onTap: () {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => const SalarySafelineModal(),
                  );
                },
                borderRadius: BorderRadius.circular(6),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: floor > 0 ? AppColors.green : AppColors.amber,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Floor: ${formatCompactCurrency(floor)}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          fontFamily: 'monospace',
                          color: isDark ? AppColors.darkText : AppColors.lightText,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),

              // Theme Toggle Button
              IconButton(
                iconSize: 18,
                padding: const EdgeInsets.all(6),
                constraints: const BoxConstraints(),
                icon: Icon(
                  theme.themeMode == ThemeMode.dark ? Icons.dark_mode_outlined : Icons.light_mode_outlined,
                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                ),
                onPressed: () => theme.cycleTheme(),
              ),

              // Server Settings (for physical mobile device testing)
              IconButton(
                iconSize: 18,
                padding: const EdgeInsets.all(6),
                constraints: const BoxConstraints(),
                icon: Icon(
                  Icons.settings_ethernet,
                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                ),
                onPressed: () {
                  showDialog(
                    context: context,
                    builder: (_) => const ServerSettingsDialog(),
                  );
                },
              ),

              // Logout Button
              IconButton(
                iconSize: 18,
                padding: const EdgeInsets.all(6),
                constraints: const BoxConstraints(),
                icon: Icon(
                  Icons.logout,
                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                ),
                onPressed: () => context.read<AuthProvider>().logout(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
