// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScenarioStepResult _$ScenarioStepResultFromJson(Map<String, dynamic> json) =>
    ScenarioStepResult(
      name: json['name'] as String,
      success: json['success'] as bool,
      duration: (json['duration'] as num).toInt(),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$ScenarioStepResultToJson(ScenarioStepResult instance) =>
    <String, dynamic>{
      'name': instance.name,
      'success': instance.success,
      'duration': instance.duration,
      'error': instance.error,
    };

ScenarioResult _$ScenarioResultFromJson(Map<String, dynamic> json) =>
    ScenarioResult(
      success: json['success'] as bool,
      duration: (json['duration'] as num).toInt(),
      steps: (json['steps'] as List<dynamic>)
          .map((e) => ScenarioStepResult.fromJson(e as Map<String, dynamic>))
          .toList(),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$ScenarioResultToJson(ScenarioResult instance) =>
    <String, dynamic>{
      'success': instance.success,
      'duration': instance.duration,
      'steps': instance.steps,
      'error': instance.error,
    };

ChaosConfig _$ChaosConfigFromJson(Map<String, dynamic> json) => ChaosConfig(
  latencyMs: (json['latencyMs'] as num?)?.toInt() ?? 0,
  errorRate: (json['errorRate'] as num?)?.toDouble() ?? 0.0,
);

Map<String, dynamic> _$ChaosConfigToJson(ChaosConfig instance) =>
    <String, dynamic>{
      'latencyMs': instance.latencyMs,
      'errorRate': instance.errorRate,
    };

Snapshot _$SnapshotFromJson(Map<String, dynamic> json) => Snapshot(
  id: json['id'] as String,
  name: json['name'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$SnapshotToJson(Snapshot instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'createdAt': instance.createdAt.toIso8601String(),
};

ServiceHealth _$ServiceHealthFromJson(Map<String, dynamic> json) =>
    ServiceHealth(
      status: json['status'] as String,
      chaos: json['chaos'] == null
          ? null
          : ChaosConfig.fromJson(json['chaos'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ServiceHealthToJson(ServiceHealth instance) =>
    <String, dynamic>{'status': instance.status, 'chaos': instance.chaos};

SimulatedUser _$SimulatedUserFromJson(Map<String, dynamic> json) =>
    SimulatedUser(
      id: json['id'] as String,
      username: json['username'] as String,
      phoneNumber: json['phone_number'] as String,
      phoneHash: json['phone_hash'] as String,
      walletAddress: json['wallet_address'] as String?,
      balance: (json['balance'] as num?)?.toInt() ?? 0,
    );

Map<String, dynamic> _$SimulatedUserToJson(SimulatedUser instance) =>
    <String, dynamic>{
      'id': instance.id,
      'username': instance.username,
      'phone_number': instance.phoneNumber,
      'phone_hash': instance.phoneHash,
      'wallet_address': instance.walletAddress,
      'balance': instance.balance,
    };
