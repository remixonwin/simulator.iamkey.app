import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:simulator/main.dart' as app;
import 'robots/welcome_robot.dart';
import 'robots/identity_robot.dart';
import 'robots/marketplace_robot.dart';
import 'dart:math';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Marketplace Workflow', (tester) async {
    // 1. Initialize
    app.main();
    await tester.pumpAndSettle();

    final welcome = WelcomeRobot(tester);
    final identity = IdentityRobot(tester);
    final marketplace = MarketplaceRobot(tester);

    // 2. Register Alice (random)
    final random = Random();
    final phone = '+977${(1000000000 + random.nextInt(900000000))}';
    final user = 'Alice_Trader_${random.nextInt(1000)}';

    await welcome.tapTestIdentityRegistration();
    await identity.enterUsername(user);
    await identity.enterPhoneNumber(phone);
    await identity.tapRegister();
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await identity.verifySuccess();

    // 3. Navigate to Marketplace
    await tester.pageBack();
    await tester.pumpAndSettle();

    final marketButton = find.text('P2P Marketplace');
    await tester.ensureVisible(marketButton);
    await tester.tap(marketButton);
    await tester.pumpAndSettle();

    // 4. Create Order
    await marketplace.verifyVisible();
    await marketplace.tapCreateOrder();

    // 5. Verify
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await marketplace.verifyOrderCreated();
  });
}
