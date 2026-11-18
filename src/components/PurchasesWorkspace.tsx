import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {
  Party,
  PaymentMode,
  PharmacyItem,
  PurchaseDraftLine,
  PurchaseRecord,
} from '../types/pharmacy';

interface PurchasesWorkspaceProps {
  items: PharmacyItem[];
  parties: Party[];
  purchases: PurchaseRecord[];
  onCompletePurchase: (params: {
    supplier: Party;
    supplierInvoiceNo: string;
    lines: PurchaseDraftLine[];
    paidAmount: number;
    paymentMode: PaymentMode;
  }) => void;
  onAddSupplier: (supplier: {
    name: string;
    phone: string;
    balance: number;
  }) => Party;
  onSettleSupplierBalance: (supplierId: number, amount: number) => void;
}

type SubView = 'bills' | 'suppliers';

export const PurchasesWorkspace: React.FC<PurchasesWorkspaceProps> = ({
  items,
  parties,
  purchases,
  onCompletePurchase,
  onAddSupplier,
  onSettleSupplierBalance,
}) => {
  const [subView, setSubView] = useState<SubView>('bills');
  const [search, setSearch] = useState('');
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<number | null>(
    purchases[0]?.id ?? null,
  );

  // Purchase Entry Modal State
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    'Credit/Party Ledger',
  );
  const [paidAmountInput, setPaidAmountInput] = useState('0');
  const [draftLines, setDraftLines] = useState<PurchaseDraftLine[]>([]);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // Line Entry State inside Purchase Modal
  const [isNewSkuMode, setIsNewSkuMode] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number>(
    items[0]?.id ?? 0,
  );
  const [lineName, setLineName] = useState(items[0]?.name ?? '');
  const [lineBarcode, setLineBarcode] = useState(items[0]?.barcode ?? '');
  const [lineCategory, setLineCategory] = useState(
    items[0]?.category ?? 'General',
  );
  const [lineUnit, setLineUnit] = useState(items[0]?.unit ?? 'Pack');
  const [lineBatch, setLineBatch] = useState(items[0]?.batchNumber ?? '');
  const [lineExpiry, setLineExpiry] = useState(
    items[0]?.expiryDate ?? '2027-12-31',
  );
  const [lineQty, setLineQty] = useState('10');
  const [lineCost, setLineCost] = useState(
    String(items[0]?.costPrice ?? 0),
  );
  const [lineSelling, setLineSelling] = useState(
    String(items[0]?.sellingPrice ?? 0),
  );

  // Add Supplier Modal & Settle Supplier Modal
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupBalance, setNewSupBalance] = useState('0');

  const [settleTarget, setSettleTarget] = useState<Party | null>(null);
  const [settleAmount, setSettleAmount] = useState('');

  const suppliers = useMemo(
    () => parties.filter((p) => p.type === 'supplier'),
    [parties],
  );

  const metrics = useMemo(() => {
    const totalPurchased = purchases.reduce((s, p) => s + p.totalAmount, 0);
    const totalToPay = suppliers.reduce((s, sup) => s + sup.balance, 0);
    const unitsReceived = purchases.reduce(
      (s, p) => s + p.items.reduce((ls, l) => ls + l.quantity, 0),
      0,
    );
    return {
      totalPurchased,
      totalToPay,
      unitsReceived,
      supplierCount: suppliers.length,
    };
  }, [purchases, suppliers]);

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(
      (p) =>
        p.purchaseNumber.toLowerCase().includes(q) ||
        p.supplierInvoiceNo.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q),
    );
  }, [purchases, search]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.phone.toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  const supplierVolumeMap = useMemo(() => {
    const map = new Map<number, { count: number; total: number }>();
    for (const p of purchases) {
      const prev = map.get(p.supplierId) ?? { count: 0, total: 0 };
      map.set(p.supplierId, {
        count: prev.count + 1,
        total: prev.total + p.totalAmount,
      });
    }
    return map;
  }, [purchases]);

  const populateLineFromInventoryItem = (itemId: number) => {
    setSelectedItemId(itemId);
    const found = items.find((i) => i.id === itemId);
    if (!found) return;
    setLineName(found.name);
    setLineBarcode(found.barcode);
    setLineCategory(found.category);
    setLineUnit(found.unit);
    setLineBatch(found.batchNumber);
    setLineExpiry(found.expiryDate);
    setLineCost(String(found.costPrice));
    setLineSelling(String(found.sellingPrice));
  };

  const openPurchaseModal = (preselectedSupplierId?: number) => {
    const defaultSupId =
      preselectedSupplierId ?? suppliers[0]?.id ?? '';
    setSelectedSupplierId(defaultSupId);
    setSupplierInvoiceNo('');
    setPaymentMode('Credit/Party Ledger');
    setPaidAmountInput('0');
    setDraftLines([]);
    setPurchaseError(null);
    setIsNewSkuMode(false);
    if (items[0]) {
      populateLineFromInventoryItem(items[0].id);
    }
    setLineQty('10');
    setIsPurchaseModalOpen(true);
  };

  const handleAddDraftLine = () => {
    const qty = Math.max(0, Math.floor(Number(lineQty) || 0));
    const cost = Math.max(0, Number(lineCost) || 0);
    const selling = Math.max(0, Number(lineSelling) || 0);

    if (!lineName.trim()) {
      setPurchaseError('Enter a medicine name before adding the line.');
      return;
    }
    if (qty <= 0) {
      setPurchaseError('Purchase quantity must be at least 1.');
      return;
    }

    setPurchaseError(null);
    const newLine: PurchaseDraftLine = {
      itemId: isNewSkuMode ? null : selectedItemId || null,
      itemName: lineName.trim(),
      barcode: lineBarcode.trim(),
      category: lineCategory.trim() || 'General',
      unit: lineUnit.trim() || 'Pack',
      batchNumber: lineBatch.trim(),
      expiryDate: lineExpiry,
      quantity: qty,
      unitCost: cost,
      sellingPrice: selling,
    };

    setDraftLines((prev) => [...prev, newLine]);
    if (isNewSkuMode) {
      setLineName('');
      setLineBarcode('');
      setLineBatch('');
    }
  };

  const draftTotalAmount = draftLines.reduce(
    (sum, l) => sum + l.unitCost * l.quantity,
    0,
  );

  const handlePaymentModeChange = (mode: PaymentMode) => {
    setPaymentMode(mode);
    if (mode === 'Credit/Party Ledger') {
      setPaidAmountInput('0');
    } else {
      setPaidAmountInput(String(draftTotalAmount));
    }
  };

  const parsedPaidAmount = Math.min(
    Math.max(0, Number(paidAmountInput) || 0),
    draftTotalAmount,
  );
  const draftBalanceDue = Math.max(0, draftTotalAmount - parsedPaidAmount);

  const handleSubmitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = suppliers.find((s) => s.id === Number(selectedSupplierId));
    if (!supplier) {
      setPurchaseError('Select or add a supplier first.');
      return;
    }
    if (draftLines.length === 0) {
      setPurchaseError('Add at least one medicine line to the purchase bill.');
      return;
    }

    try {
      onCompletePurchase({
        supplier,
        supplierInvoiceNo,
        lines: draftLines,
        paidAmount: parsedPaidAmount,
        paymentMode,
      });
      setIsPurchaseModalOpen(false);
    } catch (err) {
      setPurchaseError(
        err instanceof Error ? err.message : 'Unable to save purchase.',
      );
    }
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim()) return;
    const created = onAddSupplier({
      name: newSupName.trim(),
      phone: newSupPhone.trim(),
      balance: Math.max(0, Number(newSupBalance) || 0),
    });
    setSelectedSupplierId(created.id);
    setNewSupName('');
    setNewSupPhone('');
    setNewSupBalance('0');
    setIsSupplierModalOpen(false);
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTarget) return;
    const amt = Math.max(0, Number(settleAmount) || 0);
    if (amt > 0) {
      onSettleSupplierBalance(settleTarget.id, amt);
    }
    setSettleTarget(null);
    setSettleAmount('');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Total Purchases
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">
            PKR {metrics.totalPurchased.toLocaleString()}
          </p>
          <p className="mt-0.5 font-mono-tabular text-xs text-slate-500">
            {purchases.length} distributor bills
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Supplier Payables (To Pay)
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-amber-700">
            PKR {metrics.totalToPay.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Outstanding distributor dues
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Stock Units Received
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-[#0D7A5F]">
            {metrics.unitsReceived.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Auto-added to inventory
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Active Suppliers
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">
            {metrics.supplierCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Wholesale & pharma distributors
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSubView('bills')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                subView === 'bills'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Purchase Bills ({purchases.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('suppliers')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                subView === 'suppliers'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Suppliers ({suppliers.length})
            </button>
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                subView === 'bills'
                  ? 'Search purchase #, supplier invoice, or distributor...'
                  : 'Search supplier name or phone...'
              }
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-[#0D7A5F] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsSupplierModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Supplier</span>
          </button>
          <button
            type="button"
            onClick={() => openPurchaseModal()}
            className="flex items-center gap-2 rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D]"
          >
            <Truck className="h-4 w-4" />
            <span>Record Purchase</span>
          </button>
        </div>
      </div>

      {/* Purchase Bills Table */}
      {subView === 'bills' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Purchase / Supplier Inv</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Payment Mode</th>
                  <th className="px-4 py-3 text-right">Total Bill</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No purchase bills recorded yet. Click "Record Purchase" to
                      restock inventory.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((pur) => {
                    const isExpanded = expandedPurchaseId === pur.id;
                    return (
                      <React.Fragment key={pur.id}>
                        <tr
                          onClick={() =>
                            setExpandedPurchaseId(isExpanded ? null : pur.id)
                          }
                          className="cursor-pointer hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                              )}
                              <div>
                                <p className="font-mono-tabular font-semibold text-slate-900">
                                  {pur.purchaseNumber}
                                </p>
                                <p className="font-mono-tabular text-[11px] text-slate-500">
                                  Inv: {pur.supplierInvoiceNo} ·{' '}
                                  {new Date(pur.createdAt).toLocaleDateString(
                                    'en-PK',
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">
                              {pur.supplierName}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {pur.items.length}{' '}
                              {pur.items.length === 1 ? 'line' : 'lines'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {pur.paymentMode}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-slate-900">
                            PKR {pur.totalAmount.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-tabular text-slate-600">
                            PKR {pur.paidAmount.toFixed(2)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono-tabular font-semibold ${
                              pur.balanceDue > 0
                                ? 'text-amber-700'
                                : 'text-[#0D7A5F]'
                            }`}
                          >
                            {pur.balanceDue > 0
                              ? `PKR ${pur.balanceDue.toFixed(2)}`
                              : 'Paid'}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={6} className="px-8 py-3">
                              <table className="w-full text-left text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-500">
                                    <th className="py-1.5 font-medium">
                                      Received Medicine
                                    </th>
                                    <th className="py-1.5 font-medium">
                                      Batch / Expiry
                                    </th>
                                    <th className="py-1.5 text-right font-medium">
                                      Qty
                                    </th>
                                    <th className="py-1.5 text-right font-medium">
                                      Unit Cost
                                    </th>
                                    <th className="py-1.5 text-right font-medium">
                                      Line Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200/70">
                                  {pur.items.map((line) => (
                                    <tr key={line.id}>
                                      <td className="py-2 font-medium text-slate-900">
                                        {line.itemName}
                                      </td>
                                      <td className="py-2 font-mono-tabular text-slate-600">
                                        {line.batchNumber} · Exp{' '}
                                        {line.expiryDate}
                                      </td>
                                      <td className="py-2 text-right font-mono-tabular text-slate-900">
                                        {line.quantity}
                                      </td>
                                      <td className="py-2 text-right font-mono-tabular text-slate-600">
                                        {line.unitCost.toFixed(2)}
                                      </td>
                                      <td className="py-2 text-right font-mono-tabular font-semibold text-slate-900">
                                        PKR {line.lineTotal.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Suppliers Directory Table */
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Supplier / Distributor</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3 text-right">Purchase Bills</th>
                  <th className="px-5 py-3 text-right">Total Purchased</th>
                  <th className="px-5 py-3 text-right">To Pay</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center text-slate-500"
                    >
                      No suppliers match "{search}".
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((sup) => {
                    const stats = supplierVolumeMap.get(sup.id) ?? {
                      count: 0,
                      total: 0,
                    };
                    return (
                      <tr key={sup.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3.5 font-semibold text-slate-900">
                          {sup.name}
                        </td>
                        <td className="px-5 py-3.5 font-mono-tabular text-slate-600">
                          {sup.phone || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono-tabular text-slate-700">
                          {stats.count}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono-tabular text-slate-700">
                          PKR {stats.total.toFixed(2)}
                        </td>
                        <td
                          className={`px-5 py-3.5 text-right font-mono-tabular font-semibold ${
                            sup.balance > 0
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          PKR {sup.balance.toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openPurchaseModal(sup.id)}
                              className="rounded-lg bg-[#0D7A5F] px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D]"
                            >
                              New Purchase
                            </button>
                            {sup.balance > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSettleTarget(sup);
                                  setSettleAmount(String(sup.balance));
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 whitespace-nowrap hover:bg-slate-50"
                              >
                                Pay Balance
                              </button>
                            )}
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

      {/* Record Purchase / Stock-In Modal */}
      {isPurchaseModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-purchase-title"
        >
          <form
            onSubmit={handleSubmitPurchase}
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3
                  id="record-purchase-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Record Supplier Purchase & Stock-In
                </h3>
                <p className="text-xs text-slate-500">
                  Automatically updates inventory quantities, batch details, and
                  supplier payables.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPurchaseModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {purchaseError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {purchaseError}
                </div>
              )}

              {/* Supplier & Invoice Header */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700">
                      Supplier / Distributor
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsSupplierModalOpen(true)}
                      className="text-xs font-semibold text-[#0D7A5F] hover:underline"
                    >
                      + New Supplier
                    </button>
                  </div>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) =>
                      setSelectedSupplierId(Number(e.target.value))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                  >
                    {suppliers.length === 0 && (
                      <option value="">No suppliers added yet</option>
                    )}
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (To Pay: PKR {s.balance.toFixed(0)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Supplier Invoice / Challan #
                  </label>
                  <input
                    type="text"
                    value={supplierInvoiceNo}
                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                    placeholder="e.g. MP-LHR-90412"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                  />
                </div>
              </div>

              {/* Add Medicine Line Builder */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">
                    Add Medicine Line
                  </span>
                  <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewSkuMode(false);
                        if (items[0]) populateLineFromInventoryItem(items[0].id);
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        !isNewSkuMode
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      Existing Medicine
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewSkuMode(true);
                        setLineName('');
                        setLineBarcode('');
                        setLineBatch('');
                        setLineCost('0');
                        setLineSelling('0');
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        isNewSkuMode
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      New Medicine SKU
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  {!isNewSkuMode ? (
                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-[11px] font-medium text-slate-600">
                        Select Medicine
                      </label>
                      <select
                        value={selectedItemId}
                        onChange={(e) =>
                          populateLineFromInventoryItem(Number(e.target.value))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                      >
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name} (Stock: {it.stockQuantity} {it.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-[11px] font-medium text-slate-600">
                          New Medicine Name
                        </label>
                        <input
                          type="text"
                          value={lineName}
                          onChange={(e) => setLineName(e.target.value)}
                          placeholder="e.g. Zestril 10mg (28s)"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0D7A5F] focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="mb-1 block text-[11px] font-medium text-slate-600">
                          Unit
                        </label>
                        <input
                          type="text"
                          value={lineUnit}
                          onChange={(e) => setLineUnit(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs focus:border-[#0D7A5F] focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">
                      Quantity Received
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={lineQty}
                      onChange={(e) => setLineQty(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-xs focus:border-[#0D7A5F] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">
                      Unit Cost (PKR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={lineCost}
                      onChange={(e) => setLineCost(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-xs focus:border-[#0D7A5F] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">
                      Selling Price (PKR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={lineSelling}
                      onChange={(e) => setLineSelling(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-xs focus:border-[#0D7A5F] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">
                      Batch #
                    </label>
                    <input
                      type="text"
                      value={lineBatch}
                      onChange={(e) => setLineBatch(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono-tabular text-xs focus:border-[#0D7A5F] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">
                      Expiry
                    </label>
                    <input
                      type="date"
                      value={lineExpiry}
                      onChange={(e) => setLineExpiry(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 font-mono-tabular text-xs focus:border-[#0D7A5F] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddDraftLine}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Line to Bill</span>
                  </button>
                </div>
              </div>

              {/* Draft Lines Table */}
              {draftLines.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Medicine</th>
                        <th className="px-3 py-2">Batch / Exp</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Cost</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {draftLines.map((line, idx) => (
                        <tr key={`${line.itemName}-${idx}`}>
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {line.itemName}
                          </td>
                          <td className="px-3 py-2 font-mono-tabular text-slate-500">
                            {line.batchNumber || '—'} · {line.expiryDate}
                          </td>
                          <td className="px-3 py-2 text-right font-mono-tabular">
                            {line.quantity}
                          </td>
                          <td className="px-3 py-2 text-right font-mono-tabular">
                            {line.unitCost.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono-tabular font-semibold">
                            {(line.unitCost * line.quantity).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setDraftLines((prev) =>
                                  prev.filter((_, i) => i !== idx),
                                )
                              }
                              className="rounded p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment & Totals */}
              <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Payment Mode
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) =>
                      handlePaymentModeChange(e.target.value as PaymentMode)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#0D7A5F] focus:outline-none"
                  >
                    <option value="Credit/Party Ledger">
                      Credit/Supplier Ledger
                    </option>
                    <option value="Cash">Cash</option>
                    <option value="Mobile Transfer">Mobile Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Paid Amount (PKR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={draftTotalAmount}
                    step="0.01"
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Bill</span>
                    <span className="font-mono-tabular font-bold text-slate-900">
                      PKR {draftTotalAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-amber-800">
                    <span>Added to To Pay</span>
                    <span className="font-mono-tabular font-semibold">
                      PKR {draftBalanceDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setIsPurchaseModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={draftLines.length === 0}
                className="rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A634D] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Save Purchase & Restock Inventory
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Supplier Modal */}
      {isSupplierModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreateSupplier}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Add Pharmaceutical Supplier
              </h3>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Distributor / Company Name
                </label>
                <input
                  required
                  type="text"
                  value={newSupName}
                  onChange={(e) => setNewSupName(e.target.value)}
                  placeholder="e.g. UDL Distribution Lahore"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#0D7A5F] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={newSupPhone}
                  onChange={(e) => setNewSupPhone(e.target.value)}
                  placeholder="042-XXXXXXXX"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Opening To Pay Balance (PKR)
                </label>
                <input
                  type="number"
                  min={0}
                  value={newSupBalance}
                  onChange={(e) => setNewSupBalance(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A634D]"
              >
                Save Supplier
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settle Supplier Payable Modal */}
      {settleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSettleSubmit}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900">
              Record Supplier Payment
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {settleTarget.name} · Current To Pay: PKR{' '}
              <span className="font-mono-tabular font-semibold">
                {settleTarget.balance.toFixed(2)}
              </span>
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Payment Amount (PKR)
              </label>
              <input
                required
                type="number"
                min={1}
                max={settleTarget.balance}
                step="0.01"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-tabular text-sm focus:border-[#0D7A5F] focus:outline-none"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettleTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A634D]"
              >
                Confirm Payment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
