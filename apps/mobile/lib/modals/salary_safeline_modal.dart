import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../engine/engine.dart';
import '../theme/app_form.dart';
import '../theme/app_colors.dart';
import '../theme/app_palette.dart';

class SalarySafelineModal extends StatefulWidget {
  const SalarySafelineModal({super.key});

  @override
  State<SalarySafelineModal> createState() => _SalarySafelineModalState();
}

class _SalarySafelineModalState extends State<SalarySafelineModal> {
  late TextEditingController _incomeCtrl;
  late TextEditingController _floorCtrl;
  late TextEditingController _creditDayCtrl;
  String? _selectedBankId;
  String? _salaryCreditedDateStr;
  bool _isSalaryCredited = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final budget = context.read<BudgetProvider>();
    final active = budget.monthInfo;

    final incomeMajor = toMajorUnits(active?.incomeAmount ?? 0);
    final floorMajor = toMajorUnits(active?.safetyFloor ?? 0);

    _incomeCtrl = TextEditingController(text: incomeMajor > 0 ? '$incomeMajor' : '');
    _floorCtrl = TextEditingController(text: floorMajor > 0 ? '$floorMajor' : '');
    _creditDayCtrl = TextEditingController(text: '${active?.incomeCreditDay ?? 1}');
    _selectedBankId = active?.salaryAccountId;

    _isSalaryCredited = active?.isSalaryCredited ?? false;
    final existingDate = active?.salaryCreditedDate ?? active?.incomeCreditDate;
    if (existingDate != null && existingDate.isNotEmpty) {
      _salaryCreditedDateStr = existingDate;
    } else {
      final now = DateTime.now();
      final year = active?.year ?? now.year;
      final month = active?.month ?? now.month;
      final day = (active?.incomeCreditDay ?? 1).clamp(1, 31);
      String pad(int n) => n.toString().padLeft(2, '0');
      _salaryCreditedDateStr = '$year-${pad(month)}-${pad(day)}';
    }
  }

  @override
  void dispose() {
    _incomeCtrl.dispose();
    _floorCtrl.dispose();
    _creditDayCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickSalaryDate() async {
    final now = DateTime.now();
    final budget = context.read<BudgetProvider>();
    final active = budget.monthInfo;
    final year = active?.year ?? now.year;
    final month = active?.month ?? now.month;

    DateTime initialDate = DateTime(year, month, int.tryParse(_creditDayCtrl.text) ?? 1);
    if (_salaryCreditedDateStr != null) {
      try {
        final parsed = DateTime.parse(_salaryCreditedDateStr!);
        initialDate = parsed;
      } catch (_) {}
    }

    final firstDate = DateTime(year - 1, 1, 1);
    final lastDate = DateTime(year + 1, 12, 31);
    if (initialDate.isBefore(firstDate)) initialDate = firstDate;
    if (initialDate.isAfter(lastDate)) initialDate = lastDate;

    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: firstDate,
      lastDate: lastDate,
    );

    if (picked != null) {
      setState(() {
        String pad(int n) => n.toString().padLeft(2, '0');
        _salaryCreditedDateStr = '${picked.year}-${pad(picked.month)}-${pad(picked.day)}';
        _creditDayCtrl.text = '${picked.day}';
        _isSalaryCredited = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final status = budget.salaryStatus;
    final banks = budget.bankAccountModels;
    final active = budget.monthInfo;

    final isAlreadyCredited = _isSalaryCredited || (active?.isSalaryCredited ?? false);
    final isModalLocked = status.isLocked || isAlreadyCredited;

    Color badgeColor;
    if (isAlreadyCredited) {
      badgeColor = context.palette.goodInk;
    } else if (status.status == 'in_window') {
      badgeColor = context.palette.goodInk;
    } else if (status.status == 'before_window') {
      badgeColor = context.palette.warnInk;
    } else {
      badgeColor = isDark ? Colors.grey[400]! : Colors.grey[600]!;
    }

    String bannerText = status.tooltip;
    if (isAlreadyCredited) {
      bannerText = 'Salary credited for this cycle. Settings locked until next cycle window.';
    }

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: AppForm.sheetPadding,
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Salary & Safety Floor',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Window Status Banner
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: badgeColor.withAlpha(25),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: badgeColor.withAlpha(100)),
                ),
                child: Row(
                  children: [
                    Icon(isModalLocked ? Icons.lock_outline : Icons.check_circle_outline, size: 18, color: badgeColor),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        bannerText,
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: badgeColor),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Fast "Credit Salary Now" Action if allowed
              if (!isModalLocked && !status.isUnconfigured)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.palette.goodInk,
                      side: BorderSide(color: context.palette.goodInk),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    icon: const Icon(Icons.account_balance_wallet, size: 18),
                    label: const Text('Credit Monthly Salary to Bank Account'),
                    onPressed: () async {
                      final navigator = Navigator.of(context);
                      await budget.creditSalary();
                      if (mounted) navigator.pop();
                    },
                  ),
                ),

              TextField(
                controller: _incomeCtrl,
                enabled: !isModalLocked,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Expected Monthly Salary ($moneySymbol)',
                  filled: isModalLocked,
                  fillColor: isModalLocked ? (isDark ? Colors.white10 : Colors.black12) : null,
                ),
              ),
              const SizedBox(height: 12),

              DropdownButtonFormField<String>(
                borderRadius: BorderRadius.circular(8), // web .app-dropdown-menu
                initialValue: _selectedBankId != null && banks.any((b) => b.id == _selectedBankId)
                    ? _selectedBankId
                    : (banks.isNotEmpty ? banks.first.id : null),
                decoration: InputDecoration(
                  labelText: 'Salary Bank Account',
                  filled: isModalLocked,
                  fillColor: isModalLocked ? (isDark ? Colors.white10 : Colors.black12) : null,
                ),
                items: banks.map<DropdownMenuItem<String>>((b) {
                  final id = b.id;
                  final name = b.name.isEmpty ? 'Account' : b.name;
                  return DropdownMenuItem<String>(value: id, child: Text(name));
                }).toList(),
                onChanged: isModalLocked ? null : (v) => setState(() => _selectedBankId = v),
              ),
              const SizedBox(height: 12),

              TextField(
                controller: _floorCtrl,
                enabled: !isModalLocked,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Safety Floor Threshold ($moneySymbol)',
                  filled: isModalLocked,
                  fillColor: isModalLocked ? (isDark ? Colors.white10 : Colors.black12) : null,
                ),
              ),
              const SizedBox(height: 14),

              // Salary Credit Date Picker Field
              InkWell(
                onTap: isModalLocked ? null : _pickSalaryDate,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    color: isModalLocked
                        ? (isDark ? Colors.white10 : Colors.black12)
                        : (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.calendar_month_outlined, size: 20, color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Date of Salary Credit',
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _salaryCreditedDateStr ?? 'Select Date',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                fontFamily: 'monospace',
                                color: isDark ? AppColors.darkText : AppColors.lightText,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (!isModalLocked)
                        TextButton(
                          onPressed: _pickSalaryDate,
                          child: const Text('Change'),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Salary already credited toggle
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isModalLocked
                      ? (isDark ? Colors.white10 : Colors.black12)
                      : (isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                ),
                child: CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _isSalaryCredited,
                  dense: true,
                  title: Text(
                    'Salary already credited for this month',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isDark ? AppColors.darkText : AppColors.lightText,
                    ),
                  ),
                  activeColor: context.palette.goodInk,
                  onChanged: isModalLocked
                      ? null
                      : (val) {
                          setState(() => _isSalaryCredited = val ?? false);
                        },
                ),
              ),
              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isModalLocked ? Colors.grey : (Theme.of(context).colorScheme.primary),
                    foregroundColor: isModalLocked ? Colors.white70 : (Theme.of(context).colorScheme.onPrimary),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: (isModalLocked || _submitting)
                      ? null
                      : () async {
                          setState(() => _submitting = true);
                          final inc = toMinorUnits(num.tryParse(_incomeCtrl.text) ?? 0);
                          final flr = toMinorUnits(num.tryParse(_floorCtrl.text) ?? 0);
                          final day = int.tryParse(_creditDayCtrl.text) ?? 1;

                          final navigator = Navigator.of(context);
                          await budget.updateSalaryFloor(
                            income: inc,
                            floor: flr,
                            creditDay: day,
                            bankAccountId: _selectedBankId,
                            salaryCreditedDate: _salaryCreditedDateStr,
                            isSalaryCredited: _isSalaryCredited,
                          );
                          if (mounted) navigator.pop();
                        },
                  child: _submitting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(isModalLocked ? 'Locked' : 'Save Settings', style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
