export type PartyType = 'customer' | 'supplier';

export type PaymentMode = 'Cash' | 'Credit/Party Ledger' | 'Mobile Transfer';

export type ThermalWidth = '58mm' | '80mm';

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
  createdAt: string;
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
