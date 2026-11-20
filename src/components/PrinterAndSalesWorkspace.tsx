import React, { useMemo, useState } from 'react';
import {
  Bluetooth,
  Check,
  Download,
  FileText,
  Printer,
  Share2,
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
  PharmacySettings,
  PrinterConfig,
  SaleRecord,
  ThermalWidth,
} from '../types/pharmacy';
import {
  formatDateBySettings,
  formatMoney,
  getCurrencyLabel,
} from '../services/localDb';
import { downloadA5InvoicePdf, shareInvoiceSummary } from '../services/a5PdfGenerator';
import { ThemeMode } from '../services/themeService';

interface PrinterAndSalesWorkspaceProps {
  sales: SaleRecord[];
  printerConfig: PrinterConfig;
  settings?: PharmacySettings;
  theme?: ThemeMode;
  onUpdatePrinterConfig: (next: PrinterConfig) => void;
  onOpenInvoiceModal: (sale: SaleRecord) => void;
}

const SIMULATED_BLUETOOTH_DEVICES = [
  { name: 'Rongta RPP300 Bluetooth 80mm', mac: '00:11:22:33:44:55', rssi: -54 },
  { name: 'Xprinter XP-P300 Portable 58mm', mac: 'DC:0D:30:88:1A:42', rssi: -63 },
  { name: 'Bixolon SPP-R310 Plus', mac: '74:F0:7D:E2:19:08', rssi: -71 },
];

export const PrinterAndSalesWorkspace: React.FC<
  PrinterAndSalesWorkspaceProps
> = ({
  sales,
  printerConfig,
  settings,
  theme = 'light',
  onUpdatePrinterConfig,
  onOpenInvoiceModal,
}) => {
  const isDark = theme === 'dark';
  const cur = getCurrencyLabel(settings);
  const [isScanning, setIsScanning] = useState(false);
  const [btStatus, setBtStatus] = useState<string | null>(null);
  const [devices, setDevices] = useState(SIMULATED_BLUETOOTH_DEVICES);

  const totals = useMemo(() => {
    const grossSales = sales.reduce((s, r) => s + r.netPayable, 0);
    const totalDiscounts = sales.reduce((s, r) => s + r.discountAmount, 0);
    const totalProfit = sales.reduce((s, r) => s + r.netProfit, 0);
    return { grossSales, totalDiscounts, totalProfit };
  }, [sales]);

  const dailySummary = useMemo(() => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const todaysSales = sales.filter((sale) => {
      const dt = new Date(sale.createdAt);
      if (Number.isNaN(dt.getTime())) return false;
      const saleKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      return saleKey === todayKey;
    });

    const dailyRevenue = todaysSales.reduce((sum, s) => sum + s.netPayable, 0);
    const transactionCount = todaysSales.length;

    const qtyByItem = new Map<string, number>();
    for (const sale of todaysSales) {
      for (const line of sale.items) {
        qtyByItem.set(
          line.itemName,
          (qtyByItem.get(line.itemName) ?? 0) + line.quantity,
        );
      }
    }

    let mostSoldName: string | null = null;
    let mostSoldQty = 0;
    for (const [name, qty] of qtyByItem.entries()) {
      if (qty > mostSoldQty) {
        mostSoldName = name;
        mostSoldQty = qty;
      }
    }

    const formattedDate = formatDateBySettings(now, settings);

    return {
      formattedDate,
      dailyRevenue,
      transactionCount,
      mostSoldName,
      mostSoldQty,
    };
  }, [sales]);

  const sevenDayProfitData = useMemo(() => {
    const now = new Date();
    const dayBuckets: {
      dateKey: string;
      label: string;
      netProfit: number;
      revenue: number;
      transactions: number;
    }[] = [];

    const bucketMap = new Map<string, (typeof dayBuckets)[number]>();

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
      const entry = {
        dateKey,
        label,
        netProfit: 0,
        revenue: 0,
        transactions: 0,
      };
      dayBuckets.push(entry);
      bucketMap.set(dateKey, entry);
    }

    for (const sale of sales) {
      const dt = new Date(sale.createdAt);
      if (Number.isNaN(dt.getTime())) continue;
      const saleKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const target = bucketMap.get(saleKey);
      if (target) {
        target.netProfit += sale.netProfit;
        target.revenue += sale.netPayable;
        target.transactions += 1;
      }
    }

    const total7DayProfit = dayBuckets.reduce((s, d) => s + d.netProfit, 0);
    const avgDailyProfit = total7DayProfit / 7;

    return {
      series: dayBuckets,
      total7DayProfit,
      avgDailyProfit,
    };
  }, [sales]);

  const handleScanDevices = async () => {
    setIsScanning(true);
    setBtStatus('Scanning nearby Bluetooth Serial (SPP) thermal printers...');

    // Attempt Web Bluetooth if available in browser; gracefully fall back to paired list
    const navWithBt = navigator as Navigator & {
      bluetooth?: {
        requestDevice: (opts: { acceptAllDevices: boolean }) => Promise<{
          name?: string;
          id: string;
        }>;
      };
    };

    if (navWithBt.bluetooth) {
      try {
        const picked = await navWithBt.bluetooth.requestDevice({
          acceptAllDevices: true,
        });
        const newEntry = {
          name: picked.name || 'Paired Thermal Printer',
          mac: picked.id.slice(0, 17).toUpperCase(),
          rssi: -49,
        };
        setDevices((prev) => [newEntry, ...prev]);
        onUpdatePrinterConfig({
          ...printerConfig,
          deviceName: newEntry.name,
          macAddress: newEntry.mac,
        });
        setBtStatus(`Paired and saved ${newEntry.name} (${newEntry.mac})`);
        setIsScanning(false);
        return;
      } catch {
        // User cancelled native picker or sandbox blocks Web Bluetooth; fall back cleanly
      }
    }

    setTimeout(() => {
      setIsScanning(false);
      setBtStatus(
        'Bluetooth scan complete. Select a printer below to save its MAC address.',
      );
    }, 600);
  };

  const handleSaveDevice = (name: string, mac: string) => {
    onUpdatePrinterConfig({
      ...printerConfig,
      deviceName: name,
      macAddress: mac,
    });
    setBtStatus(`Saved default printer ${name} (${mac}) to local storage.`);
  };

  const handleTestReceipt = () => {
    const targetSale = sales[0];
    if (targetSale) {
      onOpenInvoiceModal(targetSale);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Daily Dashboard Summary Card */}
      <section
        aria-labelledby="daily-summary-heading"
        className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2
            id="daily-summary-heading"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            Daily Sales Summary
          </h2>
          <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
            {dailySummary.formattedDate} · Current Day Totals
          </p>
        </div>

        <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-slate-800">
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Daily Revenue
            </p>
            <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-[#0D7A5F] dark:text-emerald-400">
              {formatMoney(dailySummary.dailyRevenue, settings)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Net billed amount today
            </p>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Transactions
            </p>
            <p className="mt-1.5 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
              {dailySummary.transactionCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {dailySummary.transactionCount === 1
                ? 'Completed sale today'
                : 'Completed sales today'}
            </p>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Most Sold Item Today
            </p>
            {dailySummary.mostSoldName ? (
              <>
                <p
                  className="mt-1.5 truncate text-base font-bold text-slate-900 dark:text-slate-100"
                  title={dailySummary.mostSoldName}
                >
                  {dailySummary.mostSoldName}
                </p>
                <p className="mt-1 font-mono-tabular text-xs font-medium text-slate-600 dark:text-slate-400">
                  {dailySummary.mostSoldQty}{' '}
                  {dailySummary.mostSoldQty === 1 ? 'unit' : 'units'} dispensed
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-base font-semibold text-slate-500 dark:text-slate-400">
                  No sales yet
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Complete a POS bill to track top mover
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* All-Time Profit & Sales Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Net Sales Collected
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
            {formatMoney(totals.grossSales, settings)}
          </p>
          <p className="mt-0.5 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
            {sales.length} completed invoices
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Discounts Granted
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-amber-700 dark:text-amber-400">
            {formatMoney(totals.totalDiscounts, settings)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Deducted from gross margin
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Actual Net Profit
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-[#0D7A5F] dark:text-emerald-400">
            {formatMoney(totals.totalProfit, settings)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            After subtracting cost & discounts
          </p>
        </div>
      </div>

      {/* 7-Day Daily Profit Trend Chart */}
      <section
        aria-labelledby="profit-trend-heading"
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2
              id="profit-trend-heading"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              7-Day Daily Net Profit Trend
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Daily net profit after cost of goods and all item/bill discounts
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                7-Day Total:{' '}
              </span>
              <span className="font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                {formatMoney(sevenDayProfitData.total7DayProfit, settings)}
              </span>
            </div>
            <span
              className="text-slate-300 dark:text-slate-700"
              aria-hidden="true"
            >
              ·
            </span>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                Daily Avg:{' '}
              </span>
              <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                {formatMoney(sevenDayProfitData.avgDailyProfit, settings)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={sevenDayProfitData.series}
              margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient id="clinixProfitFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={isDark ? '#34D399' : '#0D7A5F'}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="95%"
                    stopColor={isDark ? '#34D399' : '#0D7A5F'}
                    stopOpacity={0.0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={isDark ? '#1E293B' : '#E2E8F0'}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }}
                axisLine={{ stroke: isDark ? '#334155' : '#E2E8F0' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }}
                axisLine={false}
                tickLine={false}
                width={62}
                tickFormatter={(val: number) => `${cur} ${val}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const point = payload[0].payload as {
                    label: string;
                    netProfit: number;
                    revenue: number;
                    transactions: number;
                  };
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {point.label}
                      </p>
                      <p className="mt-1 font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                        Net Profit: {formatMoney(point.netProfit, settings)}
                      </p>
                      <p className="mt-0.5 font-mono-tabular text-slate-600 dark:text-slate-300">
                        Revenue: {formatMoney(point.revenue, settings)}
                      </p>
                      <p className="mt-0.5 font-mono-tabular text-slate-500 dark:text-slate-400">
                        {point.transactions}{' '}
                        {point.transactions === 1 ? 'invoice' : 'invoices'}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="netProfit"
                stroke={isDark ? '#34D399' : '#0D7A5F'}
                strokeWidth={2.25}
                fillOpacity={1}
                fill="url(#clinixProfitFill)"
                activeDot={{
                  r: 5,
                  fill: isDark ? '#34D399' : '#0D7A5F',
                  stroke: isDark ? '#0F172A' : '#FFFFFF',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Main Split: Sales Ledger + Thermal Bluetooth Config */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Sales & A5 PDF Invoices Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white xl:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Completed Invoices & Profit Audit
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Preview 58mm/80mm ESC/POS receipts, download A5 PDFs, or share via
              WhatsApp.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Party / Mode</th>
                  <th className="px-4 py-3 text-right">Net Payable</th>
                  <th className="px-4 py-3 text-right">Net Profit</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        {sale.invoiceNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {formatDateBySettings(sale.createdAt, settings)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {sale.partyName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {sale.paymentMode} · Disc -{formatMoney(sale.discountAmount, settings)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(sale.netPayable, settings)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono-tabular font-semibold ${
                        sale.netProfit >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {formatMoney(sale.netProfit, settings)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenInvoiceModal(sale)}
                          title="Thermal Receipt & ESC/POS"
                          className="rounded border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadA5InvoicePdf(sale, settings)}
                          title="Download A5 PDF"
                          className="rounded border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void shareInvoiceSummary(sale, settings)}
                          title="Share via WhatsApp / Email"
                          className="rounded border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Thermal Bluetooth Printer Configurator */}
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 xl:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Bluetooth Thermal Printer
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ESC/POS MAC persistence & paper width settings
              </p>
            </div>
            <button
              type="button"
              onClick={handleScanDevices}
              disabled={isScanning}
              className="flex items-center gap-1.5 rounded-lg bg-[#0D7A5F] px-3 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D] disabled:opacity-60"
            >
              <Bluetooth className="h-3.5 w-3.5" />
              <span>{isScanning ? 'Scanning...' : 'Discover Printers'}</span>
            </button>
          </div>

          {btStatus && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300">
              {btStatus}
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">
                Default Printer
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {printerConfig.deviceName}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">
                Saved MAC Address
              </span>
              <span className="font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                {printerConfig.macAddress}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-500 dark:text-slate-400">
                Thermal Roll Width
              </span>
              <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5 dark:bg-slate-800">
                {(['58mm', '80mm'] as ThermalWidth[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() =>
                      onUpdatePrinterConfig({ ...printerConfig, paperWidth: w })
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                      printerConfig.paperWidth === w
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {w} ({w === '58mm' ? '32 col' : '48 col'})
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Paired & Discovered Printers
            </p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {devices.map((d) => {
                const isDefault = d.mac === printerConfig.macAddress;
                return (
                  <div
                    key={d.mac}
                    className="flex items-center justify-between px-3 py-2.5 text-xs"
                  >
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {d.name}
                      </p>
                      <p className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                        {d.mac} · Signal {d.rssi} dBm
                      </p>
                    </div>
                    {isDefault ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[#0D7A5F] dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Default
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSaveDevice(d.name, d.mac)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Set Default
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestReceipt}
            disabled={sales.length === 0}
            className="mt-auto flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <FileText className="h-4 w-4" />
            <span>Preview ESC/POS Test Print & Hex Bytes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
