import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:simulator/src/features/adb/presentation/pages/adb_connect_form.dart';
import 'package:simulator/src/features/adb/presentation/widgets/adb_log_view.dart';

void main() {
  group('ADB Feature Tests', () {
    testWidgets('AdbConnectForm should show validation error on empty input', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: Scaffold(body: AdbConnectForm())),
        ),
      );

      // Tap connect without input
      await tester.tap(find.text('Connect Device'));
      await tester.pump();

      expect(find.text('IP address is required'), findsOneWidget);
    });

    testWidgets(
      'AdbConnectForm should show validation error on invalid IP format',
      (WidgetTester tester) async {
        await tester.pumpWidget(
          const ProviderScope(
            child: MaterialApp(home: Scaffold(body: AdbConnectForm())),
          ),
        );

        await tester.enterText(find.byType(TextFormField), '192.168.1');
        await tester.tap(find.text('Connect Device'));
        await tester.pump();

        expect(find.text('Invalid format (0.0.0.0:0000)'), findsOneWidget);
      },
    );

    testWidgets('AdbLogView should show initial status message', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: Scaffold(body: AdbLogView(ipAddress: '127.0.0.1:5555')),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify header exists
      expect(find.textContaining('LOGS'), findsOneWidget);
      expect(
        find.textContaining('Wait...'),
        findsOneWidget,
      ); // App filter loading state
    });
  });
}
