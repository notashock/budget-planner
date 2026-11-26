import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../theme/app_form.dart';
import '../theme/app_colors.dart';

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
      padding: AppForm.sheetPadding,
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
                backgroundColor: Theme.of(context).colorScheme.primary,
                foregroundColor: Theme.of(context).colorScheme.onPrimary,
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
