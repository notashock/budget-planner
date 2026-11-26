import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../engine/engine.dart' show formatDisplayDate, moneySymbol;
import '../providers/budget_provider.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../widgets/web_icons.dart';

enum _Step { welcome, account, income, salary, done }

String _iso(DateTime d) => '${d.year}-${'${d.month}'.padLeft(2, '0')}-${'${d.day}'.padLeft(2, '0')}';

/// First-run setup in Apple's setup-assistant style, page for page the same as
/// web's OnboardingModal: Welcome, your main account, how you're paid, your
/// salary (salary / both only), You're all set. Same API calls as web.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  _Step _step = _Step.welcome;
  bool _loading = false;
  String? _error;

  String _accountType = 'bank';
  final _name = TextEditingController();
  final _balance = TextEditingController();
  DateTime _balanceDate = DateTime.now();
  Map<String, dynamic>? _account;

  String _incomeMode = 'salary';
  String _accountKind = 'salary';
  final _salary = TextEditingController();
  DateTime _salaryDate = DateTime.now();

  @override
  void dispose() {
    _name.dispose();
    _balance.dispose();
    _salary.dispose();
    super.dispose();
  }

  void _go(_Step s) => setState(() {
        _error = null;
        _step = s;
      });

  Future<void> _run(Future<void> Function() fn) async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      await fn();
    } catch (e) {
      if (mounted) setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int? _minor(String text) {
    final v = double.tryParse(text.replaceAll(',', '').trim());
    return v == null ? null : (v * 100).round();
  }

  Future<void> _submitAccount() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Please provide an account name.');
      return;
    }
    final api = context.read<BudgetProvider>().api;
    await _run(() async {
      final body = {
        'name': _name.text.trim(),
        'openingBalance': _minor(_balance.text) ?? 0,
        'openingBalanceDate': _iso(_balanceDate),
      };
      if (_account != null) {
        // Came back to fix the account: update it rather than add a second one
        _account = {..._account!, ...await api.updateBankAccount('${_account!['id']}', body)};
      } else {
        _account = await api.createBankAccount({
          ...body,
          'type': _accountType,
          'accountType': _accountType == 'wallet' ? 'digital' : 'salary',
          'isPrimary': true,
        });
        if (!_balanceDate.isAfter(DateTime.now())) _salaryDate = _balanceDate;
      }
      _go(_Step.income);
    });
  }

  Future<void> _submitIncome() async {
    if (_incomeMode != 'irregular') return _go(_Step.salary);
    final api = context.read<BudgetProvider>().api;
    await _run(() async {
      await api.updateSettings({'incomeMode': 'irregular'});
      _go(_Step.done);
    });
  }

  Future<void> _submitSalary() async {
    final amount = _minor(_salary.text);
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Please provide a valid salary amount.');
      return;
    }
    final api = context.read<BudgetProvider>().api;
    await _run(() async {
      final id = '${_account?['id']}';
      if (_accountType == 'bank') {
        try {
          await api.updateBankAccount(id, {'accountType': _accountKind});
        } catch (_) {
          // Non-blocking: the account kind is cosmetic
        }
      }
      await api.saveSalaryTemplate({
        'amount': amount,
        'expectedCreditDay': _salaryDate.day,
        'receivingAccountId': id,
        'periodType': 'salary_cycle',
        'effectiveDate': _iso(_salaryDate),
      });
      if (_incomeMode == 'both') await api.updateSettings({'incomeMode': 'both'});
      _go(_Step.done);
    });
  }

  Future<DateTime?> _pickDate(DateTime initial) => showDatePicker(
        context: context,
        initialDate: initial,
        firstDate: DateTime(DateTime.now().year - 2),
        lastDate: DateTime.now(),
      );

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final back = switch (_step) {
      _Step.account => _Step.welcome,
      _Step.income => _Step.account,
      _Step.salary => _Step.income,
      _ => null,
    };
    final progress = switch (_step) { _Step.account => 1, _Step.income => 2, _Step.salary => 3, _ => 0 };
    final total = _incomeMode == 'irregular' ? 2 : 3;

    return Scaffold(
      backgroundColor: p.surfaceSubtle,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SizedBox(
              height: 44,
              child: Stack(alignment: Alignment.center, children: [
                if (back != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      key: const ValueKey('ob-back'),
                      onPressed: () => _go(back),
                      style: TextButton.styleFrom(foregroundColor: p.accent, padding: const EdgeInsets.only(right: 8), minimumSize: const Size(48, 44)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        WebIcon(WebIcons.chevronLeft, size: 20, color: p.accent),
                        Text('Back', style: AppTypography.inter(fontSize: 16, color: p.accent)),
                      ]),
                    ),
                  ),
                if (progress > 0)
                  Semantics(
                    label: 'Step $progress of $total',
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      for (var i = 0; i < total; i++)
                        Container(
                          width: 7,
                          height: 7,
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          decoration: BoxDecoration(shape: BoxShape.circle, color: i < progress ? p.accent : p.borderStrong),
                        ),
                    ]),
                  ),
              ]),
            ),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 280),
                switchInCurve: Curves.easeOutCubic,
                transitionBuilder: (child, a) => FadeTransition(
                  opacity: a,
                  child: SlideTransition(position: Tween(begin: const Offset(0.06, 0), end: Offset.zero).animate(a), child: child),
                ),
                child: KeyedSubtree(key: ValueKey(_step), child: _page(p)),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _page(AppPalette p) => switch (_step) {
        _Step.welcome => _Page(
            centered: true,
            mark: WebIcons.sparkles,
            markColor: p.accent,
            title: 'Welcome to Budget Planner',
            button: ('Get Started', () => _go(_Step.account)),
            buttonKey: 'ob-get-started',
            children: [
              for (final (icon, title, desc) in const [
                (WebIcons.sparkles, 'Know what’s safe to spend', 'One number for today, after every bill still to come.'),
                (WebIcons.calendar, 'See bills before they’re due', 'Your month laid out day by day, from payday on.'),
                (WebIcons.shieldAlert, 'Keep a minimum balance', 'A warning before any plan would take you below it.'),
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: 22),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SizedBox(width: 40, height: 40, child: Center(child: WebIcon(icon, size: 22, color: p.accent))),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(title, style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w600, color: p.text)),
                        const SizedBox(height: 2),
                        Text(desc, style: AppTypography.inter(fontSize: 14, height: 1.4, color: p.textSecondary)),
                      ]),
                    ),
                  ]),
                ),
            ],
          ),
        _Step.account => _Page(
            title: 'Add your main account',
            subtitle: 'Every transaction belongs to an account. You can add more later.',
            error: _error,
            button: (_loading ? 'Saving…' : 'Continue', _loading ? null : _submitAccount),
            buttonKey: 'ob-continue',
            children: [
              SetupSegmented(
                value: _accountType,
                enabled: _account == null,
                options: const [('bank', 'Bank account', WebIcons.buildingLibrary), ('wallet', 'Wallet', WebIcons.wallet)],
                onChanged: (v) => setState(() => _accountType = v),
              ),
              const SizedBox(height: 16),
              SetupGroup(children: [
                SetupRow(
                  label: 'Name',
                  child: _Input(
                    key: const ValueKey('ob-account-name'),
                    controller: _name,
                    hint: _accountType == 'bank' ? 'e.g. HDFC Salary' : 'e.g. Paytm',
                  ),
                ),
                SetupRow(label: 'Balance', child: _Input(key: const ValueKey('ob-balance'), controller: _balance, hint: '0.00', money: true)),
                SetupRow(
                  label: 'As of',
                  child: _DateChip(
                    date: _balanceDate,
                    onTap: () async {
                      final d = await _pickDate(_balanceDate);
                      if (d != null) setState(() => _balanceDate = d);
                    },
                  ),
                ),
              ]),
              const _Footnote('Enter what the account holds on that day. The app keeps it up to date from your transactions.'),
            ],
          ),
        _Step.income => _Page(
            title: 'How are you paid?',
            subtitle: 'This sets how each month is planned. You can change it in Settings.',
            error: _error,
            button: (_loading ? 'Saving…' : (_incomeMode == 'irregular' ? 'Finish' : 'Continue'), _loading ? null : _submitIncome),
            buttonKey: 'ob-continue',
            children: [
              SetupGroup(children: [
                for (final (id, label, desc) in const [
                  ('salary', 'Regular salary', 'The same amount around the same day each month'),
                  ('irregular', 'Variable or freelance', 'Income that changes; track your runway instead'),
                  ('both', 'Both', 'A salary plus extra income now and then'),
                ])
                  Semantics(
                    selected: _incomeMode == id,
                    child: InkWell(
                      key: ValueKey('ob-income-$id'),
                      onTap: () => setState(() => _incomeMode = id),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        child: Row(children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(label, style: AppTypography.inter(fontSize: 16, fontWeight: FontWeight.w500, color: p.text)),
                              const SizedBox(height: 2),
                              Text(desc, style: AppTypography.inter(fontSize: 13, color: p.textSecondary)),
                            ]),
                          ),
                          SizedBox(width: 24, child: _incomeMode == id ? WebIcon(WebIcons.check, size: 18, color: p.accent, strokeWidth: 2.5) : null),
                        ]),
                      ),
                    ),
                  ),
              ]),
            ],
          ),
        _Step.salary => _Page(
            title: 'Your salary',
            subtitle: 'Each month is planned from payday to payday.',
            error: _error,
            button: (_loading ? 'Saving…' : 'Finish', _loading ? null : _submitSalary),
            buttonKey: 'ob-finish',
            children: [
              SetupGroup(children: [
                SetupRow(label: 'Amount', child: _Input(key: const ValueKey('ob-salary-amount'), controller: _salary, hint: '0.00', money: true)),
                SetupRow(
                  label: 'Last paid on',
                  child: _DateChip(
                    key: const ValueKey('ob-salary-date'),
                    date: _salaryDate,
                    onTap: () async {
                      final d = await _pickDate(_salaryDate);
                      if (d != null) setState(() => _salaryDate = d);
                    },
                  ),
                ),
              ]),
              _Footnote('We’ll expect it around day ${_salaryDate.day} each month, into ${_account?['name'] ?? 'this account'}.'),
              if (_accountType == 'bank') ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
                  child: Text('ACCOUNT KIND',
                      style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.6, color: p.textMuted)),
                ),
                SetupSegmented(
                  value: _accountKind,
                  options: const [('salary', 'Salary', null), ('savings', 'Savings', null), ('checking', 'Checking', null), ('other', 'Other', null)],
                  onChanged: (v) => setState(() => _accountKind = v),
                ),
              ],
            ],
          ),
        _Step.done => _Page(
            centered: true,
            mark: WebIcons.checkCircle,
            markColor: p.good,
            title: 'You’re all set',
            subtitle: _incomeMode == 'irregular'
                ? 'Log income as it arrives. Your runway shows how long your balance lasts.'
                : 'Your first month starts on your last payday. Add bills and spending as they come.',
            button: ('Start Planning', () => context.read<BudgetProvider>().loadInitialData()),
            buttonKey: 'ob-start',
            children: const [],
          ),
      };
}

class _Page extends StatelessWidget {
  const _Page({
    required this.title,
    this.subtitle,
    this.error,
    required this.button,
    required this.buttonKey,
    required this.children,
    this.centered = false,
    this.mark,
    this.markColor,
  });

  final String title;
  final String? subtitle;
  final String? error;
  final (String, VoidCallback?) button;
  final String buttonKey;
  final List<Widget> children;
  final bool centered;
  final WebIconData? mark;
  final Color? markColor;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final align = centered ? TextAlign.center : TextAlign.start;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Expanded(
        child: ListView(padding: EdgeInsets.only(top: centered ? 48 : 12), children: [
          if (mark != null)
            Center(
              child: Container(
                width: 72,
                height: 72,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: markColor,
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [BoxShadow(color: (markColor ?? p.accent).withValues(alpha: 0.25), blurRadius: 24, offset: const Offset(0, 8))],
                ),
                child: Center(child: WebIcon(mark!, size: 32, color: Colors.white)),
              ),
            ),
          Text(title,
              textAlign: align,
              style: AppTypography.inter(fontSize: 32, fontWeight: FontWeight.w700, height: 1.15, letterSpacing: -0.6, color: p.text)),
          SizedBox(height: subtitle == null ? (centered ? 32 : 24) : 8),
          if (subtitle != null) ...[
            Text(subtitle!, textAlign: align, style: AppTypography.inter(fontSize: 15, height: 1.45, color: p.textSecondary)),
            const SizedBox(height: 24),
          ],
          ...children,
          if (error != null)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(color: p.badSubtle, borderRadius: BorderRadius.circular(10)),
              child: Text(error!, style: AppTypography.inter(fontSize: 13, color: p.badInk)),
            ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.only(top: 12, bottom: 12),
        child: SizedBox(
          height: 50,
          child: ElevatedButton(
            key: ValueKey(buttonKey),
            onPressed: button.$2,
            style: ElevatedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
            child: Text(button.$1, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
        ),
      ),
    ]);
  }
}

/// iOS grouped inset list: one rounded card, rows split by hairlines.
class SetupGroup extends StatelessWidget {
  const SetupGroup({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: p.surface,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        for (final (i, c) in children.indexed) ...[
          if (i > 0) Divider(height: 0.5, thickness: 0.5, indent: 16, color: p.border),
          c,
        ],
      ]),
    );
  }
}

class SetupRow extends StatelessWidget {
  const SetupRow({super.key, required this.label, required this.child, this.labelWidth = 104});
  final String label;
  final Widget child;
  final double labelWidth;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 48),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(children: [
          SizedBox(width: labelWidth, child: Text(label, style: AppTypography.inter(fontSize: 16, color: p.text))),
          Expanded(child: Align(alignment: Alignment.centerRight, child: child)),
        ]),
      ),
    );
  }
}

class _Input extends StatelessWidget {
  const _Input({super.key, required this.controller, required this.hint, this.money = false});
  final TextEditingController controller;
  final String hint;
  final bool money;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return TextField(
      controller: controller,
      textAlign: TextAlign.end,
      keyboardType: money ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
      textCapitalization: money ? TextCapitalization.none : TextCapitalization.words,
      style: AppTypography.inter(fontSize: 16, color: p.text),
      decoration: InputDecoration.collapsed(
        hintText: hint,
        hintStyle: AppTypography.inter(fontSize: 16, color: p.textMuted),
      ).copyWith(
        prefixText: money ? '$moneySymbol ' : null,
        prefixStyle: AppTypography.inter(fontSize: 16, color: p.textMuted),
        constraints: const BoxConstraints(minHeight: 44),
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
      ),
    );
  }
}

class _DateChip extends StatelessWidget {
  const _DateChip({super.key, required this.date, required this.onTap});
  final DateTime date;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Semantics(
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Center(
            widthFactor: 1,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(color: p.surfaceSubtle, borderRadius: BorderRadius.circular(8)),
              child: Text(formatDisplayDate(_iso(date), includeWeekday: false),
                  style: AppTypography.inter(fontSize: 15, color: p.text)),
            ),
          ),
        ),
      ),
    );
  }
}

class SetupSegmented extends StatelessWidget {
  const SetupSegmented({super.key, required this.value, required this.options, required this.onChanged, this.enabled = true});
  final String value;
  final List<(String, String, WebIconData?)> options;
  final ValueChanged<String> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(color: p.borderSubtle, borderRadius: BorderRadius.circular(9)),
      child: Row(children: [
        for (final (id, label, icon) in options)
          Expanded(
            child: Semantics(
              selected: value == id,
              button: true,
              child: GestureDetector(
                key: ValueKey('ob-seg-$id'),
                behavior: HitTestBehavior.opaque,
                onTap: enabled ? () => onChanged(id) : null,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  constraints: const BoxConstraints(minHeight: 44),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: value == id ? p.surface : Colors.transparent,
                    borderRadius: BorderRadius.circular(7),
                    boxShadow: value == id ? [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 3, offset: const Offset(0, 1))] : null,
                  ),
                  child: Opacity(
                    opacity: enabled || value == id ? 1 : 0.55,
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      if (icon != null) ...[WebIcon(icon, size: 14, color: p.text), const SizedBox(width: 6)],
                      Flexible(
                        child: Text(label,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.inter(fontSize: 13, fontWeight: value == id ? FontWeight.w600 : FontWeight.w500, color: p.text)),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
          ),
      ]),
    );
  }
}

class _Footnote extends StatelessWidget {
  const _Footnote(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        child: Text(text, style: AppTypography.inter(fontSize: 13, height: 1.4, color: context.palette.textMuted)),
      );
}
