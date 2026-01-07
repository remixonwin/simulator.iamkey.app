import 'package:flutter/foundation.dart';
import '../services/api_service.dart';

class SimulatorProvider extends ChangeNotifier {
  final ApiService apiService;

  SimulatorProvider({required this.apiService}) {
    _loadInitialData();
  }

  // State
  int _currentTimestamp = DateTime.now().millisecondsSinceEpoch ~/ 1000;
  Map<String, dynamic> _chaosConfig = {};
  List<String> _scenarios = [];
  List<Map<String, dynamic>> _snapshots = [];
  Map<String, dynamic> _serviceHealth = {};
  bool _isLoading = false;
  String? _error;

  // Getters
  int get currentTimestamp => _currentTimestamp;
  Map<String, dynamic> get chaosConfig => _chaosConfig;
  List<String> get scenarios => _scenarios;
  List<Map<String, dynamic>> get snapshots => _snapshots;
  Map<String, dynamic> get serviceHealth => _serviceHealth;
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<void> _loadInitialData() async {
    await Future.wait([
      refreshTime(),
      refreshChaosConfig(),
      refreshScenarios(),
      refreshSnapshots(),
      refreshServiceHealth(),
    ]);
  }

  Future<void> refreshTime() async {
    try {
      final result = await apiService.getCurrentTime();
      _currentTimestamp = result['timestamp'] ?? _currentTimestamp;
      _error = null;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to get time: $e';
      notifyListeners();
    }
  }

  Future<void> setTime(int timestamp) async {
    _isLoading = true;
    notifyListeners();

    try {
      await apiService.setTime(timestamp);
      _currentTimestamp = timestamp;
      _error = null;
    } catch (e) {
      _error = 'Failed to set time: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> increaseTime(int seconds) async {
    _isLoading = true;
    notifyListeners();

    try {
      final result = await apiService.increaseTime(seconds);
      _currentTimestamp = result['newTimestamp'] ?? _currentTimestamp;
      _error = null;
    } catch (e) {
      _error = 'Failed to increase time: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshChaosConfig() async {
    try {
      _chaosConfig = await apiService.getChaosConfig();
      _error = null;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to get chaos config: $e';
      notifyListeners();
    }
  }

  Future<void> setChaos({
    required String service,
    required int latencyMs,
    required int errorRate,
  }) async {
    _isLoading = true;
    notifyListeners();

    try {
      await apiService.setChaos(
        service: service,
        latencyMs: latencyMs,
        errorRate: errorRate,
      );
      await refreshChaosConfig();
      _error = null;
    } catch (e) {
      _error = 'Failed to set chaos: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshScenarios() async {
    try {
      _scenarios = await apiService.listScenarios();
      _error = null;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to list scenarios: $e';
      notifyListeners();
    }
  }

  Future<void> triggerScenario(String scenarioName) async {
    _isLoading = true;
    notifyListeners();

    try {
      await apiService.triggerScenario(scenarioName);
      _error = null;
    } catch (e) {
      _error = 'Failed to trigger scenario: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshSnapshots() async {
    try {
      _snapshots = await apiService.listSnapshots();
      _error = null;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to list snapshots: $e';
      notifyListeners();
    }
  }

  Future<void> createSnapshot(String name) async {
    _isLoading = true;
    notifyListeners();

    try {
      await apiService.createSnapshot(name);
      await refreshSnapshots();
      _error = null;
    } catch (e) {
      _error = 'Failed to create snapshot: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> restoreSnapshot(String snapshotId) async {
    _isLoading = true;
    notifyListeners();

    try {
      await apiService.restoreSnapshot(snapshotId);
      await _loadInitialData();
      _error = null;
    } catch (e) {
      _error = 'Failed to restore snapshot: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshServiceHealth() async {
    try {
      _serviceHealth = await apiService.getServiceHealth();
      _error = null;
      notifyListeners();
    } catch (e) {
      _serviceHealth = {}; // Reset on error or keep old?
      // better to keep old or show error
      _error = 'Failed to get service health: $e';
      notifyListeners();
    }
  }

  // User Management
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> get users => _users;

  Future<void> refreshUsers() async {
    try {
      final result = await apiService.getSimulatedUsers();
      _users = List<Map<String, dynamic>>.from(result['users'] ?? []);
      _error = null;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to load users: $e';
      notifyListeners();
    }
  }

  Future<void> updateUssdBalance(String phoneNumber, double amount) async {
    _isLoading = true;
    notifyListeners();
    try {
      await apiService.updateUssdBalance(
        phoneNumber: phoneNumber,
        amount: amount,
      );
      await refreshUsers();
      _error = null;
    } catch (e) {
      _error = 'Failed to update USSD balance: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> topupChainBalance(String walletAddress, double amount) async {
    _isLoading = true;
    notifyListeners();
    try {
      await apiService.topupChainBalance(
        walletAddress: walletAddress,
        amount: amount,
      );
      // Wait a bit or optimistic update? For now just refresh
      await Future.delayed(const Duration(seconds: 1)); // Wait for block
      await refreshUsers();
      _error = null;
    } catch (e) {
      _error = 'Failed to topup chain balance: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Blockchain Monitor
  Map<String, dynamic> _blockchainStats = {};
  List<Map<String, dynamic>> _recentBlocks = [];
  Map<String, dynamic> get blockchainStats => _blockchainStats;
  List<Map<String, dynamic>> get recentBlocks => _recentBlocks;

  Future<void> refreshBlockchain() async {
    try {
      final stats = await apiService.getBlockchainStats();
      final blocks = await apiService.getRecentBlocks();
      _blockchainStats = stats;
      _recentBlocks = List<Map<String, dynamic>>.from(blocks['blocks'] ?? []);
      _error = null;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to fetch blockchain data: $e';
      notifyListeners();
    }
  }
}
