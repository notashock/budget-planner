import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../engine/currency.dart';
import '../models/account.dart';
import '../models/simulation.dart';
import '../models/transaction.dart';
import '../models/transfer.dart';
import '../providers/budget_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../widgets/confirm_dialog.dart';
import 'mark_paid_modal.dart';
import 'unified_entry_modal.dart';

/// Details of one money movement, with what can be done to it.
///
/// Opened with a [transaction] (Transactions tab), a [transfer] (Accounts tab)
/// or a [timelineEvent] (Plan timeline). A timeline event is resolved to its
/// transaction through `transactionId`, so it gets the same labels and actions;
/// only events with no transaction behind them (the planned salary) are shown
/// from the event alone, read-only.
class TransactionDetailModal extends StatelessWidget {
  final Transaction? transaction;
  final Transfer? transfer;
  final TimelineEvent? timelineEvent;
  final String currencySymbol;

  const TransactionDetailModal({
    super.key,
    this.transaction,
    this.transfer,
    this.timelineEvent,
    this.currencySymbol = '₹',
  });

  static void show(
    BuildContext context, {
    Transaction? transaction,
    Transfer? transfer,
    TimelineEvent? timelineEvent,
    String currencySymbol = '₹',
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => TransactionDetailModal(
        transaction: transaction,
        transfer: transfer,
        timelineEvent: timelineEvent,
        currencySymbol: currencySymbol,
      ),
    );
  }

  static String _accountLabel(Account? a) {
    if (a == null) return 'No account';
    final kind = switch (a.kind) {
      AccountKind.bank => 'Bank',
      AccountKind.wallet => 'Wallet',
      AccountKind.cash => 'Cash',
      AccountKind.creditCard => 'Card',
    };
    return '${a.name} ($kind)';
  }

  static String _dateLabel(String iso) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final parts = iso.split('-');
    if (parts.length != 3) return iso;
    final m = int.tryParse(parts[1]) ?? 0;
    return '${int.tryParse(parts[2]) ?? parts[2]} ${m >= 1 && m <= 12 ? months[m - 1] : m} ${parts[0]}';
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final event = timelineEvent;
    Transaction? tx = transaction;
    if (tx == null && event?.transactionId != null) {
      for (final t in budget.transactionModels) {
        if (t.id == event!.transactionId) {
          tx = t;
          break;
        }
      }
    }
    final view = tx != null
        ? _DetailView.ofTransaction(tx, budget)
        : transfer != null
            ? _DetailView.ofTransfer(transfer!, budget)
            : _DetailView.ofEvent(event!);
    return _build(context, budget, view, runningBalance: event?.runningBalance);
  }

  Widget _build(BuildContext context, BudgetProvider budget, _DetailView v, {int? runningBalance}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final accent = switch (v.flow) {
      MoneyFlow.moved => AppColors.amber,
      MoneyFlow.moneyIn => AppColors.green,
      MoneyFlow.moneyOut => AppColors.red,
    };
    final sign = switch (v.flow) {
      MoneyFlow.moved => '',
      MoneyFlow.moneyIn => '+',
      MoneyFlow.moneyOut => '-',
    };

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
                decoration: BoxDecoration(color: border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),

            // Top Status Badge & Close
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Container(
                    key: const ValueKey('detail-kind'),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
                    decoration: BoxDecoration(
                      color: accent.withAlpha(25),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: accent.withAlpha(90), width: 0.8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          v.flow == MoneyFlow.moved
                              ? Icons.swap_horiz
                              : (v.flow == MoneyFlow.moneyIn ? Icons.arrow_downward : Icons.arrow_upward),
                          size: 13,
                          color: accent,
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            v.kindLabel,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.inter(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                              color: accent,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
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
              '$sign${formatCurrency(v.amount, symbol: currencySymbol)}',
              key: const ValueKey('detail-amount'),
              style: AppTypography.mono(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: v.flow == MoneyFlow.moneyOut ? (isDark ? AppColors.darkText : AppColors.lightText) : accent,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              v.title,
              style: AppTypography.inter(fontSize: 16, fontWeight: FontWeight.w600, color: text),
            ),
            const SizedBox(height: 16),
            Divider(color: border, height: 1),
            const SizedBox(height: 14),

            _buildDetailRow(v.flow == MoneyFlow.moneyIn ? 'Credit Date' : 'Date', v.dateLabel, text, textSecondary),
            const SizedBox(height: 10),
            if (v.flow == MoneyFlow.moved) ...[
              _buildDetailRow('Source Account', v.sourceLabel, text, textSecondary),
              const SizedBox(height: 10),
              _buildDetailRow('Destination Account', v.destinationLabel, text, textSecondary),
              const SizedBox(height: 10),
            ] else ...[
              _buildDetailRow('Category', v.category, text, textSecondary),
              const SizedBox(height: 10),
              _buildDetailRow('Account', v.accountLabel, text, textSecondary),
              const SizedBox(height: 10),
            ],
            _buildDetailRow('Status', v.statusLabel, v.isPlanned ? AppColors.amber : AppColors.green, textSecondary),

            if (runningBalance != null && runningBalance != 0) ...[
              const SizedBox(height: 10),
              _buildDetailRow('Running Balance', formatCurrency(runningBalance, symbol: currencySymbol), text, textSecondary),
            ],

            const SizedBox(height: 22),

            // Edit (spends, refunds, income and planned bills; transfers and held/lent
            // money are deleted and logged again instead)
            if (v.editable != null) ...[
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const ValueKey('edit-transaction'),
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('Edit'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
                  onPressed: () {
                    final navigator = Navigator.of(context);
                    final rootContext = navigator.context;
                    final t = v.editable!;
                    navigator.pop();
                    showModalBottomSheet(
                      context: rootContext,
                      isScrollControlled: true,
                      backgroundColor: Colors.transparent,
                      builder: (_) => UnifiedEntryModal(
                        initialType: t.isPlanned
                            ? EntryType.item
                            : (t.kind == TxKind.income ? EntryType.income : EntryType.transaction),
                        initialTransaction: t,
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 8),
            ],

            // Actions (Mark Paid / Cancel / Delete)
            Row(
              children: [
                if (v.payable != null) ...[
                  Expanded(
                    child: ElevatedButton.icon(
                      key: const ValueKey('detail-mark-paid'),
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
                          builder: (_) => MarkPaidModal(transaction: v.payable!),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                ],

                if (v.remove != null)
                  Expanded(
                    child: ElevatedButton.icon(
                      key: const ValueKey('detail-remove'),
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
                        v.isPlanned ? 'Cancel Commitment' : 'Delete Transaction',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      onPressed: budget.isSaving
                          ? null
                          : () async {
                              final navigator = Navigator.of(context);
                              final scaffoldMessenger = ScaffoldMessenger.of(context);
                              final confirmed = await confirmDestructive(
                                context,
                                title: v.isPlanned
                                    ? 'Cancel this commitment?'
                                    : (v.flow == MoneyFlow.moved ? 'Delete this transfer?' : 'Delete this transaction?'),
                                message: v.isPlanned
                                    ? 'It will be removed from your plan.'
                                    : 'Account balances will be recalculated. This can\'t be undone.',
                                confirmLabel: v.isPlanned ? 'Cancel commitment' : 'Delete',
                              );
                              if (!confirmed) return;
                              try {
                                await v.remove!(budget);
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
        const SizedBox(width: 12),
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

/// What the sheet shows, worked out once from whichever input it was given.
class _DetailView {
  final String kindLabel;
  final MoneyFlow flow;
  final int amount;
  final String title;
  final String dateLabel;
  final String category;
  final String accountLabel;
  final String sourceLabel;
  final String destinationLabel;
  final String statusLabel;
  final bool isPlanned;

  /// Set when the transaction can be edited in the entry sheet.
  final Transaction? editable;

  /// Set when it is a planned bill that can be marked paid.
  final Transaction? payable;

  /// Deletes (or, for a planned bill, cancels) it; null when there is nothing to remove.
  final Future<void> Function(BudgetProvider budget)? remove;

  const _DetailView({
    required this.kindLabel,
    required this.flow,
    required this.amount,
    required this.title,
    required this.dateLabel,
    this.category = 'General',
    this.accountLabel = 'No account',
    this.sourceLabel = 'Source Account',
    this.destinationLabel = 'Destination Account',
    required this.statusLabel,
    this.isPlanned = false,
    this.editable,
    this.payable,
    this.remove,
  });

  factory _DetailView.ofTransaction(Transaction t, BudgetProvider budget) {
    final kindLabel = switch (t.kind) {
      TxKind.expense => 'EXPENSE OUTFLOW',
      TxKind.refund => 'REFUND',
      TxKind.income => 'INCOME INFLOW',
      TxKind.transfer => 'INTER-ACCOUNT TRANSFER',
      TxKind.passThroughIn => 'HELD / LENT MONEY IN',
      TxKind.passThroughOut => 'HELD / LENT MONEY OUT',
    };
    final status = switch (t.status) {
      TxStatus.cancelled => 'Cancelled',
      TxStatus.successful => 'Successful (Paid)',
      TxStatus.planned => switch (t.schedule) {
          TxSchedule.overdue => 'Planned · Overdue',
          TxSchedule.due => 'Planned · Due soon',
          _ => 'Planned Commitment',
        },
    };
    final cancelled = t.status == TxStatus.cancelled;
    final canEdit = !cancelled && !t.isPassThrough && t.kind != TxKind.transfer;
    return _DetailView(
      kindLabel: kindLabel,
      flow: t.flow,
      amount: t.displayAmount,
      title: t.name.isEmpty ? (t.note.isEmpty ? 'Transaction' : t.note) : t.name,
      dateLabel: TransactionDetailModal._dateLabel(t.isPlanned ? t.dueDate : t.date),
      category: t.category,
      accountLabel: TransactionDetailModal._accountLabel(budget.accountById(t.accountId)),
      sourceLabel: TransactionDetailModal._accountLabel(budget.accountById(t.accountId)),
      destinationLabel: TransactionDetailModal._accountLabel(budget.accountById(t.destinationAccountId)),
      statusLabel: status,
      isPlanned: t.isPlanned,
      editable: canEdit ? t : null,
      payable: t.isPlanned ? t : null,
      // The server removes a transfer's linked transfer record with its transaction.
      remove: cancelled ? null : (b) => t.isPlanned ? b.cancelTransaction(t.id) : b.deleteTransaction(t.id),
    );
  }

  factory _DetailView.ofTransfer(Transfer tr, BudgetProvider budget) => _DetailView(
        kindLabel: 'INTER-ACCOUNT TRANSFER',
        flow: MoneyFlow.moved,
        amount: tr.amount,
        title: tr.note.isEmpty ? 'Transfer' : tr.note,
        dateLabel: TransactionDetailModal._dateLabel(tr.date),
        sourceLabel: TransactionDetailModal._accountLabel(budget.accountById(tr.sourceAccountId)),
        destinationLabel: TransactionDetailModal._accountLabel(budget.accountById(tr.destinationAccountId)),
        statusLabel: 'Successful (Paid)',
        remove: (b) => b.deleteTransfer(tr.id),
      );

  /// An event with no transaction behind it (e.g. the planned salary): read-only.
  factory _DetailView.ofEvent(TimelineEvent e) => _DetailView(
        kindLabel: e.amount >= 0 ? 'INCOME INFLOW' : 'EXPENSE OUTFLOW',
        flow: e.amount >= 0 ? MoneyFlow.moneyIn : MoneyFlow.moneyOut,
        amount: e.amount.abs(),
        title: (e.description != null && e.description!.isNotEmpty) ? e.description! : e.name,
        dateLabel: e.date.isNotEmpty ? TransactionDetailModal._dateLabel(e.date) : 'Day ${e.day}',
        category: e.category ?? 'General',
        statusLabel: e.isPaid ? 'Successful (Paid)' : 'Planned Commitment',
        isPlanned: !e.isPaid,
      );
}
