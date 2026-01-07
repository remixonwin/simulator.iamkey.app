/// Simulator Client Package
///
/// Provides Dart access to the simulator infrastructure for testing.
///
/// Usage:
/// ```dart
/// import 'package:simulator/src/core/simulator.dart';
///
/// final client = SimulatorClient.fromEnvironment();
/// await client.fastForwardTime(3600);
/// ```
library;

export 'simulator_client.dart';
export 'simulator_test_base.dart';
export 'models/models.dart';
