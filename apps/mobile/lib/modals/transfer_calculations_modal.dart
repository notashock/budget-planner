import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import 'card_modals.dart' show AppSheet;
import 'edit_account_modal.dart' show bankAccountTypes;

/// Web's Plan banner for a user whose numbers predate accounts: one step moves
/// them into a bank account. It asks the server whether that applies, which is
/// only true while the user has no accounts at all.
class MoveBalanceBanner extends StatefulWidget {
  final int todayBalance;
  const MoveBalanceBanner({super.key, required this.todayBalance});

  @override
  State<MoveBalanceBanner> createState() => _MoveBalanceBannerState();
}

class _MoveBalanceBannerState extends State<MoveBalanceBanner> {
  Map<String, dynamic>? _stats;

  @override
  void initState() {
    super.initState();
    context.read<BudgetProvider>().getMigrationStatus().then((res) {
      if (mounted && res['eligible'] == true) setState(() => _stats = Map<String, dynamic>.from(res['stats'] as Map? ?? {}));
    }).catchError((Object _) {});
  }

  @override
  Widget build(BuildContext context) {
    final stats = _stats;
    if (stats == null) return const SizedBox.shrink();
    final p = context.palette;
    return Container(
      key: const ValueKey('move-balance-banner'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: p.surface,
        border: Border.all(color: p.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.account_balance_outlined, size: 18, color: p.text),
          const SizedBox(width: 8),
          Expanded(
            child: Text('Move your balance into a bank account',
                style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w600, color: p.text)),
          ),
          Text('One step', style: TextStyle(fontSize: 12, color: p.textMuted)),
        ]),
        const SizedBox(height: 6),
        Text(
          'Move your current balance (${formatCurrency(widget.todayBalance)}) into your main bank account so it updates as you spend.',
          style: TextStyle(fontSize: 13, color: p.textSecondary),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerRight,
          child: ElevatedButton(
            key: const ValueKey('move-balance-open'),
            onPressed: () async {
              final moved = await showModalBottomSheet<bool>(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => TransferCalculationsModal(stats: stats),
              );
              if (moved == true && mounted) setState(() => _stats = null);
            },
            child: const Text('Move my balance'),
          ),
        ),
      ]),
    );
  }
}

/// Creates the first bank account and moves every existing calculation into it.
/// shortcut: web also lists existing banks to pick from, but the server only offers
/// this move to users with no accounts, so that branch never shows; add it if that changes.
class TransferCalculationsModal extends StatefulWidget {
  final Map<String, dynamic> stats;
  const TransferCalculationsModal({super.key, required this.stats});

  @override
  State<TransferCalculationsModal> createState() => _TransferCalculationsModalState();
}

class _TransferCalculationsModalState extends State<TransferCalculationsModal> {
  final _name = TextEditingController(text: 'Primary Checking');
  final _institution = TextEditingController();
  String _type = 'checking';
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _institution.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty || _institution.text.trim().isEmpty) {
      return setState(() => _error = 'Please provide an account name and financial institution.');
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await context.read<BudgetProvider>().migrateLegacyData({
        'name': _name.text.trim(),
        'institution': _institution.text.trim(),
        'accountType': _type,
        'makePrimary': true,
        'linkSalary': true,
      });
      navigator.pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().isEmpty ? 'Data transfer failed. Please try again.' : e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int _int(String key) => (widget.stats[key] as num?)?.toInt() ?? 0;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    Widget tile(String label, String value) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: p.surface,
              border: Border.all(color: p.border),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: TextStyle(fontSize: 11, color: p.textSecondary)),
              Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.text)),
            ]),
          ),
        );
    return AppSheet(title: 'Move your balance into an account', children: [
      Text('Single unified migration to your bank ledger', style: TextStyle(fontSize: 12, color: p.textSecondary)),
      const SizedBox(height: 12),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(_error!, style: TextStyle(fontSize: 12, color: p.badInk)),
        ),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: p.surfaceSubtle,
          border: Border.all(color: p.border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('DATA TO BE TRANSFERRED',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: p.textSecondary)),
          const SizedBox(height: 8),
          Row(children: [
            tile('Opening Balance', formatCurrency(_int('currentOpeningBalance'))),
            const SizedBox(width: 8),
            tile('Monthly Salary', formatCurrency(_int('currentIncomeAmount'))),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            tile('Planned Items', '${_int('itemCount')} items'),
            const SizedBox(width: 8),
            tile('Transactions', '${_int('transactionCount')} records'),
          ]),
        ]),
      ),
      const SizedBox(height: 14),
      Text(
        'No bank accounts linked yet. Enter your primary bank details below to create your account and absorb all existing calculations immediately.',
        style: TextStyle(fontSize: 12, color: p.textSecondary),
      ),
      const SizedBox(height: 10),
      TextField(
        key: const ValueKey('migration-bank-name'),
        controller: _name,
        decoration: const InputDecoration(labelText: 'Bank Account Name *', hintText: 'e.g. Primary Checking, Salary Account'),
      ),
      const SizedBox(height: 10),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: TextField(
            key: const ValueKey('migration-bank-inst'),
            controller: _institution,
            decoration: const InputDecoration(labelText: 'Financial Institution *', hintText: 'e.g. HDFC Bank, Chase'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: DropdownButtonFormField<String>(
            initialValue: _type,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Account Type'),
            items: [for (final (v, l) in bankAccountTypes) DropdownMenuItem(value: v, child: Text(l))],
            onChanged: (v) => setState(() => _type = v ?? _type),
          ),
        ),
      ]),
      const SizedBox(height: 16),
      Row(mainAxisAlignment: MainAxisAlignment.end, children: [
        TextButton(onPressed: _loading ? null : () => Navigator.pop(context), child: const Text('Cancel')),
        const SizedBox(width: 8),
        Flexible(
          child: ElevatedButton.icon(
            key: const ValueKey('migration-submit'),
            onPressed: _loading ? null : _submit,
            icon: const Icon(Icons.account_balance_outlined, size: 16),
            label: Text(_loading ? 'Transferring...' : 'Create Account & Transfer All Data'),
          ),
        ),
      ]),
    ]);
  }
}
