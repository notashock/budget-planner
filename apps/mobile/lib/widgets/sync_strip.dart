import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../engine/engine.dart';
import '../providers/budget_provider.dart';
import '../services/outbox.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import 'load_error_banner.dart' show formatLoadedAt;

/// Strip under the header while captured entries (ADR 0071) are on the phone:
/// "Saving “Tea” ₹20…" while one is sent, "3 waiting to sync" when the server
/// can't be reached, "1 not saved" when the server refused one. Tap for the list.
/// Also shows the provider's notices (background refusals) as snackbars.
class SyncStrip extends StatefulWidget {
  const SyncStrip({super.key});

  @override
  State<SyncStrip> createState() => _SyncStripState();
}

class _SyncStripState extends State<SyncStrip> {
  StreamSubscription<String>? _notices;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _notices ??= context.read<BudgetProvider>().notices.listen((message) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(message),
        action: SnackBarAction(label: 'View', onPressed: () => showSyncSheet(context)),
      ));
    });
  }

  @override
  void dispose() {
    _notices?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final entries = budget.pendingEntries;
    if (entries.isEmpty) return const SizedBox.shrink();

    final sending = entries.where((e) => budget.isSending(e.key)).toList();
    final refused = entries.where((e) => e.error != null).length;
    final waiting = entries.length - sending.length - refused;
    final String label;
    if (sending.isNotEmpty && waiting == 0 && refused == 0) {
      final e = sending.first;
      label = sending.length == 1
          ? 'Saving “${e.label}” ${formatCurrency(e.amount)}…'
          : 'Saving ${sending.length} entries…';
    } else {
      label = [
        if (sending.isNotEmpty) '${sending.length} saving',
        if (waiting > 0) '$waiting waiting to sync',
        if (refused > 0) '$refused not saved',
      ].join(' · ');
    }

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    return Semantics(
      liveRegion: true,
      button: true,
      child: Material(
        color: refused > 0 ? AppColors.amberSubtle : (isDark ? AppColors.darkSurface : AppColors.lightSurface),
        child: InkWell(
          key: const ValueKey('sync-strip'),
          onTap: () => showSyncSheet(context),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Row(
              children: [
                if (sending.isNotEmpty)
                  const SizedBox.square(dimension: 14, child: CircularProgressIndicator(strokeWidth: 2))
                else
                  Icon(refused > 0 ? Icons.error_outline : Icons.cloud_upload_outlined,
                      size: 16, color: refused > 0 ? AppColors.amber : textColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.inter(fontSize: 12, color: textColor)),
                ),
                Icon(Icons.chevron_right, size: 16, color: textColor),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Lists this user's captured entries with Send / Discard.
Future<void> showSyncSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => ChangeNotifierProvider.value(
        value: context.read<BudgetProvider>(),
        child: const _SyncSheet(),
      ),
    );

class _SyncSheet extends StatelessWidget {
  const _SyncSheet();

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final entries = budget.pendingEntries;
    final now = DateTime.now();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.7),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 8, 4),
              child: Row(
                children: [
                  Expanded(child: Text('Saved on this phone', style: AppTypography.cardTitle())),
                  if (entries.isNotEmpty)
                    TextButton.icon(
                      onPressed: () => budget.syncNow(),
                      icon: const Icon(Icons.sync, size: 18),
                      label: const Text('Sync now'),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'Balances and Safe-to-Spend change once the server has these entries.',
                style: AppTypography.inter(fontSize: 12, color: muted),
              ),
            ),
            const SizedBox(height: 8),
            if (entries.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Everything is synced.', textAlign: TextAlign.center, style: AppTypography.label()),
              )
            else
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [for (final e in entries) _EntryTile(entry: e, now: now)],
                ),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  final OutboxEntry entry;
  final DateTime now;
  const _EntryTile({required this.entry, required this.now});

  @override
  Widget build(BuildContext context) {
    final budget = context.read<BudgetProvider>();
    final sending = context.select<BudgetProvider, bool>((b) => b.isSending(entry.key));
    final stale = entry.isStale(now);
    final kind = switch (entry.kind) {
      OutboxKind.spend => 'Spend',
      OutboxKind.income => 'Income',
      OutboxKind.markPaid => 'Mark paid',
    };
    final String status;
    if (sending) {
      status = 'Saving…';
    } else if (entry.error != null) {
      status = 'Not saved: ${entry.error}';
    } else if (stale) {
      status = 'Waiting since ${formatLoadedAt(entry.createdAt, now: now)}. '
          'It may already be saved: check Transactions before sending.';
    } else {
      status = 'Waiting to sync · ${formatLoadedAt(entry.createdAt, now: now)}';
    }
    final needsChoice = entry.error != null || stale;

    return ListTile(
      key: ValueKey('outbox-${entry.key}'),
      title: Text('$kind · ${entry.label}', maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(status),
      isThreeLine: needsChoice,
      trailing: sending
          ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(formatCurrency(entry.amount), style: AppTypography.tabularAmount(fontSize: 13)),
                if (needsChoice)
                  IconButton(
                    tooltip: 'Send',
                    icon: const Icon(Icons.send_outlined),
                    onPressed: () => budget.retryEntry(entry.key),
                  ),
                IconButton(
                  tooltip: 'Discard',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Discard this entry?'),
                        content: Text('“${entry.label}” will not be sent to the server.'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
                          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Discard')),
                        ],
                      ),
                    );
                    if (ok == true) await budget.discardEntry(entry.key);
                  },
                ),
              ],
            ),
    );
  }
}
