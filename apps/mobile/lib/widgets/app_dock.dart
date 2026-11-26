import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../modals/unified_entry_modal.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import 'min_tap.dart';
import 'you_sheet.dart';

/// The floating, blurred dock (Apple-style plan §2.1): the Today bar that
/// opens the entry sheet (it replaces the floating +), the You button, and
/// four equal tabs.
class AppDock extends StatelessWidget {
  const AppDock({super.key, required this.index, required this.onTab});

  final int index;
  final ValueChanged<int> onTab;

  static const tabs = [
    (Icons.timeline_outlined, Icons.timeline, 'Plan'),
    (Icons.receipt_long_outlined, Icons.receipt_long, 'Transactions'),
    (Icons.auto_awesome_outlined, Icons.auto_awesome, 'Goals'),
    (Icons.account_balance_outlined, Icons.account_balance, 'Accounts'),
  ];

  static Future<void> _openEntry(BuildContext context) => showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => const UnifiedEntryModal(),
      );

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final brand = Theme.of(context).colorScheme.primary;
    return Semantics(
      container: true,
      label: 'Main Navigation',
      child: SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(28),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: p.surface.withValues(alpha: 0.78),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: p.border.withValues(alpha: 0.8)),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 2),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Row(children: [
                    Expanded(
                      child: Semantics(
                        button: true,
                        label: 'Quick Add Entry',
                        excludeSemantics: true,
                        onTap: () => _openEntry(context), // excludeSemantics drops the InkWell's own action
                        child: Material(
                          color: p.surfaceSubtle.withValues(alpha: 0.9),
                          shape: const StadiumBorder(),
                          child: InkWell(
                            key: const ValueKey('today-bar'),
                            customBorder: const StadiumBorder(),
                            onTap: () => _openEntry(context),
                            child: MinTap(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 14),
                                child: Row(children: [
                                  Icon(Icons.add, size: 20, color: brand),
                                  const SizedBox(width: 8),
                                  Flexible(
                                    child: Text('Add spend…',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: AppTypography.inter(fontSize: AppTypography.bodySize, color: p.textSecondary)),
                                  ),
                                ]),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    IconButton(
                      key: const ValueKey('dock-you'),
                      tooltip: 'Account Settings',
                      icon: CircleAvatar(
                        radius: 15,
                        backgroundColor: brand.withValues(alpha: 0.14),
                        child: Icon(Icons.person_outline, size: 18, color: brand),
                      ),
                      onPressed: () => YouSheet.show(context),
                    ),
                  ]),
                  const SizedBox(height: 2),
                  Row(children: [
                    for (var i = 0; i < tabs.length; i++)
                      Expanded(child: _Tab(tab: tabs[i], selected: i == index, onTap: () => onTab(i))),
                  ]),
                ]),
              ),
            ),
          ),
        ),
      ),
    ));
  }
}

class _Tab extends StatelessWidget {
  const _Tab({required this.tab, required this.selected, required this.onTap});

  final (IconData, IconData, String) tab;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? Theme.of(context).colorScheme.primary : context.palette.textSecondary;
    final (icon, activeIcon, label) = tab;
    return Semantics(
      selected: selected,
      button: true,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: InkResponse(
        key: ValueKey('dock-tab-$label'),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 52),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(selected ? activeIcon : icon, size: 22, color: color),
            const SizedBox(height: 2),
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.inter(
                    fontSize: AppTypography.captionSize, fontWeight: selected ? FontWeight.w600 : FontWeight.w500, color: color)),
          ]),
        ),
      ),
    );
  }
}
