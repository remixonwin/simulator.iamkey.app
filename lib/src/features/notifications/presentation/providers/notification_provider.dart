import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:simulator/src/core/services/simulator_provider.dart';
import 'package:simulator/src/features/identity/presentation/providers/user_provider.dart';
import '../../data/notification_service.dart';

final notificationServiceProvider = Provider<NotificationService>((ref) {
  final api = ref.watch(simulatorApiProvider);
  return NotificationService(api);
});

final notificationStreamProvider = StreamProvider<Map<String, dynamic>>((ref) {
  final service = ref.watch(notificationServiceProvider);

  // Auto-initialize when user is logged in
  final user = ref.watch(currentUserProvider);
  if (user != null) {
    service.initialize(user['id']);
  }

  return service.notifications;
});
