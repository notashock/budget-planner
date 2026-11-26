import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../theme/app_palette.dart';
import '../theme/app_typography.dart';

/// One header for every tab (Apple-style plan §3): a large title that scrolls
/// away and hands over to a compact, blurred bar with the title centred.
/// [actions] stay in the top row in both states. The screen is [child].
class ScreenHeader extends StatelessWidget {
  const ScreenHeader({super.key, required this.title, this.actions = const [], required this.child});

  final String title;
  final List<Widget> actions;
  final Widget child;

  static const double compactHeight = 52;
  static const double largeHeight = compactHeight + 48;

  @override
  Widget build(BuildContext context) {
    return NestedScrollView(
      headerSliverBuilder: (context, _) => [
        SliverAppBar(
          pinned: true,
          automaticallyImplyLeading: false,
          toolbarHeight: compactHeight,
          expandedHeight: largeHeight,
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          flexibleSpace: _HeaderSpace(title: title, actions: actions),
        ),
      ],
      body: child,
    );
  }
}

class _HeaderSpace extends StatelessWidget {
  const _HeaderSpace({required this.title, required this.actions});

  final String title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final top = MediaQuery.paddingOf(context).top;
    return LayoutBuilder(builder: (context, c) {
      // 1 = fully large, 0 = fully compact.
      final range = ScreenHeader.largeHeight - ScreenHeader.compactHeight;
      final open = ((c.maxHeight - top - ScreenHeader.compactHeight) / range).clamp(0.0, 1.0);
      final reduceMotion = MediaQuery.disableAnimationsOf(context);
      // Reduced motion: the bars swap instead of fading.
      final compact = reduceMotion ? (open < 0.5 ? 1.0 : 0.0) : ((0.4 - open) / 0.4).clamp(0.0, 1.0);

      return Stack(fit: StackFit.expand, children: [
        // Blurred material only once content is under the bar.
        if (compact > 0)
          Opacity(
            opacity: compact,
            child: ClipRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: p.bg.withValues(alpha: 0.72),
                    border: Border(bottom: BorderSide(color: p.border.withValues(alpha: compact))),
                  ),
                ),
              ),
            ),
          ),
        Positioned(
          top: top,
          left: 0,
          right: 0,
          height: ScreenHeader.compactHeight,
          child: Row(children: [
            const SizedBox(width: 56),
            Expanded(
              child: Semantics(
                header: true,
                // While the large title shows, it is the one screen readers hear.
                excludeSemantics: open > 0,
                child: Opacity(
                  opacity: compact,
                  child: Text(title,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.inter(fontSize: 17, fontWeight: FontWeight.w600, color: p.text)),
                ),
              ),
            ),
            ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 56),
              child: Row(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.end, children: [
                ...actions,
                const SizedBox(width: 8),
              ]),
            ),
          ]),
        ),
        if (open > 0)
          Positioned(
            left: 16,
            right: 16,
            bottom: 4,
            child: Opacity(
              opacity: reduceMotion ? 1 : open,
              child: MediaQuery.withClampedTextScaling(
                maxScaleFactor: 1.6, // the title row is 48 dp; body text still scales fully
                child: Semantics(
                header: true,
                child: Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.inter(
                        fontSize: AppTypography.titleSize, fontWeight: FontWeight.w700, color: p.text, letterSpacing: -0.5)),
                ),
              ),
            ),
          ),
      ]);
    });
  }
}
