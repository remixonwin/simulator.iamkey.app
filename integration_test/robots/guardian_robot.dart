import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class GuardianRobot {
  final WidgetTester tester;
  const GuardianRobot(this.tester);

  Future<void> verifyVisible() async {
    expect(find.text('Guardian Management'), findsOneWidget);
  }

  Future<void> enterGuardianPhone(String phone) async {
    final field = find.byKey(const Key('invite_phone_field'));
    await tester.enterText(field, phone);
    await tester.pumpAndSettle();
  }

  Future<void> tapInvite() async {
    final button = find.text('Invite');
    await tester.tap(button);
    await tester.pumpAndSettle();
  }

  Future<void> tapRefresh() async {
    final button = find.byIcon(Icons.refresh);
    await tester.tap(button);
    await tester.pumpAndSettle();
  }

  Future<void> verifyGuardianStatus(String name, String status) async {
    expect(find.textContaining(name), findsOneWidget);
    expect(find.text('Status: $status'), findsOneWidget);
  }
}
