/// Environment configuration for the simulator app.
///
/// Supports three environments:
/// - **simulator**: Local Docker-based simulation (default for development)
/// - **staging**: Cloudflare Workers staging (Sepolia testnet)
/// - **production**: Production environment
library;

enum Environment { simulator, staging, production }

class EnvironmentConfig {
  final Environment environment;
  final String backendBaseUrl;
  final String rpcUrl;
  final int chainId;
  final String identityContractAddress;
  final String escrowContractAddress;
  final String daiContractAddress;
  final String? ussdServiceUrl;
  final String? telegramServiceUrl;
  final String? fcmServiceUrl;

  const EnvironmentConfig({
    required this.environment,
    required this.backendBaseUrl,
    required this.rpcUrl,
    required this.chainId,
    required this.identityContractAddress,
    required this.escrowContractAddress,
    required this.daiContractAddress,
    this.ussdServiceUrl,
    this.telegramServiceUrl,
    this.fcmServiceUrl,
  });

  /// Simulator Host (configurable via --dart-define=SIMULATOR_HOST=...)
  static const String simulatorHost = String.fromEnvironment(
    'SIMULATOR_HOST',
    defaultValue: '192.168.1.172',
  );

  /// Simulator environment - connects to local Docker services
  static const simulator = EnvironmentConfig(
    environment: Environment.simulator,
    backendBaseUrl: 'http://$simulatorHost:3001',
    rpcUrl: 'http://$simulatorHost:8546',
    chainId: 31337,
    // Default Anvil deployment addresses
    identityContractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    escrowContractAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    daiContractAddress: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    // Simulator-specific services
    ussdServiceUrl: 'http://$simulatorHost:4004',
    telegramServiceUrl: 'http://$simulatorHost:4006',
    fcmServiceUrl: 'ws://$simulatorHost:4007/ws',
  );

  /// Staging environment - Sepolia testnet with Cloudflare Workers
  static const staging = EnvironmentConfig(
    environment: Environment.staging,
    backendBaseUrl: 'https://iamkey-backend-staging.missulotamit.workers.dev',
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
    chainId: 11155111,
    identityContractAddress: '0xYourSepoliaIdentityContract',
    escrowContractAddress: '0xYourSepoliaEscrowContract',
    daiContractAddress: '0xYourSepoliaDaiContract',
  );

  /// Production environment
  static const production = EnvironmentConfig(
    environment: Environment.production,
    backendBaseUrl: 'https://api.iamkey.id',
    rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/YOUR_KEY',
    chainId: 8453, // Base Mainnet
    identityContractAddress: '0xYourProductionIdentityContract',
    escrowContractAddress: '0xYourProductionEscrowContract',
    daiContractAddress: '0xYourProductionDaiContract',
  );

  /// Get config from environment name (for --dart-define)
  static EnvironmentConfig fromName(String name) {
    switch (name.toLowerCase()) {
      case 'simulator':
        return simulator;
      case 'staging':
        return staging;
      case 'production':
        return production;
      default:
        return simulator; // Default to simulator for dev
    }
  }

  /// Get current environment from dart-define
  static EnvironmentConfig get current {
    const envName = String.fromEnvironment(
      'ENVIRONMENT',
      defaultValue: 'simulator',
    );
    return fromName(envName);
  }

  bool get isSimulator => environment == Environment.simulator;
  bool get isStaging => environment == Environment.staging;
  bool get isProduction => environment == Environment.production;
}
