import { useState } from 'react';
import {
  Code2,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Printer,
  RotateCcw,
  ShoppingBag,
  Truck,
  Users,
  X,
} from 'lucide-react';
import {
  CartLine,
  Party,
  PaymentMode,
  PharmacyItem,
  PrinterConfig,
  PurchaseDraftLine,
  PurchaseRecord,
  SaleRecord,
} from './types/pharmacy';
import {
  calculateUnitPrice,
  executePurchaseTransaction,
  executeSaleTransaction,
  loadItems,
  loadParties,
  loadPrinterConfig,
  loadPurchases,
  loadSales,
  resetDemoDatabase,
  saveItems,
  saveParties,
  savePrinterConfig,
} from './services/localDb';
import { LoginScreen, StaffSession } from './components/LoginScreen';
import { DashboardWorkspace } from './components/DashboardWorkspace';
import { PosWorkspace } from './components/PosWorkspace';
import { InventoryWorkspace } from './components/InventoryWorkspace';
import { PurchasesWorkspace } from './components/PurchasesWorkspace';
import { PartiesWorkspace } from './components/PartiesWorkspace';
import { PrinterAndSalesWorkspace } from './components/PrinterAndSalesWorkspace';
import { DartSourceWorkspace } from './components/DartSourceWorkspace';
import { InvoiceModal } from './components/InvoiceModal';

type NavTab =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'purchases'
  | 'parties'
  | 'printer'
  | 'dart';

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof ShoppingBag }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pos', label: 'POS Billing', icon: ShoppingBag },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'purchases', label: 'Purchases & Suppliers', icon: Truck },
  { id: 'parties', label: 'Parties & Ledger', icon: Users },
  { id: 'printer', label: 'Printer & Sales', icon: Printer },
  { id: 'dart', label: 'Flutter / Dart Source', icon: Code2 },
];

const SESSION_STORAGE_KEY = 'clinix_pos_session_v1';

function loadSession(): StaffSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffSession;
    return parsed?.username ? parsed : null;
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
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() =>
    loadPrinterConfig(),
  );
  const [activeInvoice, setActiveInvoice] = useState<SaleRecord | null>(null);

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
    setActiveInvoice(null);
    setMobileMenuOpen(false);
  };

  const handleCompleteSale = (params: {
    cartLines: CartLine[];
    billDiscount: number;
    paymentMode: PaymentMode;
    party: Party | null;
  }) => {
    const result = executeSaleTransaction({
      ...params,
      currentItems: items,
      currentParties: parties,
      currentSales: sales,
    });
    setItems(result.updatedItems);
    setParties(result.updatedParties);
    setSales(result.updatedSales);
    setActiveInvoice(result.sale);
  };

  const handleCompletePurchase = (params: {
    supplier: Party;
    supplierInvoiceNo: string;
    lines: PurchaseDraftLine[];
    paidAmount: number;
    paymentMode: PaymentMode;
  }) => {
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
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      saveItems(next);
      return next;
    });
  };

  const handleAddParty = (payload: Omit<Party, 'id'>) => {
    setParties((prev) => {
      const nextId = prev.reduce((max, p) => Math.max(max, p.id), 0) + 1;
      const next = [...prev, { ...payload, id: nextId }];
      saveParties(next);
      return next;
    });
  };

  const handleSettleBalance = (partyId: number, amount: number) => {
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
    setPrinterConfig(next);
    savePrinterConfig(next);
  };

  const handleResetDemo = () => {
    const restored = resetDemoDatabase();
    setItems(restored.items);
    setParties(restored.parties);
    setSales(restored.sales);
    setPurchases(restored.purchases);
    setPrinterConfig(restored.printer);
    setActiveInvoice(null);
  };

  if (!session) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const activeNavMeta =
    NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-white px-4 py-5">
      <div>
        <div className="border-b border-slate-200 pb-4">
          <h1 className="font-display text-base font-bold tracking-tight text-slate-900">
            Clinix Community Pharmacy
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            17 KM Ferozepur Road, Lahore
          </p>
        </div>

        <nav className="mt-5 space-y-1" aria-label="Main Workspace Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
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
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-4">
        <div className="mb-1 text-xs text-slate-500">
          <p className="font-medium text-slate-800">{session.displayName}</p>
          <p className="mt-0.5 font-mono-tabular">
            {session.role} · {items.length} SKUs
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetDemo}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Demo Data</span>
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-[252px] shrink-0 border-r border-slate-200 lg:block">
        <div className="sticky top-0 h-screen">{renderSidebarContent()}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-64 border-r border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden font-medium text-slate-500 sm:inline">
                Clinix Pharmacy
              </span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="truncate font-semibold text-slate-900">
                {activeNavMeta.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {activeTab !== 'pos' && (
              <button
                type="button"
                onClick={() => setActiveTab('pos')}
                className="rounded-lg bg-[#0D7A5F] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#0A634D]"
              >
                Open Live POS
              </button>
            )}
            {activeTab !== 'dart' ? (
              <button
                type="button"
                onClick={() => setActiveTab('dart')}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50"
              >
                Inspect Dart Source
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50"
              >
                Back to Dashboard
              </button>
            )}
          </div>
        </header>

        {/* Workspace Viewport */}
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6">
          {activeTab === 'dashboard' && (
            <DashboardWorkspace
              session={session}
              items={items}
              parties={parties}
              sales={sales}
              purchases={purchases}
              onGoToPos={() => setActiveTab('pos')}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenInvoiceModal={(sale) => setActiveInvoice(sale)}
            />
          )}

          {activeTab === 'pos' && (
            <PosWorkspace
              items={items}
              parties={parties}
              onCompleteSale={handleCompleteSale}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryWorkspace
              items={items}
              onSaveItem={handleSaveItem}
              onDeleteItem={handleDeleteItem}
            />
          )}

          {activeTab === 'purchases' && (
            <PurchasesWorkspace
              items={items}
              parties={parties}
              purchases={purchases}
              onCompletePurchase={handleCompletePurchase}
              onAddSupplier={handleAddSupplier}
              onSettleSupplierBalance={handleSettleBalance}
            />
          )}

          {activeTab === 'parties' && (
            <PartiesWorkspace
              parties={parties}
              onAddParty={handleAddParty}
              onSettleBalance={handleSettleBalance}
            />
          )}

          {activeTab === 'printer' && (
            <PrinterAndSalesWorkspace
              sales={sales}
              printerConfig={printerConfig}
              onUpdatePrinterConfig={handleUpdatePrinterConfig}
              onOpenInvoiceModal={(sale) => setActiveInvoice(sale)}
            />
          )}

          {activeTab === 'dart' && <DartSourceWorkspace />}
        </main>
      </div>

      {/* Post-Sale / Reprint Thermal & A5 PDF Modal */}
      {activeInvoice && (
        <InvoiceModal
          sale={activeInvoice}
          defaultWidth={printerConfig.paperWidth}
          onClose={() => setActiveInvoice(null)}
        />
      )}
    </div>
  );
}
