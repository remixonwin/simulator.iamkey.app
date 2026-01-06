import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class WelcomeRobot {
  final WidgetTester tester;
  const WelcomeRobot(this.tester);

  Future<void> verifyVisible() async {
    expect(find.text('Welcome to Antigravity'), findsOneWidget);
    expect(find.text('Wireless Debugging'), findsOneWidget);
  }

  Future<void> enterIpAddress(String ip) async {
    final field = find.byType(TextFormField);
    await tester.enterText(field, ip);
    await tester.pumpAndSettle();
  }

  Future<void> tapConnect() async {
    final button = find.text('Connect Device');
    await tester.tap(button);
    await tester.pumpAndSettle(const Duration(seconds: 2));
  }
}
