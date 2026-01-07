import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/simulator_provider.dart';
import 'dart:async';

class BlockchainMonitorScreen extends StatefulWidget {
  const BlockchainMonitorScreen({super.key});

  @override
  State<BlockchainMonitorScreen> createState() =>
      _BlockchainMonitorScreenState();
}

class _BlockchainMonitorScreenState extends State<BlockchainMonitorScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Poll every 5s (block time is 1s, but UI doesn't need to be that fast)
    _fetch();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _fetch());
  }

  void _fetch() {
    context.read<SimulatorProvider>().refreshBlockchain();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(context),
            const SizedBox(height: 32),
            _buildStatsCards(context),
            const SizedBox(height: 32),
            Expanded(child: _buildRecentBlocks(context)),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.token, size: 32, color: Colors.orange),
            ),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Blockchain Event Viewer',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'Live feed from Anvil (Local Testnet)',
                  style: TextStyle(color: Colors.grey[400]),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStatsCards(BuildContext context) {
    return Consumer<SimulatorProvider>(
      builder: (context, provider, _) {
        final stats = provider.blockchainStats;
        return Row(
          children: [
            _buildStatCard(
              'Block Height',
              '#${stats['blockNumber'] ?? '...'}',
              Icons.layers,
            ),
            const SizedBox(width: 16),
            _buildStatCard(
              'Chain ID',
              '${stats['chainId'] ?? '...'} (${stats['name'] ?? ''})',
              Icons.link,
            ),
            const SizedBox(width: 16),
            _buildStatCard(
              'Gas Price',
              '${stats['gasPrice'] ?? '...'} wei',
              Icons.local_gas_station,
            ),
          ],
        );
      },
    );
  }

  Widget _buildStatCard(String title, String value, IconData icon) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: Colors.orange, size: 28),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(color: Colors.grey, fontSize: 14),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 20,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRecentBlocks(BuildContext context) {
    return Consumer<SimulatorProvider>(
      builder: (context, provider, _) {
        final blocks = provider.recentBlocks;

        if (blocks.isEmpty) {
          return const Center(
            child: Text(
              'Waiting for blocks...',
              style: TextStyle(color: Colors.grey),
            ),
          );
        }

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.history, color: Colors.orange),
                    const SizedBox(width: 12),
                    const Text(
                      'Recent Blocks',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: ListView.separated(
                    itemCount: blocks.length,
                    separatorBuilder: (context, index) =>
                        const Divider(color: Colors.white10),
                    itemBuilder: (context, index) {
                      final block = blocks[index];
                      // Format timestamp
                      final dt = DateTime.fromMillisecondsSinceEpoch(
                        (block['timestamp'] ?? 0) * 1000,
                      );

                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary.withAlpha(
                              255 ~/ 10,
                            ), // withValues(alpha: 0.1) is not a standard method. Assuming withAlpha for 10% opacity.
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '#${block['number']}',
                            style: const TextStyle(
                              color: Colors.orange,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        title: Text(
                          block['hash'] ?? '',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 12,
                            color: Colors.white70,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Row(
                          children: [
                            Text('${dt.hour}:${dt.minute}:${dt.second}'),
                            const SizedBox(width: 12),
                            Text('${block['transactions']} txs'),
                            const SizedBox(width: 12),
                            Text('Gas: ${block['gasUsed']}'),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
