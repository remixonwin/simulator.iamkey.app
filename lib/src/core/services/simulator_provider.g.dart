// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'simulator_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(simulatorApi)
final simulatorApiProvider = SimulatorApiProvider._();

final class SimulatorApiProvider
    extends
        $FunctionalProvider<
          SimulatorApiClient,
          SimulatorApiClient,
          SimulatorApiClient
        >
    with $Provider<SimulatorApiClient> {
  SimulatorApiProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'simulatorApiProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$simulatorApiHash();

  @$internal
  @override
  $ProviderElement<SimulatorApiClient> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  SimulatorApiClient create(Ref ref) {
    return simulatorApi(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SimulatorApiClient value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SimulatorApiClient>(value),
    );
  }
}

String _$simulatorApiHash() => r'ec24d90e6fd05f9d6e17f430ea6f196d38904874';
