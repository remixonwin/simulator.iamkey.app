import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/simulator_provider.dart';

class GodModePanel extends StatefulWidget {
  const GodModePanel({super.key});

  @override
  State<GodModePanel> createState() => _GodModePanelState();
}

class _GodModePanelState extends State<GodModePanel> {
  final _timeController = TextEditingController();
  final _snapshotNameController = TextEditingController();

  String _selectedService = 'ussd-sim';
  double _latency = 0;
  double _errorRate = 0;

  @override
  void dispose() {
    _timeController.dispose();
    _snapshotNameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          _buildTimeManipulation(),
          const SizedBox(height: 24),
          _buildChaosInjection(),
          const SizedBox(height: 24),
          _buildScenarios(),
          const SizedBox(height: 24),
          _buildStateManagement(),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.purple.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(
            Icons.settings_remote,
            size: 32,
            color: Colors.purple,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'God Mode',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Control time, inject chaos, and orchestrate scenarios',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: Colors.grey[400]),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTimeManipulation() {
    return Consumer<SimulatorProvider>(
      builder: (context, provider, _) {
        final currentTime = DateTime.fromMillisecondsSinceEpoch(
          provider.currentTimestamp * 1000,
        );
        final formatter = DateFormat('MMM dd, yyyy HH:mm:ss');

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.access_time, color: Colors.blue),
                    const SizedBox(width: 12),
                    Text(
                      'Time Manipulation',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Theme.of(
                      context,
                    ).colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.1),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.schedule, color: Colors.blue),
                      const SizedBox(width: 12),
                      Text(
                        'Current: ${formatter.format(currentTime)}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    _buildTimeButton(
                      context,
                      '+1 Hour',
                      Icons.add,
                      () => provider.increaseTime(3600),
                    ),
                    _buildTimeButton(
                      context,
                      '+1 Day',
                      Icons.add,
                      () => provider.increaseTime(86400),
                    ),
                    _buildTimeButton(
                      context,
                      '+1 Week',
                      Icons.add,
                      () => provider.increaseTime(604800),
                    ),
                    _buildTimeButton(
                      context,
                      'Reset to Now',
                      Icons.refresh,
                      () => provider.setTime(
                        DateTime.now().millisecondsSinceEpoch ~/ 1000,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTimeButton(
    BuildContext context,
    String label,
    IconData icon,
    VoidCallback onPressed,
  ) {
    return ElevatedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.blue.withValues(alpha: 0.2),
        foregroundColor: Colors.blue,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }

  Widget _buildChaosInjection() {
    return Consumer<SimulatorProvider>(
      builder: (context, provider, _) {
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.warning_amber, color: Colors.orange),
                    const SizedBox(width: 12),
                    Text(
                      'Chaos Injection',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _selectedService,
                  decoration: const InputDecoration(
                    labelText: 'Target Service',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'ussd-sim',
                      child: Text('USSD Simulator'),
                    ),
                    DropdownMenuItem(
                      value: 'telegram-mock',
                      child: Text('Telegram Mock'),
                    ),
                    DropdownMenuItem(
                      value: 'fcm-mock',
                      child: Text('FCM Mock'),
                    ),
                    DropdownMenuItem(
                      value: 'backend',
                      child: Text('Backend API'),
                    ),
                  ],
                  onChanged: (value) {
                    if (value != null) {
                      setState(() => _selectedService = value);
                    }
                  },
                ),
                const SizedBox(height: 16),
                Text(
                  'Latency: ${_latency.toInt()}ms',
                  style: const TextStyle(color: Colors.white70),
                ),
                Slider(
                  value: _latency,
                  min: 0,
                  max: 5000,
                  divisions: 50,
                  label: '${_latency.toInt()}ms',
                  onChanged: (value) => setState(() => _latency = value),
                ),
                const SizedBox(height: 8),
                Text(
                  'Error Rate: ${_errorRate.toInt()}%',
                  style: const TextStyle(color: Colors.white70),
                ),
                Slider(
                  value: _errorRate,
                  min: 0,
                  max: 100,
                  divisions: 20,
                  label: '${_errorRate.toInt()}%',
                  onChanged: (value) => setState(() => _errorRate = value),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      provider.setChaos(
                        service: _selectedService,
                        latencyMs: _latency.toInt(),
                        errorRate: _errorRate.toInt(),
                      );
                    },
                    icon: const Icon(Icons.bolt),
                    label: const Text('Apply Chaos'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.orange,
                      padding: const EdgeInsets.all(16),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildScenarios() {
    return Consumer<SimulatorProvider>(
      builder: (context, provider, _) {
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.play_circle, color: Colors.green),
                    const SizedBox(width: 12),
                    Text(
                      'Scenarios',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (provider.scenarios.isEmpty)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text(
                        'No scenarios available',
                        style: TextStyle(color: Colors.white54),
                      ),
                    ),
                  )
                else
                  ...provider.scenarios.map((scenario) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        tileColor: Colors.green.withValues(alpha: 0.1),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        leading: const Icon(
                          Icons.play_arrow,
                          color: Colors.green,
                        ),
                        title: Text(
                          scenario,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.play_circle_filled),
                          color: Colors.green,
                          onPressed: () => provider.triggerScenario(scenario),
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildStateManagement() {
    return Consumer<SimulatorProvider>(
      builder: (context, provider, _) {
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.save, color: Colors.purple),
                    const SizedBox(width: 12),
                    Text(
                      'State Snapshots',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _snapshotNameController,
                        decoration: const InputDecoration(
                          labelText: 'Snapshot Name',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton.icon(
                      onPressed: () {
                        if (_snapshotNameController.text.isNotEmpty) {
                          provider.createSnapshot(_snapshotNameController.text);
                          _snapshotNameController.clear();
                        }
                      },
                      icon: const Icon(Icons.add),
                      label: const Text('Create'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.purple,
                        padding: const EdgeInsets.all(16),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (provider.snapshots.isEmpty)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text(
                        'No snapshots created yet',
                        style: TextStyle(color: Colors.white54),
                      ),
                    ),
                  )
                else
                  ...provider.snapshots.map((snapshot) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        tileColor: Colors.purple.withValues(alpha: 0.1),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        leading: const Icon(
                          Icons.bookmark,
                          color: Colors.purple,
                        ),
                        title: Text(
                          snapshot['name'] ?? 'Unnamed',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        subtitle: Text(
                          snapshot['createdAt'] ?? '',
                          style: const TextStyle(color: Colors.white54),
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.restore),
                          color: Colors.purple,
                          onPressed: () =>
                              provider.restoreSnapshot(snapshot['id']),
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
        );
      },
    );
  }
}
