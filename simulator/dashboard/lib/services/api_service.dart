import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  final String baseUrl;

  ApiService({required this.baseUrl});

  // Time Manipulation
  Future<Map<String, dynamic>> setTime(int timestamp) async {
    final response = await http.post(
      Uri.parse('$baseUrl/sim-control/time/set'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'timestamp': timestamp}),
    );
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> increaseTime(int seconds) async {
    final response = await http.post(
      Uri.parse('$baseUrl/sim-control/time/increase'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'seconds': seconds}),
    );
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getCurrentTime() async {
    final response = await http.get(
      Uri.parse('$baseUrl/sim-control/time/current'),
    );
    return jsonDecode(response.body);
  }

  // Chaos Injection
  Future<Map<String, dynamic>> setChaos({
    required String service,
    required int latencyMs,
    required int errorRate,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/sim-control/chaos/set'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'service': service,
        'latencyMs': latencyMs,
        'errorRate': errorRate,
      }),
    );
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getChaosConfig() async {
    final response = await http.get(
      Uri.parse('$baseUrl/sim-control/chaos/config'),
    );
    return jsonDecode(response.body);
  }

  // Scenarios
  Future<Map<String, dynamic>> triggerScenario(String scenarioName) async {
    final response = await http.post(
      Uri.parse('$baseUrl/sim-control/scenarios/trigger'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'scenario': scenarioName}),
    );
    return jsonDecode(response.body);
  }

  Future<List<String>> listScenarios() async {
    final response = await http.get(
      Uri.parse('$baseUrl/sim-control/scenarios/list'),
    );
    final data = jsonDecode(response.body);
    return List<String>.from(data['scenarios'] ?? []);
  }

  // State Management
  Future<Map<String, dynamic>> createSnapshot(String name) async {
    final response = await http.post(
      Uri.parse('$baseUrl/sim-control/state/snapshot'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'name': name}),
    );
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> restoreSnapshot(String snapshotId) async {
    final response = await http.post(
      Uri.parse('$baseUrl/sim-control/state/restore'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'snapshotId': snapshotId}),
    );
    return jsonDecode(response.body);
  }

  Future<List<Map<String, dynamic>>> listSnapshots() async {
    final response = await http.get(
      Uri.parse('$baseUrl/sim-control/state/snapshots'),
    );
    final data = jsonDecode(response.body);
    return List<Map<String, dynamic>>.from(data['snapshots'] ?? []);
  }

  // Service Health
  Future<Map<String, dynamic>> getServiceHealth() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/health'));
      return jsonDecode(response.body);
    } catch (e) {
      return {'status': 'error', 'message': e.toString()};
    }
  }

  // User Management
  Future<Map<String, dynamic>> getSimulatedUsers() async {
    final response = await http.get(Uri.parse('$baseUrl/api/admin/users'));
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> updateUssdBalance({
    String? userId,
    String? phoneNumber,
    required double amount,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/admin/users/ussd-balance'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'userId': userId,
        'phoneNumber': phoneNumber,
        'amount': amount,
      }),
    );
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> topupChainBalance({
    required String walletAddress,
    required double amount,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/admin/users/chain-topup'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'walletAddress': walletAddress, 'amount': amount}),
    );
    return jsonDecode(response.body);
  }

  // Blockchain Monitor
  Future<Map<String, dynamic>> getBlockchainStats() async {
    final response = await http.get(Uri.parse('$baseUrl/api/blockchain/stats'));
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getRecentBlocks() async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/blockchain/blocks'),
    );
    return jsonDecode(response.body);
  }
}
