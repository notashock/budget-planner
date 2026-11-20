import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_lock_provider.dart';
import '../providers/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Shown instead of the app while [AppLockProvider.isLocked]. Asks once on
/// open; the user can retry, or sign out if the phone cannot authenticate.
class AppLockScreen extends StatefulWidget {
  const AppLockScreen({super.key});

  @override
  State<AppLockScreen> createState() => _AppLockScreenState();
}

class _AppLockScreenState extends State<AppLockScreen> {
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _unlock());
  }

  Future<void> _unlock() async {
    final lock = context.read<AppLockProvider>();
    if (lock.isAuthenticating) return;
    final ok = await lock.unlock();
    if (mounted && !ok) setState(() => _failed = true);
  }

  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text("You'll need your email and password to sign back in."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final lock = context.read<AppLockProvider>();
    await context.read<AuthProvider>().logout();
    lock.onSignedOut();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final text = isDark ? AppColors.darkText : AppColors.lightText;
    final muted = isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;
    final busy = context.select<AppLockProvider, bool>((l) => l.isAuthenticating);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_outline, size: 44, color: text, semanticLabel: 'Locked'),
                const SizedBox(height: 16),
                Text('Budget Planner is locked', style: AppTypography.cardTitle(color: text)),
                const SizedBox(height: 8),
                Text(
                  _failed
                      ? "Couldn't confirm it's you. Try again, or use your phone's PIN or pattern."
                      : 'Use your fingerprint, face or screen lock to open it.',
                  textAlign: TextAlign.center,
                  style: AppTypography.inter(fontSize: 13, color: muted),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  key: const ValueKey('app-lock-unlock'),
                  onPressed: busy ? null : _unlock,
                  icon: const Icon(Icons.fingerprint),
                  label: const Text('Unlock'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  key: const ValueKey('app-lock-sign-out'),
                  onPressed: busy ? null : _signOut,
                  child: const Text('Sign out instead'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
