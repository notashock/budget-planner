import 'package:flutter/widgets.dart';

/// Keeps a small control looking the same but makes the area around it that
/// takes the tap at least 48 x 48 dp, Android's minimum (upgrade plan 3.2).
/// Put it between the tap handler (InkWell, PopupMenuButton) and the visual.
class MinTap extends StatelessWidget {
  const MinTap({super.key, required this.child});

  static const double size = 48;

  final Widget child;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: const BoxConstraints(minWidth: size, minHeight: size),
        child: Center(widthFactor: 1, heightFactor: 1, child: child),
      );
}
