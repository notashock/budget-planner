import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../modals/salary_safeline_modal.dart';
import '../providers/app_lock_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../screens/assistant_screen.dart';
import 'app_lock_settings_sheet.dart';
import 'server_settings_dialog.dart';

/// The "You" sheet from the dock (Apple-style plan §2.1, owner's answer 1):
/// salary schedule, the assistant, appearance, app lock, server and sign-out.
class YouSheet extends StatelessWidget {
  const YouSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (_) => const YouSheet(),
      );

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeProvider>();
    final lockOn = context.watch<AppLockProvider>().isEnabled;
    final user = context.watch<AuthProvider>().user;
    final name = '${user?['name'] ?? ''}'.trim(), email = '${user?['email'] ?? ''}'.trim();
    final (themeIcon, themeLabel) = switch (theme.themeMode) {
      ThemeMode.light => (Icons.light_mode_outlined, 'Light'),
      ThemeMode.dark => (Icons.dark_mode_outlined, 'Dark'),
      ThemeMode.system => (Icons.brightness_auto_outlined, 'System'),
    };

    // Closes this sheet first, then opens what the row leads to from the shell.
    void then(void Function(BuildContext shell) open) {
      final nav = Navigator.of(context);
      final shell = nav.context;
      nav.pop();
      open(shell);
    }

    Widget row(String key, IconData icon, String label, VoidCallback onTap, {String? value, Color? color}) => ListTile(
          key: ValueKey('you-$key'),
          leading: Icon(icon, color: color),
          title: Text(label, style: TextStyle(color: color)),
          trailing: value == null ? null : Text(value),
          onTap: onTap,
        );

    return SafeArea(
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          // Web's YouMenu header: who is signed in.
          if (name.isNotEmpty || email.isNotEmpty)
            ListTile(
              key: const ValueKey('you-user'),
              title: Text(name.isEmpty ? email : name, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: name.isEmpty || email.isEmpty ? null : Text(email),
            ),
          row('salary', Icons.payments_outlined, 'Salary schedule', () => then((c) => showModalBottomSheet(
                context: c,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => const SalarySafelineModal(),
              ))),
          row('assistant', Icons.auto_awesome_outlined, 'Assistant', () => then((c) => Navigator.of(c).push(MaterialPageRoute(
                builder: (_) => Scaffold(appBar: AppBar(title: const Text('AI assistant')), body: const AssistantScreen()),
              )))),
          const Divider(height: 1),
          row('theme', themeIcon, 'Appearance', theme.cycleTheme, value: themeLabel),
          row('deviceColors', Icons.palette_outlined, 'Device colours', () => theme.setDeviceColors(!theme.deviceColors),
              value: theme.deviceColors ? 'On' : 'Off'),
          row('appLock', lockOn ? Icons.lock : Icons.lock_open_outlined, 'App lock',
              () => then((c) => AppLockSettingsSheet.show(c)), value: lockOn ? 'On' : 'Off'),
          row('server', Icons.settings_ethernet, 'Server settings',
              () => then((c) => showDialog(context: c, builder: (_) => const ServerSettingsDialog()))),
          const Divider(height: 1),
          row('signOut', Icons.logout, 'Sign out', () {
            final auth = context.read<AuthProvider>();
            Navigator.of(context).pop();
            auth.logout();
          }, color: Theme.of(context).colorScheme.error),
        ]),
      ),
    );
  }
}
