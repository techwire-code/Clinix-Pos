import 'dart:typed_data';

import 'package:flutter_bluetooth_serial/flutter_bluetooth_serial.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../utils/currency_formatter.dart';

enum ThermalPaperWidth { mm58, mm80 }

extension ThermalPaperWidthX on ThermalPaperWidth {
  int get columnsPerLine => this == ThermalPaperWidth.mm58 ? 32 : 48;
  String get label => this == ThermalPaperWidth.mm58 ? '58mm (32 cols)' : '80mm (48 cols)';
}

/// Offline ESC/POS Thermal Receipt Generator & Bluetooth Serial Print Service
/// tailored for Clinix Community Pharmacy, 17 KM Ferozepur Road, Lahore.
class PrinterService {
  PrinterService._internal();
  static final PrinterService instance = PrinterService._internal();

  static const String _prefMacKey = 'clinix_default_printer_mac';
  static const String _prefNameKey = 'clinix_default_printer_name';
  static const String _prefWidthKey = 'clinix_printer_paper_width';

  // ==================== SHARED PREFERENCES PERSISTENCE ====================

  Future<void> saveDefaultPrinter({
    required String macAddress,
    required String deviceName,
    ThermalPaperWidth width = ThermalPaperWidth.mm80,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefMacKey, macAddress);
    await prefs.setString(_prefNameKey, deviceName);
    await prefs.setString(_prefWidthKey, width.name);
  }

  Future<String?> getSavedPrinterMac() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_prefMacKey);
  }

  Future<String?> getSavedPrinterName() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_prefNameKey);
  }

  Future<ThermalPaperWidth> getSavedPaperWidth() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefWidthKey);
    return raw == ThermalPaperWidth.mm58.name
        ? ThermalPaperWidth.mm58
        : ThermalPaperWidth.mm80;
  }

  Future<void> clearSavedPrinter() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefMacKey);
    await prefs.remove(_prefNameKey);
  }

  // ==================== BLUETOOTH DISCOVERY & PRINTING ====================

  Future<List<BluetoothDevice>> getPairedDevices() async {
    final isEnabled = await FlutterBluetoothSerial.instance.isEnabled ?? false;
    if (!isEnabled) {
      await FlutterBluetoothSerial.instance.requestEnable();
    }
    return FlutterBluetoothSerial.instance.getBondedDevices();
  }

  Stream<BluetoothDiscoveryResult> startDiscovery() {
    return FlutterBluetoothSerial.instance.startDiscovery();
  }

  Future<void> printReceipt({
    required SaleRecord sale,
    required List<SaleItemRecord> items,
    String? overrideMacAddress,
    ThermalPaperWidth? overrideWidth,
    PharmacySettings? settings,
  }) async {
    final activeSettings =
        settings ?? await DatabaseHelper.instance.getSettings();
    final mac = overrideMacAddress ??
        activeSettings.savedPrinterMac ??
        await getSavedPrinterMac();
    if (mac == null || mac.isEmpty) {
      throw StateError(
        'No default thermal printer configured. Open Printer Settings or Settings to pair and save a Bluetooth printer.',
      );
    }

    final width = overrideWidth ??
        (activeSettings.thermalPaperWidth == 58
            ? ThermalPaperWidth.mm58
            : await getSavedPaperWidth());
    final bytes = buildEscPosReceipt(
      sale: sale,
      items: items,
      width: width,
      settings: activeSettings,
    );

    BluetoothConnection? connection;
    try {
      connection = await BluetoothConnection.toAddress(mac)
          .timeout(const Duration(seconds: 10));

      // Send in 512-byte chunks to avoid Bluetooth SPP buffer overrun.
      const int chunkSize = 512;
      for (int offset = 0; offset < bytes.length; offset += chunkSize) {
        final end = (offset + chunkSize > bytes.length)
            ? bytes.length
            : offset + chunkSize;
        connection.output.add(Uint8List.fromList(bytes.sublist(offset, end)));
        await connection.output.allSent;
      }
      await Future<void>.delayed(const Duration(milliseconds: 350));
    } finally {
      await connection?.finish();
    }
  }

  Future<void> printTestPage({
    required String macAddress,
    required ThermalPaperWidth width,
    PharmacySettings? settings,
  }) async {
    final demoSale = SaleRecord(
      invoiceNumber: 'TEST-0001',
      partyName: 'Printer Calibration Test',
      subtotal: 355.0,
      discountAmount: 20.0,
      netPayable: 335.0,
      totalCost: 293.0,
      netProfit: 42.0,
      paymentMode: PaymentMode.cash,
      createdAt: DateTime.now().toIso8601String(),
    );
    final demoItems = [
      const SaleItemRecord(
        itemId: 1,
        itemName: 'Panadol 500mg Strip',
        batchNumber: 'GSK-4481',
        quantity: 1,
        unitPrice: 35.0,
        costPrice: 28.0,
        itemDiscount: 0.0,
        lineTotal: 35.0,
      ),
      const SaleItemRecord(
        itemId: 2,
        itemName: 'Augmentin 625mg Pack',
        batchNumber: 'AUG-9021',
        quantity: 1,
        unitPrice: 320.0,
        costPrice: 265.0,
        itemDiscount: 20.0,
        lineTotal: 300.0,
      ),
    ];

    await printReceipt(
      sale: demoSale,
      items: demoItems,
      overrideMacAddress: macAddress,
      overrideWidth: width,
      settings: settings,
    );
  }

  // ==================== ESC/POS BYTE GENERATOR ====================

  /// Builds raw ESC/POS commands for 58mm (32-col) and 80mm (48-col) thermal printers.
  List<int> buildEscPosReceipt({
    required SaleRecord sale,
    required List<SaleItemRecord> items,
    ThermalPaperWidth width = ThermalPaperWidth.mm80,
    PharmacySettings? settings,
  }) {
    final cfg = settings ?? PharmacySettings.defaults();
    final int cols = width.columnsPerLine;
    final List<int> buffer = [];
    final dateText =
        CurrencyFormatter.formatDate(sale.createdAt, cfg, includeTime: true);
    String fmtMoney(double val) => CurrencyFormatter.format(
          val,
          cfg,
          asciiOnly: true,
          grouping: false,
        );

    // ESC @ : Initialize printer
    buffer.addAll([0x1B, 0x40]);
    // ESC t 0 : Select PC437 codepage
    buffer.addAll([0x1B, 0x74, 0x00]);

    // Header: Centered + Double Height/Width + Bold
    buffer.addAll([0x1B, 0x61, 0x01]); // Center align
    buffer.addAll([0x1B, 0x45, 0x01]); // Bold ON
    buffer.addAll([0x1D, 0x21, 0x11]); // 2x width & height
    buffer.addAll(_line(cfg.pharmacyName.toUpperCase()));
    buffer.addAll([0x1D, 0x21, 0x00]); // Normal size
    buffer.addAll([0x1B, 0x45, 0x00]); // Bold OFF
    if (cfg.address.trim().isNotEmpty) {
      buffer.addAll(_line(cfg.address.trim()));
    }
    if (cfg.phone.trim().isNotEmpty) {
      buffer.addAll(_line('Tel: ${cfg.phone.trim()}'));
    }
    if (cfg.licenseNumber.trim().isNotEmpty) {
      buffer.addAll(_line('Lic: ${cfg.licenseNumber.trim()}'));
    }
    if (cfg.showWebsiteOnReceipt && cfg.websiteUrl.trim().isNotEmpty) {
      buffer.addAll(_line(cfg.websiteUrl.trim()));
    }
    buffer.addAll(_line('=' * cols));

    // Invoice metadata: Left aligned
    buffer.addAll([0x1B, 0x61, 0x00]); // Left align
    buffer.addAll(_line(_twoCol('Inv: ${sale.invoiceNumber}', sale.paymentMode.dbValue, cols)));
    if (sale.transactionReference != null &&
        sale.transactionReference!.isNotEmpty) {
      buffer.addAll(_line('Ref: ${sale.transactionReference}'));
    }
    buffer.addAll(_line('Date: $dateText'));
    buffer.addAll(_line('Party: ${sale.partyName}'));
    buffer.addAll(_line('-' * cols));

    // Column Header
    buffer.addAll([0x1B, 0x45, 0x01]); // Bold ON
    if (cols >= 48) {
      buffer.addAll(_line(
        '${_padRight('Item', 22)}${_padLeft('Qty', 5)}${_padLeft('Disc', 9)}${_padLeft('Total', 12)}',
      ));
    } else {
      buffer.addAll(_line(
        '${_padRight('Item', 15)}${_padLeft('Qty', 4)}${_padLeft('Total', 13)}',
      ));
    }
    buffer.addAll([0x1B, 0x45, 0x00]); // Bold OFF
    buffer.addAll(_line('-' * cols));

    // Itemized breakdown
    final int dec = cfg.decimalDigits;
    for (final item in items) {
      final lineTotalStr = item.lineTotal.toStringAsFixed(dec);
      if (cols >= 48) {
        final name = _truncate(item.itemName, 21);
        final discStr = item.itemDiscount > 0
            ? '-${item.itemDiscount.toStringAsFixed(dec)}'
            : '0';
        buffer.addAll(_line(
          '${_padRight(name, 22)}${_padLeft('${item.quantity}', 5)}${_padLeft(discStr, 9)}${_padLeft(lineTotalStr, 12)}',
        ));
        if (item.batchNumber.isNotEmpty) {
          buffer.addAll(_line(
              '  Batch: ${item.batchNumber} @ ${fmtMoney(item.unitPrice)}'));
        }
      } else {
        final name = _truncate(item.itemName, 14);
        buffer.addAll(_line(
          '${_padRight(name, 15)}${_padLeft('${item.quantity}', 4)}${_padLeft(lineTotalStr, 13)}',
        ));
        if (item.itemDiscount > 0) {
          buffer.addAll(_line(
              '  Rate:${item.unitPrice.toStringAsFixed(dec)} Disc:-${item.itemDiscount.toStringAsFixed(dec)}'));
        }
      }
    }

    buffer.addAll(_line('-' * cols));

    // Totals & Discounts
    buffer.addAll(_line(_twoCol('Subtotal:', fmtMoney(sale.subtotal), cols)));
    if (sale.discountAmount > 0) {
      buffer.addAll(_line(
        _twoCol('Total Discount:', '-${fmtMoney(sale.discountAmount)}', cols),
      ));
    }

    buffer.addAll([0x1B, 0x45, 0x01]); // Bold ON
    buffer.addAll([0x1D, 0x21, 0x01]); // Double height
    buffer.addAll(_line(
      _twoCol('NET PAYABLE:', fmtMoney(sale.netPayable), cols),
    ));
    buffer.addAll([0x1D, 0x21, 0x00]); // Normal height
    buffer.addAll([0x1B, 0x45, 0x00]); // Bold OFF

    if (sale.cashReceived != null) {
      buffer.addAll(_line(
        _twoCol('Cash Received:', fmtMoney(sale.cashReceived!), cols),
      ));
      final change =
          sale.changeReturned ?? (sale.cashReceived! - sale.netPayable);
      buffer.addAll(_line(
        _twoCol('Balance / Change:', fmtMoney(change), cols),
      ));
    }

    buffer.addAll(_line('=' * cols));

    // Footer
    buffer.addAll([0x1B, 0x61, 0x01]); // Center align
    if (sale.editedAt != null &&
        sale.editReason != null &&
        sale.editReason!.trim().isNotEmpty) {
      final revDate =
          CurrencyFormatter.formatDate(sale.editedAt!, cfg);
      final revLine = '* REVISED ($revDate): ${sale.editReason!.trim()}';
      for (final line in _wrapText(revLine, cols)) {
        buffer.addAll(_line(line));
      }
    }
    if (cfg.receiptFooter.trim().isNotEmpty) {
      for (final line in _wrapText(cfg.receiptFooter.trim(), cols)) {
        buffer.addAll(_line(line));
      }
    }
    buffer.addAll(_line('Thank you for visiting ${cfg.pharmacyName}!'));

    // Feed 4 lines & Partial Paper Cut: GS V 66 0
    buffer.addAll([0x1B, 0x64, 0x04]);
    buffer.addAll([0x1D, 0x56, 0x42, 0x00]);

    return buffer;
  }

  List<int> _line(String text) {
    final sanitized = text
        .replaceAll('—', '-')
        .replaceAll('–', '-')
        .replaceAll('•', '*')
        .replaceAll('’', "'")
        .replaceAll('‘', "'")
        .replaceAll('“', '"')
        .replaceAll('”', '"');
    final bytes = sanitized.codeUnits
        .map((code) => (code >= 0x20 && code <= 0xFF) ? code : 0x3F)
        .toList();
    return [...bytes, 0x0A];
  }

  String _truncate(String s, int max) =>
      s.length <= max ? s : '${s.substring(0, max - 1)}.';

  String _padRight(String s, int width) =>
      s.length >= width ? s.substring(0, width) : s.padRight(width);

  String _padLeft(String s, int width) =>
      s.length >= width ? s.substring(0, width) : s.padLeft(width);

  String _twoCol(String left, String right, int totalCols) {
    final space = totalCols - left.length - right.length;
    if (space <= 1) {
      return '$left $right';
    }
    return '$left${' ' * space}$right';
  }

  List<String> _wrapText(String text, int maxWidth) {
    final words = text.split(RegExp(r'\s+'));
    final lines = <String>[];
    var current = '';
    for (final word in words) {
      if (word.isEmpty) continue;
      if (current.isEmpty) {
        current = word;
      } else if (current.length + 1 + word.length <= maxWidth) {
        current = '$current $word';
      } else {
        lines.add(current);
        current = word;
      }
    }
    if (current.isNotEmpty) lines.add(current);
    return lines;
  }
}
