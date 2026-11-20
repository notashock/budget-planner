import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_lock_provider.dart';
import '../screens/app_lock_screen.dart';
import 'privacy_shield.dart';

/// Wraps the whole app (MaterialApp.builder, above the navigator), so the lock
/// also covers open sheets and dialogs. While locked, the app underneath stays
/// mounted (its state is kept) but offstage: not painted, not hit-testable and
/// not read by screen readers.
class AppLockGate extends StatelessWidget {
  /// Only a signed-in app is locked; the sign-in screen has nothing to protect.
  final bool signedIn;
  final Widget child;

  const AppLockGate({super.key, required this.signedIn, required this.child});

  @override
  Widget build(BuildContext context) {
    final lock = context.watch<AppLockProvider>();
    final showLock = signedIn && lock.isLocked;
    return PrivacyShield(
      obscured: lock.isObscured,
      child: Stack(
        children: [
          Offstage(
            offstage: showLock,
            child: TickerMode(enabled: !showLock, child: child),
          ),
          if (showLock)
            // Its own navigator (for the sign-out dialog), without the app's
            // HeroController: two navigators may not share one.
            HeroControllerScope.none(
              child: Navigator(
                key: const ValueKey('app-lock-navigator'),
                onGenerateRoute: (_) => MaterialPageRoute<void>(builder: (_) => const AppLockScreen()),
              ),
            ),
        ],
      ),
    );
  }
}
