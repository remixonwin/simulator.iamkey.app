import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/services/backend_service.dart';
import '../../../adb/presentation/pages/adb_connect_form.dart';
import '../widgets/glass_card.dart';
import '../../../identity/presentation/pages/register_page.dart';
import '../../../identity/presentation/pages/guardian_page.dart';
import '../../../identity/presentation/pages/marketplace_page.dart';
import '../../../notifications/presentation/providers/notification_provider.dart';

class WelcomePage extends ConsumerWidget {
  const WelcomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Listen for notifications
    ref.listen(notificationStreamProvider, (previous, next) {
      next.whenData((payload) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    payload['title'],
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(payload['body']),
                ],
              ),
              backgroundColor: Colors.blueAccent,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      });
    });

    return Scaffold(
      body: Stack(
        children: [
          // Background Glow
          Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 400,
              height: 400,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Theme.of(
                  context,
                ).colorScheme.primary.withValues(alpha: 0.15),
              ),
            ),
          ),
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.rocket_launch_rounded,
                    size: 80,
                    color: Colors.white,
                  ),
                  const SizedBox(height: 32),
                  Text(
                    'Welcome to Antigravity',
                    style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      letterSpacing: -1,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Your flutter project is ready with a clean architecture and premium design.',
                    style: Theme.of(
                      context,
                    ).textTheme.bodyLarge?.copyWith(color: Colors.white70),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 48),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 500),
                    child: const GlassCard(child: AdbConnectForm()),
                  ),
                  const SizedBox(height: 32),
                  TextButton.icon(
                    onPressed: () async {
                      final backend = ref.read(backendServiceProvider.notifier);
                      final data = await backend.getWelcomeData();

                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(data['message'] ?? 'Connected'),
                            backgroundColor: data['title'] == 'Error'
                                ? Colors.red.shade800
                                : Colors.green.shade800,
                            behavior: SnackBarBehavior.floating,
                          ),
                        );
                      }
                    },
                    icon: const Icon(Icons.api_rounded, size: 18),
                    label: const Text(
                      'Check Backend Status',
                      style: TextStyle(color: Colors.white30),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    key: const Key('btn_identity_reg'),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const RegisterPage()),
                      );
                    },
                    icon: const Icon(Icons.person_add_rounded, size: 18),
                    label: const Text(
                      'Test Identity Registration',
                      style: TextStyle(color: Colors.white30),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    key: const Key('btn_guardian_manage'),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const GuardianPage()),
                      );
                    },
                    icon: const Icon(Icons.security_rounded, size: 18),
                    label: const Text(
                      'Manage Guardians',
                      style: TextStyle(color: Colors.white30),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    key: const Key('btn_marketplace'),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const MarketplacePage(),
                        ),
                      );
                    },
                    icon: const Icon(Icons.storefront_rounded, size: 18),
                    label: const Text(
                      'P2P Marketplace',
                      style: TextStyle(color: Colors.white30),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
