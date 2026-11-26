import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../engine/engine.dart';
import '../models/account.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../theme/app_form.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../widgets/web_icons.dart';

const _monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/// Web's MonthRolloverModal: start the next month, with an opening balances
/// preview and the two carry-forward switches (both on, as on web).
class RolloverModal extends StatefulWidget {
  const RolloverModal({super.key});

  @override
  State<RolloverModal> createState() => _RolloverModalState();
}

class _RolloverModalState extends State<RolloverModal> {
  bool _carryBalance = true;
  bool _rolloverUnpaid = true;
  bool _submitting = false;
  String? _error;

  Future<void> _confirm() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await context.read<BudgetProvider>().rolloverMonth(carryBalance: _carryBalance, rolloverUnpaid: _rolloverUnpaid);
      if (mounted) navigator.pop();
    } catch (e) {
      if (mounted) setState(() => _error = 'Failed to roll over into next month');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final budget = context.budgetView();
    final m = budget.monthInfo;
    final year = m?.year ?? DateTime.now().year;
    final month = m?.month ?? DateTime.now().month;
    final nextMonth = month == 12 ? 1 : month + 1;
    final nextYear = month == 12 ? year + 1 : year;
    final current = '${_monthNames[(month - 1).clamp(0, 11)]} $year';
    final target = '${_monthNames[nextMonth - 1]} $nextYear';
    final accounts = [...budget.bankAccountModels, ...budget.walletModels];

    TextStyle small(Color c, {FontWeight w = FontWeight.w400}) => AppTypography.inter(fontSize: 11, fontWeight: w, color: c);

    Widget option(String key, bool value, ValueChanged<bool> onChanged, String title, String body) => InkWell(
          key: ValueKey(key),
          onTap: _submitting ? null : () => onChanged(!value),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Checkbox(value: value, onChanged: _submitting ? null : (v) => onChanged(v ?? false)),
              const SizedBox(width: 4),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title, style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w700, color: p.text)),
                    const SizedBox(height: 2),
                    Text(body, style: small(p.textMuted)),
                  ]),
                ),
              ),
            ]),
          ),
        );

    return Container(
      padding: AppForm.sheetPadding,
      decoration: BoxDecoration(
        color: p.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        border: Border.all(color: p.border),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: p.good.withAlpha(30), shape: BoxShape.circle),
                  child: WebIcon(WebIcons.zap, size: 16, color: p.goodInk),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Start $target', style: AppTypography.inter(fontSize: 16, fontWeight: FontWeight.w600, color: p.text)),
                    Text('Cycle rollover from $current', style: small(p.textMuted)),
                  ]),
                ),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.pop(context),
                  icon: WebIcon(WebIcons.x, size: 14, color: p.textSecondary),
                ),
              ]),
              const SizedBox(height: 12),
              Text.rich(
                TextSpan(children: [
                  const TextSpan(text: 'Advance your budget from '),
                  TextSpan(text: current, style: const TextStyle(fontWeight: FontWeight.w700)),
                  const TextSpan(text: ' to '),
                  TextSpan(text: target, style: const TextStyle(fontWeight: FontWeight.w700)),
                  const TextSpan(text: '. Your account ending balances will safely transition as opening balances.'),
                ]),
                style: AppTypography.inter(fontSize: 13, color: p.textSecondary),
              ),
              const SizedBox(height: 16),
              Container(
                key: const ValueKey('rollover-preview'),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: p.surfaceSubtle,
                  border: Border.all(color: p.border),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    Expanded(
                      child: Text('OPENING BALANCES PREVIEW',
                          style: small(p.textMuted, w: FontWeight.w700).copyWith(letterSpacing: 0.5)),
                    ),
                    Text(_carryBalance ? 'Carrying Ending Balances' : 'Resetting to Zero',
                        style: small(p.textSecondary, w: FontWeight.w500)),
                  ]),
                  const SizedBox(height: 8),
                  if (accounts.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: Text('No accounts linked yet', textAlign: TextAlign.center, style: small(p.textMuted)),
                    )
                  else
                    for (final a in accounts)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(children: [
                          WebIcon(a.kind == AccountKind.wallet ? WebIcons.wallet : WebIcons.buildingLibrary,
                              size: 13, color: p.textMuted),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(a.name, overflow: TextOverflow.ellipsis,
                                style: AppTypography.inter(fontSize: 13, color: p.text)),
                          ),
                          Text(
                            formatCurrency(_carryBalance ? (a.currentBalance ?? a.openingBalance) : 0),
                            style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: p.text)
                                .copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                          ),
                        ]),
                      ),
                ]),
              ),
              const SizedBox(height: 12),
              option('rollover-unpaid', _rolloverUnpaid, (v) => setState(() => _rolloverUnpaid = v),
                  'Roll over unpaid planned items',
                  'Carries forward unfulfilled one-time expenses and re-adjusts initial balances.'),
              option('carry-balance', _carryBalance, (v) => setState(() => _carryBalance = v),
                  'Carry forward ending account balances',
                  'Snapshots closing balances as new opening balances for $target.'),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: p.bad.withAlpha(25),
                    border: Border.all(color: p.bad.withAlpha(64)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(_error!, style: AppTypography.inter(fontSize: 12, color: p.badInk)),
                ),
              ],
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: _submitting ? null : () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                  FilledButton.icon(
                    key: const ValueKey('confirm-rollover'),
                    onPressed: _submitting ? null : _confirm,
                    icon: WebIcon(WebIcons.sparkles, size: 14, color: Theme.of(context).colorScheme.onPrimary),
                    label: Text(_submitting ? 'Starting Month...' : 'Confirm & Start $target'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
