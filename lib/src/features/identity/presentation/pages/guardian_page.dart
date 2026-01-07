import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/services/simulator_provider.dart';
import '../providers/user_provider.dart';
import '../../../welcome/presentation/widgets/glass_card.dart';

class GuardianPage extends ConsumerStatefulWidget {
  const GuardianPage({super.key});

  @override
  ConsumerState<GuardianPage> createState() => _GuardianPageState();
}

class _GuardianPageState extends ConsumerState<GuardianPage> {
  final _inviteController = TextEditingController();
  bool _isLoading = false;
  Map<String, dynamic>? _relationships;

  @override
  void initState() {
    super.initState();
    _fetchGuardians();
  }

  Future<void> _fetchGuardians() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    try {
      final data = await ref
          .read(simulatorApiProvider)
          .getGuardians(user['id']);
      if (mounted) {
        setState(() {
          _relationships = data;
        });
      }
    } catch (e) {
      debugPrint('Error fetching guardians: $e');
    }
  }

  Future<void> _inviteGuardian() async {
    final user = ref.read(currentUserProvider);
    if (user == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Please register first')));
      return;
    }

    setState(() => _isLoading = true);
    try {
      await ref
          .read(simulatorApiProvider)
          .inviteGuardian(
            userId: user['id'],
            guardianPhone: _inviteController.text.trim(),
          );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Invite sent!')));
        _inviteController.clear();
        _fetchGuardians();
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

  Future<void> _acceptRequest(String relationshipId) async {
    setState(() => _isLoading = true);
    try {
      await ref
          .read(simulatorApiProvider)
          .acceptGuardian(relationshipId: relationshipId);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Request Accepted!')));
        _fetchGuardians();
      }
    } catch (e) {
      debugPrint('Error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);

    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Guardian Management')),
        body: const Center(
          child: Text(
            'Please register an identity first.',
            style: TextStyle(color: Colors.white),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Guardian Management'),
        actions: [
          IconButton(
            onPressed: () {
              setState(() => _isLoading = true);
              _fetchGuardians().whenComplete(
                () => setState(() => _isLoading = false),
              );
            },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Invite Guardian',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          key: const Key('invite_phone_field'),
                          controller: _inviteController,
                          style: const TextStyle(color: Colors.white),
                          decoration: const InputDecoration(
                            labelText: 'Guardian Phone',
                            labelStyle: TextStyle(color: Colors.white70),
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      ElevatedButton(
                        onPressed: _isLoading ? null : _inviteGuardian,
                        child: const Text('Invite'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            if (_relationships != null) ...[
              _buildSection(
                'My Guardians',
                _relationships!['guardians'] as List,
                isMyGuardians: true,
              ),
              const SizedBox(height: 24),
              _buildSection(
                'Who I Protect',
                _relationships!['protecting'] as List,
                isMyGuardians: false,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSection(
    String title,
    List items, {
    required bool isMyGuardians,
  }) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          if (items.isEmpty)
            const Text('None', style: TextStyle(color: Colors.white54))
          else
            ListView.separated(
              shrinkWrap: true,
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(color: Colors.white10),
              itemBuilder: (context, index) {
                final item = items[index];
                final status = item['status'];
                // Display username/phone of the OTHER person
                final otherName = isMyGuardians
                    ? item['guardian_username']
                    : item['identity_username'];
                final otherPhone = isMyGuardians
                    ? item['guardian_phone']
                    : item['identity_phone'];

                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    '$otherName ($otherPhone)',
                    style: const TextStyle(color: Colors.white),
                  ),
                  subtitle: Text(
                    'Status: $status',
                    style: TextStyle(
                      color: status == 'active' ? Colors.green : Colors.orange,
                    ),
                  ),
                  trailing: status == 'pending' && !isMyGuardians
                      ? ElevatedButton(
                          onPressed: () => _acceptRequest(item['id']),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                          ),
                          child: const Text('Accept'),
                        )
                      : null,
                );
              },
            ),
        ],
      ),
    );
  }
}
