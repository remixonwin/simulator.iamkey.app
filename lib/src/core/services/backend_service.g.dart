// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'backend_service.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(BackendService)
final backendServiceProvider = BackendServiceProvider._();

final class BackendServiceProvider
    extends $NotifierProvider<BackendService, void> {
  BackendServiceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'backendServiceProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$backendServiceHash();

  @$internal
  @override
  BackendService create() => BackendService();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(void value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<void>(value),
    );
  }
}

String _$backendServiceHash() => r'1b54a831e2495b5d9eb06fa8e269ced7cc33de57';

abstract class _$BackendService extends $Notifier<void> {
  void build();
  @$mustCallSuper
  @override
  void runBuild() {
    final ref = this.ref as $Ref<void, void>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<void, void>,
              void,
              Object?,
              Object?
            >;
    element.handleCreate(ref, build);
  }
}
