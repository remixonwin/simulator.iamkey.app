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
    final field = find.byKey(const Key('ip_field'));
    await tester.enterText(field, ip);
    await tester.pumpAndSettle();
  }

  Future<void> tapConnect() async {
    final button = find.byKey(const Key('connect_button'));
    await tester.tap(button);
    await tester.pumpAndSettle(const Duration(seconds: 2));
  }

  Future<void> tapTestIdentityRegistration() async {
    final button = find.text('Test Identity Registration');
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
  }
}
