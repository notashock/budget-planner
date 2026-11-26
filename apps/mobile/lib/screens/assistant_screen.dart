import 'package:flutter/material.dart';
import '../engine/engine.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../theme/app_palette.dart';
import '../widgets/acct_inset.dart';

/// Web's AssistantScreen: off by default; when on, text becomes a draft item
/// you review before saving, and the month's timeline can be explained.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _prompt = TextEditingController();
  bool _parsing = false;
  String _parseError = '';
  Map<String, dynamic>? _draft;
  bool _saving = false;

  bool _explaining = false;
  Map<String, dynamic>? _explanation;
  String _explainError = '';

  @override
  void initState() {
    super.initState();
    _prompt.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _prompt.dispose();
    super.dispose();
  }

  Future<void> _toggle(BudgetProvider budget, bool on) async {
    try {
      await budget.updateUserSettings({'aiAssistantEnabled': on});
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _parse(BudgetProvider budget) async {
    final text = _prompt.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _parsing = true;
      _parseError = '';
      _draft = null;
    });
    try {
      final res = await budget.api.parseTextAi(text);
      final item = res['item'];
      setState(() => _draft = item is Map ? Map<String, dynamic>.from(item) : null);
    } catch (e) {
      setState(() => _parseError = e.toString().isEmpty ? 'Failed to parse text into budget item' : e.toString());
    } finally {
      if (mounted) setState(() => _parsing = false);
    }
  }

  Future<void> _confirmDraft(BudgetProvider budget) async {
    final draft = _draft;
    if (_saving || draft == null) return;
    setState(() => _saving = true);
    try {
      await budget.addItem(draft);
      if (mounted) {
        setState(() => _draft = null);
        _prompt.clear();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _explain(BudgetProvider budget) async {
    final sim = budget.simulation;
    if (sim == null) return;
    setState(() {
      _explaining = true;
      _explainError = '';
      _explanation = null;
    });
    try {
      String? lowestDate;
      for (final d in sim.days) {
        if (d.day == sim.lowestBalanceDay) lowestDate = d.date;
      }
      final res = await budget.api.explainTimelineAi({
        'endingBalance': sim.closingBalance,
        'lowestBalance': sim.lowestBalance,
        'lowestDate': lowestDate,
        'floorBreached': sim.breaches.isNotEmpty,
        'events': [
          for (final e in sim.allEvents)
            {'date': e.date, 'label': e.name, 'amount': e.amount, 'balanceAfter': e.runningBalance, 'itemType': e.type},
        ],
      }, budget.monthInfo?.safetyFloor ?? 0);
      setState(() => _explanation = res);
    } catch (e) {
      setState(() => _explainError = e.toString().isEmpty ? 'Failed to generate timeline explanation' : e.toString());
    } finally {
      if (mounted) setState(() => _explaining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final p = context.palette;
    final muted = TextStyle(fontSize: 13, color: p.textSecondary, height: 1.4);
    final enabled = budget.userSettings['aiAssistantEnabled'] == true;

    if (!enabled) {
      return ListView(padding: const EdgeInsets.all(16), children: [
        AcctSection(
          title: 'Assistant is disabled',
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('The AI assistant is strictly optional and off by default. When turned off, zero financial data leaves the server.', style: muted),
            const SizedBox(height: 10),
            Text(
                'When enabled, it parses natural language descriptions into draft budget items (which you review before saving) and provides suggestions on how to resolve safety floor breaches.',
                style: muted),
            const SizedBox(height: 14),
            FilledButton(
              key: const ValueKey('ai-enable'),
              onPressed: () => _toggle(budget, true),
              child: const Text('Enable AI assistant'),
            ),
          ]),
        ),
      ]);
    }

    Widget spinnerLabel(String label) => Row(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
          const SizedBox(width: 8),
          Text(label),
        ]);
    Widget error(String msg) => Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Text('Error: $msg', style: TextStyle(fontSize: 12, color: p.badInk)),
        );
    BoxDecoration box(Color border) => BoxDecoration(
          color: p.surfaceSubtle,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(8),
        );
    final draft = _draft;
    final explanation = _explanation;
    final suggestions = (explanation?['suggestions'] as List?) ?? const [];

    return ListView(padding: const EdgeInsets.all(16), children: [
      Align(
        alignment: Alignment.centerRight,
        child: TextButton(
          key: const ValueKey('ai-disable'),
          onPressed: () => _toggle(budget, false),
          child: Text('Disable assistant', style: TextStyle(fontSize: 12, color: p.badInk)),
        ),
      ),
      AcctSection(
        title: 'Convert text to budget item',
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Describe an expense in plain language. The assistant converts it into a draft item for your review before saving.',
              style: muted),
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey('ai-prompt'),
            controller: _prompt,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(hintText: 'e.g. Internet bill of 999 on the 15th every month, or groceries 2500 on day 5'),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              key: const ValueKey('ai-parse'),
              onPressed: _parsing || _prompt.text.trim().isEmpty ? null : () => _parse(budget),
              child: _parsing ? spinnerLabel('Parsing item...') : const Text('Parse into item'),
            ),
          ),
          if (_parseError.isNotEmpty) error(_parseError),
          if (draft != null)
            Container(
              key: const ValueKey('ai-draft'),
              margin: const EdgeInsets.only(top: 14),
              padding: const EdgeInsets.all(12),
              decoration: box(p.borderStrong),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Review draft item before saving', style: TextStyle(fontWeight: FontWeight.w600, color: p.text)),
                const SizedBox(height: 8),
                Text('Name: ${draft['name']} (${draft['type']})', style: TextStyle(color: p.text)),
                const SizedBox(height: 4),
                Text(
                  'Amount: ${formatCurrency((draft['amount'] as num?)?.toInt() ?? 0)} on day ${draft['day'] ?? draft['dayOfMonth']}',
                  style: TextStyle(color: p.text),
                ),
                const SizedBox(height: 6),
                // Align: a Wrap in a start-aligned Column shrinks to its buttons.
                Align(alignment: Alignment.centerRight, child: Wrap(alignment: WrapAlignment.end, spacing: 8, children: [
                  TextButton(onPressed: () => setState(() => _draft = null), child: const Text('Discard')),
                  FilledButton(
                    key: const ValueKey('ai-save-draft'),
                    onPressed: _saving ? null : () => _confirmDraft(budget),
                    child: Text(_saving ? 'Saving...' : 'Confirm and save item'),
                  ),
                ])),
              ]),
            ),
        ]),
      ),
      AcctSection(
        title: 'Timeline analysis & suggestions',
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Analyzes the deterministic engine output and provides actionable suggestions if your safety floor is breached.',
              style: muted),
          const SizedBox(height: 10),
          FilledButton(
            key: const ValueKey('ai-explain'),
            onPressed: _explaining || budget.simulation == null ? null : () => _explain(budget),
            child: _explaining ? spinnerLabel('Analyzing timeline...') : const Text('Analyze timeline'),
          ),
          if (_explainError.isNotEmpty) error(_explainError),
          if (explanation != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 14),
              padding: const EdgeInsets.all(12),
              decoration: box(p.border),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${explanation['summary'] ?? ''}', style: TextStyle(fontWeight: FontWeight.w600, color: p.text)),
                for (final s in suggestions)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('•  $s', style: TextStyle(color: p.text)),
                  ),
              ]),
            ),
        ]),
      ),
    ]);
  }
}
