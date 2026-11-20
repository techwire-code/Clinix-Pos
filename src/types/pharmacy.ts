export type PartyType = 'customer' | 'supplier';

export type PaymentMode =
  | 'Cash'
  | 'Card'
  | 'JazzCash / EasyPaisa'
  | 'Bank Transfer'
  | 'Credit / Khata'
  | 'Credit/Party Ledger'
  | 'Mobile Transfer';

export type ThermalWidth = '58mm' | '80mm';

export type UserRole = 'admin' | 'manager' | 'cashier' | 'sales' | 'user';

export type CounterRole = 'admin' | 'manager' | 'cashier' | 'sales';

export type DecimalDigits = 0 | 2 | 3;

export type SymbolPosition = 'prefix' | 'suffix';

export type DateFormatOption = 'DD/MM/YYYY' | 'MM/DD/YYYY';

export interface CurrencyPreset {
  code: string;
  symbol: string;
  label: string;
  name: string;
  decimalDigits: DecimalDigits;
  symbolPosition: SymbolPosition;
  defaultTimezone: string;
}

export interface PharmacySettings {
  pharmacyName: string;
  address: string;
  phone: string;
  licenseNumber: string;
  websiteUrl: string;
  receiptFooter: string;
  autoPrintReceipt: boolean;
  savedPrinterName: string;
  savedPrinterMac: string;
  thermalPaperWidth: 58 | 80;
  showWebsiteOnReceipt: boolean;
  preferUsbScannerFocus: boolean;
  currencyCode: string;
  currencySymbol: string;
  useSymbolInsteadOfCode: boolean;
  decimalDigits: DecimalDigits;
  symbolPosition: SymbolPosition;
  timezone: string;
  dateFormat: DateFormatOption;
  lowStockThreshold: number;
  expiryAlertDays: number;
  showProfitToStaff: boolean;
  activeRole: CounterRole;
}

export interface PharmacyItem {
  id: number;
  name: string;
  barcode: string;
  category: string;
  unitsPerBox: number; // Number of units inside 1 box
  boxCostPrice: number; // Cost price of the whole box
  boxSellingPrice: number; // Selling price of the whole box
  costPrice: number; // Auto-calculated per-unit cost (boxCostPrice / unitsPerBox)
  sellingPrice: number; // Auto-calculated per-unit selling price (boxSellingPrice / unitsPerBox)
  stockQuantity: number; // Stock on hand in units
  unit: string; // Dispensing unit label (Tablet, Capsule, Bottle, etc.)
  batchNumber: string;
  expiryDate: string; // yyyy-MM-dd
}

export interface Party {
  id: number;
  name: string;
  phone: string;
  type: PartyType;
  balance: number; // Customer: To Collect; Supplier: To Pay
}

export interface CartLine {
  item: PharmacyItem;
  quantity: number;
  itemDiscount: number; // Flat PKR discount on line
}

export interface SaleItemRecord {
  id: number;
  saleId: number;
  itemId: number;
  itemName: string;
  batchNumber: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  itemDiscount: number;
  lineTotal: number;
}

export interface SaleRecord {
  id: number;
  invoiceNumber: string;
  partyId: number | null;
  partyName: string;
  subtotal: number;
  discountAmount: number; // item discounts + bill discount
  netPayable: number;
  totalCost: number;
  netProfit: number; // netPayable - totalCost
  paymentMode: PaymentMode;
  transactionReference?: string;
  cashReceived?: number;
  changeReturned?: number;
  createdAt: string;
  createdBy?: string; // Staff username who generated the receipt
  createdByName?: string; // Staff display name
  items: SaleItemRecord[];
}

export interface PrinterConfig {
  deviceName: string;
  macAddress: string;
  paperWidth: ThermalWidth;
  autoPrintOnSale: boolean;
}

export interface PurchaseItemRecord {
  id: number;
  purchaseId: number;
  itemId: number;
  itemName: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
  lineTotal: number;
}

export interface PurchaseRecord {
  id: number;
  purchaseNumber: string;
  supplierInvoiceNo: string;
  supplierId: number;
  supplierName: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  paymentMode: PaymentMode;
  createdAt: string;
  items: PurchaseItemRecord[];
}

export interface PurchaseDraftLine {
  itemId: number | null; // null when creating a brand-new medicine inline
  itemName: string;
  barcode: string;
  category: string;
  unit: string;
  unitsPerBox: number;
  boxCostPrice: number;
  boxSellingPrice: number;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
}

export type ExpenseCategory =
  | 'Rent'
  | 'Utilities & Electricity'
  | 'Staff Salaries'
  | 'Supplies & Packaging'
  | 'Maintenance'
  | 'Delivery & Misc';

export interface ExpenseRecord {
  id: number;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string; // yyyy-MM-dd
  paymentMode: 'Cash' | 'Mobile Transfer' | 'Bank Transfer';
  notes: string;
  createdAt: string;
}

