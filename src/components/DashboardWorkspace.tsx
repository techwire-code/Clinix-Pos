import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Package,
  Printer,
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
  PurchaseRecord,
  SaleRecord,
} from '../types/pharmacy';
import { StaffSession } from './LoginScreen';

interface DashboardWorkspaceProps {
  session: StaffSession;
  items: PharmacyItem[];
  parties: Party[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  onGoToPos: () => void;
  onNavigateTab: (
    tab: 'pos' | 'inventory' | 'purchases' | 'parties' | 'printer',
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
  onGoToPos,
  onNavigateTab,
  onOpenInvoiceModal,
}) => {
  const lowStockThreshold = useMemo(() => {
    try {
      const saved = localStorage.getItem(THRESHOLD_STORAGE_KEY);
      const parsed = saved ? Number(saved) : 10;
      return Number.isFinite(parsed) && parsed >= 1 ? parsed : 10;
    } catch {
      return 10;
    }
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayStartMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();

    const todaysSales = sales.filter((sale) => {
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
        if (daysLeft < 0 || daysLeft > 30) return null;
        return { item, daysLeft };
      })
      .filter(
        (entry): entry is { item: PharmacyItem; daysLeft: number } =>
          entry !== null,
      )
      .sort((a, b) => a.daysLeft - b.daysLeft);

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

    const formattedDate = now.toLocaleDateString('en-PK', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    return {
      formattedDate,
      todayRevenue,
      todayProfit,
      todayCount: todaysSales.length,
      lowStockItems,
      expiring30Items,
      toCollect,
      toPay,
      stockRetailValue,
    };
  }, [items, parties, sales, lowStockThreshold]);

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
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <p className="font-mono-tabular text-xs text-slate-500">
            {stats.formattedDate} · Signed in as {session.displayName} (
            {session.role})
          </p>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-slate-900">
            Clinix Community Pharmacy Overview
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            17 KM Ferozepur Road, Lahore · Per-unit counter billing & stock
            control
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('inventory')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50"
          >
            <Package className="h-4 w-4 text-slate-600" />
            <span>Inventory</span>
          </button>
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

      {/* 4 Key Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">
            Today's Revenue
          </p>
          <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-[#0D7A5F]">
            PKR {stats.todayRevenue.toFixed(2)}
          </p>
          <p className="mt-1 font-mono-tabular text-xs text-slate-500">
            {stats.todayCount}{' '}
            {stats.todayCount === 1 ? 'transaction' : 'transactions'} today
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">
            Today's Net Profit
          </p>
          <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-slate-900">
            PKR {stats.todayProfit.toFixed(2)}
          </p>
          <p className="mt-1 font-mono-tabular text-xs text-slate-500">
            After item & bill discounts
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">
            Stock & Expiry Alerts
          </p>
          <p
            className={`mt-1.5 font-mono-tabular text-2xl font-bold ${
              stats.lowStockItems.length + stats.expiring30Items.length > 0
                ? 'text-amber-700'
                : 'text-[#0D7A5F]'
            }`}
          >
            {stats.lowStockItems.length} Low · {stats.expiring30Items.length}{' '}
            Exp
          </p>
          <p className="mt-1 font-mono-tabular text-xs text-slate-500">
            Below {lowStockThreshold} units · &le;30d expiry
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">
            Receivables / Payables
          </p>
          <p className="mt-1.5 font-mono-tabular text-xl font-bold text-slate-900">
            PKR {stats.toCollect.toLocaleString()}
          </p>
          <p className="mt-1 font-mono-tabular text-xs text-amber-700">
            To Pay Suppliers: PKR {stats.toPay.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Main Analytics + Action Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 7-Day Profit Chart */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                7-Day Daily Net Profit Trend
              </h3>
              <p className="text-xs text-slate-500">
                Revenue vs net margin across the past 7 days
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('printer')}
              className="text-xs font-semibold text-[#0D7A5F] hover:underline"
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
                    <stop offset="5%" stopColor="#0D7A5F" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#0D7A5F" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="#E2E8F0"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                />
                <Tooltip
                  formatter={(value) => [
                    `PKR ${Number(value ?? 0).toFixed(2)}`,
                    'Net Profit',
                  ]}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="netProfit"
                  stroke="#0D7A5F"
                  strokeWidth={2}
                  fill="url(#dashProfitFill)"
                  activeDot={{ r: 4, fill: '#0D7A5F' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Quick Navigation & Stock Alerts */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          {/* Quick Module Jump Grid */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Quick Workspace Shortcuts
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onGoToPos}
                className="flex items-center gap-2 rounded-lg border border-[#0D7A5F]/30 bg-[#0D7A5F]/[0.05] px-3 py-2.5 text-left text-xs font-semibold text-[#0D7A5F] hover:bg-[#0D7A5F]/[0.1]"
              >
                <ShoppingBag className="h-4 w-4 shrink-0" />
                <span>POS Billing</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('purchases')}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                <Truck className="h-4 w-4 shrink-0 text-slate-600" />
                <span>Purchases ({purchases.length})</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('parties')}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                <Users className="h-4 w-4 shrink-0 text-slate-600" />
                <span>Parties & Ledger</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('printer')}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                <Printer className="h-4 w-4 shrink-0 text-slate-600" />
                <span>Thermal & Invoices</span>
              </button>
            </div>
          </section>

          {/* Priority Attention Items */}
          <section className="flex-1 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Attention Needed
              </h3>
              <button
                type="button"
                onClick={() => onNavigateTab('inventory')}
                className="text-xs font-semibold text-[#0D7A5F] hover:underline"
              >
                View Inventory
              </button>
            </div>

            <div className="mt-3 space-y-2.5 text-xs">
              {stats.lowStockItems.slice(0, 2).map((item) => (
                <div
                  key={`low-${item.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                    <span className="truncate font-medium text-slate-900">
                      {item.name}
                    </span>
                  </div>
                  <span className="font-mono-tabular font-semibold text-amber-800 whitespace-nowrap">
                    {item.stockQuantity} {item.unit} left
                  </span>
                </div>
              ))}

              {stats.expiring30Items.slice(0, 2).map(({ item, daysLeft }) => (
                <div
                  key={`exp-${item.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-red-700" />
                    <span className="truncate font-medium text-slate-900">
                      {item.name}
                    </span>
                  </div>
                  <span className="font-mono-tabular font-semibold text-red-700 whitespace-nowrap">
                    Exp in {daysLeft}d
                  </span>
                </div>
              ))}

              {stats.lowStockItems.length === 0 &&
                stats.expiring30Items.length === 0 && (
                  <p className="py-4 text-center text-slate-500">
                    All inventory stock and expiry dates are healthy.
                  </p>
                )}
            </div>
          </section>
        </div>
      </div>

      {/* Recent Sales Activity */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-slate-900">
            Recent POS Bills
          </h3>
          <span className="font-mono-tabular text-xs text-slate-500">
            Stock Retail Value: PKR {stats.stockRetailValue.toLocaleString()}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-2.5">Invoice #</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Payment Mode</th>
                <th className="px-4 py-2.5 text-right">Net Payable</th>
                <th className="px-5 py-2.5 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.slice(0, 5).map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-2.5 font-mono-tabular font-semibold text-slate-900">
                    {sale.invoiceNumber}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {sale.partyName}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {sale.paymentMode}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold text-[#0D7A5F]">
                    PKR {sale.netPayable.toFixed(2)}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenInvoiceModal(sale)}
                      className="text-xs font-semibold text-[#0D7A5F] hover:underline"
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
    </div>
  );
};
