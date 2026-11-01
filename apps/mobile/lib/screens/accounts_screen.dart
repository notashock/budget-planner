import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../modals/transfer_modal.dart';
import '../modals/edit_account_modal.dart';
import '../modals/transaction_detail_modal.dart';

class AccountsScreen extends StatelessWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    final banks = budget.bankAccounts;
    final wallets = budget.wallets;
    final transfers = budget.transfers;

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
                  Text(
                    formatCurrency(budget.simulation?.todaysBalance ?? budget.totalAccountsBalance),
                    style: AppTypography.hero(color: text),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),

            // Bank Accounts Section
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Bank Accounts (${banks.length})',
                  style: AppTypography.cardTitle(color: text),
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
              ...banks.map((b) => _buildAccountTile(context, b, isBank: true, isDark: isDark)),

            const SizedBox(height: 22),

            // Wallets Section
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Wallets & Cash (${wallets.length})',
                  style: AppTypography.cardTitle(color: text),
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
              ...wallets.map((w) => _buildAccountTile(context, w, isBank: false, isDark: isDark)),

            const SizedBox(height: 22),

            // Inter-Account Transfers Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Inter-Account Transfers (${transfers.length})',
                  style: AppTypography.cardTitle(color: text),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.sync_alt, size: 15),
                  label: Text('Transfer', style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600)),
                  onPressed: () {
                    showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      backgroundColor: Colors.transparent,
                      builder: (_) => const TransferModal(),
                    );
                  },
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (transfers.isEmpty)
              _buildEmptyState('No transfers logged this month.', isDark)
            else
              ...transfers.map((t) => _buildTransferTile(context, t, isDark: isDark)),

            const SizedBox(height: 40),
          ],
        ),
      ),
    );
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

  Widget _buildAccountTile(BuildContext context, dynamic acc, {required bool isBank, required bool isDark}) {
    final budget = context.watch<BudgetProvider>();
    final id = (acc['_id'] ?? acc['id']).toString();
    final name = acc['name']?.toString() ?? 'Account';
    final accSim = budget.accountSimulations[id];
    final bal = accSim?.todaysBalance ??
        budget.simulation?.accountBalances[id] ??
        (num.tryParse('${acc['currentBalance'] ?? acc['openingBalance'] ?? 0}') ?? 0).round();
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(
                isBank ? Icons.account_balance : Icons.wallet,
                size: 20,
                color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: AppTypography.inter(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: text,
                    ),
                  ),
                  if (acc['accountNumberMask'] != null && acc['accountNumberMask'].toString().isNotEmpty)
                    Text(
                      '•••• ${acc['accountNumberMask']}',
                      style: AppTypography.mono(fontSize: 11, color: textMuted),
                    ),
                ],
              ),
            ],
          ),
          Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    formatCurrency(bal),
                    style: AppTypography.mono(
                      fontSize: 13.5,
                      fontWeight: FontWeight.bold,
                      color: text,
                    ),
                  ),
                  Text(
                    'Today\'s Balance',
                    style: AppTypography.inter(fontSize: 9.5, color: textMuted),
                  ),
                ],
              ),
              const SizedBox(width: 8),
              IconButton(
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
                    builder: (_) => EditAccountModal(
                      account: Map<String, dynamic>.from(acc as Map),
                      isBank: isBank,
                    ),
                  );
                },
              ),
              const SizedBox(width: 4),
              IconButton(
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.all(4),
                constraints: const BoxConstraints(),
                icon: const Icon(Icons.delete_outline, size: 16),
                color: textMuted,
                onPressed: () {
                  final budget = context.read<BudgetProvider>();
                  if (isBank) {
                    budget.deleteBankAccount(id);
                  } else {
                    budget.deleteWallet(id);
                  }
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTransferTile(BuildContext context, dynamic tr, {required bool isDark}) {
    final trMap = tr is Map ? Map<String, dynamic>.from(tr) : <String, dynamic>{};
    final id = (trMap['_id'] ?? trMap['id']).toString();
    final fromName = trMap['fromAccountName'] ?? 'Source';
    final toName = trMap['toAccountName'] ?? 'Destination';
    final amt = (num.tryParse('${trMap['amount'] ?? 0}') ?? 0).round();
    final day = trMap['day'] ?? 1;

    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textMuted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () {
          TransactionDetailModal.show(context, transactionData: {
            ...trMap,
            'isTransfer': true,
            'type': 'transfer',
            'amount': amt,
            'transferAmount': amt,
            'title': 'Transfer: $fromName → $toName',
          });
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
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$fromName → $toName',
                    style: AppTypography.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: text,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Day $day • ${trMap['description'] ?? trMap['note'] ?? 'Transfer'}',
                    style: AppTypography.inter(fontSize: 11, color: textMuted),
                  ),
                ],
              ),
              Row(
                children: [
                  Text(
                    formatCurrency(amt),
                    style: AppTypography.mono(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppColors.amber,
                    ),
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(),
                    icon: const Icon(Icons.delete_outline, size: 16),
                    color: textMuted,
                    onPressed: () => context.read<BudgetProvider>().deleteTransfer(id),
                  ),
                ],
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

    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text('Add ${isBank ? 'Bank Account' : 'Wallet'}', style: AppTypography.cardTitle()),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameCtrl, decoration: InputDecoration(labelText: '${isBank ? 'Bank' : 'Wallet'} Name')),
            const SizedBox(height: 8),
            TextField(controller: balCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Opening Balance (₹)')),
            if (isBank) ...[
              const SizedBox(height: 8),
              TextField(controller: maskCtrl, decoration: const InputDecoration(labelText: 'Last 4 Digits (Optional)')),
            ],
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final budget = context.read<BudgetProvider>();
              final bal = toMinorUnits(num.tryParse(balCtrl.text) ?? 0);
              if (isBank) {
                await budget.addBankAccount({
                  'name': nameCtrl.text.trim(),
                  'openingBalance': bal,
                  'accountNumberMask': maskCtrl.text.trim(),
                });
              } else {
                await budget.addWallet({
                  'name': nameCtrl.text.trim(),
                  'openingBalance': bal,
                });
              }
              if (dialogCtx.mounted) Navigator.pop(dialogCtx);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }
}
