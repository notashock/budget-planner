import 'package:budget_mobile/providers/auth_provider.dart';
import 'package:budget_mobile/screens/auth_screen.dart';
import 'package:budget_mobile/services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

/// Upgrade plan 3.8: the sign-in screen is for signing in; the server address
/// is a testing setting behind "Advanced". (The first-run path to the first
/// month is in phone_width_test.dart.)
void main() {
  Future<void> pumpAuth(WidgetTester tester) async {
    tester.view.devicePixelRatio = 2.75;
    tester.view.physicalSize = const Size(393 * 2.75, 852 * 2.75);
    addTearDown(tester.view.reset);
    ApiService().updateBaseUrl('https://api.example.test');
    await tester.pumpWidget(ChangeNotifierProvider(
      create: (_) => AuthProvider(),
      child: const MaterialApp(home: AuthScreen()),
    ));
    await tester.pump();
  }

  testWidgets('the server setting is hidden until Advanced is tapped', (tester) async {
    await pumpAuth(tester);
    expect(find.text('Advanced'), findsOneWidget);
    expect(find.text('Change server'), findsNothing);
    expect(find.textContaining('api.example.test'), findsNothing);
    expect(find.textContaining('ADB'), findsNothing);

    await tester.ensureVisible(find.text('Advanced'));
    await tester.tap(find.text('Advanced'));
    await tester.pump();
    expect(find.text('Server: https://api.example.test'), findsOneWidget);
    expect(find.text('Change server'), findsOneWidget);
  });
}
