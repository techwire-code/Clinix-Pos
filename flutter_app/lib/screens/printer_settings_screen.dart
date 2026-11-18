import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bluetooth_serial/flutter_bluetooth_serial.dart';
import 'package:permission_handler/permission_handler.dart';

import '../services/printer_service.dart';

/// Bluetooth Thermal Printer Discovery, Pairing & MAC Persistence Screen.
class PrinterSettingsScreen extends StatefulWidget {
  const PrinterSettingsScreen({super.key});

  @override
  State<PrinterSettingsScreen> createState() => _PrinterSettingsScreenState();
}

class _PrinterSettingsScreenState extends State<PrinterSettingsScreen> {
  final List<BluetoothDevice> _pairedDevices = [];
  final List<BluetoothDiscoveryResult> _discoveredDevices = [];

  StreamSubscription<BluetoothDiscoveryResult>? _discoverySub;
  String? _savedMac;
  String? _savedName;
  ThermalPaperWidth _paperWidth = ThermalPaperWidth.mm80;

  bool _isScanning = false;
  bool _isPrintingTest = false;

  @override
  void initState() {
    super.initState();
    _loadSavedConfig();
  }

  @override
  void dispose() {
    _discoverySub?.cancel();
    super.dispose();
  }

  Future<void> _loadSavedConfig() async {
    final mac = await PrinterService.instance.getSavedPrinterMac();
    final name = await PrinterService.instance.getSavedPrinterName();
    final width = await PrinterService.instance.getSavedPaperWidth();
    await _refreshPairedDevices();

    if (!mounted) return;
    setState(() {
      _savedMac = mac;
      _savedName = name;
      _paperWidth = width;
    });
  }

  Future<bool> _ensureBluetoothPermissions() async {
    final statuses = await [
      Permission.bluetoothConnect,
      Permission.bluetoothScan,
      Permission.locationWhenInUse,
    ].request();

    final denied = statuses.values.any((s) => s.isPermanentlyDenied);
    if (denied && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Bluetooth permissions are required to discover thermal printers.'),
        ),
      );
      return false;
    }
    return true;
  }

  Future<void> _refreshPairedDevices() async {
    try {
      final ok = await _ensureBluetoothPermissions();
      if (!ok) return;
      final bonded = await PrinterService.instance.getPairedDevices();
      if (!mounted) return;
      setState(() {
        _pairedDevices
          ..clear()
          ..addAll(bonded);
      });
    } catch (e) {
      _showMessage('Unable to fetch paired devices: $e', isError: true);
    }
  }

  Future<void> _startScan() async {
    final ok = await _ensureBluetoothPermissions();
    if (!ok) return;

    await _discoverySub?.cancel();
    setState(() {
      _discoveredDevices.clear();
      _isScanning = true;
    });

    _discoverySub = PrinterService.instance.startDiscovery().listen(
      (result) {
        if (!mounted) return;
        final exists = _discoveredDevices
            .any((d) => d.device.address == result.device.address);
        if (!exists) {
          setState(() => _discoveredDevices.add(result));
        }
      },
      onDone: () {
        if (mounted) setState(() => _isScanning = false);
      },
      onError: (Object err) {
        if (mounted) setState(() => _isScanning = false);
        _showMessage('Scan error: $err', isError: true);
      },
    );
  }

  Future<void> _selectAndSavePrinter(BluetoothDevice device) async {
    final name = (device.name?.trim().isNotEmpty ?? false)
        ? device.name!.trim()
        : 'Thermal Printer';
    await PrinterService.instance.saveDefaultPrinter(
      macAddress: device.address,
      deviceName: name,
      width: _paperWidth,
    );

    if (!mounted) return;
    setState(() {
      _savedMac = device.address;
      _savedName = name;
    });
    _showMessage('Saved default printer: $name (${device.address})');
  }

  Future<void> _runTestPrint() async {
    if (_savedMac == null || _savedMac!.isEmpty) {
      _showMessage('Select and save a thermal printer first.', isError: true);
      return;
    }

    setState(() => _isPrintingTest = true);
    try {
      await PrinterService.instance.printTestPage(
        macAddress: _savedMac!,
        width: _paperWidth,
      );
      _showMessage('Test receipt printed successfully.');
    } catch (e) {
      _showMessage('Test print failed: $e', isError: true);
    } finally {
      if (mounted) setState(() => _isPrintingTest = false);
    }
  }

  void _showMessage(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
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
        title: const Text('Thermal Printer Settings'),
        actions: [
          IconButton(
            icon: Icon(_isScanning ? Icons.stop : Icons.bluetooth_searching),
            tooltip: _isScanning ? 'Scanning...' : 'Scan Nearby Printers',
            onPressed: _isScanning ? null : _startScan,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Active Saved Printer Card
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: Colors.grey.shade300),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Active Default Printer',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _savedMac != null
                        ? '${_savedName ?? 'Thermal Printer'} · MAC: $_savedMac'
                        : 'No default Bluetooth printer saved yet.',
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                  const SizedBox(height: 12),
                  SegmentedButton<ThermalPaperWidth>(
                    segments: ThermalPaperWidth.values
                        .map((w) => ButtonSegment(
                              value: w,
                              label: Text(w.label),
                            ))
                        .toList(),
                    selected: {_paperWidth},
                    onSelectionChanged: (sel) async {
                      final next = sel.first;
                      setState(() => _paperWidth = next);
                      if (_savedMac != null) {
                        await PrinterService.instance.saveDefaultPrinter(
                          macAddress: _savedMac!,
                          deviceName: _savedName ?? 'Thermal Printer',
                          width: next,
                        );
                      }
                    },
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _isPrintingTest ? null : _runTestPrint,
                          icon: const Icon(Icons.receipt_long),
                          label: Text(_isPrintingTest
                              ? 'Printing...'
                              : 'Print Test Receipt'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      OutlinedButton.icon(
                        onPressed: _isScanning ? null : _startScan,
                        icon: const Icon(Icons.refresh),
                        label: Text(_isScanning ? 'Scanning...' : 'Discover'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),
          const Text(
            'Paired Bluetooth Devices',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
          const SizedBox(height: 8),
          if (_pairedDevices.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('No paired Bluetooth printers found.'),
            )
          else
            ..._pairedDevices.map(
              (device) => ListTile(
                leading: const Icon(Icons.print),
                title: Text(device.name ?? 'Unnamed Device'),
                subtitle: Text(device.address),
                trailing: _savedMac == device.address
                    ? const Icon(Icons.check_circle, color: Color(0xFF0D7A5F))
                    : TextButton(
                        onPressed: () => _selectAndSavePrinter(device),
                        child: const Text('Set Default'),
                      ),
              ),
            ),

          if (_discoveredDevices.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text(
              'Discovered Nearby Devices',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
            ),
            const SizedBox(height: 8),
            ..._discoveredDevices.map(
              (result) => ListTile(
                leading: const Icon(Icons.bluetooth),
                title: Text(result.device.name ?? 'Unknown Bluetooth Device'),
                subtitle: Text('${result.device.address} · RSSI ${result.rssi}'),
                trailing: TextButton(
                  onPressed: () => _selectAndSavePrinter(result.device),
                  child: const Text('Select'),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
