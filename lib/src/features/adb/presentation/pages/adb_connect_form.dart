import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/services/backend_service.dart';
import '../widgets/adb_log_view.dart';

class AdbConnectForm extends ConsumerStatefulWidget {
  const AdbConnectForm({super.key});

  @override
  ConsumerState<AdbConnectForm> createState() => _AdbConnectFormState();
}

class _AdbConnectFormState extends ConsumerState<AdbConnectForm> {
  final _controller = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  String? _connectedIp;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _handleConnect() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    final backend = ref.read(backendServiceProvider.notifier);
    final result = await backend.adbConnect(_controller.text.trim());

    if (mounted) {
      setState(() => _isLoading = false);

      final success = result['success'] == true;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result['message'] ?? 'Unknown response'),
          backgroundColor: success
              ? Colors.green.shade800
              : Colors.red.shade800,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      );

      if (success) {
        setState(() {
          _connectedIp = _controller.text.trim();
        });
        _controller.clear();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Wireless Debugging',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Enter your device IP and port to connect via ADB.',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: Colors.white60),
          ),
          const SizedBox(height: 24),
          TextFormField(
            controller: _controller,
            decoration: InputDecoration(
              hintText: 'e.g. 192.168.1.15:5555',
              prefixIcon: const Icon(Icons.tap_and_play_rounded),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.05),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.1),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
            validator: (value) {
              if (value == null || value.isEmpty) {
                return 'IP address is required';
              }
              if (!RegExp(
                r'^(?:[0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]{1,5}$',
              ).hasMatch(value)) {
                return 'Invalid format (0.0.0.0:0000)';
              }
              return null;
            },
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _isLoading ? null : _handleConnect,
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Connect Device'),
          ),
          if (_connectedIp != null) ...[
            const SizedBox(height: 32),
            AdbLogView(ipAddress: _connectedIp!),
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: () => setState(() => _connectedIp = null),
              icon: const Icon(Icons.close_rounded, size: 16),
              label: const Text('Stop Logs'),
              style: TextButton.styleFrom(foregroundColor: Colors.red.shade300),
            ),
          ],
        ],
      ),
    );
  }
}
