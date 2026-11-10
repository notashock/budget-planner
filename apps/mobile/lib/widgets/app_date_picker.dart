import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Clean, high-polish Date Picker with quick shortcuts ("Today", "Yesterday")
/// and custom calendar picker styled with AppColors tokens.
class AppDatePickerField extends StatelessWidget {
  final String label;
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateSelected;
  final int? minYear;
  final int? maxYear;

  const AppDatePickerField({
    super.key,
    this.label = 'Date',
    required this.selectedDate,
    required this.onDateSelected,
    this.minYear,
    this.maxYear,
  });

  String _formatDisplayDate(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(d.year, d.month, d.day);
    final diffDays = target.difference(today).inDays;

    final weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final weekday = weekdays[d.weekday - 1];
    final month = months[d.month - 1];

    if (diffDays == 0) {
      return 'Today · $weekday, $month ${d.day}';
    } else if (diffDays == -1) {
      return 'Yesterday · $weekday, $month ${d.day}';
    } else if (diffDays == 1) {
      return 'Tomorrow · $weekday, $month ${d.day}';
    }
    return '$weekday, $month ${d.day}, ${d.year}';
  }

  Future<void> _showCalendarDialog(BuildContext context) async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final now = DateTime.now();
    final firstYear = minYear ?? (now.year - 2);
    final lastYear = maxYear ?? (now.year + 3);

    final picked = await showDatePicker(
      context: context,
      initialDate: selectedDate,
      firstDate: DateTime(firstYear, 1, 1),
      lastDate: DateTime(lastYear, 12, 31),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: isDark
                ? const ColorScheme.dark(
                    primary: AppColors.darkText,
                    onPrimary: AppColors.darkBg,
                    surface: AppColors.darkSurface,
                    onSurface: AppColors.darkText,
                  )
                : const ColorScheme.light(
                    primary: AppColors.lightText,
                    onPrimary: AppColors.lightBg,
                    surface: AppColors.lightSurface,
                    onSurface: AppColors.lightText,
                  ),
            datePickerTheme: DatePickerThemeData(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                ),
              ),
            ),

          ),
          child: child!,
        );
      },
    );

    if (picked != null) {
      onDateSelected(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final currentDate = DateTime(selectedDate.year, selectedDate.month, selectedDate.day);

    final isToday = currentDate == today;
    final isYesterday = currentDate == yesterday;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
              ),
            ),
            Row(
              children: [
                _buildQuickPill(
                  label: 'Today',
                  isSelected: isToday,
                  isDark: isDark,
                  onTap: () => onDateSelected(DateTime.now()),
                ),
                const SizedBox(width: 4),
                _buildQuickPill(
                  label: 'Yesterday',
                  isSelected: isYesterday,
                  isDark: isDark,
                  onTap: () => onDateSelected(DateTime.now().subtract(const Duration(days: 1))),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 6),
        InkWell(
          onTap: () => _showCalendarDialog(context),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.calendar_today_outlined,
                  size: 15,
                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _formatDisplayDate(selectedDate),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildQuickPill({
    required String label,
    required bool isSelected,
    required bool isDark,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(
          color: isSelected
              ? (isDark ? AppColors.darkText : AppColors.lightText)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(
            color: isSelected
                ? (isDark ? AppColors.darkText : AppColors.lightText)
                : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: isSelected
                ? (isDark ? AppColors.darkBg : AppColors.lightBg)
                : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
          ),
        ),
      ),
    );
  }
}
