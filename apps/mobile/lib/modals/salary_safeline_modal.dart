import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../engine/engine.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../models/salary_window.dart';
import '../widgets/web_icons.dart';

/// web's SalarySafelineModal ("Salary schedule"): the salary account, amount,
/// safety floor and credit date. Outside the salary window only the safety
/// floor can change.
class SalarySafelineModal extends StatefulWidget {
  const SalarySafelineModal({super.key, this.currentDate});

  /// Today, for the salary window (tests pass a fixed date).
  final DateTime? currentDate;

  @override
  State<SalarySafelineModal> createState() => _SalarySafelineModalState();
}

class _SalarySafelineModalState extends State<SalarySafelineModal> {
  late final TextEditingController _incomeCtrl;
  late final TextEditingController _floorCtrl;
  String? _bankId;
  late String _creditedDate;
  bool _isSalaryCredited = false;
  bool _dateDirty = false;
  bool _creditedDirty = false;
  bool _loading = false;
  String? _error;

  static String _major(int minor) {
    final v = toMajorUnits(minor);
    return v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();
  }

  static String _pad(int n) => n.toString().padLeft(2, '0');

  @override
  void initState() {
    super.initState();
    final budget = context.read<BudgetProvider>();
    final m = budget.monthInfo;
    final banks = budget.bankAccountModels;
    _incomeCtrl = TextEditingController(text: _major(m?.incomeAmount ?? 0));
    _floorCtrl = TextEditingController(text: _major(m?.safetyFloor ?? 0));
    final saved = m?.salaryAccountId;
    final primary = banks.where((b) => b.isPrimary).firstOrNull ?? banks.firstOrNull;
    _bankId = banks.any((b) => b.id == saved) ? saved : primary?.id;
    final now = DateTime.now();
    _creditedDate = m?.salaryCreditedDate ??
        m?.incomeCreditDate ??
        '${m?.year ?? now.year}-${_pad(m?.month ?? now.month)}-${_pad((m?.incomeCreditDay ?? 1).clamp(1, 31))}';
    _isSalaryCredited = m?.isSalaryCredited ?? false;
    // The payday window (last salary + about a month, ± 5 days) decides the lock;
    // the old calendar rule only applies before the first salary is credited.
    budget.getSalaryWindow().then((w) {
      if (mounted && w != null) setState(() => _window = w);
    }).catchError((Object _) {});
  }

  SalaryWindow? _window;

  @override
  void dispose() {
    _incomeCtrl.dispose();
    _floorCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate(int year, int month) async {
    final last = DateTime(year, month + 1, 0);
    final first = DateTime(year - 1, 1, 1);
    var initial = DateTime.tryParse(_creditedDate) ?? DateTime(year, month, 1);
    if (initial.isAfter(last)) initial = last;
    if (initial.isBefore(first)) initial = first;
    final picked = await showDatePicker(context: context, initialDate: initial, firstDate: first, lastDate: last);
    if (picked == null) return;
    setState(() {
      _creditedDate = '${picked.year}-${_pad(picked.month)}-${_pad(picked.day)}';
      _dateDirty = true;
      _isSalaryCredited = true;
      _creditedDirty = true;
    });
  }

  Future<void> _submit(bool locked) async {
    final budget = context.read<BudgetProvider>();
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final floor = toMinorUnits(num.tryParse(_floorCtrl.text) ?? 0);
    try {
      if (locked) {
        await budget.updateSalaryFloor(floor: floor);
      } else {
        await budget.updateSalaryFloor(
          income: toMinorUnits(num.tryParse(_incomeCtrl.text) ?? 0),
          floor: floor,
          bankAccountId: _bankId,
          salaryCreditedDate: _dateDirty ? _creditedDate : null,
          isSalaryCredited: _creditedDirty ? _isSalaryCredited : null,
        );
      }
      if (mounted) Navigator.pop(context);
    } catch (e) {
      final msg = e.toString().replaceFirst('Exception: ', '');
      if (mounted) setState(() => _error = msg.isEmpty ? 'Failed to update salary details.' : msg);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final p = context.palette;
    final m = budget.monthInfo;
    if (m == null) return const SizedBox.shrink();
    final status = getSalaryWindowStatus(m.raw, widget.currentDate);
    final window = _window;
    final locked = window != null ? !window.canLog : status.isLocked;
    final lockReason = window != null ? '${window.message}.' : status.reason;
    final banks = budget.bankAccountModels;
    final sym = m.currencySymbol;

    TextStyle label() => AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: p.textSecondary);
    Widget field(String text, Widget child, {String? hint}) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(text, style: label()),
            const SizedBox(height: 6),
            child,
            if (hint != null) ...[
              const SizedBox(height: 4),
              Text(hint, style: AppTypography.inter(fontSize: 11, color: p.textMuted)),
            ],
          ],
        );
    Widget notice(WebIconData icon, String title, String body, {Color? bg, Color? border, Key? key}) => Container(
          key: key,
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: bg ?? p.surfaceSubtle,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: border ?? p.border),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.only(top: 1), child: WebIcon(icon, size: 14, color: p.textSecondary)),
            const SizedBox(width: 8),
            Expanded(
              child: Text.rich(TextSpan(style: AppTypography.inter(fontSize: 12, color: p.textSecondary), children: [
                if (title.isNotEmpty) TextSpan(text: '$title ', style: const TextStyle(fontWeight: FontWeight.w700)),
                TextSpan(text: body),
              ])),
            ),
          ]),
        );
    InputDecoration box() => const InputDecoration(hintText: '0.00', isDense: true);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        decoration: BoxDecoration(
          color: p.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          border: Border.all(color: p.border),
        ),
        child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [
                WebIcon(WebIcons.buildingLibrary, size: 18, color: p.text),
                const SizedBox(width: 8),
                Expanded(child: Text('Salary schedule', style: AppTypography.inter(fontSize: 16, fontWeight: FontWeight.w600, color: p.text))),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.pop(context),
                  icon: WebIcon(WebIcons.x, size: 16, color: p.textSecondary),
                ),
              ]),
              const SizedBox(height: 8),
              Text(
                'Designate the bank account that receives your salary and specify the monthly salary details for ${m.month}/${m.year}.',
                style: AppTypography.inter(fontSize: 12, color: p.textSecondary, height: 1.4),
              ),
              const SizedBox(height: 16),
              if (locked)
                notice(WebIcons.lock, 'Salary logging locked:', '$lockReason Your safety floor can still be changed.',
                    key: const ValueKey('salary-lock-banner')),
              if (status.isMidMonthSetup && !locked)
                notice(
                  WebIcons.shieldAlert,
                  'Notice:',
                  'Because today is outside the 10-day rollover window (Day -4 to Day 5), this initial salary setup will lock immediately upon saving until next month-end.',
                  bg: p.warnSubtle,
                  border: p.warn.withAlpha(77),
                  key: const ValueKey('mid-month-warning-banner'),
                ),
              if (_error != null) notice(WebIcons.shieldAlert, '', _error!),
              field(
                'Salary Credited Account *',
                banks.isEmpty
                    ? Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: p.surfaceSubtle, borderRadius: BorderRadius.circular(8)),
                        child: Text('No bank accounts registered yet. Please create a bank account first.',
                            style: AppTypography.inter(fontSize: 12, color: p.textSecondary)),
                      )
                    : DropdownButtonFormField<String>(
                        key: const ValueKey('salary-credited-bank-select'),
                        initialValue: _bankId,
                        isExpanded: true,
                        borderRadius: BorderRadius.circular(8),
                        decoration: const InputDecoration(isDense: true),
                        items: [
                          for (final b in banks)
                            DropdownMenuItem(
                              value: b.id,
                              child: Text(
                                '${b.name.isEmpty ? 'Account' : b.name} (${(b.institution ?? '').isEmpty ? 'Bank' : b.institution}) ${b.isPrimary ? '[Primary]' : ''}'.trim(),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: locked ? null : (v) => setState(() => _bankId = v),
                      ),
              ),
              const SizedBox(height: 14),
              field(
                'Monthly Salary Amount ($sym) *',
                TextField(
                  key: const ValueKey('salary-amount-input'),
                  controller: _incomeCtrl,
                  enabled: !locked,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: box(),
                ),
              ),
              const SizedBox(height: 14),
              field(
                'Safety floor ($sym) *',
                TextField(
                  key: const ValueKey('safeline-floor-input'),
                  controller: _floorCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: box(),
                ),
              ),
              const SizedBox(height: 14),
              field(
                'Date of Salary Credit *',
                InkWell(
                  key: const ValueKey('salary-credit-date-input'),
                  onTap: locked ? null : () => _pickDate(m.year, m.month),
                  borderRadius: BorderRadius.circular(8),
                  child: InputDecorator(
                    decoration: InputDecoration(isDense: true, enabled: !locked),
                    child: Text(_creditedDate,
                        style: AppTypography.inter(fontSize: 14, color: locked ? p.textMuted : p.text)),
                  ),
                ),
                hint: 'The exact calendar date your salary is credited (can also be on previous month-end).',
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  color: p.surfaceSubtle,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: p.border),
                ),
                child: CheckboxListTile(
                  key: const ValueKey('salary-credited-checkbox'),
                  dense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _isSalaryCredited,
                  onChanged: locked
                      ? null
                      : (v) => setState(() {
                            _isSalaryCredited = v ?? false;
                            _creditedDirty = true;
                          }),
                  title: Text('Salary already credited for this month',
                      style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: p.text)),
                ),
              ),
              const SizedBox(height: 22),
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _loading ? null : () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(child: FilledButton(
                  key: const ValueKey('salary-save'),
                  onPressed: _loading || (!locked && banks.isEmpty) ? null : () => _submit(locked),
                  child: Text(locked
                      ? (_loading ? 'Updating...' : 'Update safety floor')
                      : (_loading ? 'Saving...' : 'Save salary schedule')),
                )),
              ]),
            ],
          ),
        ),
      ),
      ),
    );
  }
}
