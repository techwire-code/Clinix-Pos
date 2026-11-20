import 'package:flutter/material.dart';
import 'package:flutter_bluetooth_serial/flutter_bluetooth_serial.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:share_plus/share_plus.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../services/printer_service.dart';

/// Dedicated Settings Screen accessible from the POS navigation drawer.
/// Persists all internal pharmacy, receipt, hardware, counter, and role
/// preferences locally in SQLite without disturbing sales/stock/ledger data.
class SettingsScreen extends StatefulWidget {
  final PharmacySettings initialSettings;
  final ValueChanged<PharmacySettings> onSettingsChanged;
  final VoidCallback? onOpenDrawer;

  const SettingsScreen({
    super.key,
    required this.initialSettings,
    required this.onSettingsChanged,
    this.onOpenDrawer,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _pharmacyNameCtrl;
  late final TextEditingController _branchAddressCtrl;
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _licenseCtrl;
  late final TextEditingController _footerNoteCtrl;
  late final TextEditingController _currencyCtrl;
  late final TextEditingController _lowStockCtrl;
  late final TextEditingController _nearExpiryDaysCtrl;

  late bool _autoPrintReceipt;
  late String? _savedPrinterName;
  late String? _savedPrinterMac;
  late int _paperWidthMm;
  late bool _preferUsbScannerFocus;
  late UserRole _activeUserRole;

  List<BluetoothDevice> _pairedDevices = [];
  bool _loadingPrinters = false;
  bool _testingPrint = false;
  bool _saving = false;
  bool _exportingDb = false;

  @override
  void initState() {
    super.initState();
    final s = widget.initialSettings;
    _pharmacyNameCtrl = TextEditingController(text: s.pharmacyName);
    _branchAddressCtrl = TextEditingController(text: s.branchAddress);
    _phoneCtrl = TextEditingController(text: s.phoneNumber);
    _licenseCtrl = TextEditingController(text: s.licenseNumber);
    _footerNoteCtrl = TextEditingController(text: s.receiptFooterNote);
    _currencyCtrl = TextEditingController(text: s.currencyLabel);
    _lowStockCtrl = TextEditingController(text: '${s.lowStockThreshold}');
    _nearExpiryDaysCtrl = TextEditingController(text: '${s.nearExpiryDays}');

    _autoPrintReceipt = s.autoPrintReceipt;
    _savedPrinterName = s.savedPrinterName;
    _savedPrinterMac = s.savedPrinterMac;
    _paperWidthMm = s.paperWidthMm == 58 ? 58 : 80;
    _preferUsbScannerFocus = s.preferUsbScannerFocus;
    _activeUserRole = s.activeUserRole;

    _syncFromSqliteAndPrefs();
  }

  @override
  void dispose() {
    _pharmacyNameCtrl.dispose();
    _branchAddressCtrl.dispose();
    _phoneCtrl.dispose();
    _licenseCtrl.dispose();
    _footerNoteCtrl.dispose();
    _currencyCtrl.dispose();
    _lowStockCtrl.dispose();
    _nearExpiryDaysCtrl.dispose();
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
    _branchAddressCtrl.text = s.branchAddress;
    _phoneCtrl.text = s.phoneNumber;
    _licenseCtrl.text = s.licenseNumber;
    _footerNoteCtrl.text = s.receiptFooterNote;
    _currencyCtrl.text = s.currencyLabel;
    _lowStockCtrl.text = '${s.lowStockThreshold}';
    _nearExpiryDaysCtrl.text = '${s.nearExpiryDays}';

    _autoPrintReceipt = s.autoPrintReceipt;
    _savedPrinterName = s.savedPrinterName;
    _savedPrinterMac = s.savedPrinterMac;
    _paperWidthMm = s.paperWidthMm == 58 ? 58 : 80;
    _preferUsbScannerFocus = s.preferUsbScannerFocus;
    _activeUserRole = s.activeUserRole;
  }

  PharmacySettings _collectDraftSettings() {
    final name = _pharmacyNameCtrl.text.trim();
    final branch = _branchAddressCtrl.text.trim();
    final currency = _currencyCtrl.text.trim();
    final lowStock = int.tryParse(_lowStockCtrl.text.trim()) ?? 10;
    final nearExp = int.tryParse(_nearExpiryDaysCtrl.text.trim()) ?? 60;

    return PharmacySettings(
      pharmacyName: name.isEmpty ? 'Clinix Community Pharmacy' : name,
      branchAddress: branch.isEmpty ? '17 KM Ferozepur Road, Lahore' : branch,
      phoneNumber: _phoneCtrl.text.trim(),
      licenseNumber: _licenseCtrl.text.trim(),
      receiptFooterNote: _footerNoteCtrl.text.trim(),
      autoPrintReceipt: _autoPrintReceipt,
      savedPrinterName: _savedPrinterName,
      savedPrinterMac: _savedPrinterMac,
      paperWidthMm: _paperWidthMm == 58 ? 58 : 80,
      preferUsbScannerFocus: _preferUsbScannerFocus,
      currencyLabel: currency.isEmpty ? 'PKR' : currency.toUpperCase(),
      lowStockThreshold: lowStock < 1 ? 1 : lowStock,
      nearExpiryDays: nearExp < 1 ? 1 : nearExp,
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
            width: saved.paperWidthMm == 58
                ? ThermalPaperWidth.mm58
                : ThermalPaperWidth.mm80,
          );
        } catch (_) {
          // Non-fatal: settings are already safely persisted in SQLite.
        }
      }

      widget.onSettingsChanged(saved);
      if (showConfirmation && mounted) {
        _showSnack('Settings saved to SQLite and applied immediately.');
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
        width: _paperWidthMm == 58
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
    setState(() => _exportingDb = true);
    try {
      final backupPath =
          await DatabaseHelper.instance.exportDatabaseBackupFile();
      await Share.shareXFiles(
        [XFile(backupPath, mimeType: 'application/x-sqlite3')],
        subject: 'Clinix Pharmacy SQLite Database Backup',
        text: 'Offline SQLite backup of inventory, sales, Khata ledger, and settings.',
      );
      _showSnack('SQLite backup ready to save or share.');
    } catch (e) {
      _showSnack('Database backup failed: $e', isError: true);
    } finally {
      if (mounted) setState(() => _exportingDb = false);
    }
  }

  Future<void> _confirmResetDefaults() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset Settings to Defaults?'),
        content: const Text(
          'This restores pharmacy details, paper width, scanner preference, thresholds, and active role to defaults.\n\nYour sales history, stock inventory, and customer Khata ledger data will NOT be deleted.',
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
    _showSnack('Settings reset to defaults. Sales, stock & ledger kept intact.');
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: isError ? Colors.red.shade700 : const Color(0xFF0D7A5F),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
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
          // 1. PHARMACY & RECEIPT DETAILS
          _buildSectionHeader(
            icon: Icons.storefront_outlined,
            title: '1. Pharmacy & Receipt Details',
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
              controller: _branchAddressCtrl,
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

          // 2. PRINTER & BARCODE HARDWARE PREFERENCES
          _buildSectionHeader(
            icon: Icons.print_outlined,
            title: '2. Printer & Barcode Hardware',
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
              selected: {_paperWidthMm},
              onSelectionChanged: (sel) =>
                  setState(() => _paperWidthMm = sel.first),
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

          // 3. COUNTER & ROLE DISPLAY OPTIONS
          _buildSectionHeader(
            icon: Icons.tune_outlined,
            title: '3. Counter & Role Display Options',
            subtitle: 'Currency, stock/expiry alerts, and active counter RBAC role',
          ),
          _buildCard([
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _currencyCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Currency Label',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
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
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _nearExpiryDaysCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Near-Expiry Alert Window (Days)',
                hintText: 'e.g. 30 or 60',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [30, 60, 90].map((days) {
                return ActionChip(
                  label: Text('$days days'),
                  onPressed: () =>
                      setState(() => _nearExpiryDaysCtrl.text = '$days'),
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
            Text(
              _activeUserRole.canViewProfitAndCost
                  ? 'Cost, Net Profit, and Khata Credit are visible for ${_activeUserRole.label}.'
                  : 'Cost, Net Profit, and Khata Credit are hidden for ${_activeUserRole.label}.',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: _activeUserRole.canViewProfitAndCost
                    ? const Color(0xFF0D7A5F)
                    : Colors.amber.shade800,
              ),
            ),
          ]),

          const SizedBox(height: 18),

          // 4. DATA BACKUP & RESET SAFETY
          _buildSectionHeader(
            icon: Icons.security_outlined,
            title: '4. Data Backup & Reset Safety',
            subtitle: 'Export your SQLite database or reset settings safely',
          ),
          _buildCard([
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF0D7A5F),
                ),
                onPressed: _exportingDb ? null : _exportSqliteBackup,
                icon: const Icon(Icons.backup_outlined),
                label: Text(_exportingDb
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
                onPressed: _confirmResetDefaults,
                icon: const Icon(Icons.restart_alt),
                label: const Text('Reset Settings to Defaults'),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Resetting settings never wipes your sales receipts, inventory stock, or customer Khata ledger balances.',
              style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
            ),
          ]),

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
