import 'dart:io';

import 'package:dio/dio.dart';

import 'models/models.dart';

export 'models/models.dart';

/// Client for interacting with the simulator's sim-control API.
///
/// Provides access to:
/// - Time manipulation (fast-forward, set timestamp)
/// - Chaos injection (latency, error rates)
/// - State snapshots (create, restore)
/// - Scenario execution
///
/// Usage:
/// ```dart
/// final client = SimulatorClient.fromEnvironment();
/// await client.fastForwardTime(3600); // Skip 1 hour
/// await client.setChaos(latencyMs: 500, errorRate: 0.1);
/// final result = await client.runScenario('p2p-trade');
/// ```
class SimulatorClient {
  final String simControlUrl;
  final String backendUrl;
  final Dio _dio;

  SimulatorClient({
    required this.simControlUrl,
    required this.backendUrl,
    Dio? dio,
  }) : _dio = dio ?? Dio();

  /// Creates a client from environment variables.
  ///
  /// Uses:
  /// - `SIM_CONTROL_URL` (default: http://localhost:4003)
  /// - `BACKEND_URL` (default: http://localhost:3000)
  factory SimulatorClient.fromEnvironment({Dio? dio}) {
    return SimulatorClient(
      simControlUrl:
          Platform.environment['SIM_CONTROL_URL'] ?? 'http://localhost:4003',
      backendUrl:
          Platform.environment['BACKEND_URL'] ?? 'http://localhost:3000',
      dio: dio,
    );
  }

  // ===========================================================================
  // HEALTH
  // ===========================================================================

  /// Check if sim-control is healthy.
  Future<ServiceHealth> getHealth() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$simControlUrl/health',
    );
    return ServiceHealth.fromJson(response.data!);
  }

  /// Wait for all services to be healthy, with timeout.
  Future<bool> waitForServices({
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      try {
        final health = await getHealth();
        if (health.isHealthy) return true;
      } catch (_) {
        // Service not ready yet
      }
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    return false;
  }

  // ===========================================================================
  // TIME MANIPULATION
  // ===========================================================================

  /// Fast-forward blockchain time by the specified number of seconds.
  Future<void> fastForwardTime(int seconds) async {
    await _dio.post<Map<String, dynamic>>(
      '$simControlUrl/time/fast-forward',
      data: {'seconds': seconds},
    );
  }

  /// Set the next block's timestamp to a specific Unix timestamp.
  Future<void> setTimestamp(int timestamp) async {
    await _dio.post<Map<String, dynamic>>(
      '$simControlUrl/time/set-timestamp',
      data: {'timestamp': timestamp},
    );
  }

  /// Get the current blockchain timestamp.
  Future<int> getCurrentTimestamp() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$simControlUrl/time/current',
    );
    return response.data!['timestamp'] as int;
  }

  // ===========================================================================
  // CHAOS INJECTION
  // ===========================================================================

  /// Get current chaos configuration.
  Future<ChaosConfig> getChaosConfig() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$simControlUrl/chaos/config',
    );
    return ChaosConfig.fromJson(response.data!);
  }

  /// Set chaos injection parameters.
  ///
  /// - [latencyMs]: Additional latency to inject (0 = no latency)
  /// - [errorRate]: Probability of random errors (0.0 - 1.0)
  Future<ChaosConfig> setChaos({int? latencyMs, double? errorRate}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$simControlUrl/chaos/config',
      data: {
        if (latencyMs != null) 'latencyMs': latencyMs,
        if (errorRate != null) 'errorRate': errorRate,
      },
    );
    return ChaosConfig.fromJson(
      response.data!['config'] as Map<String, dynamic>,
    );
  }

  /// Reset chaos to defaults (no latency, no errors).
  Future<void> resetChaos() async {
    await setChaos(latencyMs: 0, errorRate: 0);
  }

  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  /// Create a named snapshot of the current blockchain and database state.
  ///
  /// Returns the snapshot ID for later restoration.
  Future<String> createSnapshot(String name) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$simControlUrl/state/snapshot',
      data: {'name': name},
    );
    return response.data!['snapshotId'] as String;
  }

  /// Restore state to a previously created snapshot.
  Future<void> restoreSnapshot(String snapshotId) async {
    await _dio.post<Map<String, dynamic>>(
      '$simControlUrl/state/restore',
      data: {'snapshotId': snapshotId},
    );
  }

  /// List all available snapshots.
  Future<List<Snapshot>> listSnapshots() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$simControlUrl/state/snapshots',
    );
    final snapshots = response.data!['snapshots'] as List;
    return snapshots
        .map((s) => Snapshot.fromJson(s as Map<String, dynamic>))
        .toList();
  }

  // ===========================================================================
  // SCENARIO EXECUTION
  // ===========================================================================

  /// Trigger a named scenario to run.
  ///
  /// Available scenarios: 'p2p-trade', 'guardian-recovery', 'dispute'
  Future<String> runScenario(String scenarioName) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$simControlUrl/scenarios/trigger',
      data: {'scenarioName': scenarioName},
    );
    return response.data!['output'] as String;
  }

  /// List available scenarios.
  Future<List<String>> listScenarios() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$simControlUrl/scenarios/list',
    );
    final scenarios = response.data!['scenarios'] as List;
    return scenarios.cast<String>();
  }

  // ===========================================================================
  // BACKEND API
  // ===========================================================================

  /// Make a request to the backend API.
  Future<Map<String, dynamic>> backendGet(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$backendUrl$path',
      queryParameters: queryParameters,
    );
    return response.data!;
  }

  /// Make a POST request to the backend API.
  Future<Map<String, dynamic>> backendPost(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$backendUrl$path',
      data: data,
    );
    return response.data!;
  }
}
