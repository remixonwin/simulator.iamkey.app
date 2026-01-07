import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class AdbRobot {
  final WidgetTester tester;
  const AdbRobot(this.tester);

  Future<void> verifyConsoleVisible() async {
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('LOGS'), findsOneWidget);
    expect(find.textContaining('Log stream started'), findsOneWidget);
  }

  Future<void> searchLogs(String query) async {
    final searchField = find.byKey(const Key('search_field'));
    await tester.enterText(searchField, query);
    await tester.pumpAndSettle();
  }

  Future<void> tapMaximize() async {
    final icon = find.byKey(const Key('expand_button'));
    await tester.tap(icon);
    await tester.pumpAndSettle();
  }

  Future<void> tapClear() async {
    final clearButton = find.byKey(const Key('clear_button'));
    await tester.tap(clearButton);
    await tester.pumpAndSettle();
  }

  Future<void> verifyCleared() async {
    expect(find.text('--- Logs Cleared ---'), findsOneWidget);
  }
}
