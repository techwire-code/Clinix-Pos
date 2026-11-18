import React, { useMemo, useState } from 'react';
import {
  Check,
  Download,
  Printer,
  Share2,
  X,
} from 'lucide-react';
import { SaleRecord, ThermalWidth } from '../types/pharmacy';
import { generateEscPosReceipt } from '../services/escPosGenerator';
import {
  downloadA5InvoicePdf,
  shareInvoiceSummary,
} from '../services/a5PdfGenerator';

interface InvoiceModalProps {
  sale: SaleRecord;
  defaultWidth: ThermalWidth;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  sale,
  defaultWidth,
  onClose,
}) => {
  const [paperWidth, setPaperWidth] = useState<ThermalWidth>(defaultWidth);
  const [showHex, setShowHex] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const escPos = useMemo(
    () => generateEscPosReceipt(sale, paperWidth),
    [sale, paperWidth],
  );

  const handlePrintThermal = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    downloadA5InvoicePdf(sale);
  };

  const handleShare = async () => {
    try {
      const outcome = await shareInvoiceSummary(sale);
      setShareFeedback(
        outcome === 'shared'
          ? 'Opened system share sheet'
          : 'Invoice summary copied for WhatsApp / Email',
      );
      setTimeout(() => setShareFeedback(null), 3000);
    } catch {
      setShareFeedback('Could not open share sheet');
      setTimeout(() => setShareFeedback(null), 3000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2
              id="invoice-modal-title"
              className="text-lg font-semibold text-slate-900"
            >
              Invoice {sale.invoiceNumber}
            </h2>
            <p className="text-xs text-slate-500">
              {sale.partyName} · {sale.paymentMode} · Net Payable PKR{' '}
              <span className="font-mono-tabular font-semibold text-slate-900">
                {sale.netPayable.toFixed(2)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close invoice preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-2">
          {/* Left: Thermal ESC/POS Preview */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                ESC/POS Thermal Receipt
              </h3>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(['58mm', '80mm'] as ThermalWidth[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setPaperWidth(w)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      paperWidth === w
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div
              id="thermal-print-area"
              className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <pre
                className={`mx-auto font-mono-tabular text-[11px] leading-relaxed text-slate-900 ${
                  paperWidth === '58mm' ? 'w-[32ch]' : 'w-[48ch]'
                }`}
              >
                {escPos.previewLines.join('\n')}
              </pre>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowHex((prev) => !prev)}
                className="text-xs font-medium text-[#0D7A5F] hover:underline"
              >
                {showHex ? 'Hide ESC/POS Raw Bytes' : 'Inspect ESC/POS Raw Bytes'}
              </button>
              <span className="font-mono-tabular text-xs text-slate-500">
                {escPos.bytes.length} bytes · Cut GS V 66 0
              </span>
            </div>

            {showHex && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono-tabular text-[10px] leading-relaxed text-emerald-300">
                {escPos.hexDump}
              </div>
            )}
          </div>

          {/* Right: A5 Invoice Breakdown & Profit Audit */}
          <div className="flex flex-col justify-between gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="border-b border-slate-200 pb-3">
                <p className="text-sm font-bold text-[#0D7A5F]">
                  CLINIX COMMUNITY PHARMACY
                </p>
                <p className="text-xs text-slate-600">
                  17 KM Ferozepur Road, Lahore
                </p>
              </div>

              <table className="mt-3 w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-1.5 font-medium">Item</th>
                    <th className="py-1.5 text-right font-medium">Qty</th>
                    <th className="py-1.5 text-right font-medium">Disc</th>
                    <th className="py-1.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sale.items.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2 pr-2 font-medium text-slate-900">
                        {line.itemName}
                      </td>
                      <td className="py-2 text-right font-mono-tabular text-slate-700">
                        {line.quantity}
                      </td>
                      <td className="py-2 text-right font-mono-tabular text-amber-700">
                        {line.itemDiscount > 0
                          ? `-${line.itemDiscount.toFixed(0)}`
                          : '0'}
                      </td>
                      <td className="py-2 text-right font-mono-tabular font-semibold text-slate-900">
                        {line.lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 space-y-1.5 border-t border-slate-200 pt-3 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono-tabular">
                    PKR {sale.subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-amber-700">
                  <span>Total Discounts</span>
                  <span className="font-mono-tabular">
                    -PKR {sale.discountAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900">
                  <span>Net Payable</span>
                  <span className="font-mono-tabular text-[#0D7A5F]">
                    PKR {sale.netPayable.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                  <span>Payment Mode</span>
                  <span className="font-medium text-slate-700">
                    {sale.paymentMode}
                  </span>
                </div>
              </div>
            </div>

            {shareFeedback && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                <Check className="h-4 w-4 shrink-0" />
                <span>{shareFeedback}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={handlePrintThermal}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50"
              >
                <Printer className="h-4 w-4 shrink-0" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50"
              >
                <Share2 className="h-4 w-4 shrink-0" />
                <span>Share WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="flex items-center justify-center gap-2 rounded-lg bg-[#0D7A5F] px-4 py-2.5 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#0A634D]"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span>Download A5 PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
