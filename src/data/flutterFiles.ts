import pubspecRaw from '../../flutter_app/pubspec.yaml?raw';
import mainDartRaw from '../../flutter_app/lib/main.dart?raw';
import modelsRaw from '../../flutter_app/lib/models/pharmacy_models.dart?raw';
import dbHelperRaw from '../../flutter_app/lib/database/db_helper.dart?raw';
import posScreenRaw from '../../flutter_app/lib/screens/pos_screen.dart?raw';
import printerSettingsRaw from '../../flutter_app/lib/screens/printer_settings_screen.dart?raw';
import settingsScreenRaw from '../../flutter_app/lib/screens/settings_screen.dart?raw';
import printerServiceRaw from '../../flutter_app/lib/services/printer_service.dart?raw';
import pdfInvoiceServiceRaw from '../../flutter_app/lib/services/pdf_invoice_service.dart?raw';

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
    id: 'settings_screen',
    path: 'lib/screens/settings_screen.dart',
    title: 'Pharmacy & Counter Settings',
    summary:
      'SQLite-persisted pharmacy/receipt details, thermal printer & USB barcode preferences, threshold/role controls, DB backup export, and safe reset.',
    language: 'dart',
    content: settingsScreenRaw,
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
