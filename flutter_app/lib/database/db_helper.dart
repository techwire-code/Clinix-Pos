import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:intl/intl.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../models/pharmacy_models.dart';
import '../utils/currency_formatter.dart';
import '../utils/password_hash.dart';

/// Singleton offline-first SQLite database helper for Clinix Community Pharmacy.
/// Supports Android/iOS (sqflite) as well as Windows/macOS/Linux desktop (sqflite_common_ffi).
class DatabaseHelper {
  DatabaseHelper._internal();
  static final DatabaseHelper instance = DatabaseHelper._internal();

  static const String _dbName = 'clinix_pharmacy_pos.db';
  static const int _dbVersion = 9;
  static const String _settingsPrefsKey = 'clinix_app_settings_v2';

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
        shop_short_code TEXT NOT NULL DEFAULT 'CLX',
        branch_address TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '17 KM Ferozepur Road, Lahore',
        phone_number TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '+92 42 35950011',
        license_number TEXT NOT NULL DEFAULT '',
        website_url TEXT NOT NULL DEFAULT '',
        receipt_footer_note TEXT NOT NULL DEFAULT '',
        receipt_footer TEXT NOT NULL DEFAULT 'Unopened medicines with original invoice may be exchanged within 7 days.',
        auto_print_receipt INTEGER NOT NULL DEFAULT 1,
        saved_printer_name TEXT,
        saved_printer_mac TEXT,
        paper_width_mm INTEGER NOT NULL DEFAULT 80,
        thermal_paper_width INTEGER NOT NULL DEFAULT 80,
        show_website_on_receipt INTEGER NOT NULL DEFAULT 0,
        prefer_usb_scanner_focus INTEGER NOT NULL DEFAULT 1,
        currency_label TEXT NOT NULL DEFAULT 'PKR',
        currency_code TEXT NOT NULL DEFAULT 'PKR',
        currency_symbol TEXT NOT NULL DEFAULT 'Rs',
        use_symbol_instead_of_code INTEGER NOT NULL DEFAULT 0,
        decimal_digits INTEGER NOT NULL DEFAULT 2,
        symbol_position TEXT NOT NULL DEFAULT 'prefix',
        timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
        date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
        low_stock_threshold INTEGER NOT NULL DEFAULT 10,
        near_expiry_days INTEGER NOT NULL DEFAULT 30,
        expiry_alert_days INTEGER NOT NULL DEFAULT 30,
        show_profit_to_staff INTEGER NOT NULL DEFAULT 0,
        active_user_role TEXT NOT NULL DEFAULT 'admin',
        updated_at TEXT NOT NULL
      )
    ''');

    final columns = await db.rawQuery('PRAGMA table_info(app_settings)');
    final existingNames =
        columns.map((c) => c['name']?.toString()).whereType<String>().toSet();

    const expectedColumns = <String, String>{
      'pharmacy_name': "TEXT NOT NULL DEFAULT 'Clinix Community Pharmacy'",
      'shop_short_code': "TEXT NOT NULL DEFAULT 'CLX'",
      'branch_address': "TEXT NOT NULL DEFAULT '17 KM Ferozepur Road, Lahore'",
      'address': "TEXT NOT NULL DEFAULT '17 KM Ferozepur Road, Lahore'",
      'phone_number': "TEXT NOT NULL DEFAULT '+92 42 35950011'",
      'phone': "TEXT NOT NULL DEFAULT '+92 42 35950011'",
      'license_number': "TEXT NOT NULL DEFAULT 'DL-LHR-04892'",
      'website_url': "TEXT NOT NULL DEFAULT ''",
      'receipt_footer_note':
          "TEXT NOT NULL DEFAULT 'Unopened medicines with original invoice may be exchanged within 7 days.'",
      'receipt_footer':
          "TEXT NOT NULL DEFAULT 'Unopened medicines with original invoice may be exchanged within 7 days.'",
      'auto_print_receipt': 'INTEGER NOT NULL DEFAULT 1',
      'saved_printer_name': 'TEXT',
      'saved_printer_mac': 'TEXT',
      'paper_width_mm': 'INTEGER NOT NULL DEFAULT 80',
      'thermal_paper_width': 'INTEGER NOT NULL DEFAULT 80',
      'show_website_on_receipt': 'INTEGER NOT NULL DEFAULT 0',
      'prefer_usb_scanner_focus': 'INTEGER NOT NULL DEFAULT 1',
      'currency_label': "TEXT NOT NULL DEFAULT 'PKR'",
      'currency_code': "TEXT NOT NULL DEFAULT 'PKR'",
      'currency_symbol': "TEXT NOT NULL DEFAULT 'Rs'",
      'use_symbol_instead_of_code': 'INTEGER NOT NULL DEFAULT 0',
      'decimal_digits': 'INTEGER NOT NULL DEFAULT 2',
      'symbol_position': "TEXT NOT NULL DEFAULT 'prefix'",
      'timezone': "TEXT NOT NULL DEFAULT 'Asia/Karachi'",
      'date_format': "TEXT NOT NULL DEFAULT 'DD/MM/YYYY'",
      'low_stock_threshold': 'INTEGER NOT NULL DEFAULT 10',
      'near_expiry_days': 'INTEGER NOT NULL DEFAULT 30',
      'expiry_alert_days': 'INTEGER NOT NULL DEFAULT 30',
      'show_profit_to_staff': 'INTEGER NOT NULL DEFAULT 0',
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
    if (oldVersion < 3) {
      await _createSettingsTable(db);
      // Carry forward legacy v2 values into unified v3 columns when upgrading
      await db.execute('''
        UPDATE app_settings
        SET address = CASE WHEN TRIM(branch_address) != '' THEN branch_address ELSE address END,
            phone = CASE WHEN TRIM(phone_number) != '' THEN phone_number ELSE phone END,
            receipt_footer = CASE WHEN TRIM(receipt_footer_note) != '' THEN receipt_footer_note ELSE receipt_footer END,
            thermal_paper_width = CASE WHEN paper_width_mm IN (58, 80) THEN paper_width_mm ELSE thermal_paper_width END,
            currency_code = CASE WHEN TRIM(currency_label) != '' THEN UPPER(TRIM(currency_label)) ELSE currency_code END,
            expiry_alert_days = CASE WHEN near_expiry_days > 0 THEN near_expiry_days ELSE expiry_alert_days END
        WHERE id = 1
      ''');
    }
    if (oldVersion < 4) {
      final itemCols = await db.rawQuery('PRAGMA table_info(items)');
      final colNames =
          itemCols.map((c) => c['name']?.toString()).whereType<String>().toSet();
      if (!colNames.contains('generic_name')) {
        await db.execute(
          "ALTER TABLE items ADD COLUMN generic_name TEXT NOT NULL DEFAULT ''",
        );
      }
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_items_generic ON items(generic_name)',
      );
      const legacySeedGenerics = <String, String>{
        '896400100101': 'Paracetamol',
        '896400100204': 'Co-Amoxiclav (Amoxicillin + Clavulanic Acid)',
        '896400100309': 'Omeprazole',
        '896400100411': 'Metformin',
        '896400100518': 'Ibuprofen',
        '896400100622': 'Calcium + Vitamin C',
      };
      for (final entry in legacySeedGenerics.entries) {
        await db.update(
          'items',
          {'generic_name': entry.value},
          where: "barcode = ? AND TRIM(generic_name) = ''",
          whereArgs: [entry.key],
        );
      }
    }
    if (oldVersion < 5) {
      await _createUsersTable(db);
      await _seedDefaultUsersIfEmpty(db);
    }
    if (oldVersion < 6) {
      await _createKhataTable(db);
      await _backfillKhataLedger(db);
    }
    if (oldVersion < 7) {
      await _ensureAuditSchema(db);
    }
    if (oldVersion < 8) {
      await _createSupplierPaymentsTable(db);
      await _backfillSupplierPayments(db);
    }
    if (oldVersion < 9) {
      await _createExpensesTable(db);
    }
  }

  Future<void> _createExpensesTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Delivery & Misc',
        amount REAL NOT NULL DEFAULT 0,
        date TEXT NOT NULL,
        payment_mode TEXT NOT NULL DEFAULT 'Cash',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)',
    );
  }

  Future<void> _createSupplierPaymentsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL,
        purchase_id INTEGER,
        purchase_number TEXT,
        supplier_invoice_no TEXT,
        amount REAL NOT NULL DEFAULT 0,
        payment_mode TEXT NOT NULL DEFAULT 'Cash',
        reference TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_sup_pay_party ON supplier_payments(party_id, created_at)',
    );
  }

  Future<void> _backfillSupplierPayments(Database db) async {
    await _createSupplierPaymentsTable(db);
    final purchaseRows = await db.query(
      'purchases',
      where: 'paid_amount > 0.005',
      orderBy: 'created_at ASC, id ASC',
    );
    for (final p in purchaseRows) {
      final purId = (p['id'] as num?)?.toInt();
      final supId = (p['supplier_id'] as num?)?.toInt();
      final paid = (p['paid_amount'] as num?)?.toDouble() ?? 0.0;
      final purNo = p['purchase_number'] as String?;
      if (purId == null || supId == null || paid <= 0.005) continue;

      final existing = await db.query(
        'supplier_payments',
        columns: ['id'],
        where: 'party_id = ? AND (purchase_id = ? OR purchase_number = ?)',
        whereArgs: [supId, purId, purNo ?? ''],
        limit: 1,
      );
      if (existing.isEmpty) {
        final rawMode = (p['payment_mode'] as String?) ?? 'Cash';
        final payMode = (rawMode == 'Credit / Khata' ||
                rawMode == 'Credit/Party Ledger')
            ? 'Cash'
            : rawMode;
        await db.insert('supplier_payments', {
          'party_id': supId,
          'purchase_id': purId,
          'purchase_number': purNo,
          'supplier_invoice_no': p['supplier_invoice_no'] as String?,
          'amount': double.parse(paid.toStringAsFixed(2)),
          'payment_mode': payMode,
          'notes': 'Initial payment recorded with purchase bill',
          'created_at':
              (p['created_at'] as String?) ?? DateTime.now().toIso8601String(),
        });
      }
    }
  }

  Future<void> _ensureAuditSchema(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sale_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        edited_at TEXT NOT NULL,
        edited_by TEXT NOT NULL,
        edited_by_name TEXT NOT NULL,
        edited_by_role TEXT NOT NULL,
        reason TEXT NOT NULL,
        previous_net_payable REAL NOT NULL,
        new_net_payable REAL NOT NULL,
        previous_discount_amount REAL NOT NULL DEFAULT 0,
        new_discount_amount REAL NOT NULL DEFAULT 0,
        summary TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_sale_audit_sale_id ON sale_audit_logs(sale_id)',
    );

    final saleCols = await db.rawQuery('PRAGMA table_info(sales)');
    final saleColNames =
        saleCols.map((c) => c['name']?.toString()).whereType<String>().toSet();
    for (final entry in <String, String>{
      'edited_at': 'TEXT',
      'edited_by': 'TEXT',
      'edited_by_name': 'TEXT',
      'edit_reason': 'TEXT',
    }.entries) {
      if (!saleColNames.contains(entry.key)) {
        await db.execute(
          'ALTER TABLE sales ADD COLUMN ${entry.key} ${entry.value}',
        );
      }
    }

    await _createKhataTable(db);
    final khataCols =
        await db.rawQuery('PRAGMA table_info(party_ledger_entries)');
    final khataColNames =
        khataCols.map((c) => c['name']?.toString()).whereType<String>().toSet();
    for (final entry in <String, String>{
      'edited_at': 'TEXT',
      'edited_by': 'TEXT',
      'edited_by_name': 'TEXT',
      'edit_reason': 'TEXT',
      'previous_amount': 'REAL',
      'edit_summary': 'TEXT',
    }.entries) {
      if (!khataColNames.contains(entry.key)) {
        await db.execute(
          'ALTER TABLE party_ledger_entries ADD COLUMN ${entry.key} ${entry.value}',
        );
      }
    }
  }

  Future<void> _createKhataTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS party_ledger_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER NOT NULL,
        entry_type TEXT NOT NULL CHECK(entry_type IN ('opening_balance', 'credit_sale', 'collection', 'adjustment')),
        amount REAL NOT NULL DEFAULT 0,
        sale_id INTEGER,
        invoice_number TEXT,
        payment_mode TEXT,
        reference TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        edited_at TEXT,
        edited_by TEXT,
        edited_by_name TEXT,
        edit_reason TEXT,
        previous_amount REAL,
        edit_summary TEXT,
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_khata_party_date ON party_ledger_entries(party_id, created_at)',
    );
  }

  Future<void> _backfillKhataLedger(Database db) async {
    await _createKhataTable(db);

    // 1. Ensure every existing credit sale has a corresponding credit_sale entry
    final creditSales = await db.query(
      'sales',
      where: "party_id IS NOT NULL AND payment_mode IN ('Credit / Khata', 'Credit/Party Ledger')",
      orderBy: 'created_at ASC, id ASC',
    );
    for (final s in creditSales) {
      final saleId = (s['id'] as num?)?.toInt();
      final partyId = (s['party_id'] as num?)?.toInt();
      if (saleId == null || partyId == null) continue;
      final existing = await db.query(
        'party_ledger_entries',
        columns: ['id'],
        where: "entry_type = 'credit_sale' AND sale_id = ?",
        whereArgs: [saleId],
        limit: 1,
      );
      if (existing.isEmpty) {
        await db.insert('party_ledger_entries', {
          'party_id': partyId,
          'entry_type': 'credit_sale',
          'amount': (s['net_payable'] as num?)?.toDouble() ?? 0.0,
          'sale_id': saleId,
          'invoice_number': s['invoice_number'] as String?,
          'payment_mode': s['payment_mode'] as String?,
          'reference': s['transaction_reference'] as String?,
          'notes': 'Credit sale invoice ${s['invoice_number'] ?? ''}'.trim(),
          'created_at':
              (s['created_at'] as String?) ?? DateTime.now().toIso8601String(),
        });
      }
    }

    // 2. Reconcile any opening / brought-forward party balance
    final parties = await db.query('parties');
    for (final p in parties) {
      final partyId = (p['id'] as num?)?.toInt();
      final currentBal = (p['balance'] as num?)?.toDouble() ?? 0.0;
      if (partyId == null) continue;
      final entries = await db.query(
        'party_ledger_entries',
        where: 'party_id = ?',
        whereArgs: [partyId],
        orderBy: 'created_at ASC, id ASC',
      );
      double net = 0.0;
      bool hasOpening = false;
      String? earliestDate;
      for (final e in entries) {
        final type = (e['entry_type'] as String?) ?? '';
        final amt = (e['amount'] as num?)?.toDouble() ?? 0.0;
        if (type == 'opening_balance') hasOpening = true;
        earliestDate ??= e['created_at'] as String?;
        if (type == 'collection') {
          net -= amt;
        } else {
          net += amt;
        }
      }
      final diff = double.parse((currentBal - net).toStringAsFixed(2));
      if (diff > 0.01 && !hasOpening) {
        DateTime openingTime = DateTime(2026, 11, 1, 9, 0);
        if (earliestDate != null) {
          final parsed = DateTime.tryParse(earliestDate);
          if (parsed != null && !parsed.isAfter(openingTime)) {
            openingTime = parsed.subtract(const Duration(days: 1));
          }
        }
        await db.insert('party_ledger_entries', {
          'party_id': partyId,
          'entry_type': 'opening_balance',
          'amount': diff,
          'notes': 'Opening / Brought Forward Balance',
          'created_at': openingTime.toIso8601String(),
        });
      }
    }
  }

  Future<void> _createUsersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'Cashier',
        pin_or_password TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
    );
  }

  Future<void> _seedDefaultUsersIfEmpty(Database db) async {
    final countResult = await db.rawQuery('SELECT COUNT(*) as cnt FROM users');
    final count = (countResult.first['cnt'] as num?)?.toInt() ?? 0;
    if (count > 0) return;

    final nowIso = DateTime.now().toIso8601String();
    final defaults = [
      PharmacyUser(
        name: 'Dr. Khalid Minhas',
        username: 'admin',
        role: UserRole.admin,
        pinOrPassword: PasswordHash.hash('1234', customSalt: 'clinixseed1'),
        isActive: true,
        createdAt: nowIso,
      ),
      PharmacyUser(
        name: 'Bilal Ahmad',
        username: 'manager',
        role: UserRole.manager,
        pinOrPassword: PasswordHash.hash('2222', customSalt: 'clinixseed2'),
        isActive: true,
        createdAt: nowIso,
      ),
      PharmacyUser(
        name: 'Counter User',
        username: 'user',
        role: UserRole.cashier,
        pinOrPassword: PasswordHash.hash('1111', customSalt: 'clinixseed3'),
        isActive: true,
        createdAt: nowIso,
      ),
    ];

    for (final user in defaults) {
      await db.insert(
        'users',
        user.toMap(),
        conflictAlgorithm: ConflictAlgorithm.ignore,
      );
    }
  }

  Future<void> _onCreate(Database db, int version) async {
    // 1. Items / Medicines Table
    await db.execute('''
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        generic_name TEXT NOT NULL DEFAULT '',
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
    await db.execute('CREATE INDEX idx_items_generic ON items(generic_name)');

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
        edited_at TEXT,
        edited_by TEXT,
        edited_by_name TEXT,
        edit_reason TEXT,
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

    // 8. Staff Users & Roles Table
    await _createUsersTable(db);
    await _seedDefaultUsersIfEmpty(db);

    // 9. Customer & Party Khata Ledger, Audited Receipt Logs, Supplier Payments & Expenses
    await _createKhataTable(db);
    await _ensureAuditSchema(db);
    await _createSupplierPaymentsTable(db);
    await _createExpensesTable(db);

    await _seedInitialData(db);
  }

  Future<void> _seedInitialData(Database db) async {
    final seedItems = [
      const PharmacyItem(
        name: 'Panadol 500mg Tablets',
        genericName: 'Paracetamol',
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
        genericName: 'Co-Amoxiclav (Amoxicillin + Clavulanic Acid)',
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
        genericName: 'Omeprazole',
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
        genericName: 'Metformin',
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
        genericName: 'Ibuprofen',
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
        genericName: 'Calcium + Vitamin C',
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

    final insertedItemIds = <int>[];
    for (final item in seedItems) {
      final itemId = await db.insert('items', item.toMap());
      insertedItemIds.add(itemId);
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
    final mullerId = await db.insert(
      'parties',
      const Party(
        name: 'Muller & Phipps Lahore Dist.',
        phone: '042-35812044',
        type: PartyType.supplier,
        balance: 18500.0,
      ).toMap(),
    );

    if (insertedItemIds.length >= 3) {
      final purCreated = DateTime.now()
          .subtract(const Duration(days: 4))
          .toIso8601String();
      final seededPurchaseId = await db.insert('purchases', {
        'purchase_number': 'PUR-2026-0002',
        'supplier_invoice_no': 'MP-LHR-88410',
        'supplier_id': mullerId,
        'total_amount': 28500.0,
        'paid_amount': 10000.0,
        'balance_due': 18500.0,
        'payment_mode': 'Credit / Khata',
        'created_at': purCreated,
      });
      await db.insert('purchase_items', {
        'purchase_id': seededPurchaseId,
        'item_id': insertedItemIds[1],
        'item_name': 'Augmentin 625mg Tablets',
        'batch_number': 'AUG-9021',
        'expiry_date': '2027-04-15',
        'quantity': 400,
        'unit_cost': 44.25,
        'line_total': 17700.0,
      });
      await db.insert('purchase_items', {
        'purchase_id': seededPurchaseId,
        'item_id': insertedItemIds[2],
        'item_name': 'Risek 20mg Capsules',
        'batch_number': 'GTZ-7712',
        'expiry_date': '2027-11-20',
        'quantity': 720,
        'unit_cost': 15.0,
        'line_total': 10800.0,
      });
      await db.insert('supplier_payments', {
        'party_id': mullerId,
        'purchase_id': seededPurchaseId,
        'purchase_number': 'PUR-2026-0002',
        'supplier_invoice_no': 'MP-LHR-88410',
        'amount': 10000.0,
        'payment_mode': 'Bank Transfer',
        'reference': 'IBFT-MP-410',
        'notes': 'Initial partial payment recorded with purchase bill',
        'created_at': purCreated,
      });
    }

    await _backfillKhataLedger(db);
    await _backfillSupplierPayments(db);

    final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final nowIso = DateTime.now().toIso8601String();
    await db.insert('expenses', {
      'title': 'Pharmacy Counter Packaging & Thermal Rolls',
      'category': 'Supplies & Packaging',
      'amount': 650.0,
      'date': todayStr,
      'payment_mode': 'Cash',
      'notes': '80mm thermal paper rolls & dispensing envelopes',
      'created_at': nowIso,
    });
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
        where:
            'name LIKE ? OR generic_name LIKE ? OR barcode LIKE ? OR category LIKE ? OR batch_number LIKE ?',
        whereArgs: [
          '%$clean%',
          '%$clean%',
          '%$clean%',
          '%$clean%',
          '%$clean%',
        ],
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
    await _createKhataTable(db);
    return db.transaction((txn) async {
      final partyId = await txn.insert('parties', party.toMap());
      if (party.balance > 0) {
        await txn.insert('party_ledger_entries', {
          'party_id': partyId,
          'entry_type': 'opening_balance',
          'amount': party.balance,
          'notes': 'Opening / Brought Forward Balance',
          'created_at': DateTime.now().toIso8601String(),
        });
      }
      return partyId;
    });
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
    String paymentMode = 'Cash',
    String? notes,
    String? reference,
    DateTime? collectedAt,
    int? purchaseId,
  }) async {
    if (amountPaidOrCollected <= 0) return;
    final db = await database;
    final partyCheck = await db.query(
      'parties',
      columns: ['type'],
      where: 'id = ?',
      whereArgs: [partyId],
      limit: 1,
    );
    if (partyCheck.isEmpty) return;
    if (partyCheck.first['type'] == 'supplier') {
      await recordSupplierPayment(
        partyId: partyId,
        amount: amountPaidOrCollected,
        purchaseId: purchaseId,
        paymentMode: paymentMode,
        reference: reference,
        notes: notes,
        paidAt: collectedAt,
      );
      return;
    }

    await _createKhataTable(db);
    await db.transaction((txn) async {
      final partyRows = await txn.query(
        'parties',
        where: 'id = ?',
        whereArgs: [partyId],
        limit: 1,
      );
      if (partyRows.isEmpty) return;
      final currentBalance =
          (partyRows.first['balance'] as num?)?.toDouble() ?? 0.0;
      final applied = amountPaidOrCollected > currentBalance && currentBalance > 0
          ? currentBalance
          : amountPaidOrCollected;
      if (applied <= 0) return;

      await txn.rawUpdate(
        'UPDATE parties SET balance = MAX(0, balance - ?) WHERE id = ?',
        [applied, partyId],
      );

      final cleanNotes = notes?.trim();
      final cleanRef = reference?.trim();
      await txn.insert('party_ledger_entries', {
        'party_id': partyId,
        'entry_type': 'collection',
        'amount': applied,
        'payment_mode': paymentMode,
        'reference': (cleanRef != null && cleanRef.isNotEmpty) ? cleanRef : null,
        'notes': (cleanNotes != null && cleanNotes.isNotEmpty)
            ? cleanNotes
            : 'Collection received ($paymentMode)',
        'created_at': (collectedAt ?? DateTime.now()).toIso8601String(),
      });
    });
  }

  Future<SupplierPaymentEntry?> recordSupplierPayment({
    required int partyId,
    required double amount,
    int? purchaseId,
    String paymentMode = 'Cash',
    String? reference,
    String? notes,
    DateTime? paidAt,
  }) async {
    final round2 = (double v) => double.parse(v.toStringAsFixed(2));
    final rawAmt = round2(amount < 0 ? 0.0 : amount);
    if (rawAmt <= 0) return null;

    final db = await database;
    await _createSupplierPaymentsTable(db);
    final timestamp = (paidAt ?? DateTime.now()).toIso8601String();
    final cleanRef = reference?.trim();
    final cleanNotes = notes?.trim();

    return db.transaction((txn) async {
      final partyRows = await txn.query(
        'parties',
        where: 'id = ?',
        whereArgs: [partyId],
        limit: 1,
      );
      if (partyRows.isEmpty || partyRows.first['type'] != 'supplier') {
        return null;
      }
      final currentPartyBal =
          round2((partyRows.first['balance'] as num?)?.toDouble() ?? 0.0);

      double applied = 0.0;
      int? resolvedPurchaseId;
      String? linkedPurchaseNumber;
      String? linkedSupplierInvoiceNo;

      if (purchaseId != null) {
        final billRows = await txn.query(
          'purchases',
          where: 'id = ? AND supplier_id = ?',
          whereArgs: [purchaseId, partyId],
          limit: 1,
        );
        if (billRows.isEmpty) {
          throw StateError('Selected purchase bill was not found for this supplier.');
        }
        final bill = PurchaseRecord.fromMap(billRows.first);
        final billDue = round2(bill.balanceDue < 0 ? 0.0 : bill.balanceDue);
        if (billDue <= 0.005) {
          throw StateError('Bill ${bill.purchaseNumber} is already paid in full.');
        }
        applied = rawAmt > billDue ? billDue : rawAmt;
        if (applied <= 0) return null;

        final nextPaid = round2(bill.paidAmount + applied);
        final nextDue = round2((bill.totalAmount - nextPaid) < 0
            ? 0.0
            : (bill.totalAmount - nextPaid));

        await txn.update(
          'purchases',
          {
            'paid_amount': nextPaid,
            'balance_due': nextDue,
          },
          where: 'id = ?',
          whereArgs: [bill.id],
        );

        resolvedPurchaseId = bill.id;
        linkedPurchaseNumber = bill.purchaseNumber;
        linkedSupplierInvoiceNo = bill.supplierInvoiceNo;
      } else {
        applied = currentPartyBal > 0
            ? (rawAmt > currentPartyBal ? currentPartyBal : rawAmt)
            : 0.0;
        if (applied <= 0) return null;
      }

      await txn.rawUpdate(
        'UPDATE parties SET balance = MAX(0, ROUND(balance - ?, 2)) WHERE id = ?',
        [applied, partyId],
      );

      final entry = SupplierPaymentEntry(
        partyId: partyId,
        purchaseId: resolvedPurchaseId,
        purchaseNumber: linkedPurchaseNumber,
        supplierInvoiceNo: linkedSupplierInvoiceNo,
        amount: applied,
        paymentMode: paymentMode,
        reference: (cleanRef != null && cleanRef.isNotEmpty) ? cleanRef : null,
        notes: (cleanNotes != null && cleanNotes.isNotEmpty)
            ? cleanNotes
            : (linkedPurchaseNumber != null
                ? 'Payment allocated to $linkedPurchaseNumber'
                : 'General supplier payable payment'),
        createdAt: timestamp,
      );
      final insertedId = await txn.insert('supplier_payments', entry.toMap());
      return SupplierPaymentEntry(
        id: insertedId,
        partyId: entry.partyId,
        purchaseId: entry.purchaseId,
        purchaseNumber: entry.purchaseNumber,
        supplierInvoiceNo: entry.supplierInvoiceNo,
        amount: entry.amount,
        paymentMode: entry.paymentMode,
        reference: entry.reference,
        notes: entry.notes,
        createdAt: entry.createdAt,
      );
    });
  }

  // ==================== TRANSACTIONAL SALE COMPLETION ====================

  Future<String> generateNextInvoiceNumber({DateTime? date}) async {
    final db = await database;
    final settings = await getSettings();
    final code = PharmacySettings.normalizeShortCode(settings.shopShortCode);
    final dt = date ?? DateTime.now();
    final year = dt.year.toString().padLeft(4, '0');
    final month = dt.month.toString().padLeft(2, '0');
    final day = dt.day.toString().padLeft(2, '0');
    final prefix = '$code$year$month$day';

    final rows = await db.query(
      'sales',
      columns: ['invoice_number'],
      where: 'UPPER(invoice_number) LIKE ?',
      whereArgs: ['$prefix%'],
    );

    int maxSeq = 0;
    final digitsPattern = RegExp(r'^\d+$');
    for (final row in rows) {
      final inv = (row['invoice_number'] as String? ?? '').trim().toUpperCase();
      if (!inv.startsWith(prefix)) continue;
      final suffix = inv.substring(prefix.length);
      if (digitsPattern.hasMatch(suffix)) {
        final parsed = int.tryParse(suffix) ?? 0;
        if (parsed > maxSeq) maxSeq = parsed;
      }
    }
    return '$prefix${maxSeq + 1}';
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

      // 4. Update customer receivable balance & Khata ledger for Credit / Khata sales
      if (paymentMode.isCreditKhata && party?.id != null) {
        await txn.rawUpdate(
          'UPDATE parties SET balance = balance + ? WHERE id = ?',
          [netPayable, party!.id],
        );
        await txn.insert('party_ledger_entries', {
          'party_id': party.id,
          'entry_type': 'credit_sale',
          'amount': netPayable,
          'sale_id': saleId,
          'invoice_number': saleHeader.invoiceNumber,
          'payment_mode': saleHeader.paymentMode.dbValue,
          'reference': saleHeader.transactionReference,
          'notes':
              '${cartLines.length} medicine line(s) billed on credit',
          'created_at': saleHeader.createdAt,
        });
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

  Future<List<SaleAuditLogEntry>> getSaleAuditLogs(int saleId) async {
    final db = await database;
    await _ensureAuditSchema(db);
    final rows = await db.query(
      'sale_audit_logs',
      where: 'sale_id = ?',
      whereArgs: [saleId],
      orderBy: 'id ASC',
    );
    return rows.map(SaleAuditLogEntry.fromMap).toList();
  }

  Future<SaleRecord?> getSaleById(int saleId) async {
    final db = await database;
    await _ensureAuditSchema(db);
    final rows = await db.rawQuery('''
      SELECT s.*, COALESCE(p.name, 'Walk-in Customer') as party_name
      FROM sales s
      LEFT JOIN parties p ON s.party_id = p.id
      WHERE s.id = ?
      LIMIT 1
    ''', [saleId]);
    if (rows.isEmpty) return null;
    final base = SaleRecord.fromMap(rows.first);
    final logs = await getSaleAuditLogs(saleId);
    return base.copyWith(auditLogs: logs);
  }

  /// Atomically edits a Credit / Khata receipt with Admin/Manager authorization,
  /// mandatory audit reason, inventory stock delta reconciliation, Khata ledger update,
  /// and full customer balance recomputation.
  Future<SaleRecord> editCreditSale({
    required int saleId,
    required List<EditCreditReceiptLineInput> editedLines,
    required double billDiscount,
    required String reason,
    required String editedBy,
    required String editedByName,
    required UserRole editedByRole,
    String? transactionReference,
    PharmacySettings? settings,
  }) async {
    if (!editedByRole.canViewProfitAndCost) {
      throw StateError(
        'Only an Admin or Manager account can edit and reconcile a credit receipt.',
      );
    }
    final cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      throw ArgumentError(
        'Please enter an Audit / Correction Reason (at least 3 characters).',
      );
    }
    if (editedLines.isEmpty) {
      throw StateError('Receipt must contain at least one medicine line item.');
    }
    for (final line in editedLines) {
      if (line.quantity < 1) {
        throw ArgumentError('Quantity must be at least 1 for "${line.itemName}".');
      }
      if (line.unitPrice < 0) {
        throw ArgumentError('Unit price cannot be negative for "${line.itemName}".');
      }
      if (line.itemDiscount < 0) {
        throw ArgumentError('Discount cannot be negative for "${line.itemName}".');
      }
    }

    final db = await database;
    await _ensureAuditSchema(db);
    final activeSettings = settings ?? await getSettings();
    double round2(double v) => double.parse(v.toStringAsFixed(2));
    String fmt(double v) => CurrencyFormatter.format(v, activeSettings);

    await db.transaction((txn) async {
      final saleRows = await txn.rawQuery('''
        SELECT s.*, COALESCE(p.name, 'Walk-in Customer') as party_name
        FROM sales s
        LEFT JOIN parties p ON s.party_id = p.id
        WHERE s.id = ?
        LIMIT 1
      ''', [saleId]);
      if (saleRows.isEmpty) {
        throw StateError('Original sale receipt was not found.');
      }
      final originalSale = SaleRecord.fromMap(saleRows.first);
      if (!originalSale.paymentMode.isCreditKhata ||
          originalSale.partyId == null) {
        throw StateError(
          'Only Credit / Khata customer receipts can be edited through this audited workflow.',
        );
      }

      final origItemRows = await txn.query(
        'sale_items',
        where: 'sale_id = ?',
        whereArgs: [saleId],
        orderBy: 'id ASC',
      );
      final origItems = origItemRows.map(SaleItemRecord.fromMap).toList();

      final oldQtyByItem = <int, int>{};
      for (final l in origItems) {
        oldQtyByItem[l.itemId] = (oldQtyByItem[l.itemId] ?? 0) + l.quantity;
      }

      final newQtyByItem = <int, int>{};
      for (final l in editedLines) {
        newQtyByItem[l.itemId] = (newQtyByItem[l.itemId] ?? 0) + l.quantity;
      }

      final affectedIds = <int>{...oldQtyByItem.keys, ...newQtyByItem.keys};
      for (final itemId in affectedIds) {
        final delta =
            (newQtyByItem[itemId] ?? 0) - (oldQtyByItem[itemId] ?? 0);
        if (delta == 0) continue;
        final invRows = await txn.query(
          'items',
          columns: ['name', 'stock_quantity'],
          where: 'id = ?',
          whereArgs: [itemId],
          limit: 1,
        );
        if (invRows.isEmpty) {
          if (delta > 0) {
            throw StateError('Referenced medicine item #$itemId no longer exists.');
          }
          continue;
        }
        final currentStock = (invRows.first['stock_quantity'] as num).toInt();
        final itemName = (invRows.first['name'] as String?) ?? 'Medicine #$itemId';
        if (delta > 0 && currentStock < delta) {
          throw StateError(
            'Insufficient stock for $itemName (Available: $currentStock, Additional needed: $delta).',
          );
        }
        await txn.rawUpdate(
          'UPDATE items SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id = ?',
          [delta, itemId],
        );
      }

      final updatedSaleItems = <SaleItemRecord>[];
      for (final line in editedLines) {
        final rate = round2(line.unitPrice < 0 ? 0.0 : line.unitPrice);
        final gross = round2(rate * line.quantity);
        final disc = round2(line.itemDiscount.clamp(0.0, gross).toDouble());
        updatedSaleItems.add(
          SaleItemRecord(
            saleId: saleId,
            itemId: line.itemId,
            itemName: line.itemName,
            unit: line.unit,
            batchNumber: line.batchNumber,
            quantity: line.quantity,
            unitPrice: rate,
            costPrice: line.costPrice,
            itemDiscount: disc,
            lineTotal: round2(gross - disc),
          ),
        );
      }

      final subtotal = round2(
        updatedSaleItems.fold(0.0, (s, l) => s + (l.unitPrice * l.quantity)),
      );
      final itemDiscTotal = round2(
        updatedSaleItems.fold(0.0, (s, l) => s + l.itemDiscount),
      );
      final afterItem = (subtotal - itemDiscTotal) < 0
          ? 0.0
          : round2(subtotal - itemDiscTotal);
      final safeBillDisc =
          round2(billDiscount.clamp(0.0, afterItem).toDouble());
      final totalDiscount = round2(itemDiscTotal + safeBillDisc);
      final newNetPayable = round2(afterItem - safeBillDisc);
      final totalCost = round2(
        updatedSaleItems.fold(0.0, (s, l) => s + (l.costPrice * l.quantity)),
      );
      final newNetProfit = round2(newNetPayable - totalCost);

      final editedAt = DateTime.now().toIso8601String();
      final prevNet = round2(originalSale.netPayable);
      final creditDiff = round2(newNetPayable - prevNet);
      final sign = creditDiff > 0 ? '+' : '';
      final summaryParts = <String>[
        'Net credit: ${fmt(prevNet)} -> ${fmt(newNetPayable)} ($sign${fmt(creditDiff)})',
      ];
      if ((originalSale.discountAmount - totalDiscount).abs() > 0.005) {
        summaryParts.add(
          'Discount: ${fmt(originalSale.discountAmount)} -> ${fmt(totalDiscount)}',
        );
      }
      final oldTotalQty = origItems.fold(0, (s, i) => s + i.quantity);
      final newTotalQty = updatedSaleItems.fold(0, (s, i) => s + i.quantity);
      if (oldTotalQty != newTotalQty ||
          origItems.length != updatedSaleItems.length) {
        summaryParts.add(
          'Lines/Qty: ${origItems.length} ($oldTotalQty units) -> ${updatedSaleItems.length} ($newTotalQty units)',
        );
      }
      final summary = summaryParts.join(' · ');

      final cleanRef = transactionReference != null
          ? (transactionReference.trim().isEmpty
              ? null
              : transactionReference.trim())
          : originalSale.transactionReference;

      await txn.delete('sale_items', where: 'sale_id = ?', whereArgs: [saleId]);
      for (final si in updatedSaleItems) {
        await txn.insert('sale_items', si.toMap(saleId));
      }

      await txn.update(
        'sales',
        {
          'subtotal': subtotal,
          'discount_amount': totalDiscount,
          'net_payable': newNetPayable,
          'total_cost': totalCost,
          'net_profit': newNetProfit,
          'transaction_reference': cleanRef,
          'edited_at': editedAt,
          'edited_by': editedBy,
          'edited_by_name': editedByName,
          'edit_reason': cleanReason,
        },
        where: 'id = ?',
        whereArgs: [saleId],
      );

      await txn.insert('sale_audit_logs', {
        'sale_id': saleId,
        'edited_at': editedAt,
        'edited_by': editedBy,
        'edited_by_name': editedByName,
        'edited_by_role': editedByRole.label,
        'reason': cleanReason,
        'previous_net_payable': prevNet,
        'new_net_payable': newNetPayable,
        'previous_discount_amount': round2(originalSale.discountAmount),
        'new_discount_amount': totalDiscount,
        'summary': summary,
      });

      final existingLedger = await txn.query(
        'party_ledger_entries',
        where: "entry_type = 'credit_sale' AND sale_id = ?",
        whereArgs: [saleId],
        limit: 1,
      );
      final updatedNotes =
          '${updatedSaleItems.length} medicine line(s) billed on credit (Edited: $cleanReason)';
      if (existingLedger.isNotEmpty) {
        await txn.update(
          'party_ledger_entries',
          {
            'amount': newNetPayable,
            'reference': cleanRef,
            'notes': updatedNotes,
            'edited_at': editedAt,
            'edited_by': editedBy,
            'edited_by_name': editedByName,
            'edit_reason': cleanReason,
            'previous_amount': prevNet,
            'edit_summary': summary,
          },
          where: 'id = ?',
          whereArgs: [existingLedger.first['id']],
        );
      } else {
        await txn.insert('party_ledger_entries', {
          'party_id': originalSale.partyId,
          'entry_type': 'credit_sale',
          'amount': newNetPayable,
          'sale_id': saleId,
          'invoice_number': originalSale.invoiceNumber,
          'payment_mode': originalSale.paymentMode.dbValue,
          'reference': cleanRef,
          'notes': updatedNotes,
          'created_at': originalSale.createdAt,
          'edited_at': editedAt,
          'edited_by': editedBy,
          'edited_by_name': editedByName,
          'edit_reason': cleanReason,
          'previous_amount': prevNet,
          'edit_summary': summary,
        });
      }

      // Recompute customer's balance strictly from Khata ledger entries
      final ledgerSumRows = await txn.rawQuery('''
        SELECT COALESCE(SUM(
          CASE WHEN entry_type = 'collection' THEN -amount ELSE amount END
        ), 0.0) as net_bal
        FROM party_ledger_entries
        WHERE party_id = ?
      ''', [originalSale.partyId]);
      final rawBal =
          (ledgerSumRows.first['net_bal'] as num?)?.toDouble() ?? 0.0;
      final recalculatedBal = rawBal < 0 ? 0.0 : round2(rawBal);
      await txn.update(
        'parties',
        {'balance': recalculatedBal},
        where: 'id = ?',
        whereArgs: [originalSale.partyId],
      );
    });

    final refreshed = await getSaleById(saleId);
    if (refreshed == null) {
      throw StateError('Failed to reload edited receipt #$saleId.');
    }
    return refreshed;
  }

  Future<List<SaleRecord>> getRecentSales({int limit = 50}) async {
    final db = await database;
    await _ensureAuditSchema(db);
    final rows = await db.rawQuery('''
      SELECT s.*, COALESCE(p.name, 'Walk-in Customer') as party_name
      FROM sales s
      LEFT JOIN parties p ON s.party_id = p.id
      ORDER BY s.id DESC
      LIMIT ?
    ''', [limit]);
    final result = <SaleRecord>[];
    for (final row in rows) {
      final sr = SaleRecord.fromMap(row);
      if (sr.id != null && sr.editedAt != null) {
        final logs = await getSaleAuditLogs(sr.id!);
        result.add(sr.copyWith(auditLogs: logs));
      } else {
        result.add(sr);
      }
    }
    return result;
  }

  Future<List<SaleItemRecord>> getSaleItems(int saleId) async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT si.*, COALESCE(i.unit, 'Unit') as unit
      FROM sale_items si
      LEFT JOIN items i ON si.item_id = i.id
      WHERE si.sale_id = ?
      ORDER BY si.id ASC
    ''', [saleId]);
    return rows.map(SaleItemRecord.fromMap).toList();
  }

  // ==================== KHATA ACCOUNT STATEMENT ====================

  Future<CustomerKhataStatement> getCustomerKhataStatement(
    Party party, {
    DateTime? fromDate,
    DateTime? toDate,
  }) async {
    if (party.id == null) {
      return CustomerKhataStatement(
        party: party,
        openingBalanceBeforeRange: 0,
        rows: const [],
        totalCreditGiven: 0,
        totalCollected: 0,
        closingBalanceInRange: party.balance,
        currentBalanceDue: party.balance,
      );
    }

    final db = await database;
    await _backfillKhataLedger(db);

    final freshPartyRows = await db.query(
      'parties',
      where: 'id = ?',
      whereArgs: [party.id],
      limit: 1,
    );
    final freshParty = freshPartyRows.isNotEmpty
        ? Party.fromMap(freshPartyRows.first)
        : party;

    final entryRows = await db.query(
      'party_ledger_entries',
      where: 'party_id = ?',
      whereArgs: [freshParty.id],
      orderBy: 'created_at ASC, id ASC',
    );
    final entries = entryRows.map(KhataEntry.fromMap).toList();

    final saleRows = await db.rawQuery('''
      SELECT s.*, COALESCE(p.name, 'Walk-in Customer') as party_name
      FROM sales s
      LEFT JOIN parties p ON s.party_id = p.id
      WHERE s.party_id = ?
    ''', [freshParty.id]);
    final salesById = <int, SaleRecord>{};
    final salesByInvoice = <String, SaleRecord>{};
    for (final row in saleRows) {
      final sr = SaleRecord.fromMap(row);
      if (sr.id != null) salesById[sr.id!] = sr;
      salesByInvoice[sr.invoiceNumber] = sr;
    }

    final DateTime? rangeStart = fromDate != null
        ? DateTime(fromDate.year, fromDate.month, fromDate.day, 0, 0, 0)
        : null;
    final DateTime? rangeEnd = toDate != null
        ? DateTime(toDate.year, toDate.month, toDate.day, 23, 59, 59, 999)
        : null;

    double running = 0.0;
    double openingBeforeRange = 0.0;
    bool capturedOpening = false;
    final timeline = <CustomerKhataTimelineRow>[];

    for (final entry in entries) {
      final isCollection = entry.entryType == KhataEntryType.collection;
      final debit = isCollection ? 0.0 : entry.amount;
      final credit = isCollection ? entry.amount : 0.0;

      final dt = DateTime.tryParse(entry.createdAt);
      final afterFrom = rangeStart == null ||
          (dt != null && !dt.isBefore(rangeStart));
      final beforeTo = rangeEnd == null ||
          (dt != null && !dt.isAfter(rangeEnd));

      if (!capturedOpening && afterFrom) {
        openingBeforeRange = double.parse(running.toStringAsFixed(2));
        capturedOpening = true;
      }

      running = double.parse((running + debit - credit).toStringAsFixed(2));

      if (!afterFrom || !beforeTo) {
        continue;
      }

      SaleRecord? linkedSale;
      List<SaleItemRecord> billItems = const [];
      if (entry.entryType == KhataEntryType.creditSale) {
        if (entry.saleId != null && salesById.containsKey(entry.saleId)) {
          linkedSale = salesById[entry.saleId];
        } else if (entry.invoiceNumber != null &&
            salesByInvoice.containsKey(entry.invoiceNumber)) {
          linkedSale = salesByInvoice[entry.invoiceNumber];
        }
        if (linkedSale?.id != null) {
          billItems = await getSaleItems(linkedSale!.id!);
          if (linkedSale.editedAt != null) {
            final logs = await getSaleAuditLogs(linkedSale.id!);
            linkedSale = linkedSale.copyWith(auditLogs: logs);
          }
        }
      }

      String voucher = 'KH-${(entry.id ?? 0).toString().padLeft(4, '0')}';
      String title = 'Ledger Entry';
      String subtitle = (entry.notes ?? '').trim();

      switch (entry.entryType) {
        case KhataEntryType.openingBalance:
          title = 'Opening Balance';
          voucher = 'OPEN-${freshParty.id.toString().padLeft(3, '0')}';
          if (subtitle.isEmpty) {
            subtitle = 'Brought forward account balance';
          }
          break;
        case KhataEntryType.creditSale:
          title = 'Credit Sale (Udhaar)';
          voucher = entry.invoiceNumber ??
              linkedSale?.invoiceNumber ??
              voucher;
          if (billItems.isNotEmpty) {
            subtitle =
                '${billItems.length} medicine line${billItems.length == 1 ? '' : 's'} on credit';
          } else if (subtitle.isEmpty) {
            subtitle = 'Credit bill';
          }
          break;
        case KhataEntryType.collection:
          title = 'Collection Received (Vasooli)';
          voucher = 'COL-${(entry.id ?? 0).toString().padLeft(4, '0')}';
          final parts = <String>[
            if ((entry.paymentMode ?? '').trim().isNotEmpty)
              entry.paymentMode!.trim(),
            if ((entry.reference ?? '').trim().isNotEmpty)
              entry.reference!.trim(),
            if ((entry.notes ?? '').trim().isNotEmpty) entry.notes!.trim(),
          ];
          subtitle = parts.isEmpty ? 'Payment received' : parts.join(' · ');
          break;
        case KhataEntryType.adjustment:
          title = 'Balance Adjustment';
          voucher = 'ADJ-${(entry.id ?? 0).toString().padLeft(4, '0')}';
          if (subtitle.isEmpty) subtitle = 'Manual ledger adjustment';
          break;
      }

      timeline.add(
        CustomerKhataTimelineRow(
          entry: entry,
          voucherNumber: voucher,
          title: title,
          subtitle: subtitle,
          debit: debit,
          credit: credit,
          runningBalance: running,
          sale: linkedSale,
          items: billItems,
        ),
      );
    }

    if (!capturedOpening) {
      openingBeforeRange = double.parse(running.toStringAsFixed(2));
    }

    final totalCredit = timeline.fold(0.0, (sum, r) => sum + r.debit);
    final totalCollected = timeline.fold(0.0, (sum, r) => sum + r.credit);
    final closingInRange = timeline.isNotEmpty
        ? timeline.last.runningBalance
        : openingBeforeRange;

    return CustomerKhataStatement(
      party: freshParty,
      openingBalanceBeforeRange: openingBeforeRange,
      rows: timeline,
      totalCreditGiven: double.parse(totalCredit.toStringAsFixed(2)),
      totalCollected: double.parse(totalCollected.toStringAsFixed(2)),
      closingBalanceInRange: closingInRange,
      currentBalanceDue: freshParty.balance,
    );
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
    await _createSupplierPaymentsTable(db);
    final purchaseNo = await generateNextPurchaseNumber();
    final createdAt = DateTime.now().toIso8601String();
    double round2(double v) => double.parse(v.toStringAsFixed(2));

    final double totalAmount = round2(
      lines.fold(0.0, (sum, line) => sum + line.lineTotal),
    );
    final double safePaid =
        round2(paidAmount.clamp(0.0, totalAmount).toDouble());
    final double balanceDue =
        round2((totalAmount - safePaid).clamp(0.0, totalAmount).toDouble());

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
          'UPDATE parties SET balance = ROUND(balance + ?, 2) WHERE id = ?',
          [balanceDue, supplier.id],
        );
      }

      if (safePaid > 0.005) {
        await txn.insert('supplier_payments', {
          'party_id': supplier.id,
          'purchase_id': purchaseId,
          'purchase_number': header.purchaseNumber,
          'supplier_invoice_no': header.supplierInvoiceNo,
          'amount': safePaid,
          'payment_mode': paymentMode.isCreditKhata ? 'Cash' : paymentMode.dbValue,
          'notes': 'Initial payment recorded with purchase bill',
          'created_at': header.createdAt,
        });
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

  Future<List<PurchaseRecord>> getSupplierUnpaidBills(int supplierId) async {
    final db = await database;
    final rows = await db.rawQuery('''
      SELECT pu.*, p.name as supplier_name
      FROM purchases pu
      INNER JOIN parties p ON pu.supplier_id = p.id
      WHERE pu.supplier_id = ? AND pu.balance_due > 0.005
      ORDER BY pu.created_at DESC, pu.id DESC
    ''', [supplierId]);
    return rows.map(PurchaseRecord.fromMap).toList();
  }

  Future<SupplierLedgerStatement> getSupplierLedgerStatement(
    Party supplier,
  ) async {
    if (supplier.id == null) {
      return SupplierLedgerStatement(
        party: supplier,
        bills: const [],
        payments: const [],
        totalPurchased: 0,
        totalPaidOnBills: 0,
        totalBillRemaining: 0,
        totalPaymentsRecorded: 0,
        unallocatedOrOpeningBalance: supplier.balance,
        unpaidBillCount: 0,
        partialBillCount: 0,
        paidBillCount: 0,
        currentBalanceDue: supplier.balance,
      );
    }

    final db = await database;
    await _backfillSupplierPayments(db);
    double round2(double v) => double.parse(v.toStringAsFixed(2));

    final freshPartyRows = await db.query(
      'parties',
      where: 'id = ?',
      whereArgs: [supplier.id],
      limit: 1,
    );
    final freshParty = freshPartyRows.isNotEmpty
        ? Party.fromMap(freshPartyRows.first)
        : supplier;

    final purchaseRows = await db.rawQuery('''
      SELECT pu.*, p.name as supplier_name
      FROM purchases pu
      INNER JOIN parties p ON pu.supplier_id = p.id
      WHERE pu.supplier_id = ?
      ORDER BY pu.created_at DESC, pu.id DESC
    ''', [freshParty.id]);
    final billsRaw = purchaseRows.map(PurchaseRecord.fromMap).toList();

    final paymentRows = await db.query(
      'supplier_payments',
      where: 'party_id = ?',
      whereArgs: [freshParty.id],
      orderBy: 'created_at DESC, id DESC',
    );
    final payments = paymentRows.map(SupplierPaymentEntry.fromMap).toList();

    final billRows = <SupplierBillLedgerRow>[];
    for (final pur in billsRaw) {
      final items =
          pur.id != null ? await getPurchaseItems(pur.id!) : <PurchaseItemRecord>[];
      final allocated = payments
          .where((pay) =>
              (pur.id != null && pay.purchaseId == pur.id) ||
              (pur.purchaseNumber.isNotEmpty &&
                  pay.purchaseNumber == pur.purchaseNumber))
          .toList();
      billRows.add(
        SupplierBillLedgerRow(
          purchase: pur,
          status: pur.paymentStatus,
          items: items,
          allocatedPayments: allocated,
        ),
      );
    }

    final totalPurchased =
        round2(billRows.fold(0.0, (s, b) => s + b.purchase.totalAmount));
    final totalPaidOnBills =
        round2(billRows.fold(0.0, (s, b) => s + b.purchase.paidAmount));
    final totalBillRemaining =
        round2(billRows.fold(0.0, (s, b) => s + b.purchase.balanceDue));
    final totalPaymentsRecorded =
        round2(payments.fold(0.0, (s, p) => s + p.amount));
    final unallocated = round2(freshParty.balance - totalBillRemaining);

    return SupplierLedgerStatement(
      party: freshParty,
      bills: billRows,
      payments: payments,
      totalPurchased: totalPurchased,
      totalPaidOnBills: totalPaidOnBills,
      totalBillRemaining: totalBillRemaining,
      totalPaymentsRecorded: totalPaymentsRecorded,
      unallocatedOrOpeningBalance: unallocated,
      unpaidBillCount:
          billRows.where((b) => b.status == PurchasePaymentStatus.unpaid).length,
      partialBillCount: billRows
          .where((b) => b.status == PurchasePaymentStatus.partiallyPaid)
          .length,
      paidBillCount:
          billRows.where((b) => b.status == PurchasePaymentStatus.paid).length,
      currentBalanceDue: round2(freshParty.balance),
    );
  }

  // ==================== APP SETTINGS & BACKUP ====================

  Future<void> _mirrorSettingsToPrefs(PharmacySettings settings) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_settingsPrefsKey, jsonEncode(settings.toJson()));
    } catch (_) {
      // Non-fatal: SQLite remains primary persistence store
    }
  }

  Future<PharmacySettings?> _readSettingsFromPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_settingsPrefsKey);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return PharmacySettings.fromJson(decoded);
      }
    } catch (_) {
      // Ignore malformed JSON cache
    }
    return null;
  }

  Future<PharmacySettings> getSettings() async {
    final db = await database;
    await _createSettingsTable(db);
    final rows = await db.query(
      'app_settings',
      where: 'id = 1',
      limit: 1,
    );
    if (rows.isEmpty) {
      final initial =
          await _readSettingsFromPrefs() ?? PharmacySettings.defaults();
      await db.insert(
        'app_settings',
        initial.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
      await _mirrorSettingsToPrefs(initial);
      return initial;
    }
    final loaded = PharmacySettings.fromMap(rows.first);
    await _mirrorSettingsToPrefs(loaded);
    return loaded;
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
    await _mirrorSettingsToPrefs(settings);
    return settings;
  }

  /// Resets only the `app_settings` row (id = 1) back to factory defaults.
  /// Never touches items, parties, sales, or purchases tables.
  Future<PharmacySettings> resetSettingsToDefaults() async {
    final defaults = PharmacySettings.defaults();
    await saveSettings(defaults);
    return defaults;
  }

  /// Copies the active SQLite database file (which includes `users`, `app_settings`,
  /// `items`, `parties`, `sales`, and `purchases`) to a timestamped backup file.
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

  /// Exports a JSON snapshot including settings, managed staff users, items, parties, khata entries, supplier payments, and audit logs.
  Future<String> exportDatabaseBackupJson() async {
    final db = await database;
    await _createKhataTable(db);
    await _ensureAuditSchema(db);
    await _createSupplierPaymentsTable(db);
    await _createExpensesTable(db);
    final settings = await getSettings();
    final users = await getUsers();
    final items = await getItems();
    final parties = await getParties();
    final sales = await getRecentSales(limit: 1000);
    final purchases = await getRecentPurchases(limit: 1000);
    final expenseRows = await db.query(
      'expenses',
      orderBy: 'date DESC, id DESC',
    );
    final khataRows = await db.query(
      'party_ledger_entries',
      orderBy: 'created_at ASC, id ASC',
    );
    final supplierPaymentRows = await db.query(
      'supplier_payments',
      orderBy: 'created_at ASC, id ASC',
    );
    final auditRows = await db.query(
      'sale_audit_logs',
      orderBy: 'id ASC',
    );
    final payload = <String, dynamic>{
      'app': 'Clinix Community Pharmacy POS',
      'schemaVersion': _dbVersion,
      'exportedAt': DateTime.now().toIso8601String(),
      'tables': {
        'app_settings': settings.toJson(),
        'users': users.map((u) => u.toJson()).toList(),
        'items': items.map((i) => i.toMap()).toList(),
        'parties': parties.map((p) => p.toMap()).toList(),
        'sales': sales.map((s) => s.toMap()).toList(),
        'purchases': purchases.map((p) => p.toMap()).toList(),
        'expenses': expenseRows,
        'supplier_payments': supplierPaymentRows,
        'khata_entries': khataRows,
        'sale_audit_logs': auditRows,
      },
    };
    return const JsonEncoder.withIndent('  ').convert(payload);
  }

  // ==================== USERS & ROLE MANAGEMENT ====================

  Future<List<PharmacyUser>> getUsers() async {
    final db = await database;
    await _createUsersTable(db);
    await _seedDefaultUsersIfEmpty(db);
    final rows = await db.query('users', orderBy: 'id ASC');
    final parsed = <PharmacyUser>[];
    for (final row in rows) {
      var user = PharmacyUser.fromMap(row);
      if (user.id != null &&
          user.pinOrPassword.isNotEmpty &&
          !PasswordHash.isHashed(user.pinOrPassword)) {
        final hashed = PasswordHash.hash(user.pinOrPassword);
        await db.update(
          'users',
          {'pin_or_password': hashed},
          where: 'id = ?',
          whereArgs: [user.id],
        );
        user = user.copyWith(pinOrPassword: hashed);
      }
      parsed.add(user);
    }
    return parsed;
  }

  Future<int> countActiveAdmins() async {
    final users = await getUsers();
    return users
        .where((u) => u.role == UserRole.admin && u.isActive)
        .length;
  }

  Future<PharmacyUser?> authenticateUser(
    String usernameInput,
    String pinOrPasswordInput,
  ) async {
    final users = await getUsers();
    final cleanUser = usernameInput.trim().toLowerCase();
    final cleanPin = pinOrPasswordInput.trim();
    if (cleanUser.isEmpty || cleanPin.isEmpty) return null;

    PharmacyUser? matched;
    for (final u in users) {
      if (u.username.trim().toLowerCase() == cleanUser) {
        matched = u;
        break;
      }
    }

    if (matched == null &&
        (cleanUser == 'cashier' || cleanUser == 'sales')) {
      for (final u in users) {
        if (u.username.trim().toLowerCase() == 'user') {
          matched = u;
          break;
        }
      }
    }

    if (matched == null ||
        !PasswordHash.verify(cleanPin, matched.pinOrPassword)) {
      return null;
    }
    if (!matched.isActive) {
      throw StateError(
        'Account "${matched.username}" is disabled. Contact an Admin.',
      );
    }
    return matched;
  }

  Future<int> insertUser(PharmacyUser user) async {
    final db = await database;
    await _createUsersTable(db);
    final cleanName = user.name.trim();
    final cleanUsername = user.username.trim();
    final cleanPin = user.pinOrPassword.trim();

    if (cleanName.isEmpty) {
      throw ArgumentError('Staff full name is required.');
    }
    if (cleanUsername.isEmpty || cleanUsername.contains(' ')) {
      throw ArgumentError('Valid username without spaces is required.');
    }
    if (cleanPin.length < 4) {
      throw ArgumentError('PIN / Password must be at least 4 characters.');
    }

    final existing = await db.query(
      'users',
      where: 'LOWER(username) = ?',
      whereArgs: [cleanUsername.toLowerCase()],
      limit: 1,
    );
    if (existing.isNotEmpty) {
      throw StateError('Username "$cleanUsername" already exists.');
    }

    return db.insert(
      'users',
      user
          .copyWith(
            name: cleanName,
            username: cleanUsername,
            pinOrPassword: PasswordHash.hash(cleanPin),
          )
          .toMap(),
    );
  }

  Future<void> updateUser(PharmacyUser user) async {
    if (user.id == null) {
      throw ArgumentError('Cannot update PharmacyUser without an id.');
    }
    final db = await database;
    await _createUsersTable(db);
    final users = await getUsers();
    final current = users.where((u) => u.id == user.id).toList();
    if (current.isEmpty) {
      throw StateError('User account not found.');
    }
    final existingUser = current.first;

    final cleanName = user.name.trim();
    final cleanUsername = user.username.trim();
    final rawNewPin = user.pinOrPassword.trim();

    if (cleanName.isEmpty) {
      throw ArgumentError('Staff full name is required.');
    }
    if (cleanUsername.isEmpty || cleanUsername.contains(' ')) {
      throw ArgumentError('Valid username without spaces is required.');
    }

    final String nextHashedPin;
    if (rawNewPin.isEmpty || rawNewPin == existingUser.pinOrPassword) {
      nextHashedPin = existingUser.pinOrPassword;
    } else {
      if (!PasswordHash.isHashed(rawNewPin) && rawNewPin.length < 4) {
        throw ArgumentError('New PIN / Password must be at least 4 characters.');
      }
      nextHashedPin = PasswordHash.hash(rawNewPin);
    }

    final duplicate = users.any(
      (u) =>
          u.id != user.id &&
          u.username.toLowerCase() == cleanUsername.toLowerCase(),
    );
    if (duplicate) {
      throw StateError('Username "$cleanUsername" is already in use.');
    }

    final activeAdmins =
        users.where((u) => u.role == UserRole.admin && u.isActive).length;
    final wasActiveAdmin =
        existingUser.role == UserRole.admin && existingUser.isActive;
    final staysActiveAdmin =
        user.role == UserRole.admin && user.isActive;
    if (wasActiveAdmin && !staysActiveAdmin && activeAdmins <= 1) {
      throw StateError(
        'Cannot demote or disable the last active Admin account.',
      );
    }

    final values = user
        .copyWith(
          name: cleanName,
          username: cleanUsername,
          pinOrPassword: nextHashedPin,
        )
        .toMap()
      ..remove('id');

    await db.update(
      'users',
      values,
      where: 'id = ?',
      whereArgs: [user.id],
    );
  }

  Future<void> toggleUserActive(int userId) async {
    final users = await getUsers();
    final matched = users.where((u) => u.id == userId).toList();
    if (matched.isEmpty) {
      throw StateError('User account not found.');
    }
    final target = matched.first;
    final activeAdmins =
        users.where((u) => u.role == UserRole.admin && u.isActive).length;
    if (target.role == UserRole.admin &&
        target.isActive &&
        activeAdmins <= 1) {
      throw StateError('Cannot disable the last active Admin account.');
    }
    final db = await database;
    await db.update(
      'users',
      {'is_active': target.isActive ? 0 : 1},
      where: 'id = ?',
      whereArgs: [userId],
    );
  }

  Future<void> deleteUser(int userId, {String? currentUsername}) async {
    final users = await getUsers();
    final matched = users.where((u) => u.id == userId).toList();
    if (matched.isEmpty) {
      throw StateError('User account not found.');
    }
    final target = matched.first;
    if (currentUsername != null &&
        target.username.toLowerCase() ==
            currentUsername.trim().toLowerCase()) {
      throw StateError('Cannot delete the currently signed-in account.');
    }
    final activeAdmins =
        users.where((u) => u.role == UserRole.admin && u.isActive).length;
    if (target.role == UserRole.admin &&
        target.isActive &&
        activeAdmins <= 1) {
      throw StateError('Cannot delete the last active Admin account.');
    }
    final db = await database;
    await db.delete('users', where: 'id = ?', whereArgs: [userId]);
  }

  // ==================== EXPENSES & FINANCIAL REPORTS ====================

  String _toLocalDateKey(String isoOrDate) {
    final clean = isoOrDate.trim();
    if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(clean)) {
      return clean;
    }
    final parsed = DateTime.tryParse(clean);
    if (parsed == null) {
      return clean.length >= 10 ? clean.substring(0, 10) : clean;
    }
    final local = parsed.isUtc ? parsed.toLocal() : parsed;
    return '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  }

  Future<List<ExpenseRecord>> getExpenses({
    DateTime? fromDate,
    DateTime? toDate,
  }) async {
    final db = await database;
    await _createExpensesTable(db);
    final rows = await db.query(
      'expenses',
      orderBy: 'date DESC, id DESC',
    );
    final all = rows.map(ExpenseRecord.fromMap).toList();
    if (fromDate == null && toDate == null) return all;

    DateTime? effFrom = fromDate;
    DateTime? effTo = toDate;
    if (effFrom != null && effTo != null && effFrom.isAfter(effTo)) {
      final tmp = effFrom;
      effFrom = effTo;
      effTo = tmp;
    }
    final fromKey = effFrom != null
        ? DateFormat('yyyy-MM-dd').format(effFrom)
        : null;
    final toKey =
        effTo != null ? DateFormat('yyyy-MM-dd').format(effTo) : null;

    return all.where((e) {
      final dk = _toLocalDateKey(e.date);
      if (fromKey != null && dk.compareTo(fromKey) < 0) return false;
      if (toKey != null && dk.compareTo(toKey) > 0) return false;
      return true;
    }).toList();
  }

  Future<int> insertExpense(ExpenseRecord expense) async {
    final db = await database;
    await _createExpensesTable(db);
    final cleanTitle = expense.title.trim();
    if (cleanTitle.isEmpty) {
      throw ArgumentError('Expense title is required.');
    }
    if (expense.amount <= 0) {
      throw ArgumentError('Expense amount must be greater than zero.');
    }
    return db.insert(
      'expenses',
      expense.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> deleteExpense(int id) async {
    final db = await database;
    await _createExpensesTable(db);
    await db.delete('expenses', where: 'id = ?', whereArgs: [id]);
  }

  Future<ReportSummaryBundle> getFinancialReportBundle({
    DateTime? fromDate,
    DateTime? toDate,
  }) async {
    final db = await database;
    await _ensureAuditSchema(db);
    await _createExpensesTable(db);

    DateTime? effFrom = fromDate;
    DateTime? effTo = toDate;
    if (effFrom != null && effTo != null && effFrom.isAfter(effTo)) {
      final tmp = effFrom;
      effFrom = effTo;
      effTo = tmp;
    }
    final String? fromKey =
        effFrom != null ? DateFormat('yyyy-MM-dd').format(effFrom) : null;
    final String? toKey =
        effTo != null ? DateFormat('yyyy-MM-dd').format(effTo) : null;

    bool inRange(String dateKey) {
      if (fromKey != null && dateKey.compareTo(fromKey) < 0) return false;
      if (toKey != null && dateKey.compareTo(toKey) > 0) return false;
      return true;
    }

    final saleRows = await db.rawQuery('''
      SELECT s.*, COALESCE(p.name, 'Walk-in Customer') as party_name
      FROM sales s
      LEFT JOIN parties p ON s.party_id = p.id
      ORDER BY s.created_at DESC, s.id DESC
    ''');
    final filteredSales = <SaleRecord>[];
    for (final row in saleRows) {
      final sr = SaleRecord.fromMap(row);
      final dk = _toLocalDateKey(sr.createdAt);
      if (inRange(dk)) {
        filteredSales.add(sr);
      }
    }

    final filteredExpenses = await getExpenses(fromDate: effFrom, toDate: effTo);

    double round2(double v) => double.parse(v.toStringAsFixed(2));

    // Aggregate Daily buckets strictly from filteredSales & filteredExpenses
    final dailyMap = <String, Map<String, dynamic>>{};
    Map<String, dynamic> ensureDay(String dk) => dailyMap.putIfAbsent(dk, () {
          return {
            'receiptCount': 0,
            'expenseCount': 0,
            'grossSales': 0.0,
            'discounts': 0.0,
            'netSales': 0.0,
            'totalCost': 0.0,
            'grossProfit': 0.0,
            'expenses': 0.0,
          };
        });

    for (final s in filteredSales) {
      final dk = _toLocalDateKey(s.createdAt);
      final b = ensureDay(dk);
      b['receiptCount'] = (b['receiptCount'] as int) + 1;
      b['grossSales'] = (b['grossSales'] as double) + s.subtotal;
      b['discounts'] = (b['discounts'] as double) + s.discountAmount;
      b['netSales'] = (b['netSales'] as double) + s.netPayable;
      b['totalCost'] = (b['totalCost'] as double) + s.totalCost;
      b['grossProfit'] = (b['grossProfit'] as double) + s.netProfit;
    }
    for (final e in filteredExpenses) {
      final dk = _toLocalDateKey(e.date);
      final b = ensureDay(dk);
      b['expenseCount'] = (b['expenseCount'] as int) + 1;
      b['expenses'] = (b['expenses'] as double) + e.amount;
    }

    final sortedDayKeys = dailyMap.keys.toList()..sort((a, b) => b.compareTo(a));
    final dailyRows = sortedDayKeys.map((dk) {
      final b = dailyMap[dk]!;
      final netSales = round2(b['netSales'] as double);
      final grossProfit = round2(b['grossProfit'] as double);
      final exp = round2(b['expenses'] as double);
      final trueNet = round2(grossProfit - exp);
      final margin = netSales > 0 ? (trueNet / netSales) * 100 : 0.0;
      return DailyReportRow(
        dateKey: dk,
        receiptCount: b['receiptCount'] as int,
        expenseCount: b['expenseCount'] as int,
        grossSales: round2(b['grossSales'] as double),
        discounts: round2(b['discounts'] as double),
        netSales: netSales,
        totalCost: round2(b['totalCost'] as double),
        grossProfit: grossProfit,
        expenses: exp,
        trueNetProfit: trueNet,
        netMarginPct: margin,
      );
    }).toList();

    // Aggregate Monthly buckets strictly from filteredSales & filteredExpenses
    final monthlyMap = <String, Map<String, dynamic>>{};
    Map<String, dynamic> ensureMonth(String mk) => monthlyMap.putIfAbsent(mk, () {
          return {
            'receiptCount': 0,
            'expenseCount': 0,
            'grossSales': 0.0,
            'discounts': 0.0,
            'netSales': 0.0,
            'totalCost': 0.0,
            'grossProfit': 0.0,
            'expenses': 0.0,
          };
        });

    for (final s in filteredSales) {
      final dk = _toLocalDateKey(s.createdAt);
      final mk = dk.length >= 7 ? dk.substring(0, 7) : dk;
      final b = ensureMonth(mk);
      b['receiptCount'] = (b['receiptCount'] as int) + 1;
      b['grossSales'] = (b['grossSales'] as double) + s.subtotal;
      b['discounts'] = (b['discounts'] as double) + s.discountAmount;
      b['netSales'] = (b['netSales'] as double) + s.netPayable;
      b['totalCost'] = (b['totalCost'] as double) + s.totalCost;
      b['grossProfit'] = (b['grossProfit'] as double) + s.netProfit;
    }
    for (final e in filteredExpenses) {
      final dk = _toLocalDateKey(e.date);
      final mk = dk.length >= 7 ? dk.substring(0, 7) : dk;
      final b = ensureMonth(mk);
      b['expenseCount'] = (b['expenseCount'] as int) + 1;
      b['expenses'] = (b['expenses'] as double) + e.amount;
    }

    final sortedMonthKeys = monthlyMap.keys.toList()
      ..sort((a, b) => b.compareTo(a));
    final monthlyRows = sortedMonthKeys.map((mk) {
      final b = monthlyMap[mk]!;
      final parts = mk.split('-');
      String label = mk;
      if (parts.length == 2) {
        final yr = int.tryParse(parts[0]);
        final mo = int.tryParse(parts[1]);
        if (yr != null && mo != null) {
          label = DateFormat('MMM yyyy').format(DateTime(yr, mo, 1));
        }
      }
      final netSales = round2(b['netSales'] as double);
      final grossProfit = round2(b['grossProfit'] as double);
      final exp = round2(b['expenses'] as double);
      final trueNet = round2(grossProfit - exp);
      final margin = netSales > 0 ? (trueNet / netSales) * 100 : 0.0;
      return MonthlyReportRow(
        monthKey: mk,
        label: label,
        receiptCount: b['receiptCount'] as int,
        expenseCount: b['expenseCount'] as int,
        grossSales: round2(b['grossSales'] as double),
        discounts: round2(b['discounts'] as double),
        netSales: netSales,
        totalCost: round2(b['totalCost'] as double),
        grossProfit: grossProfit,
        expenses: exp,
        trueNetProfit: trueNet,
        netMarginPct: margin,
      );
    }).toList();

    final grossSales = round2(filteredSales.fold(0.0, (s, r) => s + r.subtotal));
    final discounts =
        round2(filteredSales.fold(0.0, (s, r) => s + r.discountAmount));
    final netSales = round2(filteredSales.fold(0.0, (s, r) => s + r.netPayable));
    final totalCost = round2(filteredSales.fold(0.0, (s, r) => s + r.totalCost));
    final grossProfit =
        round2(filteredSales.fold(0.0, (s, r) => s + r.netProfit));
    final totalExpenses =
        round2(filteredExpenses.fold(0.0, (s, e) => s + e.amount));
    final trueNetProfit = round2(grossProfit - totalExpenses);
    final grossMarginPct =
        netSales > 0 ? (grossProfit / netSales) * 100 : 0.0;
    final netMarginPct =
        netSales > 0 ? (trueNetProfit / netSales) * 100 : 0.0;

    return ReportSummaryBundle(
      totals: ReportPeriodTotals(
        receiptCount: filteredSales.length,
        expenseCount: filteredExpenses.length,
        grossSales: grossSales,
        discounts: discounts,
        netSales: netSales,
        totalCost: totalCost,
        grossProfit: grossProfit,
        totalExpenses: totalExpenses,
        trueNetProfit: trueNetProfit,
        grossMarginPct: grossMarginPct,
        netMarginPct: netMarginPct,
      ),
      dailyRows: dailyRows,
      monthlyRows: monthlyRows,
      receipts: filteredSales,
      expenses: filteredExpenses,
    );
  }
}

