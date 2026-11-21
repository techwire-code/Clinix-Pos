import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  PharmacyItem,
  PharmacySettings,
  SaleRecord,
} from '../types/pharmacy';
import {
  calculateUnitPrice,
  EditCreditReceiptLineInput,
  formatDateBySettings,
  formatMoney,
  getCurrencyLabel,
} from '../services/localDb';

interface EditCreditReceiptModalProps {
  sale: SaleRecord;
  items: PharmacyItem[];
  settings?: PharmacySettings;
  canEdit: boolean;
  activeRoleLabel: string;
  onClose: () => void;
  onSaveEdit: (params: {
    saleId: number;
    editedLines: EditCreditReceiptLineInput[];
    billDiscount: number;
    reason: string;
    transactionReference?: string;
  }) => void;
}

interface DraftEditLine extends EditCreditReceiptLineInput {
  key: string;
  unitsPerBox: number;
}

const AUDIT_REASON_PRESETS = [
  'Accidental discount entry',
  'Quantity correction',
  'Price / unit rate adjustment',
  'Wrong item correction',
  'Credit balance adjustment',
];

export const EditCreditReceiptModal: React.FC<EditCreditReceiptModalProps> = ({
  sale,
  items,
  settings,
  canEdit,
  activeRoleLabel,
  onClose,
  onSaveEdit,
}) => {
  const cur = getCurrencyLabel(settings);
  const digits = settings?.decimalDigits ?? 2;

  const initialBillDiscount = useMemo(() => {
    const itemDiscSum = sale.items.reduce((s, l) => s + l.itemDiscount, 0);
    return Math.max(
      0,
      Math.round((sale.discountAmount - itemDiscSum) * 100) / 100,
    );
  }, [sale]);

  const [lines, setLines] = useState<DraftEditLine[]>(() =>
    sale.items.map((l, idx) => {
      const inv = items.find((it) => it.id === l.itemId);
      return {
        key: `${l.itemId}-${idx}-${l.id}`,
        itemId: l.itemId,
        itemName: l.itemName,
        unit: l.unit || inv?.unit || 'Unit',
        batchNumber: l.batchNumber || inv?.batchNumber || '',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        costPrice: l.costPrice,
        itemDiscount: l.itemDiscount,
        unitsPerBox: inv?.unitsPerBox ?? 1,
      };
    }),
  );

  const [billDiscount, setBillDiscount] = useState(
    String(initialBillDiscount),
  );
  const [transactionRef, setTransactionRef] = useState(
    sale.transactionReference ?? '',
  );
  const [reason, setReason] = useState('');
  const [addItemId, setAddItemId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const originalQtyByItem = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of sale.items) {
      map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.quantity);
    }
    return map;
  }, [sale.items]);

  const totals = useMemo(() => {
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const subtotal = round2(
      lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    );
    const itemDiscounts = round2(
      lines.reduce(
        (s, l) =>
          s +
          Math.min(
            Math.max(0, l.itemDiscount),
            Math.max(0, l.unitPrice * l.quantity),
          ),
        0,
      ),
    );
    const afterItem = Math.max(0, round2(subtotal - itemDiscounts));
    const parsedBillDisc = Math.max(0, Number(billDiscount) || 0);
    const safeBillDisc = round2(Math.min(parsedBillDisc, afterItem));
    const totalDiscount = round2(itemDiscounts + safeBillDisc);
    const newNetPayable = round2(afterItem - safeBillDisc);
    const delta = round2(newNetPayable - sale.netPayable);
    return {
      subtotal,
      totalDiscount,
      safeBillDisc,
      newNetPayable,
      delta,
    };
  }, [lines, billDiscount, sale.netPayable]);

  const stockDeltas = useMemo(() => {
    const newQtyByItem = new Map<number, number>();
    for (const l of lines) {
      newQtyByItem.set(
        l.itemId,
        (newQtyByItem.get(l.itemId) ?? 0) + Math.floor(l.quantity),
      );
    }
    const allIds = new Set<number>([
      ...originalQtyByItem.keys(),
      ...newQtyByItem.keys(),
    ]);
    const list: Array<{
      itemId: number;
      itemName: string;
      delta: number; // + = deduct more from stock, - = restore to stock
      unit: string;
    }> = [];
    for (const itemId of allIds) {
      const diff =
        (newQtyByItem.get(itemId) ?? 0) - (originalQtyByItem.get(itemId) ?? 0);
      if (diff !== 0) {
        const inv = items.find((i) => i.id === itemId);
        const orig = sale.items.find((i) => i.itemId === itemId);
        list.push({
          itemId,
          itemName: inv?.name || orig?.itemName || `Item #${itemId}`,
          delta: diff,
          unit: inv?.unit || orig?.unit || 'Unit',
        });
      }
    }
    return list;
  }, [lines, originalQtyByItem, items, sale.items]);

  const updateLine = (key: string, patch: Partial<DraftEditLine>) => {
    setErrorMsg(null);
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  };

  const handleRemoveLine = (key: string) => {
    if (lines.length <= 1) {
      setErrorMsg('At least one medicine line item must remain on the bill.');
      return;
    }
    setErrorMsg(null);
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleAddMedicine = () => {
    const idNum = Number(addItemId);
    if (!idNum) return;
    const inv = items.find((i) => i.id === idNum);
    if (!inv) return;
    setErrorMsg(null);
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === inv.id);
      if (existing) {
        return prev.map((l) =>
          l.itemId === inv.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: `${inv.id}-${Date.now()}`,
          itemId: inv.id,
          itemName: inv.name,
          unit: inv.unit,
          batchNumber: inv.batchNumber,
          quantity: 1,
          unitPrice: inv.sellingPrice,
          costPrice: inv.costPrice,
          itemDiscount: 0,
          unitsPerBox: inv.unitsPerBox,
        },
      ];
    });
    setAddItemId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setErrorMsg(
        'Only an Admin or Manager account can authorize audited receipt edits.',
      );
      return;
    }
    if (reason.trim().length < 3) {
      setErrorMsg(
        'Please enter a clear Audit / Correction Reason before saving.',
      );
      return;
    }
    try {
      onSaveEdit({
        saleId: sale.id,
        editedLines: lines.map((l) => ({
          itemId: l.itemId,
          itemName: l.itemName,
          unit: l.unit,
          batchNumber: l.batchNumber,
          quantity: Math.max(1, Math.floor(l.quantity)),
          unitPrice: Math.max(0, Number(l.unitPrice) || 0),
          costPrice: Math.max(0, Number(l.costPrice) || 0),
          itemDiscount: Math.max(0, Number(l.itemDiscount) || 0),
        })),
        billDiscount: totals.safeBillDisc,
        reason: reason.trim(),
        transactionReference: transactionRef,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not save receipt edit.',
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/65 p-3 dark:bg-black/80 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-credit-receipt-title"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id="edit-credit-receipt-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Edit Credit Receipt · {sale.invoiceNumber}
              </h3>
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <ShieldCheck className="h-3 w-3" />
                Audited Correction
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Customer: <strong className="text-slate-700 dark:text-slate-200">{sale.partyName}</strong> ·{' '}
              {formatDateBySettings(sale.createdAt, settings, {
                includeTime: true,
              })}{' '}
              · Auto-reconciles Khata ledger, receivables & inventory stock
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close edit receipt dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {!canEdit && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  Admin or Manager Role Required ({activeRoleLabel} active)
                </p>
                <p className="mt-0.5 opacity-90">
                  Cashier / Sales Staff roles cannot modify finalized credit bills or reconcile customer Khata balances. Sign in as an Admin or Manager to edit this receipt.
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Add Medicine Line Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <select
                disabled={!canEdit}
                value={addItemId}
                onChange={(e) => setAddItemId(e.target.value)}
                className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">+ Add another medicine to this receipt...</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} ({formatMoney(it.sellingPrice, settings)}/{it.unit} · Stock: {it.stockQuantity})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!canEdit || !addItemId}
                onClick={handleAddMedicine}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D7A5F] px-3 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Line</span>
              </button>
            </div>
          </div>

          {/* Editable Lines Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Medicine</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Qty</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Unit Rate ({cur})
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Line Disc ({cur})
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Line Total
                  </th>
                  <th className="px-2 py-2.5 text-center font-semibold">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lines.map((line) => {
                  const inv = items.find((i) => i.id === line.itemId);
                  const origQty = originalQtyByItem.get(line.itemId) ?? 0;
                  const maxAllowed = inv ? inv.stockQuantity + origQty : 999999;
                  const gross = line.unitPrice * line.quantity;
                  const netLine = Math.max(
                    0,
                    gross - Math.min(Math.max(0, line.itemDiscount), gross),
                  );

                  return (
                    <tr key={line.key} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {line.itemName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {line.unit || 'Unit'}
                          {line.batchNumber ? ` · Batch ${line.batchNumber}` : ''}
                          {inv
                            ? ` · Avail w/ bill: ${maxAllowed}`
                            : ''}
                        </p>
                        {line.unitsPerBox > 1 && canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              const boxVal = inv?.boxSellingPrice ?? line.unitPrice * line.unitsPerBox;
                              updateLine(line.key, {
                                unitPrice: calculateUnitPrice(
                                  boxVal,
                                  line.unitsPerBox,
                                ),
                              });
                            }}
                            className="mt-1 text-[10px] font-medium text-[#0D7A5F] hover:underline dark:text-emerald-400"
                          >
                            Reset to catalog box rate ({line.unitsPerBox}/box)
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            disabled={!canEdit || line.quantity <= 1}
                            onClick={() =>
                              updateLine(line.key, {
                                quantity: Math.max(1, line.quantity - 1),
                              })
                            }
                            className="rounded border border-slate-300 p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={maxAllowed}
                            disabled={!canEdit}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, {
                                quantity: Math.max(
                                  1,
                                  Math.floor(Number(e.target.value) || 1),
                                ),
                              })
                            }
                            className="w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono-tabular text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            disabled={!canEdit || line.quantity >= maxAllowed}
                            onClick={() =>
                              updateLine(line.key, {
                                quantity: line.quantity + 1,
                              })
                            }
                            className="rounded border border-slate-300 p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={!canEdit}
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(line.key, {
                              unitPrice: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono-tabular text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={gross}
                          step="0.01"
                          disabled={!canEdit}
                          value={line.itemDiscount}
                          onChange={(e) =>
                            updateLine(line.key, {
                              itemDiscount: Math.max(
                                0,
                                Number(e.target.value) || 0,
                              ),
                            })
                          }
                          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono-tabular text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        {netLine.toFixed(digits)}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          disabled={!canEdit || lines.length <= 1}
                          onClick={() => handleRemoveLine(line.key)}
                          title="Remove medicine line"
                          className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-35 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bill Discount, Reference & Reconciliation Comparison */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Bill-Level Discount ({cur}) — set to 0 to reverse accidental discount
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!canEdit}
                  value={billDiscount}
                  onChange={(e) => setBillDiscount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Reference / Slip Note (Optional)
                </label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="Optional reference or slip note"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {stockDeltas.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-slate-800 dark:bg-slate-900">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                    Inventory Stock Auto-Adjustment:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                    {stockDeltas.map((sd) => (
                      <li key={sd.itemId}>
                        • {sd.itemName}:{' '}
                        <span
                          className={`font-mono-tabular font-semibold ${
                            sd.delta < 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {sd.delta < 0
                            ? `+${Math.abs(sd.delta)} ${sd.unit} restored`
                            : `-${sd.delta} ${sd.unit} deducted`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Live Financial Reconciliation Summary */}
            <div className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <div className="space-y-2 text-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#0D7A5F] dark:text-emerald-400">
                  Khata & Credit Reconciliation Preview
                </p>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Previous Net Credit</span>
                  <span className="font-mono-tabular font-semibold">
                    {formatMoney(sale.netPayable, settings)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Edited Subtotal</span>
                  <span className="font-mono-tabular">
                    {formatMoney(totals.subtotal, settings)}
                  </span>
                </div>
                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                  <span>Edited Total Discounts</span>
                  <span className="font-mono-tabular">
                    -{formatMoney(totals.totalDiscount, settings)}
                  </span>
                </div>
                <div className="border-t border-emerald-200 pt-2 dark:border-emerald-900/60">
                  <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100">
                    <span>New Net Credit (Khata Debit)</span>
                    <span className="font-mono-tabular text-[#0D7A5F] dark:text-emerald-400">
                      {formatMoney(totals.newNetPayable, settings)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs font-semibold">
                    <span className="text-slate-600 dark:text-slate-400">
                      Customer Khata Adjustment
                    </span>
                    <span
                      className={`font-mono-tabular ${
                        totals.delta > 0
                          ? 'text-amber-700 dark:text-amber-400'
                          : totals.delta < 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {totals.delta > 0
                        ? `+${formatMoney(totals.delta, settings)}`
                        : formatMoney(totals.delta, settings)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Required Audit Reason */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/30">
            <label className="mb-1.5 block text-xs font-semibold text-slate-800 dark:text-slate-200">
              Audit / Correction Reason <span className="text-red-500">*</span>
            </label>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {AUDIT_REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    setReason(preset);
                    setErrorMsg(null);
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    reason === preset
                      ? 'border-[#0D7A5F] bg-[#0D7A5F] text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              required
              type="text"
              disabled={!canEdit}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="Explain why this credit receipt is being corrected (required for audit log)..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canEdit}
            className="rounded-lg bg-[#0D7A5F] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0A634D] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Audited Correction & Reconcile
          </button>
        </div>
      </form>
    </div>
  );
};
