import 'package:flutter/material.dart';

import 'database/db_helper.dart';
import 'models/pharmacy_models.dart';
import 'screens/login_screen.dart';
import 'screens/parties_screen.dart';
import 'screens/pos_screen.dart';
import 'screens/printer_settings_screen.dart';
import 'screens/reports_screen.dart';
import 'screens/settings_screen.dart';
import 'utils/currency_formatter.dart';

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

enum _ShellSection { pos, parties, reports, printer, settings, users }

class _ClinixHomeShell extends StatefulWidget {
  const _ClinixHomeShell();

  @override
  State<_ClinixHomeShell> createState() => _ClinixHomeShellState();
}

class _ClinixHomeShellState extends State<_ClinixHomeShell> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  PharmacyUser? _currentUser;
  _ShellSection _activeSection = _ShellSection.pos;
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

  Future<void> _syncCurrentUserFromDb() async {
    final user = _currentUser;
    if (user == null) return;
    final all = await DatabaseHelper.instance.getUsers();
    if (!mounted) return;
    final matched = all.where(
      (u) =>
          (user.id != null && u.id == user.id) ||
          u.username.toLowerCase() == user.username.toLowerCase(),
    );
    if (matched.isEmpty || !matched.first.isActive) {
      setState(() {
        _currentUser = null;
        _activeSection = _ShellSection.pos;
      });
      return;
    }
    final latest = matched.first;
    if (latest.role != user.role ||
        latest.name != user.name ||
        latest.username != user.username) {
      final updatedSettings = await DatabaseHelper.instance.saveSettings(
        _settings.copyWith(activeUserRole: latest.role),
      );
      if (!mounted) return;
      setState(() {
        _currentUser = latest;
        _settings = updatedSettings;
      });
    }
  }

  Future<void> _handleLoginSuccess(PharmacyUser user) async {
    final updated = await DatabaseHelper.instance.saveSettings(
      _settings.copyWith(activeUserRole: user.role),
    );
    if (!mounted) return;
    setState(() {
      _currentUser = user;
      _settings = updated;
      _activeSection = _ShellSection.pos;
    });
  }

  void _handleLogout() {
    setState(() {
      _currentUser = null;
      _activeSection = _ShellSection.pos;
    });
  }

  void _openDrawer() {
    _scaffoldKey.currentState?.openDrawer();
  }

  void _selectSection(_ShellSection section) {
    setState(() => _activeSection = section);
    if (section == _ShellSection.pos || section == _ShellSection.printer) {
      _loadSettings();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_loadedSettings) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final user = _currentUser;
    if (user == null) {
      return LoginScreen(
        pharmacyName: _settings.pharmacyName,
        pharmacyAddress: _settings.address,
        onLoginSuccess: _handleLoginSuccess,
      );
    }

    final bool isAdmin = user.role == UserRole.admin;
    final bool isManagerOrAdmin = user.role.canViewProfitAndCost;

    final List<({ _ShellSection section, String label, IconData icon, IconData selectedIcon })>
        availableDestinations = [
      (
        section: _ShellSection.pos,
        label: 'POS Billing',
        icon: Icons.point_of_sale_outlined,
        selectedIcon: Icons.point_of_sale,
      ),
      if (isManagerOrAdmin)
        (
          section: _ShellSection.parties,
          label: 'Parties & Khata',
          icon: Icons.account_balance_wallet_outlined,
          selectedIcon: Icons.account_balance_wallet,
        ),
      if (isManagerOrAdmin)
        (
          section: _ShellSection.reports,
          label: 'Reports & Profit',
          icon: Icons.assessment_outlined,
          selectedIcon: Icons.assessment,
        ),
      if (isManagerOrAdmin)
        (
          section: _ShellSection.printer,
          label: 'Thermal Printer',
          icon: Icons.print_outlined,
          selectedIcon: Icons.print,
        ),
      if (isManagerOrAdmin)
        (
          section: _ShellSection.settings,
          label: 'Settings',
          icon: Icons.settings_outlined,
          selectedIcon: Icons.settings,
        ),
      if (isAdmin)
        (
          section: _ShellSection.users,
          label: 'Users & Roles',
          icon: Icons.manage_accounts_outlined,
          selectedIcon: Icons.manage_accounts,
        ),
    ];

    int selectedIndex = availableDestinations
        .indexWhere((d) => d.section == _activeSection);
    if (selectedIndex < 0) selectedIndex = 0;
    final currentSection = availableDestinations[selectedIndex].section;

    final bottomNavDestinations = availableDestinations
        .where((d) => d.section != _ShellSection.users)
        .toList();
    int bottomSelectedIndex = bottomNavDestinations
        .indexWhere((d) => d.section == currentSection);
    if (bottomSelectedIndex < 0) {
      bottomSelectedIndex = bottomNavDestinations
          .indexWhere((d) => d.section == _ShellSection.settings);
    }
    if (bottomSelectedIndex < 0) bottomSelectedIndex = 0;

    Widget activePage;
    switch (currentSection) {
      case _ShellSection.parties:
        activePage = PartiesScreen(
          settings: _settings,
          currentUser: user,
          onOpenDrawer: _openDrawer,
        );
        break;
      case _ShellSection.reports:
        activePage = ReportsScreen(
          settings: _settings,
          onOpenDrawer: _openDrawer,
        );
        break;
      case _ShellSection.printer:
        activePage = const PrinterSettingsScreen();
        break;
      case _ShellSection.settings:
      case _ShellSection.users:
        activePage = SettingsScreen(
          initialSettings: _settings,
          currentUserRole: user.role,
          currentUsername: user.username,
          focusUsersSection: currentSection == _ShellSection.users,
          onOpenDrawer: _openDrawer,
          onSettingsChanged: (next) {
            setState(() => _settings = next);
          },
          onUsersChanged: _syncCurrentUserFromDb,
        );
        break;
      case _ShellSection.pos:
        activePage = PosScreen(
          settings: _settings,
          currentUserRole: user.role,
          currentUser: user,
          onOpenDrawer: _openDrawer,
        );
        break;
    }

    return Scaffold(
      key: _scaffoldKey,
      drawer: NavigationDrawer(
        selectedIndex: selectedIndex,
        onDestinationSelected: (idx) {
          Navigator.of(context).pop();
          _selectSection(availableDestinations[idx].section);
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
                  _settings.address,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${user.name} (${user.role.label})',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  '@${user.username} · ${CurrencyFormatter.unitLabel(_settings)}',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: Colors.grey.shade700,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          const SizedBox(height: 8),
          ...availableDestinations.map(
            (dest) => NavigationDrawerDestination(
              icon: Icon(dest.icon),
              selectedIcon: Icon(dest.selectedIcon),
              label: Text(dest.label),
            ),
          ),
          const Divider(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton.icon(
              onPressed: () {
                Navigator.of(context).pop();
                _handleLogout();
              },
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('Sign Out'),
            ),
          ),
        ],
      ),
      body: activePage,
      bottomNavigationBar: bottomNavDestinations.length > 1
          ? NavigationBar(
              selectedIndex: bottomSelectedIndex,
              onDestinationSelected: (idx) =>
                  _selectSection(bottomNavDestinations[idx].section),
              destinations: bottomNavDestinations
                  .map(
                    (dest) => NavigationDestination(
                      icon: Icon(dest.icon),
                      selectedIcon: Icon(dest.selectedIcon),
                      label: dest.label == 'Thermal Printer'
                          ? 'Printer'
                          : dest.label == 'Parties & Khata'
                              ? 'Khata'
                              : dest.label == 'Reports & Profit'
                                  ? 'Reports'
                                  : dest.label == 'Users & Roles'
                                      ? 'Users'
                                      : dest.label,
                    ),
                  )
                  .toList(),
            )
          : null,
    );
  }
}
