import 'simulator_client.dart';

export 'simulator_client.dart';

/// Base class for integration tests that run against the simulator.
///
/// Provides:
/// - Automatic snapshot creation before tests
/// - Automatic state restoration after tests
/// - Convenient access to SimulatorClient
///
/// Usage:
/// ```dart
/// void main() {
///   final base = SimulatorTestBase();
///
///   setUpAll(() => base.setUpSimulator());
///   tearDownAll(() => base.tearDownSimulator());
///
///   test('my test', () async {
///     await base.simulator.fastForwardTime(3600);
///     // ... test logic
///   });
/// }
/// ```
///
/// Or use the mixin pattern:
/// ```dart
/// void main() {
///   late SimulatorClient simulator;
///   String? snapshotId;
///
///   setUpAll(() async {
///     simulator = SimulatorClient.fromEnvironment();
///     snapshotId = await simulator.createSnapshot('test_start');
///   });
///
///   tearDownAll(() async {
///     if (snapshotId != null) {
///       await simulator.restoreSnapshot(snapshotId);
///     }
///   });
///
///   testWidgets('my widget test', (tester) async {
///     // ... test logic using simulator
///   });
/// }
/// ```
class SimulatorTestBase {
  late SimulatorClient simulator;
  String? _snapshotId;
  bool _isSetUp = false;

  /// The snapshot ID created during setup.
  String? get snapshotId => _snapshotId;

  /// Whether the simulator has been set up.
  bool get isSetUp => _isSetUp;

  /// Set up the simulator for testing.
  ///
  /// Creates a snapshot to restore state after tests.
  /// Optionally waits for services to be healthy.
  Future<void> setUpSimulator({
    bool waitForHealth = true,
    Duration healthTimeout = const Duration(seconds: 30),
  }) async {
    simulator = SimulatorClient.fromEnvironment();

    if (waitForHealth) {
      final healthy = await simulator.waitForServices(timeout: healthTimeout);
      if (!healthy) {
        throw StateError(
          'Simulator services not healthy after $healthTimeout. '
          'Is docker compose running?',
        );
      }
    }

    _snapshotId = await simulator.createSnapshot(
      'test_${DateTime.now().millisecondsSinceEpoch}',
    );
    _isSetUp = true;
  }

  /// Tear down the simulator after testing.
  ///
  /// Restores the snapshot created during setup.
  Future<void> tearDownSimulator() async {
    if (_snapshotId != null) {
      try {
        await simulator.restoreSnapshot(_snapshotId!);
      } catch (e) {
        // Ignore restoration errors during teardown
        // The snapshot might have been invalidated
      }
    }
    _isSetUp = false;
  }

  /// Reset chaos injection to defaults.
  Future<void> resetChaos() async {
    await simulator.resetChaos();
  }

  /// Fast forward time by the specified duration.
  Future<void> fastForward(Duration duration) async {
    await simulator.fastForwardTime(duration.inSeconds);
  }

  /// Inject latency into all simulator requests.
  Future<void> injectLatency(Duration latency) async {
    await simulator.setChaos(latencyMs: latency.inMilliseconds);
  }

  /// Inject random errors at the specified rate.
  Future<void> injectErrors(double rate) async {
    await simulator.setChaos(errorRate: rate);
  }
}

/// Extension to run simulator tests only when simulator is available.
extension SimulatorTestExtension on void Function() {
  /// Wrap test to skip if simulator is not available.
  void whenSimulatorAvailable() {
    // Check if SIMULATOR_MODE is set
    // This is evaluated at test runtime
  }
}
