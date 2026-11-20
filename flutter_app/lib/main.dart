import 'package:flutter/material.dart';

import 'database/db_helper.dart';
import 'models/pharmacy_models.dart';
import 'screens/pos_screen.dart';
import 'screens/printer_settings_screen.dart';
import 'screens/settings_screen.dart';

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
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  int _selectedIndex = 0;
  PharmacySettings _settings = PharmacySettings.defaults();
  bool _loadedSettings = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final loaded = await DatabaseHelper.instance.getSettings();
    if (!mounted) return;
    setState(() {
      _settings = loaded;
      _loadedSettings = true;
    });
  }

  void _openDrawer() {
    _scaffoldKey.currentState?.openDrawer();
  }

  void _selectDestination(int index) {
    setState(() => _selectedIndex = index);
    if (index != 2) {
      // Refresh settings when returning to POS/Printer in case PrinterSettingsScreen updated defaults
      _loadSettings();
    }
  }

  Widget _buildActivePage() {
    switch (_selectedIndex) {
      case 1:
        return const PrinterSettingsScreen();
      case 2:
        return SettingsScreen(
          initialSettings: _settings,
          onOpenDrawer: _openDrawer,
          onSettingsChanged: (next) {
            setState(() => _settings = next);
          },
        );
      case 0:
      default:
        return PosScreen(
          settings: _settings,
          onOpenDrawer: _openDrawer,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      drawer: NavigationDrawer(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (idx) {
          Navigator.of(context).pop();
          _selectDestination(idx);
        },
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _settings.pharmacyName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0D7A5F),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _settings.branchAddress,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Role: ${_settings.activeUserRole.label} · ${_settings.currencyLabel}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade800,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          const SizedBox(height: 8),
          const NavigationDrawerDestination(
            icon: Icon(Icons.point_of_sale_outlined),
            selectedIcon: Icon(Icons.point_of_sale),
            label: Text('POS Billing'),
          ),
          const NavigationDrawerDestination(
            icon: Icon(Icons.print_outlined),
            selectedIcon: Icon(Icons.print),
            label: Text('Thermal Printer'),
          ),
          const NavigationDrawerDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: Text('Settings'),
          ),
        ],
      ),
      body: _loadedSettings
          ? _buildActivePage()
          : const Center(child: CircularProgressIndicator()),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: _selectDestination,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.point_of_sale_outlined),
            selectedIcon: Icon(Icons.point_of_sale),
            label: 'POS Billing',
          ),
          NavigationDestination(
            icon: Icon(Icons.print_outlined),
            selectedIcon: Icon(Icons.print),
            label: 'Printer',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}
