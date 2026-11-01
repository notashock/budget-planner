import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';

class CreateMonthModal extends StatefulWidget {
  const CreateMonthModal({super.key});

  @override
  State<CreateMonthModal> createState() => _CreateMonthModalState();
}

class _CreateMonthModalState extends State<CreateMonthModal> {
  final _yearCtrl = TextEditingController(text: '${DateTime.now().year}');
  final _monthCtrl = TextEditingController(text: '${DateTime.now().month}');
  final _openingCtrl = TextEditingController(text: '0');
  final _incomeCtrl = TextEditingController(text: '0');
  final _floorCtrl = TextEditingController(text: '0');
  bool _carryoverBalance = false;
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Create New Budget Month',
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
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _yearCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Year', border: OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _monthCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Month (1-12)', border: OutlineInputBorder()),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _openingCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Opening Balance (₹)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _incomeCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Monthly Salary / Income (₹)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _floorCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Safety Floor Threshold (₹)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: _carryoverBalance,
              title: const Text('Carry over previous month ending balance', style: TextStyle(fontSize: 12.5)),
              onChanged: (val) => setState(() => _carryoverBalance = val ?? false),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: isDark ? Colors.white : Colors.black,
                  foregroundColor: isDark ? Colors.black : Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: _submitting
                    ? null
                    : () async {
                        setState(() => _submitting = true);
                        final y = int.tryParse(_yearCtrl.text) ?? 2026;
                        final m = int.tryParse(_monthCtrl.text) ?? 1;
                        final opening = toMinorUnits(num.tryParse(_openingCtrl.text) ?? 0);
                        final income = toMinorUnits(num.tryParse(_incomeCtrl.text) ?? 0);
                        final floor = toMinorUnits(num.tryParse(_floorCtrl.text) ?? 0);

                        final navigator = Navigator.of(context);
                        await context.read<BudgetProvider>().createMonth(
                              y,
                              m,
                              opening: opening,
                              income: income,
                              floor: floor,
                              carryoverBalance: _carryoverBalance,
                            );
                        if (mounted) navigator.pop();
                      },
                child: _submitting
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Create Month', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class RolloverModal extends StatefulWidget {
  const RolloverModal({super.key});

  @override
  State<RolloverModal> createState() => _RolloverModalState();
}

class _RolloverModalState extends State<RolloverModal> {
  bool _carryBalance = true;
  bool _rolloverUnpaid = false;
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Rollover to Next Month',
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
          Text(
            'This action prepares the following calendar month, copying fixed recurring expenses and maintaining continuity.',
            style: TextStyle(
              fontSize: 13,
              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
            ),
          ),
          const SizedBox(height: 16),
          CheckboxListTile(
            title: const Text('Carry forward ending balance as opening balance'),
            value: _carryBalance,
            onChanged: (v) => setState(() => _carryBalance = v ?? true),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          CheckboxListTile(
            title: const Text('Roll forward unpaid one-time items'),
            value: _rolloverUnpaid,
            onChanged: (v) => setState(() => _rolloverUnpaid = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: isDark ? Colors.white : Colors.black,
                foregroundColor: isDark ? Colors.black : Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: _submitting
                  ? null
                  : () async {
                      setState(() => _submitting = true);
                      final navigator = Navigator.of(context);
                      await context.read<BudgetProvider>().rolloverMonth(
                            carryBalance: _carryBalance,
                            rolloverUnpaid: _rolloverUnpaid,
                          );
                      if (mounted) navigator.pop();
                    },
              child: _submitting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Confirm Rollover', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
    );
  }
}
