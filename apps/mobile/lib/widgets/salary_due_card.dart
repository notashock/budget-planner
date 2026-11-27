import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../engine/engine.dart';
import '../models/month_detail.dart';
import '../models/transaction.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import 'web_icons.dart';

String _iso(DateTime d) => '${d.year}-${'${d.month}'.padLeft(2, '0')}-${'${d.day}'.padLeft(2, '0')}';
String _addDays(String iso, int n) {
  final p = iso.split('-').map(int.parse).toList();
  return _iso(DateTime(p[0], p[1], p[2] + n));
}

/// The salary Plan offers to log today, or null. [nextCycle]: this cycle's
/// salary is in and the next payday's is due (salary cycles only); [earliest]
/// is the first date the server takes for it.
({String payday, bool nextCycle, String earliest})? salaryDue(MonthInfo m, String? periodType, DateTime today) {
  final t = _iso(today);
  final start = m.raw['startDate'];
  if (m.isClosed || (start is String && start.compareTo(t) > 0)) return null;
  if (!m.isSalaryCredited) {
    final expected = m.incomeCreditDate;
    if (expected == null || t.compareTo(_addDays(expected, -5)) < 0) return null;
    return (payday: expected, nextCycle: false, earliest: start is String ? start : expected);
  }
  final end = m.raw['endDate'];
  if (periodType != 'salary_cycle' || end is! String) return null;
  final payday = _addDays(end, 1);
  if (t.compareTo(_addDays(payday, -5)) < 0) return null;
  return (payday: payday, nextCycle: true, earliest: _addDays(payday, -10));
}

/// What the next cycle gets from this one's plans (the server's carry rules):
/// unpaid Fixed plans move in, unpaid Variable ones drop, monthly ones repeat.
({List<String> moved, List<String> dropped, List<String> repeated}) carryPreview(List<Transaction> txs) {
  final moved = <String>[], dropped = <String>[], repeated = <String>{};
  for (final t in txs) {
    if (t.origin == TxOrigin.salary) continue;
    final name = t.name.isEmpty ? t.category : t.name;
    if (t.isPlanned) (t.isFixed ? moved : dropped).add(name);
    if (t.recurrence != null) repeated.add(name);
  }
  return (moved: moved, dropped: dropped, repeated: repeated.toList());
}

/// Plan's "Salary due" prompt: shows near payday until the salary is logged.
class SalaryDueCard extends StatelessWidget {
  const SalaryDueCard({super.key, this.today});

  /// Tests pass a fixed date.
  final DateTime? today;

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final m = budget.monthInfo;
    final now = today ?? DateTime.now();
    final due = m == null ? null : salaryDue(m, '${budget.userSettings['periodType'] ?? ''}', now);
    if (m == null || due == null) return const SizedBox.shrink();
    final p = context.palette;
    final t = _iso(now);
    final when = formatDisplayDate(due.payday, includeWeekday: false);
    final title = t.compareTo(due.payday) < 0 ? 'Salary due $when' : (t == due.payday ? 'Salary due today' : 'Salary was due $when');
    return Container(
      key: const ValueKey('salary-due-card'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
      decoration: BoxDecoration(
        color: p.goodSubtle,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: p.good.withAlpha(77)),
      ),
      child: Row(children: [
        WebIcon(WebIcons.banknote, size: 18, color: p.goodInk),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w700, color: p.text)),
            const SizedBox(height: 2),
            Text(
              due.nextCycle ? 'Log it when it lands to start your next cycle.' : 'Log it when it lands.',
              style: AppTypography.inter(fontSize: 12, color: p.textSecondary),
            ),
          ]),
        ),
        FilledButton(
          key: const ValueKey('salary-due-log'),
          onPressed: () => showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => LogSalarySheet(today: now),
          ),
          child: const Text('Log salary'),
        ),
      ]),
    );
  }
}

/// Confirm amount, account and date, then credit the salary.
class LogSalarySheet extends StatefulWidget {
  const LogSalarySheet({super.key, required this.today});
  final DateTime today;

  @override
  State<LogSalarySheet> createState() => _LogSalarySheetState();
}

class _LogSalarySheetState extends State<LogSalarySheet> {
  late final TextEditingController _amount;
  String? _bankId;
  late String _date;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final budget = context.read<BudgetProvider>();
    final m = budget.monthInfo!;
    final v = toMajorUnits(m.incomeAmount);
    _amount = TextEditingController(text: v == v.roundToDouble() ? v.toStringAsFixed(0) : '$v');
    final banks = budget.bankAccountModels;
    final primary = banks.where((b) => b.isPrimary).firstOrNull ?? banks.firstOrNull;
    _bankId = banks.any((b) => b.id == m.salaryAccountId) ? m.salaryAccountId : primary?.id;
    _date = _iso(widget.today);
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amount = num.tryParse(_amount.text.trim()) ?? 0;
    if (amount <= 0) return setState(() => _error = 'Enter the salary amount.');
    setState(() {
      _saving = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      await context.read<BudgetProvider>().creditSalary(amount: toMinorUnits(amount), bankAccountId: _bankId, date: _date);
      if (!mounted) return;
      Navigator.pop(context);
      messenger.showSnackBar(const SnackBar(content: Text('Salary logged')));
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final m = budget.monthInfo;
    final due = m == null ? null : salaryDue(m, '${budget.userSettings['periodType'] ?? ''}', widget.today);
    if (m == null || due == null) return const SizedBox.shrink();
    final p = context.palette;
    final banks = budget.bankAccountModels;
    TextStyle label() => AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: p.textSecondary);

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
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Log salary', style: AppTypography.inter(fontSize: 16, fontWeight: FontWeight.w600, color: p.text)),
              const SizedBox(height: 16),
              Text('Amount (${m.currencySymbol})', style: label()),
              const SizedBox(height: 6),
              TextField(
                key: const ValueKey('log-salary-amount'),
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(isDense: true),
              ),
              const SizedBox(height: 14),
              Text('Paid into', style: label()),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                key: const ValueKey('log-salary-account'),
                initialValue: _bankId,
                isExpanded: true,
                decoration: const InputDecoration(isDense: true),
                items: [
                  for (final b in banks)
                    DropdownMenuItem(value: b.id, child: Text(b.name.isEmpty ? 'Account' : b.name, overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (v) => setState(() => _bankId = v),
              ),
              const SizedBox(height: 14),
              Text('Date it arrived', style: label()),
              const SizedBox(height: 6),
              InkWell(
                key: const ValueKey('log-salary-date'),
                borderRadius: BorderRadius.circular(8),
                onTap: () async {
                  final first = DateTime.parse(due.earliest);
                  final last = widget.today;
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: DateTime.parse(_date),
                    firstDate: first.isAfter(last) ? last : first,
                    lastDate: last,
                  );
                  if (picked != null) setState(() => _date = _iso(picked));
                },
                child: InputDecorator(
                  decoration: const InputDecoration(isDense: true),
                  child: Text(formatDisplayDate(_date), style: AppTypography.inter(fontSize: 14, color: p.text)),
                ),
              ),
              if (due.nextCycle) ...[
                const SizedBox(height: 8),
                Text(
                  'Your current cycle ends on ${formatDisplayDate(_addDays(_date, -1), includeWeekday: false)} '
                  'and the next one starts on ${formatDisplayDate(_date, includeWeekday: false)}.',
                  key: const ValueKey('log-salary-cycle-note'),
                  style: AppTypography.inter(fontSize: 12, color: p.textSecondary, height: 1.4),
                ),
              ],
              if (due.nextCycle) ...() {
                final c = carryPreview(budget.transactionModels);
                Widget line(String key, String label, List<String> names) => names.isEmpty
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text('$label: ${names.join(', ')}',
                            key: ValueKey(key), style: AppTypography.inter(fontSize: 12, color: p.textSecondary, height: 1.4)),
                      );
                return [
                  if (c.moved.isNotEmpty || c.dropped.isNotEmpty || c.repeated.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text('Your plans in the new cycle', style: label()),
                  ],
                  line('carry-moved', 'Moves in, still owed (Fixed)', c.moved),
                  line('carry-dropped', 'Dropped (Variable, unpaid)', c.dropped),
                  line('carry-repeated', 'Repeats on the same date', c.repeated),
                ];
              }(),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!, style: AppTypography.inter(fontSize: 12, color: p.badInk)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                key: const ValueKey('log-salary-confirm'),
                onPressed: _saving || _bankId == null ? null : _submit,
                child: Text(_saving ? 'Logging…' : 'Log salary'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
