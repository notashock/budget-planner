import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart' show CustomSemanticsAction;

import '../theme/app_palette.dart';

/// A transaction row with swipe actions (upgrade plan 3.7): swipe right to
/// mark paid, left to edit. The row never slides away by itself; the action
/// decides what happens next. Both actions are also screen-reader actions,
/// since TalkBack users can't swipe a row.
class SwipeRow extends StatelessWidget {
  const SwipeRow({
    super.key,
    required this.id,
    required this.child,
    this.onMarkPaid,
    this.onEdit,
  });

  final String id;
  final Widget child;

  /// Swipe right (start to end). Null: not offered.
  final VoidCallback? onMarkPaid;

  /// Swipe left (end to start). Null: not offered.
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final semantics = Semantics(
      customSemanticsActions: {
        if (onMarkPaid != null) const CustomSemanticsAction(label: 'Mark paid'): onMarkPaid!,
        if (onEdit != null) const CustomSemanticsAction(label: 'Edit'): onEdit!,
      },
      child: child,
    );
    if (onMarkPaid == null && onEdit == null) return semantics;

    final p = context.palette;
    Widget bg(Alignment align, Color color, IconData icon, String label) => Container(
          alignment: align,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: Colors.white),
              const SizedBox(width: 6),
              Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
            ],
          ),
        );

    final pay = bg(Alignment.centerLeft, p.goodInk, Icons.check_circle_outline, 'Mark paid');
    final edit = bg(Alignment.centerRight, p.textSecondary, Icons.edit_outlined, 'Edit');
    return Dismissible(
      key: ValueKey('swipe-$id'),
      direction: onMarkPaid != null && onEdit != null
          ? DismissDirection.horizontal
          : (onMarkPaid != null ? DismissDirection.startToEnd : DismissDirection.endToStart),
      background: onMarkPaid != null ? pay : edit,
      secondaryBackground: onMarkPaid != null && onEdit != null ? edit : null,
      dismissThresholds: const {DismissDirection.startToEnd: 0.35, DismissDirection.endToStart: 0.35},
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          onMarkPaid?.call();
        } else {
          onEdit?.call();
        }
        return false; // the row stays; the action shows the result
      },
      child: semantics,
    );
  }
}
