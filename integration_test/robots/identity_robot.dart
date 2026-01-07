import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class IdentityRobot {
  final WidgetTester tester;
  const IdentityRobot(this.tester);

  Future<void> verifyVisible() async {
    expect(find.text('Create Simulator ID'), findsOneWidget);
  }

  Future<void> enterUsername(String username) async {
    final field = find.widgetWithText(TextFormField, 'Username');
    await tester.enterText(field, username);
    await tester.pumpAndSettle();
  }

  Future<void> enterPhoneNumber(String phone) async {
    final field = find.widgetWithText(TextFormField, 'Phone Number');
    await tester.enterText(field, phone);
    await tester.pumpAndSettle();
  }

  Future<void> tapRegister() async {
    final button = find.text('REGISTER IDENTITY');
    await tester.tap(button);
    await tester.pumpAndSettle();
  }

  Future<void> verifySuccess() async {
    expect(find.textContaining('Success!'), findsOneWidget);
    expect(find.textContaining('Wallet: 0x'), findsOneWidget);
  }
}
