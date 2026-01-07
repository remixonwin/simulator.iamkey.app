import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:simulator/main.dart' as app;
import 'robots/welcome_robot.dart';
import 'robots/identity_robot.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Identity Registration Workflow', (tester) async {
    // 1. Initialize
    app.main();
    await tester.pumpAndSettle();

    final welcome = WelcomeRobot(tester);
    final identity = IdentityRobot(tester);

    // 2. Navigate to Identity
    await welcome.tapTestIdentityRegistration();

    // 3. Register
    await identity.verifyVisible();
    await identity.enterUsername('testuser_flutter');
    await identity.enterPhoneNumber('+9779812345678');
    await identity.tapRegister();

    // 4. Verify Success
    // Wait for async operation
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await identity.verifySuccess();
  });
}
