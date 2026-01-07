/// Data models for simulator API responses.
library;

import 'package:json_annotation/json_annotation.dart';

part 'models.g.dart';

/// Result of a scenario step execution.
@JsonSerializable()
class ScenarioStepResult {
  final String name;
  final bool success;
  final int duration;
  final String? error;

  ScenarioStepResult({
    required this.name,
    required this.success,
    required this.duration,
    this.error,
  });

  factory ScenarioStepResult.fromJson(Map<String, dynamic> json) =>
      _$ScenarioStepResultFromJson(json);
  Map<String, dynamic> toJson() => _$ScenarioStepResultToJson(this);
}

/// Result of a full scenario execution.
@JsonSerializable()
class ScenarioResult {
  final bool success;
  final int duration;
  final List<ScenarioStepResult> steps;
  final String? error;

  ScenarioResult({
    required this.success,
    required this.duration,
    required this.steps,
    this.error,
  });

  factory ScenarioResult.fromJson(Map<String, dynamic> json) =>
      _$ScenarioResultFromJson(json);
  Map<String, dynamic> toJson() => _$ScenarioResultToJson(this);
}

/// Configuration for chaos injection.
@JsonSerializable()
class ChaosConfig {
  final int latencyMs;
  final double errorRate;

  ChaosConfig({this.latencyMs = 0, this.errorRate = 0.0});

  factory ChaosConfig.fromJson(Map<String, dynamic> json) =>
      _$ChaosConfigFromJson(json);
  Map<String, dynamic> toJson() => _$ChaosConfigToJson(this);
}

/// Blockchain state snapshot metadata.
@JsonSerializable()
class Snapshot {
  final String id;
  final String name;
  final DateTime createdAt;

  Snapshot({required this.id, required this.name, required this.createdAt});

  factory Snapshot.fromJson(Map<String, dynamic> json) =>
      _$SnapshotFromJson(json);
  Map<String, dynamic> toJson() => _$SnapshotToJson(this);
}

/// Health status of a simulator service.
@JsonSerializable()
class ServiceHealth {
  final String status;
  final ChaosConfig? chaos;

  ServiceHealth({required this.status, this.chaos});

  factory ServiceHealth.fromJson(Map<String, dynamic> json) =>
      _$ServiceHealthFromJson(json);
  Map<String, dynamic> toJson() => _$ServiceHealthToJson(this);

  bool get isHealthy => status == 'healthy';
}

/// Simulated user from the database.
@JsonSerializable()
class SimulatedUser {
  final String id;
  final String username;
  @JsonKey(name: 'phone_number')
  final String phoneNumber;
  @JsonKey(name: 'phone_hash')
  final String phoneHash;
  @JsonKey(name: 'wallet_address')
  final String? walletAddress;
  final int balance;

  SimulatedUser({
    required this.id,
    required this.username,
    required this.phoneNumber,
    required this.phoneHash,
    this.walletAddress,
    this.balance = 0,
  });

  factory SimulatedUser.fromJson(Map<String, dynamic> json) =>
      _$SimulatedUserFromJson(json);
  Map<String, dynamic> toJson() => _$SimulatedUserToJson(this);
}
