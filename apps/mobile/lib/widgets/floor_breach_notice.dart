import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../engine/currency.dart';
import '../providers/budget_provider.dart';
import '../theme/app_colors.dart';

/// Result of checking an outflow against an account's safety floor.
class FloorCheck {
  final String accountName;
  final int minimumBalance;
  final int balanceAfter;
  const FloorCheck({required this.accountName, required this.minimumBalance, required this.balanceAfter});
  bool get breaches => balanceAfter < minimumBalance;
}

int _minor(dynamic v) => (num.tryParse('${v ?? 0}') ?? 0).round();

/// Checks an outflow of [amount] (minor units) from [account]. Uses the server's
/// per-account balance when known ([simulatedBalance]); held money is not the
/// user's to spend (ADR 0069), so it is taken off first. Returns null when there
/// is nothing to check (no account, no floor, no outflow).
FloorCheck? checkFloor(Map<String, dynamic>? account, int amount, {int? simulatedBalance, int heldForOthers = 0}) {
  if (account == null || amount <= 0) return null;
  final floor = _minor(account['minimumBalance'] ?? account['safetyFloor']);
  if (floor <= 0) return null;
  final balance = simulatedBalance ??
      _minor(account['currentBalance'] ?? account['balance'] ?? account['openingBalance']);
  return FloorCheck(
    accountName: account['name']?.toString() ?? 'This account',
    minimumBalance: floor,
    balanceAfter: balance - heldForOthers - amount,
  );
}

/// Live safety-floor warning under an amount field. Rebuilds as the amount changes.
/// Shows nothing unless the outflow would take the account below its floor.
class FloorBreachNotice extends StatelessWidget {
  final TextEditingController amountController;
  final String? accountId;

  /// Amount to check when it isn't the controller's value (e.g. a preset choice).
  final int? fixedAmount;

  /// Also show a neutral "After this: …" line when the floor is not breached.
  final bool showWhenSafe;

  const FloorBreachNotice({
    super.key,
    required this.amountController,
    required this.accountId,
    this.fixedAmount,
    this.showWhenSafe = false,
  });

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: amountController,
      builder: (context, value, _) {
        final budget = context.watch<BudgetProvider>();
        Map<String, dynamic>? account;
        for (final a in [...budget.bankAccounts, ...budget.wallets]) {
          if (a is Map && (a['_id'] ?? a['id'])?.toString() == accountId) {
            account = Map<String, dynamic>.from(a);
            break;
          }
        }
        final amount = fixedAmount ?? toMinorUnits(num.tryParse(value.text) ?? 0);
        final sim = accountId == null ? null : budget.getAccountSimulation(accountId!);
        final check = checkFloor(account, amount, simulatedBalance: sim?.todaysBalance);
        if (check == null || !check.breaches) {
          if (!showWhenSafe || account == null || amount <= 0) return const SizedBox.shrink();
          final balance = sim?.todaysBalance ??
              _minor(account['currentBalance'] ?? account['balance'] ?? account['openingBalance']);
          final after = balance - amount;
          final margin = check != null ? check.balanceAfter - check.minimumBalance : null;
          final isDark = Theme.of(context).brightness == Brightness.dark;
          return Container(
            key: const ValueKey('consequence-line'),
            width: double.infinity,
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurfaceSubtle : AppColors.lightSurfaceSubtle,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'After this: ${account['name'] ?? 'Account'} ${formatCurrency(after)}'
              '${margin != null ? ' · ${formatCurrency(margin)} above floor' : ''}',
              style: TextStyle(fontSize: 12, color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
            ),
          );
        }
        return Container(
          key: const ValueKey('floor-breach-notice'),
          margin: const EdgeInsets.only(top: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.red.withAlpha(20),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.red.withAlpha(70)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.warning_amber_rounded, size: 16, color: AppColors.red),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'This takes ${check.accountName} to ${formatCurrency(check.balanceAfter)}, '
                  '${formatCurrency(check.minimumBalance - check.balanceAfter)} below your '
                  '${formatCurrency(check.minimumBalance)} safety floor.',
                  style: const TextStyle(fontSize: 13, height: 1.35),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
