import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:simulator/main.dart' as app;
import 'package:simulator/src/core/config/simulator_api_client.dart';
import 'robots/welcome_robot.dart';
import 'robots/identity_robot.dart';
import 'robots/guardian_robot.dart';
import 'dart:math';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Guardian Management Workflow', (tester) async {
    // 0. Setup: Create "Bob" (The Guardian) via API
    final api = SimulatorApiClient();
    final random = Random();
    final randomId = DateTime.now().millisecondsSinceEpoch;
    final bobName = 'Bob_$randomId';
    // Ensure 10 digit phone part
    final bobPhoneSuffix = (1000000000 + random.nextInt(900000000)).toString();
    final bobPhone = '+977$bobPhoneSuffix';

    final bob = await api.registerUser(
      username: bobName,
      phoneNumber: bobPhone,
    );
    final bobId = bob['user']['id'];

    debugPrint('Created Guardian Bob: $bobName ($bobId) Phone: $bobPhone');

    // 1. Initialize App
    app.main();
    await tester.pumpAndSettle();

    final welcome = WelcomeRobot(tester);
    final identity = IdentityRobot(tester);
    final guardian = GuardianRobot(tester);

    // 2. Register "Alice" (Me)
    final alicePhoneSuffix = (1000000000 + random.nextInt(900000000))
        .toString();
    final alicePhone = '+977$alicePhoneSuffix';

    await welcome.tapTestIdentityRegistration();
    await identity.enterUsername('Alice_User');
    await identity.enterPhoneNumber(alicePhone);
    await identity.tapRegister();
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await identity.verifySuccess();

    // 3. Navigate to Guardians
    await tester.pageBack();
    await tester.pumpAndSettle();

    final manageButton = find.text('Manage Guardians');
    await tester.ensureVisible(manageButton);
    await tester.tap(manageButton);
    await tester.pumpAndSettle();

    // 4. Invite Bob
    await guardian.verifyVisible();
    await guardian.enterGuardianPhone(bobPhone);
    await guardian.tapInvite();

    // Verify Pending
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await guardian.verifyGuardianStatus(bobName, 'pending');

    // 5. Bob accepts invite (API)
    debugPrint('Bob accepting invite...');
    final guardians = await api.getGuardians(bobId);
    final protecting = guardians['protecting'] as List;
    final relationship = protecting.firstWhere(
      (r) => r['identity_phone'] == alicePhone,
    );

    await api.acceptGuardian(relationshipId: relationship['id']);
    debugPrint('Bob accepted relationship: ${relationship['id']}');

    // 6. Refresh UI
    await guardian.tapRefresh();
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // 7. Verify Active
    await guardian.verifyGuardianStatus(bobName, 'active');
  });
}
