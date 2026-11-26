import 'dart:convert';

import 'package:budget_mobile/providers/budget_provider.dart';
import 'package:budget_mobile/screens/assistant_screen.dart';
import 'package:budget_mobile/screens/transactions_screen.dart';
import 'package:budget_mobile/widgets/timeline_list.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import 'helpers/fake_font_http.dart';
import 'helpers/fixture_budget.dart';

/// Phase 5 of the web parity plan: assistant, timeline badges, goal cancel, Move to Held & Lent.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  useFakeFontHttp();

  Future<void> pump(WidgetTester tester, BudgetProvider budget, Widget screen) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: budget,
      child: MaterialApp(home: Scaffold(body: screen)),
    ));
    await tester.pump();
  }

  // Writes go through the real (mocked) HTTP client: give them real time.
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 6; i++) {
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    }
    await tester.pumpAndSettle();
  }

  Map<String, dynamic> body(FixtureBudget fb, String path) =>
      jsonDecode(fb.requests.lastWhere((r) => r.method != 'GET' && r.url.path.endsWith(path)).body) as Map<String, dynamic>;

  test('relative day badges read like web', () {
    const today = '2026-11-26';
    expect(relativeDateBadge('2026-11-26', today), 'Today');
    expect(relativeDateBadge('2026-11-27', today), 'Tomorrow');
    expect(relativeDateBadge('2026-11-25', today), 'Yesterday');
    expect(relativeDateBadge('2026-11-30', today), 'In 4 days');
    expect(relativeDateBadge('2026-12-10', today), 'In 2w');
    expect(relativeDateBadge('2026-11-21', today), '5d ago');
    expect(relativeDateBadge('2026-11-12', today), '2w ago');
    expect(relativeDateBadge('2027-02-01', today), isNull);
  });

  testWidgets('assistant: enable, parse into a draft, discard or save it', (tester) async {
    final fb = FixtureBudget();
    fb.onWrite = (req) async => req.url.path == '/api/ai/parse-text'
        ? http.Response(jsonEncode({'item': {'name': 'Internet', 'type': 'fixed', 'amount': 99900, 'day': 15}}), 200,
            headers: {'content-type': 'application/json'})
        : okJson(<String, dynamic>{});
    final budget = (await tester.runAsync(() => fb.load()))!;
    await pump(tester, budget, const AssistantScreen());

    expect(find.text('ASSISTANT IS DISABLED'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('ai-enable')));
    await settle(tester);
    expect(body(fb, '/api/settings'), {'aiAssistantEnabled': true});
    expect(find.text('CONVERT TEXT TO BUDGET ITEM'), findsOneWidget);
    expect(find.text('Disable assistant'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('ai-prompt')), 'Internet 999 on the 15th');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('ai-parse')));
    await settle(tester);
    expect(find.text('Review draft item before saving'), findsOneWidget);
    expect(find.text('Name: Internet (fixed)'), findsOneWidget);
    expect(find.textContaining('on day 15'), findsOneWidget);

    await tester.tap(find.text('Discard'));
    await tester.pump();
    expect(find.byKey(const ValueKey('ai-draft')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('ai-parse')));
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('ai-save-draft')));
    await settle(tester);
    expect(fb.writes.where((w) => w.startsWith('POST') && w.contains('/transactions')), hasLength(1));
    expect(find.byKey(const ValueKey('ai-draft')), findsNothing);
  });

  testWidgets('cancelling a goal bill sends the values the server reads', (tester) async {
    final fb = FixtureBudget();
    final budget = (await tester.runAsync(() => fb.load(edit: (f) {
          final rent = (f['month_detail']['transactions'] as List).firstWhere((t) => t['name'] == 'Rent') as Map;
          rent['origin'] = 'goal';
          rent['goalId'] = 'goal-1';
        })))!;
    await pump(tester, budget, const TransactionsScreen());
    await tester.tap(find.byKey(const ValueKey('tab-planned')));
    await settle(tester);
    await tester.tap(find.byTooltip('Actions for Rent'));
    await settle(tester);
    await tester.tap(find.text('Cancel').last);
    await settle(tester);

    expect(find.text('Cancel Scheduled Goal'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('goal-cancel-drop')));
    await settle(tester);
    expect(body(fb, '/cancel')['goalAction'], 'dropped');
  });

  testWidgets('Move to Held & Lent turns a spend into money lent to a new person', (tester) async {
    final fb = FixtureBudget();
    final budget = (await tester.runAsync(() => fb.load()))!;
    await pump(tester, budget, const TransactionsScreen());

    await tester.tap(find.byTooltip('Actions for Shoes'));
    await settle(tester);
    await tester.tap(find.text('Move to Held & Lent'));
    await settle(tester);
    expect(find.textContaining('will stop counting as spending'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('rc-submit')));
    await tester.pump();
    expect(find.text('Enter the person’s name.'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('rc-person-name')), 'Asha');
    await tester.tap(find.byKey(const ValueKey('rc-submit')));
    await settle(tester);
    expect(body(fb, '/reclassify'), {'personName': 'Asha', 'direction': 'lent'});

    // Held/lent and transfer rows have no such action.
    await tester.tap(find.byTooltip('Actions for Lent to Asha'));
    await settle(tester);
    expect(find.text('Move to Held & Lent'), findsNothing);
  });
}
