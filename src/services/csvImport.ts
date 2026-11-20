import { PharmacyItem } from '../types/pharmacy';
import { calculateUnitPrice } from './localDb';

export interface ParsedCsvProductRow {
  rowNumber: number;
  name: string;
  genericName: string;
  barcode: string;
  category: string;
  unitsPerBox: number;
  boxCostPrice: number;
  boxSellingPrice: number;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  unit: string;
  batchNumber: string;
  expiryDate: string;
  error?: string;
}

export interface CsvImportParseResult {
  headers: string[];
  rows: ParsedCsvProductRow[];
  validCount: number;
  errorCount: number;
}

/**
 * RFC-4180 compliant CSV parser handling UTF-8 BOM, quoted fields,
 * escaped quotes (""), and CRLF/LF line endings.
 */
export function parseCsvText(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function normalizeHeaderKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/\([a-z]{2,5}\)/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function normalizeExpiryDate(raw: string): string {
  const val = raw.trim();
  if (!val) return '2027-12-31';

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }

  // YYYY-MM or YYYY/MM
  const ymMatch = val.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ymMatch) {
    const year = Number(ymMatch[1]);
    const month = Math.min(12, Math.max(1, Number(ymMatch[2])));
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // MM/YY or MM-YY or MM/YYYY
  const mmyyMatch = val.match(/^(\d{1,2})[-/](\d{2,4})$/);
  if (mmyyMatch) {
    const month = Math.min(12, Math.max(1, Number(mmyyMatch[1])));
    const rawYear = Number(mmyyMatch[2]);
    const year = mmyyMatch[2].length === 2 ? 2000 + rawYear : rawYear;
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = val.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = Math.min(31, Math.max(1, Number(dmyMatch[1])));
    const month = Math.min(12, Math.max(1, Number(dmyMatch[2])));
    const year = Number(dmyMatch[3]);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsed = new Date(val);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  return '2027-12-31';
}

function parseNumericCell(raw: string): number | null {
  const cleaned = raw
    .replace(/pkr|usd|eur|gbp|aed|sar|inr|cad|aud|rs\.?|[$€£₹﷼,]/gi, '')
    .trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

const HEADER_ALIASES: Record<
  | 'name'
  | 'genericName'
  | 'category'
  | 'barcode'
  | 'batchNumber'
  | 'expiryDate'
  | 'unitsPerBox'
  | 'unit'
  | 'boxCostPrice'
  | 'boxSellingPrice'
  | 'unitCostPrice'
  | 'unitSellingPrice'
  | 'stockQuantity',
  string[]
> = {
  name: ['medicinename', 'name', 'productname', 'itemname', 'medicine', 'product', 'item'],
  genericName: ['genericname', 'generic', 'salt', 'formula', 'composition', 'activeingredient'],
  category: ['category', 'group', 'department', 'class'],
  barcode: ['barcode', 'ean', 'upc', 'skucode', 'code'],
  batchNumber: ['batchnumber', 'batch', 'batchno', 'lot', 'lotnumber'],
  expiryDate: ['expirydate', 'expiry', 'expdate', 'exp'],
  unitsPerBox: ['unitsperbox', 'unitinbox', 'unitsinbox', 'packsize', 'boxunits', 'unitsbox'],
  unit: ['unit', 'unittype', 'dispensingunit', 'uom'],
  boxCostPrice: ['boxcost', 'costpriceofthebox', 'boxcostprice', 'costbox', 'purchaseboxprice'],
  boxSellingPrice: ['boxselling', 'sellingpriceofthebox', 'boxsellingprice', 'boxprice', 'saleboxprice'],
  unitCostPrice: ['unitcost', 'costprice', 'cost', 'purchaseprice'],
  unitSellingPrice: ['unitselling', 'sellingprice', 'unitprice', 'price', 'saleprice', 'mrp'],
  stockQuantity: ['stockquantity', 'stock', 'quantity', 'qty', 'stockunits', 'onhand'],
};

export function parseProductsCsv(csvText: string): CsvImportParseResult {
  const matrix = parseCsvText(csvText);
  if (matrix.length === 0) {
    return { headers: [], rows: [], validCount: 0, errorCount: 0 };
  }

  const rawHeaders = matrix[0];
  const normalizedHeaders = rawHeaders.map(normalizeHeaderKey);

  const colIndex = new Map<keyof typeof HEADER_ALIASES, number>();
  (Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]).forEach(
    (field) => {
      const aliases = HEADER_ALIASES[field];
      const idx = normalizedHeaders.findIndex((h) => aliases.includes(h));
      if (idx !== -1) {
        colIndex.set(field, idx);
      }
    },
  );

  const dataRows = matrix.slice(1);
  const parsedRows: ParsedCsvProductRow[] = [];
  let validCount = 0;
  let errorCount = 0;

  dataRows.forEach((cells, idx) => {
    const getCell = (field: keyof typeof HEADER_ALIASES): string => {
      const i = colIndex.get(field);
      return i !== undefined && cells[i] !== undefined ? cells[i].trim() : '';
    };

    const name = getCell('name');
    const genericName = getCell('genericName');
    const barcode = getCell('barcode');
    const category = getCell('category') || 'General';
    const batchNumber = getCell('batchNumber');
    const expiryDate = normalizeExpiryDate(getCell('expiryDate'));
    const unit = getCell('unit') || 'Tablet';

    const rawUnitsPerBox = parseNumericCell(getCell('unitsPerBox'));
    const unitsPerBox =
      rawUnitsPerBox !== null && rawUnitsPerBox >= 1
        ? Math.floor(rawUnitsPerBox)
        : 1;

    const rawBoxCost = parseNumericCell(getCell('boxCostPrice'));
    const rawUnitCost = parseNumericCell(getCell('unitCostPrice'));
    const rawBoxSelling = parseNumericCell(getCell('boxSellingPrice'));
    const rawUnitSelling = parseNumericCell(getCell('unitSellingPrice'));
    const rawStock = parseNumericCell(getCell('stockQuantity'));

    let boxCostPrice = 0;
    if (rawBoxCost !== null) {
      boxCostPrice = Math.max(0, rawBoxCost);
    } else if (rawUnitCost !== null) {
      boxCostPrice = Math.round(Math.max(0, rawUnitCost) * unitsPerBox * 100) / 100;
    }

    let boxSellingPrice = 0;
    if (rawBoxSelling !== null) {
      boxSellingPrice = Math.max(0, rawBoxSelling);
    } else if (rawUnitSelling !== null) {
      boxSellingPrice =
        Math.round(Math.max(0, rawUnitSelling) * unitsPerBox * 100) / 100;
    }

    const costPrice = calculateUnitPrice(boxCostPrice, unitsPerBox);
    const sellingPrice = calculateUnitPrice(boxSellingPrice, unitsPerBox);
    const stockQuantity =
      rawStock !== null ? Math.max(0, Math.floor(rawStock)) : 0;

    let error: string | undefined;
    if (!colIndex.has('name')) {
      error = 'Missing "Medicine Name" column header.';
    } else if (!name) {
      error = 'Medicine name is blank.';
    } else if (rawBoxCost !== null && rawBoxCost < 0) {
      error = 'Negative cost price is not allowed.';
    } else if (rawBoxSelling !== null && rawBoxSelling < 0) {
      error = 'Negative selling price is not allowed.';
    } else if (rawStock !== null && rawStock < 0) {
      error = 'Negative stock quantity is not allowed.';
    }

    if (error) {
      errorCount += 1;
    } else {
      validCount += 1;
    }

    parsedRows.push({
      rowNumber: idx + 2,
      name,
      genericName,
      barcode,
      category,
      unitsPerBox,
      boxCostPrice,
      boxSellingPrice,
      costPrice,
      sellingPrice,
      stockQuantity,
      unit,
      batchNumber,
      expiryDate,
      error,
    });
  });

  return {
    headers: rawHeaders,
    rows: parsedRows,
    validCount,
    errorCount,
  };
}

export const CSV_IMPORT_TEMPLATE_HEADERS = [
  'Medicine Name',
  'Generic Name',
  'Category',
  'Barcode',
  'Batch Number',
  'Expiry Date',
  'Units Per Box',
  'Unit',
  'Box Cost (PKR)',
  'Box Selling (PKR)',
  'Stock Quantity',
];

export const CSV_IMPORT_TEMPLATE_ROWS: (string | number)[][] = [
  [
    'Augmentin 625mg Tablets',
    'Co-Amoxiclav (Amoxicillin + Clavulanic Acid)',
    'Antibiotics',
    '896400109901',
    'AUG-26A',
    '2027-08-31',
    10,
    'Tablet',
    320,
    400,
    120,
  ],
  [
    'Panadol Extra Tablets',
    'Paracetamol + Caffeine',
    'Analgesics',
    '896400109902',
    'PAN-26B',
    '2028-01-31',
    100,
    'Tablet',
    410,
    500,
    300,
  ],
  [
    'Risek 40mg Capsules',
    'Omeprazole',
    'Gastro',
    '896400109903',
    'RSK-26C',
    '2027-11-30',
    14,
    'Capsule',
    520,
    630,
    70,
  ],
];

export type CsvDuplicateStrategy = 'update' | 'skip';

export function buildImportedInventoryResult(params: {
  existingItems: PharmacyItem[];
  parsedRows: ParsedCsvProductRow[];
  strategy: CsvDuplicateStrategy;
}): {
  nextItems: PharmacyItem[];
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
} {
  const { existingItems, parsedRows, strategy } = params;
  const working = existingItems.map((it) => ({ ...it }));
  let maxId = working.reduce((max, it) => Math.max(max, it.id), 0);
  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const findExistingIndex = (row: ParsedCsvProductRow): number => {
    const cleanBarcode = row.barcode.trim().toLowerCase();
    if (cleanBarcode) {
      const byBarcode = working.findIndex(
        (it) => it.barcode.trim().toLowerCase() === cleanBarcode,
      );
      if (byBarcode !== -1) return byBarcode;
    }

    const cleanName = row.name.trim().toLowerCase();
    const cleanBatch = row.batchNumber.trim().toLowerCase();
    return working.findIndex((it) => {
      if (it.name.trim().toLowerCase() !== cleanName) return false;
      if (cleanBatch) {
        return it.batchNumber.trim().toLowerCase() === cleanBatch;
      }
      return true;
    });
  };

  for (const row of parsedRows) {
    if (row.error || !row.name.trim()) {
      skippedCount += 1;
      continue;
    }

    const matchIndex = findExistingIndex(row);
    if (matchIndex !== -1) {
      if (strategy === 'skip') {
        skippedCount += 1;
        continue;
      }
      const existing = working[matchIndex];
      working[matchIndex] = {
        ...existing,
        name: row.name.trim(),
        genericName: row.genericName.trim() || existing.genericName || '',
        barcode: row.barcode.trim() || existing.barcode,
        category: row.category.trim() || existing.category,
        unitsPerBox: row.unitsPerBox,
        boxCostPrice: row.boxCostPrice,
        boxSellingPrice: row.boxSellingPrice,
        costPrice: calculateUnitPrice(row.boxCostPrice, row.unitsPerBox),
        sellingPrice: calculateUnitPrice(row.boxSellingPrice, row.unitsPerBox),
        stockQuantity: row.stockQuantity,
        unit: row.unit.trim() || existing.unit,
        batchNumber: row.batchNumber.trim() || existing.batchNumber,
        expiryDate: row.expiryDate || existing.expiryDate,
      };
      updatedCount += 1;
    } else {
      maxId += 1;
      const created: PharmacyItem = {
        id: maxId,
        name: row.name.trim(),
        genericName: row.genericName.trim(),
        barcode:
          row.barcode.trim() || `89640010${String(maxId).padStart(4, '0')}`,
        category: row.category.trim() || 'General',
        unitsPerBox: row.unitsPerBox,
        boxCostPrice: row.boxCostPrice,
        boxSellingPrice: row.boxSellingPrice,
        costPrice: calculateUnitPrice(row.boxCostPrice, row.unitsPerBox),
        sellingPrice: calculateUnitPrice(row.boxSellingPrice, row.unitsPerBox),
        stockQuantity: row.stockQuantity,
        unit: row.unit.trim() || 'Tablet',
        batchNumber:
          row.batchNumber.trim() || `BAT-${String(maxId).padStart(4, '0')}`,
        expiryDate: row.expiryDate || '2027-12-31',
      };
      working.unshift(created);
      addedCount += 1;
    }
  }

  return {
    nextItems: working,
    addedCount,
    updatedCount,
    skippedCount,
  };
}
