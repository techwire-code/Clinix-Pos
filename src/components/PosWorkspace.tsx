import React, { useEffect, useMemo, useRef, useState } from 'react';
import BarcodeScanner from 'react-qr-barcode-scanner';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Flashlight,
  Minus,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CartLine,
  Party,
  PaymentMode,
  PharmacyItem,
  PharmacySettings,
} from '../types/pharmacy';
import {
  formatMoney,
  getCurrencyLabel,
  isCreditPaymentMode,
} from '../services/localDb';

interface PosWorkspaceProps {
  items: PharmacyItem[];
  parties: Party[];
  limitedAccess?: boolean;
  hideCostAndProfit?: boolean;
  settings?: PharmacySettings;
  onCompleteSale: (params: {
    cartLines: CartLine[];
    billDiscount: number;
    paymentMode: PaymentMode;
    party: Party | null;
    transactionReference?: string;
    cashReceived?: number;
  }) => void;
}

const ORDERED_CATEGORIES = [
  'All',
  'Analgesics',
  'Antibiotics',
  'Gastro',
  'Diabetes Care',
  'Cardiac',
  'Allergy',
  'Supplements',
];

const PAYMENT_MODES_ADMIN: PaymentMode[] = [
  'Cash',
  'Card',
  'JazzCash / EasyPaisa',
  'Bank Transfer',
  'Credit / Khata',
];

const PAYMENT_MODES_STAFF: PaymentMode[] = [
  'Cash',
  'Card',
  'JazzCash / EasyPaisa',
  'Bank Transfer',
];

function requiresTransactionReference(mode: PaymentMode): boolean {
  return (
    mode === 'Card' ||
    mode === 'JazzCash / EasyPaisa' ||
    mode === 'Bank Transfer' ||
    mode === 'Mobile Transfer'
  );
}

function formatExpiryMmYy(expiryDate: string): string {
  const match = expiryDate.match(/^(\d{4})-(\d{2})/);
  if (match) {
    return `${match[2]}/${match[1].slice(2)}`;
  }
  const dt = new Date(expiryDate);
  if (!Number.isNaN(dt.getTime())) {
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yy = String(dt.getFullYear()).slice(2);
    return `${mm}/${yy}`;
  }
  return expiryDate || 'N/A';
}

function getExpiryStatus(
  expiryDate: string,
  nearExpiryDays = 60,
): 'expired' | 'near' | 'ok' {
  const dt = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return 'ok';
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const daysLeft = Math.round(
    (dt.getTime() - todayStart) / (1000 * 60 * 60 * 24),
  );
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= nearExpiryDays) return 'near';
  return 'ok';
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
}

export const PosWorkspace: React.FC<PosWorkspaceProps> = ({
  items,
  parties,
  limitedAccess = false,
  hideCostAndProfit,
  settings,
  onCompleteSale,
}) => {
  const cur = getCurrencyLabel(settings);
  const lowStockThreshold = Math.max(1, settings?.lowStockThreshold ?? 10);
  const nearExpiryDays = Math.max(1, settings?.expiryAlertDays ?? 30);
  const preferUsbScannerFocus = settings?.preferUsbScannerFocus ?? true;
  const shouldHideProfit = hideCostAndProfit ?? limitedAccess;

  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [billDiscountInput, setBillDiscountInput] = useState('0');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [transactionRefInput, setTransactionRefInput] = useState('');
  const [cashReceivedInput, setCashReceivedInput] = useState('');
  const [selectedPartyId, setSelectedPartyId] = useState<number>(1);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

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
  const toastTimerRef = useRef<number | null>(null);
  const lastScannedRef = useRef<{ code: string; timestamp: number }>({
    code: '',
    timestamp: 0,
  });

  useEffect(() => {
    if (preferUsbScannerFocus) {
      searchInputRef.current?.focus();
    }
  }, [preferUsbScannerFocus]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2400);
  };

  const customers = useMemo(
    () => parties.filter((p) => p.type === 'customer'),
    [parties],
  );

  const selectedCustomer = useMemo(() => {
    if (limitedAccess) {
      return (
        customers.find((c) => c.name === 'Walk-in Customer') ?? {
          id: 1,
          name: 'Walk-in Customer',
          phone: '',
          type: 'customer' as const,
          balance: 0,
        }
      );
    }
    return (
      customers.find((c) => c.id === selectedPartyId) ??
      customers[0] ?? {
        id: 1,
        name: 'Walk-in Customer',
        phone: '',
        type: 'customer' as const,
        balance: 0,
      }
    );
  }, [customers, selectedPartyId, limitedAccess]);

  const categories = useMemo(() => {
    const present = new Set(items.map((i) => i.category).filter(Boolean));
    const extras = Array.from(present).filter(
      (cat) => !ORDERED_CATEGORIES.includes(cat),
    );
    return [...ORDERED_CATEGORIES, ...extras];
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCat =
        selectedCategory === 'All' || item.category === selectedCategory;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.genericName ?? '').toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.batchNumber.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [items, searchQuery, selectedCategory]);

  const cartQuantityMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of cart) {
      map.set(line.item.id, line.quantity);
    }
    return map;
  }, [cart]);

  const addItemToCart = (item: PharmacyItem, addQty = 1) => {
    if (item.stockQuantity <= 0) {
      showToast('error', `${item.name} is out of stock.`);
      return;
    }

    const existing = cart.find((line) => line.item.id === item.id);
    const nextQty = Math.round(((existing?.quantity ?? 0) + addQty) * 100) / 100;

    if (nextQty > item.stockQuantity + 0.0001) {
      showToast(
        'error',
        `Only ${item.stockQuantity} ${item.unit}s available for ${item.name}.`,
      );
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex((line) => line.item.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...prev[idx], quantity: nextQty };
        return next;
      }
      return [...prev, { item, quantity: addQty, itemDiscount: 0 }];
    });

    showToast(
      'success',
      `Added ${item.name} (${formatQty(nextQty)} in cart)`,
    );
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const raw = searchQuery.trim();
    if (!raw) return;

    e.preventDefault();
    const exactBarcode = items.find(
      (i) => i.barcode.toLowerCase() === raw.toLowerCase(),
    );
    if (exactBarcode) {
      addItemToCart(exactBarcode, 1);
      setSearchQuery('');
      if (preferUsbScannerFocus) searchInputRef.current?.focus();
      return;
    }

    if (filteredItems.length === 1) {
      addItemToCart(filteredItems[0], 1);
      setSearchQuery('');
      if (preferUsbScannerFocus) searchInputRef.current?.focus();
      return;
    }

    if (/^\d{4,}$/.test(raw)) {
      showToast('error', `Barcode "${raw}" not found in inventory.`);
      setSearchQuery('');
      if (preferUsbScannerFocus) searchInputRef.current?.focus();
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

    addItemToCart(matched, 1);
    setScannerStatus({
      type: 'success',
      message: `Added ${matched.name} · ${formatMoney(matched.sellingPrice, settings)} / ${matched.unit}`,
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
          ? 'No camera device detected. Connect a camera or use USB barcode / keyboard search.'
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
          const nextQty = Math.round((line.quantity + delta) * 100) / 100;
          if (nextQty > line.item.stockQuantity + 0.0001) {
            showToast(
              'error',
              `Maximum stock (${line.item.stockQuantity}) reached.`,
            );
            return line;
          }
          const gross = line.item.sellingPrice * Math.max(0, nextQty);
          return {
            ...line,
            quantity: nextQty,
            itemDiscount: Math.min(line.itemDiscount, gross),
          };
        })
        .filter((line) => line.quantity > 0),
    );
  };

  const setExactLineQuantity = (itemId: number, rawQty: string) => {
    const parsed = Number(rawQty);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const rounded = Math.round(parsed * 100) / 100;
    setCart((prev) =>
      prev.map((line) => {
        if (line.item.id !== itemId) return line;
        if (rounded > line.item.stockQuantity + 0.0001) {
          showToast(
            'error',
            `Only ${line.item.stockQuantity} ${line.item.unit}s in stock.`,
          );
          return line;
        }
        const gross = line.item.sellingPrice * rounded;
        return {
          ...line,
          quantity: rounded,
          itemDiscount: Math.min(line.itemDiscount, gross),
        };
      }),
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

  // Financial & Profit Math
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
  const netProfit = netPayable - totalCost;
  const totalUnitsInCart =
    Math.round(cart.reduce((sum, l) => sum + l.quantity, 0) * 100) / 100;

  const availablePaymentModes = limitedAccess
    ? PAYMENT_MODES_STAFF
    : PAYMENT_MODES_ADMIN;

  const effectivePaymentMode: PaymentMode =
    limitedAccess && isCreditPaymentMode(paymentMode) ? 'Cash' : paymentMode;

  const showRefField = requiresTransactionReference(effectivePaymentMode);

  const parsedCashReceived =
    cashReceivedInput.trim() === ''
      ? null
      : Math.max(0, Number(cashReceivedInput) || 0);
  const cashBalanceDelta =
    parsedCashReceived !== null
      ? Math.round((parsedCashReceived - netPayable) * 100) / 100
      : 0;

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast('error', 'Add at least one medicine to the cart.');
      return;
    }

    const party = limitedAccess
      ? null
      : (customers.find((c) => c.id === selectedPartyId) ??
        customers[0] ??
        null);

    if (
      !limitedAccess &&
      isCreditPaymentMode(effectivePaymentMode) &&
      (!party || party.name === 'Walk-in Customer')
    ) {
      showToast(
        'error',
        'Select a named customer account for Credit / Khata sales.',
      );
      return;
    }

    if (
      effectivePaymentMode === 'Cash' &&
      parsedCashReceived !== null &&
      parsedCashReceived + 0.001 < netPayable
    ) {
      showToast(
        'error',
        `Cash received (${formatMoney(parsedCashReceived, settings)}) is less than Net Payable (${formatMoney(netPayable, settings)}).`,
      );
      return;
    }

    try {
      onCompleteSale({
        cartLines: cart,
        billDiscount: effectiveBillDiscount,
        paymentMode: effectivePaymentMode,
        party,
        transactionReference: showRefField
          ? transactionRefInput.trim() || undefined
          : undefined,
        cashReceived:
          effectivePaymentMode === 'Cash'
            ? (parsedCashReceived ?? netPayable)
            : undefined,
      });
      setCart([]);
      setBillDiscountInput('0');
      setCashReceivedInput('');
      setTransactionRefInput('');
      setSearchQuery('');
      setMobileTab('catalog');
      if (preferUsbScannerFocus) {
        searchInputRef.current?.focus();
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Checkout failed.');
    }
  };

  // ==================== REUSABLE SUB-RENDERERS ====================

  const renderCatalogList = () => {
    if (filteredItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            No medicines match "{searchQuery}"
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Check spelling, clear category filter, or scan a barcode.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
            className="mt-4 min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Reset Filters
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2 p-3">
        {filteredItems.map((item) => {
          const outOfStock = item.stockQuantity <= 0;
          const lowStock =
            item.stockQuantity > 0 && item.stockQuantity < lowStockThreshold;
          const expStatus = getExpiryStatus(item.expiryDate, nearExpiryDays);
          const expFormatted = formatExpiryMmYy(item.expiryDate);
          const qtyInCart = cartQuantityMap.get(item.id) ?? 0;

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={outOfStock ? -1 : 0}
              aria-disabled={outOfStock}
              onClick={() => {
                if (!outOfStock) addItemToCart(item, 1);
              }}
              onKeyDown={(e) => {
                if (!outOfStock && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  addItemToCart(item, 1);
                }
              }}
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors select-none ${
                outOfStock
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100/70 opacity-60 dark:border-slate-800 dark:bg-slate-900/40'
                  : qtyInCart > 0
                    ? 'cursor-pointer border-[#0D7A5F]/45 bg-[#0D7A5F]/[0.04] hover:bg-[#0D7A5F]/[0.08] active:scale-[0.995] dark:border-emerald-700/70 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50'
                    : 'cursor-pointer border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 active:scale-[0.995] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/70'
              }`}
            >
              {/* Left: Medicine Name (max 2 lines), Generic Formula & Metadata */}
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                  {item.name}
                </h3>
                {item.genericName && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const gen = item.genericName?.trim() ?? '';
                      if (!gen) return;
                      if (searchQuery.trim().toLowerCase() === gen.toLowerCase()) {
                        setSearchQuery('');
                      } else {
                        setSelectedCategory('All');
                        setSearchQuery(gen);
                      }
                    }}
                    title="Tap to filter all brands matching this generic"
                    className={`mt-1 inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[11px] font-medium transition-colors ${
                      searchQuery.trim().toLowerCase() ===
                      item.genericName.trim().toLowerCase()
                        ? 'border-[#0D7A5F] bg-[#0D7A5F] text-white dark:border-emerald-500 dark:bg-emerald-600'
                        : 'border-slate-200 bg-slate-100/80 text-slate-700 hover:border-[#0D7A5F]/50 hover:text-[#0D7A5F] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-300'
                    }`}
                  >
                    <span className="truncate">{item.genericName}</span>
                  </button>
                )}
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  <span>{item.category}</span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">
                    •
                  </span>
                  <span className="font-mono-tabular">
                    {item.batchNumber || 'N/A'}
                  </span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">
                    •
                  </span>
                  <span
                    className={`font-mono-tabular ${
                      expStatus === 'expired'
                        ? 'font-semibold text-red-700 dark:text-red-400'
                        : expStatus === 'near'
                          ? 'font-semibold text-amber-700 dark:text-amber-400'
                          : ''
                    }`}
                  >
                    Exp: {expFormatted}
                  </span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">
                    •
                  </span>
                  <span
                    className={`font-mono-tabular ${
                      outOfStock
                        ? 'font-semibold text-red-700 dark:text-red-400'
                        : lowStock
                          ? 'font-semibold text-amber-700 dark:text-amber-400'
                          : 'font-medium text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Stock: {formatQty(item.stockQuantity)}
                  </span>
                </p>
                {qtyInCart > 0 && (
                  <p className="mt-1 inline-flex items-center gap-1 font-mono-tabular text-[11px] font-semibold text-[#0D7A5F] dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                    <span>{formatQty(qtyInCart)} in cart</span>
                  </p>
                )}
              </div>

              {/* Right: Currency Price + Unit & + Add Button */}
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <div className="text-right">
                  <span className="block font-mono-tabular text-sm font-bold text-[#0D7A5F] dark:text-emerald-400">
                    {formatMoney(item.sellingPrice, settings)}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    per {item.unit}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={outOfStock}
                  onClick={(e) => {
                    e.stopPropagation();
                    addItemToCart(item, 1);
                  }}
                  className={`inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    outOfStock
                      ? 'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500'
                      : 'border-[#0D7A5F] bg-[#0D7A5F]/10 text-[#0D7A5F] hover:bg-[#0D7A5F] hover:text-white dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-600 dark:hover:text-white'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCustomerChip = () => (
    <div className="relative">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={limitedAccess}
          onClick={() => {
            if (!limitedAccess) setCustomerPickerOpen((o) => !o);
          }}
          className={`flex min-h-[44px] flex-1 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
            limitedAccess
              ? 'cursor-default border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60'
              : 'border-slate-200 bg-white hover:border-[#0D7A5F]/50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-600'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <UserCheck className="h-4 w-4 shrink-0 text-[#0D7A5F] dark:text-emerald-400" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                {selectedCustomer.name}
              </p>
              <p className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                {selectedCustomer.balance > 0
                  ? `To Collect: ${formatMoney(selectedCustomer.balance, settings)}`
                  : 'No pending Khata balance'}
              </p>
            </div>
          </div>
          {!limitedAccess && (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          )}
        </button>

        {cart.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCart([]);
              setCashReceivedInput('');
              setTransactionRefInput('');
            }}
            className="min-h-[44px] rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 whitespace-nowrap hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-800 dark:hover:bg-red-950/50 dark:hover:text-red-300"
          >
            Clear
          </button>
        )}
      </div>

      {customerPickerOpen && !limitedAccess && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {customers.map((c) => {
            const active = c.id === selectedCustomer.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedPartyId(c.id);
                  setCustomerPickerOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  active
                    ? 'bg-[#0D7A5F]/10 font-semibold text-[#0D7A5F] dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/70'
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                  Bal: {formatMoney(c.balance, settings)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderCartItemsList = () => {
    if (cart.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center dark:border-slate-800 dark:bg-slate-900/50">
          <ShoppingCart className="h-7 w-7 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Cart is empty
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tap any medicine or scan a barcode to start billing.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {cart.map((line) => {
          const gross = line.item.sellingPrice * line.quantity;
          const lineTotal = gross - line.itemDiscount;
          const hasPackOption = line.item.unitsPerBox > 1;

          return (
            <div
              key={line.item.id}
              className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              {/* Top row: Name + Remove */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900 dark:text-slate-100">
                    {line.item.name}
                  </p>
                  <p className="mt-0.5 font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                    {formatMoney(line.item.sellingPrice, settings)} / {line.item.unit}
                    {!shouldHideProfit &&
                      ` · Cost ${formatMoney(line.item.costPrice, settings)}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(line.item.id)}
                  className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                  aria-label={`Remove ${line.item.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Bottom row: Stepper + Pack/Fractional + Discount + Total */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  {/* Qty Stepper */}
                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => updateLineQuantity(line.item.id, -1)}
                      className="flex min-h-[36px] min-w-[36px] items-center justify-center text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={0.5}
                      step="any"
                      max={line.item.stockQuantity}
                      value={line.quantity}
                      onChange={(e) =>
                        setExactLineQuantity(line.item.id, e.target.value)
                      }
                      aria-label={`Quantity for ${line.item.name}`}
                      className="w-12 bg-transparent text-center font-mono-tabular text-xs font-bold text-slate-900 focus:outline-none dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => updateLineQuantity(line.item.id, 1)}
                      className="flex min-h-[36px] min-w-[36px] items-center justify-center text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Quick Fractional / Box-Unit helpers */}
                  {hasPackOption ? (
                    <button
                      type="button"
                      onClick={() =>
                        addItemToCart(line.item, line.item.unitsPerBox)
                      }
                      title={`Add 1 full box (${line.item.unitsPerBox} ${line.item.unit}s)`}
                      className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-2 font-mono-tabular text-[11px] font-semibold text-slate-700 whitespace-nowrap hover:border-[#0D7A5F] hover:text-[#0D7A5F] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
                    >
                      +{line.item.unitsPerBox} Box
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateLineQuantity(line.item.id, 0.5)}
                      title="Add 0.5 fractional unit"
                      className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-2 font-mono-tabular text-[11px] font-semibold text-slate-700 whitespace-nowrap hover:border-[#0D7A5F] hover:text-[#0D7A5F] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
                    >
                      +0.5
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Disc
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
                      className="w-14 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right font-mono-tabular text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div className="min-w-[76px] text-right font-mono-tabular text-xs font-bold text-slate-900 dark:text-slate-100">
                    {formatMoney(lineTotal, settings)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCheckoutControls = () => (
    <div className="space-y-3">
      {/* Bill Discount + Payment Mode */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <div>
            <label
              htmlFor="pos-bill-discount"
              className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300"
            >
              Bill Discount ({cur})
            </label>
            <input
              id="pos-bill-discount"
              type="number"
              min={0}
              value={billDiscountInput}
              onChange={(e) => setBillDiscountInput(e.target.value)}
              className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="pos-payment-mode"
              className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300"
            >
              Payment Mode
            </label>
            <select
              id="pos-payment-mode"
              value={effectivePaymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {availablePaymentModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Conditional Transaction Reference */}
        {showRefField && (
          <div className="mt-3">
            <label
              htmlFor="pos-transaction-ref"
              className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300"
            >
              Transaction Reference ({effectivePaymentMode})
            </label>
            <input
              id="pos-transaction-ref"
              type="text"
              value={transactionRefInput}
              onChange={(e) => setTransactionRefInput(e.target.value)}
              placeholder="Enter TID / Slip # / Bank reference..."
              className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        )}

        {/* Cash Received & Auto-calculated Balance / Change */}
        {effectivePaymentMode === 'Cash' && (
          <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="pos-cash-received"
                  className="text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                >
                  Cash Received ({cur})
                </label>
                {netPayable > 0 && (
                  <button
                    type="button"
                    onClick={() => setCashReceivedInput(netPayable.toFixed(2))}
                    className="text-[11px] font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
                  >
                    Exact
                  </button>
                )}
              </div>
              <input
                id="pos-cash-received"
                type="number"
                min={0}
                step="0.01"
                value={cashReceivedInput}
                onChange={(e) => setCashReceivedInput(e.target.value)}
                placeholder={netPayable > 0 ? netPayable.toFixed(2) : '0.00'}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono-tabular text-sm font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/70">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {parsedCashReceived === null
                  ? 'Balance / Change'
                  : cashBalanceDelta >= 0
                    ? 'Change Return'
                    : 'Cash Short'}
              </span>
              <span
                className={`font-mono-tabular text-sm font-bold ${
                  parsedCashReceived === null
                    ? 'text-slate-700 dark:text-slate-200'
                    : cashBalanceDelta >= 0
                      ? 'text-[#0D7A5F] dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                }`}
              >
                {parsedCashReceived === null
                  ? formatMoney(0, settings)
                  : formatMoney(cashBalanceDelta, settings)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Financial Totals (Cost & Net Profit hidden for Cashier / Sales Staff) */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-1.5">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Subtotal</span>
            <span className="font-mono-tabular">
              {formatMoney(subtotal, settings)}
            </span>
          </div>
          <div className="flex justify-between text-amber-700 dark:text-amber-400">
            <span>Total Discounts</span>
            <span className="font-mono-tabular">
              -{formatMoney(totalDiscount, settings)}
            </span>
          </div>
          {!shouldHideProfit && (
            <>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Total Cost</span>
                <span className="font-mono-tabular">
                  {formatMoney(totalCost, settings)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-200">
                <span>Net Profit</span>
                <span
                  className={`font-mono-tabular ${
                    netProfit >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {formatMoney(netProfit, settings)}
                </span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Net Payable
            </span>
            <span className="font-mono-tabular text-base font-bold text-[#0D7A5F] dark:text-emerald-400">
              {formatMoney(netPayable, settings)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F8FAFC] dark:bg-[#0B1120]">
      {/* 1. COMPACT PINNED TOP HEADER (Search/Barcode + Camera Button + Category Chips) */}
      <section
        aria-label="Search, Barcode Scanner and Category Filter"
        className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search medicine, generic, batch or barcode..."
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0D7A5F] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-500 dark:focus:bg-slate-800 sm:text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  if (preferUsbScannerFocus) searchInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={openCameraScanner}
            title="Open Camera Barcode Scanner"
            aria-label="Open Camera Barcode Scanner"
            className="flex min-h-[42px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#0D7A5F] text-white transition-colors hover:bg-[#0A634D] active:scale-[0.97]"
          >
            <QrCode className="h-5 w-5" />
          </button>
        </div>

        {/* Single Horizontal Scrollable Row of Compact Category Filter Chips */}
        <div
          className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Category Filter Chips"
        >
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[34px] shrink-0 rounded-lg border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'border-[#0D7A5F] bg-[#0D7A5F] text-white dark:border-emerald-600 dark:bg-emerald-600'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* Floating Snackbar / Toast Feedback */}
      {toast && (
        <div className="pointer-events-none fixed bottom-20 left-3 right-3 z-40 flex justify-center min-[600px]:bottom-4">
          <div
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`flex max-w-md items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-lg ${
              toast.type === 'error'
                ? 'border-red-300 bg-red-600 text-white dark:border-red-700'
                : 'border-emerald-700 bg-slate-900 text-white dark:border-emerald-500 dark:bg-emerald-950'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <span className="truncate">{toast.message}</span>
          </div>
        </div>
      )}

      {/* 2. MOBILE LAYOUT (< 600px): 2-Tab Workspace + Sticky Bottom Checkout Bar */}
      <div className="flex min-h-0 flex-1 flex-col min-[600px]:hidden">
        {/* 2-Tab Switcher */}
        <div className="grid shrink-0 grid-cols-2 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setMobileTab('catalog')}
            className={`min-h-[42px] border-b-2 px-3 text-xs font-bold transition-colors ${
              mobileTab === 'catalog'
                ? 'border-[#0D7A5F] text-[#0D7A5F] dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Catalog ({filteredItems.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className={`min-h-[42px] border-b-2 px-3 text-xs font-bold transition-colors ${
              mobileTab === 'cart'
                ? 'border-[#0D7A5F] text-[#0D7A5F] dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Cart ({cart.length})
          </button>
        </div>

        {/* Active Tab Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {mobileTab === 'catalog' ? (
            renderCatalogList()
          ) : (
            <div className="space-y-3 p-3">
              {renderCustomerChip()}
              {renderCartItemsList()}
              {renderCheckoutControls()}
            </div>
          )}
        </div>

        {/* Sticky Bottom Checkout Bar (Mobile) */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_-4px_14px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0">
            <p className="font-mono-tabular text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {cart.length} {cart.length === 1 ? 'item' : 'items'} ·{' '}
              {formatQty(totalUnitsInCart)} units
            </p>
            <p className="truncate font-mono-tabular text-sm font-bold text-slate-900 dark:text-slate-100">
              Net Payable:{' '}
              <span className="text-[#0D7A5F] dark:text-emerald-400">
                {formatMoney(netPayable, settings)}
              </span>
            </p>
          </div>

          {mobileTab === 'catalog' ? (
            <button
              type="button"
              onClick={() => setMobileTab('cart')}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-[#0D7A5F] px-4 py-2 text-xs font-bold text-white whitespace-nowrap transition-colors hover:bg-[#0A634D] active:scale-[0.98]"
            >
              <span>Review Cart</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleCheckout}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-[#0D7A5F] px-4 py-2 text-xs font-bold text-white whitespace-nowrap transition-colors hover:bg-[#0A634D] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
            >
              <Printer className="h-4 w-4" />
              <span>Complete &amp; Print</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. TABLET LAYOUT (>= 600px): 60% / 40% Split View */}
      <div className="hidden min-h-0 flex-1 overflow-hidden min-[600px]:flex">
        {/* Left 60%: Catalog */}
        <div className="flex w-[60%] min-h-0 flex-col border-r border-slate-200 dark:border-slate-800">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/70">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Medicines Catalog
            </span>
            <span className="font-mono-tabular text-xs font-medium text-slate-500 dark:text-slate-400">
              {filteredItems.length} SKUs
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {renderCatalogList()}
          </div>
        </div>

        {/* Right 40%: Cart & Checkout with Sticky Complete & Print */}
        <div className="flex w-[40%] min-h-0 flex-col bg-slate-50/70 dark:bg-slate-950/40">
          <div className="shrink-0 border-b border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-[#0D7A5F] dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Cart ({cart.length})
                </span>
              </div>
              <span className="font-mono-tabular text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {formatQty(totalUnitsInCart)} units
              </span>
            </div>
            {renderCustomerChip()}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {renderCartItemsList()}
            {renderCheckoutControls()}
          </div>

          {/* Sticky Bottom Checkout Action (Tablet Checkout Panel) */}
          <div className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleCheckout}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#0D7A5F] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A634D] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
            >
              <Printer className="h-4 w-4" />
              <span>
                Complete &amp; Print · {formatMoney(netPayable, settings)}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Camera Barcode Scanner Modal */}
      {isScannerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 dark:bg-slate-950/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-scanner-title"
        >
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <div>
                <h3
                  id="camera-scanner-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Camera Barcode Scanner
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Point camera at EAN-13, UPC, Code 128, or QR medicine label
                </p>
              </div>
              <button
                type="button"
                onClick={closeCameraScanner}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Close barcode scanner"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5">
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-700">
                <BarcodeScanner
                  width="100%"
                  height={260}
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
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-28 w-64 rounded-lg border-2 border-[#0D7A5F]/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]" />
                </div>
              </div>

              {scannerStatus && (
                <div
                  role="status"
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
                    scannerStatus.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : scannerStatus.type === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300'
                  }`}
                >
                  {scannerStatus.message}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
                    className={`flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      torchEnabled
                        ? 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Flashlight className="h-3.5 w-3.5" />
                    <span>{torchEnabled ? 'Torch On' : 'Torch Off'}</span>
                  </button>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={continuousScan}
                    onChange={(e) => setContinuousScan(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#0D7A5F] focus:ring-[#0D7A5F] dark:border-slate-600 dark:bg-slate-800"
                  />
                  <span>Continuous scan</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
              <span className="font-mono-tabular text-xs text-slate-600 dark:text-slate-400">
                Cart: {formatQty(totalUnitsInCart)} units ·{' '}
                {formatMoney(netPayable, settings)}
              </span>
              <button
                type="button"
                onClick={closeCameraScanner}
                className="min-h-[40px] rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
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
