import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../services/api_service.dart';
import '../widgets/server_settings_dialog.dart';
import '../widgets/web_icons.dart';
import 'onboarding_screen.dart' show SetupGroup, SetupRow, SetupSegmented;

/// Sign in / create account, in the grouped style of first-run setup (web's AuthScreen).
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _isRegister = false;
  bool _showAdvanced = false;
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit(AuthProvider auth) async {
    final email = _emailCtrl.text.trim();
    final pass = _passwordCtrl.text;
    if (_isRegister) {
      await auth.register(email, pass);
    } else {
      await auth.login(email, pass);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final p = context.palette;

    Widget field(TextEditingController c, String hint, {bool secret = false, Key? key}) => TextField(
          key: key,
          controller: c,
          obscureText: secret,
          keyboardType: secret ? TextInputType.visiblePassword : TextInputType.emailAddress,
          autofillHints: secret ? [_isRegister ? AutofillHints.newPassword : AutofillHints.password] : const [AutofillHints.email],
          style: AppTypography.inter(fontSize: 16, color: p.text),
          decoration: InputDecoration.collapsed(
            hintText: hint,
            hintStyle: AppTypography.inter(fontSize: 16, color: p.textMuted),
          ).copyWith(constraints: const BoxConstraints(minHeight: 44), contentPadding: const EdgeInsets.symmetric(vertical: 12)),
        );

    return Scaffold(
      backgroundColor: p.surfaceSubtle,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Expanded(
                  child: AutofillGroup(
                    child: ListView(padding: const EdgeInsets.only(top: 48), children: [
                      Center(
                        child: Container(
                          width: 72,
                          height: 72,
                          margin: const EdgeInsets.only(bottom: 20),
                          decoration: BoxDecoration(
                            color: p.accent,
                            borderRadius: BorderRadius.circular(18),
                            boxShadow: [BoxShadow(color: p.accent.withValues(alpha: 0.25), blurRadius: 24, offset: const Offset(0, 8))],
                          ),
                          child: Center(child: WebIcon(WebIcons.sparkles, size: 32, color: Colors.white)),
                        ),
                      ),
                      Text(_isRegister ? 'Create your account' : 'Budget Planner',
                          textAlign: TextAlign.center,
                          style: AppTypography.inter(fontSize: 32, fontWeight: FontWeight.w700, letterSpacing: -0.6, color: p.text)),
                      const SizedBox(height: 8),
                      Text(
                        _isRegister ? 'Plan your month and always know what’s safe to spend.' : 'Sign in to your planner.',
                        textAlign: TextAlign.center,
                        style: AppTypography.inter(fontSize: 15, height: 1.45, color: p.textSecondary),
                      ),
                      const SizedBox(height: 24),
                      SetupSegmented(
                        value: _isRegister ? 'register' : 'login',
                        options: const [('login', 'Sign in', null), ('register', 'Create account', null)],
                        onChanged: (v) => setState(() => _isRegister = v == 'register'),
                      ),
                      const SizedBox(height: 16),
                      SetupGroup(children: [
                        SetupRow(label: 'Email', labelWidth: 88, child: field(_emailCtrl, 'you@example.com', key: const ValueKey('auth-email'))),
                        SetupRow(
                          label: 'Password',
                          labelWidth: 88,
                          child: field(_passwordCtrl, _isRegister ? 'At least 8 characters' : 'Required',
                              secret: true, key: const ValueKey('auth-password')),
                        ),
                      ]),
                      if (auth.error != null)
                        Container(
                          margin: const EdgeInsets.only(top: 12),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(color: p.badSubtle, borderRadius: BorderRadius.circular(10)),
                          child: Text(auth.error!, style: AppTypography.inter(fontSize: 13, color: p.badInk)),
                        ),
                      const SizedBox(height: 24),
                      // The server is set per build; changing it is for testing, so it
                      // sits behind "Advanced" (upgrade plan 3.8).
                      if (!_showAdvanced)
                        Center(
                          child: TextButton(
                            key: const ValueKey('auth-advanced'),
                            onPressed: () => setState(() => _showAdvanced = true),
                            child: Text('Advanced', style: AppTypography.inter(fontSize: 13, color: p.textMuted)),
                          ),
                        )
                      else ...[
                        Text(
                          'Server: ${ApiService().baseUrl}',
                          key: const ValueKey('auth-server'),
                          textAlign: TextAlign.center,
                          style: AppTypography.inter(fontSize: 12, color: p.textSecondary),
                        ),
                        Center(
                          child: TextButton(
                            onPressed: () async {
                              await showDialog(context: context, builder: (_) => const ServerSettingsDialog());
                              if (mounted) setState(() {}); // show the new server
                            },
                            child: const Text('Change server', style: TextStyle(fontSize: 13)),
                          ),
                        ),
                      ],
                    ]),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: SizedBox(
                    height: 50,
                    child: ElevatedButton(
                      key: const ValueKey('auth-submit'),
                      onPressed: auth.isLoading ? null : () => _submit(auth),
                      style: ElevatedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                      child: auth.isLoading
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(_isRegister ? 'Create Account' : 'Sign In',
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
