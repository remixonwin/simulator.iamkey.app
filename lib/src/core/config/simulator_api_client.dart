import 'package:dio/dio.dart';
import 'environment.dart';

/// API client configured for simulator environment.
///
/// Automatically uses the correct endpoints based on environment.
class SimulatorApiClient {
  final Dio _dio;
  final EnvironmentConfig _config;

  SimulatorApiClient({EnvironmentConfig? config})
    : _config = config ?? EnvironmentConfig.current,
      _dio = Dio() {
    _dio.options.baseUrl = _config.backendBaseUrl;
    _dio.options.connectTimeout = const Duration(seconds: 10);
    _dio.options.receiveTimeout = const Duration(seconds: 10);

    // Add logging in debug mode
    assert(() {
      _dio.interceptors.add(
        LogInterceptor(requestBody: true, responseBody: true),
      );
      return true;
    }());
  }

  EnvironmentConfig get config => _config;

  // ==========================================================================
  // USSD Simulation (only available in simulator mode)
  // ==========================================================================

  /// Dial a USSD code on a virtual phone.
  /// Only available when running against the local simulator.
  Future<Map<String, dynamic>> dialUssd({
    required String phoneNumber,
    required String ussdCode,
    String? pin,
  }) async {
    if (!_config.isSimulator) {
      throw UnsupportedError(
        'USSD simulation only available in simulator mode',
      );
    }

    final response = await Dio().post(
      '${_config.ussdServiceUrl}/ussd/dial',
      data: {
        'phone_number': phoneNumber,
        'ussd_code': ussdCode,
        if (pin != null) 'pin': pin,
      },
    );
    return response.data;
  }

  /// Get balance for a virtual phone.
  Future<double> getPhoneBalance(String phoneNumber) async {
    if (!_config.isSimulator) {
      throw UnsupportedError(
        'USSD simulation only available in simulator mode',
      );
    }

    final response = await Dio().get(
      '${_config.ussdServiceUrl}/ussd/phones/$phoneNumber',
    );
    return (response.data['phone']['balance'] as num).toDouble();
  }

  /// Transfer balance between virtual phones.
  Future<Map<String, dynamic>> transferBalance({
    required String fromPhone,
    required String toPhone,
    required double amount,
    String provider = 'NTC',
  }) async {
    // Generate USSD code based on provider
    String ussdCode;
    switch (provider) {
      case 'NTC':
        ussdCode = '*422*${amount.toInt()}*${toPhone.replaceAll('+', '')}#';
        break;
      case 'NCELL':
        ussdCode = '*17122*${amount.toInt()}*${toPhone.replaceAll('+', '')}#';
        break;
      case 'MTN':
        ussdCode =
            '*321*${toPhone.replaceAll('+', '')}*${amount.toInt()}*1234#';
        break;
      default:
        throw ArgumentError('Unknown provider: $provider');
    }

    return dialUssd(phoneNumber: fromPhone, ussdCode: ussdCode);
  }

  // ==========================================================================
  // Backend API
  // ==========================================================================

  /// Create a marketplace order.
  Future<Map<String, dynamic>> createOrder({
    required String creatorLookupHash,
    required String type, // 'buy' or 'sell'
    required double localAmount,
    required String localCurrency,
    required String telecomProvider,
    required String phoneNumber,
    String? recipientPhone,
    String countryCode = 'NP',
  }) async {
    final response = await _dio.post(
      '/marketplace/orders',
      data: {
        'creator_lookup_hash': creatorLookupHash,
        'type': type,
        'local_amount': localAmount,
        'local_currency': localCurrency,
        'telecom_provider': telecomProvider,
        'phone_number': phoneNumber,
        if (recipientPhone != null) 'recipient_phone': recipientPhone,
        'country_code': countryCode,
      },
    );
    return response.data;
  }

  /// Get trust score for a user.
  Future<Map<String, dynamic>> getTrustScore(String lookupHash) async {
    final response = await _dio.get(
      '/marketplace/trust-score',
      queryParameters: {'lookup_hash': lookupHash},
    );
    return response.data;
  }

  /// Get governance config.
  Future<Map<String, dynamic>> getGovernance() async {
    final response = await _dio.get('/marketplace/governance');
    return response.data;
  }

  /// Get marketplace orders.
  Future<Map<String, dynamic>> getOrders() async {
    final response = await _dio.get('/marketplace/orders');
    return response.data;
  }

  // ==========================================================================
  // Identity API
  // ==========================================================================

  /// Register a new simulated identity.
  Future<Map<String, dynamic>> registerUser({
    required String username,
    required String phoneNumber,
  }) async {
    final response = await _dio.post(
      '/identity/register',
      data: {'username': username, 'phone_number': phoneNumber},
    );
    return response.data;
  }

  /// Update FCM Token for a user.
  Future<Map<String, dynamic>> updateFcmToken(
    String userId,
    String token,
  ) async {
    final response = await _dio.post(
      '/identity/fcm-token',
      data: {'user_id': userId, 'fcm_token': token},
    );
    return response.data;
  }

  // ==========================================================================
  // Guardian API
  // ==========================================================================

  /// Invite a guardian.
  Future<Map<String, dynamic>> inviteGuardian({
    required String userId,
    required String guardianPhone,
  }) async {
    final response = await _dio.post(
      '/guardian/invite',
      data: {'user_id': userId, 'guardian_phone': guardianPhone},
    );
    return response.data;
  }

  /// Accept a guardian invite.
  Future<Map<String, dynamic>> acceptGuardian({
    required String relationshipId,
  }) async {
    final response = await _dio.post(
      '/guardian/accept',
      data: {'relationship_id': relationshipId},
    );
    return response.data;
  }

  /// Get guardian relationships.
  Future<Map<String, dynamic>> getGuardians(String userId) async {
    final response = await _dio.get(
      '/guardian/relationships',
      queryParameters: {'user_id': userId},
    );
    return response.data;
  }

  // ==========================================================================
  // Telegram Verification (simulator mode)
  // ==========================================================================

  /// Create a verification request.
  Future<Map<String, dynamic>> createVerification(String phoneNumber) async {
    if (!_config.isSimulator) {
      throw UnsupportedError(
        'Mock verification only available in simulator mode',
      );
    }

    final response = await Dio().post(
      '${_config.telegramServiceUrl}/verification/create',
      data: {'phone_number': phoneNumber},
    );
    return response.data;
  }

  /// Verify a phone number with code.
  Future<bool> verifyPhone(String phoneNumber, String code) async {
    if (!_config.isSimulator) {
      throw UnsupportedError(
        'Mock verification only available in simulator mode',
      );
    }

    final response = await Dio().post(
      '${_config.telegramServiceUrl}/verification/verify',
      data: {'phone_number': phoneNumber, 'code': code},
    );
    return response.data['success'] == true;
  }
}
