import React, { useMemo, useRef, useState } from 'react';
import BarcodeScanner from 'react-qr-barcode-scanner';
import {
  Barcode,
  Camera,
  Flashlight,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import {
  CartLine,
  Party,
  PaymentMode,
  PharmacyItem,
} from '../types/pharmacy';

interface PosWorkspaceProps {
  items: PharmacyItem[];
  parties: Party[];
  onCompleteSale: (params: {
    cartLines: CartLine[];
    billDiscount: number;
    paymentMode: PaymentMode;
    party: Party | null;
  }) => void;
}

export const PosWorkspace: React.FC<PosWorkspaceProps> = ({
  items,
  parties,
  onCompleteSale,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [billDiscountInput, setBillDiscountInput] = useState('0');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [selectedPartyId, setSelectedPartyId] = useState<number>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Camera barcode scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [stopStream, setStopStream] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment',
  );
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [continuousScan, setContinuousScan] = useState(true);
  const [scannerStatus, setScannerStatus] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastScannedRef = useRef<{ code: string; timestamp: number }>({
    code: '',
    timestamp: 0,
  });

  const customers = useMemo(
    () => parties.filter((p) => p.type === 'customer'),
    [parties],
  );

  const categories = useMemo(() => {
    const unique = Array.from(new Set(items.map((i) => i.category)));
    return ['All', ...unique];
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCat =
        selectedCategory === 'All' || item.category === selectedCategory;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.batchNumber.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [items, searchQuery, selectedCategory]);

  const showToastError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 3500);
  };

  const addItemToCart = (item: PharmacyItem) => {
    if (item.stockQuantity <= 0) {
      showToastError(`${item.name} is currently out of stock.`);
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex((line) => line.item.id === item.id);
      if (idx >= 0) {
        const existing = prev[idx];
        if (existing.quantity >= item.stockQuantity) {
          showToastError(
            `Only ${item.stockQuantity} ${item.unit}s available for ${item.name}.`,
          );
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...existing, quantity: existing.quantity + 1 };
        return next;
      }
      return [...prev, { item, quantity: 1, itemDiscount: 0 }];
    });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const exactBarcode = items.find(
        (i) => i.barcode.toLowerCase() === searchQuery.trim().toLowerCase(),
      );
      if (exactBarcode) {
        addItemToCart(exactBarcode);
        setSearchQuery('');
      } else if (filteredItems.length === 1) {
        addItemToCart(filteredItems[0]);
        setSearchQuery('');
      }
    }
  };

  const openCameraScanner = () => {
    setStopStream(false);
    setTorchEnabled(false);
    setScannerStatus(null);
    lastScannedRef.current = { code: '', timestamp: 0 };
    setIsScannerOpen(true);
  };

  const closeCameraScanner = () => {
    // Stop webcam stream cleanly one tick before unmounting to prevent browser freeze
    setStopStream(true);
    setTorchEnabled(false);
    setTimeout(() => {
      setIsScannerOpen(false);
    }, 50);
  };

  const toggleFacingMode = () => {
    setStopStream(true);
    setTimeout(() => {
      setFacingMode((prev) =>
        prev === 'environment' ? 'user' : 'environment',
      );
      setStopStream(false);
    }, 80);
  };

  const handleBarcodeDetected = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    const now = Date.now();
    // 1.5s cooldown prevents rapid duplicate frame reads of the same label
    if (
      lastScannedRef.current.code === code &&
      now - lastScannedRef.current.timestamp < 1500
    ) {
      return;
    }
    lastScannedRef.current = { code, timestamp: now };

    const matched = items.find(
      (i) => i.barcode.toLowerCase() === code.toLowerCase(),
    );

    if (!matched) {
      setScannerStatus({
        type: 'warning',
        message: `Barcode "${code}" not found in pharmacy inventory.`,
      });
      return;
    }

    if (matched.stockQuantity <= 0) {
      setScannerStatus({
        type: 'warning',
        message: `${matched.name} (${code}) is currently out of stock.`,
      });
      return;
    }

    addItemToCart(matched);
    setScannerStatus({
      type: 'success',
      message: `Added ${matched.name} · PKR ${matched.sellingPrice.toFixed(2)} / ${matched.unit}`,
    });

    if (!continuousScan) {
      closeCameraScanner();
    }
  };

  const handleScannerCameraError = (err: string | DOMException) => {
    const errName = typeof err === 'string' ? err : err.name;
    const msg =
      errName === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access in your browser settings to scan barcodes.'
        : errName === 'NotFoundError'
          ? 'No camera device detected on this machine. Connect a webcam or use USB/keyboard barcode input.'
          : `Camera error: ${typeof err === 'string' ? err : err.message || err.name}`;

    setScannerStatus({
      type: 'error',
      message: msg,
    });
  };

  const updateLineQuantity = (itemId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.item.id !== itemId) return line;
          const nextQty = line.quantity + delta;
          if (nextQty > line.item.stockQuantity) {
            showToastError(
              `Maximum stock (${line.item.stockQuantity}) reached.`,
            );
            return line;
          }
          return { ...line, quantity: nextQty };
        })
        .filter((line) => line.quantity > 0),
    );
  };

  const updateLineDiscount = (itemId: number, rawDiscount: string) => {
    const val = Math.max(0, Number(rawDiscount) || 0);
    setCart((prev) =>
      prev.map((line) => {
        if (line.item.id !== itemId) return line;
        const gross = line.item.sellingPrice * line.quantity;
        return { ...line, itemDiscount: Math.min(val, gross) };
      }),
    );
  };

  const removeLine = (itemId: number) => {
    setCart((prev) => prev.filter((line) => line.item.id !== itemId));
  };

  // Calculations
  const subtotal = cart.reduce(
    (sum, line) => sum + line.item.sellingPrice * line.quantity,
    0,
  );
  const itemDiscountTotal = cart.reduce(
    (sum, line) =>
      sum + Math.min(line.itemDiscount, line.item.sellingPrice * line.quantity),
    0,
  );
  const afterItemDiscount = subtotal - itemDiscountTotal;
  const parsedBillDiscount = Math.max(0, Number(billDiscountInput) || 0);
  const effectiveBillDiscount = Math.min(parsedBillDiscount, afterItemDiscount);
  const totalDiscount = itemDiscountTotal + effectiveBillDiscount;
  const netPayable = afterItemDiscount - effectiveBillDiscount;
  const totalCost = cart.reduce(
    (sum, line) => sum + line.item.costPrice * line.quantity,
    0,
  );
  // Crucial profit rule: subtract ALL discounts from gross margin
  const netProfit = netPayable - totalCost;

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToastError('Add at least one medicine to the cart before billing.');
      return;
    }

    const party =
      customers.find((c) => c.id === selectedPartyId) ?? customers[0] ?? null;

    if (
      paymentMode === 'Credit/Party Ledger' &&
      (!party || party.name === 'Walk-in Customer')
    ) {
      showToastError(
        'Select a named customer account for Credit/Party Ledger sales.',
      );
      return;
    }

    try {
      onCompleteSale({
        cartLines: cart,
        billDiscount: effectiveBillDiscount,
        paymentMode,
        party,
      });
      setCart([]);
      setBillDiscountInput('0');
      setSearchQuery('');
      searchInputRef.current?.focus();
    } catch (err) {
      showToastError(err instanceof Error ? err.message : 'Checkout failed.');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Catalog & Barcode Search (7 cols) */}
      <div className="flex flex-col gap-4 lg:col-span-7">
        {/* Search / Barcode Field */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Scan barcode (press Enter) or search medicine, batch, category..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
              />
              <Barcode className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            <button
              type="button"
              onClick={openCameraScanner}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#0D7A5F] px-4 py-2.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-[#0A634D]"
            >
              <Camera className="h-4 w-4 shrink-0" />
              <span>Scan Camera</span>
            </button>
          </div>

          {/* Interactive Category Filter Segmented Bar */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[#0D7A5F] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Item Catalog Grid */}
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              No medicines match "{searchQuery}"
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
              className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset Catalog Filter
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => {
              const outOfStock = item.stockQuantity <= 0;
              const lowStock = item.stockQuantity > 0 && item.stockQuantity <= 10;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => addItemToCart(item)}
                  className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-colors ${
                    outOfStock
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                      : 'border-slate-200 bg-white hover:border-[#0D7A5F] hover:bg-[#0D7A5F]/[0.02]'
                  }`}
                >
                  <div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.category} · Batch {item.batchNumber}
                    </p>
                    <p className="mt-0.5 font-mono-tabular text-[11px] text-slate-400">
                      {item.barcode} · Exp {item.expiryDate}
                    </p>
                  </div>

                  <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
                    <div>
                      <span className="block text-[11px] text-slate-500">
                        Per {item.unit} Price
                      </span>
                      <span className="font-mono-tabular text-base font-bold text-[#0D7A5F]">
                        PKR {item.sellingPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-mono-tabular text-xs font-semibold ${
                          outOfStock
                            ? 'text-red-700'
                            : lowStock
                              ? 'text-amber-700'
                              : 'text-slate-700'
                        }`}
                      >
                        {outOfStock
                          ? 'Out of stock'
                          : `${item.stockQuantity} ${item.unit}`}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Cart & Profit Checkout Dock (5 cols) */}
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white lg:col-span-5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-[#0D7A5F]" />
            <h2 className="text-base font-semibold text-slate-900">
              Current Sale Cart
            </h2>
          </div>
          <span className="font-mono-tabular text-xs font-medium text-slate-500">
            {cart.length} {cart.length === 1 ? 'line' : 'lines'}
          </span>
        </div>

        {errorMsg && (
          <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Party Selector */}
        <div className="border-b border-slate-200 px-5 py-3">
          <label
            htmlFor="pos-party-select"
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Customer / Party Account
          </label>
          <select
            id="pos-party-select"
            value={selectedPartyId}
            onChange={(e) => setSelectedPartyId(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — To Collect: PKR {c.balance.toFixed(0)}
              </option>
            ))}
          </select>
        </div>

        {/* Cart Lines */}
        <div className="max-h-[340px] flex-1 overflow-y-auto px-5 py-3">
          {cart.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-600">
                No items in cart
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Click any medicine card or scan a barcode to start billing.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {cart.map((line) => {
                const gross = line.item.sellingPrice * line.quantity;
                const lineTotal = gross - line.itemDiscount;
                return (
                  <div key={line.item.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {line.item.name}
                        </p>
                        <p className="font-mono-tabular text-xs text-slate-500">
                          PKR {line.item.sellingPrice.toFixed(2)} /{' '}
                          {line.item.unit} · Cost{' '}
                          {line.item.costPrice.toFixed(2)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.item.id)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove ${line.item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {/* Qty Stepper */}
                      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                        <button
                          type="button"
                          onClick={() => updateLineQuantity(line.item.id, -1)}
                          className="rounded p-1 text-slate-700 hover:bg-white"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center font-mono-tabular text-xs font-semibold text-slate-900">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateLineQuantity(line.item.id, 1)}
                          className="rounded p-1 text-slate-700 hover:bg-white"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Item Discount */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">
                          Item Disc:
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={gross}
                          value={line.itemDiscount || ''}
                          placeholder="0"
                          onChange={(e) =>
                            updateLineDiscount(line.item.id, e.target.value)
                          }
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-right font-mono-tabular text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
                        />
                      </div>

                      {/* Line Net Total */}
                      <div className="font-mono-tabular text-sm font-bold text-slate-900">
                        PKR {lineTotal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bill Summary, Discounts, Net Profit & Payment Mode */}
        <div className="border-t border-slate-200 bg-slate-50 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="bill-discount-input"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Bill Discount (PKR)
              </label>
              <input
                id="bill-discount-input"
                type="number"
                min={0}
                value={billDiscountInput}
                onChange={(e) => setBillDiscountInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="payment-mode-select"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Payment Mode
              </label>
              <select
                id="payment-mode-select"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none"
              >
                <option value="Cash">Cash</option>
                <option value="Credit/Party Ledger">Credit/Party Ledger</option>
                <option value="Mobile Transfer">Mobile Transfer</option>
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-1.5 border-t border-slate-200 pt-3 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Gross Subtotal</span>
              <span className="font-mono-tabular">
                PKR {subtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-amber-700">
              <span>Item + Bill Discounts</span>
              <span className="font-mono-tabular">
                -PKR {totalDiscount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Inventory Cost Basis</span>
              <span className="font-mono-tabular">
                PKR {totalCost.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between font-medium text-slate-800">
              <span>Net Profit (after discounts)</span>
              <span
                className={`font-mono-tabular font-semibold ${
                  netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                PKR {netProfit.toFixed(2)}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
              <span className="text-sm font-bold text-slate-900">
                Net Payable
              </span>
              <span className="font-mono-tabular text-xl font-bold text-[#0D7A5F]">
                PKR {netPayable.toFixed(2)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={cart.length === 0}
            onClick={handleCheckout}
            className="mt-4 w-full rounded-lg bg-[#0D7A5F] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0A634D] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Complete Sale & Generate Invoice
          </button>
        </div>
      </div>

      {/* Camera Barcode Scanner Modal */}
      {isScannerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-scanner-title"
        >
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3
                  id="camera-scanner-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Camera Barcode Scanner
                </h3>
                <p className="text-xs text-slate-500">
                  Point camera at EAN-13, UPC, Code 128, or QR medicine label
                </p>
              </div>
              <button
                type="button"
                onClick={closeCameraScanner}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close barcode scanner"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              {/* Camera Viewport */}
              <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                <BarcodeScanner
                  width="100%"
                  height={280}
                  facingMode={facingMode}
                  torch={torchEnabled}
                  delay={350}
                  stopStream={stopStream}
                  onUpdate={(_err, result) => {
                    if (result) {
                      handleBarcodeDetected(result.getText());
                    }
                  }}
                  onError={handleScannerCameraError}
                />
                {/* Aiming Reticle Overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-28 w-64 rounded-lg border-2 border-[#0D7A5F]/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]" />
                </div>
              </div>

              {/* Scan Status Feedback */}
              {scannerStatus && (
                <div
                  role="status"
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
                    scannerStatus.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : scannerStatus.type === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {scannerStatus.message}
                </div>
              )}

              {/* Scanner Controls */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>
                      {facingMode === 'environment'
                        ? 'Rear Camera'
                        : 'Front Camera'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTorchEnabled((t) => !t)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      torchEnabled
                        ? 'border-amber-400 bg-amber-50 text-amber-900'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Flashlight className="h-3.5 w-3.5" />
                    <span>{torchEnabled ? 'Torch On' : 'Torch Off'}</span>
                  </button>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={continuousScan}
                    onChange={(e) => setContinuousScan(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#0D7A5F] focus:ring-[#0D7A5F]"
                  />
                  <span>Continuous scan</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
              <span className="font-mono-tabular text-xs text-slate-600">
                Cart: {cart.reduce((s, l) => s + l.quantity, 0)} items · PKR{' '}
                {netPayable.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={closeCameraScanner}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-slate-800"
              >
                Done Scanning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
