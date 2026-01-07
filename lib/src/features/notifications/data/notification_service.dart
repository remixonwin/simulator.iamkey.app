import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:simulator/src/core/config/environment.dart';
import 'package:simulator/src/core/config/simulator_api_client.dart';
import 'package:uuid/uuid.dart';

class NotificationService {
  final SimulatorApiClient _apiClient;
  WebSocketChannel? _channel;
  final _controller = StreamController<Map<String, dynamic>>.broadcast();
  String? _token;

  NotificationService(this._apiClient);

  Stream<Map<String, dynamic>> get notifications => _controller.stream;

  Future<void> initialize(String userId) async {
    // 1. Generate or retrieve token (for now generate new one on each init)
    _token = const Uuid().v4();
    debugPrint('[Notification] Generated token: $_token');

    // 2. Register with backend
    try {
      await _apiClient.updateFcmToken(userId, _token!);
      debugPrint('[Notification] Registered token with backend');
    } catch (e) {
      debugPrint('[Notification] Failed to register token: $e');
      return;
    }

    // 3. Connect to WebSocket
    _connect();
  }

  void _connect() {
    if (_token == null) return;

    final wsUrl = '${EnvironmentConfig.simulator.fcmServiceUrl}?token=$_token';
    debugPrint('[Notification] Connecting to WS: $wsUrl');

    try {
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
      _channel!.stream.listen(
        (message) {
          debugPrint('[Notification] Received: $message');
          try {
            final data = jsonDecode(message);
            if (data['type'] == 'notification') {
              // fcm-mock wraps payload in "payload"
              _controller.add(data['payload']);
            }
          } catch (e) {
            debugPrint('[Notification] Parse error: $e');
          }
        },
        onError: (e) => debugPrint('[Notification] WS Error: $e'),
        onDone: () => debugPrint('[Notification] WS Closed'),
      );
    } catch (e) {
      debugPrint('[Notification] Connection failed: $e');
    }
  }

  void dispose() {
    _channel?.sink.close();
    _controller.close();
  }
}
