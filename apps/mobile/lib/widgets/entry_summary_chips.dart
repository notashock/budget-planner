import 'package:flutter/material.dart';

import '../engine/engine.dart';
import '../models/account.dart';
import '../theme/app_palette.dart';
import 'account_selector.dart';
import 'app_date_picker.dart';
import 'min_tap.dart';

/// Date and account as one row of chips, each showing the current choice and
/// opening its picker when tapped (entry-forms plan §5.1, upgrade plan 3.6):
///
///   [📅 Today ▾]   [🏦 HDFC Salary · ₹42,300 ▾]
///
/// The defaults are right most of the time, so they take one line instead of
/// a full date field and a full account picker.
class EntrySummaryChips extends StatelessWidget {
  const EntrySummaryChips({
    super.key,
    required this.date,
    required this.onDate,
    required this.accountType,
    required this.accountId,
    required this.banks,
    required this.wallets,
    this.cards = const [],
    required this.onAccount,
    this.accountLabel = 'Payment account',
    this.accountRequired = false,
    this.showDate = true,
  });

  final DateTime date;
  final ValueChanged<DateTime> onDate;
  final String accountType;
  final String? accountId;
  final List<Account> banks, wallets, cards;
  final void Function(String type, String? id) onAccount;
  final String accountLabel;
  final bool accountRequired;

  /// Off for a recurring plan, which has a day of the month instead.
  final bool showDate;

  static String dateLabel(DateTime d, {DateTime? now}) {
    final n = now ?? DateTime.now();
    final today = DateTime(n.year, n.month, n.day);
    final diff = DateTime(d.year, d.month, d.day).difference(today).inDays;
    if (diff == 0) return 'Today';
    if (diff == -1) return 'Yesterday';
    if (diff == 1) return 'Tomorrow';
    return formatDisplayDate(
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}');
  }

  @override
  Widget build(BuildContext context) {
    Account? account;
    for (final a in [...banks, ...wallets, ...cards]) {
      if (a.id == accountId) account = a;
    }
    final p = context.palette;
    final missing = account == null;
    final accountText = missing
        ? (accountRequired ? 'Choose account' : 'No account')
        : [
            account.name.isEmpty ? 'Account' : account.name,
            if (account.currentBalance != null && account.kind != AccountKind.creditCard)
              formatCurrencyWhole(account.currentBalance!),
          ].join(' · ');

    // A Row, not a Wrap: the date keeps its size and a long account name
    // ellipsizes, so the pair stays on one line at any text size.
    return Row(
      children: [
        if (showDate) ...[
          _Chip(
            key: const ValueKey('entry-date-chip'),
            icon: Icons.event_outlined,
            label: dateLabel(date),
            semanticsLabel: 'Date: ${dateLabel(date)}. Change',
            onTap: () async {
              final picked = await showAppDatePicker(context, date);
              if (picked != null) onDate(picked);
            },
          ),
          const SizedBox(width: 8),
        ],
        Flexible(
          child: _Chip(
          key: const ValueKey('entry-account-chip'),
          icon: account?.kind == AccountKind.creditCard
              ? Icons.credit_card
              : (account?.kind == AccountKind.wallet ? Icons.account_balance_wallet_outlined : Icons.account_balance_outlined),
          label: accountText,
          color: missing && accountRequired ? p.warnInk : null,
          semanticsLabel: '$accountLabel: $accountText. Change',
          onTap: () => _pickAccount(context),
          ),
        ),
      ],
    );
  }

  Future<void> _pickAccount(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (sheet) {
          var type = accountType;
          String? id = accountId;
          return StatefulBuilder(
            builder: (context, setSheet) => SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AccountSelector(
                      label: accountLabel,
                      accountType: type,
                      selectedAccountId: id,
                      bankAccounts: banks,
                      wallets: wallets,
                      creditCards: cards,
                      isRequired: accountRequired,
                      onChanged: (t, i) {
                        setSheet(() {
                          type = t;
                          id = i;
                        });
                        onAccount(t, i);
                      },
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      key: const ValueKey('entry-account-done'),
                      onPressed: () => Navigator.pop(sheet),
                      child: const Text('Done'),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      );
}

class _Chip extends StatelessWidget {
  const _Chip({
    super.key,
    required this.icon,
    required this.label,
    required this.semanticsLabel,
    required this.onTap,
    this.color,
  });

  final IconData icon;
  final String label;
  final String semanticsLabel;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final fg = color ?? p.text;
    return Semantics(
      button: true,
      label: semanticsLabel,
      excludeSemantics: true,
      onTap: onTap, // excludeSemantics drops the InkWell's own action
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: MinTap(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: p.surfaceSubtle,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: color ?? p.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 16, color: fg),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: fg)),
                ),
                const SizedBox(width: 2),
                Icon(Icons.arrow_drop_down, size: 18, color: p.textMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
