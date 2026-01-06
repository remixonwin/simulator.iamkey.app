import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../../../../core/services/backend_service.dart';

enum LogLevel {
  all('All', null, Colors.white70),
  verbose('Verbose', 'V/', Colors.grey),
  debug('Debug', 'D/', Colors.blueAccent),
  info('Info', 'I/', Colors.greenAccent),
  warn('Warning', 'W/', Colors.orangeAccent),
  error('Error', 'E/', Colors.redAccent);

  final String label;
  final String? tag;
  final Color color;
  const LogLevel(this.label, this.tag, this.color);
}

class AdbLogView extends ConsumerStatefulWidget {
  final String ipAddress;

  const AdbLogView({super.key, required this.ipAddress});

  @override
  ConsumerState<AdbLogView> createState() => _AdbLogViewState();
}

class _AdbLogViewState extends ConsumerState<AdbLogView> {
  WebSocketChannel? _channel;
  final List<String> _rawLogs = [];
  final ScrollController _scrollController = ScrollController();
  final _searchController = TextEditingController();

  bool _isConnected = false;
  List<String> _apps = [];
  String? _selectedApp;
  bool _isLoadingApps = false;
  bool _isExpanded = false;

  LogLevel _selectedLevel = LogLevel.all;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _fetchApps();
    _connectToLogs();
    _searchController.addListener(() {
      if (mounted) {
        setState(() {
          _searchQuery = _searchController.text.toLowerCase();
        });
      }
    });
  }

  List<String> get _filteredLogs {
    return _rawLogs.where((log) {
      if (log.isEmpty) return false;
      if (log.contains('---')) return true;

      // Level Filter
      if (_selectedLevel != LogLevel.all) {
        final tag = _selectedLevel.tag!;
        // Match standard logcat formats
        if (!log.contains(tag) &&
            !log.contains(' ${_selectedLevel.label[0]} ')) {
          return false;
        }
      }

      // Keyword Filter
      if (_searchQuery.isNotEmpty) {
        if (!log.toLowerCase().contains(_searchQuery)) return false;
      }

      return true;
    }).toList();
  }

  Future<void> _fetchApps() async {
    if (!mounted) return;
    setState(() => _isLoadingApps = true);
    try {
      final apps = await ref
          .read(backendServiceProvider.notifier)
          .getInstalledApps(widget.ipAddress);
      if (mounted) {
        setState(() {
          _apps = apps;
          _isLoadingApps = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoadingApps = false);
    }
  }

  void _connectToLogs({String? pid}) {
    try {
      if (_channel != null) {
        _channel!.sink.add(jsonEncode({'action': 'stop_logs'}));
        _channel!.sink.close();
      }

      _channel = WebSocketChannel.connect(
        Uri.parse('ws://localhost:3000/ws/logs'),
      );

      _channel!.stream.listen(
        (message) {
          final data = jsonDecode(message);
          if (data['type'] == 'log' || data['type'] == 'error') {
            final rawData = data['data'] as String;
            final lines = rawData.split(RegExp(r'\r?\n'));

            if (mounted) {
              setState(() {
                for (var line in lines) {
                  if (line.trim().isNotEmpty) {
                    _rawLogs.add(line);
                  }
                }
                if (_rawLogs.length > 5000) {
                  _rawLogs.removeRange(0, _rawLogs.length - 5000);
                }
              });
              _scrollToBottom();
            }
          }
        },
        onDone: () {
          if (mounted) setState(() => _isConnected = false);
        },
        onError: (e) {
          if (mounted) setState(() => _isConnected = false);
        },
      );

      _channel!.sink.add(
        jsonEncode({
          'action': 'start_logs',
          'ipAddress': widget.ipAddress,
          'pid': pid,
        }),
      );

      setState(() {
        _isConnected = true;
        _rawLogs.clear();
        _rawLogs.add('--- Log stream started (Target: ${pid ?? 'All'}) ---');
      });
    } catch (e) {
      debugPrint('WS Connection Error: $e');
    }
  }

  Future<void> _onAppChanged(String? packageName) async {
    if (packageName == null) {
      setState(() => _selectedApp = null);
      _connectToLogs();
      return;
    }

    setState(() => _selectedApp = packageName);
    final pid = await ref
        .read(backendServiceProvider.notifier)
        .getAppPid(widget.ipAddress, packageName);

    if (mounted) {
      if (pid != null) {
        _connectToLogs(pid: pid);
      } else {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$packageName is not running.')));
        _connectToLogs();
      }
    }
  }

  void _scrollToBottom() {
    if (!_scrollController.hasClients) return;

    final pos = _scrollController.position;
    if (_scrollController.offset >= pos.maxScrollExtent - 50) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
        }
      });
    }
  }

  void _clearLogs() {
    setState(() {
      _rawLogs.clear();
      _rawLogs.add('--- Logs Cleared ---');
    });
  }

  @override
  void dispose() {
    _channel?.sink.add(jsonEncode({'action': 'stop_logs'}));
    _channel?.sink.close();
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Color _getLogColor(String log) {
    if (log.contains('---')) return Colors.blueAccent;
    if (log.contains('E/') || log.contains(' E ')) return LogLevel.error.color;
    if (log.contains('W/') || log.contains(' W ')) return LogLevel.warn.color;
    if (log.contains('I/') || log.contains(' I ')) return LogLevel.info.color;
    if (log.contains('D/') || log.contains(' D ')) return LogLevel.debug.color;
    return Colors.white70;
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredLogs;

    return Material(
      color: Colors.transparent,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        height: _isExpanded ? 800 : 500,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.95),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white10),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            _buildHeader(),
            _buildFilterBar(),
            const Divider(color: Colors.white10, height: 1),
            Expanded(
              child: SelectionArea(
                child: ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final log = filtered[index];
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(
                        log,
                        style: TextStyle(
                          color: _getLogColor(log),
                          fontSize: 11,
                          fontFamily: 'monospace',
                          height: 1.2,
                          fontWeight: log.contains('---')
                              ? FontWeight.bold
                              : FontWeight.normal,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            _buildFooter(filtered.length),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
      child: Row(
        children: [
          const Icon(
            Icons.terminal_rounded,
            size: 18,
            color: Colors.greenAccent,
          ),
          const SizedBox(width: 12),
          const Text(
            'LOGS',
            style: TextStyle(
              color: Colors.greenAccent,
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
            ),
          ),
          const Spacer(),
          _buildAppDropdown(),
          IconButton(
            onPressed: () => setState(() => _isExpanded = !_isExpanded),
            icon: Icon(
              _isExpanded
                  ? Icons.fullscreen_exit_rounded
                  : Icons.fullscreen_rounded,
              color: Colors.white38,
              size: 20,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 36,
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: Colors.white, fontSize: 12),
                decoration: InputDecoration(
                  hintText: 'Search keyword...',
                  hintStyle: const TextStyle(
                    color: Colors.white24,
                    fontSize: 12,
                  ),
                  prefixIcon: const Icon(
                    Icons.search_rounded,
                    size: 16,
                    color: Colors.white24,
                  ),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.05),
                  contentPadding: EdgeInsets.zero,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(10),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<LogLevel>(
                value: _selectedLevel,
                dropdownColor: const Color(0xFF1A1A1A),
                icon: const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  size: 16,
                  color: Colors.white38,
                ),
                items: LogLevel.values.map((level) {
                  return DropdownMenuItem(
                    value: level,
                    child: Text(
                      level.label,
                      style: TextStyle(color: level.color, fontSize: 12),
                    ),
                  );
                }).toList(),
                onChanged: (val) =>
                    setState(() => _selectedLevel = val ?? LogLevel.all),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppDropdown() {
    return Container(
      height: 32,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.white10),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _selectedApp,
          hint: Text(
            _isLoadingApps ? 'Wait...' : 'Filtering Process',
            style: const TextStyle(color: Colors.white24, fontSize: 11),
          ),
          dropdownColor: const Color(0xFF1A1A1A),
          items: [
            const DropdownMenuItem<String>(
              value: null,
              child: Text(
                'All System Processes',
                style: TextStyle(color: Colors.white60, fontSize: 11),
              ),
            ),
            ..._apps.map(
              (app) => DropdownMenuItem(
                value: app,
                child: Text(
                  app,
                  style: const TextStyle(color: Colors.white, fontSize: 11),
                ),
              ),
            ),
          ],
          onChanged: _onAppChanged,
        ),
      ),
    );
  }

  Widget _buildFooter(int total) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: const BoxDecoration(color: Colors.white10),
      child: Row(
        children: [
          Icon(
            Icons.done_all_rounded,
            size: 12,
            color: _isConnected ? Colors.greenAccent : Colors.white24,
          ),
          const SizedBox(width: 8),
          Text(
            _isConnected ? 'Connected • $total matches' : 'Disconnected',
            style: const TextStyle(
              color: Colors.white38,
              fontSize: 10,
              letterSpacing: 0.5,
            ),
          ),
          const Spacer(),
          TextButton(
            onPressed: _clearLogs,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text(
              'CLEAR CONSOLE',
              style: TextStyle(
                fontSize: 10,
                color: Colors.blueAccent,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
