import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:intl/intl.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../models/pharmacy_models.dart';

/// Singleton offline-first SQLite database helper for Clinix Community Pharmacy.
/// Supports Android/iOS (sqflite) as well as Windows/macOS/Linux desktop (sqflite_common_ffi).
class DatabaseHelper {
  DatabaseHelper._internal();
  static final DatabaseHelper instance = DatabaseHelper._internal();

  static const String _dbName = 'clinix_pharmacy_pos.db';
  static const int _dbVersion = 2;

  Database? _database;

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    if (!kIsWeb && (Platform.isWindows || Platform.isLinux || Platform.isMacOS)) {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    }

    final dbPath = await getDatabasesPath();
    final fullPath = p.join(dbPath, _dbName);

    return openDatabase(
      fullPath,
      version: _dbVersion,
      onConfigure: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
      },
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  Future<void> _createSettingsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        pharmacy_name TEXT NOT NULL,
        branch_address TEXT NOT NULL,
        phone_number TEXT NOT NULL DEFAULT '',
        license_number TEXT NOT NULL DEFAULT '',
        receipt_footer_note TEXT NOT NULL DEFAULT '',
        auto_print_receipt INTEGER NOT NULL DEFAULT 0,
        saved_printer_name TEXT,
        saved_printer_mac TEXT,
        paper_width_mm INTEGER NOT NULL DEFAULT 80,
        prefer_usb_scanner_focus INTEGER NOT NULL DEFAULT 1,
        currency_label TEXT NOT NULL DEFAULT 'PKR',
        low_stock_threshold INTEGER NOT NULL DEFAULT 10,
        near_expiry_days INTEGER NOT NULL DEFAULT 60,
        active_user_role TEXT NOT NULL DEFAULT 'admin',
        updated_at TEXT NOT NULL
      )
    ''');

    final columns = await db.rawQuery('PRAGMA table_info(app_settings)');
    final existingNames =
        columns.map((c) => c['name']?.toString()).whereType<String>().toSet();

    const expectedColumns = <String, String>{
      'pharmacy_name': "TEXT NOT NULL DEFAULT 'Clinix Community Pharmacy'",
      'branch_address': "TEXT NOT NULL DEFAULT '17 KM Ferozepur Road, Lahore'",
      'phone_number': "TEXT NOT NULL DEFAULT ''",
      'license_number': "TEXT NOT NULL DEFAULT ''",
      'receipt_footer_note': "TEXT NOT NULL DEFAULT ''",
      'auto_print_receipt': 'INTEGER NOT NULL DEFAULT 0',
      'saved_printer_name': 'TEXT',
      'saved_printer_mac': 'TEXT',
      'paper_width_mm': 'INTEGER NOT NULL DEFAULT 80',
      'prefer_usb_scanner_focus': 'INTEGER NOT NULL DEFAULT 1',
      'currency_label': "TEXT NOT NULL DEFAULT 'PKR'",
      'low_stock_threshold': 'INTEGER NOT NULL DEFAULT 10',
      'near_expiry_days': 'INTEGER NOT NULL DEFAULT 60',
      'active_user_role': "TEXT NOT NULL DEFAULT 'admin'",
      'updated_at': "TEXT NOT NULL DEFAULT ''",
    };

    for (final entry in expectedColumns.entries) {
      if (!existingNames.contains(entry.key)) {
        await db.execute(
          'ALTER TABLE app_settings ADD COLUMN ${entry.key} ${entry.value}',
        );
      }
    }
  }

  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await _createSettingsTable(db);
      final existing = await db.query('app_settings', where: 'id = 1');
      if (existing.isEmpty) {
        await db.insert(
          'app_settings',
          PharmacySettings.defaults().toMap(),
          conflictAlgorithm: ConflictAlgorithm.ignore,
        );
      }
    }
  }

  Future<void> _onCreate(Database db, int version) async {
    // 1. Items / Medicines Table
    await db.execute('''
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        barcode TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'General',
        units_per_box INTEGER NOT NULL DEFAULT 1,
        box_cost_price REAL NOT NULL DEFAULT 0,
        box_selling_price REAL NOT NULL DEFAULT 0,
        cost_price REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'Tablet',
        batch_number TEXT NOT NULL DEFAULT '',
        expiry_date TEXT NOT NULL DEFAULT ''
      )
    ''');
    await db.execute('CREATE INDEX idx_items_barcode ON items(barcode)');
    await db.execute('CREATE INDEX idx_items_name ON items(name)');

    // 2. Parties Table (Customers & Suppliers)
    await db.execute('''
      CREATE TABLE parties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL CHECK(type IN ('customer', 'supplier')),
        balance REAL NOT NULL DEFAULT 0
      )
    ''');

    // 3. Sales Header Table
    await db.execute('''
      CREATE TABLE sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        party_id INTEGER,
        subtotal REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        net_payable REAL NOT NULL,
        total_cost REAL NOT NULL DEFAULT 0,
        net_profit REAL NOT NULL DEFAULT 0,
        payment_mode TEXT NOT NULL,
        transaction_reference TEXT,
        cash_received REAL,
        change_returned REAL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL
      )
    ''');

    // 4. Sale Line Items Table
    await db.execute('''
      CREATE TABLE sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        batch_number TEXT NOT NULL DEFAULT '',
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        cost_price REAL NOT NULL,
        item_discount REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
      )
    ''');

    // 5. Purchases Header Table
    await db.execute('''
      CREATE TABLE purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_number TEXT NOT NULL UNIQUE,
        supplier_invoice_no TEXT NOT NULL DEFAULT '',
        supplier_id INTEGER NOT NULL,
        total_amount REAL NOT NULL,
        paid_amount REAL NOT NULL DEFAULT 0,
        balance_due REAL NOT NULL DEFAULT 0,
        payment_mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (supplier_id) REFERENCES parties(id) ON DELETE RESTRICT
      )
    ''');

    // 6. Purchase Line Items Table
    await db.execute('''
      CREATE TABLE purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        batch_number TEXT NOT NULL DEFAULT '',
        expiry_date TEXT NOT NULL DEFAULT '',
        quantity INTEGER NOT NULL,
        unit_cost REAL NOT NULL,
        line_total REAL NOT NULL,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
      )
    ''');

    // 7. Pharmacy Settings Table
    await _createSettingsTable(db);
    await db.insert(
      'app_settings',
      PharmacySettings.defaults().toMap(),
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );

    await _seedInitialData(db);
  }

  Future<void> _seedInitialData(Database db) async {
    final seedItems = [
      const PharmacyItem(
        name: 'Panadol 500mg Tablets',
        barcode: '896400100101',
        category: 'Analgesics',
        unitsPerBox: 100,
        boxCostPrice: 280.0,
        boxSellingPrice: 350.0,
        costPrice: 2.8,
        sellingPrice: 3.5,
        stockQuantity: 1800,
        unit: 'Tablet',
        batchNumber: 'GSK-4481',
        expiryDate: '2027-08-30',
      ),
      const PharmacyItem(
        name: 'Augmentin 625mg Tablets',
        barcode: '896400100204',
        category: 'Antibiotics',
        unitsPerBox: 6,
        boxCostPrice: 265.0,
        boxSellingPrice: 320.0,
        costPrice: 44.17,
        sellingPrice: 53.33,
        stockQuantity: 252,
        unit: 'Tablet',
        batchNumber: 'AUG-9021',
        expiryDate: '2027-04-15',
      ),
      const PharmacyItem(
        name: 'Risek 20mg Capsules',
        barcode: '896400100309',
        category: 'Gastro',
        unitsPerBox: 14,
        boxCostPrice: 210.0,
        boxSellingPrice: 260.0,
        costPrice: 15.0,
        sellingPrice: 18.57,
        stockQuantity: 320,
        unit: 'Capsule',
        batchNumber: 'GTZ-7712',
        expiryDate: '2027-11-20',
      ),
      const PharmacyItem(
        name: 'Glucophage 500mg Tablets',
        barcode: '896400100411',
        category: 'Diabetes Care',
        unitsPerBox: 50,
        boxCostPrice: 175.0,
        boxSellingPrice: 220.0,
        costPrice: 3.5,
        sellingPrice: 4.4,
        stockQuantity: 550,
        unit: 'Tablet',
        batchNumber: 'MRK-1182',
        expiryDate: '2028-01-10',
      ),
      const PharmacyItem(
        name: 'Brufen 400mg Tablets',
        barcode: '896400100518',
        category: 'Analgesics',
        unitsPerBox: 20,
        boxCostPrice: 72.0,
        boxSellingPrice: 95.0,
        costPrice: 3.6,
        sellingPrice: 4.75,
        stockQuantity: 400,
        unit: 'Tablet',
        batchNumber: 'ABT-3340',
        expiryDate: '2027-06-30',
      ),
      const PharmacyItem(
        name: 'CaC-1000 Plus Orange',
        barcode: '896400100622',
        category: 'Supplements',
        unitsPerBox: 10,
        boxCostPrice: 245.0,
        boxSellingPrice: 300.0,
        costPrice: 24.5,
        sellingPrice: 30.0,
        stockQuantity: 8,
        unit: 'Tablet',
        batchNumber: 'HAL-6619',
        expiryDate: '2026-12-25',
      ),
    ];

    for (final item in seedItems) {
      await db.insert('items', item.toMap());
    }

    await db.insert(
      'parties',
      const Party(
        name: 'Walk-in Customer',
        phone: '0300-0000000',
        type: PartyType.customer,
        balance: 0.0,
      ).toMap(),
    );
    await db.insert(
      'parties',
      const Party(
        name: 'Haji Muhammad Sharif (Ferozepur Rd)',
        phone: '0321-4451982',
        type: PartyType.customer,
        balance: 2450.0,
      ).toMap(),
    );
    await db.insert(
      'parties',
      const Party(
        name: 'Muller & Phipps Lahore Dist.',
        phone: '042-35812044',
        type: PartyType.supplier,
        balance: 18500.0,
      ).toMap(),
    );
  }

  // ==================== ITEMS CRUD ====================

  Future<int> insertItem(PharmacyItem item) async {
    final db = await database;
    return db.insert('items', item.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<int> updateItem(PharmacyItem item) async {
    if (item.id == null) {
      throw ArgumentError('Cannot update PharmacyItem without an id.');
    }
    final db = await database;
    return db.update(
      'items',
      item.toMap(),
      where: 'id = ?',
      whereArgs: [item.id],
    );
  }

  Future<int> deleteItem(int id) async {
    final db = await database;
    return db.delete('items', where: 'id = ?', whereArgs: [id]);
  }

  Future<List<PharmacyItem>> getItems({String query = ''}) async {
    final db = await database;
    final clean = query.trim();
    final List<Map<String, dynamic>> rows;
    if (clean.isEmpty) {
      rows = await db.query('items', orderBy: 'name ASC');
    } else {
      rows = await db.query(
        'items',
        where: 'name LIKE ? OR barcode LIKE ? OR category LIKE ? OR batch_number LIKE ?',
        whereArgs: ['%$clean%', '%$clean%', '%$clean%', '%$clean%'],
        orderBy: 'name ASC',
      );
    }
    return rows.map(PharmacyItem.fromMap).toList();
  }

  Future<PharmacyItem?> findByBarcode(String barcode) async {
    final db = await database;
    final rows = await db.query(
      'items',
      where: 'barcode = ?',
      whereArgs: [barcode.trim()],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return PharmacyItem.fromMap(rows.first);
  }

  // ==================== PARTIES CRUD ====================

  Future<int> insertParty(Party party) async {
    final db = await database;
    return db.insert('parties', party.toMap());
  }

  Future<int> updateParty(Party party) async {
    if (party.id == null) {
      throw ArgumentError('Cannot update Party without an id.');
    }
    final db = await database;
    return db.update(
      'parties',
      party.toMap(),
      where: 'id = ?',
      whereArgs: [party.id],
    );
  }

  Future<List<Party>> getParties({PartyType? type}) async {
    final db = await database;
    final rows = await db.query(
      'parties',
      where: type != null ? 'type = ?' : null,
      whereArgs: type != null ? [type.name] : null,
      orderBy: 'name ASC',
    );
    return rows.map(Party.fromMap).toList();
  }

  Future<void> recordPartySettlement({
    required int partyId,
    required double amountPaidOrCollected,
  }) async {
    final db = await database;
    await db.rawUpdate(
      'UPDATE parties SET balance = MAX(0, balance - ?) WHERE id = ?',
      [amountPaidOrCollected, partyId],
    );
  }

  // ==================== TRANSACTIONAL SALE COMPLETION ====================

  Future<String> generateNextInvoiceNumber() async {
    final db = await database;
    final result = await db.rawQuery('SELECT COUNT(*) as cnt FROM sales');
    final count = (Sqflite.firstIntValue(result) ?? 0) + 1;
    final year = DateTime.now().year;
    return 'CLX-$year-${count.toString().padLeft(4, '0')}';
  }

  /// Atomically:
  /// 1. Verifies sufficient stock for every cart line.
  /// 2. Persists `sales` header with accurate net profit (subtracting ALL discounts).
  /// 3. Persists `sale_items` rows.
  /// 4. Deducts `stock_quantity` from `items`.
  /// 5. If `paymentMode == PaymentMode.creditKhata`, adds `netPayable` to customer's `To Collect` balance.
  Future<SaleRecord> completeSale({
    required List<CartLine> cartLines,
    required double billDiscount,
    required PaymentMode paymentMode,
    Party? party,
    String? transactionReference,
    double? cashReceived,
  }) async {
    if (cartLines.isEmpty) {
      throw StateError('Cannot complete sale with an empty cart.');
    }
    if (paymentMode.isCreditKhata && (party == null || party.id == null)) {
      throw StateError(
          'Select a customer party when completing a Credit / Khata sale.');
    }

    final db = await database;
    final invoiceNo = await generateNextInvoiceNumber();
    final createdAt = DateTime.now().toIso8601String();

    final double subtotal =
        cartLines.fold(0.0, (sum, line) => sum + line.grossTotal);
    final double itemDiscounts =
        cartLines.fold(0.0, (sum, line) => sum + line.clampedDiscount);
    final double afterItemDiscount = subtotal - itemDiscounts;
    final double safeBillDiscount =
        billDiscount.clamp(0.0, afterItemDiscount).toDouble();
    final double totalDiscount = itemDiscounts + safeBillDiscount;
    final double netPayable = afterItemDiscount - safeBillDiscount;
    final double totalCost =
        cartLines.fold(0.0, (sum, line) => sum + line.totalCost);

    // Crucial business rule: net profit subtracts BOTH item-level and bill-level discounts.
    final double netProfit = netPayable - totalCost;
    final double? changeReturned = cashReceived != null
        ? double.parse((cashReceived - netPayable).toStringAsFixed(2))
        : null;
    final cleanRef = transactionReference?.trim();

    final saleHeader = SaleRecord(
      invoiceNumber: invoiceNo,
      partyId: party?.id,
      partyName: party?.name ?? 'Walk-in Customer',
      subtotal: subtotal,
      discountAmount: totalDiscount,
      netPayable: netPayable,
      totalCost: totalCost,
      netProfit: netProfit,
      paymentMode: paymentMode,
      transactionReference:
          (cleanRef != null && cleanRef.isNotEmpty) ? cleanRef : null,
      cashReceived: cashReceived,
      changeReturned: changeReturned,
      createdAt: createdAt,
    );

    final int insertedSaleId = await db.transaction((txn) async {
      // 1. Validate & deduct inventory inside transaction
      for (final line in cartLines) {
        final itemId = line.item.id;
        if (itemId == null) {
          throw StateError('Cart item "${line.item.name}" is missing an ID.');
        }

        final stockRows = await txn.query(
          'items',
          columns: ['stock_quantity'],
          where: 'id = ?',
          whereArgs: [itemId],
          limit: 1,
        );

        if (stockRows.isEmpty) {
          throw StateError('Item "${line.item.name}" no longer exists.');
        }

        final currentStock = (stockRows.first['stock_quantity'] as num).toInt();
        if (currentStock < line.quantity) {
          throw StateError(
            'Insufficient stock for ${line.item.name} (Available: $currentStock, Requested: ${line.quantity}).',
          );
        }

        await txn.rawUpdate(
          'UPDATE items SET stock_quantity = stock_quantity - ? WHERE id = ?',
          [line.quantity, itemId],
        );
      }

      // 2. Insert sale header
      final saleId = await txn.insert('sales', saleHeader.toMap());

      // 3. Insert sale_items rows
      for (final line in cartLines) {
        final saleItem = SaleItemRecord(
          saleId: saleId,
          itemId: line.item.id!,
          itemName: line.item.name,
          batchNumber: line.item.batchNumber,
          quantity: line.quantity,
          unitPrice: line.item.sellingPrice,
          costPrice: line.item.costPrice,
          itemDiscount: line.clampedDiscount,
          lineTotal: line.lineTotal,
        );
        await txn.insert('sale_items', saleItem.toMap(saleId));
      }

      // 4. Update customer receivable balance for Credit / Khata sales
      if (paymentMode.isCreditKhata && party?.id != null) {
        await txn.rawUpdate(
          'UPDATE parties SET balance = balance + ? WHERE id = ?',
          [netPayable, party!.id],
        );
      }

      return saleId;
    });

    return SaleRecord(
      id: insertedSaleId,
      invoiceNumber: saleHeader.invoiceNumber,
      partyId: saleHeader.partyId,
      partyName: saleHeader.partyName,
      subtotal: saleHeader.subtotal,
      discountAmount: saleHeader.discountAmount,
      netPayable: saleHeader.netPayable,
      totalCost: saleHeader.totalCost,
      netProfit: saleHeader.netProfit,
      paymentMode: saleHeader.paymentMode,
      transactionReference: saleHeader.transactionReference,
      cashReceived: saleHeader.cashReceived,
      changeReturned: saleHeader.changeReturned,
      createdAt: saleHeader.createdAt,
    );
  }

  Future<List<SaleRecord>> getRecentSales({int limit = 50}) async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT s.*, COALESCE(p.name, 'Walk-in Customer') as party_name
      FROM sales s
      LEFT JOIN parties p ON s.party_id = p.id
      ORDER BY s.id DESC
      LIMIT ?
    ''', [limit]);
    return rows.map(SaleRecord.fromMap).toList();
  }

  Future<List<SaleItemRecord>> getSaleItems(int saleId) async {
    final db = await database;
    final rows = await db.query(
      'sale_items',
      where: 'sale_id = ?',
      whereArgs: [saleId],
    );
    return rows.map(SaleItemRecord.fromMap).toList();
  }

  // ==================== TRANSACTIONAL PURCHASE & SUPPLIER STOCK-IN ====================

  Future<String> generateNextPurchaseNumber() async {
    final db = await database;
    final result = await db.rawQuery('SELECT COUNT(*) as cnt FROM purchases');
    final count = (Sqflite.firstIntValue(result) ?? 0) + 1;
    final year = DateTime.now().year;
    return 'PUR-$year-${count.toString().padLeft(4, '0')}';
  }

  /// Atomically:
  /// 1. Persists `purchases` header and `purchase_items` rows.
  /// 2. Increments `stock_quantity` and updates cost/selling/batch/expiry on `items`.
  /// 3. Adds any unpaid `balance_due` to the supplier's `To Pay` balance.
  Future<PurchaseRecord> completePurchase({
    required Party supplier,
    required String supplierInvoiceNo,
    required List<PurchaseLine> lines,
    required double paidAmount,
    required PaymentMode paymentMode,
  }) async {
    if (supplier.type != PartyType.supplier || supplier.id == null) {
      throw StateError('A valid persisted supplier party is required.');
    }
    if (lines.isEmpty) {
      throw StateError('Cannot save purchase with zero line items.');
    }

    final db = await database;
    final purchaseNo = await generateNextPurchaseNumber();
    final createdAt = DateTime.now().toIso8601String();

    final double totalAmount =
        lines.fold(0.0, (sum, line) => sum + line.lineTotal);
    final double safePaid = paidAmount.clamp(0.0, totalAmount).toDouble();
    final double balanceDue = (totalAmount - safePaid).clamp(0.0, totalAmount).toDouble();

    final header = PurchaseRecord(
      purchaseNumber: purchaseNo,
      supplierInvoiceNo:
          supplierInvoiceNo.trim().isEmpty ? purchaseNo : supplierInvoiceNo.trim(),
      supplierId: supplier.id!,
      supplierName: supplier.name,
      totalAmount: totalAmount,
      paidAmount: safePaid,
      balanceDue: balanceDue,
      paymentMode: paymentMode,
      createdAt: createdAt,
    );

    final int insertedId = await db.transaction((txn) async {
      final purchaseId = await txn.insert('purchases', header.toMap());

      for (final line in lines) {
        int? itemId = line.item.id;
        if (itemId == null) {
          itemId = await txn.insert(
            'items',
            line.item.copyWith(
              costPrice: line.unitCost,
              sellingPrice: line.sellingPrice,
              stockQuantity: line.quantity,
              batchNumber: line.batchNumber,
              expiryDate: line.expiryDate,
            ).toMap(),
          );
        } else {
          await txn.rawUpdate(
            '''
            UPDATE items
            SET stock_quantity = stock_quantity + ?,
                cost_price = ?,
                selling_price = ?,
                batch_number = ?,
                expiry_date = ?
            WHERE id = ?
            ''',
            [
              line.quantity,
              line.unitCost,
              line.sellingPrice,
              line.batchNumber,
              line.expiryDate,
              itemId,
            ],
          );
        }

        final row = PurchaseItemRecord(
          purchaseId: purchaseId,
          itemId: itemId,
          itemName: line.item.name,
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate,
          quantity: line.quantity,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
        );
        await txn.insert('purchase_items', row.toMap(purchaseId));
      }

      if (balanceDue > 0) {
        await txn.rawUpdate(
          'UPDATE parties SET balance = balance + ? WHERE id = ?',
          [balanceDue, supplier.id],
        );
      }

      return purchaseId;
    });

    return PurchaseRecord(
      id: insertedId,
      purchaseNumber: header.purchaseNumber,
      supplierInvoiceNo: header.supplierInvoiceNo,
      supplierId: header.supplierId,
      supplierName: header.supplierName,
      totalAmount: header.totalAmount,
      paidAmount: header.paidAmount,
      balanceDue: header.balanceDue,
      paymentMode: header.paymentMode,
      createdAt: header.createdAt,
    );
  }

  Future<List<PurchaseRecord>> getRecentPurchases({int limit = 50}) async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT pu.*, p.name as supplier_name
      FROM purchases pu
      INNER JOIN parties p ON pu.supplier_id = p.id
      ORDER BY pu.id DESC
      LIMIT ?
    ''', [limit]);
    return rows.map(PurchaseRecord.fromMap).toList();
  }

  Future<List<PurchaseItemRecord>> getPurchaseItems(int purchaseId) async {
    final db = await database;
    final rows = await db.query(
      'purchase_items',
      where: 'purchase_id = ?',
      whereArgs: [purchaseId],
    );
    return rows.map(PurchaseItemRecord.fromMap).toList();
  }

  // ==================== APP SETTINGS & BACKUP ====================

  Future<PharmacySettings> getSettings() async {
    final db = await database;
    await _createSettingsTable(db);
    final rows = await db.query(
      'app_settings',
      where: 'id = 1',
      limit: 1,
    );
    if (rows.isEmpty) {
      final defaults = PharmacySettings.defaults();
      await db.insert(
        'app_settings',
        defaults.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
      return defaults;
    }
    return PharmacySettings.fromMap(rows.first);
  }

  Future<PharmacySettings> saveSettings(PharmacySettings settings) async {
    final db = await database;
    await _createSettingsTable(db);
    final payload = settings.toMap();
    final existing = await db.query(
      'app_settings',
      columns: ['id'],
      where: 'id = 1',
      limit: 1,
    );
    if (existing.isEmpty) {
      await db.insert(
        'app_settings',
        payload,
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    } else {
      final updateValues = Map<String, dynamic>.from(payload)..remove('id');
      await db.update(
        'app_settings',
        updateValues,
        where: 'id = 1',
      );
    }
    return settings;
  }

  /// Resets only the `app_settings` row (id = 1) back to factory defaults.
  /// Never touches items, parties, sales, or purchases tables.
  Future<PharmacySettings> resetSettingsToDefaults() async {
    final defaults = PharmacySettings.defaults();
    await saveSettings(defaults);
    return defaults;
  }

  /// Copies the active SQLite database file to a timestamped backup file
  /// in the temporary directory so it can be shared or saved externally.
  Future<String> exportDatabaseBackupFile() async {
    final db = await database;
    try {
      await db.rawQuery('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (_) {
      // Ignore if journal mode is not WAL
    }

    final dbPath = await getDatabasesPath();
    final sourceFile = File(p.join(dbPath, _dbName));
    if (!await sourceFile.exists()) {
      throw StateError('SQLite database file not found at ${sourceFile.path}');
    }

    final tempDir = await getTemporaryDirectory();
    final stamp = DateFormat('yyyyMMdd_HHmmss').format(DateTime.now());
    final backupPath = p.join(tempDir.path, 'clinix_pharmacy_backup_$stamp.db');
    await sourceFile.copy(backupPath);
    return backupPath;
  }
}
