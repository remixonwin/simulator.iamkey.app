import 'package:dio/dio.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'backend_service.g.dart';

@riverpod
class BackendService extends _$BackendService {
  late final Dio _dio;

  @override
  void build() {
    _dio = Dio(
      BaseOptions(
        baseUrl: 'http://localhost:3000/api',
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 3),
      ),
    );
  }

  Future<Map<String, dynamic>> adbConnect(String ipAddress) async {
    try {
      final response = await _dio.post(
        '/adb/connect',
        data: {'ipAddress': ipAddress},
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return {
        'success': false,
        'message': e.response?.data?['message'] ?? 'Connection failed',
      };
    } catch (e) {
      return {'success': false, 'message': 'An unexpected error occurred'};
    }
  }

  Future<Map<String, dynamic>> getWelcomeData() async {
    try {
      final response = await _dio.get('/welcome');
      return response.data as Map<String, dynamic>;
    } catch (e) {
      return {'title': 'Error', 'message': 'Could not connect to backend'};
    }
  }

  Future<List<String>> getInstalledApps(String ipAddress) async {
    try {
      final response = await _dio.get(
        '/adb/apps',
        queryParameters: {'ipAddress': ipAddress},
      );
      return List<String>.from(response.data['packages']);
    } catch (e) {
      return [];
    }
  }

  Future<String?> getAppPid(String ipAddress, String packageName) async {
    try {
      final response = await _dio.get(
        '/adb/pid',
        queryParameters: {'ipAddress': ipAddress, 'packageName': packageName},
      );
      return response.data['pid']?.toString();
    } catch (e) {
      return null;
    }
  }
}
