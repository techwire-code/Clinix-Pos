import {
  DEFAULT_PRINTER_CONFIG,
  SEED_EXPENSES,
  SEED_ITEMS,
  SEED_PARTIES,
  SEED_PURCHASES,
  SEED_SALES,
} from '../data/seedData';
import {
  CartLine,
  ExpenseRecord,
  Party,
  PaymentMode,
  PharmacyItem,
  PharmacySettings,
  PrinterConfig,
  PurchaseDraftLine,
  PurchaseItemRecord,
  PurchaseRecord,
  SaleItemRecord,
  SaleRecord,
} from '../types/pharmacy';

const STORAGE_KEYS = {
  items: 'clinix_pos_items_v1',
  parties: 'clinix_pos_parties_v1',
  sales: 'clinix_pos_sales_v1',
  purchases: 'clinix_pos_purchases_v1',
  expenses: 'clinix_pos_expenses_v1',
  printer: 'clinix_pos_printer_v1',
  settings: 'clinix_pos_settings_v1',
  lowStockThreshold: 'clinix_low_stock_threshold_v1',
};

export const DEFAULT_PHARMACY_SETTINGS: PharmacySettings = {
  pharmacyName: 'Clinix Community Pharmacy',
  branchAddress: '17 KM Ferozepur Road, Lahore',
  phoneNumber: '+92 42 35950011',
  licenseNumber: 'DL-LHR-04892',
  receiptFooterNote:
    'Unopened medicines with original invoice may be exchanged within 7 days.',
  autoPrintReceipt: DEFAULT_PRINTER_CONFIG.autoPrintOnSale,
  savedPrinterName: DEFAULT_PRINTER_CONFIG.deviceName,
  savedPrinterMac: DEFAULT_PRINTER_CONFIG.macAddress,
  paperWidth: DEFAULT_PRINTER_CONFIG.paperWidth,
  preferUsbScannerFocus: true,
  currencyLabel: 'PKR',
  lowStockThreshold: 10,
  nearExpiryDays: 60,
  activeRole: 'admin',
};

const memoryFallbackStorage = new Map<string, string>();

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key) ?? memoryFallbackStorage.get(key) ?? null;
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    const mem = memoryFallbackStorage.get(key);
    if (mem) {
      try {
        return JSON.parse(mem) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function writeStorage<T>(key: string, data: T): void {
  const serialized = JSON.stringify(data);
  memoryFallbackStorage.set(key, serialized);
  try {
    localStorage.setItem(key, serialized);
  } catch {
    // Fallback already stored in memoryFallbackStorage when localStorage is blocked/full
  }
}

export function calculateUnitPrice(
  boxPrice: number,
  unitsPerBox: number,
): number {
  const safeUnits = Math.max(1, Math.floor(Number(unitsPerBox) || 1));
  const safeBox = Math.max(0, Number(boxPrice) || 0);
  return Math.round((safeBox / safeUnits) * 100) / 100;
}

export function loadItems(): PharmacyItem[] {
  const existing = readStorage<PharmacyItem[] | null>(STORAGE_KEYS.items, null);
  if (existing && Array.isArray(existing)) {
    return existing.map((item, idx) => {
      const unitsPerBox =
        Number.isFinite(Number(item.unitsPerBox)) &&
        Number(item.unitsPerBox) >= 1
          ? Math.floor(Number(item.unitsPerBox))
          : 1;
      const fallbackCost = Number.isFinite(Number(item.costPrice))
        ? Math.max(0, Number(item.costPrice))
        : 0;
      const fallbackSelling = Number.isFinite(Number(item.sellingPrice))
        ? Math.max(0, Number(item.sellingPrice))
        : 0;
      const boxCostPrice = Number.isFinite(Number(item.boxCostPrice))
        ? Math.max(0, Number(item.boxCostPrice))
        : Math.round(fallbackCost * unitsPerBox * 100) / 100;
      const boxSellingPrice = Number.isFinite(Number(item.boxSellingPrice))
        ? Math.max(0, Number(item.boxSellingPrice))
        : Math.round(fallbackSelling * unitsPerBox * 100) / 100;

      return {
        ...item,
        id: Number.isFinite(Number(item.id)) ? Number(item.id) : idx + 1,
        name: String(item.name ?? 'Unnamed Medicine'),
        barcode: String(item.barcode ?? ''),
        category: String(item.category || 'General'),
        unitsPerBox,
        boxCostPrice,
        boxSellingPrice,
        costPrice: calculateUnitPrice(boxCostPrice, unitsPerBox),
        sellingPrice: calculateUnitPrice(boxSellingPrice, unitsPerBox),
        stockQuantity: Number.isFinite(Number(item.stockQuantity))
          ? Math.max(0, Math.floor(Number(item.stockQuantity)))
          : 0,
        unit: String(item.unit || 'Unit'),
        batchNumber: String(item.batchNumber ?? ''),
        expiryDate: String(item.expiryDate || '2027-12-31'),
      };
    });
  }
  writeStorage(STORAGE_KEYS.items, SEED_ITEMS);
  return SEED_ITEMS;
}

export function saveItems(items: PharmacyItem[]): void {
  writeStorage(STORAGE_KEYS.items, items);
}

export function loadParties(): Party[] {
  const existing = readStorage<Party[] | null>(STORAGE_KEYS.parties, null);
  if (existing) return existing;
  writeStorage(STORAGE_KEYS.parties, SEED_PARTIES);
  return SEED_PARTIES;
}

export function saveParties(parties: Party[]): void {
  writeStorage(STORAGE_KEYS.parties, parties);
}

export function loadSales(): SaleRecord[] {
  const existing = readStorage<SaleRecord[] | null>(STORAGE_KEYS.sales, null);
  if (existing) return existing;
  writeStorage(STORAGE_KEYS.sales, SEED_SALES);
  return SEED_SALES;
}

export function saveSales(sales: SaleRecord[]): void {
  writeStorage(STORAGE_KEYS.sales, sales);
}

export function loadPurchases(): PurchaseRecord[] {
  const existing = readStorage<PurchaseRecord[] | null>(
    STORAGE_KEYS.purchases,
    null,
  );
  if (existing) return existing;
  writeStorage(STORAGE_KEYS.purchases, SEED_PURCHASES);
  return SEED_PURCHASES;
}

export function savePurchases(purchases: PurchaseRecord[]): void {
  writeStorage(STORAGE_KEYS.purchases, purchases);
}

export function loadPrinterConfig(): PrinterConfig {
  const existing = readStorage<PrinterConfig | null>(STORAGE_KEYS.printer, null);
  if (existing) return existing;
  writeStorage(STORAGE_KEYS.printer, DEFAULT_PRINTER_CONFIG);
  return DEFAULT_PRINTER_CONFIG;
}

export function savePrinterConfig(config: PrinterConfig): void {
  writeStorage(STORAGE_KEYS.printer, config);
}

export function loadSettings(): PharmacySettings {
  const existing = readStorage<Partial<PharmacySettings> | null>(
    STORAGE_KEYS.settings,
    null,
  );
  const printer = loadPrinterConfig();
  if (existing) {
    const safeRole =
      existing.activeRole === 'admin' ||
      existing.activeRole === 'manager' ||
      existing.activeRole === 'cashier' ||
      existing.activeRole === 'sales'
        ? existing.activeRole
        : DEFAULT_PHARMACY_SETTINGS.activeRole;
    return {
      pharmacyName:
        typeof existing.pharmacyName === 'string' && existing.pharmacyName.trim()
          ? existing.pharmacyName.trim()
          : DEFAULT_PHARMACY_SETTINGS.pharmacyName,
      branchAddress:
        typeof existing.branchAddress === 'string' &&
        existing.branchAddress.trim()
          ? existing.branchAddress.trim()
          : DEFAULT_PHARMACY_SETTINGS.branchAddress,
      phoneNumber:
        typeof existing.phoneNumber === 'string'
          ? existing.phoneNumber
          : DEFAULT_PHARMACY_SETTINGS.phoneNumber,
      licenseNumber:
        typeof existing.licenseNumber === 'string'
          ? existing.licenseNumber
          : DEFAULT_PHARMACY_SETTINGS.licenseNumber,
      receiptFooterNote:
        typeof existing.receiptFooterNote === 'string'
          ? existing.receiptFooterNote
          : DEFAULT_PHARMACY_SETTINGS.receiptFooterNote,
      autoPrintReceipt:
        typeof existing.autoPrintReceipt === 'boolean'
          ? existing.autoPrintReceipt
          : printer.autoPrintOnSale,
      savedPrinterName:
        typeof existing.savedPrinterName === 'string'
          ? existing.savedPrinterName
          : printer.deviceName,
      savedPrinterMac:
        typeof existing.savedPrinterMac === 'string'
          ? existing.savedPrinterMac
          : printer.macAddress,
      paperWidth:
        existing.paperWidth === '58mm' || existing.paperWidth === '80mm'
          ? existing.paperWidth
          : printer.paperWidth,
      preferUsbScannerFocus:
        typeof existing.preferUsbScannerFocus === 'boolean'
          ? existing.preferUsbScannerFocus
          : DEFAULT_PHARMACY_SETTINGS.preferUsbScannerFocus,
      currencyLabel:
        typeof existing.currencyLabel === 'string' &&
        existing.currencyLabel.trim()
          ? existing.currencyLabel.trim().toUpperCase()
          : DEFAULT_PHARMACY_SETTINGS.currencyLabel,
      lowStockThreshold:
        Number.isFinite(Number(existing.lowStockThreshold)) &&
        Number(existing.lowStockThreshold) >= 1
          ? Math.floor(Number(existing.lowStockThreshold))
          : DEFAULT_PHARMACY_SETTINGS.lowStockThreshold,
      nearExpiryDays:
        Number.isFinite(Number(existing.nearExpiryDays)) &&
        Number(existing.nearExpiryDays) >= 1
          ? Math.floor(Number(existing.nearExpiryDays))
          : DEFAULT_PHARMACY_SETTINGS.nearExpiryDays,
      activeRole: safeRole,
    };
  }

  const seeded: PharmacySettings = {
    ...DEFAULT_PHARMACY_SETTINGS,
    autoPrintReceipt: printer.autoPrintOnSale,
    savedPrinterName: printer.deviceName,
    savedPrinterMac: printer.macAddress,
    paperWidth: printer.paperWidth,
  };
  writeStorage(STORAGE_KEYS.settings, seeded);
  return seeded;
}

export function saveSettings(next: PharmacySettings): PharmacySettings {
  const normalized: PharmacySettings = {
    pharmacyName:
      next.pharmacyName.trim() || DEFAULT_PHARMACY_SETTINGS.pharmacyName,
    branchAddress:
      next.branchAddress.trim() || DEFAULT_PHARMACY_SETTINGS.branchAddress,
    phoneNumber: next.phoneNumber.trim(),
    licenseNumber: next.licenseNumber.trim(),
    receiptFooterNote: next.receiptFooterNote.trim(),
    autoPrintReceipt: Boolean(next.autoPrintReceipt),
    savedPrinterName: next.savedPrinterName.trim(),
    savedPrinterMac: next.savedPrinterMac.trim(),
    paperWidth: next.paperWidth === '58mm' ? '58mm' : '80mm',
    preferUsbScannerFocus: Boolean(next.preferUsbScannerFocus),
    currencyLabel: (next.currencyLabel.trim() || 'PKR').toUpperCase(),
    lowStockThreshold: Math.max(
      1,
      Math.floor(Number(next.lowStockThreshold) || 10),
    ),
    nearExpiryDays: Math.max(1, Math.floor(Number(next.nearExpiryDays) || 60)),
    activeRole: next.activeRole,
  };

  writeStorage(STORAGE_KEYS.settings, normalized);
  try {
    localStorage.setItem(
      STORAGE_KEYS.lowStockThreshold,
      String(normalized.lowStockThreshold),
    );
  } catch {
    // Ignore storage quota errors
  }

  const syncedPrinter: PrinterConfig = {
    deviceName:
      normalized.savedPrinterName || DEFAULT_PRINTER_CONFIG.deviceName,
    macAddress:
      normalized.savedPrinterMac || DEFAULT_PRINTER_CONFIG.macAddress,
    paperWidth: normalized.paperWidth,
    autoPrintOnSale: normalized.autoPrintReceipt,
  };
  savePrinterConfig(syncedPrinter);

  return normalized;
}

export function resetSettingsToDefaults(): PharmacySettings {
  // Never wipes items, parties, sales, purchases, or expenses.
  return saveSettings({ ...DEFAULT_PHARMACY_SETTINGS });
}

export function exportDatabaseBackupJson(): string {
  const payload = {
    app: 'Clinix Community Pharmacy POS',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    tables: {
      app_settings: loadSettings(),
      items: loadItems(),
      parties: loadParties(),
      sales: loadSales(),
      purchases: loadPurchases(),
      expenses: loadExpenses(),
      printer: loadPrinterConfig(),
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function loadExpenses(): ExpenseRecord[] {
  const existing = readStorage<ExpenseRecord[] | null>(
    STORAGE_KEYS.expenses,
    null,
  );
  if (existing && Array.isArray(existing)) return existing;
  writeStorage(STORAGE_KEYS.expenses, SEED_EXPENSES);
  return SEED_EXPENSES;
}

export function saveExpenses(expenses: ExpenseRecord[]): void {
  writeStorage(STORAGE_KEYS.expenses, expenses);
}

export function resetDemoDatabase(): {
  items: PharmacyItem[];
  parties: Party[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  expenses: ExpenseRecord[];
  printer: PrinterConfig;
  settings: PharmacySettings;
} {
  writeStorage(STORAGE_KEYS.items, SEED_ITEMS);
  writeStorage(STORAGE_KEYS.parties, SEED_PARTIES);
  writeStorage(STORAGE_KEYS.sales, SEED_SALES);
  writeStorage(STORAGE_KEYS.purchases, SEED_PURCHASES);
  writeStorage(STORAGE_KEYS.expenses, SEED_EXPENSES);
  writeStorage(STORAGE_KEYS.printer, DEFAULT_PRINTER_CONFIG);
  const settings = saveSettings({ ...DEFAULT_PHARMACY_SETTINGS });
  return {
    items: SEED_ITEMS,
    parties: SEED_PARTIES,
    sales: SEED_SALES,
    purchases: SEED_PURCHASES,
    expenses: SEED_EXPENSES,
    printer: DEFAULT_PRINTER_CONFIG,
    settings,
  };
}

export interface CompleteSaleResult {
  sale: SaleRecord;
  updatedItems: PharmacyItem[];
  updatedParties: Party[];
  updatedSales: SaleRecord[];
}

export function isCreditPaymentMode(mode: PaymentMode): boolean {
  return mode === 'Credit / Khata' || mode === 'Credit/Party Ledger';
}

export function executeSaleTransaction(params: {
  cartLines: CartLine[];
  billDiscount: number;
  paymentMode: PaymentMode;
  party: Party | null;
  transactionReference?: string;
  cashReceived?: number;
  createdBy?: string;
  createdByName?: string;
  currentItems: PharmacyItem[];
  currentParties: Party[];
  currentSales: SaleRecord[];
}): CompleteSaleResult {
  const {
    cartLines,
    billDiscount,
    paymentMode,
    party,
    transactionReference,
    cashReceived,
    createdBy,
    createdByName,
    currentItems,
    currentParties,
    currentSales,
  } = params;

  if (cartLines.length === 0) {
    throw new Error('Cannot complete checkout with an empty cart.');
  }

  if (isCreditPaymentMode(paymentMode) && !party) {
    throw new Error('Select a customer party for Credit / Khata billing.');
  }

  // Validate stock availability before deducting
  for (const line of cartLines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error(`Invalid quantity for "${line.item.name}".`);
    }
    const dbItem = currentItems.find((i) => i.id === line.item.id);
    if (!dbItem) {
      throw new Error(`Item "${line.item.name}" no longer exists in inventory.`);
    }
    if (dbItem.stockQuantity + 0.0001 < line.quantity) {
      throw new Error(
        `Insufficient stock for ${dbItem.name} (Available: ${dbItem.stockQuantity}, Requested: ${line.quantity}).`,
      );
    }
  }

  const subtotal = cartLines.reduce(
    (sum, line) => sum + line.item.sellingPrice * line.quantity,
    0,
  );
  const itemDiscountTotal = cartLines.reduce((sum, line) => {
    const gross = line.item.sellingPrice * line.quantity;
    return sum + Math.min(Math.max(0, line.itemDiscount), gross);
  }, 0);

  const afterItemDiscount = subtotal - itemDiscountTotal;
  const safeBillDiscount = Math.min(Math.max(0, billDiscount), afterItemDiscount);
  const totalDiscount = itemDiscountTotal + safeBillDiscount;
  const netPayable = afterItemDiscount - safeBillDiscount;
  const totalCost = cartLines.reduce(
    (sum, line) => sum + line.item.costPrice * line.quantity,
    0,
  );

  // Net profit accurately subtracts ALL discounts (item-level + bill-level)
  const netProfit = netPayable - totalCost;

  const nextSaleId =
    currentSales.reduce((max, s) => Math.max(max, s.id), 0) + 1;
  const year = new Date().getFullYear();
  const invoiceNumber = `CLX-${year}-${String(nextSaleId).padStart(4, '0')}`;

  const saleItems: SaleItemRecord[] = cartLines.map((line, index) => {
    const gross = line.item.sellingPrice * line.quantity;
    const clampedDisc = Math.min(Math.max(0, line.itemDiscount), gross);
    return {
      id: index + 1,
      saleId: nextSaleId,
      itemId: line.item.id,
      itemName: line.item.name,
      batchNumber: line.item.batchNumber,
      quantity: line.quantity,
      unitPrice: line.item.sellingPrice,
      costPrice: line.item.costPrice,
      itemDiscount: clampedDisc,
      lineTotal: gross - clampedDisc,
    };
  });

  const resolvedCashReceived =
    paymentMode === 'Cash' &&
    cashReceived !== undefined &&
    Number.isFinite(cashReceived)
      ? Math.max(0, cashReceived)
      : undefined;
  const resolvedChangeReturned =
    resolvedCashReceived !== undefined
      ? Math.round((resolvedCashReceived - netPayable) * 100) / 100
      : undefined;

  const cleanRef = transactionReference?.trim();

  const newSale: SaleRecord = {
    id: nextSaleId,
    invoiceNumber,
    partyId: party?.id ?? null,
    partyName: party?.name ?? 'Walk-in Customer',
    subtotal,
    discountAmount: totalDiscount,
    netPayable,
    totalCost,
    netProfit,
    paymentMode,
    ...(cleanRef ? { transactionReference: cleanRef } : {}),
    ...(resolvedCashReceived !== undefined
      ? {
          cashReceived: resolvedCashReceived,
          changeReturned: resolvedChangeReturned,
        }
      : {}),
    createdAt: new Date().toISOString(),
    createdBy,
    createdByName,
    items: saleItems,
  };

  // Deduct stock quantities
  const updatedItems = currentItems.map((item) => {
    const soldLine = cartLines.find((l) => l.item.id === item.id);
    if (!soldLine) return item;
    return {
      ...item,
      stockQuantity:
        Math.round(Math.max(0, item.stockQuantity - soldLine.quantity) * 100) /
        100,
    };
  });

  // Update Customer To Collect balance if Credit / Khata or Credit/Party Ledger
  const updatedParties = currentParties.map((p) => {
    if (isCreditPaymentMode(paymentMode) && party && p.id === party.id) {
      return { ...p, balance: p.balance + netPayable };
    }
    return p;
  });

  const updatedSales = [newSale, ...currentSales];

  saveItems(updatedItems);
  saveParties(updatedParties);
  saveSales(updatedSales);

  return {
    sale: newSale,
    updatedItems,
    updatedParties,
    updatedSales,
  };
}

export interface CompletePurchaseResult {
  purchase: PurchaseRecord;
  updatedItems: PharmacyItem[];
  updatedParties: Party[];
  updatedPurchases: PurchaseRecord[];
}

export function executePurchaseTransaction(params: {
  supplier: Party;
  supplierInvoiceNo: string;
  lines: PurchaseDraftLine[];
  paidAmount: number;
  paymentMode: PaymentMode;
  currentItems: PharmacyItem[];
  currentParties: Party[];
  currentPurchases: PurchaseRecord[];
}): CompletePurchaseResult {
  const {
    supplier,
    supplierInvoiceNo,
    lines,
    paidAmount,
    paymentMode,
    currentItems,
    currentParties,
    currentPurchases,
  } = params;

  if (supplier.type !== 'supplier') {
    throw new Error('Selected party must be a supplier.');
  }
  if (lines.length === 0) {
    throw new Error('Add at least one medicine line to record a purchase.');
  }

  for (const line of lines) {
    if (!line.itemName.trim()) {
      throw new Error('Every purchase line requires a medicine name.');
    }
    if (line.quantity <= 0) {
      throw new Error(`Quantity must be greater than 0 for ${line.itemName}.`);
    }
    if (line.unitCost < 0) {
      throw new Error(`Unit cost cannot be negative for ${line.itemName}.`);
    }
  }

  const totalAmount = lines.reduce(
    (sum, line) => sum + line.unitCost * line.quantity,
    0,
  );
  const safePaid = Math.min(Math.max(0, paidAmount), totalAmount);
  const balanceDue = Math.max(0, totalAmount - safePaid);

  const nextPurchaseId =
    currentPurchases.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  const year = new Date().getFullYear();
  const purchaseNumber = `PUR-${year}-${String(nextPurchaseId).padStart(4, '0')}`;

  // Update existing items' stock & pricing or create new inventory SKUs
  let nextItemId = currentItems.reduce((max, it) => Math.max(max, it.id), 0) + 1;
  const updatedItems = [...currentItems];
  const purchaseItems: PurchaseItemRecord[] = [];

  lines.forEach((line, idx) => {
    let resolvedItemId = line.itemId;

    if (resolvedItemId !== null) {
      const existingIdx = updatedItems.findIndex(
        (it) => it.id === resolvedItemId,
      );
      if (existingIdx >= 0) {
        const current = updatedItems[existingIdx];
        const safeUnitsPerBox =
          line.unitsPerBox >= 1 ? Math.floor(line.unitsPerBox) : current.unitsPerBox || 1;
        const safeBoxCost =
          line.boxCostPrice > 0
            ? line.boxCostPrice
            : Math.round(line.unitCost * safeUnitsPerBox * 100) / 100;
        const safeBoxSelling =
          line.boxSellingPrice > 0
            ? line.boxSellingPrice
            : line.sellingPrice > 0
              ? Math.round(line.sellingPrice * safeUnitsPerBox * 100) / 100
              : current.boxSellingPrice;
        updatedItems[existingIdx] = {
          ...current,
          stockQuantity: current.stockQuantity + line.quantity,
          unitsPerBox: safeUnitsPerBox,
          boxCostPrice: safeBoxCost,
          boxSellingPrice: safeBoxSelling,
          costPrice: calculateUnitPrice(safeBoxCost, safeUnitsPerBox),
          sellingPrice: calculateUnitPrice(safeBoxSelling, safeUnitsPerBox),
          batchNumber: line.batchNumber.trim() || current.batchNumber,
          expiryDate: line.expiryDate || current.expiryDate,
        };
      } else {
        resolvedItemId = null;
      }
    }

    if (resolvedItemId === null) {
      resolvedItemId = nextItemId++;
      const safeUnitsPerBox = Math.max(1, Math.floor(line.unitsPerBox || 1));
      const safeBoxCost =
        line.boxCostPrice >= 0
          ? line.boxCostPrice
          : Math.round(line.unitCost * safeUnitsPerBox * 100) / 100;
      const safeBoxSelling =
        line.boxSellingPrice > 0
          ? line.boxSellingPrice
          : line.sellingPrice > 0
            ? Math.round(line.sellingPrice * safeUnitsPerBox * 100) / 100
            : Math.round(safeBoxCost * 1.2 * 100) / 100;
      const newItem: PharmacyItem = {
        id: resolvedItemId,
        name: line.itemName.trim(),
        barcode:
          line.barcode.trim() ||
          `89640010${String(resolvedItemId).padStart(4, '0')}`,
        category: line.category.trim() || 'General',
        unitsPerBox: safeUnitsPerBox,
        boxCostPrice: safeBoxCost,
        boxSellingPrice: safeBoxSelling,
        costPrice: calculateUnitPrice(safeBoxCost, safeUnitsPerBox),
        sellingPrice: calculateUnitPrice(safeBoxSelling, safeUnitsPerBox),
        stockQuantity: line.quantity,
        unit: line.unit.trim() || 'Tablet',
        batchNumber: line.batchNumber.trim() || `BAT-${resolvedItemId}`,
        expiryDate: line.expiryDate || '2027-12-31',
      };
      updatedItems.unshift(newItem);
    }

    purchaseItems.push({
      id: idx + 1,
      purchaseId: nextPurchaseId,
      itemId: resolvedItemId,
      itemName: line.itemName.trim(),
      batchNumber: line.batchNumber.trim(),
      expiryDate: line.expiryDate,
      quantity: line.quantity,
      unitCost: line.unitCost,
      sellingPrice: line.sellingPrice,
      lineTotal: line.unitCost * line.quantity,
    });
  });

  const newPurchase: PurchaseRecord = {
    id: nextPurchaseId,
    purchaseNumber,
    supplierInvoiceNo: supplierInvoiceNo.trim() || purchaseNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    totalAmount,
    paidAmount: safePaid,
    balanceDue,
    paymentMode,
    createdAt: new Date().toISOString(),
    items: purchaseItems,
  };

  // Increment supplier To Pay balance by unpaid balanceDue
  const updatedParties = currentParties.map((p) => {
    if (p.id === supplier.id && balanceDue > 0) {
      return { ...p, balance: p.balance + balanceDue };
    }
    return p;
  });

  const updatedPurchases = [newPurchase, ...currentPurchases];

  saveItems(updatedItems);
  saveParties(updatedParties);
  savePurchases(updatedPurchases);

  return {
    purchase: newPurchase,
    updatedItems,
    updatedParties,
    updatedPurchases,
  };
}
