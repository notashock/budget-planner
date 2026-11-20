import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_view.dart';
import '../providers/theme_provider.dart';
import '../providers/auth_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import 'server_settings_dialog.dart';
import 'app_lock_settings_sheet.dart';
import '../providers/app_lock_provider.dart';
import '../modals/month_modals.dart';
import '../modals/salary_safeline_modal.dart';

class HeaderWidget extends StatelessWidget {
  const HeaderWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final theme = context.watch<ThemeProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final months = budget.months;
    final int currentYear = budget.currentYear;
    final int currentMonth = budget.currentMonth;

    final monthsShort = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final currentMonthLabel =
        '${monthsShort[(currentMonth - 1).clamp(0, 11)]} $currentYear';

    final int floor = budget.monthInfo?.safetyFloor ?? 0;

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
      // Fits a 360 dp phone at 1.0x text (upgrade plan 3.2): the month and the
      // floor pill shrink and ellipsize; theme, app lock, server and sign-out
      // live in one 48 dp "More" menu instead of four 30 dp icons.
      child: Row(
        children: [
          // Month Selector Menu
          Flexible(
            child: PopupMenuButton<String>(
              key: const ValueKey('header-month'),
              tooltip: 'Choose month',
              color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: BorderSide(
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                ),
              ),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: isDark
                      ? AppColors.darkSurface
                      : AppColors.lightSurface,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: isDark
                        ? AppColors.darkBorder
                        : AppColors.lightBorder,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text(
                        currentMonthLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: isDark
                              ? AppColors.darkText
                              : AppColors.lightText,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      Icons.keyboard_arrow_down,
                      size: 16,
                      color: isDark
                          ? AppColors.darkTextMuted
                          : AppColors.lightTextMuted,
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
                    budget.switchMonth(
                      int.parse(parts[0]),
                      int.parse(parts[1]),
                    );
                  }
                }
              },
              itemBuilder: (context) {
                return [
                  ...months.map((m) {
                    final y = (num.tryParse('${m['year']}') ?? currentYear)
                        .toInt();
                    final mo = (num.tryParse('${m['month']}') ?? currentMonth)
                        .toInt();
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
                              fontWeight: isSelected
                                  ? FontWeight.bold
                                  : FontWeight.normal,
                              color: isDark
                                  ? AppColors.darkText
                                  : AppColors.lightText,
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
          ),
          const SizedBox(width: 8),

          // Salary & Floor Pill Button
          Flexible(
            child: InkWell(
              key: const ValueKey('header-floor'),
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
                  color: isDark
                      ? AppColors.darkSurface
                      : AppColors.lightSurface,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: isDark
                        ? AppColors.darkBorder
                        : AppColors.lightBorder,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
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
                    Flexible(
                      child: Text(
                        'Floor: ${formatCompactCurrency(floor)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          fontFamily: 'monospace',
                          color: isDark
                              ? AppColors.darkText
                              : AppColors.lightText,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const Spacer(),

          // Theme, app lock, server settings and sign-out
          PopupMenuButton<_HeaderAction>(
            key: const ValueKey('header-more'),
            tooltip: 'More',
            icon: Icon(
              Icons.more_vert,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.lightTextSecondary,
            ),
            onSelected: (action) {
              switch (action) {
                case _HeaderAction.theme:
                  theme.cycleTheme();
                case _HeaderAction.appLock:
                  AppLockSettingsSheet.show(context);
                case _HeaderAction.server:
                  showDialog(
                    context: context,
                    builder: (_) => const ServerSettingsDialog(),
                  );
                case _HeaderAction.signOut:
                  context.read<AuthProvider>().logout();
              }
            },
            itemBuilder: (context) {
              final lockOn = context.read<AppLockProvider>().isEnabled;
              final (themeIcon, themeLabel) = switch (theme.themeMode) {
                ThemeMode.light => (Icons.light_mode_outlined, 'Theme: Light'),
                ThemeMode.dark => (Icons.dark_mode_outlined, 'Theme: Dark'),
                ThemeMode.system => (
                  Icons.brightness_auto_outlined,
                  'Theme: System',
                ),
              };
              PopupMenuItem<_HeaderAction> item(
                _HeaderAction value,
                IconData icon,
                String label,
              ) => PopupMenuItem(
                value: value,
                key: ValueKey('header-${value.name}'),
                child: Row(
                  children: [
                    Icon(icon, size: 20),
                    const SizedBox(width: 12),
                    Text(label),
                  ],
                ),
              );
              return [
                item(_HeaderAction.theme, themeIcon, themeLabel),
                item(
                  _HeaderAction.appLock,
                  lockOn ? Icons.lock : Icons.lock_open_outlined,
                  lockOn ? 'App lock: On' : 'App lock: Off',
                ),
                item(
                  _HeaderAction.server,
                  Icons.settings_ethernet,
                  'Server settings',
                ),
                const PopupMenuDivider(),
                item(_HeaderAction.signOut, Icons.logout, 'Sign out'),
              ];
            },
          ),
        ],
      ),
    );
  }
}

enum _HeaderAction { theme, appLock, server, signOut }
