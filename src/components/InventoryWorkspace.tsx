import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  Edit2,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PharmacyItem, PharmacySettings } from '../types/pharmacy';
import {
  calculateUnitPrice,
  formatMoney,
  getCurrencyLabel,
} from '../services/localDb';
import { downloadCsvFile } from '../services/csvExport';
import {
  CSV_IMPORT_TEMPLATE_HEADERS,
  CSV_IMPORT_TEMPLATE_ROWS,
  CsvDuplicateStrategy,
  CsvImportParseResult,
  parseProductsCsv,
} from '../services/csvImport';

interface InventoryWorkspaceProps {
  items: PharmacyItem[];
  readOnly?: boolean;
  defaultLowStockThreshold?: number;
  nearExpiryDays?: number;
  settings?: PharmacySettings;
  onSaveItem: (item: Omit<PharmacyItem, 'id'> & { id?: number }) => void;
  onDeleteItem: (id: number) => void;
  onImportItems?: (
    rows: CsvImportParseResult['rows'],
    strategy: CsvDuplicateStrategy,
  ) => { addedCount: number; updatedCount: number; skippedCount: number };
}

type StockFilter = 'all' | 'low' | 'expiring' | 'expiry30';

const THRESHOLD_STORAGE_KEY = 'clinix_low_stock_threshold_v1';

interface MedicineFormState {
  name: string;
  barcode: string;
  category: string;
  unitsPerBox: string;
  boxCostPrice: string;
  boxSellingPrice: string;
  stockQuantity: string;
  unit: string;
  batchNumber: string;
  expiryDate: string;
}

const EMPTY_FORM: MedicineFormState = {
  name: '',
  barcode: '',
  category: 'Analgesics',
  unitsPerBox: '10',
  boxCostPrice: '',
  boxSellingPrice: '',
  stockQuantity: '0',
  unit: 'Tablet',
  batchNumber: '',
  expiryDate: '2027-12-31',
};

export const InventoryWorkspace: React.FC<InventoryWorkspaceProps> = ({
  items,
  readOnly = false,
  defaultLowStockThreshold,
  nearExpiryDays = 90,
  settings,
  onSaveItem,
  onDeleteItem,
  onImportItems,
}) => {
  const cur = getCurrencyLabel(settings);
  const csvCur = getCurrencyLabel(settings, true);
  const digits = settings?.decimalDigits ?? 2;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [threshold, setThreshold] = useState<number>(() => {
    if (
      defaultLowStockThreshold !== undefined &&
      Number.isFinite(defaultLowStockThreshold) &&
      defaultLowStockThreshold >= 1
    ) {
      return defaultLowStockThreshold;
    }
    try {
      const saved = localStorage.getItem(THRESHOLD_STORAGE_KEY);
      const parsed = saved ? Number(saved) : 10;
      return Number.isFinite(parsed) && parsed >= 1 ? parsed : 10;
    } catch {
      return 10;
    }
  });

  useEffect(() => {
    if (
      defaultLowStockThreshold !== undefined &&
      Number.isFinite(defaultLowStockThreshold) &&
      defaultLowStockThreshold >= 1
    ) {
      setThreshold(defaultLowStockThreshold);
    }
  }, [defaultLowStockThreshold]);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<MedicineFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // CSV Import Modal state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importParseResult, setImportParseResult] =
    useState<CsvImportParseResult | null>(null);
  const [importStrategy, setImportStrategy] =
    useState<CsvDuplicateStrategy>('update');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(THRESHOLD_STORAGE_KEY, String(threshold));
    } catch {
      // Ignore storage quota errors
    }
  }, [threshold]);

  const getDaysUntilExpiry = (expiry: string): number | null => {
    const dt = new Date(`${expiry}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return null;
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    return Math.round((dt.getTime() - todayStart) / (1000 * 60 * 60 * 24));
  };

  const isExpiringSoon = (expiry: string) => {
    const days = getDaysUntilExpiry(expiry);
    return days !== null && days <= Math.max(1, nearExpiryDays);
  };

  const lowStockItems = useMemo(
    () => items.filter((item) => item.stockQuantity < threshold),
    [items, threshold],
  );

  const expiry30ReportItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .map((item) => ({
        item,
        daysLeft: getDaysUntilExpiry(item.expiryDate),
      }))
      .filter(
        (entry): entry is { item: PharmacyItem; daysLeft: number } =>
          entry.daysLeft !== null &&
          entry.daysLeft >= 0 &&
          entry.daysLeft <= 30 &&
          (!q ||
            entry.item.name.toLowerCase().includes(q) ||
            entry.item.barcode.toLowerCase().includes(q) ||
            entry.item.batchNumber.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [items, search]);

  const expiry30TotalCount = useMemo(
    () =>
      items.filter((item) => {
        const d = getDaysUntilExpiry(item.expiryDate);
        return d !== null && d >= 0 && d <= 30;
      }).length,
    [items],
  );

  const expiry30RiskCost = useMemo(
    () =>
      expiry30ReportItems.reduce(
        (sum, { item }) => sum + item.costPrice * item.stockQuantity,
        0,
      ),
    [expiry30ReportItems],
  );

  const handleExportExpiryCsv = () => {
    downloadCsvFile(
      `clinix_30day_expiry_report_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Expiry Date',
        'Days Remaining',
        'Medicine Name',
        'Category',
        'Batch Number',
        'Stock Quantity',
        'Unit',
        `Cost Value (${csvCur})`,
      ],
      expiry30ReportItems.map(({ item, daysLeft }) => [
        item.expiryDate,
        daysLeft,
        item.name,
        item.category,
        item.batchNumber,
        item.stockQuantity,
        item.unit,
        (item.costPrice * item.stockQuantity).toFixed(digits),
      ]),
    );
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQ =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        item.batchNumber.toLowerCase().includes(q);
      if (!matchesQ) return false;
      if (filter === 'low') return item.stockQuantity < threshold;
      if (filter === 'expiring') return isExpiringSoon(item.expiryDate);
      return true;
    });
  }, [items, search, filter, threshold]);

  const handleExportInventoryCsv = () => {
    if (readOnly) return;
    if (filter === 'expiry30') {
      handleExportExpiryCsv();
      return;
    }
    const filterTag = filter === 'all' ? 'all' : filter;
    downloadCsvFile(
      `clinix_inventory_${filterTag}_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'SKU ID',
        'Medicine Name',
        'Category',
        'Barcode',
        'Batch Number',
        'Expiry Date',
        'Units Per Box',
        'Unit',
        `Box Cost (${csvCur})`,
        `Box Selling (${csvCur})`,
        `Unit Cost (${csvCur})`,
        `Unit Selling (${csvCur})`,
        'Stock Quantity',
        `Stock Cost Value (${csvCur})`,
        `Stock Retail Value (${csvCur})`,
        'Stock Status',
      ],
      filtered.map((item) => {
        const status =
          item.stockQuantity <= 0
            ? 'Out of Stock'
            : item.stockQuantity < threshold
              ? 'Low Stock'
              : 'In Stock';
        return [
          item.id,
          item.name,
          item.category,
          item.barcode,
          item.batchNumber,
          item.expiryDate,
          item.unitsPerBox,
          item.unit,
          item.boxCostPrice.toFixed(digits),
          item.boxSellingPrice.toFixed(digits),
          item.costPrice.toFixed(digits),
          item.sellingPrice.toFixed(digits),
          item.stockQuantity,
          (item.costPrice * item.stockQuantity).toFixed(digits),
          (item.sellingPrice * item.stockQuantity).toFixed(digits),
          status,
        ];
      }),
    );
  };

  const metrics = useMemo(() => {
    const totalUnits = items.reduce((s, i) => s + i.stockQuantity, 0);
    const costValuation = items.reduce(
      (s, i) => s + i.costPrice * i.stockQuantity,
      0,
    );
    const retailValuation = items.reduce(
      (s, i) => s + i.sellingPrice * i.stockQuantity,
      0,
    );
    return {
      totalUnits,
      costValuation,
      retailValuation,
      lowStockCount: lowStockItems.length,
    };
  }, [items, lowStockItems]);

  const handleThresholdChange = (raw: string) => {
    if (readOnly) return;
    const parsed = Math.max(1, Math.floor(Number(raw) || 1));
    setThreshold(parsed);
    setBannerDismissed(false);
  };

  const openCreateModal = () => {
    if (readOnly) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openImportModal = () => {
    if (readOnly) return;
    setImportFileName('');
    setImportParseResult(null);
    setImportError(null);
    setImportStrategy('update');
    setIsImportModalOpen(true);
  };

  const handleDownloadImportTemplate = () => {
    downloadCsvFile(
      'clinix_products_import_template.csv',
      CSV_IMPORT_TEMPLATE_HEADERS,
      CSV_IMPORT_TEMPLATE_ROWS,
    );
  };

  const handleCsvFileSelected = async (file: File | null | undefined) => {
    if (!file) return;
    setImportError(null);
    if (
      !file.name.toLowerCase().endsWith('.csv') &&
      file.type &&
      !file.type.includes('csv') &&
      !file.type.includes('text')
    ) {
      setImportError('Please select a valid .csv spreadsheet file.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseProductsCsv(text);
      if (parsed.rows.length === 0) {
        setImportError(
          'The selected CSV file has no product rows. Include a header row and at least one medicine row.',
        );
        setImportParseResult(null);
        setImportFileName(file.name);
        return;
      }
      setImportFileName(file.name);
      setImportParseResult(parsed);
    } catch {
      setImportError('Unable to read the CSV file. Ensure it is UTF-8 encoded.');
    }
  };

  const importPreviewSummary = useMemo(() => {
    if (!importParseResult) {
      return {
        rowActions: [] as ('new' | 'update' | 'skip' | 'error')[],
        newCount: 0,
        updateCount: 0,
        skipCount: 0,
        errorCount: 0,
      };
    }

    const existingBarcodes = new Set(
      items.map((it) => it.barcode.trim().toLowerCase()).filter(Boolean),
    );
    const existingNameBatch = new Set(
      items.map(
        (it) =>
          `${it.name.trim().toLowerCase()}::${it.batchNumber.trim().toLowerCase()}`,
      ),
    );
    const existingNames = new Set(
      items.map((it) => it.name.trim().toLowerCase()),
    );

    const seenBarcodes = new Set<string>();
    const seenNameBatch = new Set<string>();

    let newCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    const rowActions = importParseResult.rows.map((row) => {
      if (row.error) {
        errorCount += 1;
        return 'error' as const;
      }
      const bKey = row.barcode.trim().toLowerCase();
      const nKey = row.name.trim().toLowerCase();
      const nbKey = `${nKey}::${row.batchNumber.trim().toLowerCase()}`;

      const matchesExisting =
        (bKey && (existingBarcodes.has(bKey) || seenBarcodes.has(bKey))) ||
        (row.batchNumber.trim()
          ? existingNameBatch.has(nbKey) || seenNameBatch.has(nbKey)
          : existingNames.has(nKey) || seenNameBatch.has(nbKey));

      if (bKey) seenBarcodes.add(bKey);
      seenNameBatch.add(nbKey);

      if (matchesExisting) {
        if (importStrategy === 'skip') {
          skipCount += 1;
          return 'skip' as const;
        }
        updateCount += 1;
        return 'update' as const;
      }

      newCount += 1;
      return 'new' as const;
    });

    return { rowActions, newCount, updateCount, skipCount, errorCount };
  }, [importParseResult, items, importStrategy]);

  const handleConfirmCsvImport = () => {
    if (readOnly || !importParseResult || !onImportItems) return;
    const actionableCount =
      importPreviewSummary.newCount + importPreviewSummary.updateCount;
    if (actionableCount === 0) {
      setImportError('No valid rows available to import.');
      return;
    }
    const { addedCount, updatedCount, skippedCount } = onImportItems(
      importParseResult.rows,
      importStrategy,
    );
    setFilter('all');
    setSearch('');
    setIsImportModalOpen(false);
    setImportParseResult(null);
    setImportFileName('');
    setSaveSuccessMsg(
      `CSV Import complete: ${addedCount} added, ${updatedCount} updated${
        skippedCount > 0 ? `, ${skippedCount} skipped` : ''
      }.`,
    );
    setBannerDismissed(false);
  };

  const openEditModal = (item: PharmacyItem) => {
    if (readOnly) return;
    setEditingId(item.id);
    setForm({
      name: item.name,
      barcode: item.barcode,
      category: item.category,
      unitsPerBox: String(item.unitsPerBox || 1),
      boxCostPrice: String(item.boxCostPrice),
      boxSellingPrice: String(item.boxSellingPrice),
      stockQuantity: String(item.stockQuantity),
      unit: item.unit,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const parsedUnitsInBoxPreview = Math.max(
    1,
    Math.floor(Number(form.unitsPerBox) || 1),
  );
  const parsedBoxCostPreview = Math.max(0, Number(form.boxCostPrice) || 0);
  const parsedBoxSellingPreview = Math.max(
    0,
    Number(form.boxSellingPrice) || 0,
  );
  const autoUnitCostPreview = calculateUnitPrice(
    parsedBoxCostPreview,
    parsedUnitsInBoxPreview,
  );
  const autoUnitSellingPreview = calculateUnitPrice(
    parsedBoxSellingPreview,
    parsedUnitsInBoxPreview,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError('Medicine name is required.');
      return;
    }

    const parsedUnitsInBox = Number(form.unitsPerBox);
    const parsedBoxCost =
      form.boxCostPrice.trim() === '' ? 0 : Number(form.boxCostPrice);
    const parsedBoxSelling =
      form.boxSellingPrice.trim() === '' ? 0 : Number(form.boxSellingPrice);
    const parsedStock =
      form.stockQuantity.trim() === '' ? 0 : Number(form.stockQuantity);

    if (!Number.isFinite(parsedUnitsInBox) || Math.floor(parsedUnitsInBox) < 1) {
      setFormError('Units in box must be at least 1.');
      return;
    }
    if (!Number.isFinite(parsedBoxCost) || parsedBoxCost < 0) {
      setFormError('Enter a valid non-negative cost price of the box.');
      return;
    }
    if (!Number.isFinite(parsedBoxSelling) || parsedBoxSelling < 0) {
      setFormError('Enter a valid non-negative selling price of the box.');
      return;
    }
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      setFormError('Enter a valid stock quantity (0 or greater).');
      return;
    }

    const trimmedBarcode = form.barcode.trim();
    if (trimmedBarcode) {
      const duplicate = items.find(
        (it) =>
          it.id !== editingId &&
          it.barcode.trim().toLowerCase() === trimmedBarcode.toLowerCase(),
      );
      if (duplicate) {
        setFormError(
          `Barcode "${trimmedBarcode}" is already assigned to "${duplicate.name}".`,
        );
        return;
      }
    }

    const safeUnitsPerBox = Math.floor(parsedUnitsInBox);
    const unitCost = calculateUnitPrice(parsedBoxCost, safeUnitsPerBox);
    const unitSelling = calculateUnitPrice(parsedBoxSelling, safeUnitsPerBox);

    const payload: Omit<PharmacyItem, 'id'> & { id?: number } = {
      ...(editingId ? { id: editingId } : {}),
      name: trimmedName,
      barcode: trimmedBarcode,
      category: form.category.trim() || 'General',
      unitsPerBox: safeUnitsPerBox,
      boxCostPrice: parsedBoxCost,
      boxSellingPrice: parsedBoxSelling,
      costPrice: unitCost,
      sellingPrice: unitSelling,
      stockQuantity: Math.floor(parsedStock),
      unit: form.unit.trim() || 'Tablet',
      batchNumber: form.batchNumber.trim(),
      expiryDate: form.expiryDate || '2027-12-31',
    };

    try {
      onSaveItem(payload);
      if (!editingId) {
        setFilter('all');
        setSearch('');
      }
      setSaveSuccessMsg(
        editingId
          ? `Updated "${trimmedName}" (Unit price ${formatMoney(unitSelling, settings)}).`
          : `Added "${trimmedName}" (Unit price ${formatMoney(unitSelling, settings)}).`,
      );
      setFormError(null);
      setBannerDismissed(false);
      setIsModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Unable to save medicine to local storage.',
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {saveSuccessMsg && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <span>{saveSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setSaveSuccessMsg(null)}
            className="rounded p-1 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            aria-label="Dismiss confirmation"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Low Stock Notification Banner */}
      {lowStockItems.length > 0 && !bannerDismissed && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center dark:border-amber-800/70 dark:bg-amber-950/40"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                Low Stock Alert: {lowStockItems.length}{' '}
                {lowStockItems.length === 1 ? 'medicine is' : 'medicines are'}{' '}
                below {threshold} units
              </p>
              <p className="mt-0.5 text-xs text-amber-900 dark:text-amber-300/90">
                {lowStockItems
                  .slice(0, 4)
                  .map((i) => `${i.name} (${i.stockQuantity} ${i.unit})`)
                  .join(' · ')}
                {lowStockItems.length > 4
                  ? ` · +${lowStockItems.length - 4} more`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {filter !== 'low' && (
              <button
                type="button"
                onClick={() => setFilter('low')}
                className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 whitespace-nowrap hover:bg-amber-100/60 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/70"
              >
                Show Low Stock
              </button>
            )}
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="rounded-lg p-1.5 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
              aria-label="Dismiss low stock notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Valuation Metrics Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total SKUs
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
            {items.length}
          </p>
          <p className="mt-0.5 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
            {metrics.totalUnits} total units
          </p>
        </div>

        {!readOnly ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Stock Cost Value
              </p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatMoney(metrics.costValuation, settings)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Purchase basis
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Retail Value
              </p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-[#0D7A5F] dark:text-emerald-400">
                {formatMoney(metrics.retailValuation, settings)}
              </p>
              <p className="mt-0.5 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                Projected margin{' '}
                {formatMoney(
                  metrics.retailValuation - metrics.costValuation,
                  settings,
                )}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                In-Stock Units
              </p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-[#0D7A5F] dark:text-emerald-400">
                {metrics.totalUnits.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Available for dispensing
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                30-Day Expiry
              </p>
              <p
                className={`mt-1 font-mono-tabular text-2xl font-bold ${
                  expiry30TotalCount > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-[#0D7A5F] dark:text-emerald-400'
                }`}
              >
                {expiry30TotalCount}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Batches expiring soon
              </p>
            </div>
          </>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Low Stock Alerts
          </p>
          <p
            className={`mt-1 font-mono-tabular text-2xl font-bold ${
              metrics.lowStockCount > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-[#0D7A5F] dark:text-emerald-400'
            }`}
          >
            {metrics.lowStockCount}
          </p>
          <p className="mt-0.5 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
            Below {threshold} units
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-center dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by medicine name, barcode, or batch..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                { id: 'all', label: 'All Stock' },
                { id: 'low', label: `Low Stock (${lowStockItems.length})` },
                { id: 'expiring', label: `Expiring <= ${Math.max(1, nearExpiryDays)}d` },
                {
                  id: 'expiry30',
                  label: `30-Day Expiry Report (${expiry30TotalCount})`,
                },
              ] as { id: StockFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {!readOnly ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor="stock-threshold-input"
                className="text-xs font-medium text-slate-600 whitespace-nowrap dark:text-slate-400"
              >
                Alert Threshold (&lt;)
              </label>
              <input
                id="stock-threshold-input"
                type="number"
                min={1}
                max={9999}
                value={threshold}
                onChange={(e) => handleThresholdChange(e.target.value)}
                className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono-tabular text-xs font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          ) : (
            <span className="font-mono-tabular text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
              View-Only Access · Alert &lt; {threshold}
            </span>
          )}
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openImportModal}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportInventoryCsv}
              disabled={
                filter === 'expiry30'
                  ? expiry30ReportItems.length === 0
                  : filtered.length === 0
              }
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export to CSV</span>
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#0A634D]"
            >
              <Plus className="h-4 w-4" />
              <span>Add Medicine</span>
            </button>
          </div>
        )}
      </div>

      {/* 30-Day Expiry Report View OR Stock Data Table */}
      {filter === 'expiry30' ? (
        <section
          aria-labelledby="expiry-30-report-heading"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <div>
                <h2
                  id="expiry-30-report-heading"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  30-Day Approaching Expiry Report
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sorted by soonest expiration date ·{' '}
                  <span className="font-mono-tabular font-medium text-slate-700 dark:text-slate-300">
                    {expiry30ReportItems.length}{' '}
                    {expiry30ReportItems.length === 1 ? 'batch' : 'batches'}
                  </span>
                  {!readOnly && (
                    <>
                      {' '}
                      · At-risk cost value{' '}
                      <span className="font-mono-tabular font-semibold text-amber-800 dark:text-amber-400">
                        {formatMoney(expiry30RiskCost, settings)}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {!readOnly && (
              <button
                type="button"
                onClick={handleExportExpiryCsv}
                disabled={expiry30ReportItems.length === 0}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export to CSV</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Expiry Date</th>
                  <th className="px-4 py-3">Days Remaining</th>
                  <th className="px-4 py-3">Medicine & Category</th>
                  <th className="px-4 py-3">Batch Number</th>
                  <th className="px-4 py-3 text-right">Stock On Hand</th>
                  {!readOnly && (
                    <>
                      <th className="px-4 py-3 text-right">At-Risk Cost</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {expiry30ReportItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={readOnly ? 5 : 7}
                      className="px-4 py-12 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                      No medicines have an expiry date within the next 30 days.
                    </td>
                  </tr>
                ) : (
                  expiry30ReportItems.map(({ item, daysLeft }) => {
                    const urgent = daysLeft <= 14;
                    const riskValue = item.costPrice * item.stockQuantity;
                    return (
                      <tr
                        key={item.id}
                        className={
                          urgent
                            ? 'bg-red-50/60 hover:bg-red-50 dark:bg-red-950/35 dark:hover:bg-red-950/50'
                            : 'bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-950/30 dark:hover:bg-amber-950/45'
                        }
                      >
                        <td className="px-4 py-3 font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                          {item.expiryDate}
                        </td>
                        <td
                          className={`px-4 py-3 font-mono-tabular font-semibold ${
                            urgent
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-amber-800 dark:text-amber-400'
                          }`}
                        >
                          {daysLeft === 0
                            ? 'Expires today'
                            : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.name}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {item.category} · Barcode {item.barcode}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-mono-tabular text-slate-700 dark:text-slate-300">
                          {item.batchNumber}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                          {item.stockQuantity} {item.unit}
                        </td>
                        {!readOnly && (
                          <>
                            <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                              {formatMoney(riskValue, settings)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              >
                                Edit Batch
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Medicine & Batch</th>
                  <th className="px-3 py-3">Barcode</th>
                  <th className="px-3 py-3">Expiry</th>
                  <th className="px-3 py-3 text-right">Unit in Box</th>
                  {!readOnly && (
                    <th className="px-3 py-3 text-right">Box Cost</th>
                  )}
                  <th className="px-3 py-3 text-right">Box Selling</th>
                  {!readOnly && (
                    <th className="px-3 py-3 text-right">Unit Cost</th>
                  )}
                  <th className="px-3 py-3 text-right">Unit Selling</th>
                  <th className="px-3 py-3 text-right">Stock (Units)</th>
                  {!readOnly && (
                    <th className="px-4 py-3 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={readOnly ? 7 : 10}
                      className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                      No medicines match the active search or stock filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const isOut = item.stockQuantity === 0;
                    const isBelowThreshold = item.stockQuantity < threshold;
                    const exp = isExpiringSoon(item.expiryDate);
                    return (
                      <tr
                        key={item.id}
                        className={
                          isOut
                            ? 'bg-red-50/70 hover:bg-red-50 dark:bg-red-950/35 dark:hover:bg-red-950/50'
                            : isBelowThreshold
                              ? 'bg-amber-50/70 hover:bg-amber-50 dark:bg-amber-950/30 dark:hover:bg-amber-950/45'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                        }
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.name}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {item.category} · Batch {item.batchNumber}
                          </p>
                        </td>
                        <td className="px-3 py-3 font-mono-tabular text-slate-600 dark:text-slate-400">
                          {item.barcode}
                        </td>
                        <td
                          className={`px-3 py-3 font-mono-tabular ${
                            exp
                              ? 'font-semibold text-amber-700 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {item.expiryDate}
                          {exp ? ' (Soon)' : ''}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                          {item.unitsPerBox} {item.unit}
                          {item.unitsPerBox === 1 ? '' : 's'}
                        </td>
                        {!readOnly && (
                          <td className="px-3 py-3 text-right font-mono-tabular text-slate-600 dark:text-slate-400">
                            {formatMoney(item.boxCostPrice, settings)}
                          </td>
                        )}
                        <td className="px-3 py-3 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                          {formatMoney(item.boxSellingPrice, settings)}
                        </td>
                        {!readOnly && (
                          <td className="px-3 py-3 text-right font-mono-tabular text-slate-600 dark:text-slate-400">
                            {formatMoney(item.costPrice, settings)}
                          </td>
                        )}
                        <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                          {formatMoney(item.sellingPrice, settings)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <p
                            className={`font-mono-tabular font-semibold ${
                              isOut
                                ? 'text-red-700 dark:text-red-400'
                                : isBelowThreshold
                                  ? 'text-amber-800 dark:text-amber-400'
                                  : 'text-[#0D7A5F] dark:text-emerald-400'
                            }`}
                          >
                            {item.stockQuantity} {item.unit}
                            {item.stockQuantity === 1 ? '' : 's'}
                          </p>
                          {isOut ? (
                            <p className="text-[11px] font-medium text-red-700 dark:text-red-400">
                              Out of Stock
                            </p>
                          ) : isBelowThreshold ? (
                            <p className="text-[11px] font-medium text-amber-800 dark:text-amber-400">
                              Low Stock (&lt; {threshold})
                            </p>
                          ) : null}
                        </td>
                        {!readOnly && (
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                aria-label={`Edit ${item.name}`}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteItem(item.id)}
                                className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                                aria-label={`Delete ${item.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal (Admin Only) */}
      {!readOnly && isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/70"
          role="dialog"
          aria-modal="true"
        >
          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? 'Edit Medicine Item' : 'Add New Medicine'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {formError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Medicine Name *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Panadol 500mg Tablets"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Barcode (optional)
                  </label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(e) =>
                      setForm({ ...form, barcode: e.target.value })
                    }
                    placeholder="Auto-generated if blank"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Category
                  </label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    placeholder="e.g. Analgesics"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* Box-to-Unit Pricing Sequence: 1. Unit in Box -> 2. Box Cost -> 3. Box Selling -> Auto Per Unit */}
                <div className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      1. Unit in Box *
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.unitsPerBox}
                      onChange={(e) =>
                        setForm({ ...form, unitsPerBox: e.target.value })
                      }
                      placeholder="e.g. 100"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      2. Cost Price of Box ({cur})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.boxCostPrice}
                      onChange={(e) =>
                        setForm({ ...form, boxCostPrice: e.target.value })
                      }
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      3. Selling Price of Box ({cur})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.boxSellingPrice}
                      onChange={(e) =>
                        setForm({ ...form, boxSellingPrice: e.target.value })
                      }
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="sm:col-span-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-2.5 text-xs dark:border-slate-700">
                    <div>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        Auto Per-Unit Cost ({form.unit || 'Unit'})
                      </span>
                      <span className="font-mono-tabular text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(autoUnitCostPreview, settings)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        Auto Per-Unit Selling ({form.unit || 'Unit'})
                      </span>
                      <span className="font-mono-tabular text-sm font-bold text-[#0D7A5F] dark:text-emerald-400">
                        {formatMoney(autoUnitSellingPreview, settings)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Unit Type (Tablet / Capsule / Bottle)
                  </label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="Tablet"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Stock Quantity (Units)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.stockQuantity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stockQuantity: e.target.value,
                      })
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Batch Number (optional)
                  </label>
                  <input
                    type="text"
                    value={form.batchNumber}
                    onChange={(e) =>
                      setForm({ ...form, batchNumber: e.target.value })
                    }
                    placeholder="Auto-generated if blank"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) =>
                      setForm({ ...form, expiryDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3.5 dark:border-slate-800 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A634D]"
              >
                {editingId ? 'Save Changes' : 'Add to Inventory'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Import Products from CSV Modal (Admin Only) */}
      {!readOnly && isImportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-csv-modal-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-5 w-5 text-[#0D7A5F] dark:text-emerald-400" />
                <div>
                  <h3
                    id="import-csv-modal-title"
                    className="text-base font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Import Products from CSV
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Upload an exported inventory CSV or a custom spreadsheet to
                    bulk-add or update medicines
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Close CSV import dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
              {importError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {importError}
                </div>
              )}

              {/* Upload & Template Bar */}
              <div className="flex flex-col justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-800/50">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {importFileName
                      ? `Selected file: ${importFileName}`
                      : 'Choose a .csv file to preview and validate'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Columns: Medicine Name*, Category, Barcode, Batch Number,
                    Expiry Date, Units Per Box, Unit, Box Cost ({csvCur}), Box
                    Selling ({csvCur}), Stock Quantity
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void handleCsvFileSelected(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleDownloadImportTemplate}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Sample Template</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg bg-[#0D7A5F] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D]"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>
                      {importParseResult ? 'Choose Different CSV' : 'Select CSV File'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Duplicate Handling Strategy */}
              <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Existing Product Match Rule
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Matches existing inventory by Barcode, or Medicine Name +
                    Batch Number
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setImportStrategy('update')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      importStrategy === 'update'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    Update Existing &amp; Add New
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportStrategy('skip')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      importStrategy === 'skip'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    Skip Duplicates
                  </button>
                </div>
              </div>

              {/* Parsed Preview */}
              {importParseResult && (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        New Products
                      </p>
                      <p className="font-mono-tabular text-lg font-bold text-[#0D7A5F] dark:text-emerald-400">
                        {importPreviewSummary.newCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Will Update
                      </p>
                      <p className="font-mono-tabular text-lg font-bold text-slate-900 dark:text-slate-100">
                        {importPreviewSummary.updateCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Skipped Duplicates
                      </p>
                      <p className="font-mono-tabular text-lg font-bold text-amber-700 dark:text-amber-400">
                        {importPreviewSummary.skipCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Invalid Rows
                      </p>
                      <p
                        className={`font-mono-tabular text-lg font-bold ${
                          importPreviewSummary.errorCount > 0
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {importPreviewSummary.errorCount}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-2">Row</th>
                            <th className="px-3 py-2">Medicine &amp; Category</th>
                            <th className="px-3 py-2 text-right">Box Units</th>
                            <th className="px-3 py-2 text-right">Box Sell</th>
                            <th className="px-3 py-2 text-right">Unit Sell</th>
                            <th className="px-3 py-2 text-right">Stock</th>
                            <th className="px-3 py-2">Expiry</th>
                            <th className="px-3 py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {importParseResult.rows.map((row, idx) => {
                            const action = importPreviewSummary.rowActions[idx];
                            return (
                              <tr
                                key={`${row.rowNumber}-${idx}`}
                                className={
                                  action === 'error'
                                    ? 'bg-red-50/70 dark:bg-red-950/30'
                                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                                }
                              >
                                <td className="px-3 py-2 font-mono-tabular text-slate-500 dark:text-slate-400">
                                  #{row.rowNumber}
                                </td>
                                <td className="px-3 py-2">
                                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                                    {row.name || '(Missing Name)'}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {row.category}
                                    {row.barcode ? ` · ${row.barcode}` : ''}
                                    {row.batchNumber
                                      ? ` · Batch ${row.batchNumber}`
                                      : ''}
                                  </p>
                                  {row.error && (
                                    <p className="mt-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">
                                      {row.error}
                                    </p>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                                  {row.unitsPerBox} {row.unit}
                                </td>
                                <td className="px-3 py-2 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                                  {formatMoney(row.boxSellingPrice, settings)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                                  {formatMoney(row.sellingPrice, settings)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono-tabular text-slate-800 dark:text-slate-200">
                                  {row.stockQuantity}
                                </td>
                                <td className="px-3 py-2 font-mono-tabular text-slate-600 dark:text-slate-400">
                                  {row.expiryDate}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                                  {action === 'new' && (
                                    <span className="text-[#0D7A5F] dark:text-emerald-400">
                                      Add New
                                    </span>
                                  )}
                                  {action === 'update' && (
                                    <span className="text-sky-700 dark:text-sky-400">
                                      Update
                                    </span>
                                  )}
                                  {action === 'skip' && (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      Skip
                                    </span>
                                  )}
                                  {action === 'error' && (
                                    <span className="text-red-700 dark:text-red-400">
                                      Invalid
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 dark:border-slate-800 dark:bg-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Unit Cost &amp; Unit Selling are auto-calculated from Box
                Prices ÷ Units Per Box.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    !importParseResult ||
                    importPreviewSummary.newCount +
                      importPreviewSummary.updateCount ===
                      0
                  }
                  onClick={handleConfirmCsvImport}
                  className="flex items-center gap-1.5 rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A634D] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>
                    Import{' '}
                    {importPreviewSummary.newCount +
                      importPreviewSummary.updateCount}{' '}
                    {importPreviewSummary.newCount +
                      importPreviewSummary.updateCount ===
                    1
                      ? 'Product'
                      : 'Products'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
