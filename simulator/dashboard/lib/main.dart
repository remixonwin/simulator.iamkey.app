import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'screens/dashboard_screen.dart';
import 'services/api_service.dart';
import 'providers/simulator_provider.dart';

void main() {
  runApp(const SimulatorDashboardApp());
}

class SimulatorDashboardApp extends StatelessWidget {
  const SimulatorDashboardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiService>(
          create: (_) => ApiService(baseUrl: 'http://localhost:3000'),
        ),
        ChangeNotifierProxyProvider<ApiService, SimulatorProvider>(
          create: (context) =>
              SimulatorProvider(apiService: context.read<ApiService>()),
          update: (context, apiService, previous) =>
              previous ?? SimulatorProvider(apiService: apiService),
        ),
      ],
      child: MaterialApp(
        title: 'IAMKey Blackbox Simulator',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF6366F1),
            brightness: Brightness.dark,
          ),
          scaffoldBackgroundColor: const Color(0xFF0F172A),
        ),
        home: const DashboardScreen(),
      ),
    );
  }
}
