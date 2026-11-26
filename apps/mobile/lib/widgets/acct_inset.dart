import 'package:flutter/material.dart';

import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import 'web_icons.dart';

/// Web's Accounts building blocks (accounts-list.css): an uppercase section
/// title over a rounded inset list, rows with an icon tile, and a footnote.

/// "BANK ACCOUNTS" over its inset (`.acct-section` / `.acct-section-title`).
class AcctSection extends StatelessWidget {
  const AcctSection({super.key, required this.title, required this.child, this.foot, this.after});

  final String title;
  final Widget child;
  final String? foot;
  final Widget? after;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Semantics(
        container: true,
        label: title,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
            child: Semantics(header: true, child: AcctLabel(title)),
          ),
          child,
          if (foot != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
              child: Text(foot!, style: AppTypography.inter(fontSize: 12, height: 1.5, color: p.textMuted)),
            ),
          ?after,
        ]),
      ),
    );
  }
}

/// The 12 px uppercase muted label web uses for section titles and the hero.
class AcctLabel extends StatelessWidget {
  const AcctLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Text(text.toUpperCase(),
      style: AppTypography.inter(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.6, color: context.palette.textMuted));
}

/// The rounded surface list (`.acct-inset`): hairlines between children.
class AcctInset extends StatelessWidget {
  const AcctInset({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: p.surface,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final (i, c) in children.indexed) ...[
          if (i > 0) Divider(height: 1, thickness: 1, color: p.border),
          c,
        ],
      ]),
    );
  }
}

/// An empty inset with web's "+ Add …" link (`.acct-empty` / `.acct-empty-add`), or plain text.
class AcctEmpty extends StatelessWidget {
  const AcctEmpty({super.key, required this.label, this.onAdd});
  final String label;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = Padding(
      padding: const EdgeInsets.all(14),
      child: Text(onAdd == null ? label : '+ $label',
          style: AppTypography.inter(
            fontSize: 15,
            fontWeight: onAdd == null ? FontWeight.w400 : FontWeight.w600,
            color: onAdd == null ? p.textMuted : p.indigo,
          )),
    );
    return AcctInset(children: [onAdd == null ? text : InkWell(onTap: onAdd, child: text)]);
  }
}

enum AcctIconKind { bank, wallet, card, person }

/// The 32 px icon tile (`.acct-row-icon.bank|wallet|card|person`).
class AcctIcon extends StatelessWidget {
  const AcctIcon(this.kind, {super.key});
  final AcctIconKind kind;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final (icon, bg, fg) = switch (kind) {
      AcctIconKind.bank => (WebIcons.buildingLibrary, p.indigo.withValues(alpha: 0.1), p.indigo),
      AcctIconKind.wallet => (WebIcons.wallet, const Color(0x2410B981), p.good),
      AcctIconKind.card => (WebIcons.creditCard, const Color(0x24F59E0B), p.warnInk),
      AcctIconKind.person => (WebIcons.user, p.surfaceSubtle, p.textSecondary),
    };
    return Container(
      width: 32,
      height: 32,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(9)),
      child: WebIcon(icon, size: 16, color: fg),
    );
  }
}

/// A pill tag in the caption ("Primary", "Salary": `.acct-tag`).
class AcctTag extends StatelessWidget {
  const AcctTag(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(color: p.indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
      child: Text(text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.inter(fontSize: 11, fontWeight: FontWeight.w600, color: p.indigo)),
    );
  }
}

/// One `.acct-row`: icon, title over caption, amount, "›" (turned when [open]).
/// [body] shows under the row while [open] (cards and people expand in place).
class AcctRow extends StatelessWidget {
  const AcctRow({
    super.key,
    required this.icon,
    required this.title,
    this.tags = const [],
    required this.caption,
    this.captionColor,
    required this.amount,
    this.amountColor,
    required this.onTap,
    this.open = false,
    this.body,
  });

  final AcctIconKind icon;
  final String title;
  final List<String> tags;
  final String caption;
  final Color? captionColor;
  final String amount;
  final Color? amountColor;
  final VoidCallback onTap;
  final bool open;
  final Widget? body;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final row = InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          AcctIcon(icon),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.inter(fontSize: 15, fontWeight: FontWeight.w500, color: p.text)),
              const SizedBox(height: 2),
              // One line: tags keep their size and the caption text takes the ellipsis
              // (also at 200 % text).
              Text.rich(
                TextSpan(children: [
                  for (final t in tags) ...[
                    WidgetSpan(alignment: PlaceholderAlignment.middle, child: AcctTag(t)),
                    const WidgetSpan(child: SizedBox(width: 6)),
                  ],
                  TextSpan(text: caption),
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.inter(fontSize: 12, height: 1.5, color: captionColor ?? p.textMuted),
              ),
            ]),
          ),
          const SizedBox(width: 12),
          Text(amount, style: AppTypography.inter(fontSize: 14, fontWeight: FontWeight.w600, color: amountColor ?? p.text)),
          const SizedBox(width: 12),
          SizedBox(
            width: 12,
            child: AnimatedRotation(
              turns: open ? 0.25 : 0,
              duration: const Duration(milliseconds: 150),
              child: Text('›', style: TextStyle(fontSize: 18, height: 1, color: p.textMuted)),
            ),
          ),
        ]),
      ),
    );
    if (body == null) return row;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      row,
      if (open) Padding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 14), child: body),
    ]);
  }
}

/// Web's small Button (size sm): primary is brand-filled, the rest outlined.
class AcctButton extends StatelessWidget {
  const AcctButton(this.label, {super.key, required this.onPressed, this.primary = false, this.icon});
  final String label;
  final VoidCallback onPressed;
  final bool primary;
  final WebIconData? icon;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final fg = primary ? Colors.white : p.text;
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        backgroundColor: primary ? p.indigo : p.surface,
        foregroundColor: fg,
        minimumSize: const Size(48, 48),
        tapTargetSize: MaterialTapTargetSize.padded,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: primary ? BorderSide.none : BorderSide(color: p.border),
        ),
        visualDensity: const VisualDensity(vertical: -2),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[WebIcon(icon!, size: 13, color: fg), const SizedBox(width: 6)],
        Text(label, style: AppTypography.inter(fontSize: 13, fontWeight: FontWeight.w600, color: fg)),
      ]),
    );
  }
}

/// Web's "⋯" menu trigger, drawn (the glyph is missing from some phone fonts).
class AcctDots extends StatelessWidget {
  const AcctDots({super.key, this.color});
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? context.palette.textMuted;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      for (var i = 0; i < 3; i++) ...[
        if (i > 0) const SizedBox(width: 3),
        Container(width: 3.5, height: 3.5, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
      ],
    ]);
  }
}
