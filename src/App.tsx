import { useEffect, useState } from 'react';
import {
  BarChart3,
  Code2,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Printer,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingBag,
  Sun,
  Truck,
  Users,
  X,
} from 'lucide-react';
import {
  CartLine,
  ExpenseRecord,
  Party,
  PaymentMode,
  PharmacyItem,
  PharmacySettings,
  PrinterConfig,
  PurchaseDraftLine,
  PurchaseRecord,
  SaleRecord,
} from './types/pharmacy';
import {
  calculateUnitPrice,
  executePurchaseTransaction,
  executeSaleTransaction,
  exportDatabaseBackupJson,
  isCreditPaymentMode,
  loadExpenses,
  loadItems,
  loadParties,
  loadPrinterConfig,
  loadPurchases,
  loadSales,
  loadSettings,
  resetDemoDatabase,
  resetSettingsToDefaults,
  saveExpenses,
  saveItems,
  saveParties,
  savePrinterConfig,
  saveSettings,
} from './services/localDb';
import {
  isManagerOrAdminRole,
  LoginScreen,
  StaffSession,
} from './components/LoginScreen';
import { DashboardWorkspace } from './components/DashboardWorkspace';
import { PosWorkspace } from './components/PosWorkspace';
import { InventoryWorkspace } from './components/InventoryWorkspace';
import { MyReceiptsWorkspace } from './components/MyReceiptsWorkspace';
import { PurchasesWorkspace } from './components/PurchasesWorkspace';
import { PartiesWorkspace } from './components/PartiesWorkspace';
import { ReportsAndExpensesWorkspace } from './components/ReportsAndExpensesWorkspace';
import { PrinterAndSalesWorkspace } from './components/PrinterAndSalesWorkspace';
import { SettingsWorkspace } from './components/SettingsWorkspace';
import { DartSourceWorkspace } from './components/DartSourceWorkspace';
import { InvoiceModal } from './components/InvoiceModal';
import {
  applyThemePreference,
  loadThemePreference,
  ThemeMode,
} from './services/themeService';
import {
  buildImportedInventoryResult,
  CsvDuplicateStrategy,
  ParsedCsvProductRow,
} from './services/csvImport';

type NavTab =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'receipts'
  | 'purchases'
  | 'parties'
  | 'reports'
  | 'printer'
  | 'settings'
  | 'dart';

const IS_DEBUG_MODE = import.meta.env.DEV;

const ADMIN_NAV_ITEMS: {
  id: NavTab;
  label: string;
  icon: typeof ShoppingBag;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pos', label: 'POS Billing', icon: ShoppingBag },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'purchases', label: 'Purchases & Suppliers', icon: Truck },
  { id: 'parties', label: 'Parties & Ledger', icon: Users },
  { id: 'reports', label: 'Reports & Expenses', icon: BarChart3 },
  { id: 'printer', label: 'Printer & Sales', icon: Printer },
  { id: 'settings', label: 'Settings', icon: Settings },
  ...(IS_DEBUG_MODE
    ? [{ id: 'dart' as NavTab, label: 'Flutter / Dart Source', icon: Code2 }]
    : []),
];

const USER_NAV_ITEMS: {
  id: NavTab;
  label: string;
  icon: typeof ShoppingBag;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pos', label: 'POS Billing', icon: ShoppingBag },
  { id: 'inventory', label: 'Inventory & Expiry', icon: Package },
  { id: 'receipts', label: 'My Receipts', icon: Receipt },
];

const SESSION_STORAGE_KEY = 'clinix_pos_session_v1';

function loadSession(): StaffSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffSession>;
    if (!parsed?.username) return null;
    const roleKey =
      parsed.roleKey === 'admin' ||
      parsed.roleKey === 'manager' ||
      parsed.roleKey === 'cashier' ||
      parsed.roleKey === 'sales' ||
      parsed.roleKey === 'user'
        ? parsed.roleKey
        : parsed.username === 'admin'
          ? 'admin'
          : parsed.username === 'manager'
            ? 'manager'
            : 'user';
    return {
      username: parsed.username,
      displayName: parsed.displayName || parsed.username,
      roleKey,
      role:
        roleKey === 'admin'
          ? 'Admin'
          : roleKey === 'manager'
            ? 'Manager'
            : 'User (Limited Access)',
      loggedInAt: parsed.loggedInAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<StaffSession | null>(() =>
    loadSession(),
  );
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [items, setItems] = useState<PharmacyItem[]>(() => loadItems());
  const [parties, setParties] = useState<Party[]>(() => loadParties());
  const [sales, setSales] = useState<SaleRecord[]>(() => loadSales());
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(() =>
    loadPurchases(),
  );
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() =>
    loadExpenses(),
  );
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() =>
    loadPrinterConfig(),
  );
  const [settings, setSettings] = useState<PharmacySettings>(() =>
    loadSettings(),
  );
  const [activeInvoice, setActiveInvoice] = useState<SaleRecord | null>(null);
  const [shouldAutoPrintInvoice, setShouldAutoPrintInvoice] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => loadThemePreference());

  useEffect(() => {
    applyThemePreference(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const isLimitedUser = !isManagerOrAdminRole(session?.roleKey);

  const handleLoginSuccess = (nextSession: StaffSession) => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    } catch {
      // Ignore storage errors
    }
    setSession(nextSession);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    setSession(null);
    setActiveTab('dashboard');
    setActiveInvoice(null);
    setMobileMenuOpen(false);
  };

  const handleCompleteSale = (params: {
    cartLines: CartLine[];
    billDiscount: number;
    paymentMode: PaymentMode;
    party: Party | null;
    transactionReference?: string;
    cashReceived?: number;
  }) => {
    if (!session) return;
    const enforcedPaymentMode: PaymentMode =
      isLimitedUser && isCreditPaymentMode(params.paymentMode)
        ? 'Cash'
        : params.paymentMode;
    const enforcedParty = isLimitedUser ? null : params.party;

    const result = executeSaleTransaction({
      cartLines: params.cartLines,
      billDiscount: params.billDiscount,
      paymentMode: enforcedPaymentMode,
      party: enforcedParty,
      transactionReference: params.transactionReference,
      cashReceived: params.cashReceived,
      createdBy: session.username,
      createdByName: session.displayName,
      currentItems: items,
      currentParties: parties,
      currentSales: sales,
    });
    setItems(result.updatedItems);
    setParties(result.updatedParties);
    setSales(result.updatedSales);
    setShouldAutoPrintInvoice(settings.autoPrintReceipt);
    setActiveInvoice(result.sale);
  };

  const handleCompletePurchase = (params: {
    supplier: Party;
    supplierInvoiceNo: string;
    lines: PurchaseDraftLine[];
    paidAmount: number;
    paymentMode: PaymentMode;
  }) => {
    if (isLimitedUser) return;
    const result = executePurchaseTransaction({
      ...params,
      currentItems: items,
      currentParties: parties,
      currentPurchases: purchases,
    });
    setItems(result.updatedItems);
    setParties(result.updatedParties);
    setPurchases(result.updatedPurchases);
  };

  const handleAddSupplier = (payload: {
    name: string;
    phone: string;
    balance: number;
  }): Party => {
    if (isLimitedUser) {
      throw new Error('Unauthorized action for limited user.');
    }
    const nextId = parties.reduce((max, p) => Math.max(max, p.id), 0) + 1;
    const created: Party = {
      id: nextId,
      name: payload.name,
      phone: payload.phone,
      type: 'supplier',
      balance: payload.balance,
    };
    const next = [...parties, created];
    setParties(next);
    saveParties(next);
    return created;
  };

  const handleSaveItem = (
    payload: Omit<PharmacyItem, 'id'> & { id?: number },
  ) => {
    if (isLimitedUser) return;
    const safeUnitsPerBox = Number.isFinite(payload.unitsPerBox)
      ? Math.max(1, Math.floor(payload.unitsPerBox))
      : 1;
    const safeBoxCost = Number.isFinite(payload.boxCostPrice)
      ? Math.max(0, payload.boxCostPrice)
      : 0;
    const safeBoxSelling = Number.isFinite(payload.boxSellingPrice)
      ? Math.max(0, payload.boxSellingPrice)
      : 0;
    const safeCost = calculateUnitPrice(safeBoxCost, safeUnitsPerBox);
    const safeSelling = calculateUnitPrice(safeBoxSelling, safeUnitsPerBox);
    const safeStock = Number.isFinite(payload.stockQuantity)
      ? Math.max(0, Math.floor(payload.stockQuantity))
      : 0;

    let next: PharmacyItem[];
    if (payload.id) {
      const sanitized: PharmacyItem = {
        ...payload,
        id: payload.id,
        name: payload.name.trim(),
        barcode:
          payload.barcode.trim() ||
          `89640010${String(payload.id).padStart(4, '0')}`,
        category: payload.category.trim() || 'General',
        unitsPerBox: safeUnitsPerBox,
        boxCostPrice: safeBoxCost,
        boxSellingPrice: safeBoxSelling,
        costPrice: safeCost,
        sellingPrice: safeSelling,
        stockQuantity: safeStock,
        unit: payload.unit.trim() || 'Tablet',
        batchNumber:
          payload.batchNumber.trim() || `BAT-${String(payload.id).padStart(4, '0')}`,
        expiryDate: payload.expiryDate || '2027-12-31',
      };
      next = items.map((it) => (it.id === payload.id ? sanitized : it));
    } else {
      const nextId = items.reduce((max, it) => Math.max(max, it.id), 0) + 1;
      const created: PharmacyItem = {
        ...payload,
        id: nextId,
        name: payload.name.trim(),
        barcode:
          payload.barcode.trim() ||
          `89640010${String(nextId).padStart(4, '0')}`,
        category: payload.category.trim() || 'General',
        unitsPerBox: safeUnitsPerBox,
        boxCostPrice: safeBoxCost,
        boxSellingPrice: safeBoxSelling,
        costPrice: safeCost,
        sellingPrice: safeSelling,
        stockQuantity: safeStock,
        unit: payload.unit.trim() || 'Tablet',
        batchNumber:
          payload.batchNumber.trim() || `BAT-${String(nextId).padStart(4, '0')}`,
        expiryDate: payload.expiryDate || '2027-12-31',
      };
      next = [created, ...items];
    }

    saveItems(next);
    setItems(next);
  };

  const handleDeleteItem = (id: number) => {
    if (isLimitedUser) return;
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      saveItems(next);
      return next;
    });
  };

  const handleImportItems = (
    parsedRows: ParsedCsvProductRow[],
    strategy: CsvDuplicateStrategy,
  ): { addedCount: number; updatedCount: number; skippedCount: number } => {
    if (isLimitedUser) {
      return { addedCount: 0, updatedCount: 0, skippedCount: parsedRows.length };
    }
    const result = buildImportedInventoryResult({
      existingItems: items,
      parsedRows,
      strategy,
    });
    saveItems(result.nextItems);
    setItems(result.nextItems);
    return {
      addedCount: result.addedCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
    };
  };

  const handleAddParty = (payload: Omit<Party, 'id'>) => {
    if (isLimitedUser) return;
    setParties((prev) => {
      const nextId = prev.reduce((max, p) => Math.max(max, p.id), 0) + 1;
      const next = [...prev, { ...payload, id: nextId }];
      saveParties(next);
      return next;
    });
  };

  const handleSettleBalance = (partyId: number, amount: number) => {
    if (isLimitedUser) return;
    setParties((prev) => {
      const next = prev.map((p) =>
        p.id === partyId
          ? { ...p, balance: Math.max(0, p.balance - amount) }
          : p,
      );
      saveParties(next);
      return next;
    });
  };

  const handleUpdatePrinterConfig = (next: PrinterConfig) => {
    if (isLimitedUser) return;
    setPrinterConfig(next);
    savePrinterConfig(next);
    const updatedSettings = saveSettings({
      ...settings,
      savedPrinterName: next.deviceName,
      savedPrinterMac: next.macAddress,
      paperWidth: next.paperWidth,
      autoPrintReceipt: next.autoPrintOnSale,
    });
    setSettings(updatedSettings);
  };

  const handleSaveSettings = (next: PharmacySettings) => {
    if (isLimitedUser) return;
    const saved = saveSettings(next);
    setSettings(saved);
    setPrinterConfig({
      deviceName: saved.savedPrinterName || 'Thermal Printer',
      macAddress: saved.savedPrinterMac,
      paperWidth: saved.paperWidth,
      autoPrintOnSale: saved.autoPrintReceipt,
    });
  };

  const handleResetSettings = () => {
    if (isLimitedUser) return;
    const restored = resetSettingsToDefaults();
    setSettings(restored);
    setPrinterConfig({
      deviceName: restored.savedPrinterName,
      macAddress: restored.savedPrinterMac,
      paperWidth: restored.paperWidth,
      autoPrintOnSale: restored.autoPrintReceipt,
    });
  };

  const handleAddExpense = (
    payload: Omit<ExpenseRecord, 'id' | 'createdAt'>,
  ) => {
    if (isLimitedUser) return;
    setExpenses((prev) => {
      const nextId = prev.reduce((max, e) => Math.max(max, e.id), 0) + 1;
      const created: ExpenseRecord = {
        ...payload,
        id: nextId,
        createdAt: new Date().toISOString(),
      };
      const next = [created, ...prev];
      saveExpenses(next);
      return next;
    });
  };

  const handleDeleteExpense = (id: number) => {
    if (isLimitedUser) return;
    setExpenses((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveExpenses(next);
      return next;
    });
  };

  const handleResetDemo = () => {
    if (isLimitedUser) return;
    const restored = resetDemoDatabase();
    setItems(restored.items);
    setParties(restored.parties);
    setSales(restored.sales);
    setPurchases(restored.purchases);
    setExpenses(restored.expenses);
    setPrinterConfig(restored.printer);
    setSettings(restored.settings);
    setActiveInvoice(null);
    setShouldAutoPrintInvoice(false);
  };

  if (!session) {
    return (
      <LoginScreen
        theme={theme}
        onToggleTheme={toggleTheme}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  const visibleNavItems = isLimitedUser ? USER_NAV_ITEMS : ADMIN_NAV_ITEMS;
  const resolvedActiveTab: NavTab = visibleNavItems.some(
    (n) => n.id === activeTab,
  )
    ? activeTab
    : 'dashboard';
  const activeNavMeta =
    visibleNavItems.find((n) => n.id === resolvedActiveTab) ??
    visibleNavItems[0];

  const mySales = isLimitedUser
    ? sales.filter((s) => s.createdBy === session.username)
    : sales;

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-white px-4 py-5 dark:bg-slate-900">
      <div>
        <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <h1 className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {settings.pharmacyName}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {settings.branchAddress}
          </p>
        </div>

        <nav className="mt-5 space-y-1" aria-label="Main Workspace Navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = resolvedActiveTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#0D7A5F] text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">
          <p className="font-medium text-slate-800 dark:text-slate-200">
            {session.displayName}
          </p>
          <p className="mt-0.5 font-mono-tabular">
            {session.role} · {items.length} SKUs
          </p>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-3.5 w-3.5 text-amber-400" />
              <span>Day Mode (Light)</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 text-slate-600" />
              <span>Night Shift (Dark)</span>
            </>
          )}
        </button>
        {!isLimitedUser && (
          <button
            type="button"
            onClick={handleResetDemo}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Demo Data</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-800 dark:hover:bg-red-950/60 dark:hover:text-red-300"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  const isPosView = resolvedActiveTab === 'pos';

  return (
    <div
      className={`flex bg-[#F8FAFC] text-[#0F172A] transition-colors duration-150 dark:bg-[#0B1120] dark:text-[#F1F5F9] ${
        isPosView ? 'h-dvh overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden w-[252px] shrink-0 border-r border-slate-200 dark:border-slate-800 lg:block">
        <div className="sticky top-0 h-screen">{renderSidebarContent()}</div>
      </aside>

      {/* Mobile / Tablet Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-64 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div
        className={`flex min-w-0 flex-1 flex-col ${
          isPosView ? 'h-dvh overflow-hidden' : ''
        }`}
      >
        {/* Top Header / AppBar */}
        <header
          className={`sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-900 sm:px-5 ${
            isPosView ? 'h-12 py-1.5' : 'py-3.5 sm:px-6'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              {!isPosView && (
                <>
                  <span className="hidden font-medium text-slate-500 dark:text-slate-400 sm:inline">
                    Clinix Pharmacy
                  </span>
                  <span className="hidden text-slate-300 dark:text-slate-700 sm:inline">
                    /
                  </span>
                </>
              )}
              <span className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {activeNavMeta.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              title={
                theme === 'dark'
                  ? 'Switch to Day Mode (Light)'
                  : 'Switch to Night Shift Mode (Dark)'
              }
              aria-label={
                theme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              className={`flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${
                isPosView
                  ? 'min-h-[38px] min-w-[38px] px-2.5'
                  : 'px-3 py-2'
              }`}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-4 w-4 text-amber-400" />
                  {!isPosView && <span className="hidden sm:inline">Day Mode</span>}
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-slate-600" />
                  {!isPosView && (
                    <span className="hidden sm:inline">Night Mode</span>
                  )}
                </>
              )}
            </button>
            {resolvedActiveTab !== 'pos' && (
              <button
                type="button"
                onClick={() => setActiveTab('pos')}
                className="rounded-lg bg-[#0D7A5F] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#0A634D]"
              >
                Open Live POS
              </button>
            )}
            {IS_DEBUG_MODE &&
              !isLimitedUser &&
              !isPosView &&
              (resolvedActiveTab !== 'dart' ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('dart')}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Inspect Dart Source
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Back to Dashboard
                </button>
              ))}
          </div>
        </header>

        {/* Workspace Viewport */}
        <main
          className={
            isPosView
              ? 'flex min-h-0 w-full flex-1 flex-col overflow-hidden'
              : 'mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6'
          }
        >
          {resolvedActiveTab === 'dashboard' && (
            <DashboardWorkspace
              session={session}
              items={items}
              parties={parties}
              sales={sales}
              purchases={purchases}
              theme={theme}
              onGoToPos={() => setActiveTab('pos')}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenInvoiceModal={(sale) => {
                setShouldAutoPrintInvoice(false);
                setActiveInvoice(sale);
              }}
            />
          )}

          {resolvedActiveTab === 'pos' && (
            <PosWorkspace
              items={items}
              parties={parties}
              limitedAccess={
                isLimitedUser || !isManagerOrAdminRole(settings.activeRole)
              }
              settings={settings}
              onCompleteSale={handleCompleteSale}
            />
          )}

          {resolvedActiveTab === 'inventory' && (
            <InventoryWorkspace
              items={items}
              readOnly={isLimitedUser}
              defaultLowStockThreshold={settings.lowStockThreshold}
              nearExpiryDays={settings.nearExpiryDays}
              onSaveItem={handleSaveItem}
              onDeleteItem={handleDeleteItem}
              onImportItems={handleImportItems}
            />
          )}

          {resolvedActiveTab === 'receipts' && (
            <MyReceiptsWorkspace
              sales={mySales}
              staffName={session.displayName}
              onOpenInvoiceModal={(sale) => {
                setShouldAutoPrintInvoice(false);
                setActiveInvoice(sale);
              }}
            />
          )}

          {!isLimitedUser && resolvedActiveTab === 'purchases' && (
            <PurchasesWorkspace
              items={items}
              parties={parties}
              purchases={purchases}
              onCompletePurchase={handleCompletePurchase}
              onAddSupplier={handleAddSupplier}
              onSettleSupplierBalance={handleSettleBalance}
            />
          )}

          {!isLimitedUser && resolvedActiveTab === 'parties' && (
            <PartiesWorkspace
              parties={parties}
              onAddParty={handleAddParty}
              onSettleBalance={handleSettleBalance}
            />
          )}

          {!isLimitedUser && resolvedActiveTab === 'reports' && (
            <ReportsAndExpensesWorkspace
              sales={sales}
              expenses={expenses}
              theme={theme}
              onAddExpense={handleAddExpense}
              onDeleteExpense={handleDeleteExpense}
              onOpenInvoiceModal={(sale) => {
                setShouldAutoPrintInvoice(false);
                setActiveInvoice(sale);
              }}
            />
          )}

          {!isLimitedUser && resolvedActiveTab === 'printer' && (
            <PrinterAndSalesWorkspace
              sales={sales}
              printerConfig={printerConfig}
              theme={theme}
              onUpdatePrinterConfig={handleUpdatePrinterConfig}
              onOpenInvoiceModal={(sale) => {
                setShouldAutoPrintInvoice(false);
                setActiveInvoice(sale);
              }}
            />
          )}

          {!isLimitedUser && resolvedActiveTab === 'settings' && (
            <SettingsWorkspace
              settings={settings}
              onSaveSettings={handleSaveSettings}
              onResetSettings={handleResetSettings}
              onExportBackup={exportDatabaseBackupJson}
              itemCount={items.length}
              saleCount={sales.length}
              partyCount={parties.length}
            />
          )}

          {IS_DEBUG_MODE && !isLimitedUser && resolvedActiveTab === 'dart' && (
            <DartSourceWorkspace />
          )}
        </main>
      </div>

      {/* Post-Sale / Reprint Thermal & A5 PDF Modal */}
      {activeInvoice && (
        <InvoiceModal
          sale={activeInvoice}
          defaultWidth={settings.paperWidth}
          settings={settings}
          autoPrint={shouldAutoPrintInvoice}
          onClose={() => {
            setActiveInvoice(null);
            setShouldAutoPrintInvoice(false);
          }}
        />
      )}
    </div>
  );
}
