import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Download,
  Edit2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { PharmacyItem } from '../types/pharmacy';
import { calculateUnitPrice } from '../services/localDb';

interface InventoryWorkspaceProps {
  items: PharmacyItem[];
  onSaveItem: (item: Omit<PharmacyItem, 'id'> & { id?: number }) => void;
  onDeleteItem: (id: number) => void;
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
  onSaveItem,
  onDeleteItem,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [threshold, setThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(THRESHOLD_STORAGE_KEY);
      const parsed = saved ? Number(saved) : 10;
      return Number.isFinite(parsed) && parsed >= 1 ? parsed : 10;
    } catch {
      return 10;
    }
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<MedicineFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

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
    return days !== null && days <= 90;
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
    const header = [
      'Expiry Date',
      'Days Remaining',
      'Medicine Name',
      'Category',
      'Batch Number',
      'Stock Quantity',
      'Unit',
      'Cost Value (PKR)',
    ];
    const rows = expiry30ReportItems.map(({ item, daysLeft }) => [
      item.expiryDate,
      String(daysLeft),
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.category.replace(/"/g, '""')}"`,
      item.batchNumber,
      String(item.stockQuantity),
      item.unit,
      (item.costPrice * item.stockQuantity).toFixed(2),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinix_30day_expiry_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
    const parsed = Math.max(1, Math.floor(Number(raw) || 1));
    setThreshold(parsed);
    setBannerDismissed(false);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: PharmacyItem) => {
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
          ? `Updated "${trimmedName}" (Unit price PKR ${unitSelling.toFixed(2)}).`
          : `Added "${trimmedName}" (Unit price PKR ${unitSelling.toFixed(2)}).`,
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
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900"
        >
          <span>{saveSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setSaveSuccessMsg(null)}
            className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
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
          className="flex flex-col justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                Low Stock Alert: {lowStockItems.length}{' '}
                {lowStockItems.length === 1 ? 'medicine is' : 'medicines are'}{' '}
                below {threshold} units
              </p>
              <p className="mt-0.5 text-xs text-amber-900">
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
                className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 whitespace-nowrap hover:bg-amber-100/60"
              >
                Show Low Stock
              </button>
            )}
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="rounded-lg p-1.5 text-amber-800 hover:bg-amber-100"
              aria-label="Dismiss low stock notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Valuation Metrics Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total SKUs</p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">
            {items.length}
          </p>
          <p className="mt-0.5 font-mono-tabular text-xs text-slate-500">
            {metrics.totalUnits} total units
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Stock Cost Value</p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">
            PKR {metrics.costValuation.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Purchase basis</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Retail Value</p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-[#0D7A5F]">
            PKR {metrics.retailValuation.toLocaleString()}
          </p>
          <p className="mt-0.5 font-mono-tabular text-xs text-slate-500">
            Projected margin PKR{' '}
            {(metrics.retailValuation - metrics.costValuation).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Low Stock Alerts</p>
          <p
            className={`mt-1 font-mono-tabular text-2xl font-bold ${
              metrics.lowStockCount > 0 ? 'text-amber-700' : 'text-[#0D7A5F]'
            }`}
          >
            {metrics.lowStockCount}
          </p>
          <p className="mt-0.5 font-mono-tabular text-xs text-slate-500">
            Below {threshold} units
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by medicine name, barcode, or batch..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-[#0D7A5F] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'All Stock' },
                { id: 'low', label: `Low Stock (${lowStockItems.length})` },
                { id: 'expiring', label: 'Expiring <= 90d' },
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
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="stock-threshold-input"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
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
              className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-right font-mono-tabular text-xs font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#0A634D]"
        >
          <Plus className="h-4 w-4" />
          <span>Add Medicine</span>
        </button>
      </div>

      {/* 30-Day Expiry Report View OR Stock Data Table */}
      {filter === 'expiry30' ? (
        <section
          aria-labelledby="expiry-30-report-heading"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <h2
                  id="expiry-30-report-heading"
                  className="text-base font-semibold text-slate-900"
                >
                  30-Day Approaching Expiry Report
                </h2>
                <p className="text-xs text-slate-500">
                  Sorted by soonest expiration date ·{' '}
                  <span className="font-mono-tabular font-medium text-slate-700">
                    {expiry30ReportItems.length}{' '}
                    {expiry30ReportItems.length === 1 ? 'batch' : 'batches'}
                  </span>{' '}
                  · At-risk cost value{' '}
                  <span className="font-mono-tabular font-semibold text-amber-800">
                    PKR {expiry30RiskCost.toLocaleString()}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportExpiryCsv}
              disabled={expiry30ReportItems.length === 0}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Expiry Date</th>
                  <th className="px-4 py-3">Days Remaining</th>
                  <th className="px-4 py-3">Medicine & Category</th>
                  <th className="px-4 py-3">Batch Number</th>
                  <th className="px-4 py-3 text-right">Stock On Hand</th>
                  <th className="px-4 py-3 text-right">At-Risk Cost</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {expiry30ReportItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-xs text-slate-500"
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
                            ? 'bg-red-50/60 hover:bg-red-50'
                            : 'bg-amber-50/50 hover:bg-amber-50'
                        }
                      >
                        <td className="px-4 py-3 font-mono-tabular font-semibold text-slate-900">
                          {item.expiryDate}
                        </td>
                        <td
                          className={`px-4 py-3 font-mono-tabular font-semibold ${
                            urgent ? 'text-red-700' : 'text-amber-800'
                          }`}
                        >
                          {daysLeft === 0
                            ? 'Expires today'
                            : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-slate-500">
                            {item.category} · Barcode {item.barcode}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-mono-tabular text-slate-700">
                          {item.batchNumber}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-slate-900">
                          {item.stockQuantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-slate-900">
                          PKR {riskValue.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Edit Batch
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Medicine & Batch</th>
                  <th className="px-3 py-3">Barcode</th>
                  <th className="px-3 py-3">Expiry</th>
                  <th className="px-3 py-3 text-right">Unit in Box</th>
                  <th className="px-3 py-3 text-right">Box Cost</th>
                  <th className="px-3 py-3 text-right">Box Selling</th>
                  <th className="px-3 py-3 text-right">Unit Cost</th>
                  <th className="px-3 py-3 text-right">Unit Selling</th>
                  <th className="px-3 py-3 text-right">Stock (Units)</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-xs text-slate-500"
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
                            ? 'bg-red-50/70 hover:bg-red-50'
                            : isBelowThreshold
                              ? 'bg-amber-50/70 hover:bg-amber-50'
                              : 'hover:bg-slate-50/70'
                        }
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-slate-500">
                            {item.category} · Batch {item.batchNumber}
                          </p>
                        </td>
                        <td className="px-3 py-3 font-mono-tabular text-slate-600">
                          {item.barcode}
                        </td>
                        <td
                          className={`px-3 py-3 font-mono-tabular ${
                            exp ? 'font-semibold text-amber-700' : 'text-slate-600'
                          }`}
                        >
                          {item.expiryDate}
                          {exp ? ' (Soon)' : ''}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular text-slate-700">
                          {item.unitsPerBox} {item.unit}
                          {item.unitsPerBox === 1 ? '' : 's'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular text-slate-600">
                          {item.boxCostPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular text-slate-700">
                          {item.boxSellingPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular text-slate-600">
                          {item.costPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-[#0D7A5F]">
                          {item.sellingPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <p
                            className={`font-mono-tabular font-semibold ${
                              isOut
                                ? 'text-red-700'
                                : isBelowThreshold
                                  ? 'text-amber-800'
                                  : 'text-[#0D7A5F]'
                            }`}
                          >
                            {item.stockQuantity} {item.unit}
                            {item.stockQuantity === 1 ? '' : 's'}
                          </p>
                          {isOut ? (
                            <p className="text-[11px] font-medium text-red-700">
                              Out of Stock
                            </p>
                          ) : isBelowThreshold ? (
                            <p className="text-[11px] font-medium text-amber-800">
                              Low Stock (&lt; {threshold})
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              aria-label={`Edit ${item.name}`}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteItem(item.id)}
                              className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                              aria-label={`Delete ${item.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingId ? 'Edit Medicine Item' : 'Add New Medicine'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {formError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Medicine Name *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Panadol 500mg Tablets"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#0D7A5F] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Barcode (optional)
                  </label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(e) =>
                      setForm({ ...form, barcode: e.target.value })
                    }
                    placeholder="Auto-generated if blank"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Category
                  </label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    placeholder="e.g. Analgesics"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#0D7A5F] focus:outline-none"
                  />
                </div>

                {/* Box-to-Unit Pricing Sequence: 1. Unit in Box -> 2. Box Cost -> 3. Box Selling -> Auto Per Unit */}
                <div className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
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
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      2. Cost Price of Box (PKR)
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
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      3. Selling Price of Box (PKR)
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
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-2.5 text-xs">
                    <div>
                      <span className="block text-[11px] text-slate-500">
                        Auto Per-Unit Cost ({form.unit || 'Unit'})
                      </span>
                      <span className="font-mono-tabular text-sm font-semibold text-slate-900">
                        PKR {autoUnitCostPreview.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-500">
                        Auto Per-Unit Selling ({form.unit || 'Unit'})
                      </span>
                      <span className="font-mono-tabular text-sm font-bold text-[#0D7A5F]">
                        PKR {autoUnitSellingPreview.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Unit Type (Tablet / Capsule / Bottle)
                  </label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="Tablet"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#0D7A5F] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Batch Number (optional)
                  </label>
                  <input
                    type="text"
                    value={form.batchNumber}
                    onChange={(e) =>
                      setForm({ ...form, batchNumber: e.target.value })
                    }
                    placeholder="Auto-generated if blank"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) =>
                      setForm({ ...form, expiryDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
    </div>
  );
};
