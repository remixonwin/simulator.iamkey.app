import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class ContractInfoCard extends StatelessWidget {
  const ContractInfoCard({super.key});

  @override
  Widget build(BuildContext context) {
    final contracts = {
      'MockDAI': '0x7a2088a1bFc9d81c55368AE168C2C02570cB814F',
      'IdentityContract': '0x09635F643e140090A9A8Dcd712eD6285858ceBef',
      'P2PEscrow': '0xc5a5C42992dECbae36851359345FE25997F5C42d',
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.account_balance, color: Colors.cyan),
                const SizedBox(width: 12),
                Text(
                  'Deployed Contracts',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            ...contracts.entries.map((entry) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: _buildContractRow(context, entry.key, entry.value),
              );
            }),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: Colors.cyan, size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Network: Anvil Local (Chain ID: 31337)',
                      style: TextStyle(color: Colors.grey[300], fontSize: 14),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContractRow(BuildContext context, String name, String address) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.cyan.withValues(
          alpha: 0.05,
        ), // This line was not part of the explicit change in the snippet, keeping original.
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Colors.cyan.withValues(alpha: 0.2),
        ), // This line was not part of the explicit change in the snippet, keeping original.
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.cyan.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.description, color: Colors.cyan, size: 20),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  address,
                  style: TextStyle(
                    color: Colors.grey[400],
                    fontSize: 13,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.copy, size: 20),
            color: Colors.cyan,
            tooltip: 'Copy address',
            onPressed: () {
              Clipboard.setData(ClipboardData(text: address));
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Copied $name address'),
                  duration: const Duration(seconds: 2),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
