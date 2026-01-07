import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/simulator_provider.dart';

class UserManagementScreen extends StatefulWidget {
  const UserManagementScreen({super.key});

  @override
  State<UserManagementScreen> createState() => _UserManagementScreenState();
}

class _UserManagementScreenState extends State<UserManagementScreen> {
  @override
  void initState() {
    super.initState();
    // Fetch users on init
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SimulatorProvider>().refreshUsers();
    });
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
            const SizedBox(height: 24),
            Expanded(child: _buildUserTable(context)),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.people, size: 32, color: Colors.blue),
            ),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'User Management',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'Manage simulated users and balances',
                  style: TextStyle(color: Colors.grey[400]),
                ),
              ],
            ),
          ],
        ),
        IconButton(
          onPressed: () => context.read<SimulatorProvider>().refreshUsers(),
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh Users',
        ),
      ],
    );
  }

  Widget _buildUserTable(BuildContext context) {
    return Consumer<SimulatorProvider>(
      builder: (context, provider, _) {
        if (provider.isLoading && provider.users.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        if (provider.users.isEmpty) {
          return const Center(
            child: Text(
              'No users found. Register some users first.',
              style: TextStyle(color: Colors.grey),
            ),
          );
        }

        return Card(
          child: SingleChildScrollView(
            child: DataTable(
              columns: const [
                DataColumn(label: Text('Phone')),
                DataColumn(label: Text('USSD Balance')),
                DataColumn(label: Text('ETH Balance')),
                DataColumn(label: Text('Actions')),
              ],
              rows: provider.users.map((user) {
                final ussdBalance = user['ussd_balance'] != null
                    ? '${user['ussd_balance']} ${user['ussd_currency'] ?? 'XAF'}'
                    : 'N/A';

                final ethBalance = user['eth_balance'] != null
                    ? '${double.parse(user['eth_balance'].toString()).toStringAsFixed(4)} ETH'
                    : 'Error';

                return DataRow(
                  cells: [
                    DataCell(
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            user['phone_number'] ?? 'Unknown',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          Text(
                            '${(user['wallet_address'] ?? 'No Wallet').toString().substring(0, 10)}...',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                    DataCell(Text(ussdBalance)),
                    DataCell(Text(ethBalance)),
                    DataCell(
                      Row(
                        children: [
                          IconButton(
                            icon: const Icon(
                              Icons.edit,
                              color: Colors.orange,
                              size: 20,
                            ),
                            tooltip: 'Edit USSD Balance',
                            onPressed: () => _showEditUssdDialog(context, user),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.add_circle,
                              color: Colors.blue,
                              size: 20,
                            ),
                            tooltip: 'Topup ETH',
                            onPressed: () => _showTopupEthDialog(context, user),
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ),
        );
      },
    );
  }

  void _showEditUssdDialog(BuildContext context, Map<String, dynamic> user) {
    final controller = TextEditingController(
      text: user['ussd_balance']?.toString() ?? '0',
    );
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Edit USSD Balance for ${user['phone_number']}'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'New Balance'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final amount = double.tryParse(controller.text);
              if (amount != null) {
                context.read<SimulatorProvider>().updateUssdBalance(
                  user['phone_number'],
                  amount,
                );
                Navigator.pop(context);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showTopupEthDialog(BuildContext context, Map<String, dynamic> user) {
    if (user['wallet_address'] == null) return;
    final controller = TextEditingController(text: '1.0');
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Topup ETH (Anvil)'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'To: ${user['wallet_address']}',
              style: const TextStyle(fontSize: 12),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Amount (ETH)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final amount = double.tryParse(controller.text);
              if (amount != null) {
                context.read<SimulatorProvider>().topupChainBalance(
                  user['wallet_address'],
                  amount,
                );
                Navigator.pop(context);
              }
            },
            child: const Text('Send'),
          ),
        ],
      ),
    );
  }
}
