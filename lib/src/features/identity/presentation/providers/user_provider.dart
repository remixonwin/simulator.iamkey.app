import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'user_provider.g.dart';

@Riverpod(keepAlive: true)
class CurrentUser extends _$CurrentUser {
  @override
  Map<String, dynamic>? build() {
    return null;
  }

  void setUser(Map<String, dynamic> user) {
    state = user;
  }
}
