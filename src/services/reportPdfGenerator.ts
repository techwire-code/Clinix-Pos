import { jsPDF } from 'jspdf';
import {
  ExpenseRecord,
  PharmacySettings,
  SaleRecord,
} from '../types/pharmacy';
import {
  formatDateBySettings,
  formatMoney,
  getCurrencyLabel,
} from './localDb';

export type FinancialReportTab = 'receipts' | 'daily' | 'monthly' | 'expenses';

export interface DailyPdfRow {
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

export interface MonthlyPdfRow {
  monthKey: string;
  monthLabel: string;
  receiptCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  trueNetProfit: number;
}

export interface ReportPdfTotals {
  receiptCount: number;
  expenseCount: number;
  grossSales: number;
  totalDiscounts: number;
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  totalExpenses: number;
  trueNetProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
}

export interface FinancialReportPdfInput {
  activeTab: FinancialReportTab;
  settings?: PharmacySettings;
  dateScopeLabel: string;
  scopeFileSlug: string;
  periodTotals: ReportPdfTotals;
  dailyRows: DailyPdfRow[];
  dailyTotals: {
    dayCount: number;
    receiptCount: number;
    grossSales: number;
    discounts: number;
    netSales: number;
    cogs: number;
    receiptProfit: number;
    expenses: number;
    trueNetProfit: number;
    netMarginPct: number;
  };
  monthlyRows: MonthlyPdfRow[];
  monthlyTotals: {
    monthCount: number;
    receiptCount: number;
    grossSales: number;
    discounts: number;
    netSales: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    trueNetProfit: number;
    netMarginPct: number;
  };
  filteredReceipts: SaleRecord[];
  receiptScopeTotals: {
    count: number;
    gross: number;
    discounts: number;
    revenue: number;
    cogs: number;
    profit: number;
    marginPct: number;
    rangeExpenses: number;
    netAfterExpenses: number;
  };
  receiptSearchQuery?: string;
  filteredExpenses: ExpenseRecord[];
  filteredExpensesTotal: number;
  expenseCategoryFilter?: string;
  expenseMonthFilter?: string;
}

interface TableColumn<T> {
  header: string;
  width: number;
  align?: 'left' | 'right';
  getText: (row: T) => string;
  getTotalText?: () => string;
  getColor?: (row: T) => [number, number, number] | null;
}

function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  const safe = (text ?? '').toString().trim();
  if (!safe) return '';
  if (doc.getTextWidth(safe) <= maxWidth) return safe;
  let clipped = safe;
  while (clipped.length > 1 && doc.getTextWidth(`${clipped}...`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

function toAsciiSafe(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, '-');
}

export function downloadFinancialReportPdf(
  input: FinancialReportPdfInput,
): void {
  const {
    activeTab,
    settings,
    dateScopeLabel,
    scopeFileSlug,
    periodTotals,
    dailyRows,
    dailyTotals,
    monthlyRows,
    monthlyTotals,
    filteredReceipts,
    receiptScopeTotals,
    receiptSearchQuery,
    filteredExpenses,
    filteredExpensesTotal,
    expenseCategoryFilter,
    expenseMonthFilter,
  } = input;

  const isPortrait = activeTab === 'expenses';
  const doc = new jsPDF({
    orientation: isPortrait ? 'portrait' : 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 14;

  const pharmacyName =
    settings?.pharmacyName?.trim() || 'Clinix Community Pharmacy';
  const address = settings?.address?.trim() || '17 KM Ferozepur Road, Lahore';
  const phone = settings?.phone?.trim() || '';
  const license = settings?.licenseNumber?.trim() || '';
  const curLabel = getCurrencyLabel(settings, true);
  const digits = settings?.decimalDigits ?? 2;

  const fmt = (val: number) =>
    formatMoney(val, settings, { asciiOnly: true });
  const fmtPlain = (val: number) => {
    const safe = Number.isFinite(val) ? val : 0;
    const absStr = Math.abs(safe).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    return safe < 0 ? `-${absStr}` : absStr;
  };
  const fmtDate = (isoOrDate: string, includeTime = false) =>
    toAsciiSafe(formatDateBySettings(isoOrDate, settings, { includeTime }));

  const reportTitles: Record<FinancialReportTab, string> = {
    daily: 'DAILY SALES, PROFIT & EXPENSES REPORT',
    monthly: 'MONTHLY FINANCIAL PERFORMANCE REPORT',
    receipts: 'RECEIPT-BY-RECEIPT PROFIT REPORT',
    expenses: 'OPERATING EXPENSES LEDGER REPORT',
  };

  const filterNotes: string[] = [];
  if (activeTab === 'receipts' && receiptSearchQuery?.trim()) {
    filterNotes.push(`Search Filter: "${receiptSearchQuery.trim()}"`);
  }
  if (activeTab === 'expenses') {
    if (expenseCategoryFilter && expenseCategoryFilter !== 'All') {
      filterNotes.push(`Category: ${expenseCategoryFilter}`);
    }
    if (expenseMonthFilter && expenseMonthFilter !== 'All') {
      filterNotes.push(`Month: ${expenseMonthFilter}`);
    }
  }

  let y = 14;

  // --- Header Banner ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(13, 122, 95);
  doc.text(toAsciiSafe(pharmacyName.toUpperCase()), margin, y);

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(reportTitles[activeTab], pageWidth - margin, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const subParts = [
    toAsciiSafe(address),
    phone ? `Tel: ${toAsciiSafe(phone)}` : '',
    license ? `Lic: ${toAsciiSafe(license)}` : '',
  ].filter(Boolean);
  doc.text(subParts.join('  |  '), margin, y);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 122, 95);
  doc.text(
    `Scope: ${toAsciiSafe(dateScopeLabel)}`,
    pageWidth - margin,
    y,
    { align: 'right' },
  );

  y += 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Currency: ${curLabel}${filterNotes.length > 0 ? `  |  ${toAsciiSafe(filterNotes.join('  |  '))}` : ''}`,
    margin,
    y,
  );
  doc.text(
    `Generated: ${fmtDate(new Date().toISOString(), true)}`,
    pageWidth - margin,
    y,
    { align: 'right' },
  );

  y += 3;
  doc.setDrawColor(13, 122, 95);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);

  // --- Summary KPI Cards Strip ---
  y += 4.5;
  const kpiList =
    activeTab === 'expenses'
      ? [
          {
            label: 'FILTERED EXPENSES',
            value: fmt(filteredExpensesTotal),
            sub: `${filteredExpenses.length} expense entries`,
            color: [180, 83, 9] as [number, number, number],
          },
          {
            label: 'PERIOD NET SALES',
            value: fmt(periodTotals.totalSales),
            sub: `${periodTotals.receiptCount} receipts`,
            color: [15, 23, 42] as [number, number, number],
          },
          {
            label: 'GROSS PROFIT',
            value: fmt(periodTotals.grossProfit),
            sub: `${periodTotals.grossMarginPct.toFixed(1)}% gross margin`,
            color: [4, 120, 87] as [number, number, number],
          },
          {
            label: 'TRUE NET PROFIT',
            value: fmt(periodTotals.trueNetProfit),
            sub: `${periodTotals.netMarginPct.toFixed(1)}% after all expenses`,
            color:
              periodTotals.trueNetProfit >= 0
                ? ([13, 122, 95] as [number, number, number])
                : ([185, 28, 28] as [number, number, number]),
          },
        ]
      : activeTab === 'receipts'
        ? [
            {
              label: 'NET SALES',
              value: fmt(receiptScopeTotals.revenue),
              sub: `Gross ${fmt(receiptScopeTotals.gross)} | Disc -${fmt(receiptScopeTotals.discounts)}`,
              color: [15, 23, 42] as [number, number, number],
            },
            {
              label: 'TOTAL COST (COGS)',
              value: fmt(receiptScopeTotals.cogs),
              sub: `${receiptScopeTotals.count} filtered receipts`,
              color: [51, 65, 85] as [number, number, number],
            },
            {
              label: 'RECEIPT PROFIT',
              value: fmt(receiptScopeTotals.profit),
              sub: `${receiptScopeTotals.marginPct.toFixed(1)}% gross margin`,
              color: [4, 120, 87] as [number, number, number],
            },
            {
              label: 'OPERATING EXPENSES',
              value: fmt(receiptScopeTotals.rangeExpenses),
              sub: `${periodTotals.expenseCount} entries in date scope`,
              color: [180, 83, 9] as [number, number, number],
            },
            {
              label: 'TRUE NET PROFIT',
              value: fmt(receiptScopeTotals.netAfterExpenses),
              sub: 'Receipt profit minus expenses',
              color:
                receiptScopeTotals.netAfterExpenses >= 0
                  ? ([13, 122, 95] as [number, number, number])
                  : ([185, 28, 28] as [number, number, number]),
            },
          ]
        : [
            {
              label: 'TOTAL NET SALES',
              value: fmt(periodTotals.totalSales),
              sub: `Gross ${fmt(periodTotals.grossSales)} | Disc -${fmt(periodTotals.totalDiscounts)}`,
              color: [15, 23, 42] as [number, number, number],
            },
            {
              label: 'TOTAL COST (COGS)',
              value: fmt(periodTotals.totalCost),
              sub: `${periodTotals.receiptCount} bills`,
              color: [51, 65, 85] as [number, number, number],
            },
            {
              label: 'TOTAL GROSS PROFIT',
              value: fmt(periodTotals.grossProfit),
              sub: `${periodTotals.grossMarginPct.toFixed(1)}% gross margin`,
              color: [4, 120, 87] as [number, number, number],
            },
            {
              label: 'OPERATING EXPENSES',
              value: fmt(periodTotals.totalExpenses),
              sub: `${periodTotals.expenseCount} recorded entries`,
              color: [180, 83, 9] as [number, number, number],
            },
            {
              label: 'TRUE NET PROFIT',
              value: fmt(periodTotals.trueNetProfit),
              sub: `${periodTotals.netMarginPct.toFixed(1)}% net margin`,
              color:
                periodTotals.trueNetProfit >= 0
                  ? ([13, 122, 95] as [number, number, number])
                  : ([185, 28, 28] as [number, number, number]),
            },
          ];

  const cardGap = 3;
  const cardWidth =
    (contentWidth - cardGap * (kpiList.length - 1)) / kpiList.length;
  const cardHeight = 16.5;

  kpiList.forEach((kpi, idx) => {
    const x = margin + idx * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 2.8, y + 4.4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(fitText(doc, kpi.value, cardWidth - 5.6), x + 2.8, y + 10.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(100, 116, 139);
    doc.text(fitText(doc, kpi.sub, cardWidth - 5.6), x + 2.8, y + 14.3);
  });

  y += cardHeight + 6;

  // --- Generic Paginated Table Renderer ---
  const renderTable = <T,>(
    sectionHeading: string,
    columns: TableColumn<T>[],
    rows: T[],
    totalRowLabel: string,
  ) => {
    const headerHeight = 7.2;
    const rowHeight = 6.2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(sectionHeading, margin, y);
    y += 2.5;

    const drawHeader = () => {
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, contentWidth, headerHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(255, 255, 255);

      let cx = margin;
      for (const col of columns) {
        const tx =
          col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(col.header, tx, y + 4.9, {
          align: col.align === 'right' ? 'right' : 'left',
        });
        cx += col.width;
      }
      y += headerHeight;
    };

    drawHeader();

    rows.forEach((row, idx) => {
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = 14;
        drawHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, rowHeight, 'F');
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);

      let cx = margin;
      for (const col of columns) {
        const customColor = col.getColor?.(row);
        if (customColor) {
          doc.setTextColor(customColor[0], customColor[1], customColor[2]);
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'normal');
        }
        const rawText = toAsciiSafe(col.getText(row));
        const fitted = fitText(doc, rawText, col.width - 4);
        const tx =
          col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(fitted, tx, y + 4.3, {
          align: col.align === 'right' ? 'right' : 'left',
        });
        cx += col.width;
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);
      y += rowHeight;
    });

    // Grand Total Footer Row
    const totalHeight = 7.4;
    if (y + totalHeight > bottomLimit) {
      doc.addPage();
      y = 14;
      drawHeader();
    }

    doc.setFillColor(230, 244, 241);
    doc.setDrawColor(13, 122, 95);
    doc.setLineWidth(0.45);
    doc.rect(margin, y, contentWidth, totalHeight, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(6, 78, 59);

    let cx = margin;
    columns.forEach((col, colIdx) => {
      const txt =
        colIdx === 0
          ? totalRowLabel
          : col.getTotalText
            ? toAsciiSafe(col.getTotalText())
            : '';
      if (txt) {
        const fitted = fitText(doc, txt, col.width - 4);
        const tx =
          col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(fitted, tx, y + 5, {
          align: col.align === 'right' ? 'right' : 'left',
        });
      }
      cx += col.width;
    });
    y += totalHeight + 4;
  };

  // --- Build Table Columns per Active Tab ---
  if (activeTab === 'daily') {
    // contentWidth = 273mm in A4 landscape
    const cols: TableColumn<DailyPdfRow>[] = [
      {
        header: 'Date',
        width: 35,
        getText: (r) => fmtDate(r.date),
      },
      {
        header: 'Bills',
        width: 18,
        align: 'right',
        getText: (r) => `${r.receiptCount}`,
        getTotalText: () => `${dailyTotals.receiptCount}`,
      },
      {
        header: `Gross (${curLabel})`,
        width: 31,
        align: 'right',
        getText: (r) => fmtPlain(r.grossSales),
        getTotalText: () => fmtPlain(dailyTotals.grossSales),
      },
      {
        header: `Disc (${curLabel})`,
        width: 26,
        align: 'right',
        getText: (r) => (r.discounts > 0 ? `-${fmtPlain(r.discounts)}` : fmtPlain(0)),
        getTotalText: () => `-${fmtPlain(dailyTotals.discounts)}`,
        getColor: (r) => (r.discounts > 0 ? [180, 83, 9] : null),
      },
      {
        header: `Net Sales (${curLabel})`,
        width: 33,
        align: 'right',
        getText: (r) => fmtPlain(r.netSales),
        getTotalText: () => fmtPlain(dailyTotals.netSales),
      },
      {
        header: `COGS (${curLabel})`,
        width: 31,
        align: 'right',
        getText: (r) => fmtPlain(r.cogs),
        getTotalText: () => fmtPlain(dailyTotals.cogs),
      },
      {
        header: `Gross Profit`,
        width: 33,
        align: 'right',
        getText: (r) => fmtPlain(r.receiptProfit),
        getTotalText: () => fmtPlain(dailyTotals.receiptProfit),
        getColor: (r) =>
          r.receiptProfit >= 0 ? [4, 120, 87] : [185, 28, 28],
      },
      {
        header: `Expenses`,
        width: 29,
        align: 'right',
        getText: (r) => fmtPlain(r.expenses),
        getTotalText: () => fmtPlain(dailyTotals.expenses),
        getColor: (r) => (r.expenses > 0 ? [180, 83, 9] : null),
      },
      {
        header: `True Net Profit`,
        width: 37,
        align: 'right',
        getText: (r) => fmtPlain(r.trueNetProfit),
        getTotalText: () =>
          `${fmtPlain(dailyTotals.trueNetProfit)} (${dailyTotals.netMarginPct.toFixed(1)}%)`,
        getColor: (r) =>
          r.trueNetProfit >= 0 ? [13, 122, 95] : [185, 28, 28],
      },
    ];
    renderTable(
      `Daily Financial Breakdown (${dailyRows.length} days)`,
      cols,
      dailyRows,
      `TOTAL (${dailyTotals.dayCount} days)`,
    );
  } else if (activeTab === 'monthly') {
    const cols: TableColumn<MonthlyPdfRow>[] = [
      {
        header: 'Month',
        width: 34,
        getText: (r) => r.monthLabel,
      },
      {
        header: 'Bills',
        width: 17,
        align: 'right',
        getText: (r) => `${r.receiptCount}`,
        getTotalText: () => `${monthlyTotals.receiptCount}`,
      },
      {
        header: `Gross (${curLabel})`,
        width: 30,
        align: 'right',
        getText: (r) => fmtPlain(r.grossSales),
        getTotalText: () => fmtPlain(monthlyTotals.grossSales),
      },
      {
        header: `Disc (${curLabel})`,
        width: 25,
        align: 'right',
        getText: (r) => (r.discounts > 0 ? `-${fmtPlain(r.discounts)}` : fmtPlain(0)),
        getTotalText: () => `-${fmtPlain(monthlyTotals.discounts)}`,
        getColor: (r) => (r.discounts > 0 ? [180, 83, 9] : null),
      },
      {
        header: `Net Sales (${curLabel})`,
        width: 32,
        align: 'right',
        getText: (r) => fmtPlain(r.netSales),
        getTotalText: () => fmtPlain(monthlyTotals.netSales),
      },
      {
        header: `COGS (${curLabel})`,
        width: 30,
        align: 'right',
        getText: (r) => fmtPlain(r.cogs),
        getTotalText: () => fmtPlain(monthlyTotals.cogs),
      },
      {
        header: 'Gross Profit',
        width: 31,
        align: 'right',
        getText: (r) => fmtPlain(r.grossProfit),
        getTotalText: () => fmtPlain(monthlyTotals.grossProfit),
        getColor: (r) =>
          r.grossProfit >= 0 ? [4, 120, 87] : [185, 28, 28],
      },
      {
        header: 'Expenses',
        width: 26,
        align: 'right',
        getText: (r) => fmtPlain(r.expenses),
        getTotalText: () => fmtPlain(monthlyTotals.expenses),
        getColor: (r) => (r.expenses > 0 ? [180, 83, 9] : null),
      },
      {
        header: 'True Net Profit',
        width: 31,
        align: 'right',
        getText: (r) => fmtPlain(r.trueNetProfit),
        getTotalText: () => fmtPlain(monthlyTotals.trueNetProfit),
        getColor: (r) =>
          r.trueNetProfit >= 0 ? [13, 122, 95] : [185, 28, 28],
      },
      {
        header: 'Net %',
        width: 17,
        align: 'right',
        getText: (r) =>
          r.netSales > 0
            ? `${((r.trueNetProfit / r.netSales) * 100).toFixed(1)}%`
            : '0.0%',
        getTotalText: () => `${monthlyTotals.netMarginPct.toFixed(1)}%`,
      },
    ];
    renderTable(
      `Monthly Financial Summary (${monthlyRows.length} months)`,
      cols,
      monthlyRows,
      `TOTAL (${monthlyTotals.monthCount} mos)`,
    );
  } else if (activeTab === 'receipts') {
    const cols: TableColumn<SaleRecord>[] = [
      {
        header: 'Invoice #',
        width: 31,
        getText: (r) => r.invoiceNumber,
      },
      {
        header: 'Date',
        width: 26,
        getText: (r) => fmtDate(r.createdAt),
      },
      {
        header: 'Customer / Party',
        width: 44,
        getText: (r) => r.partyName,
      },
      {
        header: 'Payment Mode',
        width: 30,
        getText: (r) => r.paymentMode,
      },
      {
        header: `Gross (${curLabel})`,
        width: 28,
        align: 'right',
        getText: (r) => fmtPlain(r.subtotal),
        getTotalText: () => fmtPlain(receiptScopeTotals.gross),
      },
      {
        header: `Disc (${curLabel})`,
        width: 24,
        align: 'right',
        getText: (r) =>
          r.discountAmount > 0 ? `-${fmtPlain(r.discountAmount)}` : fmtPlain(0),
        getTotalText: () => `-${fmtPlain(receiptScopeTotals.discounts)}`,
        getColor: (r) => (r.discountAmount > 0 ? [180, 83, 9] : null),
      },
      {
        header: `Net (${curLabel})`,
        width: 29,
        align: 'right',
        getText: (r) => fmtPlain(r.netPayable),
        getTotalText: () => fmtPlain(receiptScopeTotals.revenue),
      },
      {
        header: `COGS (${curLabel})`,
        width: 28,
        align: 'right',
        getText: (r) => fmtPlain(r.totalCost),
        getTotalText: () => fmtPlain(receiptScopeTotals.cogs),
      },
      {
        header: 'Profit',
        width: 33,
        align: 'right',
        getText: (r) => fmtPlain(r.netProfit),
        getTotalText: () =>
          `${fmtPlain(receiptScopeTotals.profit)} (${receiptScopeTotals.marginPct.toFixed(1)}%)`,
        getColor: (r) => (r.netProfit >= 0 ? [4, 120, 87] : [185, 28, 28]),
      },
    ];
    renderTable(
      `Receipt-by-Receipt Profit Breakdown (${filteredReceipts.length} bills)`,
      cols,
      filteredReceipts,
      `TOTAL (${receiptScopeTotals.count} bills)`,
    );

    if (y + 10 <= bottomLimit) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `Net Profit After Operating Expenses (${fmt(receiptScopeTotals.rangeExpenses)}): ${fmt(receiptScopeTotals.netAfterExpenses)}`,
        margin,
        y,
      );
    }
  } else {
    // Portrait A4 (contentWidth = 186mm)
    const cols: TableColumn<ExpenseRecord>[] = [
      {
        header: 'Date',
        width: 24,
        getText: (r) => fmtDate(r.date),
      },
      {
        header: 'Expense Title',
        width: 52,
        getText: (r) => r.title,
      },
      {
        header: 'Category',
        width: 38,
        getText: (r) => r.category,
      },
      {
        header: 'Mode',
        width: 24,
        getText: (r) => r.paymentMode,
      },
      {
        header: `Amount (${curLabel})`,
        width: 28,
        align: 'right',
        getText: (r) => fmtPlain(r.amount),
        getTotalText: () => fmtPlain(filteredExpensesTotal),
        getColor: () => [180, 83, 9],
      },
      {
        header: 'Notes',
        width: 20,
        getText: (r) => r.notes || '-',
      },
    ];
    renderTable(
      `Operating Expenses Ledger (${filteredExpenses.length} entries)`,
      cols,
      filteredExpenses,
      `TOTAL (${filteredExpenses.length})`,
    );
  }

  // --- Stamp Consistent Page Footers ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 10.5, pageWidth - margin, pageHeight - 10.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${toAsciiSafe(pharmacyName)} — ${toAsciiSafe(dateScopeLabel)}`,
      margin,
      pageHeight - 6.5,
    );
    doc.text(
      `Page ${p} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 6.5,
      { align: 'right' },
    );
  }

  const tabSlug =
    activeTab === 'daily'
      ? 'daily_report'
      : activeTab === 'monthly'
        ? 'monthly_report'
        : activeTab === 'receipts'
          ? 'receipt_profit_report'
          : 'expenses_report';
  const cleanScope = scopeFileSlug.replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`clinix_${tabSlug}_${cleanScope || 'all'}.pdf`);
}
