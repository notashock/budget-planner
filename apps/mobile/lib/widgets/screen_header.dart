import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../theme/app_palette.dart';
import '../theme/app_typography.dart';

/// One header for every tab: the title on the left of the same row as the
/// tab's month picker or buttons ([actions]), pinned while the screen scrolls
/// under it. The screen is [child].
class ScreenHeader extends StatelessWidget {
  const ScreenHeader({super.key, required this.title, this.actions = const [], required this.child});

  final String title;
  final List<Widget> actions;
  final Widget child;

  static const double height = 60;

  @override
  Widget build(BuildContext context) {
    return NestedScrollView(
      headerSliverBuilder: (context, scrolled) => [
        SliverAppBar(
          pinned: true,
          automaticallyImplyLeading: false,
          toolbarHeight: height,
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          flexibleSpace: _HeaderBar(title: title, actions: actions, scrolled: scrolled),
        ),
      ],
      body: child,
    );
  }
}

class _HeaderBar extends StatelessWidget {
  const _HeaderBar({required this.title, required this.actions, required this.scrolled});

  final String title;
  final List<Widget> actions;
  final bool scrolled;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final top = MediaQuery.paddingOf(context).top;
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: scrolled ? 20 : 0, sigmaY: scrolled ? 20 : 0),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: scrolled ? p.bg.withValues(alpha: 0.72) : p.bg,
            border: Border(bottom: BorderSide(color: scrolled ? p.border : Colors.transparent)),
          ),
          child: Padding(
            padding: EdgeInsets.only(top: top, left: 16, right: 8),
            child: Row(children: [
              Expanded(
                child: MediaQuery.withClampedTextScaling(
                  maxScaleFactor: 1.6, // the bar is 60 dp; body text still scales fully
                  child: Semantics(
                    header: true,
                    child: Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.inter(fontSize: 26, fontWeight: FontWeight.w700, color: p.text, letterSpacing: -0.5)),
                  ),
                ),
              ),
              ...actions,
            ]),
          ),
        ),
      ),
    );
  }
}
