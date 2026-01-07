import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:integration_test/integration_test.dart';
import 'package:simulator/main.dart' as app;
import 'package:simulator/src/core/config/simulator_api_client.dart';
import 'robots/welcome_robot.dart';
import 'robots/identity_robot.dart';
import 'dart:math';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Notification Flow', (tester) async {
    // 0. Setup: Create "Bob" via API
    final api = SimulatorApiClient();
    final random = Random();
    final bobName = 'Bob_Trader_${random.nextInt(1000)}';
    final bobPhone = '+977${(1000000000 + random.nextInt(900000000))}';
    final bobRes = await api.registerUser(
      username: bobName,
      phoneNumber: bobPhone,
    );
    final bobUser = bobRes['user'];

    // 1. Initialize App
    app.main();
    await tester.pumpAndSettle();

    final welcome = WelcomeRobot(tester);
    final identity = IdentityRobot(tester);

    // 2. Register "Alice" (Me)
    final alicePhone = '+977${(1000000000 + random.nextInt(900000000))}';
    await welcome.tapTestIdentityRegistration();
    await identity.enterUsername('Alice_Notify');
    await identity.enterPhoneNumber(alicePhone);
    await identity.tapRegister();
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await identity.verifySuccess();

    // 3. User is now logged in. Notification service should be active.
    // Wait a bit for WS connection
    await tester.pump(const Duration(seconds: 3));

    // 4. Trigger Notification: Bob creates order for Alice
    debugPrint('Bob creating order for Alice ($alicePhone)...');
    try {
      await api.createOrder(
        creatorLookupHash: bobUser['phone_hash'],
        type: 'sell',
        localAmount: 500,
        localCurrency: 'NPR',
        telecomProvider: 'NTC',
        phoneNumber: bobPhone,
        recipientPhone: alicePhone,
      );
    } catch (e) {
      debugPrint('Error creating order: $e');
      rethrow;
    }

    // 5. Verify SnackBar
    // Expect "New P2P Order"
    // Wait for WS message arrival
    await tester.pumpAndSettle(const Duration(seconds: 5));
    expect(find.text('New P2P Order'), findsOneWidget);
    expect(find.textContaining('500 NPR'), findsOneWidget);
  });
}
