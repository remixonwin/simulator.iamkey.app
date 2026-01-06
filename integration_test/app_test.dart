import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:simulator/main.dart' as app;
import 'robots/welcome_robot.dart';
import 'robots/adb_robot.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('E2E UX Workflow Test', () {
    testWidgets('Full ADB Connection and Console Workflow', (tester) async {
      // 1. Initialize the app
      app.main();
      await tester.pumpAndSettle();

      final welcome = WelcomeRobot(tester);
      final adb = AdbRobot(tester);

      // 2. Welcome Page Assertions
      await welcome.verifyVisible();

      // 3. Enter IP and Connect
      // Using the device address provided by the user
      await welcome.enterIpAddress('192.168.1.191:37509');
      await welcome.tapConnect();

      // 4. Verify Console Appearance
      await adb.verifyConsoleVisible();

      // 5. UX Interactions in Console
      await adb.searchLogs('API');
      await adb.tapMaximize();

      // 6. Clear functionality
      await adb.tapClear();
      await adb.verifyCleared();

      // 7. Success
      print('--- E2E Test Passed Successfully ---');
    });
  });
}
