import 'package:flutter/material.dart';

import 'screens/pos_screen.dart';
import 'screens/printer_settings_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ClinixPharmacyApp());
}

class ClinixPharmacyApp extends StatelessWidget {
  const ClinixPharmacyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Clinix Community Pharmacy POS',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF0D7A5F),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
      home: const _ClinixHomeShell(),
    );
  }
}

class _ClinixHomeShell extends StatefulWidget {
  const _ClinixHomeShell();

  @override
  State<_ClinixHomeShell> createState() => _ClinixHomeShellState();
}

class _ClinixHomeShellState extends State<_ClinixHomeShell> {
  int _selectedIndex = 0;

  final List<Widget> _pages = const [
    PosScreen(),
    PrinterSettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_selectedIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (idx) => setState(() => _selectedIndex = idx),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.point_of_sale),
            label: 'POS Billing',
          ),
          NavigationDestination(
            icon: Icon(Icons.print_outlined),
            label: 'Thermal Printer',
          ),
        ],
      ),
    );
  }
}
