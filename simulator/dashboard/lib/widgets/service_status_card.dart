import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/simulator_provider.dart';

class ServiceStatusCard extends StatelessWidget {
  final bool expanded;

  const ServiceStatusCard({super.key, this.expanded = false});

  Color _getStatusColor(String status) {
    if (status == 'healthy') return Colors.green;
    if (status == 'error') return Colors.red;
    return Colors.orange;
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<SimulatorProvider>(
      builder: (context, provider, _) {
        final health = provider.serviceHealth;

        String getStatus(String key) {
          final status = health[key];
          if (status == 'ok') return 'healthy';
          if (status == 'error') return 'error';
          return 'unknown';
        }

        final services = [
          {
            'name': 'Anvil (Blockchain)',
            'port': '8545',
            'status': getStatus('anvil'),
          },
          {
            'name': 'PostgreSQL',
            'port': '5432',
            'status': getStatus('postgres'),
          },
          {'name': 'Redis', 'port': '6379', 'status': getStatus('redis')},
          {
            'name': 'Backend API',
            'port': '3000',
            'status': getStatus('backend'),
          },
          {
            'name': 'USSD Simulator',
            'port': '4000',
            'status': getStatus('ussd'),
          },
          {
            'name': 'Sim Control',
            'port': '4003',
            'status': getStatus('sim_control'),
          },
          {
            'name': 'Telegram Mock',
            'port': '4001',
            'status': getStatus('telegram'),
          },
          {'name': 'FCM Mock', 'port': '4002', 'status': getStatus('fcm')},
        ];

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.monitor_heart, color: Colors.green),
                        const SizedBox(width: 12),
                        Text(
                          'Services',
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.green.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: Colors.green,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            'All Systems Operational',
                            style: TextStyle(
                              color: Colors.green,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                if (expanded)
                  ...services.map((service) => _buildServiceTile(service))
                else
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          childAspectRatio: 3,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                    itemCount: services.length,
                    itemBuilder: (context, index) {
                      return _buildServiceChip(services[index]);
                    },
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildServiceTile(Map<String, String> service) {
    final color = _getStatusColor(service['status']!);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    service['name']!,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Port: ${service['port']}',
                    style: TextStyle(color: Colors.grey[400], fontSize: 14),
                  ),
                ],
              ),
            ),
            Icon(
              service['status'] == 'healthy'
                  ? Icons.check_circle
                  : (service['status'] == 'error'
                        ? Icons.error
                        : Icons.warning),
              color: color,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildServiceChip(Map<String, String> service) {
    final color = _getStatusColor(service['status']!);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              service['name']!,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w500,
                fontSize: 13,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
