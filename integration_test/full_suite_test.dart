import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:simulator/main.dart' as app;
import 'package:simulator/src/core/config/simulator_api_client.dart';
import 'robots/welcome_robot.dart';
import 'robots/identity_robot.dart';
import 'robots/guardian_robot.dart';
import 'robots/marketplace_robot.dart';
import 'dart:math';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Full Simulator E2E Suite', (tester) async {
    // Shared Random for this run
    final random = Random();
    final uniqueId = DateTime.now().millisecondsSinceEpoch;

    // API Client for setup/teardown
    final api = SimulatorApiClient();

    // =========================================================================
    // 1. Identity Flow
    // =========================================================================
    debugPrint('--- Starting Identity Flow ---');
    app.main();
    await tester.pumpAndSettle();

    final welcome = WelcomeRobot(tester);
    final identity = IdentityRobot(tester);
    final guardian = GuardianRobot(tester);
    final marketplace = MarketplaceRobot(tester);

    final aliceName = 'Alice_$uniqueId';
    final alicePhone = '+977${(1000000000 + random.nextInt(900000000))}';

    await welcome.tapTestIdentityRegistration();
    await identity.enterUsername(aliceName);
    await identity.enterPhoneNumber(alicePhone);
    await identity.tapRegister();
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await identity.verifySuccess();

    // =========================================================================
    // 2. Guardian Flow
    // =========================================================================
    debugPrint('--- Starting Guardian Flow ---');
    // Go out to Welcome or just back to previous
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Create a Guardian User (Bob) via API
    final bobName = 'Bob_Guardian_$uniqueId';
    final bobPhone = '+977${(1000000000 + random.nextInt(900000000))}';
    final bobRes = await api.registerUser(
      username: bobName,
      phoneNumber: bobPhone,
    );
    final bobId = bobRes['user']['id'];

    // Navigate to Guardian Page
    final guardianBtn = find.byKey(const Key('btn_guardian_manage'));
    await tester.ensureVisible(guardianBtn);
    await tester.tap(guardianBtn);
    await tester.pumpAndSettle();

    // Invite Bob
    await guardian.verifyVisible();
    await guardian.enterGuardianPhone(bobPhone);
    await guardian.tapInvite();
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await guardian.verifyGuardianStatus(bobName, 'pending');

    // Bob accepts via API
    final relationships = await api.getGuardians(bobId);
    final protectList = relationships['protecting'] as List;
    final rel = protectList.firstWhere(
      (r) => r['identity_phone'] == alicePhone,
    );
    await api.acceptGuardian(relationshipId: rel['id']);

    // Refresh UI
    await guardian.tapRefresh();
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await guardian.verifyGuardianStatus(bobName, 'active');

    // =========================================================================
    // 3. Marketplace Flow
    // =========================================================================
    debugPrint('--- Starting Marketplace Flow ---');
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Navigate to Marketplace
    // Wait for any previous SnackBars to dismiss
    await tester.pumpAndSettle(const Duration(seconds: 4));

    final mpButton = find.byKey(const Key('btn_marketplace'));
    await tester.ensureVisible(mpButton);
    await tester.tap(mpButton, warnIfMissed: false);
    await tester.pumpAndSettle();

    await marketplace.verifyVisible();
    await marketplace.tapCreateOrder();
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await marketplace.verifyOrderCreated();

    // =========================================================================
    // 4. Notification Flow
    // =========================================================================
    debugPrint('--- Starting Notification Flow ---');
    // Ensure we are connected to WS (should be auto connected since we logged in as Alice)
    // Bob (Guardian) creates an order for Alice
    await api.createOrder(
      creatorLookupHash: bobRes['user']['phone_hash'],
      type: 'buy',
      localAmount: 250,
      localCurrency: 'NPR',
      telecomProvider: 'NCELL',
      phoneNumber: bobPhone,
      recipientPhone: alicePhone,
    );

    // Verify Notification SnackBar
    await tester.pumpAndSettle(const Duration(seconds: 5));
    expect(find.text('New P2P Order'), findsOneWidget);
    expect(find.textContaining('250 NPR'), findsOneWidget);

    debugPrint('--- Full Suite Completed Successfully ---');
  });
}
