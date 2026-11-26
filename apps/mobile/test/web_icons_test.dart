import 'dart:io';

import 'package:budget_mobile/widgets/web_icons.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('every web icon is in web_icons.dart, path for path', () {
    final jsx = File('../web/src/components/Icons.jsx').readAsStringSync().replaceAll('\r\n', '\n');
    final blocks = RegExp(r'export function (\w+)Icon\(.*?\{\n\s*return \(\n\s*<svg[^>]*>\n(.*?)\n\s*</svg>', dotAll: true)
        .allMatches(jsx)
        .map((m) => (m[1]!, m[2]!.split('\n').map((l) => l.trim()).join(' ').replaceAll('fill={color}', 'fill="currentColor"')))
        .toList();
    expect(blocks.length, 'export function'.allMatches(jsx).length);
    final mobile = {for (final i in WebIcons.all) i.name: i.body};
    expect(mobile.keys.toSet(), blocks.map((b) => b.$1).toSet(),
        reason: 'Regenerate lib/widgets/web_icons.dart from Icons.jsx');
    for (final (name, body) in blocks) {
      expect(mobile[name], body, reason: '$name drifted from Icons.jsx');
    }
  });

  testWidgets('a web icon draws at its size in the given colour', (tester) async {
    await tester.pumpWidget(const Center(child: WebIcon(WebIcons.wallet, size: 12, color: Colors.red)));
    expect(tester.getSize(find.byType(SvgPicture)), const Size(12, 12));
  });
}
