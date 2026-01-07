import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/services/simulator_provider.dart';
import '../providers/user_provider.dart';
import '../../../welcome/presentation/widgets/glass_card.dart';

class MarketplacePage extends ConsumerStatefulWidget {
  const MarketplacePage({super.key});

  @override
  ConsumerState<MarketplacePage> createState() => _MarketplacePageState();
}

class _MarketplacePageState extends ConsumerState<MarketplacePage> {
  List<dynamic> _orders = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _fetchOrders();
  }

  Future<void> _fetchOrders() async {
    setState(() => _isLoading = true);
    try {
      final response = await ref.read(simulatorApiProvider).getOrders();
      if (mounted) {
        setState(() {
          _orders = response['orders'] ?? [];
        });
      }
    } catch (e) {
      debugPrint('Error fetching orders: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _createOrder() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    // Hardcode a simple order for testing
    setState(() => _isLoading = true);
    try {
      await ref
          .read(simulatorApiProvider)
          .createOrder(
            creatorLookupHash: user['phone_hash'],
            type: 'sell',
            localAmount: 1000,
            localCurrency: 'NPR',
            telecomProvider: 'NTC',
            phoneNumber: user['phone_number'],
          );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Order Created!')));
        _fetchOrders();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('P2P Marketplace'),
        actions: [
          IconButton(onPressed: _fetchOrders, icon: const Icon(Icons.refresh)),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createOrder,
        child: const Icon(Icons.add),
      ),
      body: _isLoading && _orders.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _orders.length,
              itemBuilder: (context, index) {
                final order = _orders[index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: GlassCard(
                    child: ListTile(
                      title: Text(
                        '${order['type'].toString().toUpperCase()} ${order['local_amount']} ${order['local_currency']}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Provider: ${order['telecom_provider']}',
                            style: const TextStyle(color: Colors.white70),
                          ),
                          Text(
                            'Status: ${order['status']}',
                            style: const TextStyle(color: Colors.greenAccent),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
