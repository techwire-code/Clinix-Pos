import {
  DEFAULT_PRINTER_CONFIG,
  SEED_EXPENSES,
  SEED_ITEMS,
  SEED_PARTIES,
  SEED_PURCHASES,
  SEED_SALES,
  SEED_USERS,
} from '../data/seedData';
import {
  CartLine,
  CounterRole,
  CurrencyPreset,
  CustomerKhataStatement,
  CustomerKhataTimelineRow,
  DateFormatOption,
  DecimalDigits,
  ExpenseRecord,
  KhataEntry,
  Party,
  PaymentMode,
  PharmacyItem,
  PharmacySettings,
  PharmacyUser,
  PharmacyUserRole,
  PrinterConfig,
  PurchaseDraftLine,
  PurchaseItemRecord,
  PurchasePaymentStatus,
  PurchaseRecord,
  SaleAuditLogEntry,
  SaleItemRecord,
  SaleRecord,
  SupplierBillLedgerRow,
  SupplierLedgerStatement,
  SupplierPaymentEntry,
  SymbolPosition,
  ThermalWidth,
  UserRole,
} from '../types/pharmacy';
import {
  hashPinOrPassword,
  isHashedPinOrPassword,
} from './passwordHash';

const STORAGE_KEYS = {
  items: 'clinix_pos_items_v1',
  parties: 'clinix_pos_parties_v1',
  sales: 'clinix_pos_sales_v1',
  purchases: 'clinix_pos_purchases_v1',
  supplierPayments: 'clinix_pos_supplier_payments_v1',
  expenses: 'clinix_pos_expenses_v1',
  khata: 'clinix_pos_khata_v1',
  printer: 'clinix_pos_printer_v1',
  settings: 'clinix_pos_settings_v1',
  users: 'clinix_pos_users_v1',
  lowStockThreshold: 'clinix_low_stock_threshold_v1',
};

export const CURRENCY_PRESETS: CurrencyPreset[] = [
  {
    code: 'PKR',
    symbol: 'Rs',
    label: 'PKR',
    name: 'Pakistani Rupee',
    decimalDigits: 2,
    symbolPosition: 'prefix',
    defaultTimezone: 'Asia/Karachi',
  },
  {
    code: 'USD',
    symbol: '$',
    label: 'USD ($)',
    name: 'US Dollar',
    decimalDigits: 2,
    symbolPosition: 'prefix',
    defaultTimezone: 'America/New_York',
  },
  {
    code: 'EUR',
    symbol: '€',
    label: 'EUR (€)',
    name: 'Euro',
    decimalDigits: 2,
    symbolPosition: 'prefix',
    defaultTimezone: 'Europe/Berlin',
  },
  {
    code: 'GBP',
    symbol: '£',
    label: 'GBP (£)',
    name: 'British Pound',
    decimalDigits: 2,
    symbolPosition: 'prefix',
    defaultTimezone: 'Europe/London',
  },
  {
    code: 'AED',
    symbol: 'AED',
    label: 'AED',
    name: 'UAE Dirham',
    decimalDigits: 2,
    symbolPosition: 'prefix',
    defaultTimezone: 'Asia/Dubai',
  },
  {
    code: 'SAR',
    symbol: 'SAR',
    label: 'SAR',
    name: 'Saudi Riyal',
    decimalDigits: 2,
    symbolPosition: 'prefix',
    defaultTimezone: 'Asia/Riyadh',
  },
  {
    code: 'INR',
    symbol: '₹',
    label: 'INR (₹)',
    name: 'Indian Rupee',
    decimalDigits: 2,
    symbolPosition: 'prefix',
    defaultTimezone: 'Asia/Kolkata',
  },
  {
    code: 'CAD',
    symbol: 'C$',
    label: 'CAD ($)',
    name: 'Canadian Dollar',
    decimalDigits: 2,
    symbolPosition: 'prefix',
    defaultTimezone: 'America/Toronto',
  },
  {
    code: 'AUD',
    symbol: 'A$',
    label: 'AUD ($)',
    name: 'Australian Dollar',
    decimalDigits: 2,
    symbolPosition: 'prefix',
    defaultTimezone: 'Australia/Sydney',
  },
];

export const COMMON_TIMEZONES: string[] = [
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Toronto',
  'Australia/Sydney',
  'UTC',
];

export const DEFAULT_PHARMACY_SETTINGS: PharmacySettings = {
  pharmacyName: 'Clinix Community Pharmacy',
  shopShortCode: 'CLX',
  address: '17 KM Ferozepur Road, Lahore',
  phone: '+92 42 35950011',
  licenseNumber: 'DL-LHR-04892',
  websiteUrl: '',
  receiptFooter:
    'Unopened medicines with original invoice may be exchanged within 7 days.',
  autoPrintReceipt: true,
  savedPrinterName: DEFAULT_PRINTER_CONFIG.deviceName,
  savedPrinterMac: DEFAULT_PRINTER_CONFIG.macAddress,
  thermalPaperWidth: DEFAULT_PRINTER_CONFIG.paperWidth === '58mm' ? 58 : 80,
  showWebsiteOnReceipt: false,
  preferUsbScannerFocus: true,
  currencyCode: 'PKR',
  currencySymbol: 'Rs',
  useSymbolInsteadOfCode: false,
  decimalDigits: 2,
  symbolPosition: 'prefix',
  timezone: 'Asia/Karachi',
  dateFormat: 'DD/MM/YYYY',
  lowStockThreshold: 10,
  expiryAlertDays: 30,
  showProfitToStaff: false,
  activeRole: 'admin',
};

export function normalizeShopShortCode(raw?: string | null): string {
  const cleaned = (raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
  return cleaned.length > 0 ? cleaned : DEFAULT_PHARMACY_SETTINGS.shopShortCode;
}

export function generateNextInvoiceNumber(
  existingSales: SaleRecord[],
  shortCodeInput?: string | null,
  dateInput: Date = new Date(),
): string {
  const code = normalizeShopShortCode(
    shortCodeInput ?? loadSettings().shopShortCode,
  );
  const year = String(dateInput.getFullYear()).padStart(4, '0');
  const month = String(dateInput.getMonth() + 1).padStart(2, '0');
  const day = String(dateInput.getDate()).padStart(2, '0');
  const prefix = `${code}${year}${month}${day}`;

  let maxSeq = 0;
  for (const sale of existingSales) {
    const inv = (sale.invoiceNumber || '').trim().toUpperCase();
    if (!inv.startsWith(prefix)) continue;
    const suffix = inv.slice(prefix.length);
    if (/^\d+$/.test(suffix)) {
      const parsed = Number.parseInt(suffix, 10);
      if (Number.isFinite(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }

  return `${prefix}${maxSeq + 1}`;
}

export function toThermalWidth(width: 58 | 80 | ThermalWidth | undefined): ThermalWidth {
  if (width === 58 || width === '58mm') return '58mm';
  return '80mm';
}

export function getCurrencyLabel(
  settings?: Partial<PharmacySettings> | null,
  asciiOnly = false,
): string {
  const code = (
    settings?.currencyCode?.trim() ||
    DEFAULT_PHARMACY_SETTINGS.currencyCode
  ).toUpperCase();
  const symbol =
    settings?.currencySymbol?.trim() || DEFAULT_PHARMACY_SETTINGS.currencySymbol;
  if (settings?.useSymbolInsteadOfCode) {
    if (asciiOnly && /[^\x20-\x7E]/.test(symbol)) {
      return code;
    }
    return symbol;
  }
  return code;
}

export function formatMoney(
  amount: number,
  settings?: Partial<PharmacySettings> | null,
  options?: {
    asciiOnly?: boolean;
    grouping?: boolean;
    decimals?: DecimalDigits;
  },
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const isNegative = safe < 0;
  const absVal = Math.abs(safe);

  const digits: DecimalDigits =
    options?.decimals ??
    (settings?.decimalDigits === 0 ||
    settings?.decimalDigits === 2 ||
    settings?.decimalDigits === 3
      ? settings.decimalDigits
      : DEFAULT_PHARMACY_SETTINGS.decimalDigits);

  const useGrouping = options?.grouping !== false;
  const numberPart = useGrouping
    ? new Intl.NumberFormat('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(absVal)
    : absVal.toFixed(digits);

  const token = getCurrencyLabel(settings, options?.asciiOnly ?? false);
  const position: SymbolPosition =
    settings?.symbolPosition === 'suffix' ? 'suffix' : 'prefix';

  // Attach single-character currency symbols ($ € £ ₹ ¥) tightly; space out multi-char tokens (PKR, Rs, AED)
  const isCompactSymbol =
    token.length === 1 || /[$€£₹¥]$/.test(token);
  const sep = isCompactSymbol ? '' : ' ';

  const combined =
    position === 'suffix'
      ? `${numberPart}${sep}${token}`
      : `${token}${sep}${numberPart}`;

  return isNegative ? `-${combined}` : combined;
}

export function formatDateBySettings(
  isoOrDate: string | Date,
  settings?: Partial<PharmacySettings> | null,
  options?: { includeTime?: boolean },
): string {
  const dt = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(dt.getTime())) {
    return typeof isoOrDate === 'string' ? isoOrDate : '';
  }

  const timeZone = settings?.timezone?.trim() || DEFAULT_PHARMACY_SETTINGS.timezone;
  const dateFormat: DateFormatOption =
    settings?.dateFormat === 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY';
  const locale = dateFormat === 'MM/DD/YYYY' ? 'en-US' : 'en-GB';

  const formatOpts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(options?.includeTime
      ? { hour: '2-digit', minute: '2-digit', hour12: true }
      : {}),
  };

  try {
    return new Intl.DateTimeFormat(locale, {
      ...formatOpts,
      timeZone,
    }).format(dt);
  } catch {
    return new Intl.DateTimeFormat(locale, formatOpts).format(dt);
  }
}

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

      const resolvedId = Number.isFinite(Number(item.id)) ? Number(item.id) : idx + 1;
      const legacySeedGeneric =
        item.genericName === undefined
          ? SEED_ITEMS.find(
              (seed) =>
                seed.id === resolvedId &&
                seed.name.toLowerCase() === String(item.name ?? '').toLowerCase(),
            )?.genericName ?? ''
          : '';

      return {
        ...item,
        id: resolvedId,
        name: String(item.name ?? 'Unnamed Medicine'),
        genericName:
          item.genericName === undefined
            ? legacySeedGeneric
            : String(item.genericName ?? '').trim(),
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

export function getPurchasePaymentStatus(
  purchase: Pick<PurchaseRecord, 'totalAmount' | 'paidAmount' | 'balanceDue'>,
): PurchasePaymentStatus {
  const due = Number(purchase.balanceDue) || 0;
  const paid = Number(purchase.paidAmount) || 0;
  if (due <= 0.005) return 'Paid';
  if (paid > 0.005) return 'Partially Paid';
  return 'Unpaid';
}

export function reconcileSupplierPayments(
  purchases: PurchaseRecord[],
  existingEntries: SupplierPaymentEntry[],
): SupplierPaymentEntry[] {
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const entries: SupplierPaymentEntry[] = existingEntries.map((entry) => ({
    ...entry,
    amount: Math.max(0, round2(Number(entry.amount) || 0)),
  }));
  let nextId = entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;

  for (const pur of purchases) {
    const paid = round2(Math.max(0, Number(pur.paidAmount) || 0));
    if (paid <= 0.005) continue;
    const hasLinked = entries.some(
      (e) =>
        e.partyId === pur.supplierId &&
        ((pur.id && e.purchaseId === pur.id) ||
          (pur.purchaseNumber && e.purchaseNumber === pur.purchaseNumber)),
    );
    if (!hasLinked) {
      entries.push({
        id: nextId++,
        partyId: pur.supplierId,
        purchaseId: pur.id,
        purchaseNumber: pur.purchaseNumber,
        supplierInvoiceNo: pur.supplierInvoiceNo,
        amount: paid,
        paymentMode:
          pur.paymentMode === 'Credit/Party Ledger' ||
          pur.paymentMode === 'Credit / Khata'
            ? 'Cash'
            : pur.paymentMode,
        notes: 'Initial payment recorded with purchase bill',
        createdAt: pur.createdAt,
      });
    }
  }

  return entries;
}

export function loadSupplierPayments(): SupplierPaymentEntry[] {
  const existing = readStorage<SupplierPaymentEntry[] | null>(
    STORAGE_KEYS.supplierPayments,
    null,
  );
  const purchases = loadPurchases();
  const reconciled = reconcileSupplierPayments(
    purchases,
    Array.isArray(existing) ? existing : [],
  );
  if (!existing || reconciled.length !== existing.length) {
    writeStorage(STORAGE_KEYS.supplierPayments, reconciled);
  }
  return reconciled;
}

export function saveSupplierPayments(entries: SupplierPaymentEntry[]): void {
  writeStorage(STORAGE_KEYS.supplierPayments, entries);
}

export function buildSupplierLedgerStatement(params: {
  party: Party;
  purchases: PurchaseRecord[];
  supplierPayments: SupplierPaymentEntry[];
}): SupplierLedgerStatement {
  const { party, purchases, supplierPayments } = params;
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const supplierBillsRaw = purchases
    .filter((p) => p.supplierId === party.id)
    .slice()
    .sort((a, b) => {
      const tDiff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (tDiff !== 0) return tDiff;
      return b.id - a.id;
    });

  const payments = supplierPayments
    .filter((p) => p.partyId === party.id)
    .slice()
    .sort((a, b) => {
      const tDiff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (tDiff !== 0) return tDiff;
      return b.id - a.id;
    });

  const bills: SupplierBillLedgerRow[] = supplierBillsRaw.map((purchase) => {
    const status = getPurchasePaymentStatus(purchase);
    const allocatedPayments = payments.filter(
      (pay) =>
        (purchase.id && pay.purchaseId === purchase.id) ||
        (purchase.purchaseNumber &&
          pay.purchaseNumber === purchase.purchaseNumber),
    );
    return {
      purchase,
      status,
      allocatedPayments,
    };
  });

  const totalPurchased = round2(
    bills.reduce((s, b) => s + (Number(b.purchase.totalAmount) || 0), 0),
  );
  const totalPaidOnBills = round2(
    bills.reduce((s, b) => s + (Number(b.purchase.paidAmount) || 0), 0),
  );
  const totalBillRemaining = round2(
    bills.reduce((s, b) => s + (Number(b.purchase.balanceDue) || 0), 0),
  );
  const totalPaymentsRecorded = round2(
    payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
  );
  const unallocatedOrOpeningBalance = round2(
    (Number(party.balance) || 0) - totalBillRemaining,
  );

  const unpaidBillCount = bills.filter((b) => b.status === 'Unpaid').length;
  const partialBillCount = bills.filter(
    (b) => b.status === 'Partially Paid',
  ).length;
  const paidBillCount = bills.filter((b) => b.status === 'Paid').length;

  return {
    party,
    bills,
    payments,
    totalPurchased,
    totalPaidOnBills,
    totalBillRemaining,
    totalPaymentsRecorded,
    unallocatedOrOpeningBalance,
    unpaidBillCount,
    partialBillCount,
    paidBillCount,
    currentBalanceDue: round2(Number(party.balance) || 0),
  };
}

export function buildSupplierLedgerShareText(params: {
  statement: SupplierLedgerStatement;
  settings?: Partial<PharmacySettings> | null;
}): string {
  const { statement, settings } = params;
  const pharmacyName =
    settings?.pharmacyName?.trim() || 'Clinix Community Pharmacy';
  const phone = settings?.phone?.trim() || '';
  const fmt = (val: number) => formatMoney(val, settings);
  const lines: string[] = [
    `*${pharmacyName.toUpperCase()}*`,
    `Supplier Purchase & Payment Ledger`,
    ...(phone ? [`Tel: ${phone}`] : []),
    `--------------------------------`,
    `Supplier: ${statement.party.name}`,
    ...(statement.party.phone ? [`Phone: ${statement.party.phone}`] : []),
    `--------------------------------`,
    `Total Purchased: ${fmt(statement.totalPurchased)}`,
    `Total Paid: ${fmt(statement.totalPaymentsRecorded)}`,
    `*Current Payable (To Pay): ${fmt(statement.currentBalanceDue)}*`,
    `Bills: ${statement.paidBillCount} Paid · ${statement.partialBillCount} Partial · ${statement.unpaidBillCount} Unpaid`,
    `--------------------------------`,
  ];

  if (statement.bills.length === 0) {
    lines.push('No purchase bills recorded yet.');
  } else {
    lines.push('PURCHASE BILLS:');
    for (const row of statement.bills) {
      const p = row.purchase;
      const dateStr = formatDateBySettings(p.createdAt, settings);
      lines.push(
        `${dateStr} | ${p.purchaseNumber} (Inv: ${p.supplierInvoiceNo}) | ${row.status}`,
      );
      lines.push(
        `   Total: ${fmt(p.totalAmount)} | Paid: ${fmt(p.paidAmount)} | Remaining: ${fmt(p.balanceDue)}`,
      );
    }
  }

  if (statement.payments.length > 0) {
    lines.push(`--------------------------------`);
    lines.push('PAYMENT HISTORY:');
    for (const pay of statement.payments) {
      const dateStr = formatDateBySettings(pay.createdAt, settings);
      const billTag = pay.purchaseNumber
        ? `Bill ${pay.purchaseNumber}`
        : 'General Payable';
      lines.push(
        `${dateStr} | ${fmt(pay.amount)} (${pay.paymentMode}) · ${billTag}${pay.reference ? ` · Ref: ${pay.reference}` : ''}`,
      );
    }
  }

  lines.push(`--------------------------------`);
  return lines.join('\n');
}

export function reconcileKhataEntries(
  parties: Party[],
  sales: SaleRecord[],
  existingEntries: KhataEntry[],
): KhataEntry[] {
  const entries: KhataEntry[] = existingEntries.map((entry) => ({
    ...entry,
    amount: Math.max(0, Number(entry.amount) || 0),
  }));
  let nextId = entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;

  // 1. Ensure every credit sale has a corresponding 'credit_sale' KhataEntry
  for (const sale of sales) {
    if (!sale.partyId || !isCreditPaymentMode(sale.paymentMode)) continue;
    const exists = entries.some(
      (e) =>
        e.entryType === 'credit_sale' &&
        e.partyId === sale.partyId &&
        ((sale.id && e.saleId === sale.id) ||
          (sale.invoiceNumber && e.invoiceNumber === sale.invoiceNumber)),
    );
    if (!exists) {
      entries.push({
        id: nextId++,
        partyId: sale.partyId,
        entryType: 'credit_sale',
        amount: Math.max(0, Number(sale.netPayable) || 0),
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        paymentMode: sale.paymentMode,
        reference: sale.transactionReference,
        notes: `${sale.items.length} medicine line(s) billed on credit`,
        createdAt: sale.createdAt,
        createdBy: sale.createdBy,
        createdByName: sale.createdByName,
      });
    }
  }

  // 2. Reconcile any customer/supplier opening/brought-forward balance so chronological
  // running balance always converges cleanly to the current stored party.balance.
  for (const party of parties) {
    const partyEntries = entries.filter((e) => e.partyId === party.id);
    const ledgerNet = partyEntries.reduce((sum, e) => {
      return e.entryType === 'collection' ? sum - e.amount : sum + e.amount;
    }, 0);
    const diff = Math.round((party.balance - ledgerNet) * 100) / 100;
    if (diff > 0.01) {
      const hasOpening = partyEntries.some(
        (e) => e.entryType === 'opening_balance',
      );
      if (!hasOpening) {
        const earliestMs = partyEntries.reduce((minMs, e) => {
          const t = new Date(e.createdAt).getTime();
          return Number.isFinite(t) && t < minMs ? t : minMs;
        }, Date.now());
        const defaultBaseline = new Date('2026-11-01T09:00:00.000Z').getTime();
        const openingMs =
          earliestMs > defaultBaseline
            ? defaultBaseline
            : earliestMs - 86400000;
        entries.push({
          id: nextId++,
          partyId: party.id,
          entryType: 'opening_balance',
          amount: diff,
          notes: 'Opening / Brought Forward Balance',
          createdAt: new Date(openingMs).toISOString(),
        });
      }
    }
  }

  return entries;
}

export function loadKhataEntries(): KhataEntry[] {
  const existing = readStorage<KhataEntry[] | null>(STORAGE_KEYS.khata, null);
  const parties = loadParties();
  const sales = loadSales();
  const reconciled = reconcileKhataEntries(
    parties,
    sales,
    Array.isArray(existing) ? existing : [],
  );
  if (!existing || reconciled.length !== existing.length) {
    writeStorage(STORAGE_KEYS.khata, reconciled);
  }
  return reconciled;
}

export function saveKhataEntries(entries: KhataEntry[]): void {
  writeStorage(STORAGE_KEYS.khata, entries);
}

export function buildCustomerKhataStatement(params: {
  party: Party;
  khataEntries: KhataEntry[];
  sales: SaleRecord[];
  items: PharmacyItem[];
  fromDate?: string;
  toDate?: string;
}): CustomerKhataStatement {
  const { party, khataEntries, sales, items, fromDate, toDate } = params;

  const itemUnitById = new Map<number, string>();
  for (const it of items) {
    itemUnitById.set(it.id, it.unit);
  }

  const partyEntries = khataEntries
    .filter((e) => e.partyId === party.id)
    .slice()
    .sort((a, b) => {
      const tDiff =
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (tDiff !== 0) return tDiff;
      return a.id - b.id;
    });

  const fromMs =
    fromDate && fromDate.trim()
      ? new Date(`${fromDate.trim()}T00:00:00`).getTime()
      : null;
  const toMs =
    toDate && toDate.trim()
      ? new Date(`${toDate.trim()}T23:59:59.999`).getTime()
      : null;

  let running = 0;
  let openingBalanceBeforeRange = 0;
  let capturedRangeOpening = false;
  const rows: CustomerKhataTimelineRow[] = [];

  for (const entry of partyEntries) {
    const debit = entry.entryType === 'collection' ? 0 : entry.amount;
    const credit = entry.entryType === 'collection' ? entry.amount : 0;

    const entryMs = new Date(entry.createdAt).getTime();
    const afterFrom = fromMs === null || (!Number.isNaN(entryMs) && entryMs >= fromMs);
    const beforeTo = toMs === null || (!Number.isNaN(entryMs) && entryMs <= toMs);

    if (!capturedRangeOpening && afterFrom) {
      openingBalanceBeforeRange = Math.round(running * 100) / 100;
      capturedRangeOpening = true;
    }

    running = Math.round((running + debit - credit) * 100) / 100;

    if (!afterFrom || !beforeTo) {
      continue;
    }

    let linkedSale: SaleRecord | null = null;
    if (entry.entryType === 'credit_sale') {
      const found = sales.find(
        (s) =>
          (entry.saleId && s.id === entry.saleId) ||
          (entry.invoiceNumber && s.invoiceNumber === entry.invoiceNumber),
      );
      if (found) {
        linkedSale = {
          ...found,
          items: found.items.map((si) => ({
            ...si,
            unit: si.unit || itemUnitById.get(si.itemId) || 'Unit',
          })),
        };
      }
    }

    let title = 'Ledger Entry';
    let voucherNumber = `KH-${String(entry.id).padStart(4, '0')}`;
    let subtitle = entry.notes?.trim() || '';

    if (entry.entryType === 'opening_balance') {
      title = 'Opening Balance';
      voucherNumber = `OPEN-${String(party.id).padStart(3, '0')}`;
      subtitle = subtitle || 'Brought forward account balance';
    } else if (entry.entryType === 'credit_sale') {
      title = 'Credit Sale (Udhaar)';
      voucherNumber =
        entry.invoiceNumber || linkedSale?.invoiceNumber || voucherNumber;
      const count = linkedSale?.items.length ?? 0;
      subtitle =
        count > 0
          ? `${count} item${count === 1 ? '' : 's'} on credit${
              linkedSale?.discountAmount
                ? ` · Disc applied`
                : ''
            }`
          : subtitle || 'Credit bill';
    } else if (entry.entryType === 'collection') {
      title = 'Collection Received (Vasooli)';
      voucherNumber = `COL-${String(entry.id).padStart(4, '0')}`;
      const bits = [
        entry.paymentMode || 'Cash',
        entry.reference?.trim() || '',
        entry.notes?.trim() || '',
      ].filter(Boolean);
      subtitle = bits.join(' · ') || 'Payment received';
    } else if (entry.entryType === 'adjustment') {
      title = 'Balance Adjustment';
      voucherNumber = `ADJ-${String(entry.id).padStart(4, '0')}`;
      subtitle = subtitle || 'Manual ledger adjustment';
    }

      rows.push({
      id: `${entry.entryType}-${entry.id}`,
      entryId: entry.id,
      entryType: entry.entryType,
      createdAt: entry.createdAt,
      voucherNumber,
      title,
      subtitle,
      debit,
      credit,
      runningBalance: running,
      sale: linkedSale,
      paymentMode: entry.paymentMode,
      notes: entry.notes,
      reference: entry.reference,
      editedAt: entry.editedAt ?? linkedSale?.editedAt,
      editedBy: entry.editedBy ?? linkedSale?.editedBy,
      editedByName: entry.editedByName ?? linkedSale?.editedByName,
      editReason: entry.editReason ?? linkedSale?.editReason,
      previousAmount: entry.previousAmount,
      editSummary: entry.editSummary,
    });
  }

  if (!capturedRangeOpening) {
    openingBalanceBeforeRange = Math.round(running * 100) / 100;
  }

  const totalCreditGiven =
    Math.round(rows.reduce((sum, r) => sum + r.debit, 0) * 100) / 100;
  const totalCollected =
    Math.round(rows.reduce((sum, r) => sum + r.credit, 0) * 100) / 100;
  const closingBalanceInRange =
    rows.length > 0
      ? rows[rows.length - 1].runningBalance
      : openingBalanceBeforeRange;

  return {
    party,
    openingBalanceBeforeRange,
    rows,
    totalCreditGiven,
    totalCollected,
    closingBalanceInRange,
    currentBalanceDue: party.balance,
  };
}

export function buildCustomerKhataShareText(params: {
  statement: CustomerKhataStatement;
  settings?: Partial<PharmacySettings> | null;
  fromDate?: string;
  toDate?: string;
}): string {
  const { statement, settings, fromDate, toDate } = params;
  const pharmacyName =
    settings?.pharmacyName?.trim() || 'Clinix Community Pharmacy';
  const phone = settings?.phone?.trim() || '';
  const fmt = (val: number) => formatMoney(val, settings);
  const lines: string[] = [
    `*${pharmacyName.toUpperCase()}*`,
    `Customer Khata Statement`,
    ...(phone ? [`Tel: ${phone}`] : []),
    `--------------------------------`,
    `Customer: ${statement.party.name}`,
    ...(statement.party.phone ? [`Phone: ${statement.party.phone}`] : []),
    `Period: ${fromDate ? fromDate : 'Start'} to ${toDate ? toDate : 'Today'}`,
    `--------------------------------`,
    `Total Credit Given: ${fmt(statement.totalCreditGiven)}`,
    `Total Collected: ${fmt(statement.totalCollected)}`,
    `*Current Balance Due: ${fmt(statement.currentBalanceDue)}*`,
    `--------------------------------`,
  ];

  if (fromDate && statement.openingBalanceBeforeRange !== 0) {
    lines.push(
      `Opening Bal (Before ${fromDate}): ${fmt(statement.openingBalanceBeforeRange)}`,
    );
  }

  if (statement.rows.length === 0) {
    lines.push('No transactions in the selected period.');
  } else {
    for (const row of statement.rows) {
      const dateStr = formatDateBySettings(row.createdAt, settings);
      const amtLabel =
        row.debit > 0
          ? `+${fmt(row.debit)} (Credit)`
          : `-${fmt(row.credit)} (Collected)`;
      lines.push(
        `${dateStr} | ${row.voucherNumber} | ${row.title}: ${amtLabel} | Bal: ${fmt(row.runningBalance)}`,
      );
      if (row.editedAt && row.editReason) {
        lines.push(
          `   [Edited by ${row.editedByName || 'Manager'}: ${row.editReason}${row.editSummary ? ` — ${row.editSummary}` : ''}]`,
        );
      }
      if (row.sale && row.sale.items.length > 0) {
        for (const item of row.sale.items) {
          lines.push(
            `   • ${item.itemName} (${item.quantity} ${item.unit || 'Unit'} x ${fmt(item.unitPrice)}) = ${fmt(item.lineTotal)}`,
          );
        }
      } else if (row.subtitle) {
        lines.push(`   • ${row.subtitle}`);
      }
    }
  }

  lines.push(`--------------------------------`);
  lines.push(`Thank you for your continued trust!`);
  return lines.join('\n');
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

interface LegacySettingsShape extends Partial<PharmacySettings> {
  branchAddress?: string;
  phoneNumber?: string;
  receiptFooterNote?: string;
  paperWidth?: ThermalWidth;
  currencyLabel?: string;
  nearExpiryDays?: number;
}

export function loadSettings(): PharmacySettings {
  const existing = readStorage<LegacySettingsShape | null>(
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

    const rawAddress = existing.address ?? existing.branchAddress;
    const rawPhone = existing.phone ?? existing.phoneNumber;
    const rawFooter = existing.receiptFooter ?? existing.receiptFooterNote;
    const rawPaper = existing.thermalPaperWidth ?? existing.paperWidth;
    const rawCurrency = existing.currencyCode ?? existing.currencyLabel;
    const rawExpiry = existing.expiryAlertDays ?? existing.nearExpiryDays;

    const decimalDigits: DecimalDigits =
      existing.decimalDigits === 0 ||
      existing.decimalDigits === 2 ||
      existing.decimalDigits === 3
        ? existing.decimalDigits
        : DEFAULT_PHARMACY_SETTINGS.decimalDigits;

    return {
      pharmacyName:
        typeof existing.pharmacyName === 'string' && existing.pharmacyName.trim()
          ? existing.pharmacyName.trim()
          : DEFAULT_PHARMACY_SETTINGS.pharmacyName,
      shopShortCode: normalizeShopShortCode(existing.shopShortCode),
      address:
        typeof rawAddress === 'string' && rawAddress.trim()
          ? rawAddress.trim()
          : DEFAULT_PHARMACY_SETTINGS.address,
      phone:
        typeof rawPhone === 'string'
          ? rawPhone
          : DEFAULT_PHARMACY_SETTINGS.phone,
      licenseNumber:
        typeof existing.licenseNumber === 'string'
          ? existing.licenseNumber
          : DEFAULT_PHARMACY_SETTINGS.licenseNumber,
      websiteUrl:
        typeof existing.websiteUrl === 'string'
          ? existing.websiteUrl
          : DEFAULT_PHARMACY_SETTINGS.websiteUrl,
      receiptFooter:
        typeof rawFooter === 'string'
          ? rawFooter
          : DEFAULT_PHARMACY_SETTINGS.receiptFooter,
      autoPrintReceipt:
        typeof existing.autoPrintReceipt === 'boolean'
          ? existing.autoPrintReceipt
          : DEFAULT_PHARMACY_SETTINGS.autoPrintReceipt,
      savedPrinterName:
        typeof existing.savedPrinterName === 'string'
          ? existing.savedPrinterName
          : printer.deviceName,
      savedPrinterMac:
        typeof existing.savedPrinterMac === 'string'
          ? existing.savedPrinterMac
          : printer.macAddress,
      thermalPaperWidth:
        rawPaper === 58 || rawPaper === '58mm'
          ? 58
          : rawPaper === 80 || rawPaper === '80mm'
            ? 80
            : printer.paperWidth === '58mm'
              ? 58
              : 80,
      showWebsiteOnReceipt:
        typeof existing.showWebsiteOnReceipt === 'boolean'
          ? existing.showWebsiteOnReceipt
          : DEFAULT_PHARMACY_SETTINGS.showWebsiteOnReceipt,
      preferUsbScannerFocus:
        typeof existing.preferUsbScannerFocus === 'boolean'
          ? existing.preferUsbScannerFocus
          : DEFAULT_PHARMACY_SETTINGS.preferUsbScannerFocus,
      currencyCode:
        typeof rawCurrency === 'string' && rawCurrency.trim()
          ? rawCurrency.trim().toUpperCase()
          : DEFAULT_PHARMACY_SETTINGS.currencyCode,
      currencySymbol:
        typeof existing.currencySymbol === 'string' &&
        existing.currencySymbol.trim()
          ? existing.currencySymbol.trim()
          : DEFAULT_PHARMACY_SETTINGS.currencySymbol,
      useSymbolInsteadOfCode:
        typeof existing.useSymbolInsteadOfCode === 'boolean'
          ? existing.useSymbolInsteadOfCode
          : DEFAULT_PHARMACY_SETTINGS.useSymbolInsteadOfCode,
      decimalDigits,
      symbolPosition:
        existing.symbolPosition === 'suffix' ? 'suffix' : 'prefix',
      timezone:
        typeof existing.timezone === 'string' && existing.timezone.trim()
          ? existing.timezone.trim()
          : DEFAULT_PHARMACY_SETTINGS.timezone,
      dateFormat:
        existing.dateFormat === 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY',
      lowStockThreshold:
        Number.isFinite(Number(existing.lowStockThreshold)) &&
        Number(existing.lowStockThreshold) >= 1
          ? Math.floor(Number(existing.lowStockThreshold))
          : DEFAULT_PHARMACY_SETTINGS.lowStockThreshold,
      expiryAlertDays:
        Number.isFinite(Number(rawExpiry)) && Number(rawExpiry) >= 1
          ? Math.floor(Number(rawExpiry))
          : DEFAULT_PHARMACY_SETTINGS.expiryAlertDays,
      showProfitToStaff:
        typeof existing.showProfitToStaff === 'boolean'
          ? existing.showProfitToStaff
          : DEFAULT_PHARMACY_SETTINGS.showProfitToStaff,
      activeRole: safeRole,
    };
  }

  const seeded: PharmacySettings = {
    ...DEFAULT_PHARMACY_SETTINGS,
    savedPrinterName: printer.deviceName,
    savedPrinterMac: printer.macAddress,
    thermalPaperWidth: printer.paperWidth === '58mm' ? 58 : 80,
  };
  writeStorage(STORAGE_KEYS.settings, seeded);
  return seeded;
}

export function saveSettings(next: PharmacySettings): PharmacySettings {
  const safeDecimals: DecimalDigits =
    next.decimalDigits === 0 ||
    next.decimalDigits === 2 ||
    next.decimalDigits === 3
      ? next.decimalDigits
      : 2;

  const normalized: PharmacySettings = {
    pharmacyName:
      next.pharmacyName.trim() || DEFAULT_PHARMACY_SETTINGS.pharmacyName,
    shopShortCode: normalizeShopShortCode(next.shopShortCode),
    address: next.address.trim() || DEFAULT_PHARMACY_SETTINGS.address,
    phone: next.phone.trim(),
    licenseNumber: next.licenseNumber.trim(),
    websiteUrl: next.websiteUrl.trim(),
    receiptFooter: next.receiptFooter.trim(),
    autoPrintReceipt: Boolean(next.autoPrintReceipt),
    savedPrinterName: next.savedPrinterName.trim(),
    savedPrinterMac: next.savedPrinterMac.trim(),
    thermalPaperWidth: next.thermalPaperWidth === 58 ? 58 : 80,
    showWebsiteOnReceipt: Boolean(next.showWebsiteOnReceipt),
    preferUsbScannerFocus: Boolean(next.preferUsbScannerFocus),
    currencyCode: (next.currencyCode.trim() || 'PKR').toUpperCase(),
    currencySymbol: next.currencySymbol.trim() || 'Rs',
    useSymbolInsteadOfCode: Boolean(next.useSymbolInsteadOfCode),
    decimalDigits: safeDecimals,
    symbolPosition: next.symbolPosition === 'suffix' ? 'suffix' : 'prefix',
    timezone: next.timezone.trim() || DEFAULT_PHARMACY_SETTINGS.timezone,
    dateFormat: next.dateFormat === 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY',
    lowStockThreshold: Math.max(
      1,
      Math.floor(Number(next.lowStockThreshold) || 10),
    ),
    expiryAlertDays: Math.max(
      1,
      Math.floor(Number(next.expiryAlertDays) || 30),
    ),
    showProfitToStaff: Boolean(next.showProfitToStaff),
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
    paperWidth: toThermalWidth(normalized.thermalPaperWidth),
    autoPrintOnSale: normalized.autoPrintReceipt,
  };
  savePrinterConfig(syncedPrinter);

  return normalized;
}

export function resetSettingsToDefaults(): PharmacySettings {
  // Never wipes items, parties, sales, purchases, expenses, or users.
  return saveSettings({ ...DEFAULT_PHARMACY_SETTINGS });
}

export function normalizePharmacyUserRole(
  rawRole: unknown,
): PharmacyUserRole {
  const val = String(rawRole ?? '')
    .trim()
    .toLowerCase();
  if (val === 'admin') return 'Admin';
  if (val === 'manager') return 'Manager';
  if (val === 'sales staff' || val === 'salesstaff' || val === 'sales') {
    return 'Sales Staff';
  }
  return 'Cashier';
}

export function toUserRoleKey(role: PharmacyUserRole): UserRole {
  switch (role) {
    case 'Admin':
      return 'admin';
    case 'Manager':
      return 'manager';
    case 'Sales Staff':
      return 'sales';
    case 'Cashier':
    default:
      return 'cashier';
  }
}

export function toCounterRole(roleKey?: UserRole): CounterRole {
  switch (roleKey) {
    case 'admin':
      return 'admin';
    case 'manager':
      return 'manager';
    case 'sales':
      return 'sales';
    case 'cashier':
    case 'user':
    default:
      return 'cashier';
  }
}

export function countActiveAdmins(users: PharmacyUser[]): number {
  return users.filter((u) => u.role === 'Admin' && u.isActive).length;
}

export function loadUsers(): PharmacyUser[] {
  const existing = readStorage<Partial<PharmacyUser>[] | null>(
    STORAGE_KEYS.users,
    null,
  );
  if (existing && Array.isArray(existing) && existing.length > 0) {
    const normalized: PharmacyUser[] = [];
    const seenUsernames = new Set<string>();
    let fallbackId = 1;
    let migrated = false;
    for (const raw of existing) {
      if (!raw || typeof raw !== 'object') continue;
      const username = String(raw.username ?? '').trim();
      if (!username) continue;
      const lower = username.toLowerCase();
      if (seenUsernames.has(lower)) continue;
      seenUsernames.add(lower);
      const id =
        typeof raw.id === 'number' && Number.isFinite(raw.id) && raw.id > 0
          ? Math.floor(raw.id)
          : fallbackId;
      fallbackId = Math.max(fallbackId + 1, id + 1);
      const rawPin = String(raw.pinOrPassword ?? '').trim() || '1234';
      const hashedPin = isHashedPinOrPassword(rawPin)
        ? rawPin
        : (() => {
            migrated = true;
            return hashPinOrPassword(rawPin);
          })();
      normalized.push({
        id,
        name: String(raw.name ?? '').trim() || username,
        username,
        role: normalizePharmacyUserRole(raw.role),
        pinOrPassword: hashedPin,
        isActive:
          typeof raw.isActive === 'boolean' ? raw.isActive : true,
        createdAt:
          typeof raw.createdAt === 'string' && raw.createdAt.trim()
            ? raw.createdAt
            : new Date().toISOString(),
      });
    }
    if (normalized.length > 0) {
      if (countActiveAdmins(normalized) === 0) {
        const defaultAdmin = normalized.find(
          (u) => u.username.toLowerCase() === 'admin',
        );
        if (defaultAdmin) {
          defaultAdmin.role = 'Admin';
          defaultAdmin.isActive = true;
        } else {
          normalized.unshift({
            ...SEED_USERS[0],
            id:
              normalized.reduce((max, u) => Math.max(max, u.id), 0) + 1,
          });
        }
        migrated = true;
      }
      if (migrated) {
        writeStorage(STORAGE_KEYS.users, normalized);
      }
      return normalized;
    }
  }
  writeStorage(STORAGE_KEYS.users, SEED_USERS);
  return SEED_USERS;
}

export function saveUsers(users: PharmacyUser[]): PharmacyUser[] {
  if (countActiveAdmins(users) === 0) {
    throw new Error('At least one active Admin account is required.');
  }
  writeStorage(STORAGE_KEYS.users, users);
  return users;
}

export function addPharmacyUser(
  currentUsers: PharmacyUser[],
  payload: {
    name: string;
    username: string;
    role: PharmacyUserRole;
    pinOrPassword: string;
    isActive?: boolean;
  },
): PharmacyUser[] {
  const name = payload.name.trim();
  const username = payload.username.trim();
  const pinOrPassword = payload.pinOrPassword.trim();
  if (!name) {
    throw new Error('Staff full name is required.');
  }
  if (!username) {
    throw new Error('Username / Staff ID is required.');
  }
  if (/\s/.test(username)) {
    throw new Error('Username cannot contain spaces.');
  }
  if (pinOrPassword.length < 4) {
    throw new Error('PIN / Password must be at least 4 characters.');
  }
  const duplicate = currentUsers.some(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (duplicate) {
    throw new Error(`Username "${username}" already exists.`);
  }
  const nextId =
    currentUsers.reduce((max, u) => Math.max(max, u.id), 0) + 1;
  const created: PharmacyUser = {
    id: nextId,
    name,
    username,
    role: normalizePharmacyUserRole(payload.role),
    pinOrPassword: hashPinOrPassword(pinOrPassword),
    isActive: payload.isActive ?? true,
    createdAt: new Date().toISOString(),
  };
  const next = [...currentUsers, created];
  return saveUsers(next);
}

export function updatePharmacyUser(
  currentUsers: PharmacyUser[],
  payload: {
    id: number;
    name: string;
    username: string;
    role: PharmacyUserRole;
    pinOrPassword?: string;
    isActive: boolean;
  },
): PharmacyUser[] {
  const existing = currentUsers.find((u) => u.id === payload.id);
  if (!existing) {
    throw new Error('User account not found.');
  }
  const name = payload.name.trim();
  const username = payload.username.trim();
  const nextRole = normalizePharmacyUserRole(payload.role);
  const rawNewPin = (payload.pinOrPassword ?? '').trim();

  if (!name) {
    throw new Error('Staff full name is required.');
  }
  if (!username) {
    throw new Error('Username / Staff ID is required.');
  }
  if (/\s/.test(username)) {
    throw new Error('Username cannot contain spaces.');
  }
  if (rawNewPin.length > 0 && rawNewPin.length < 4) {
    throw new Error('New PIN / Password must be at least 4 characters.');
  }

  const nextHashedPin =
    rawNewPin.length > 0 ? hashPinOrPassword(rawNewPin) : existing.pinOrPassword;

  const duplicate = currentUsers.some(
    (u) =>
      u.id !== payload.id &&
      u.username.toLowerCase() === username.toLowerCase(),
  );
  if (duplicate) {
    throw new Error(`Username "${username}" is already assigned to another staff member.`);
  }

  const wasActiveAdmin = existing.role === 'Admin' && existing.isActive;
  const staysActiveAdmin = nextRole === 'Admin' && payload.isActive;
  if (wasActiveAdmin && !staysActiveAdmin && countActiveAdmins(currentUsers) <= 1) {
    throw new Error(
      'Cannot demote or disable the last active Admin account.',
    );
  }

  const next = currentUsers.map((u) =>
    u.id === payload.id
      ? {
          ...u,
          name,
          username,
          role: nextRole,
          pinOrPassword: nextHashedPin,
          isActive: payload.isActive,
        }
      : u,
  );
  return saveUsers(next);
}

export function togglePharmacyUserActive(
  currentUsers: PharmacyUser[],
  userId: number,
): PharmacyUser[] {
  const target = currentUsers.find((u) => u.id === userId);
  if (!target) {
    throw new Error('User account not found.');
  }
  if (
    target.role === 'Admin' &&
    target.isActive &&
    countActiveAdmins(currentUsers) <= 1
  ) {
    throw new Error('Cannot disable the last active Admin account.');
  }
  const next = currentUsers.map((u) =>
    u.id === userId ? { ...u, isActive: !u.isActive } : u,
  );
  return saveUsers(next);
}

export function deletePharmacyUser(
  currentUsers: PharmacyUser[],
  userId: number,
  currentSessionUsername?: string,
): PharmacyUser[] {
  const target = currentUsers.find((u) => u.id === userId);
  if (!target) {
    throw new Error('User account not found.');
  }
  if (
    currentSessionUsername &&
    target.username.toLowerCase() === currentSessionUsername.trim().toLowerCase()
  ) {
    throw new Error('Cannot delete the currently signed-in account.');
  }
  if (
    target.role === 'Admin' &&
    target.isActive &&
    countActiveAdmins(currentUsers) <= 1
  ) {
    throw new Error('Cannot delete the last active Admin account.');
  }
  const next = currentUsers.filter((u) => u.id !== userId);
  return saveUsers(next);
}

export function exportDatabaseBackupJson(): string {
  const payload = {
    app: 'Clinix Community Pharmacy POS',
    schemaVersion: 6,
    exportedAt: new Date().toISOString(),
    tables: {
      app_settings: loadSettings(),
      users: loadUsers(),
      items: loadItems(),
      parties: loadParties(),
      sales: loadSales(),
      purchases: loadPurchases(),
      supplier_payments: loadSupplierPayments(),
      expenses: loadExpenses(),
      khata_entries: loadKhataEntries(),
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
  supplierPayments: SupplierPaymentEntry[];
  expenses: ExpenseRecord[];
  khataEntries: KhataEntry[];
  printer: PrinterConfig;
  settings: PharmacySettings;
} {
  writeStorage(STORAGE_KEYS.items, SEED_ITEMS);
  writeStorage(STORAGE_KEYS.parties, SEED_PARTIES);
  writeStorage(STORAGE_KEYS.sales, SEED_SALES);
  writeStorage(STORAGE_KEYS.purchases, SEED_PURCHASES);
  const supplierPayments = reconcileSupplierPayments(SEED_PURCHASES, []);
  writeStorage(STORAGE_KEYS.supplierPayments, supplierPayments);
  writeStorage(STORAGE_KEYS.expenses, SEED_EXPENSES);
  const khataEntries = reconcileKhataEntries(SEED_PARTIES, SEED_SALES, []);
  writeStorage(STORAGE_KEYS.khata, khataEntries);
  writeStorage(STORAGE_KEYS.printer, DEFAULT_PRINTER_CONFIG);
  const settings = saveSettings({ ...DEFAULT_PHARMACY_SETTINGS });
  return {
    items: SEED_ITEMS,
    parties: SEED_PARTIES,
    sales: SEED_SALES,
    purchases: SEED_PURCHASES,
    supplierPayments,
    expenses: SEED_EXPENSES,
    khataEntries,
    printer: DEFAULT_PRINTER_CONFIG,
    settings,
  };
}

export interface CompleteSaleResult {
  sale: SaleRecord;
  updatedItems: PharmacyItem[];
  updatedParties: Party[];
  updatedSales: SaleRecord[];
  updatedKhataEntries: KhataEntry[];
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
  currentKhataEntries?: KhataEntry[];
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
  const invoiceNumber = generateNextInvoiceNumber(currentSales);

  const saleItems: SaleItemRecord[] = cartLines.map((line, index) => {
    const gross = line.item.sellingPrice * line.quantity;
    const clampedDisc = Math.min(Math.max(0, line.itemDiscount), gross);
    return {
      id: index + 1,
      saleId: nextSaleId,
      itemId: line.item.id,
      itemName: line.item.name,
      unit: line.item.unit,
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

  const baseKhata = params.currentKhataEntries ?? loadKhataEntries();
  let updatedKhataEntries = baseKhata;
  if (isCreditPaymentMode(paymentMode) && party) {
    const nextKhataId =
      baseKhata.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    const newEntry: KhataEntry = {
      id: nextKhataId,
      partyId: party.id,
      entryType: 'credit_sale',
      amount: netPayable,
      saleId: newSale.id,
      invoiceNumber: newSale.invoiceNumber,
      paymentMode: newSale.paymentMode,
      reference: cleanRef,
      notes: `${newSale.items.length} medicine line(s) billed on credit`,
      createdAt: newSale.createdAt,
      createdBy,
      createdByName,
    };
    updatedKhataEntries = [...baseKhata, newEntry];
    saveKhataEntries(updatedKhataEntries);
  }

  saveItems(updatedItems);
  saveParties(updatedParties);
  saveSales(updatedSales);

  return {
    sale: newSale,
    updatedItems,
    updatedParties,
    updatedSales,
    updatedKhataEntries,
  };
}

export function createPartyWithLedger(params: {
  payload: Omit<Party, 'id'>;
  currentParties: Party[];
  currentKhataEntries?: KhataEntry[];
  createdBy?: string;
  createdByName?: string;
}): {
  party: Party;
  updatedParties: Party[];
  updatedKhataEntries: KhataEntry[];
} {
  const { payload, currentParties, createdBy, createdByName } = params;
  const baseKhata = params.currentKhataEntries ?? loadKhataEntries();
  const nextId = currentParties.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  const safeBalance = Math.max(0, Math.round((Number(payload.balance) || 0) * 100) / 100);
  const created: Party = {
    id: nextId,
    name: payload.name.trim(),
    phone: payload.phone.trim(),
    type: payload.type,
    balance: safeBalance,
  };
  const updatedParties = [...currentParties, created];
  saveParties(updatedParties);

  let updatedKhataEntries = baseKhata;
  if (safeBalance > 0) {
    const nextKhataId =
      baseKhata.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    const openingEntry: KhataEntry = {
      id: nextKhataId,
      partyId: created.id,
      entryType: 'opening_balance',
      amount: safeBalance,
      notes: 'Opening / Brought Forward Balance',
      createdAt: new Date().toISOString(),
      createdBy,
      createdByName,
    };
    updatedKhataEntries = [...baseKhata, openingEntry];
    saveKhataEntries(updatedKhataEntries);
  }

  return {
    party: created,
    updatedParties,
    updatedKhataEntries,
  };
}

export function recordPartySettlementTransaction(params: {
  partyId: number;
  amount: number;
  paymentMode?: PaymentMode | string;
  notes?: string;
  reference?: string;
  collectedAt?: string;
  createdBy?: string;
  createdByName?: string;
  currentParties: Party[];
  currentKhataEntries?: KhataEntry[];
}): {
  updatedParties: Party[];
  updatedKhataEntries: KhataEntry[];
  entry: KhataEntry | null;
} {
  const {
    partyId,
    amount,
    paymentMode = 'Cash',
    notes,
    reference,
    collectedAt,
    createdBy,
    createdByName,
    currentParties,
  } = params;
  const baseKhata = params.currentKhataEntries ?? loadKhataEntries();
  const target = currentParties.find((p) => p.id === partyId);
  if (!target) {
    return {
      updatedParties: currentParties,
      updatedKhataEntries: baseKhata,
      entry: null,
    };
  }
  const safeAmount = Math.min(
    target.balance,
    Math.max(0, Math.round((Number(amount) || 0) * 100) / 100),
  );
  if (safeAmount <= 0) {
    return {
      updatedParties: currentParties,
      updatedKhataEntries: baseKhata,
      entry: null,
    };
  }

  const updatedParties = currentParties.map((p) =>
    p.id === partyId
      ? {
          ...p,
          balance: Math.max(0, Math.round((p.balance - safeAmount) * 100) / 100),
        }
      : p,
  );
  saveParties(updatedParties);

  const nextKhataId =
    baseKhata.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const isoTimestamp =
    collectedAt && collectedAt.trim()
      ? collectedAt.includes('T')
        ? new Date(collectedAt).toISOString()
        : new Date(`${collectedAt.trim()}T12:00:00`).toISOString()
      : new Date().toISOString();

  const entry: KhataEntry = {
    id: nextKhataId,
    partyId,
    entryType: 'collection',
    amount: safeAmount,
    paymentMode,
    reference: reference?.trim() || undefined,
    notes: notes?.trim() || undefined,
    createdAt: isoTimestamp,
    createdBy,
    createdByName,
  };
  const updatedKhataEntries = [...baseKhata, entry];
  saveKhataEntries(updatedKhataEntries);

  return {
    updatedParties,
    updatedKhataEntries,
    entry,
  };
}

export interface EditCreditReceiptLineInput {
  itemId: number;
  itemName: string;
  unit?: string;
  batchNumber: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  itemDiscount: number;
}

export interface EditCreditReceiptResult {
  sale: SaleRecord;
  auditEntry: SaleAuditLogEntry;
  updatedItems: PharmacyItem[];
  updatedParties: Party[];
  updatedSales: SaleRecord[];
  updatedKhataEntries: KhataEntry[];
  previousNetPayable: number;
  newNetPayable: number;
}

export function editCreditSaleTransaction(params: {
  saleId: number;
  editedLines: EditCreditReceiptLineInput[];
  billDiscount: number;
  reason: string;
  editedBy: string;
  editedByName: string;
  editedByRole: string;
  transactionReference?: string;
  settings?: Partial<PharmacySettings> | null;
  currentItems: PharmacyItem[];
  currentParties: Party[];
  currentSales: SaleRecord[];
  currentKhataEntries?: KhataEntry[];
}): EditCreditReceiptResult {
  const {
    saleId,
    editedLines,
    billDiscount,
    reason,
    editedBy,
    editedByName,
    editedByRole,
    transactionReference,
    settings,
    currentItems,
    currentParties,
    currentSales,
  } = params;

  const normalizedRole = editedByRole.trim().toLowerCase();
  if (normalizedRole !== 'admin' && normalizedRole !== 'manager') {
    throw new Error(
      'Only an Admin or Manager can edit and reconcile a credit receipt.',
    );
  }

  const cleanReason = reason.trim();
  if (cleanReason.length < 3) {
    throw new Error(
      'Please enter an Audit / Correction Reason (at least 3 characters).',
    );
  }

  const originalSale = currentSales.find((s) => s.id === saleId);
  if (!originalSale) {
    throw new Error('Original sale receipt was not found.');
  }
  if (!isCreditPaymentMode(originalSale.paymentMode) || !originalSale.partyId) {
    throw new Error(
      'Only Credit / Khata customer receipts can be edited through this audited workflow.',
    );
  }

  if (editedLines.length === 0) {
    throw new Error('Receipt must contain at least one medicine line item.');
  }

  for (const line of editedLines) {
    if (!Number.isFinite(line.quantity) || line.quantity < 1) {
      throw new Error(`Quantity must be at least 1 for "${line.itemName}".`);
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new Error(`Unit price cannot be negative for "${line.itemName}".`);
    }
    if (!Number.isFinite(line.itemDiscount) || line.itemDiscount < 0) {
      throw new Error(`Discount cannot be negative for "${line.itemName}".`);
    }
  }

  // Calculate net quantity delta per itemId: newQty - oldQty
  const oldQtyByItem = new Map<number, number>();
  for (const line of originalSale.items) {
    oldQtyByItem.set(
      line.itemId,
      (oldQtyByItem.get(line.itemId) ?? 0) + line.quantity,
    );
  }

  const newQtyByItem = new Map<number, number>();
  for (const line of editedLines) {
    const qty = Math.floor(line.quantity);
    newQtyByItem.set(line.itemId, (newQtyByItem.get(line.itemId) ?? 0) + qty);
  }

  const deltaByItem = new Map<number, number>();
  const affectedItemIds = new Set<number>([
    ...oldQtyByItem.keys(),
    ...newQtyByItem.keys(),
  ]);

  for (const itemId of affectedItemIds) {
    const delta = (newQtyByItem.get(itemId) ?? 0) - (oldQtyByItem.get(itemId) ?? 0);
    if (delta !== 0) {
      const inv = currentItems.find((it) => it.id === itemId);
      if (inv && delta > 0 && inv.stockQuantity + 0.0001 < delta) {
        throw new Error(
          `Insufficient stock for ${inv.name} (Available: ${inv.stockQuantity}, Additional needed: ${delta}).`,
        );
      }
      deltaByItem.set(itemId, delta);
    }
  }

  // Apply stock adjustments cleanly
  const updatedItems = currentItems.map((item) => {
    const delta = deltaByItem.get(item.id);
    if (!delta) return item;
    return {
      ...item,
      stockQuantity:
        Math.round(Math.max(0, item.stockQuantity - delta) * 100) / 100,
    };
  });

  // Recompute receipt totals accurately
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const updatedSaleItems: SaleItemRecord[] = editedLines.map((line, index) => {
    const qty = Math.floor(line.quantity);
    const rate = round2(Math.max(0, line.unitPrice));
    const gross = round2(rate * qty);
    const clampedDisc = round2(Math.min(Math.max(0, line.itemDiscount), gross));
    return {
      id: index + 1,
      saleId: originalSale.id,
      itemId: line.itemId,
      itemName: line.itemName,
      unit:
        line.unit ||
        currentItems.find((it) => it.id === line.itemId)?.unit ||
        'Unit',
      batchNumber: line.batchNumber,
      quantity: qty,
      unitPrice: rate,
      costPrice: line.costPrice,
      itemDiscount: clampedDisc,
      lineTotal: round2(gross - clampedDisc),
    };
  });

  const subtotal = round2(
    updatedSaleItems.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
  );
  const itemDiscountTotal = round2(
    updatedSaleItems.reduce((sum, l) => sum + l.itemDiscount, 0),
  );
  const afterItemDiscount = Math.max(0, round2(subtotal - itemDiscountTotal));
  const safeBillDiscount = round2(
    Math.min(Math.max(0, billDiscount), afterItemDiscount),
  );
  const totalDiscount = round2(itemDiscountTotal + safeBillDiscount);
  const newNetPayable = round2(afterItemDiscount - safeBillDiscount);
  const totalCost = round2(
    updatedSaleItems.reduce((sum, l) => sum + l.costPrice * l.quantity, 0),
  );
  const newNetProfit = round2(newNetPayable - totalCost);

  const editedAt = new Date().toISOString();
  const prevNet = round2(originalSale.netPayable);
  const creditDiff = round2(newNetPayable - prevNet);
  const sign = creditDiff > 0 ? '+' : '';
  const fmt = (v: number) => formatMoney(v, settings);
  const summaryParts: string[] = [
    `Net credit: ${fmt(prevNet)} -> ${fmt(newNetPayable)} (${sign}${fmt(creditDiff)})`,
  ];
  if (Math.abs(originalSale.discountAmount - totalDiscount) > 0.005) {
    summaryParts.push(
      `Discount: ${fmt(originalSale.discountAmount)} -> ${fmt(totalDiscount)}`,
    );
  }
  const oldTotalQty = originalSale.items.reduce((s, i) => s + i.quantity, 0);
  const newTotalQty = updatedSaleItems.reduce((s, i) => s + i.quantity, 0);
  if (oldTotalQty !== newTotalQty || originalSale.items.length !== updatedSaleItems.length) {
    summaryParts.push(
      `Lines/Qty: ${originalSale.items.length} (${oldTotalQty} units) -> ${updatedSaleItems.length} (${newTotalQty} units)`,
    );
  }
  const summary = summaryParts.join(' · ');

  const existingLogs = originalSale.auditLogs ?? [];
  const nextLogId =
    existingLogs.reduce((max, l) => Math.max(max, l.id), 0) + 1;
  const auditEntry: SaleAuditLogEntry = {
    id: nextLogId,
    editedAt,
    editedBy,
    editedByName,
    editedByRole,
    reason: cleanReason,
    previousNetPayable: prevNet,
    newNetPayable,
    previousDiscountAmount: round2(originalSale.discountAmount),
    newDiscountAmount: totalDiscount,
    summary,
  };

  const cleanRef =
    transactionReference !== undefined
      ? transactionReference.trim() || undefined
      : originalSale.transactionReference;

  const updatedSale: SaleRecord = {
    ...originalSale,
    subtotal,
    discountAmount: totalDiscount,
    netPayable: newNetPayable,
    totalCost,
    netProfit: newNetProfit,
    transactionReference: cleanRef,
    editedAt,
    editedBy,
    editedByName,
    editReason: cleanReason,
    auditLogs: [...existingLogs, auditEntry],
    items: updatedSaleItems,
  };

  const updatedSales = currentSales.map((s) =>
    s.id === originalSale.id ? updatedSale : s,
  );

  // Reconcile Khata ledger first so all entries are present before updating
  const baseKhata = reconcileKhataEntries(
    currentParties,
    currentSales,
    params.currentKhataEntries ?? loadKhataEntries(),
  );

  let matchedKhata = false;
  let updatedKhataEntries = baseKhata.map((entry) => {
    if (
      !matchedKhata &&
      entry.entryType === 'credit_sale' &&
      entry.partyId === originalSale.partyId &&
      ((originalSale.id && entry.saleId === originalSale.id) ||
        (originalSale.invoiceNumber &&
          entry.invoiceNumber === originalSale.invoiceNumber))
    ) {
      matchedKhata = true;
      return {
        ...entry,
        amount: newNetPayable,
        saleId: originalSale.id,
        invoiceNumber: originalSale.invoiceNumber,
        reference: cleanRef,
        notes: `${updatedSaleItems.length} medicine line(s) billed on credit (Edited: ${cleanReason})`,
        editedAt,
        editedBy,
        editedByName,
        editReason: cleanReason,
        previousAmount: prevNet,
        editSummary: summary,
      };
    }
    return entry;
  });

  if (!matchedKhata) {
    const nextKhataId =
      updatedKhataEntries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    updatedKhataEntries = [
      ...updatedKhataEntries,
      {
        id: nextKhataId,
        partyId: originalSale.partyId,
        entryType: 'credit_sale',
        amount: newNetPayable,
        saleId: originalSale.id,
        invoiceNumber: originalSale.invoiceNumber,
        paymentMode: originalSale.paymentMode,
        reference: cleanRef,
        notes: `${updatedSaleItems.length} medicine line(s) billed on credit (Edited: ${cleanReason})`,
        createdAt: originalSale.createdAt,
        createdBy: originalSale.createdBy,
        createdByName: originalSale.createdByName,
        editedAt,
        editedBy,
        editedByName,
        editReason: cleanReason,
        previousAmount: prevNet,
        editSummary: summary,
      },
    ];
  }

  // Recalculate customer's To Collect balance strictly from ledger entries (zero double-counting)
  const customerLedgerSum = updatedKhataEntries
    .filter((e) => e.partyId === originalSale.partyId)
    .reduce(
      (sum, e) => (e.entryType === 'collection' ? sum - e.amount : sum + e.amount),
      0,
    );
  const recalculatedBalance = Math.max(0, round2(customerLedgerSum));

  const updatedParties = currentParties.map((p) =>
    p.id === originalSale.partyId ? { ...p, balance: recalculatedBalance } : p,
  );

  saveItems(updatedItems);
  saveParties(updatedParties);
  saveSales(updatedSales);
  saveKhataEntries(updatedKhataEntries);

  return {
    sale: updatedSale,
    auditEntry,
    updatedItems,
    updatedParties,
    updatedSales,
    updatedKhataEntries,
    previousNetPayable: prevNet,
    newNetPayable,
  };
}

export interface CompletePurchaseResult {
  purchase: PurchaseRecord;
  updatedItems: PharmacyItem[];
  updatedParties: Party[];
  updatedPurchases: PurchaseRecord[];
  updatedSupplierPayments: SupplierPaymentEntry[];
}

export function executePurchaseTransaction(params: {
  supplier: Party;
  supplierInvoiceNo: string;
  lines: PurchaseDraftLine[];
  paidAmount: number;
  paymentMode: PaymentMode;
  createdBy?: string;
  createdByName?: string;
  currentItems: PharmacyItem[];
  currentParties: Party[];
  currentPurchases: PurchaseRecord[];
  currentSupplierPayments?: SupplierPaymentEntry[];
}): CompletePurchaseResult {
  const {
    supplier,
    supplierInvoiceNo,
    lines,
    paidAmount,
    paymentMode,
    createdBy,
    createdByName,
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

  const round2 = (v: number) => Math.round(v * 100) / 100;
  const totalAmount = round2(
    lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0),
  );
  const safePaid = round2(Math.min(Math.max(0, paidAmount), totalAmount));
  const balanceDue = round2(Math.max(0, totalAmount - safePaid));

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
          genericName:
            line.genericName !== undefined
              ? line.genericName.trim() || (current.genericName ?? '')
              : (current.genericName ?? ''),
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
        genericName: (line.genericName ?? '').trim(),
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
      lineTotal: round2(line.unitCost * line.quantity),
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
      return { ...p, balance: round2(p.balance + balanceDue) };
    }
    return p;
  });

  const updatedPurchases = [newPurchase, ...currentPurchases];

  const baseSupplierPayments =
    params.currentSupplierPayments ?? loadSupplierPayments();
  let updatedSupplierPayments = baseSupplierPayments;
  if (safePaid > 0.005) {
    const nextPayId =
      baseSupplierPayments.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    const initialPayment: SupplierPaymentEntry = {
      id: nextPayId,
      partyId: supplier.id,
      purchaseId: newPurchase.id,
      purchaseNumber: newPurchase.purchaseNumber,
      supplierInvoiceNo: newPurchase.supplierInvoiceNo,
      amount: safePaid,
      paymentMode:
        paymentMode === 'Credit/Party Ledger' ||
        paymentMode === 'Credit / Khata'
          ? 'Cash'
          : paymentMode,
      notes: 'Initial payment recorded with purchase bill',
      createdAt: newPurchase.createdAt,
      createdBy,
      createdByName,
    };
    updatedSupplierPayments = [...baseSupplierPayments, initialPayment];
    saveSupplierPayments(updatedSupplierPayments);
  }

  saveItems(updatedItems);
  saveParties(updatedParties);
  savePurchases(updatedPurchases);

  return {
    purchase: newPurchase,
    updatedItems,
    updatedParties,
    updatedPurchases,
    updatedSupplierPayments,
  };
}

export function recordSupplierPaymentTransaction(params: {
  partyId: number;
  amount: number;
  purchaseId?: number | null;
  paymentMode?: string;
  reference?: string;
  notes?: string;
  paidAt?: string;
  createdBy?: string;
  createdByName?: string;
  currentParties: Party[];
  currentPurchases: PurchaseRecord[];
  currentSupplierPayments?: SupplierPaymentEntry[];
}): {
  updatedParties: Party[];
  updatedPurchases: PurchaseRecord[];
  updatedSupplierPayments: SupplierPaymentEntry[];
  entry: SupplierPaymentEntry | null;
} {
  const {
    partyId,
    amount,
    purchaseId,
    paymentMode = 'Cash',
    reference,
    notes,
    paidAt,
    createdBy,
    createdByName,
    currentParties,
    currentPurchases,
  } = params;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const basePayments = reconcileSupplierPayments(
    currentPurchases,
    params.currentSupplierPayments ?? loadSupplierPayments(),
  );

  const targetParty = currentParties.find((p) => p.id === partyId);
  if (!targetParty || targetParty.type !== 'supplier') {
    return {
      updatedParties: currentParties,
      updatedPurchases: currentPurchases,
      updatedSupplierPayments: basePayments,
      entry: null,
    };
  }

  const rawAmount = Math.max(0, round2(Number(amount) || 0));
  if (rawAmount <= 0) {
    return {
      updatedParties: currentParties,
      updatedPurchases: currentPurchases,
      updatedSupplierPayments: basePayments,
      entry: null,
    };
  }

  const isoTimestamp =
    paidAt && paidAt.trim()
      ? paidAt.includes('T')
        ? new Date(paidAt).toISOString()
        : new Date(`${paidAt.trim()}T12:00:00`).toISOString()
      : new Date().toISOString();

  let updatedPurchases = currentPurchases;
  let appliedAmount = 0;
  let linkedPurchaseNumber: string | undefined;
  let linkedSupplierInvoiceNo: string | undefined;
  let resolvedPurchaseId: number | null = null;

  if (purchaseId !== undefined && purchaseId !== null) {
    const targetBill = currentPurchases.find(
      (p) => p.id === purchaseId && p.supplierId === partyId,
    );
    if (!targetBill) {
      throw new Error('Selected purchase bill was not found for this supplier.');
    }
    const billDue = round2(Math.max(0, targetBill.balanceDue));
    if (billDue <= 0.005) {
      throw new Error(`Bill ${targetBill.purchaseNumber} is already paid in full.`);
    }
    appliedAmount = round2(Math.min(rawAmount, billDue));
    if (appliedAmount <= 0) {
      return {
        updatedParties: currentParties,
        updatedPurchases: currentPurchases,
        updatedSupplierPayments: basePayments,
        entry: null,
      };
    }

    const nextPaid = round2(targetBill.paidAmount + appliedAmount);
    const nextDue = Math.max(0, round2(targetBill.totalAmount - nextPaid));
    updatedPurchases = currentPurchases.map((p) =>
      p.id === targetBill.id
        ? {
            ...p,
            paidAmount: nextPaid,
            balanceDue: nextDue,
          }
        : p,
    );
    resolvedPurchaseId = targetBill.id;
    linkedPurchaseNumber = targetBill.purchaseNumber;
    linkedSupplierInvoiceNo = targetBill.supplierInvoiceNo;
  } else {
    appliedAmount =
      targetParty.balance > 0
        ? round2(Math.min(rawAmount, targetParty.balance))
        : 0;
    if (appliedAmount <= 0) {
      return {
        updatedParties: currentParties,
        updatedPurchases: currentPurchases,
        updatedSupplierPayments: basePayments,
        entry: null,
      };
    }
  }

  const updatedParties = currentParties.map((p) =>
    p.id === partyId
      ? {
          ...p,
          balance: Math.max(0, round2(p.balance - appliedAmount)),
        }
      : p,
  );

  const nextId = basePayments.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const cleanNotes = notes?.trim();
  const entry: SupplierPaymentEntry = {
    id: nextId,
    partyId,
    purchaseId: resolvedPurchaseId,
    purchaseNumber: linkedPurchaseNumber,
    supplierInvoiceNo: linkedSupplierInvoiceNo,
    amount: appliedAmount,
    paymentMode,
    reference: reference?.trim() || undefined,
    notes:
      cleanNotes ||
      (linkedPurchaseNumber
        ? `Payment allocated to ${linkedPurchaseNumber}`
        : 'General supplier payable payment'),
    createdAt: isoTimestamp,
    createdBy,
    createdByName,
  };

  const updatedSupplierPayments = [...basePayments, entry];
  saveParties(updatedParties);
  savePurchases(updatedPurchases);
  saveSupplierPayments(updatedSupplierPayments);

  return {
    updatedParties,
    updatedPurchases,
    updatedSupplierPayments,
    entry,
  };
}
