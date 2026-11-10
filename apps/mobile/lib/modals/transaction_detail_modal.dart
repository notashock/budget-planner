import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../engine/currency.dart';
import '../engine/simulator.dart';
import '../providers/budget_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import 'mark_paid_modal.dart';

class TransactionDetailModal extends StatelessWidget {
  final Map<String, dynamic>? transactionData;
  final TimelineEvent? timelineEvent;
  final String currencySymbol;

  const TransactionDetailModal({
    super.key,
    this.transactionData,
    this.timelineEvent,
    this.currencySymbol = '₹',
  });

  static void show(
    BuildContext context, {
    Map<String, dynamic>? transactionData,
    TimelineEvent? timelineEvent,
    String currencySymbol = '₹',
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => TransactionDetailModal(
        transactionData: transactionData,
        timelineEvent: timelineEvent,
        currencySymbol: currencySymbol,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    // Resolve unified properties across either TimelineEvent or Map
    final isFromEvent = timelineEvent != null;
    final Map<String, dynamic> raw = isFromEvent
        ? timelineEvent!.raw
        : (transactionData ?? {});

    final id = isFromEvent
        ? (timelineEvent!.id.isNotEmpty ? timelineEvent!.id : (raw['_id'] ?? raw['id'])?.toString())
        : (raw['_id'] ?? raw['id'] ?? raw['itemId'] ?? raw['transactionId'])?.toString();

    final String title = isFromEvent
        ? ((timelineEvent!.description != null && timelineEvent!.description!.isNotEmpty)
            ? timelineEvent!.description!
            : timelineEvent!.name)
        : (raw['title'] ?? raw['name'] ?? raw['description'] ?? raw['note'] ?? 'Transaction').toString();

    final num amountNum = isFromEvent
        ? timelineEvent!.amount
        : (num.tryParse('${raw['amount']}') ?? 0);

    final bool isTransfer = (raw['type'] == 'transfer' || raw['itemType'] == 'transfer' || raw['isTransfer'] == true);
    final num trAmt = (num.tryParse('${raw['transferAmount']}') ?? 0);
    final num effectiveAmt = (isTransfer && amountNum == 0 && trAmt > 0) ? trAmt : amountNum.abs();

    final bool isIncome = !isTransfer && (isFromEvent
        ? timelineEvent!.amount > 0
        : (raw['isIncome'] == true || raw['type'] == 'income'));

    final int day = isFromEvent
        ? timelineEvent!.day
        : (num.tryParse('${raw['day']}') ?? 1).toInt();

    final String? dateStr = isFromEvent
        ? (timelineEvent!.date.isNotEmpty ? timelineEvent!.date : null)
        : raw['date']?.toString();

    final String category = isFromEvent
        ? (timelineEvent!.category ?? 'General')
        : (raw['category'] ?? raw['tag'] ?? (isIncome ? 'Income' : 'General')).toString();

    final bool isPaid = isFromEvent
        ? timelineEvent!.isPaid
        : (raw['status'] == 'successful' || raw['isActual'] == true || raw['isPaid'] == true);

    final bool isPlanned = !isPaid && raw['isScheduledSalary'] != true;

    // Date formatting (Force calendar date format instead of day xx)
    String formattedDateLabel = '';
    final activeYear = budget.currentYear;
    final activeMonth = budget.currentMonth;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (dateStr != null && dateStr.isNotEmpty) {
      final parts = dateStr.split('-');
      if (parts.length >= 3) {
        final y = int.tryParse(parts[0]) ?? activeYear;
        final m = int.tryParse(parts[1]) ?? activeMonth;
        final d = int.tryParse(parts[2]) ?? day;
        final mName = (m >= 1 && m <= 12) ? months[m - 1] : '$m';
        formattedDateLabel = '$d $mName $y';
      } else {
        formattedDateLabel = dateStr;
      }
    } else {
      final mName = (activeMonth >= 1 && activeMonth <= 12) ? months[activeMonth - 1] : '$activeMonth';
      formattedDateLabel = '$day $mName $activeYear';
    }

    // Resolve transfer source & destination accounts
    String? sourceAccountLabel;
    String? destAccountLabel;
    String accountLabel = 'All Accounts / Primary';
    final accounts = budget.allAccounts;

    if (isTransfer) {
      final sId = (raw['sourceBankAccountId'] ?? raw['sourceWalletId'] ?? raw['sourceAccountId'] ?? raw['fromAccountId'])?.toString();
      final dId = (raw['destinationBankAccountId'] ?? raw['destinationWalletId'] ?? raw['destinationAccountId'] ?? raw['toAccountId'])?.toString();

      sourceAccountLabel = raw['fromAccountName']?.toString();
      destAccountLabel = raw['toAccountName']?.toString();

      if (sourceAccountLabel == null || sourceAccountLabel.isEmpty) {
        for (final a in accounts) {
          if ((a['_id'] ?? a['id'])?.toString() == sId) {
            sourceAccountLabel = '${a['name']} (${a['type'] == 'bank' ? 'Bank' : 'Wallet'})';
            break;
          }
        }
      }
      if (destAccountLabel == null || destAccountLabel.isEmpty) {
        for (final a in accounts) {
          if ((a['_id'] ?? a['id'])?.toString() == dId) {
            destAccountLabel = '${a['name']} (${a['type'] == 'bank' ? 'Bank' : 'Wallet'})';
            break;
          }
        }
      }
      sourceAccountLabel ??= 'Source Account';
      destAccountLabel ??= 'Destination Account';
    } else {
      final accId = (raw['bankAccountId'] ?? raw['walletId'] ?? raw['accountId'] ?? raw['sourceBankAccountId'] ?? raw['sourceWalletId'])?.toString();
      if (accId != null) {
        for (final a in accounts) {
          if ((a['_id'] ?? a['id'])?.toString() == accId) {
            final isBank = a['type'] == 'bank';
            accountLabel = '${a['name']} (${isBank ? 'Bank' : 'Wallet'})';
            break;
          }
        }
      }
    }

    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        border: Border.all(color: border, width: 1),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Drag Handle
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Top Status Badge & Close
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
                  decoration: BoxDecoration(
                    color: isTransfer
                        ? AppColors.amber.withAlpha(25)
                        : (isIncome ? AppColors.green.withAlpha(25) : AppColors.red.withAlpha(20)),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: isTransfer
                          ? AppColors.amber.withAlpha(90)
                          : (isIncome ? AppColors.green.withAlpha(90) : AppColors.red.withAlpha(80)),
                      width: 0.8,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isTransfer ? Icons.swap_horiz : (isIncome ? Icons.arrow_downward : Icons.arrow_upward),
                        size: 13,
                        color: isTransfer ? AppColors.amber : (isIncome ? AppColors.green : AppColors.red),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        isTransfer ? 'INTER-ACCOUNT TRANSFER' : (isIncome ? 'INCOME INFLOW' : 'EXPENSE OUTFLOW'),
                        style: AppTypography.inter(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                          color: isTransfer ? AppColors.amber : (isIncome ? AppColors.green : AppColors.red),
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Large Amount Display
            Text(
              '${isIncome ? '+' : (isTransfer ? '' : '-')}${formatCurrency(effectiveAmt, symbol: currencySymbol)}',
              style: AppTypography.mono(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: isTransfer ? AppColors.amber : (isIncome ? AppColors.green : (isDark ? AppColors.darkText : AppColors.lightText)),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              title,
              style: AppTypography.inter(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: text,
              ),
            ),
            const SizedBox(height: 16),
            Divider(color: border, height: 1),
            const SizedBox(height: 14),

            // Metadata Grid / List
            _buildDetailRow(
              isIncome ? 'Credit Date' : 'Date',
              formattedDateLabel,
              text,
              textSecondary,
            ),
            const SizedBox(height: 10),
            if (isTransfer) ...[
              _buildDetailRow('Source Account', sourceAccountLabel ?? 'Source', text, textSecondary),
              const SizedBox(height: 10),
              _buildDetailRow('Destination Account', destAccountLabel ?? 'Destination', text, textSecondary),
              const SizedBox(height: 10),
            ] else ...[
              _buildDetailRow('Category', category, text, textSecondary),
              const SizedBox(height: 10),
              _buildDetailRow('Account', accountLabel, text, textSecondary),
              const SizedBox(height: 10),
            ],
            _buildDetailRow(
              'Status',
              isPaid ? 'Successful (Paid)' : 'Planned Commitment',
              isPaid ? AppColors.green : AppColors.amber,
              textSecondary,
            ),

            if (isFromEvent && timelineEvent!.runningBalance != 0) ...[
              const SizedBox(height: 10),
              _buildDetailRow(
                'Running Balance',
                formatCurrency(timelineEvent!.runningBalance, symbol: currencySymbol),
                text,
                textSecondary,
              ),
            ],

            const SizedBox(height: 22),

            // Actions (Mark Paid / Cancel / Delete)
            Row(
              children: [
                if (isPlanned && id != null) ...[
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.green,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      icon: const Icon(Icons.check_circle_outline, size: 16),
                      label: Text('Mark as Paid', style: AppTypography.inter(fontWeight: FontWeight.w700)),
                      onPressed: () {
                        Navigator.pop(context);
                        showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: Colors.transparent,
                          builder: (_) => MarkPaidModal(transaction: raw),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                ],

                // Delete / Cancel Action
                if (id != null && raw['isScheduledSalary'] != true)
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.red.withAlpha(25),
                        foregroundColor: AppColors.red,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                          side: BorderSide(color: AppColors.red.withAlpha(80), width: 1),
                        ),
                      ),
                      icon: const Icon(Icons.delete_outline, size: 16),
                      label: Text(
                        isPlanned ? 'Cancel Commitment' : 'Delete Transaction',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      onPressed: () async {
                        final navigator = Navigator.of(context);
                        final scaffoldMessenger = ScaffoldMessenger.of(context);
                        try {
                          if (isTransfer) {
                            await budget.deleteTransfer(id);
                          } else if (isPlanned) {
                            await budget.cancelTransaction(id);
                          } else {
                            await budget.deleteTransaction(id);
                          }
                          navigator.pop();
                        } catch (e) {
                          scaffoldMessenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
                        }
                      },
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value, Color valueColor, Color labelColor) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w500, color: labelColor)),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, color: valueColor),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
