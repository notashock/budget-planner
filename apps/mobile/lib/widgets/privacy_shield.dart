import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Covers the app while it is not in front (app switcher, notification shade)
/// when App lock is on. An opaque cover rather than a blur: a blur of balances
/// can still be legible. On Android, FLAG_SECURE also keeps the recents
/// thumbnail blank (AndroidScreenSecurity).
class PrivacyShield extends StatelessWidget {
  final bool obscured;
  final Widget child;

  const PrivacyShield({super.key, required this.obscured, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Stack(
      textDirection: TextDirection.ltr,
      children: [
        child,
        if (obscured)
          Positioned.fill(
            child: ColoredBox(
              key: const ValueKey('privacy-shield'),
              color: isDark ? AppColors.darkBackground : AppColors.lightBackground,
              child: Center(
                child: Icon(
                  Icons.lock_outline,
                  size: 40,
                  color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
