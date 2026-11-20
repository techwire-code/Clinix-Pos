import 'package:flutter/material.dart';
import 'package:flutter_bluetooth_serial/flutter_bluetooth_serial.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:share_plus/share_plus.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../services/printer_service.dart';
import '../utils/currency_formatter.dart';

/// Dedicated Settings Screen accessible from the POS navigation drawer.
/// Persists multi-currency, regional, pharmacy, receipt, hardware, counter,
/// and role preferences locally in SQLite + SharedPreferences without ever
/// disturbing sales, inventory, purchases, or party ledger data.
class SettingsScreen extends StatefulWidget {
  final PharmacySettings initialSettings;
  final ValueChanged<PharmacySettings> onSettingsChanged;
  final VoidCallback? onOpenDrawer;
  final UserRole currentUserRole;
  final String? currentUsername;
  final bool focusUsersSection;
  final VoidCallback? onUsersChanged;

  const SettingsScreen({
    super.key,
    required this.initialSettings,
    required this.onSettingsChanged,
    this.onOpenDrawer,
    this.currentUserRole = UserRole.admin,
    this.currentUsername,
    this.focusUsersSection = false,
    this.onUsersChanged,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _pharmacyNameCtrl;
  late final TextEditingController _addressCtrl;
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _licenseCtrl;
  late final TextEditingController _websiteUrlCtrl;
  late final TextEditingController _footerNoteCtrl;

  late final TextEditingController _currencyCodeCtrl;
  late final TextEditingController _currencySymbolCtrl;
  late final TextEditingController _timezoneCtrl;

  late final TextEditingController _lowStockCtrl;
  late final TextEditingController _expiryAlertDaysCtrl;

  late bool _autoPrintReceipt;
  late String? _savedPrinterName;
  late String? _savedPrinterMac;
  late int _thermalPaperWidth;
  late bool _showWebsiteOnReceipt;
  late bool _preferUsbScannerFocus;

  late bool _useSymbolInsteadOfCode;
  late int _decimalDigits;
  late String _symbolPosition;
  late String _dateFormat;

  late bool _showProfitToStaff;
  late UserRole _activeUserRole;

  final GlobalKey _usersSectionKey = GlobalKey();
  List<PharmacyUser> _users = [];
  bool _loadingUsers = true;

  List<BluetoothDevice> _pairedDevices = [];
  bool _loadingPrinters = false;
  bool _testingPrint = false;
  bool _saving = false;
  bool _exportingDb = false;

  bool get _isAdmin => widget.currentUserRole == UserRole.admin;

  @override
  void initState() {
    super.initState();
    final s = widget.initialSettings;
    _pharmacyNameCtrl = TextEditingController(text: s.pharmacyName);
    _addressCtrl = TextEditingController(text: s.address);
    _phoneCtrl = TextEditingController(text: s.phone);
    _licenseCtrl = TextEditingController(text: s.licenseNumber);
    _websiteUrlCtrl = TextEditingController(text: s.websiteUrl);
    _footerNoteCtrl = TextEditingController(text: s.receiptFooter);

    _currencyCodeCtrl = TextEditingController(text: s.currencyCode);
    _currencySymbolCtrl = TextEditingController(text: s.currencySymbol);
    _timezoneCtrl = TextEditingController(text: s.timezone);

    _lowStockCtrl = TextEditingController(text: '${s.lowStockThreshold}');
    _expiryAlertDaysCtrl = TextEditingController(text: '${s.expiryAlertDays}');

    _autoPrintReceipt = s.autoPrintReceipt;
    _savedPrinterName = s.savedPrinterName;
    _savedPrinterMac = s.savedPrinterMac;
    _thermalPaperWidth = s.thermalPaperWidth == 58 ? 58 : 80;
    _showWebsiteOnReceipt = s.showWebsiteOnReceipt;
    _preferUsbScannerFocus = s.preferUsbScannerFocus;

    _useSymbolInsteadOfCode = s.useSymbolInsteadOfCode;
    _decimalDigits =
        (s.decimalDigits == 0 || s.decimalDigits == 2 || s.decimalDigits == 3)
            ? s.decimalDigits
            : 2;
    _symbolPosition = s.symbolPosition == 'suffix' ? 'suffix' : 'prefix';
    _dateFormat = s.dateFormat == 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY';

    _showProfitToStaff = s.showProfitToStaff;
    _activeUserRole = s.activeUserRole;

    _syncFromSqliteAndPrefs();
    _loadUsers();
    if (widget.focusUsersSection) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToUsersSection();
      });
    }
  }

  @override
  void didUpdateWidget(covariant SettingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.focusUsersSection && widget.focusUsersSection) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToUsersSection();
      });
    }
  }

  void _scrollToUsersSection() {
    final ctx = _usersSectionKey.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _loadUsers() async {
    setState(() => _loadingUsers = true);
    try {
      final list = await DatabaseHelper.instance.getUsers();
      if (!mounted) return;
      setState(() {
        _users = list;
        _loadingUsers = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingUsers = false);
      _showSnack('Unable to load users: $e', isError: true);
    }
  }

  @override
  void dispose() {
    _pharmacyNameCtrl.dispose();
    _addressCtrl.dispose();
    _phoneCtrl.dispose();
    _licenseCtrl.dispose();
    _websiteUrlCtrl.dispose();
    _footerNoteCtrl.dispose();
    _currencyCodeCtrl.dispose();
    _currencySymbolCtrl.dispose();
    _timezoneCtrl.dispose();
    _lowStockCtrl.dispose();
    _expiryAlertDaysCtrl.dispose();
    super.dispose();
  }

  Future<void> _syncFromSqliteAndPrefs() async {
    final latest = await DatabaseHelper.instance.getSettings();
    final prefMac = await PrinterService.instance.getSavedPrinterMac();
    final prefName = await PrinterService.instance.getSavedPrinterName();
    if (!mounted) return;
    setState(() {
      _applySettingsToState(latest);
      if ((_savedPrinterMac == null || _savedPrinterMac!.isEmpty) &&
          prefMac != null &&
          prefMac.isNotEmpty) {
        _savedPrinterMac = prefMac;
        _savedPrinterName = prefName ?? 'Thermal Printer';
      }
    });
  }

  void _applySettingsToState(PharmacySettings s) {
    _pharmacyNameCtrl.text = s.pharmacyName;
    _addressCtrl.text = s.address;
    _phoneCtrl.text = s.phone;
    _licenseCtrl.text = s.licenseNumber;
    _websiteUrlCtrl.text = s.websiteUrl;
    _footerNoteCtrl.text = s.receiptFooter;

    _currencyCodeCtrl.text = s.currencyCode;
    _currencySymbolCtrl.text = s.currencySymbol;
    _timezoneCtrl.text = s.timezone;

    _lowStockCtrl.text = '${s.lowStockThreshold}';
    _expiryAlertDaysCtrl.text = '${s.expiryAlertDays}';

    _autoPrintReceipt = s.autoPrintReceipt;
    _savedPrinterName = s.savedPrinterName;
    _savedPrinterMac = s.savedPrinterMac;
    _thermalPaperWidth = s.thermalPaperWidth == 58 ? 58 : 80;
    _showWebsiteOnReceipt = s.showWebsiteOnReceipt;
    _preferUsbScannerFocus = s.preferUsbScannerFocus;

    _useSymbolInsteadOfCode = s.useSymbolInsteadOfCode;
    _decimalDigits =
        (s.decimalDigits == 0 || s.decimalDigits == 2 || s.decimalDigits == 3)
            ? s.decimalDigits
            : 2;
    _symbolPosition = s.symbolPosition == 'suffix' ? 'suffix' : 'prefix';
    _dateFormat = s.dateFormat == 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY';

    _showProfitToStaff = s.showProfitToStaff;
    _activeUserRole = s.activeUserRole;
  }

  void _applyCurrencyPreset(CurrencyPreset preset) {
    setState(() {
      _currencyCodeCtrl.text = preset.code;
      _currencySymbolCtrl.text = preset.symbol;
      _decimalDigits = preset.defaultDecimals;
      _symbolPosition = preset.defaultPosition;
      _timezoneCtrl.text = preset.defaultTimezone;
    });
  }

  PharmacySettings _collectDraftSettings() {
    final name = _pharmacyNameCtrl.text.trim();
    final addr = _addressCtrl.text.trim();
    final code = _currencyCodeCtrl.text.trim().toUpperCase();
    final symbol = _currencySymbolCtrl.text.trim();
    final tz = _timezoneCtrl.text.trim();
    final lowStock = int.tryParse(_lowStockCtrl.text.trim()) ?? 10;
    final expiryDays = int.tryParse(_expiryAlertDaysCtrl.text.trim()) ?? 30;

    return PharmacySettings(
      pharmacyName: name.isEmpty ? 'Clinix Community Pharmacy' : name,
      address: addr.isEmpty ? '17 KM Ferozepur Road, Lahore' : addr,
      phone: _phoneCtrl.text.trim(),
      licenseNumber: _licenseCtrl.text.trim(),
      websiteUrl: _websiteUrlCtrl.text.trim(),
      receiptFooter: _footerNoteCtrl.text.trim(),
      autoPrintReceipt: _autoPrintReceipt,
      savedPrinterName: _savedPrinterName,
      savedPrinterMac: _savedPrinterMac,
      thermalPaperWidth: _thermalPaperWidth == 58 ? 58 : 80,
      showWebsiteOnReceipt: _showWebsiteOnReceipt,
      preferUsbScannerFocus: _preferUsbScannerFocus,
      currencyCode: code.isEmpty ? 'PKR' : code,
      currencySymbol: symbol.isEmpty ? 'Rs' : symbol,
      useSymbolInsteadOfCode: _useSymbolInsteadOfCode,
      decimalDigits:
          (_decimalDigits == 0 || _decimalDigits == 2 || _decimalDigits == 3)
              ? _decimalDigits
              : 2,
      symbolPosition: _symbolPosition == 'suffix' ? 'suffix' : 'prefix',
      timezone: tz.isEmpty ? 'Asia/Karachi' : tz,
      dateFormat: _dateFormat == 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY',
      lowStockThreshold: lowStock < 1 ? 1 : lowStock,
      expiryAlertDays: expiryDays < 1 ? 1 : expiryDays,
      showProfitToStaff: _showProfitToStaff,
      activeUserRole: _activeUserRole,
    );
  }

  Future<void> _saveSettings({bool showConfirmation = true}) async {
    setState(() => _saving = true);
    try {
      final draft = _collectDraftSettings();
      final saved = await DatabaseHelper.instance.saveSettings(draft);

      if (saved.savedPrinterMac != null && saved.savedPrinterMac!.isNotEmpty) {
        try {
          await PrinterService.instance.saveDefaultPrinter(
            macAddress: saved.savedPrinterMac!,
            deviceName: saved.savedPrinterName ?? 'Thermal Printer',
            width: saved.thermalPaperWidth == 58
                ? ThermalPaperWidth.mm58
                : ThermalPaperWidth.mm80,
          );
        } catch (_) {
          // Non-fatal: settings are already safely persisted in SQLite.
        }
      }

      widget.onSettingsChanged(saved);
      if (showConfirmation && mounted) {
        _showSnack('Settings saved locally and applied immediately.');
      }
    } catch (e) {
      _showSnack('Failed to save settings: $e', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickPairedBluetoothPrinter() async {
    setState(() => _loadingPrinters = true);
    try {
      final statuses = await [
        Permission.bluetoothConnect,
        Permission.bluetoothScan,
        Permission.locationWhenInUse,
      ].request();

      if (statuses.values.any((s) => s.isPermanentlyDenied)) {
        _showSnack(
          'Bluetooth permission denied. Enable it in system settings.',
          isError: true,
        );
        return;
      }

      final bonded = await PrinterService.instance.getPairedDevices();
      if (!mounted) return;
      setState(() => _pairedDevices = bonded);

      if (bonded.isEmpty) {
        _showSnack(
          'No paired Bluetooth printers found. Pair your printer in Android Bluetooth settings first.',
          isError: true,
        );
        return;
      }

      final selected = await showModalBottomSheet<BluetoothDevice>(
        context: context,
        showDragHandle: true,
        builder: (ctx) => ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          children: [
            const Text(
              'Select Paired Thermal Printer',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            ..._pairedDevices.map(
              (device) => ListTile(
                leading: const Icon(Icons.print),
                title: Text(device.name ?? 'Unnamed Printer'),
                subtitle: Text(device.address),
                trailing: _savedPrinterMac == device.address
                    ? const Icon(Icons.check_circle, color: Color(0xFF0D7A5F))
                    : null,
                onTap: () => Navigator.of(ctx).pop(device),
              ),
            ),
          ],
        ),
      );

      if (selected != null && mounted) {
        setState(() {
          _savedPrinterMac = selected.address;
          _savedPrinterName = (selected.name?.trim().isNotEmpty ?? false)
              ? selected.name!.trim()
              : 'Thermal Printer';
        });
        await _saveSettings(showConfirmation: false);
        _showSnack(
          'Selected printer: $_savedPrinterName ($_savedPrinterMac)',
        );
      }
    } catch (e) {
      _showSnack('Unable to query Bluetooth printers: $e', isError: true);
    } finally {
      if (mounted) setState(() => _loadingPrinters = false);
    }
  }

  Future<void> _runTestPrint() async {
    if (_savedPrinterMac == null || _savedPrinterMac!.isEmpty) {
      _showSnack('Select a Bluetooth thermal printer first.', isError: true);
      return;
    }

    setState(() => _testingPrint = true);
    try {
      final draft = _collectDraftSettings();
      await DatabaseHelper.instance.saveSettings(draft);
      widget.onSettingsChanged(draft);
      await PrinterService.instance.printTestPage(
        macAddress: _savedPrinterMac!,
        width: _thermalPaperWidth == 58
            ? ThermalPaperWidth.mm58
            : ThermalPaperWidth.mm80,
        settings: draft,
      );
      _showSnack('ESC/POS test receipt sent to $_savedPrinterName.');
    } catch (e) {
      _showSnack('Test print failed: $e', isError: true);
    } finally {
      if (mounted) setState(() => _testingPrint = false);
    }
  }

  Future<void> _exportSqliteBackup() async {
    if (!_isAdmin) {
      _showSnack('Admin role required to export database backup.', isError: true);
      return;
    }
    setState(() => _exportingDb = true);
    try {
      final backupPath =
          await DatabaseHelper.instance.exportDatabaseBackupFile();
      await Share.shareXFiles(
        [XFile(backupPath, mimeType: 'application/x-sqlite3')],
        subject: 'Clinix Pharmacy SQLite Database Backup',
        text:
            'Offline SQLite backup of users, settings, inventory, sales, purchases, and Khata ledger.',
      );
      _showSnack('SQLite backup ready to save or share.');
    } catch (e) {
      _showSnack('Database backup failed: $e', isError: true);
    } finally {
      if (mounted) setState(() => _exportingDb = false);
    }
  }

  Future<void> _confirmResetDefaults() async {
    if (!_isAdmin) {
      _showSnack('Only an Admin can reset settings to defaults.', isError: true);
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset Settings to Defaults?'),
        content: const Text(
          'This restores currency, regional formats, pharmacy identity, paper width, scanner preference, thresholds, and active role to Clinix defaults.\n\nYour staff user accounts, sales history, stock inventory, purchases, and customer/supplier Khata ledger data will NOT be deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Reset Settings'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final defaults = await DatabaseHelper.instance.resetSettingsToDefaults();
    await PrinterService.instance.clearSavedPrinter();
    if (!mounted) return;
    setState(() => _applySettingsToState(defaults));
    widget.onSettingsChanged(defaults);
    _showSnack(
      'Settings reset to defaults. Users, sales, stock & ledger kept intact.',
    );
  }

  int get _activeAdminCount =>
      _users.where((u) => u.role == UserRole.admin && u.isActive).length;

  Future<void> _openUserDialog({PharmacyUser? existing}) async {
    if (!_isAdmin) {
      _showSnack('Only an Admin can manage user accounts.', isError: true);
      return;
    }

    final nameCtrl = TextEditingController(text: existing?.name ?? '');
    final usernameCtrl = TextEditingController(text: existing?.username ?? '');
    final pinCtrl = TextEditingController();
    UserRole selectedRole = existing?.role ?? UserRole.cashier;
    bool isActive = existing?.isActive ?? true;
    String? dialogError;

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(existing == null ? 'Add Staff User' : 'Edit Staff User'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (dialogError != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    margin: const EdgeInsets.only(bottom: 10),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(
                      dialogError!,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.red.shade800,
                      ),
                    ),
                  ),
                ],
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Full Name *',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: usernameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Username *',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<UserRole>(
                  value: selectedRole,
                  decoration: const InputDecoration(
                    labelText: 'Role *',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: UserRole.values
                      .map(
                        (r) => DropdownMenuItem(
                          value: r,
                          child: Text(r.label),
                        ),
                      )
                      .toList(),
                  onChanged: (val) {
                    if (val != null) setDialogState(() => selectedRole = val);
                  },
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: pinCtrl,
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: existing == null
                        ? 'PIN / Password (min 4 chars) *'
                        : 'New PIN / Password (leave blank to keep)',
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 6),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text(
                    'Account Active',
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                  ),
                  value: isActive,
                  onChanged: (val) => setDialogState(() => isActive = val),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0D7A5F),
              ),
              onPressed: () async {
                try {
                  if (existing == null) {
                    await DatabaseHelper.instance.insertUser(
                      PharmacyUser(
                        name: nameCtrl.text.trim(),
                        username: usernameCtrl.text.trim(),
                        role: selectedRole,
                        pinOrPassword: pinCtrl.text.trim(),
                        isActive: isActive,
                        createdAt: DateTime.now().toIso8601String(),
                      ),
                    );
                  } else {
                    await DatabaseHelper.instance.updateUser(
                      existing.copyWith(
                        name: nameCtrl.text.trim(),
                        username: usernameCtrl.text.trim(),
                        role: selectedRole,
                        pinOrPassword: pinCtrl.text.trim().isEmpty
                            ? existing.pinOrPassword
                            : pinCtrl.text.trim(),
                        isActive: isActive,
                      ),
                    );
                  }
                  if (ctx.mounted) Navigator.of(ctx).pop(true);
                } catch (e) {
                  setDialogState(() {
                    dialogError = e
                        .toString()
                        .replaceFirst('Bad state: ', '')
                        .replaceFirst('Invalid argument(s): ', '');
                  });
                }
              },
              child: Text(existing == null ? 'Create User' : 'Save Changes'),
            ),
          ],
        ),
      ),
    );

    nameCtrl.dispose();
    usernameCtrl.dispose();
    pinCtrl.dispose();

    if (saved == true) {
      await _loadUsers();
      widget.onUsersChanged?.call();
      _showSnack(existing == null ? 'Staff user created.' : 'Staff user updated.');
    }
  }

  Future<void> _changeUserRole(PharmacyUser user, UserRole nextRole) async {
    if (!_isAdmin || user.id == null) return;
    try {
      await DatabaseHelper.instance.updateUser(user.copyWith(role: nextRole));
      await _loadUsers();
      widget.onUsersChanged?.call();
      _showSnack('Updated ${user.name} role to ${nextRole.label}.');
    } catch (e) {
      _showSnack(
        e.toString().replaceFirst('Bad state: ', ''),
        isError: true,
      );
    }
  }

  Future<void> _toggleUserStatus(PharmacyUser user) async {
    if (!_isAdmin || user.id == null) return;
    try {
      await DatabaseHelper.instance.toggleUserActive(user.id!);
      await _loadUsers();
      widget.onUsersChanged?.call();
      _showSnack(
        '${user.name} is now ${user.isActive ? 'Disabled' : 'Active'}.',
      );
    } catch (e) {
      _showSnack(
        e.toString().replaceFirst('Bad state: ', ''),
        isError: true,
      );
    }
  }

  Future<void> _confirmDeleteUser(PharmacyUser user) async {
    if (!_isAdmin || user.id == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Staff User?'),
        content: Text(
          'Remove ${user.name} (@${user.username}, ${user.role.label}) from staff logins?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await DatabaseHelper.instance.deleteUser(
        user.id!,
        currentUsername: widget.currentUsername,
      );
      await _loadUsers();
      widget.onUsersChanged?.call();
      _showSnack('Removed user "${user.name}".');
    } catch (e) {
      _showSnack(
        e.toString().replaceFirst('Bad state: ', ''),
        isError: true,
      );
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor:
              isError ? Colors.red.shade700 : const Color(0xFF0D7A5F),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final previewDraft = _collectDraftSettings();
    final previewMoney = CurrencyFormatter.format(1450.5, previewDraft);
    final previewDate = CurrencyFormatter.formatDate(
      DateTime.now().toIso8601String(),
      previewDraft,
      includeTime: true,
    );
    final activeCode = _currencyCodeCtrl.text.trim().toUpperCase();
    final tzOptions = [
      ...CurrencyFormatter.commonTimezones,
      if (_timezoneCtrl.text.trim().isNotEmpty &&
          !CurrencyFormatter.commonTimezones
              .contains(_timezoneCtrl.text.trim()))
        _timezoneCtrl.text.trim(),
    ];

    return Scaffold(
      appBar: AppBar(
        leading: widget.onOpenDrawer != null
            ? IconButton(
                icon: const Icon(Icons.menu),
                onPressed: widget.onOpenDrawer,
              )
            : null,
        title: const Text(
          'Pharmacy Settings',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0D7A5F),
              ),
              onPressed: _saving ? null : () => _saveSettings(),
              icon: const Icon(Icons.save, size: 17),
              label: Text(_saving ? 'Saving...' : 'Save'),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 32),
        children: [
          // 1. CURRENCY & REGIONAL SETTINGS
          _buildSectionHeader(
            icon: Icons.currency_exchange_outlined,
            title: '1. Currency & Regional Settings',
            subtitle:
                'Applies across POS, Inventory, Purchases, Receipts, and A5 PDFs',
          ),
          _buildCard([
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0D7A5F).withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: const Color(0xFF0D7A5F).withOpacity(0.28),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'LIVE FORMAT PREVIEW',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.7,
                      color: Colors.grey.shade700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        previewMoney,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0D7A5F),
                        ),
                      ),
                      Text(
                        previewDate,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Quick Currency Presets',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: CurrencyFormatter.presets.map((preset) {
                final isSelected = activeCode == preset.code;
                return ChoiceChip(
                  label: Text(
                    preset.label,
                    style: const TextStyle(fontSize: 12),
                  ),
                  selected: isSelected,
                  visualDensity: VisualDensity.compact,
                  onSelected: (_) => _applyCurrencyPreset(preset),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _currencyCodeCtrl,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Currency Code (ISO)',
                      hintText: 'PKR, USD, EUR...',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _currencySymbolCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Currency Symbol',
                      hintText: r'Rs, $, €, £...',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Use Symbol Instead of ISO Code',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
              subtitle: Text(
                _useSymbolInsteadOfCode
                    ? 'Showing symbol (${_currencySymbolCtrl.text.trim().isEmpty ? 'Rs' : _currencySymbolCtrl.text.trim()})'
                    : 'Showing clean ISO code (${activeCode.isEmpty ? 'PKR' : activeCode})',
                style: const TextStyle(fontSize: 12),
              ),
              value: _useSymbolInsteadOfCode,
              onChanged: (val) =>
                  setState(() => _useSymbolInsteadOfCode = val),
            ),
            const SizedBox(height: 8),
            const Text(
              'Decimal Precision',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 0, label: Text('0 Decimals')),
                ButtonSegment(value: 2, label: Text('2 Decimals')),
                ButtonSegment(value: 3, label: Text('3 Decimals')),
              ],
              selected: {_decimalDigits},
              onSelectionChanged: (sel) =>
                  setState(() => _decimalDigits = sel.first),
            ),
            const SizedBox(height: 12),
            const Text(
              'Symbol / Code Position',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'prefix', label: Text('Prefix (PKR 100)')),
                ButtonSegment(value: 'suffix', label: Text('Suffix (100 PKR)')),
              ],
              selected: {_symbolPosition},
              onSelectionChanged: (sel) =>
                  setState(() => _symbolPosition = sel.first),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: tzOptions.contains(_timezoneCtrl.text.trim())
                  ? _timezoneCtrl.text.trim()
                  : 'Asia/Karachi',
              decoration: const InputDecoration(
                labelText: 'Timezone Preset',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: tzOptions
                  .map(
                    (tz) => DropdownMenuItem(
                      value: tz,
                      child: Text(tz),
                    ),
                  )
                  .toList(),
              onChanged: (val) {
                if (val != null) {
                  setState(() => _timezoneCtrl.text = val);
                }
              },
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _timezoneCtrl,
              decoration: const InputDecoration(
                labelText: 'Custom Timezone (IANA)',
                hintText: 'e.g. Asia/Karachi',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            const Text(
              'Receipt & Report Date Format',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'DD/MM/YYYY', label: Text('DD/MM/YYYY')),
                ButtonSegment(value: 'MM/DD/YYYY', label: Text('MM/DD/YYYY')),
              ],
              selected: {_dateFormat},
              onSelectionChanged: (sel) =>
                  setState(() => _dateFormat = sel.first),
            ),
          ]),

          const SizedBox(height: 18),

          // 2. PHARMACY & RECEIPT DETAILS
          _buildSectionHeader(
            icon: Icons.storefront_outlined,
            title: '2. Pharmacy & Receipt Details',
            subtitle: 'Printed on ESC/POS thermal receipts and A5 PDF invoices',
          ),
          _buildCard([
            TextField(
              controller: _pharmacyNameCtrl,
              decoration: const InputDecoration(
                labelText: 'Pharmacy Name',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _addressCtrl,
              decoration: const InputDecoration(
                labelText: 'Branch / Address',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Phone Number',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _licenseCtrl,
                    decoration: const InputDecoration(
                      labelText: 'License / Reg #',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _websiteUrlCtrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Website URL (Optional)',
                hintText: 'https://clinixpharmacy.pk',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _footerNoteCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Receipt Footer Note',
                hintText: 'e.g. Thank-you or exchange policy line',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 6),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Show Website URL on Receipts & Invoices',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
              subtitle: const Text(
                'Print the website address on thermal receipts and A5 PDFs when entered',
                style: TextStyle(fontSize: 12),
              ),
              value: _showWebsiteOnReceipt,
              onChanged: (val) => setState(() => _showWebsiteOnReceipt = val),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Auto-trigger Receipt After Sale',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
              subtitle: const Text(
                'Automatically print via Bluetooth thermal printer (or A5 PDF fallback) on checkout',
                style: TextStyle(fontSize: 12),
              ),
              value: _autoPrintReceipt,
              onChanged: (val) => setState(() => _autoPrintReceipt = val),
            ),
          ]),

          const SizedBox(height: 18),

          // 3. PRINTER & BARCODE HARDWARE PREFERENCES
          _buildSectionHeader(
            icon: Icons.print_outlined,
            title: '3. Printer & Barcode Hardware',
            subtitle: 'Bluetooth ESC/POS printer, paper roll width & USB scanner',
          ),
          _buildCard([
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Row(
                children: [
                  const Icon(Icons.bluetooth_connected,
                      color: Color(0xFF0D7A5F)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _savedPrinterName ?? 'No Bluetooth Printer Selected',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13.5,
                          ),
                        ),
                        Text(
                          _savedPrinterMac != null &&
                                  _savedPrinterMac!.isNotEmpty
                              ? 'MAC: $_savedPrinterMac'
                              : 'Tap Select Printer to pair with a saved device',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed:
                        _loadingPrinters ? null : _pickPairedBluetoothPrinter,
                    icon: const Icon(Icons.bluetooth_searching, size: 18),
                    label: Text(
                        _loadingPrinters ? 'Loading...' : 'Select Printer'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF0D7A5F),
                    ),
                    onPressed: _testingPrint ? null : _runTestPrint,
                    icon: const Icon(Icons.receipt_long, size: 18),
                    label: Text(_testingPrint ? 'Printing...' : 'Test Print'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            const Text(
              'Default Receipt Paper Width',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 58, label: Text('58mm (32 cols)')),
                ButtonSegment(value: 80, label: Text('80mm (48 cols)')),
              ],
              selected: {_thermalPaperWidth},
              onSelectionChanged: (sel) =>
                  setState(() => _thermalPaperWidth = sel.first),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Prefer USB Barcode Scanner Focus',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
              subtitle: const Text(
                'Keep the POS search/barcode field focused for instant USB scan-to-cart',
                style: TextStyle(fontSize: 12),
              ),
              value: _preferUsbScannerFocus,
              onChanged: (val) =>
                  setState(() => _preferUsbScannerFocus = val),
            ),
          ]),

          const SizedBox(height: 18),

          // 4. COUNTER & ROLE DISPLAY OPTIONS
          _buildSectionHeader(
            icon: Icons.tune_outlined,
            title: '4. Counter & Role Display Options',
            subtitle: 'Stock/expiry alerts, active RBAC role, and staff profit visibility',
          ),
          _buildCard([
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _lowStockCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Low-Stock (< Units)',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _expiryAlertDaysCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Expiry Alert (Days)',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [30, 60, 90].map((days) {
                return ActionChip(
                  label: Text('$days days'),
                  onPressed: () =>
                      setState(() => _expiryAlertDaysCtrl.text = '$days'),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<UserRole>(
              value: _activeUserRole,
              decoration: const InputDecoration(
                labelText: 'Active User Role (POS Access)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: UserRole.values
                  .map(
                    (role) => DropdownMenuItem(
                      value: role,
                      child: Text(role.label),
                    ),
                  )
                  .toList(),
              onChanged: (val) {
                if (val != null) setState(() => _activeUserRole = val);
              },
            ),
            const SizedBox(height: 6),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Show Cost & Net Profit to Staff',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
              subtitle: const Text(
                'Disabled by default so Cost & Profit stay visible only for Admin / Manager',
                style: TextStyle(fontSize: 12),
              ),
              value: _showProfitToStaff,
              onChanged: (val) => setState(() => _showProfitToStaff = val),
            ),
            Text(
              (_activeUserRole.canViewProfitAndCost || _showProfitToStaff)
                  ? 'Cost and Net Profit are visible for ${_activeUserRole.label}.'
                  : 'Cost, Net Profit, and Khata Credit are hidden for ${_activeUserRole.label}.',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: (_activeUserRole.canViewProfitAndCost ||
                        _showProfitToStaff)
                    ? const Color(0xFF0D7A5F)
                    : Colors.amber.shade800,
              ),
            ),
          ]),

          const SizedBox(height: 18),

          // 5. DATA BACKUP & RESET SAFETY
          _buildSectionHeader(
            icon: Icons.security_outlined,
            title: '5. Data Backup & Reset Safety',
            subtitle: 'Export your SQLite database or reset settings safely',
          ),
          _buildCard([
            if (!_isAdmin) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.shade200),
                ),
                child: Text(
                  'Admin role required for full database backup export and resetting pharmacy defaults.',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.amber.shade900,
                  ),
                ),
              ),
            ],
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF0D7A5F),
                ),
                onPressed: (!_isAdmin || _exportingDb)
                    ? null
                    : _exportSqliteBackup,
                icon: const Icon(Icons.backup_outlined),
                label: Text(!_isAdmin
                    ? 'Export SQLite Backup (Admin Only)'
                    : _exportingDb
                        ? 'Preparing SQLite Backup...'
                        : 'Export / Backup SQLite Database'),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.red.shade700,
                  side: BorderSide(color: Colors.red.shade300),
                ),
                onPressed: _isAdmin ? _confirmResetDefaults : null,
                icon: const Icon(Icons.restart_alt),
                label: Text(
                  _isAdmin
                      ? 'Reset Settings to Defaults'
                      : 'Reset Settings (Admin Only)',
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Resetting settings never wipes staff user accounts, sales receipts, inventory stock, purchases, or customer/supplier Khata balances.',
              style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
            ),
          ]),

          const SizedBox(height: 18),

          // 6. USERS & ROLE MANAGEMENT
          KeyedSubtree(
            key: _usersSectionKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildSectionHeader(
                  icon: Icons.manage_accounts_outlined,
                  title: '6. Users & Role Management',
                  subtitle:
                      'Add staff accounts and assign Admin, Manager, Cashier, or Sales Staff permissions',
                ),
                _buildCard([
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          '${_users.where((u) => u.isActive).length} Active · $_activeAdminCount Active Admin${_activeAdminCount == 1 ? '' : 's'}',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ),
                      if (_isAdmin)
                        FilledButton.icon(
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF0D7A5F),
                          ),
                          onPressed: () => _openUserDialog(),
                          icon: const Icon(Icons.person_add_alt_1, size: 18),
                          label: const Text('Add User'),
                        )
                      else
                        Text(
                          'View Only (Admin Required)',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: Colors.amber.shade800,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (_loadingUsers)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(12),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  else
                    ..._users.map((u) {
                      final isLastActiveAdmin = u.role == UserRole.admin &&
                          u.isActive &&
                          _activeAdminCount <= 1;
                      final isCurrentUser = widget.currentUsername != null &&
                          u.username.toLowerCase() ==
                              widget.currentUsername!.trim().toLowerCase();

                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: u.isActive
                              ? Colors.grey.shade50
                              : Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.grey.shade300),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${u.name}${isCurrentUser ? ' (You)' : ''}',
                                        style: const TextStyle(
                                          fontSize: 13.5,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      Text(
                                        '@${u.username} · ${u.isActive ? 'Active' : 'Disabled'}${isLastActiveAdmin ? ' · Protected Admin' : ''}',
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          color: Colors.grey.shade600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Switch(
                                  value: u.isActive,
                                  onChanged: (!_isAdmin || isLastActiveAdmin)
                                      ? null
                                      : (_) => _toggleUserStatus(u),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: DropdownButtonFormField<UserRole>(
                                    value: u.role,
                                    decoration: const InputDecoration(
                                      labelText: 'Role',
                                      border: OutlineInputBorder(),
                                      isDense: true,
                                    ),
                                    items: UserRole.values
                                        .map(
                                          (r) => DropdownMenuItem(
                                            value: r,
                                            child: Text(r.label),
                                          ),
                                        )
                                        .toList(),
                                    onChanged: (!_isAdmin || isLastActiveAdmin)
                                        ? null
                                        : (val) {
                                            if (val != null && val != u.role) {
                                              _changeUserRole(u, val);
                                            }
                                          },
                                  ),
                                ),
                                const SizedBox(width: 8),
                                IconButton(
                                  tooltip: 'Edit User',
                                  onPressed: _isAdmin
                                      ? () => _openUserDialog(existing: u)
                                      : null,
                                  icon: const Icon(Icons.edit_outlined),
                                ),
                                IconButton(
                                  tooltip: isLastActiveAdmin
                                      ? 'Cannot delete last active Admin'
                                      : isCurrentUser
                                          ? 'Cannot delete signed-in user'
                                          : 'Delete User',
                                  onPressed: (!_isAdmin ||
                                          isLastActiveAdmin ||
                                          isCurrentUser)
                                      ? null
                                      : () => _confirmDeleteUser(u),
                                  icon: Icon(
                                    Icons.delete_outline,
                                    color: (!_isAdmin ||
                                            isLastActiveAdmin ||
                                            isCurrentUser)
                                        ? Colors.grey.shade400
                                        : Colors.red.shade700,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    }),
                ]),
              ],
            ),
          ),

          const SizedBox(height: 18),

          SizedBox(
            height: 48,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0D7A5F),
              ),
              onPressed: _saving ? null : () => _saveSettings(),
              icon: const Icon(Icons.save_outlined),
              label: Text(
                _saving ? 'Saving Settings...' : 'Save Settings to SQLite',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, left: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: const Color(0xFF0D7A5F)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(List<Widget> children) {
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade300),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: children,
        ),
      ),
    );
  }
}
