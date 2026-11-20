import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Package,
  Printer,
  Receipt,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Party,
  PharmacyItem,
  PharmacySettings,
  PurchaseRecord,
  SaleRecord,
} from '../types/pharmacy';
import { formatDateBySettings, formatMoney } from '../services/localDb';
import { isManagerOrAdminRole, StaffSession } from './LoginScreen';
import { ThemeMode } from '../services/themeService';

interface DashboardWorkspaceProps {
  session: StaffSession;
  items: PharmacyItem[];
  parties: Party[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  settings?: PharmacySettings;
  theme?: ThemeMode;
  onGoToPos: () => void;
  onNavigateTab: (
    tab:
      | 'pos'
      | 'inventory'
      | 'purchases'
      | 'parties'
      | 'printer'
      | 'reports'
      | 'receipts',
  ) => void;
  onOpenInvoiceModal: (sale: SaleRecord) => void;
}

const THRESHOLD_STORAGE_KEY = 'clinix_low_stock_threshold_v1';

export const DashboardWorkspace: React.FC<DashboardWorkspaceProps> = ({
  session,
  items,
  parties,
  sales,
  purchases,
  settings,
  theme = 'light',
  onGoToPos,
  onNavigateTab,
  onOpenInvoiceModal,
}) => {
  const isLimitedUser = !isManagerOrAdminRole(session.roleKey);
  const isDark = theme === 'dark';

  const expiryAlertDays = Math.max(1, settings?.expiryAlertDays ?? 30);

  const lowStockThreshold = useMemo(() => {
    if (
      settings?.lowStockThreshold !== undefined &&
      Number.isFinite(settings.lowStockThreshold) &&
      settings.lowStockThreshold >= 1
    ) {
      return settings.lowStockThreshold;
    }
    try {
      const saved = localStorage.getItem(THRESHOLD_STORAGE_KEY);
      const parsed = saved ? Number(saved) : 10;
      return Number.isFinite(parsed) && parsed >= 1 ? parsed : 10;
    } catch {
      return 10;
    }
  }, [settings?.lowStockThreshold]);

  const scopedSales = useMemo(() => {
    if (!isLimitedUser) return sales;
    return sales.filter((s) => s.createdBy === session.username);
  }, [sales, isLimitedUser, session.username]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayStartMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();

    const todaysSales = scopedSales.filter((sale) => {
      const dt = new Date(sale.createdAt);
      if (Number.isNaN(dt.getTime())) return false;
      const saleKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      return saleKey === todayKey;
    });

    const todayRevenue = todaysSales.reduce((s, r) => s + r.netPayable, 0);
    const todayProfit = todaysSales.reduce((s, r) => s + r.netProfit, 0);

    const lowStockItems = items
      .filter((i) => i.stockQuantity < lowStockThreshold)
      .sort((a, b) => a.stockQuantity - b.stockQuantity);

    const expiring30Items = items
      .map((item) => {
        const dt = new Date(`${item.expiryDate}T00:00:00`);
        if (Number.isNaN(dt.getTime())) return null;
        const daysLeft = Math.round(
          (dt.getTime() - todayStartMs) / (1000 * 60 * 60 * 24),
        );
        if (daysLeft < 0 || daysLeft > expiryAlertDays) return null;
        return { item, daysLeft };
      })
      .filter(
        (entry): entry is { item: PharmacyItem; daysLeft: number } =>
          entry !== null,
      )
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const availableSkus = items.filter((i) => i.stockQuantity > 0).length;

    const toCollect = parties
      .filter((p) => p.type === 'customer')
      .reduce((s, p) => s + p.balance, 0);
    const toPay = parties
      .filter((p) => p.type === 'supplier')
      .reduce((s, p) => s + p.balance, 0);

    const stockRetailValue = items.reduce(
      (s, i) => s + i.sellingPrice * i.stockQuantity,
      0,
    );

    const formattedDate = formatDateBySettings(now, settings);

    return {
      formattedDate,
      todayRevenue,
      todayProfit,
      todayCount: todaysSales.length,
      lowStockItems,
      expiring30Items,
      availableSkus,
      toCollect,
      toPay,
      stockRetailValue,
    };
  }, [items, parties, scopedSales, lowStockThreshold, expiryAlertDays, settings]);

  const sevenDaySeries = useMemo(() => {
    const now = new Date();
    const buckets: {
      dateKey: string;
      label: string;
      netProfit: number;
      revenue: number;
    }[] = [];
    const map = new Map<string, (typeof buckets)[number]>();

    for (let offset = 6; offset >= 0; offset--) {
      const dt = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - offset,
      );
      const dateKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const label = dt.toLocaleDateString('en-PK', {
        month: 'short',
        day: 'numeric',
      });
      const row = { dateKey, label, netProfit: 0, revenue: 0 };
      buckets.push(row);
      map.set(dateKey, row);
    }

    for (const sale of sales) {
      const dt = new Date(sale.createdAt);
      if (Number.isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const target = map.get(key);
      if (target) {
        target.netProfit += sale.netProfit;
        target.revenue += sale.netPayable;
      }
    }

    return buckets;
  }, [sales]);

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome & Primary POS Action Banner */}
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div>
          <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
            {stats.formattedDate} · Signed in as {session.displayName} (
            {session.role})
          </p>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {settings?.pharmacyName || 'Clinix Community Pharmacy'}{' '}
            {isLimitedUser ? 'Counter' : 'Overview'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {settings?.address || '17 KM Ferozepur Road, Lahore'} ·{' '}
            {isLimitedUser
              ? 'POS billing, read-only stock & expiry, and your own receipts'
              : 'Per-unit counter billing & stock control'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('inventory')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Package className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            <span>{isLimitedUser ? 'Inventory & Expiry' : 'Inventory'}</span>
          </button>
          {isLimitedUser && (
            <button
              type="button"
              onClick={() => onNavigateTab('receipts')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Receipt className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              <span>My Receipts</span>
            </button>
          )}
          <button
            type="button"
            onClick={onGoToPos}
            className="flex items-center gap-2 rounded-lg bg-[#0D7A5F] px-5 py-2.5 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#0A634D]"
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Open POS Billing</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Key Metrics */}
      {isLimitedUser ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              My Bills Today
            </p>
            <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-[#0D7A5F] dark:text-emerald-400">
              {stats.todayCount}
            </p>
            <p className="mt-1 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              {scopedSales.length} total receipts by you
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Available Medicines
            </p>
            <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
              {stats.availableSkus} / {items.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              SKUs in stock for POS sale
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Low Stock Alerts
            </p>
            <p
              className={`mt-1.5 font-mono-tabular text-2xl font-bold ${
                stats.lowStockItems.length > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[#0D7A5F] dark:text-emerald-400'
              }`}
            >
              {stats.lowStockItems.length}
            </p>
            <p className="mt-1 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              Below {lowStockThreshold} units (read-only)
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {expiryAlertDays}-Day Expiry Report
            </p>
            <p
              className={`mt-1.5 font-mono-tabular text-2xl font-bold ${
                stats.expiring30Items.length > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-[#0D7A5F] dark:text-emerald-400'
              }`}
            >
              {stats.expiring30Items.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Batches expiring within {expiryAlertDays} days
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Today's Revenue
            </p>
            <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-[#0D7A5F] dark:text-emerald-400">
              {formatMoney(stats.todayRevenue, settings)}
            </p>
            <p className="mt-1 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              {stats.todayCount}{' '}
              {stats.todayCount === 1 ? 'transaction' : 'transactions'} today
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Today's Net Profit
            </p>
            <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatMoney(stats.todayProfit, settings)}
            </p>
            <p className="mt-1 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              After item &amp; bill discounts
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Stock &amp; Expiry Alerts
            </p>
            <p
              className={`mt-1.5 font-mono-tabular text-2xl font-bold ${
                stats.lowStockItems.length + stats.expiring30Items.length > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[#0D7A5F] dark:text-emerald-400'
              }`}
            >
              {stats.lowStockItems.length} Low · {stats.expiring30Items.length}{' '}
              Exp
            </p>
            <p className="mt-1 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              Below {lowStockThreshold} units · &le;{expiryAlertDays}d expiry
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Receivables / Payables
            </p>
            <p className="mt-1.5 font-mono-tabular text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatMoney(stats.toCollect, settings)}
            </p>
            <p className="mt-1 font-mono-tabular text-xs text-amber-700 dark:text-amber-400">
              To Pay Suppliers: {formatMoney(stats.toPay, settings)}
            </p>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      {isLimitedUser ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Quick Shortcuts & Stock/Expiry Alerts */}
          <div className="flex flex-col gap-4 lg:col-span-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Permitted Counter Actions
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={onGoToPos}
                  className="flex items-center justify-between rounded-lg border border-[#0D7A5F]/30 bg-[#0D7A5F]/[0.05] px-3.5 py-2.5 text-left text-xs font-semibold text-[#0D7A5F] hover:bg-[#0D7A5F]/[0.1] dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                >
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 shrink-0" />
                    <span>POS Billing</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('inventory')}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                    <span>View Inventory &amp; 30-Day Expiry Report</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('receipts')}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                    <span>My Generated Receipts ({scopedSales.length})</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
            </section>

            <section className="flex-1 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Stock &amp; Expiry Notices (Read-Only)
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigateTab('inventory')}
                  className="text-xs font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
                >
                  Open Report
                </button>
              </div>

              <div className="mt-3 space-y-2.5 text-xs">
                {stats.lowStockItems.slice(0, 2).map((item) => (
                  <div
                    key={`low-${item.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-800/70 dark:bg-amber-950/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-mono-tabular font-semibold text-amber-800 whitespace-nowrap dark:text-amber-300">
                      {item.stockQuantity} {item.unit} left
                    </span>
                  </div>
                ))}

                {stats.expiring30Items.slice(0, 2).map(({ item, daysLeft }) => (
                  <div
                    key={`exp-${item.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 dark:border-red-800/70 dark:bg-red-950/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-red-700 dark:text-red-400" />
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-mono-tabular font-semibold text-red-700 whitespace-nowrap dark:text-red-300">
                      Exp in {daysLeft}d
                    </span>
                  </div>
                ))}

                {stats.lowStockItems.length === 0 &&
                  stats.expiring30Items.length === 0 && (
                    <p className="py-4 text-center text-slate-500 dark:text-slate-400">
                      All inventory stock and expiry dates are healthy.
                    </p>
                  )}
              </div>
            </section>
          </div>

          {/* My Recent Receipts Table */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  My Recent Receipts
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Bills generated under your account ({session.displayName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('receipts')}
                className="text-xs font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
              >
                View All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-5 py-2.5">Invoice #</th>
                    <th className="px-4 py-2.5">Payment Mode</th>
                    <th className="px-4 py-2.5 text-right">Net Payable</th>
                    <th className="px-5 py-2.5 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {scopedSales.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-12 text-center text-xs text-slate-500 dark:text-slate-400"
                      >
                        No bills generated by you yet. Open POS Billing to
                        create your first receipt.
                      </td>
                    </tr>
                  ) : (
                    scopedSales.slice(0, 6).map((sale) => (
                      <tr
                        key={sale.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                      >
                        <td className="px-5 py-2.5 font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                          {sale.invoiceNumber}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                          {sale.paymentMode}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                          {formatMoney(sale.netPayable, settings)}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenInvoiceModal(sale)}
                            className="text-xs font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
                          >
                            View Receipt
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* 7-Day Profit Chart */}
            <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    7-Day Daily Net Profit Trend
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Revenue vs net margin across the past 7 days
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('reports')}
                  className="text-xs font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
                >
                  Full Reports
                </button>
              </div>
              <div className="h-64 w-full px-4 py-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={sevenDaySeries}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="dashProfitFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={isDark ? '#34D399' : '#0D7A5F'}
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="95%"
                          stopColor={isDark ? '#34D399' : '#0D7A5F'}
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke={isDark ? '#1E293B' : '#E2E8F0'}
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }}
                      axisLine={{ stroke: isDark ? '#1E293B' : '#E2E8F0' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                      width={54}
                    />
                    <Tooltip
                      formatter={(value) => [
                        formatMoney(Number(value ?? 0), settings),
                        'Net Profit',
                      ]}
                      contentStyle={{
                        borderRadius: '8px',
                        border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                        color: isDark ? '#F1F5F9' : '#0F172A',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="netProfit"
                      stroke={isDark ? '#34D399' : '#0D7A5F'}
                      strokeWidth={2}
                      fill="url(#dashProfitFill)"
                      activeDot={{
                        r: 4,
                        fill: isDark ? '#34D399' : '#0D7A5F',
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Quick Navigation & Stock Alerts */}
            <div className="flex flex-col gap-4 lg:col-span-5">
              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Quick Workspace Shortcuts
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={onGoToPos}
                    className="flex items-center gap-2 rounded-lg border border-[#0D7A5F]/30 bg-[#0D7A5F]/[0.05] px-3 py-2.5 text-left text-xs font-semibold text-[#0D7A5F] hover:bg-[#0D7A5F]/[0.1] dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                  >
                    <ShoppingBag className="h-4 w-4 shrink-0" />
                    <span>POS Billing</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('purchases')}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Truck className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                    <span>Purchases ({purchases.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('parties')}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Users className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                    <span>Parties &amp; Ledger</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('reports')}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <BarChart3 className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                    <span>Reports &amp; Expenses</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('printer')}
                    className="col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Printer className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                    <span>Thermal &amp; Invoices</span>
                  </button>
                </div>
              </section>

              <section className="flex-1 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Attention Needed
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('inventory')}
                    className="text-xs font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
                  >
                    View Inventory
                  </button>
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  {stats.lowStockItems.slice(0, 2).map((item) => (
                    <div
                      key={`low-${item.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-800/70 dark:bg-amber-950/40"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                        <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                        </span>
                      </div>
                      <span className="font-mono-tabular font-semibold text-amber-800 whitespace-nowrap dark:text-amber-300">
                        {item.stockQuantity} {item.unit} left
                      </span>
                    </div>
                  ))}

                  {stats.expiring30Items.slice(0, 2).map(({ item, daysLeft }) => (
                    <div
                      key={`exp-${item.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 dark:border-red-800/70 dark:bg-red-950/40"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-red-700 dark:text-red-400" />
                        <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                        </span>
                      </div>
                      <span className="font-mono-tabular font-semibold text-red-700 whitespace-nowrap dark:text-red-300">
                        Exp in {daysLeft}d
                      </span>
                    </div>
                  ))}

                  {stats.lowStockItems.length === 0 &&
                    stats.expiring30Items.length === 0 && (
                      <p className="py-4 text-center text-slate-500 dark:text-slate-400">
                        All inventory stock and expiry dates are healthy.
                      </p>
                    )}
                </div>
              </section>
            </div>
          </div>

          {/* Recent Sales Activity */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Recent POS Bills
              </h3>
              <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                Stock Retail Value: {formatMoney(stats.stockRetailValue, settings)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-5 py-2.5">Invoice #</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Payment Mode</th>
                    <th className="px-4 py-2.5 text-right">Net Payable</th>
                    <th className="px-5 py-2.5 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sales.slice(0, 5).map((sale) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-5 py-2.5 font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        {sale.invoiceNumber}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                        {sale.partyName}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                        {sale.paymentMode}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                        {formatMoney(sale.netPayable, settings)}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenInvoiceModal(sale)}
                          className="text-xs font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
