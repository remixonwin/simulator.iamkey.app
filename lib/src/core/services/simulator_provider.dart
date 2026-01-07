import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../config/simulator_api_client.dart';

part 'simulator_provider.g.dart';

@riverpod
SimulatorApiClient simulatorApi(Ref ref) {
  return SimulatorApiClient();
}
