import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../models/account.dart';
import '../models/transfer.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../modals/unified_entry_modal.dart';
import '../modals/edit_account_modal.dart';
import '../modals/transaction_detail_modal.dart';
import '../widgets/confirm_dialog.dart';
import '../widgets/held_lent_section.dart';
import '../widgets/cards_section.dart';

class AccountsScreen extends StatelessWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    final banks = budget.bankAccountModels;
    final wallets = budget.walletModels;
    final transfers = budget.transferModels;

    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Net Total Accounts Balance Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'TOTAL LIQUID TODAY BALANCE',
                    style: AppTypography.sectionHeader(color: textMuted),
                  ),
                  const SizedBox(height: 6),
                  Builder(builder: (context) {
                    final today = budget.simulation?.todaysBalance ?? budget.totalAccountsBalance;
                    if (today == null) {
                      return Text(
                        'Balance unavailable — pull to refresh on the Plan tab',
                        style: AppTypography.inter(fontSize: 13, color: textMuted),
                      );
                    }
                    return Text(formatCurrency(today), style: AppTypography.hero(color: text));
                  }),
                  if ((budget.simulation?.heldReserve ?? 0) > 0) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Includes ${formatCurrency(budget.simulation!.heldReserve)} you hold for others',
                      style: TextStyle(fontSize: 12, color: textMuted),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 22),

            // Bank Accounts Section
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    'Bank Accounts (${banks.length})',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.cardTitle(color: text),
                  ),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.add, size: 15),
                  label: Text('Add Bank', style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600)),
                  onPressed: () => _showAddAccountDialog(context, isBank: true),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (banks.isEmpty)
              _buildEmptyState('No bank accounts configured.', isDark)
            else
              ...banks.map((b) => _buildAccountTile(context, budget, b, isDark: isDark)),

            const SizedBox(height: 22),

            // Wallets Section
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    'Wallets & Cash (${wallets.length})',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.cardTitle(color: text),
                  ),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.add, size: 15),
                  label: Text('Add Wallet', style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600)),
                  onPressed: () => _showAddAccountDialog(context, isBank: false),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (wallets.isEmpty)
              _buildEmptyState('No digital wallets or cash accounts.', isDark)
            else
              ...wallets.map((w) => _buildAccountTile(context, budget, w, isDark: isDark)),

            const SizedBox(height: 22),

            // Inter-Account Transfers Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    'Inter-Account Transfers (${transfers.length})',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.cardTitle(color: text),
                  ),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.sync_alt, size: 15),
                  label: Text('Transfer', style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600)),
                  onPressed: () {
                    showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      backgroundColor: Colors.transparent,
                      // Transfers use the entry sheet's Move tab (one transfer form)
                      builder: (_) => const UnifiedEntryModal(initialType: EntryType.transfer),
                    );
                  },
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (transfers.isEmpty)
              _buildEmptyState('No transfers logged this month.', isDark)
            else
              ...transfers.map((t) => _buildTransferTile(context, budget, t, isDark: isDark)),

            const SizedBox(height: 22),
            const CardsSection(),

            const SizedBox(height: 22),
            const HeldLentSection(),

            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  static Future<void> _run(BuildContext context, Future<void> Function() action) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  Widget _buildEmptyState(String text, bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(
        text,
        style: AppTypography.inter(
          fontSize: 12.5,
          color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted,
        ),
      ),
    );
  }

  Widget _buildAccountTile(BuildContext context, BudgetProvider budget, Account acc, {required bool isDark}) {
    final isBank = acc.kind == AccountKind.bank;
    final name = acc.name.isEmpty ? 'Account' : acc.name;
    // Today's balance from the plan, else the server's current balance.
    // Never the opening balance: that is not today's.
    final bal = budget.accountSimulations[acc.id]?.todaysBalance ??
        budget.simulation?.accountBalances[acc.id] ??
        acc.currentBalance;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final mask = acc.accountNumberMasked;

    return Container(
      key: ValueKey('account-${acc.id}'),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: border),
      ),
      child: Row(
        children: [
          Icon(
            isBank ? Icons.account_balance : Icons.wallet,
            size: 20,
            color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.inter(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: text,
                  ),
                ),
                if (mask != null)
                  Text(
                    '•••• $mask',
                    style: AppTypography.mono(fontSize: 11, color: textMuted),
                  ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                bal == null ? '—' : formatCurrency(bal),
                style: AppTypography.mono(
                  fontSize: 13.5,
                  fontWeight: FontWeight.bold,
                  color: text,
                ),
              ),
              Text(
                bal == null ? 'Balance unavailable' : 'Today\'s Balance',
                style: AppTypography.inter(fontSize: 9.5, color: textMuted),
              ),
            ],
          ),
          const SizedBox(width: 8),
          IconButton(
            tooltip: 'Edit $name',
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.all(4),
            constraints: const BoxConstraints(),
            icon: const Icon(Icons.edit_outlined, size: 16),
            color: textMuted,
            onPressed: () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => EditAccountModal(account: acc, isBank: isBank),
              );
            },
          ),
          const SizedBox(width: 4),
          IconButton(
            key: ValueKey('delete-account-${acc.id}'),
            tooltip: 'Archive $name',
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.all(4),
            constraints: const BoxConstraints(),
            icon: const Icon(Icons.delete_outline, size: 16),
            color: textMuted,
            onPressed: () async {
              // DELETE /accounts/:id archives the account (accountService.archiveAccount).
              final ok = await confirmDestructive(
                context,
                title: 'Archive $name?',
                message: 'It stops appearing here and in account pickers. Past transactions keep it.',
                confirmLabel: 'Archive',
              );
              if (!ok || !context.mounted) return;
              await _run(context, () => isBank ? budget.deleteBankAccount(acc.id) : budget.deleteWallet(acc.id));
            },
          ),
        ],
      ),
    );
  }

  Widget _buildTransferTile(BuildContext context, BudgetProvider budget, Transfer tr, {required bool isDark}) {
    // The server sends account ids only: names come from the loaded accounts and cards.
    final fromName = budget.accountName(tr.sourceAccountId) ?? 'Removed account';
    final toName = budget.accountName(tr.destinationAccountId) ?? 'Removed account';

    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    return Material(
      key: ValueKey('transfer-${tr.id}'),
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () {
          TransactionDetailModal.show(context, transfer: tr);
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$fromName → $toName',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: text,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Day ${tr.day} • ${tr.note.isEmpty ? 'Transfer' : tr.note}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.inter(fontSize: 11, color: textMuted),
                    ),
                  ],
                ),
              ),
              Text(
                formatCurrency(tr.amount),
                style: AppTypography.mono(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: AppColors.amber,
                ),
              ),
              const SizedBox(width: 4),
              IconButton(
                key: ValueKey('delete-transfer-${tr.id}'),
                tooltip: 'Delete transfer',
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.all(4),
                constraints: const BoxConstraints(),
                icon: const Icon(Icons.delete_outline, size: 16),
                color: textMuted,
                onPressed: () async {
                  final ok = await confirmDestructive(
                    context,
                    title: 'Delete this transfer?',
                    message: 'Both account balances will be recalculated.',
                  );
                  if (!ok || !context.mounted) return;
                  await _run(context, () => budget.deleteTransfer(tr.id));
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showAddAccountDialog(BuildContext context, {required bool isBank}) {
    final nameCtrl = TextEditingController();
    final balCtrl = TextEditingController(text: '0');
    final maskCtrl = TextEditingController();
    String? nameError;

    showDialog(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (dialogCtx, setDialogState) => AlertDialog(
          title: Text('Add ${isBank ? 'Bank Account' : 'Wallet'}', style: AppTypography.cardTitle()),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                key: const ValueKey('add-account-name'),
                controller: nameCtrl,
                decoration: InputDecoration(labelText: '${isBank ? 'Bank' : 'Wallet'} Name', errorText: nameError),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: balCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Opening Balance (₹)'),
              ),
              if (isBank) ...[
                const SizedBox(height: 8),
                TextField(
                  key: const ValueKey('add-account-mask'),
                  controller: maskCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 4,
                  decoration: const InputDecoration(labelText: 'Last 4 Digits (Optional)'),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('Cancel')),
            ElevatedButton(
              key: const ValueKey('add-account-submit'),
              onPressed: () async {
                final name = nameCtrl.text.trim();
                if (name.isEmpty) {
                  setDialogState(() => nameError = 'Enter a name');
                  return;
                }
                final budget = context.read<BudgetProvider>();
                final messenger = ScaffoldMessenger.of(context);
                final bal = toMinorUnits(num.tryParse(balCtrl.text) ?? 0);
                try {
                  if (isBank) {
                    await budget.addBankAccount({
                      'name': name,
                      'openingBalance': bal,
                      // The server's field name; it ignored the old 'accountNumberMask'.
                      'accountNumberMasked': maskCtrl.text.trim(),
                    });
                  } else {
                    await budget.addWallet({
                      'name': name,
                      'openingBalance': bal,
                    });
                  }
                  if (dialogCtx.mounted) Navigator.pop(dialogCtx);
                } catch (e) {
                  messenger.showSnackBar(SnackBar(content: Text('Could not add: $e')));
                }
              },
              child: const Text('Add'),
            ),
          ],
        ),
      ),
    );
  }
}
