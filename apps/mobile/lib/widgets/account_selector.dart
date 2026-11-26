import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../engine/engine.dart';
import '../models/account.dart';

/// Segmented Bank Account / Wallet Selector for Mobile Modals
class AccountSelector extends StatelessWidget {
  final String label;
  final String accountType; // 'bank' | 'wallet'
  final String? selectedAccountId;
  final List<Account> bankAccounts;
  final List<Account> wallets;
  final void Function(String newType, String? newAccountId) onChanged;
  final bool isRequired;
  /// Credit cards, offered only where spending can go on a card (ADR 0070)
  final List<Account> creditCards;

  const AccountSelector({
    super.key,
    this.label = 'Payment Account',
    required this.accountType,
    required this.selectedAccountId,
    required this.bankAccounts,
    required this.wallets,
    required this.onChanged,
    this.isRequired = false,
    this.creditCards = const [],
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isCard = accountType == 'credit_card';
    final isBank = accountType == 'bank';
    final isWallet = !isBank && !isCard;
    final hasBanks = bankAccounts.isNotEmpty;
    final hasWallets = wallets.isNotEmpty;

    final currentAccounts = isCard ? creditCards : (isBank ? bankAccounts : wallets);
    final validAccountId = currentAccounts.any((a) => a.id == selectedAccountId)
        ? selectedAccountId
        : (currentAccounts.isNotEmpty ? currentAccounts.first.id : null);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Wrap, not Row: on narrow phones the Bank / Wallet / Card switch moves
        // under the label instead of overflowing
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 8,
          runSpacing: 6,
          children: [
            Text(
              label + (isRequired ? ' *' : ''),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
              ),
            ),
            // Segmented toggle: [ Bank ] [ Wallet ]
            Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildTypeTab(
                    title: 'Bank',
                    icon: Icons.account_balance_outlined,
                    isSelected: isBank,
                    isDark: isDark,
                    onTap: () {
                      if (!isBank) {
                        final defaultId = hasBanks ? bankAccounts.first.id : null;
                        onChanged('bank', defaultId);
                      }
                    },
                  ),
                  const SizedBox(width: 2),
                  _buildTypeTab(
                    title: 'Wallet',
                    icon: Icons.account_balance_wallet_outlined,
                    isSelected: isWallet,
                    isDark: isDark,
                    onTap: () {
                      if (!isWallet) {
                        final defaultId = hasWallets ? wallets.first.id : null;
                        onChanged('wallet', defaultId);
                      }
                    },
                  ),
                  if (creditCards.isNotEmpty) ...[
                    const SizedBox(width: 2),
                    _buildTypeTab(
                      title: 'Card',
                      icon: Icons.credit_card,
                      isSelected: isCard,
                      isDark: isDark,
                      onTap: () {
                        if (!isCard) {
                          onChanged('credit_card', creditCards.first.id);
                        }
                      },
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),

        // Account Dropdown or Empty state
        if (isBank && !hasBanks)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
            ),
            child: Row(
              children: [
                Icon(Icons.account_balance_outlined, size: 16, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'No bank accounts configured',
                    style: TextStyle(fontSize: 12, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted),
                  ),
                ),
              ],
            ),
          )
        else if (isWallet && !hasWallets)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
            ),
            child: Row(
              children: [
                Icon(Icons.account_balance_wallet_outlined, size: 16, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'No wallets configured',
                    style: TextStyle(fontSize: 12, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted),
                  ),
                ),
              ],
            ),
          )
        else
          DropdownButtonFormField<String>(
            borderRadius: BorderRadius.circular(8), // web .app-dropdown-menu
            key: ValueKey('$accountType-$validAccountId'),
            initialValue: validAccountId,
            decoration: InputDecoration(
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              prefixIcon: Icon(
                isCard ? Icons.credit_card : (isBank ? Icons.account_balance_outlined : Icons.account_balance_wallet_outlined),
                size: 16,
                color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
              ),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            ),
            isExpanded: true,
            items: currentAccounts.map<DropdownMenuItem<String>>((a) {
              final id = a.id;
              final name = a.name.isEmpty ? 'Account' : a.name;
              // Today's balance (or what a card owes); never the opening balance.
              final owed = a.owed;
              final bal = isCard
                  ? (owed == null ? '' : 'owes ${formatCurrency(owed)}')
                  : (a.currentBalance == null ? '' : formatCurrency(a.currentBalance!));
              final subtitle = isBank
                  ? (a.accountNumberMasked != null ? '••${a.accountNumberMasked}' : '')
                  : (a.walletType ?? '');

              return DropdownMenuItem<String>(
                value: id,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted,
                        ),
                      ),
                    ],
                    const SizedBox(width: 8),
                    Text(
                      bal,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'monospace',
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
            onChanged: (newId) => onChanged(accountType, newId),
          ),
      ],
    );
  }

  Widget _buildTypeTab({
    required String title,
    required IconData icon,
    required bool isSelected,
    required bool isDark,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: isSelected
              ? (isDark ? AppColors.darkText : AppColors.lightText)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 13,
              color: isSelected
                  ? (isDark ? AppColors.darkBg : AppColors.lightBg)
                  : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
            ),
            const SizedBox(width: 4),
            Text(
              title,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: isSelected
                    ? (isDark ? AppColors.darkBg : AppColors.lightBg)
                    : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
