import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_lock_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// App lock settings: on/off (confirmed with the phone's lock) and when to lock.
class AppLockSettingsSheet extends StatelessWidget {
  const AppLockSettingsSheet({super.key});

  // Scroll-controlled and scrollable, so it fits short screens and large text.
  static Future<void> show(BuildContext context) => showModalBottomSheet(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (_) => const SingleChildScrollView(child: AppLockSettingsSheet()),
      );

  @override
  Widget build(BuildContext context) {
    final lock = context.watch<AppLockProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final muted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('App lock', style: AppTypography.cardTitle(color: text)),
            const SizedBox(height: 4),
            Text(
              lock.isAvailable
                  ? "Ask for your fingerprint, face or screen lock when opening the app. While it's on, "
                      'screenshots are blocked and the app is hidden in the app switcher.'
                  : 'Set up a screen lock (PIN, pattern or fingerprint) on this phone to use App lock.',
              style: AppTypography.inter(fontSize: 12.5, color: muted),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              key: const ValueKey('app-lock-switch'),
              contentPadding: EdgeInsets.zero,
              title: const Text('Lock the app'),
              value: lock.isEnabled,
              onChanged: !lock.isAvailable || lock.isAuthenticating
                  ? null
                  : (on) async {
                      if (!on) return lock.disable();
                      final ok = await lock.enable();
                      if (!ok && context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text("App lock is off: couldn't confirm it's you.")),
                        );
                      }
                    },
            ),
            if (lock.isEnabled) ...[
              const Divider(),
              Text('Lock', style: AppTypography.label(color: muted)),
              RadioGroup<LockAfter>(
                groupValue: lock.lockAfter,
                onChanged: (v) {
                  if (v != null) lock.setLockAfter(v);
                },
                child: Column(
                  children: [
                    for (final option in LockAfter.values)
                      RadioListTile<LockAfter>(
                        key: ValueKey('app-lock-after-${option.name}'),
                        contentPadding: EdgeInsets.zero,
                        title: Text(option.label),
                        value: option,
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
