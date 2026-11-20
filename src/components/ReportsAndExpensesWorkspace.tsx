import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Plus,
  Printer,
  Receipt,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ExpenseCategory,
  ExpenseRecord,
  SaleRecord,
} from '../types/pharmacy';
import { ThemeMode } from '../services/themeService';
import { downloadCsvFile } from '../services/csvExport';

interface ReportsAndExpensesWorkspaceProps {
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  theme?: ThemeMode;
  onAddExpense: (payload: Omit<ExpenseRecord, 'id' | 'createdAt'>) => void;
  onDeleteExpense: (id: number) => void;
  onOpenInvoiceModal: (sale: SaleRecord) => void;
}

type ReportSubTab = 'receipts' | 'daily' | 'monthly' | 'expenses';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent',
  'Utilities & Electricity',
  'Staff Salaries',
  'Supplies & Packaging',
  'Maintenance',
  'Delivery & Misc',
];

function getTodayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function toLocalDateKey(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  const dt = new Date(isoOrDate);
  if (Number.isNaN(dt.getTime())) return isoOrDate.slice(0, 10);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string): string {
  const [yr, mo] = monthKey.split('-').map(Number);
  if (!yr || !mo) return monthKey;
  const dt = new Date(yr, mo - 1, 1);
  return dt.toLocaleDateString('en-PK', { month: 'short', year: 'numeric' });
}

export const ReportsAndExpensesWorkspace: React.FC<
  ReportsAndExpensesWorkspaceProps
> = ({
  sales,
  expenses,
  theme = 'light',
  onAddExpense,
  onDeleteExpense,
  onOpenInvoiceModal,
}) => {
  const isDark = theme === 'dark';
  const [subTab, setSubTab] = useState<ReportSubTab>('receipts');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateKey);
  const [showAllReceiptDates, setShowAllReceiptDates] = useState<boolean>(true);
  const [receiptSearch, setReceiptSearch] = useState('');
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);

  // Expense form state
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseCategory, setExpenseCategory] =
    useState<ExpenseCategory>('Utilities & Electricity');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState<string>(getTodayDateKey);
  const [expensePaymentMode, setExpensePaymentMode] = useState<
    'Cash' | 'Mobile Transfer' | 'Bank Transfer'
  >('Cash');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseFilterCategory, setExpenseFilterCategory] = useState<string>('All');
  const [expenseFilterMonth, setExpenseFilterMonth] = useState<string>('All');

  // All-time totals
  const overallTotals = useMemo(() => {
    const totalSales = sales.reduce((s, r) => s + r.netPayable, 0);
    const totalCost = sales.reduce((s, r) => s + r.totalCost, 0);
    const grossProfit = sales.reduce((s, r) => s + r.netProfit, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const trueNetProfit = grossProfit - totalExpenses;
    return {
      totalSales,
      totalCost,
      grossProfit,
      totalExpenses,
      trueNetProfit,
    };
  }, [sales, expenses]);

  // 1. Receipt-by-receipt profit filtered view
  const filteredReceipts = useMemo(() => {
    const q = receiptSearch.trim().toLowerCase();
    return sales.filter((sale) => {
      const dateKey = toLocalDateKey(sale.createdAt);
      if (!showAllReceiptDates && dateKey !== selectedDate) return false;
      if (!q) return true;
      return (
        sale.invoiceNumber.toLowerCase().includes(q) ||
        sale.partyName.toLowerCase().includes(q) ||
        (sale.createdByName || '').toLowerCase().includes(q) ||
        sale.paymentMode.toLowerCase().includes(q)
      );
    });
  }, [sales, showAllReceiptDates, selectedDate, receiptSearch]);

  const receiptScopeTotals = useMemo(() => {
    const revenue = filteredReceipts.reduce((s, r) => s + r.netPayable, 0);
    const discounts = filteredReceipts.reduce(
      (s, r) => s + r.discountAmount,
      0,
    );
    const cogs = filteredReceipts.reduce((s, r) => s + r.totalCost, 0);
    const profit = filteredReceipts.reduce((s, r) => s + r.netProfit, 0);
    const dayExpenses = showAllReceiptDates
      ? expenses.reduce((s, e) => s + e.amount, 0)
      : expenses
          .filter((e) => toLocalDateKey(e.date) === selectedDate)
          .reduce((s, e) => s + e.amount, 0);
    return {
      count: filteredReceipts.length,
      revenue,
      discounts,
      cogs,
      profit,
      dayExpenses,
      netAfterExpenses: profit - dayExpenses,
    };
  }, [filteredReceipts, expenses, showAllReceiptDates, selectedDate]);

  // 2. Daily Sales, Profit & Expenses Report
  const dailyRows = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        receiptCount: number;
        grossSales: number;
        discounts: number;
        netSales: number;
        cogs: number;
        receiptProfit: number;
        expenses: number;
        trueNetProfit: number;
      }
    >();

    const ensure = (dateKey: string) => {
      let row = map.get(dateKey);
      if (!row) {
        row = {
          date: dateKey,
          receiptCount: 0,
          grossSales: 0,
          discounts: 0,
          netSales: 0,
          cogs: 0,
          receiptProfit: 0,
          expenses: 0,
          trueNetProfit: 0,
        };
        map.set(dateKey, row);
      }
      return row;
    };

    for (const sale of sales) {
      const row = ensure(toLocalDateKey(sale.createdAt));
      row.receiptCount += 1;
      row.grossSales += sale.subtotal;
      row.discounts += sale.discountAmount;
      row.netSales += sale.netPayable;
      row.cogs += sale.totalCost;
      row.receiptProfit += sale.netProfit;
    }

    for (const exp of expenses) {
      const row = ensure(toLocalDateKey(exp.date));
      row.expenses += exp.amount;
    }

    const list = Array.from(map.values()).map((r) => ({
      ...r,
      trueNetProfit: r.receiptProfit - r.expenses,
    }));

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, expenses]);

  const dailyChartData = useMemo(
    () =>
      [...dailyRows]
        .slice(0, 14)
        .reverse()
        .map((r) => ({
          label: r.date.slice(5),
          Sales: Math.round(r.netSales * 100) / 100,
          'Receipt Profit': Math.round(r.receiptProfit * 100) / 100,
          Expenses: Math.round(r.expenses * 100) / 100,
          'Net Profit': Math.round(r.trueNetProfit * 100) / 100,
        })),
    [dailyRows],
  );

  // 3. Month-wise Sales, Profit & Expenses Report
  const monthlyRows = useMemo(() => {
    const map = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        receiptCount: number;
        netSales: number;
        discounts: number;
        cogs: number;
        grossProfit: number;
        expenses: number;
        trueNetProfit: number;
      }
    >();

    const ensure = (monthKey: string) => {
      let row = map.get(monthKey);
      if (!row) {
        row = {
          monthKey,
          monthLabel: formatMonthLabel(monthKey),
          receiptCount: 0,
          netSales: 0,
          discounts: 0,
          cogs: 0,
          grossProfit: 0,
          expenses: 0,
          trueNetProfit: 0,
        };
        map.set(monthKey, row);
      }
      return row;
    };

    for (const sale of sales) {
      const monthKey = toLocalDateKey(sale.createdAt).slice(0, 7);
      const row = ensure(monthKey);
      row.receiptCount += 1;
      row.netSales += sale.netPayable;
      row.discounts += sale.discountAmount;
      row.cogs += sale.totalCost;
      row.grossProfit += sale.netProfit;
    }

    for (const exp of expenses) {
      const monthKey = toLocalDateKey(exp.date).slice(0, 7);
      const row = ensure(monthKey);
      row.expenses += exp.amount;
    }

    return Array.from(map.values())
      .map((r) => ({
        ...r,
        trueNetProfit: r.grossProfit - r.expenses,
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [sales, expenses]);

  const monthlyChartData = useMemo(
    () =>
      [...monthlyRows].reverse().map((r) => ({
        label: r.monthLabel,
        Sales: Math.round(r.netSales * 100) / 100,
        'Gross Profit': Math.round(r.grossProfit * 100) / 100,
        Expenses: Math.round(r.expenses * 100) / 100,
        'Net Profit': Math.round(r.trueNetProfit * 100) / 100,
      })),
    [monthlyRows],
  );

  // 4. Expenses Ledger helpers
  const expenseMonths = useMemo(() => {
    const keys = Array.from(
      new Set(expenses.map((e) => toLocalDateKey(e.date).slice(0, 7))),
    ).sort((a, b) => b.localeCompare(a));
    return ['All', ...keys];
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((exp) => {
        if (
          expenseFilterCategory !== 'All' &&
          exp.category !== expenseFilterCategory
        ) {
          return false;
        }
        if (
          expenseFilterMonth !== 'All' &&
          toLocalDateKey(exp.date).slice(0, 7) !== expenseFilterMonth
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, expenseFilterCategory, expenseFilterMonth]);

  const expenseCategoryTotals = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const cat of EXPENSE_CATEGORIES) map.set(cat, 0);
    for (const exp of filteredExpenses) {
      map.set(exp.category, (map.get(exp.category) ?? 0) + exp.amount);
    }
    return Array.from(map.entries()).filter(([, amt]) => amt > 0);
  }, [filteredExpenses]);

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = expenseTitle.trim();
    const parsedAmt = Number(expenseAmount);

    if (!cleanTitle) {
      setExpenseError('Enter an expense description or title.');
      return;
    }
    if (!Number.isFinite(parsedAmt) || parsedAmt <= 0) {
      setExpenseError('Enter a valid expense amount greater than 0.');
      return;
    }

    onAddExpense({
      title: cleanTitle,
      category: expenseCategory,
      amount: Math.round(parsedAmt * 100) / 100,
      date: expenseDate || getTodayDateKey(),
      paymentMode: expensePaymentMode,
      notes: expenseNotes.trim(),
    });

    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseNotes('');
    setExpenseError(null);
  };

  const exportReceiptsCsv = () => {
    downloadCsvFile(
      `clinix_receipt_profit_${showAllReceiptDates ? 'all' : selectedDate}.csv`,
      [
        'Invoice #',
        'Date',
        'Customer / Party',
        'Payment Mode',
        'Transaction Reference',
        'Cashier',
        'Subtotal (PKR)',
        'Discount (PKR)',
        'Net Payable (PKR)',
        'Cost COGS (PKR)',
        'Receipt Profit (PKR)',
        'Margin %',
      ],
      filteredReceipts.map((s) => {
        const margin =
          s.netPayable > 0
            ? ((s.netProfit / s.netPayable) * 100).toFixed(1)
            : '0.0';
        return [
          s.invoiceNumber,
          toLocalDateKey(s.createdAt),
          s.partyName,
          s.paymentMode,
          s.transactionReference || '',
          s.createdByName || 'Admin',
          s.subtotal.toFixed(2),
          s.discountAmount.toFixed(2),
          s.netPayable.toFixed(2),
          s.totalCost.toFixed(2),
          s.netProfit.toFixed(2),
          `${margin}%`,
        ];
      }),
    );
  };

  const exportDailyCsv = () => {
    downloadCsvFile(
      'clinix_daily_sales_profit_report.csv',
      [
        'Date',
        'Receipts',
        'Gross Sales (PKR)',
        'Discounts (PKR)',
        'Net Sales (PKR)',
        'COGS (PKR)',
        'Receipt Profit (PKR)',
        'Expenses (PKR)',
        'True Net Profit (PKR)',
      ],
      dailyRows.map((r) => [
        r.date,
        r.receiptCount,
        r.grossSales.toFixed(2),
        r.discounts.toFixed(2),
        r.netSales.toFixed(2),
        r.cogs.toFixed(2),
        r.receiptProfit.toFixed(2),
        r.expenses.toFixed(2),
        r.trueNetProfit.toFixed(2),
      ]),
    );
  };

  const exportMonthlyCsv = () => {
    downloadCsvFile(
      'clinix_monthly_sales_profit_report.csv',
      [
        'Month',
        'Receipts',
        'Net Sales (PKR)',
        'Discounts (PKR)',
        'COGS (PKR)',
        'Gross Receipt Profit (PKR)',
        'Expenses (PKR)',
        'True Net Profit (PKR)',
        'Net Margin %',
      ],
      monthlyRows.map((r) => {
        const netMargin =
          r.netSales > 0
            ? ((r.trueNetProfit / r.netSales) * 100).toFixed(1)
            : '0.0';
        return [
          r.monthLabel,
          r.receiptCount,
          r.netSales.toFixed(2),
          r.discounts.toFixed(2),
          r.cogs.toFixed(2),
          r.grossProfit.toFixed(2),
          r.expenses.toFixed(2),
          r.trueNetProfit.toFixed(2),
          `${netMargin}%`,
        ];
      }),
    );
  };

  const exportExpensesCsv = () => {
    const scopeSuffix = [
      expenseFilterMonth !== 'All' ? expenseFilterMonth : 'all_months',
      expenseFilterCategory !== 'All'
        ? expenseFilterCategory.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        : 'all_categories',
    ].join('_');
    downloadCsvFile(
      `clinix_expenses_${scopeSuffix}.csv`,
      ['Date', 'Title', 'Category', 'Payment Mode', 'Amount (PKR)', 'Notes'],
      filteredExpenses.map((exp) => [
        exp.date,
        exp.title,
        exp.category,
        exp.paymentMode,
        exp.amount.toFixed(2),
        exp.notes || '',
      ]),
    );
  };

  const isActiveExportDisabled =
    (subTab === 'receipts' && filteredReceipts.length === 0) ||
    (subTab === 'daily' && dailyRows.length === 0) ||
    (subTab === 'monthly' && monthlyRows.length === 0) ||
    (subTab === 'expenses' && filteredExpenses.length === 0);

  const handleExportActiveReportCsv = () => {
    if (subTab === 'receipts') exportReceiptsCsv();
    else if (subTab === 'daily') exportDailyCsv();
    else if (subTab === 'monthly') exportMonthlyCsv();
    else exportExpensesCsv();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Executive Financial Summary Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Sales
          </p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-slate-900 dark:text-slate-100">
            PKR {overallTotals.totalSales.toFixed(2)}
          </p>
          <p className="mt-0.5 font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
            {sales.length} receipts
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cost of Goods (COGS)
          </p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-slate-700 dark:text-slate-300">
            PKR {overallTotals.totalCost.toFixed(2)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Purchase basis
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Receipt Profit (Gross)
          </p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-[#0D7A5F] dark:text-emerald-400">
            PKR {overallTotals.grossProfit.toFixed(2)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            After bill &amp; item discounts
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Operating Expenses
          </p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-amber-700 dark:text-amber-400">
            PKR {overallTotals.totalExpenses.toFixed(2)}
          </p>
          <p className="mt-0.5 font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
            {expenses.length} recorded entries
          </p>
        </div>

        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            True Net Profit
          </p>
          <p
            className={`mt-1 font-mono-tabular text-xl font-bold ${
              overallTotals.trueNetProfit >= 0
                ? 'text-[#0D7A5F] dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            PKR {overallTotals.trueNetProfit.toFixed(2)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Receipt Profit &minus; Expenses
          </p>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              { id: 'receipts', label: 'Daily Receipt Profit' },
              { id: 'daily', label: 'Daily Sales & Profit' },
              { id: 'monthly', label: 'Month-wise Report' },
              { id: 'expenses', label: `Expenses (${expenses.length})` },
            ] as { id: ReportSubTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                subTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">
            Admin Financial Audit · Clinix Community Pharmacy
          </span>
          <button
            type="button"
            disabled={isActiveExportDisabled}
            onClick={handleExportActiveReportCsv}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export to CSV</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DAILY RECEIPT-BY-RECEIPT PROFIT */}
      {subTab === 'receipts' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={receiptSearch}
                  onChange={(e) => setReceiptSearch(e.target.value)}
                  placeholder="Search invoice #, party, cashier..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  disabled={showAllReceiptDates}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setShowAllReceiptDates(false);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-900 dark:disabled:text-slate-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(getTodayDateKey());
                    setShowAllReceiptDates(false);
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap ${
                    !showAllReceiptDates && selectedDate === getTodayDateKey()
                      ? 'border-[#0D7A5F] bg-[#0D7A5F] text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Today Only
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllReceiptDates((prev) => !prev)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap ${
                    showAllReceiptDates
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-600 dark:bg-emerald-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  All Dates
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={filteredReceipts.length === 0}
              onClick={exportReceiptsCsv}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export to CSV</span>
            </button>
          </div>

          {/* Selected Scope Strip */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Receipts
              </p>
              <p className="font-mono-tabular text-base font-bold text-slate-900 dark:text-slate-100">
                {receiptScopeTotals.count}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Net Sales
              </p>
              <p className="font-mono-tabular text-base font-bold text-slate-900 dark:text-slate-100">
                PKR {receiptScopeTotals.revenue.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Cost (COGS)
              </p>
              <p className="font-mono-tabular text-base font-bold text-slate-700 dark:text-slate-300">
                PKR {receiptScopeTotals.cogs.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Receipt Profit
              </p>
              <p className="font-mono-tabular text-base font-bold text-[#0D7A5F] dark:text-emerald-400">
                PKR {receiptScopeTotals.profit.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                After Day Expenses (-PKR {receiptScopeTotals.dayExpenses.toFixed(0)})
              </p>
              <p
                className={`font-mono-tabular text-base font-bold ${
                  receiptScopeTotals.netAfterExpenses >= 0
                    ? 'text-[#0D7A5F] dark:text-emerald-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
              >
                PKR {receiptScopeTotals.netAfterExpenses.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Receipt-by-Receipt Table */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Invoice &amp; Time</th>
                    <th className="px-4 py-3">Party / Cashier</th>
                    <th className="px-3 py-3 text-right">Subtotal</th>
                    <th className="px-3 py-3 text-right">Disc</th>
                    <th className="px-3 py-3 text-right">Net Sale</th>
                    <th className="px-3 py-3 text-right">Cost (COGS)</th>
                    <th className="px-3 py-3 text-right">Receipt Profit</th>
                    <th className="px-3 py-3 text-right">Margin</th>
                    <th className="px-4 py-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredReceipts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-12 text-center text-xs text-slate-500 dark:text-slate-400"
                      >
                        No receipts found for the selected date/filter.
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map((sale) => {
                      const marginPct =
                        sale.netPayable > 0
                          ? (sale.netProfit / sale.netPayable) * 100
                          : 0;
                      const isExpanded = expandedSaleId === sale.id;
                      const dt = new Date(sale.createdAt);
                      const timeLabel = Number.isNaN(dt.getTime())
                        ? sale.createdAt
                        : dt.toLocaleString('en-PK', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          });

                      return (
                        <React.Fragment key={sale.id}>
                          <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3">
                              <p className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                                {sale.invoiceNumber}
                              </p>
                              <p className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                                {timeLabel}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900 dark:text-slate-100">
                                {sale.partyName}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {sale.paymentMode} ·{' '}
                                {sale.createdByName || 'Admin'}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-right font-mono-tabular text-slate-600 dark:text-slate-400">
                              {sale.subtotal.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono-tabular text-amber-700 dark:text-amber-400">
                              -{sale.discountAmount.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                              {sale.netPayable.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono-tabular text-slate-600 dark:text-slate-400">
                              {sale.totalCost.toFixed(2)}
                            </td>
                            <td
                              className={`px-3 py-3 text-right font-mono-tabular font-bold ${
                                sale.netProfit >= 0
                                  ? 'text-[#0D7A5F] dark:text-emerald-400'
                                  : 'text-red-700 dark:text-red-400'
                              }`}
                            >
                              PKR {sale.netProfit.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono-tabular text-slate-600 dark:text-slate-400">
                              {marginPct.toFixed(1)}%
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedSaleId(isExpanded ? null : sale.id)
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                >
                                  <span>Items</span>
                                  {isExpanded ? (
                                    <ChevronUp className="h-3 w-3" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onOpenInvoiceModal(sale)}
                                  title="Open Thermal Receipt"
                                  className="rounded border border-slate-200 p-1 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/90 dark:bg-slate-950/60">
                              <td colSpan={9} className="px-6 py-3">
                                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Line-Item Profit Breakdown ·{' '}
                                    {sale.invoiceNumber}
                                  </p>
                                  <table className="w-full text-left text-[11px]">
                                    <thead className="border-b border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                      <tr>
                                        <th className="py-1.5">Medicine</th>
                                        <th className="py-1.5 text-right">
                                          Qty
                                        </th>
                                        <th className="py-1.5 text-right">
                                          Unit Sell
                                        </th>
                                        <th className="py-1.5 text-right">
                                          Unit Cost
                                        </th>
                                        <th className="py-1.5 text-right">
                                          Disc
                                        </th>
                                        <th className="py-1.5 text-right">
                                          Line Net
                                        </th>
                                        <th className="py-1.5 text-right">
                                          Line Profit
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                      {sale.items.map((line) => {
                                        const lineCost =
                                          line.costPrice * line.quantity;
                                        const lineProfit =
                                          line.lineTotal - lineCost;
                                        return (
                                          <tr key={line.id}>
                                            <td className="py-1.5 font-medium text-slate-900 dark:text-slate-100">
                                              {line.itemName}
                                            </td>
                                            <td className="py-1.5 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                                              {line.quantity}
                                            </td>
                                            <td className="py-1.5 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                                              {line.unitPrice.toFixed(2)}
                                            </td>
                                            <td className="py-1.5 text-right font-mono-tabular text-slate-500 dark:text-slate-400">
                                              {line.costPrice.toFixed(2)}
                                            </td>
                                            <td className="py-1.5 text-right font-mono-tabular text-amber-700 dark:text-amber-400">
                                              {line.itemDiscount.toFixed(2)}
                                            </td>
                                            <td className="py-1.5 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                                              {line.lineTotal.toFixed(2)}
                                            </td>
                                            <td
                                              className={`py-1.5 text-right font-mono-tabular font-semibold ${
                                                lineProfit >= 0
                                                  ? 'text-[#0D7A5F] dark:text-emerald-400'
                                                  : 'text-red-700 dark:text-red-400'
                                              }`}
                                            >
                                              PKR {lineProfit.toFixed(2)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
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
          </section>
        </div>
      )}

      {/* TAB 2: DAILY SALES, PROFIT & EXPENSES REPORT */}
      {subTab === 'daily' && (
        <div className="flex flex-col gap-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Daily Sales, Profit &amp; Expense Trend
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Recent active days comparing receipt profit against operating
                  expenses
                </p>
              </div>
              <button
                type="button"
                disabled={dailyRows.length === 0}
                onClick={exportDailyCsv}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export to CSV</span>
              </button>
            </div>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailyChartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
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
                    width={58}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                      border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                      color: isDark ? '#F1F5F9' : '#0F172A',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: '12px',
                      color: isDark ? '#CBD5E1' : '#334155',
                    }}
                  />
                  <Bar
                    dataKey="Receipt Profit"
                    fill={isDark ? '#34D399' : '#0D7A5F'}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Expenses"
                    fill={isDark ? '#FBBF24' : '#D97706'}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Net Profit"
                    fill={isDark ? '#38BDF8' : '#0F172A'}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-3 py-3 text-right">Receipts</th>
                    <th className="px-3 py-3 text-right">Net Sales</th>
                    <th className="px-3 py-3 text-right">COGS</th>
                    <th className="px-3 py-3 text-right">Receipt Profit</th>
                    <th className="px-3 py-3 text-right">Expenses</th>
                    <th className="px-3 py-3 text-right">True Net Profit</th>
                    <th className="px-4 py-3 text-right">Receipts Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dailyRows.map((row) => (
                    <tr
                      key={row.date}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        {row.date}
                      </td>
                      <td className="px-3 py-3 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                        {row.receiptCount}
                      </td>
                      <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        PKR {row.netSales.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono-tabular text-slate-600 dark:text-slate-400">
                        PKR {row.cogs.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                        PKR {row.receiptProfit.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono-tabular text-amber-700 dark:text-amber-400">
                        PKR {row.expenses.toFixed(2)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono-tabular font-bold ${
                          row.trueNetProfit >= 0
                            ? 'text-[#0D7A5F] dark:text-emerald-400'
                            : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        PKR {row.trueNetProfit.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(row.date);
                            setShowAllReceiptDates(false);
                            setSubTab('receipts');
                          }}
                          className="text-xs font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
                        >
                          View Receipts
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: MONTH-WISE SALES, PROFIT & EXPENSES REPORT */}
      {subTab === 'monthly' && (
        <div className="flex flex-col gap-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Month-wise Sales, Profit &amp; Expense Summary
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Monthly revenue vs cost of goods, receipt profit, and operating
                  expenses
                </p>
              </div>
              <button
                type="button"
                disabled={monthlyRows.length === 0}
                onClick={exportMonthlyCsv}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export to CSV</span>
              </button>
            </div>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyChartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
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
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                      border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                      color: isDark ? '#F1F5F9' : '#0F172A',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: '12px',
                      color: isDark ? '#CBD5E1' : '#334155',
                    }}
                  />
                  <Bar
                    dataKey="Sales"
                    fill={isDark ? '#94A3B8' : '#64748B'}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Gross Profit"
                    fill={isDark ? '#34D399' : '#0D7A5F'}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Expenses"
                    fill={isDark ? '#FBBF24' : '#D97706'}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Net Profit"
                    fill={isDark ? '#38BDF8' : '#0F172A'}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Month</th>
                    <th className="px-3 py-3 text-right">Receipts</th>
                    <th className="px-3 py-3 text-right">Sales Revenue</th>
                    <th className="px-3 py-3 text-right">COGS</th>
                    <th className="px-3 py-3 text-right">Gross Profit</th>
                    <th className="px-3 py-3 text-right">Expenses</th>
                    <th className="px-3 py-3 text-right">True Net Profit</th>
                    <th className="px-4 py-3 text-right">Net Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthlyRows.map((row) => {
                    const netMargin =
                      row.netSales > 0
                        ? (row.trueNetProfit / row.netSales) * 100
                        : 0;
                    return (
                      <tr
                        key={row.monthKey}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          {row.monthLabel}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                          {row.receiptCount}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                          PKR {row.netSales.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular text-slate-600 dark:text-slate-400">
                          PKR {row.cogs.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                          PKR {row.grossProfit.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular text-amber-700 dark:text-amber-400">
                          PKR {row.expenses.toFixed(2)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-mono-tabular font-bold ${
                            row.trueNetProfit >= 0
                              ? 'text-[#0D7A5F] dark:text-emerald-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          PKR {row.trueNetProfit.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular text-slate-600 dark:text-slate-400">
                          {netMargin.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: EXPENSES LEDGER & ENTRY */}
      {subTab === 'expenses' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Add Expense Form */}
          <form
            noValidate
            onSubmit={handleExpenseSubmit}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-[#0D7A5F] dark:text-emerald-400">
                <Receipt className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  New Expense Entry
                </span>
              </div>
              <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                Record Operating Expense
              </h3>
            </div>

            {expenseError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {expenseError}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Expense Title / Description *
              </label>
              <input
                type="text"
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                placeholder="e.g. Electricity Bill, Staff Tea, Packaging"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Category
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) =>
                    setExpenseCategory(e.target.value as ExpenseCategory)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Amount (PKR) *
                </label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Date
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono-tabular text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Paid Via
                </label>
                <select
                  value={expensePaymentMode}
                  onChange={(e) =>
                    setExpensePaymentMode(
                      e.target.value as
                        | 'Cash'
                        | 'Mobile Transfer'
                        | 'Bank Transfer',
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="Cash">Cash</option>
                  <option value="Mobile Transfer">Mobile Transfer</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Notes (optional)
              </label>
              <input
                type="text"
                value={expenseNotes}
                onChange={(e) => setExpenseNotes(e.target.value)}
                placeholder="Voucher # or remarks"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-[#0D7A5F] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0A634D]"
            >
              <Plus className="h-4 w-4" />
              <span>Save Expense Entry</span>
            </button>
          </form>

          {/* Expenses Table & Breakdown */}
          <div className="flex flex-col gap-4 lg:col-span-8">
            {/* Filters & Category Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={expenseFilterMonth}
                  onChange={(e) => setExpenseFilterMonth(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {expenseMonths.map((m) => (
                    <option key={m} value={m}>
                      {m === 'All' ? 'All Months' : formatMonthLabel(m)}
                    </option>
                  ))}
                </select>

                <select
                  value={expenseFilterCategory}
                  onChange={(e) => setExpenseFilterCategory(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="All">All Categories</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono-tabular text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Filtered Total: PKR{' '}
                  {filteredExpenses
                    .reduce((s, e) => s + e.amount, 0)
                    .toFixed(2)}
                </span>
                <button
                  type="button"
                  disabled={filteredExpenses.length === 0}
                  onClick={exportExpensesCsv}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export to CSV</span>
                </button>
              </div>
            </div>

            {expenseCategoryTotals.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {expenseCategoryTotals.map(([cat, amt]) => (
                  <div
                    key={cat}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {cat}
                    </p>
                    <p className="mt-0.5 font-mono-tabular text-sm font-bold text-slate-900 dark:text-slate-100">
                      PKR {amt.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Description &amp; Notes</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Paid Via</th>
                      <th className="px-3 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredExpenses.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400"
                        >
                          No expenses recorded for the active filter.
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map((exp) => (
                        <tr
                          key={exp.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3 font-mono-tabular text-slate-700 whitespace-nowrap dark:text-slate-300">
                            {exp.date}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {exp.title}
                            </p>
                            {exp.notes && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {exp.notes}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                            {exp.category}
                          </td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                            {exp.paymentMode}
                          </td>
                          <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-amber-700 dark:text-amber-400">
                            PKR {exp.amount.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => onDeleteExpense(exp.id)}
                              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 dark:text-slate-500 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                              aria-label={`Delete ${exp.title}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
        </div>
      )}
    </div>
  );
};
