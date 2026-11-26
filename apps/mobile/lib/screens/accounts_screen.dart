import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../providers/budget_view.dart';
import '../engine/engine.dart';
import '../models/account.dart';
import '../models/transaction.dart' show TxOrigin;
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../modals/unified_entry_modal.dart';
import '../modals/edit_account_modal.dart';
import '../modals/card_modals.dart' show AddCardModal;
import '../modals/held_lent_modal.dart';
import '../widgets/acct_inset.dart';
import '../widgets/confirm_dialog.dart';
import '../widgets/held_lent_section.dart';
import '../widgets/cards_section.dart';
import '../widgets/min_tap.dart';
import '../widgets/plan_glance.dart' show BalanceSparkline;
import '../widgets/web_icons.dart';

/// Bumped when the header's ＋ menu saves a card or a person, so the panels reload.
final accountPanelsReload = ValueNotifier<int>(0);

/// One bank or wallet as web's rowFor() sees it.
class _AcctRowData {
  _AcctRowData(this.acc, this.balance, this.breached, this.isSalary, this.caption);
  final Account acc;
  final int? balance;
  final bool breached;
  final bool isSalary;
  final String caption;
}

_AcctRowData _rowFor(BudgetProvider budget, Account acc) {
  final now = DateTime.now();
  final isThisMonth = budget.currentYear == now.year && budget.currentMonth == now.month;
  final sim = budget.accountSimulations[acc.id];
  // web's liveBalance(): this month, the account's own balance; other months, the plan's.
  final balance = isThisMonth && acc.currentBalance != null
      ? acc.currentBalance
      : sim?.todaysBalance ?? budget.simulation?.accountBalances[acc.id] ?? acc.currentBalance;
  final isBank = acc.kind == AccountKind.bank;
  final min = acc.minimumBalance;
  final below = balance != null && balance < min;
  final breached = (!isBank && below) || (sim != null ? sim.breaches.isNotEmpty : below);
  final isSalary = isBank && budget.monthInfo?.salaryAccountId == acc.id;
  final mask = acc.accountNumberMasked;
  final caption = isBank
      ? [acc.institution?.isNotEmpty == true ? acc.institution! : 'Bank', if (mask != null && mask.isNotEmpty) '•••• ${mask.length > 4 ? mask.substring(mask.length - 4) : mask}'].join(' · ')
      : '${acc.walletType?.isNotEmpty == true ? acc.walletType : 'cash'} wallet';
  return _AcctRowData(acc, balance, breached, isSalary, caption);
}

Future<void> _sheet(BuildContext context, Widget child) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => child,
  );
  if (saved == true) accountPanelsReload.value++;
}

/// Header ＋ (web's "Add" menu): Bank account, Wallet, Card, Person.
class AccountsAddMenu extends StatelessWidget {
  const AccountsAddMenu({super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return PopupMenuButton<VoidCallback>(
      key: const ValueKey('accounts-add-menu'),
      tooltip: 'Add',
      onSelected: (apply) => apply(),
      itemBuilder: (_) => [
        PopupMenuItem(value: () => showAccountForm(context, isBank: true), child: const Text('Bank account')),
        PopupMenuItem(value: () => showAccountForm(context, isBank: false), child: const Text('Wallet')),
        PopupMenuItem(value: () => _sheet(context, const AddCardModal()), child: const Text('Card')),
        PopupMenuItem(value: () => _sheet(context, const HeldLentModal(initialAction: 'hold')), child: const Text('Person')),
      ],
      child: MinTap(
        child: Container(
          width: 32,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: p.indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(17)),
          child: WebIcon(WebIcons.plus, size: 16, color: p.indigo),
        ),
      ),
    );
  }
}

class AccountsScreen extends StatefulWidget {
  const AccountsScreen({super.key});

  @override
  State<AccountsScreen> createState() => _AccountsScreenState();
}

class _AccountsScreenState extends State<AccountsScreen> {
  Map<String, dynamic>? _netWorth;
  Object? _netWorthKey;

  /// Net worth is computed by the server; asked again when the month or a balance changes.
  void _refreshNetWorth(BudgetProvider budget, Object key) {
    if (key == _netWorthKey) return;
    _netWorthKey = key;
    budget.getNetWorth().then((nw) {
      if (mounted && key == _netWorthKey) setState(() => _netWorth = nw);
    });
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.budgetView();
    final p = context.palette;
    final banks = budget.bankAccountModels.map((a) => _rowFor(budget, a)).toList();
    final wallets = budget.walletModels.map((a) => _rowFor(budget, a)).toList();
    _refreshNetWorth(budget, Object.hashAll([budget.currentYear, budget.currentMonth, for (final r in [...banks, ...wallets]) r.balance]));

    final nw = _netWorth;
    int v(String k) => (num.tryParse('${nw?[k]}') ?? 0).round();
    final cash = [...banks, ...wallets].fold<int>(0, (s, r) => s + (r.balance ?? 0));
    String signed(int x) => '${x < 0 ? '−' : ''}${formatCurrency(x.abs())}';
    final parts = nw == null
        ? const <(String, int)>[]
        : [('Bank & wallets', v('cash')), ('Lent', v('lent')), ('Cards', -v('cardsOwed')), ('Held for others', -v('held'))]
            .indexed
            .where((e) => e.$1 == 0 || e.$2.$2 != 0)
            .map((e) => e.$2)
            .toList();

    Widget list(String title, List<_AcctRowData> rows, String addLabel, VoidCallback onAdd) => AcctSection(
          title: title,
          child: rows.isEmpty
              ? AcctEmpty(label: addLabel, onAdd: onAdd)
              : AcctInset(children: [
                  for (final r in rows)
                    AcctRow(
                      key: ValueKey('account-${r.acc.id}'),
                      icon: r.acc.kind == AccountKind.bank ? AcctIconKind.bank : AcctIconKind.wallet,
                      title: r.acc.name.isEmpty ? 'Account' : r.acc.name,
                      tags: [if (r.acc.isPrimary) 'Primary', if (r.isSalary) 'Salary'],
                      caption: r.balance == null
                          ? 'Balance unavailable'
                          : (r.breached ? 'Dips below its keep-at-least' : r.caption),
                      captionColor: r.breached ? p.bad : null,
                      amount: r.balance == null ? '—' : formatCurrency(r.balance!),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => AccountPage(accountId: r.acc.id))),
                    ),
                ]),
        );

    return Scaffold(
      backgroundColor: p.bg,
      body: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(14, 4, 14, MediaQuery.paddingOf(context).bottom + 16), // clears the dock
        children: [
          // Net worth hero (`.acct-hero`)
          Padding(
            padding: const EdgeInsets.only(bottom: 20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              AcctLabel(nw != null ? 'Net worth' : 'Bank & wallets'),
              const SizedBox(height: 4),
              Text(formatCurrency(nw != null ? v('total') : cash),
                  key: const ValueKey('net-worth'),
                  style: AppTypography.inter(fontSize: 32, fontWeight: FontWeight.w700, letterSpacing: -0.64, height: 1.1, color: p.text)),
              if (parts.length > 1) ...[
                const SizedBox(height: 4),
                Text(parts.map((e) => '${e.$1} ${signed(e.$2)}').join(' · '),
                    style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
              ],
            ]),
          ),
          list('Bank accounts', banks, 'Add a bank account', () => showAccountForm(context, isBank: true)),
          list('Wallets', wallets, 'Add a wallet', () => showAccountForm(context, isBank: false)),
          CardsSection(reload: accountPanelsReload),
          HeldLentSection(reload: accountPanelsReload),
        ],
      ),
    );
  }
}

/// A pushed page for one bank or wallet (web's renderAccountPage).
class AccountPage extends StatelessWidget {
  const AccountPage({super.key, required this.accountId});
  final String accountId;

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final p = context.palette;
    final acc = [...budget.bankAccountModels, ...budget.walletModels].where((a) => a.id == accountId).firstOrNull;
    if (acc == null) return Scaffold(backgroundColor: p.bg); // archived while open
    final r = _rowFor(budget, acc);
    final isBank = acc.kind == AccountKind.bank;
    final name = acc.name.isEmpty ? 'Account' : acc.name;
    final sim = budget.accountSimulations[acc.id];
    final daily = sim?.days.map((d) => d.closingBalance).toList() ?? const <int>[];
    final now = DateTime.now();
    final isThisMonth = budget.currentYear == now.year && budget.currentMonth == now.month;
    final ending = sim?.closingBalance ?? acc.openingBalance;
    final recent = budget.transactionModels
        .where((t) => t.isSuccessful && (t.accountId == acc.id || t.destinationAccountId == acc.id))
        .toList()
      ..sort((a, b) => b.date.compareTo(a.date));

    Future<void> archive() async {
      final ok = await confirmDestructive(
        context,
        title: 'Archive $name?',
        message: 'It stops appearing here and in account pickers. Past transactions keep it.',
        confirmLabel: 'Archive',
      );
      if (!ok || !context.mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      try {
        await (isBank ? budget.deleteBankAccount(acc.id) : budget.deleteWallet(acc.id));
      } catch (e) {
        messenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }

    return Scaffold(
      backgroundColor: p.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
          children: [
            Row(children: [
              TextButton(
                key: const ValueKey('account-back'),
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(foregroundColor: p.indigo, padding: const EdgeInsets.symmetric(horizontal: 4), minimumSize: const Size(48, 48)),
                child: Text('‹ Accounts', style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w500, color: p.indigo)),
              ),
            ]),
            Row(children: [
              Expanded(
                child: Text(name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.inter(fontSize: 28, fontWeight: FontWeight.w700, color: p.text)),
              ),
              AcctButton('Transfer',
                  icon: WebIcons.arrowRightLeft,
                  onPressed: () => showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        backgroundColor: Colors.transparent,
                        builder: (_) => UnifiedEntryModal(initialType: EntryType.transfer, initialSourceAccountId: acc.id),
                      )),
              const SizedBox(width: 8),
              PopupMenuButton<VoidCallback>(
                key: ValueKey('account-menu-${acc.id}'),
                tooltip: 'More actions for $name',
                onSelected: (apply) => apply(),
                itemBuilder: (_) => [
                  PopupMenuItem(
                    value: () => showAccountForm(context, isBank: isBank, account: acc),
                    child: Text(isBank ? 'Edit account' : 'Edit wallet'),
                  ),
                  PopupMenuItem(value: archive, child: Text('Archive', style: TextStyle(color: p.bad))),
                ],
                child: const MinTap(child: AcctDots()),
              ),
            ]),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(r.caption, style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
                if (acc.isPrimary) const AcctTag('Primary'),
                if (r.isSalary) const AcctTag('Salary'),
              ]),
            ),
            // Balance hero
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(r.balance == null ? '—' : formatCurrency(r.balance!),
                    style: AppTypography.inter(fontSize: 32, fontWeight: FontWeight.w700, letterSpacing: -0.64, height: 1.1, color: p.text)),
                const SizedBox(height: 4),
                Text('Projected end of month ${formatCurrency(ending)}', style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
                if (daily.length > 1) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 48,
                    width: double.infinity,
                    child: CustomPaint(
                      painter: BalanceSparkline(daily, isThisMonth ? now.day : null, p.borderStrong, p.text),
                    ),
                  ),
                  Text('This month', style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
                ],
              ]),
            ),
            if (r.breached)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(children: [
                  WebIcon(WebIcons.alertTriangle, size: 13, color: p.badInk),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      acc.minimumBalance > 0
                          ? 'Projected to dip below min balance (${formatCurrency(acc.minimumBalance)})'
                          : 'Overdrawn balance (${formatCurrency(r.balance ?? 0)})',
                      style: AppTypography.inter(fontSize: 12, color: p.badInk),
                    ),
                  ),
                ]),
              ),
            Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: AcctInset(children: [
                _kv(p, const Text('Keep at least'), Text(formatCurrency(acc.minimumBalance))),
              ]),
            ),
            AcctSection(
              title: 'Recent activity',
              child: recent.isEmpty
                  ? const AcctEmpty(label: 'Nothing paid in or out this month yet.')
                  : AcctInset(children: [
                      for (final t in recent.take(8))
                        () {
                          final incoming = t.destinationAccountId == acc.id ||
                              (t.accountId == acc.id &&
                                  (t.isIncome || t.origin == TxOrigin.heldIn || t.origin == TxOrigin.lentRepaid));
                          return _kv(
                            p,
                            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text([t.name, t.category].firstWhere((s) => s.isNotEmpty, orElse: () => 'Transaction'),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w500, color: p.text)),
                              const SizedBox(height: 2),
                              Text(formatDisplayDate(t.date), style: AppTypography.inter(fontSize: 12, color: p.textMuted)),
                            ]),
                            Text('${incoming ? '+' : '−'}${formatCurrency(t.amount.abs())}',
                                style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w600, color: incoming ? p.good : p.text)),
                          );
                        }(),
                    ]),
            ),
          ],
        ),
      ),
    );
  }

  /// `.acct-kv`: label left, value right.
  Widget _kv(AppPalette p, Widget left, Widget right) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: DefaultTextStyle.merge(
          style: AppTypography.inter(fontSize: 15, color: p.text),
          child: Row(children: [Expanded(child: left), const SizedBox(width: 12), right]),
        ),
      );
}
