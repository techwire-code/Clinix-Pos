import pubspecRaw from '../../flutter_app/pubspec.yaml?raw';
import mainDartRaw from '../../flutter_app/lib/main.dart?raw';
import modelsRaw from '../../flutter_app/lib/models/pharmacy_models.dart?raw';
import dbHelperRaw from '../../flutter_app/lib/database/db_helper.dart?raw';
import posScreenRaw from '../../flutter_app/lib/screens/pos_screen.dart?raw';
import partiesScreenRaw from '../../flutter_app/lib/screens/parties_screen.dart?raw';
import khataStatementRaw from '../../flutter_app/lib/screens/khata_statement_screen.dart?raw';
import supplierLedgerRaw from '../../flutter_app/lib/screens/supplier_ledger_screen.dart?raw';
import editCreditReceiptRaw from '../../flutter_app/lib/screens/edit_credit_receipt_dialog.dart?raw';
import printerSettingsRaw from '../../flutter_app/lib/screens/printer_settings_screen.dart?raw';
import reportsScreenRaw from '../../flutter_app/lib/screens/reports_screen.dart?raw';
import settingsScreenRaw from '../../flutter_app/lib/screens/settings_screen.dart?raw';
import printerServiceRaw from '../../flutter_app/lib/services/printer_service.dart?raw';
import pdfInvoiceServiceRaw from '../../flutter_app/lib/services/pdf_invoice_service.dart?raw';
import currencyFormatterRaw from '../../flutter_app/lib/utils/currency_formatter.dart?raw';

export interface FlutterSourceFile {
  id: string;
  path: string;
  title: string;
  summary: string;
  language: 'dart' | 'yaml';
  content: string;
}

export const FLUTTER_SOURCE_FILES: FlutterSourceFile[] = [
  {
    id: 'db_helper',
    path: 'lib/database/db_helper.dart',
    title: 'SQLite Database Helper',
    summary:
      'Singleton SQLite schema (items, parties, sales, sale_items, app_settings), CRUD methods, barcode lookup, transactional deduction, and DB backup.',
    language: 'dart',
    content: dbHelperRaw,
  },
  {
    id: 'pharmacy_models',
    path: 'lib/models/pharmacy_models.dart',
    title: 'Pharmacy Domain Models',
    summary:
      'Immutable models and SQLite mappers for PharmacyItem, Party, CartLine, SaleRecord, SaleItemRecord, PharmacySettings, and PaymentMode.',
    language: 'dart',
    content: modelsRaw,
  },
  {
    id: 'pos_screen',
    path: 'lib/screens/pos_screen.dart',
    title: 'POS & Cart Screen',
    summary:
      'Responsive catalog grid, barcode scanner field, real-time cart, item & bill discounts, accurate net profit tracking, and payment selector.',
    language: 'dart',
    content: posScreenRaw,
  },
  {
    id: 'parties_screen',
    path: 'lib/screens/parties_screen.dart',
    title: 'Parties & Khata Ledger',
    summary:
      'Customer & supplier ledger management with date-wise Khata drilldown, supplier bills ledger, and bill-allocated payment settlement.',
    language: 'dart',
    content: partiesScreenRaw,
  },
  {
    id: 'khata_statement_screen',
    path: 'lib/screens/khata_statement_screen.dart',
    title: 'Customer Khata Statement',
    summary:
      'Date-wise Khata timeline with running balances, itemized bills, WhatsApp/PDF export, and audited Edit Receipt workflow.',
    language: 'dart',
    content: khataStatementRaw,
  },
  {
    id: 'supplier_ledger_screen',
    path: 'lib/screens/supplier_ledger_screen.dart',
    title: 'Supplier Bills & Payment Ledger',
    summary:
      'Bill-wise supplier purchase tracking (Unpaid / Partially Paid / Paid), itemized medicines, payment history, and bill-allocated payments.',
    language: 'dart',
    content: supplierLedgerRaw,
  },
  {
    id: 'edit_credit_receipt_dialog',
    path: 'lib/screens/edit_credit_receipt_dialog.dart',
    title: 'Audited Credit Receipt Editor',
    summary:
      'Admin/Manager credit bill correction screen with mandatory audit reason, live stock delta preview, and Khata reconciliation.',
    language: 'dart',
    content: editCreditReceiptRaw,
  },
  {
    id: 'reports_screen',
    path: 'lib/screens/reports_screen.dart',
    title: 'Daily, Monthly & Date-Range Financial Reports',
    summary:
      'Daily, Monthly, Receipt-by-Receipt Profit, and Expenses reports with From/To date filters, dynamic KPIs, and Grand Total rows.',
    language: 'dart',
    content: reportsScreenRaw,
  },
  {
    id: 'settings_screen',
    path: 'lib/screens/settings_screen.dart',
    title: 'Pharmacy & Counter Settings',
    summary:
      'Multi-currency, regional format, pharmacy/receipt details, thermal printer & USB scanner preferences, threshold/role controls, DB backup export, and safe reset.',
    language: 'dart',
    content: settingsScreenRaw,
  },
  {
    id: 'currency_formatter',
    path: 'lib/utils/currency_formatter.dart',
    title: 'Currency & Regional Formatter',
    summary:
      'Centralized CurrencyFormatter with 9 currency presets (PKR, USD, EUR, GBP, AED, SAR, INR, CAD, AUD), symbol/code switching, decimals, prefix/suffix, and timezone/date formatting.',
    language: 'dart',
    content: currencyFormatterRaw,
  },
  {
    id: 'printer_service',
    path: 'lib/services/printer_service.dart',
    title: 'ESC/POS Printer Service',
    summary:
      '58mm/80mm ESC/POS byte stream generator, SharedPreferences MAC persistence, and flutter_bluetooth_serial printing.',
    language: 'dart',
    content: printerServiceRaw,
  },
  {
    id: 'printer_settings_screen',
    path: 'lib/screens/printer_settings_screen.dart',
    title: 'Bluetooth Printer Settings',
    summary:
      'Bluetooth device discovery, paired device list, MAC saving, paper width toggle (58mm/80mm), and test receipt print.',
    language: 'dart',
    content: printerSettingsRaw,
  },
  {
    id: 'pdf_invoice_service',
    path: 'lib/services/pdf_invoice_service.dart',
    title: 'A5 PDF Invoice & Share',
    summary:
      'Generates A5 PDF invoices via pdf/printing packages and launches native OS share sheet for WhatsApp & Email.',
    language: 'dart',
    content: pdfInvoiceServiceRaw,
  },
  {
    id: 'main',
    path: 'lib/main.dart',
    title: 'Flutter App Entry Point',
    summary: 'Material 3 app bootstrap, navigation drawer, and bottom navigation shell.',
    language: 'dart',
    content: mainDartRaw,
  },
  {
    id: 'pubspec',
    path: 'pubspec.yaml',
    title: 'Dependencies Manifest',
    summary:
      'sqflite, sqflite_common_ffi, flutter_bluetooth_serial, shared_preferences, pdf, printing, share_plus, intl.',
    language: 'yaml',
    content: pubspecRaw,
  },
];
