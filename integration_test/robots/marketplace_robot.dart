import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class MarketplaceRobot {
  final WidgetTester tester;
  const MarketplaceRobot(this.tester);

  Future<void> verifyVisible() async {
    expect(find.text('P2P Marketplace'), findsOneWidget);
  }

  Future<void> tapCreateOrder() async {
    final fab = find.byType(FloatingActionButton);
    await tester.tap(fab);
    await tester.pumpAndSettle();
  }

  Future<void> verifyOrderCreated() async {
    expect(find.text('Order Created!'), findsOneWidget);
    // Listing verification
    // Relaxed matching
    expect(find.textContaining('SELL'), findsWidgets);
    expect(find.textContaining('NPR'), findsWidgets);
  }
}
