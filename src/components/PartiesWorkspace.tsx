import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileText,
  Lock,
  Plus,
  Printer,
  Receipt,
  Search,
  Share2,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import {
  KhataEntry,
  Party,
  PartyType,
  PharmacyItem,
  PharmacySettings,
  PurchaseRecord,
  SaleRecord,
  SupplierPaymentEntry,
} from '../types/pharmacy';
import {
  buildCustomerKhataShareText,
  buildCustomerKhataStatement,
  buildSupplierLedgerShareText,
  buildSupplierLedgerStatement,
  formatDateBySettings,
  formatMoney,
  getCurrencyLabel,
  getPurchasePaymentStatus,
} from '../services/localDb';

interface PartiesWorkspaceProps {
  parties: Party[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  supplierPayments: SupplierPaymentEntry[];
  items: PharmacyItem[];
  khataEntries: KhataEntry[];
  settings?: PharmacySettings;
  onAddParty: (party: Omit<Party, 'id'>) => void;
  onSettleBalance: (
    partyId: number,
    amount: number,
    details?: {
      paymentMode?: string;
      notes?: string;
      reference?: string;
      collectedAt?: string;
      purchaseId?: number | null;
    },
  ) => void;
  onOpenInvoiceModal?: (sale: SaleRecord) => void;
  canEditCreditReceipt?: boolean;
  onRequestEditCreditReceipt?: (sale: SaleRecord) => void;
}

type DatePresetKey = 'all' | 'today' | '7d' | '30d' | 'month';

function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const PartiesWorkspace: React.FC<PartiesWorkspaceProps> = ({
  parties,
  sales,
  purchases,
  supplierPayments,
  items,
  khataEntries,
  settings,
  onAddParty,
  onSettleBalance,
  onOpenInvoiceModal,
  canEditCreditReceipt = false,
  onRequestEditCreditReceipt,
}) => {
  const cur = getCurrencyLabel(settings);
  const [activeType, setActiveType] = useState<PartyType>('customer');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Settle / Record Collection or Supplier Payment modal state
  const [settleTarget, setSettleTarget] = useState<Party | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('Cash');
  const [settleDate, setSettleDate] = useState(() => toLocalYmd(new Date()));
  const [settleReference, setSettleReference] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settlePurchaseId, setSettlePurchaseId] = useState<number | ''>('');
  const [settleError, setSettleError] = useState<string | null>(null);

  // Add party modal state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newType, setNewType] = useState<PartyType>('customer');
  const [newBalance, setNewBalance] = useState('0');

  // Khata statement drawer/modal state
  const [selectedKhataPartyId, setSelectedKhataPartyId] = useState<number | null>(
    null,
  );
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activePreset, setActivePreset] = useState<DatePresetKey>('all');
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>(
    {},
  );
  const [expandAllBills, setExpandAllBills] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Supplier Bills & Payment Ledger modal state
  const [selectedSupplierPartyId, setSelectedSupplierPartyId] = useState<
    number | null
  >(null);
  const [supplierLedgerTab, setSupplierLedgerTab] = useState<
    'bills' | 'payments'
  >('bills');
  const [expandedSupplierBillIds, setExpandedSupplierBillIds] = useState<
    Record<number, boolean>
  >({});
  const [supplierShareFeedback, setSupplierShareFeedback] = useState<
    string | null
  >(null);

  const totals = useMemo(() => {
    const toCollect = parties
      .filter((p) => p.type === 'customer')
      .reduce((s, p) => s + p.balance, 0);
    const toPay = parties
      .filter((p) => p.type === 'supplier')
      .reduce((s, p) => s + p.balance, 0);
    return { toCollect, toPay };
  }, [parties]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return parties.filter((p) => {
      if (p.type !== activeType) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q)
      );
    });
  }, [parties, activeType, searchQuery]);

  // Precompute transaction counts for quick badge display
  const entryCountsByParty = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of khataEntries) {
      map.set(e.partyId, (map.get(e.partyId) ?? 0) + 1);
    }
    return map;
  }, [khataEntries]);

  const supplierBillStatsByParty = useMemo(() => {
    const map = new Map<
      number,
      { totalBills: number; partialCount: number; unpaidCount: number; paymentCount: number }
    >();
    for (const pur of purchases) {
      const prev = map.get(pur.supplierId) ?? {
        totalBills: 0,
        partialCount: 0,
        unpaidCount: 0,
        paymentCount: 0,
      };
      const st = getPurchasePaymentStatus(pur);
      map.set(pur.supplierId, {
        totalBills: prev.totalBills + 1,
        partialCount: prev.partialCount + (st === 'Partially Paid' ? 1 : 0),
        unpaidCount: prev.unpaidCount + (st === 'Unpaid' ? 1 : 0),
        paymentCount: prev.paymentCount,
      });
    }
    for (const pay of supplierPayments) {
      const prev = map.get(pay.partyId) ?? {
        totalBills: 0,
        partialCount: 0,
        unpaidCount: 0,
        paymentCount: 0,
      };
      map.set(pay.partyId, {
        ...prev,
        paymentCount: prev.paymentCount + 1,
      });
    }
    return map;
  }, [purchases, supplierPayments]);

  const selectedKhataParty = useMemo(
    () => parties.find((p) => p.id === selectedKhataPartyId) ?? null,
    [parties, selectedKhataPartyId],
  );

  const statement = useMemo(() => {
    if (!selectedKhataParty) return null;
    return buildCustomerKhataStatement({
      party: selectedKhataParty,
      khataEntries,
      sales,
      items,
      fromDate,
      toDate,
    });
  }, [selectedKhataParty, khataEntries, sales, items, fromDate, toDate]);

  const selectedSupplierParty = useMemo(
    () => parties.find((p) => p.id === selectedSupplierPartyId) ?? null,
    [parties, selectedSupplierPartyId],
  );

  const supplierStatement = useMemo(() => {
    if (!selectedSupplierParty) return null;
    return buildSupplierLedgerStatement({
      party: selectedSupplierParty,
      purchases,
      supplierPayments,
    });
  }, [selectedSupplierParty, purchases, supplierPayments]);

  const settleTargetOpenBills = useMemo(() => {
    if (!settleTarget || settleTarget.type !== 'supplier') return [];
    return purchases
      .filter((p) => p.supplierId === settleTarget.id && p.balanceDue > 0.005)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [settleTarget, purchases]);

  const selectedSettleBill = useMemo(() => {
    if (settlePurchaseId === '' || !settleTarget) return null;
    return (
      settleTargetOpenBills.find((b) => b.id === Number(settlePurchaseId)) ??
      null
    );
  }, [settlePurchaseId, settleTarget, settleTargetOpenBills]);

  const openKhataModal = (party: Party) => {
    setSelectedKhataPartyId(party.id);
    setFromDate('');
    setToDate('');
    setActivePreset('all');
    setExpandedRowIds({});
    setExpandAllBills(false);
    setShareFeedback(null);
  };

  const openSupplierLedgerModal = (party: Party) => {
    setSelectedSupplierPartyId(party.id);
    setSupplierLedgerTab('bills');
    setExpandedSupplierBillIds({});
    setSupplierShareFeedback(null);
  };

  const applyDatePreset = (preset: DatePresetKey) => {
    setActivePreset(preset);
    const today = new Date();
    const todayStr = toLocalYmd(today);
    if (preset === 'all') {
      setFromDate('');
      setToDate('');
      return;
    }
    if (preset === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
      return;
    }
    if (preset === '7d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      setFromDate(toLocalYmd(start));
      setToDate(todayStr);
      return;
    }
    if (preset === '30d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      setFromDate(toLocalYmd(start));
      setToDate(todayStr);
      return;
    }
    if (preset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(toLocalYmd(start));
      setToDate(todayStr);
    }
  };

  const openSettleModal = (party: Party, preselectedBill?: PurchaseRecord) => {
    setSettleTarget(party);
    setSettleError(null);
    if (preselectedBill) {
      setSettlePurchaseId(preselectedBill.id);
      setSettleAmount(String(preselectedBill.balanceDue));
    } else {
      setSettlePurchaseId('');
      setSettleAmount(String(party.balance));
    }
    setSettleMethod('Cash');
    setSettleDate(toLocalYmd(new Date()));
    setSettleReference('');
    setSettleNotes('');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddParty({
      name: newName.trim(),
      phone: newPhone.trim(),
      type: newType,
      balance: Math.max(0, Number(newBalance) || 0),
    });
    setNewName('');
    setNewPhone('');
    setNewBalance('0');
    setIsAddOpen(false);
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTarget) return;
    const amt = Math.max(0, Number(settleAmount) || 0);
    if (amt <= 0) {
      setSettleError('Enter a payment amount greater than 0.');
      return;
    }
    try {
      onSettleBalance(settleTarget.id, amt, {
        paymentMode: settleMethod,
        collectedAt: settleDate,
        reference: settleReference.trim() || undefined,
        notes: settleNotes.trim() || undefined,
        purchaseId:
          settleTarget.type === 'supplier' && settlePurchaseId !== ''
            ? Number(settlePurchaseId)
            : null,
      });
      setSettleTarget(null);
      setSettleAmount('');
      setSettleReference('');
      setSettleNotes('');
      setSettlePurchaseId('');
      setSettleError(null);
    } catch (err) {
      setSettleError(
        err instanceof Error ? err.message : 'Unable to record payment.',
      );
    }
  };

  const handleCopySupplierShare = async () => {
    if (!supplierStatement) return;
    const text = buildSupplierLedgerShareText({
      statement: supplierStatement,
      settings,
    });
    try {
      await navigator.clipboard.writeText(text);
      setSupplierShareFeedback('Supplier ledger copied to clipboard');
      window.setTimeout(() => setSupplierShareFeedback(null), 3000);
    } catch {
      setSupplierShareFeedback('Unable to access clipboard');
      window.setTimeout(() => setSupplierShareFeedback(null), 3000);
    }
  };

  const handleShareSupplierStatement = async () => {
    if (!supplierStatement) return;
    const text = buildSupplierLedgerShareText({
      statement: supplierStatement,
      settings,
    });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Supplier Ledger - ${supplierStatement.party.name}`,
          text,
        });
        setSupplierShareFeedback('Supplier ledger shared');
        window.setTimeout(() => setSupplierShareFeedback(null), 3000);
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    await handleCopySupplierShare();
  };

  const handleDownloadSupplierPdf = () => {
    if (!supplierStatement) return;
    const pharmacyName =
      settings?.pharmacyName?.trim() || 'Clinix Community Pharmacy';
    const address =
      settings?.address?.trim() || '17 KM Ferozepur Road, Lahore';
    const phone = settings?.phone?.trim() || '';
    const fmt = (val: number) =>
      formatMoney(val, settings, { asciiOnly: true });

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const left = 14;
    const right = 196;
    let y = 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(13, 122, 95);
    doc.text(pharmacyName.toUpperCase(), left, y);

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('SUPPLIER BILLS & PAYMENT LEDGER', right, y, { align: 'right' });

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${address}${phone ? ` · Tel: ${phone}` : ''}`, left, y);

    y += 4;
    doc.setDrawColor(180, 83, 9);
    doc.setLineWidth(0.5);
    doc.line(left, y, right, y);

    y += 6;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(left, y, right - left, 18, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(supplierStatement.party.name, left + 4, y + 6.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Phone: ${supplierStatement.party.phone || 'N/A'}`,
      left + 4,
      y + 12.5,
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Purchased: ${fmt(supplierStatement.totalPurchased)}`,
      125,
      y + 6,
    );
    doc.text(
      `Paid: ${fmt(supplierStatement.totalPaymentsRecorded)}`,
      125,
      y + 11,
    );
    doc.setTextColor(180, 83, 9);
    doc.text(
      `To Pay: ${fmt(supplierStatement.currentBalanceDue)}`,
      125,
      y + 16,
    );

    y += 24;
    const ensurePage = (needed: number) => {
      if (y + needed > 280) {
        doc.addPage();
        y = 16;
      }
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Purchase Bills (${supplierStatement.bills.length})`, left, y);
    y += 3;

    doc.setFillColor(15, 23, 42);
    doc.rect(left, y, right - left, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('Date', left + 2, y + 4.8);
    doc.text('Purchase / Inv #', left + 26, y + 4.8);
    doc.text('Status', left + 82, y + 4.8);
    doc.text('Total', 142, y + 4.8, { align: 'right' });
    doc.text('Paid', 168, y + 4.8, { align: 'right' });
    doc.text('Remaining', right - 2, y + 4.8, { align: 'right' });
    y += 7;

    for (const row of supplierStatement.bills) {
      ensurePage(12);
      const p = row.purchase;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(formatDateBySettings(p.createdAt, settings), left + 2, y + 4.5);
      doc.text(
        `${p.purchaseNumber} (${p.supplierInvoiceNo})`.slice(0, 30),
        left + 26,
        y + 4.5,
      );
      doc.setFont('helvetica', 'bold');
      doc.text(row.status, left + 82, y + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.text(fmt(p.totalAmount), 142, y + 4.5, { align: 'right' });
      doc.text(fmt(p.paidAmount), 168, y + 4.5, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(fmt(p.balanceDue), right - 2, y + 4.5, { align: 'right' });
      y += 6;
      for (const line of p.items) {
        ensurePage(5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(71, 85, 105);
        doc.text(
          `• ${line.itemName} (${line.quantity} x ${fmt(line.unitCost)}) = ${fmt(line.lineTotal)}`,
          left + 26,
          y + 2,
        );
        y += 4;
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(left, y + 1, right, y + 1);
      y += 2;
    }

    if (supplierStatement.payments.length > 0) {
      y += 4;
      ensurePage(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Payment History (${supplierStatement.payments.length})`,
        left,
        y,
      );
      y += 5;
      for (const pay of supplierStatement.payments) {
        ensurePage(7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        const billLabel = pay.purchaseNumber
          ? `Bill ${pay.purchaseNumber}`
          : 'General Payable';
        doc.text(
          `${formatDateBySettings(pay.createdAt, settings)} · ${pay.paymentMode} · ${billLabel}${pay.reference ? ` · Ref: ${pay.reference}` : ''}`,
          left + 2,
          y + 3,
        );
        doc.setFont('helvetica', 'bold');
        doc.text(fmt(pay.amount), right - 2, y + 3, { align: 'right' });
        y += 5.5;
      }
    }

    const safeSlug = supplierStatement.party.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    doc.save(`supplier-ledger-${safeSlug || 'supplier'}.pdf`);
  };

  const toggleRowExpanded = (rowId: string) => {
    setExpandedRowIds((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  const handleToggleExpandAll = () => {
    if (!statement) return;
    const nextState = !expandAllBills;
    setExpandAllBills(nextState);
    const nextMap: Record<string, boolean> = {};
    for (const r of statement.rows) {
      if (r.sale && r.sale.items.length > 0) {
        nextMap[r.id] = nextState;
      }
    }
    setExpandedRowIds(nextMap);
  };

  const handleCopyWhatsApp = async () => {
    if (!statement) return;
    const text = buildCustomerKhataShareText({
      statement,
      settings,
      fromDate,
      toDate,
    });
    try {
      await navigator.clipboard.writeText(text);
      setShareFeedback('WhatsApp statement copied to clipboard');
      window.setTimeout(() => setShareFeedback(null), 3000);
    } catch {
      setShareFeedback('Unable to access clipboard');
      window.setTimeout(() => setShareFeedback(null), 3000);
    }
  };

  const handleShareStatement = async () => {
    if (!statement) return;
    const text = buildCustomerKhataShareText({
      statement,
      settings,
      fromDate,
      toDate,
    });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Khata Statement - ${statement.party.name}`,
          text,
        });
        setShareFeedback('Statement shared');
        window.setTimeout(() => setShareFeedback(null), 3000);
        return;
      } catch {
        // User cancelled or share unsupported; fall back to clipboard copy
      }
    }
    await handleCopyWhatsApp();
  };

  const handleDownloadStatementPdf = () => {
    if (!statement) return;
    const pharmacyName =
      settings?.pharmacyName?.trim() || 'Clinix Community Pharmacy';
    const address =
      settings?.address?.trim() || '17 KM Ferozepur Road, Lahore';
    const phone = settings?.phone?.trim() || '';
    const fmt = (val: number) =>
      formatMoney(val, settings, { asciiOnly: true });

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const left = 14;
    const right = 196;
    let y = 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(13, 122, 95);
    doc.text(pharmacyName.toUpperCase(), left, y);

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('CUSTOMER KHATA STATEMENT', right, y, { align: 'right' });

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${address}${phone ? ` · Tel: ${phone}` : ''}`, left, y);
    doc.text(
      `Period: ${fromDate || 'All Dates'} to ${toDate || 'Today'}`,
      right,
      y,
      { align: 'right' },
    );

    y += 4;
    doc.setDrawColor(13, 122, 95);
    doc.setLineWidth(0.5);
    doc.line(left, y, right, y);

    y += 6;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(left, y, right - left, 18, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(statement.party.name, left + 4, y + 6.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Phone: ${statement.party.phone || 'N/A'}`,
      left + 4,
      y + 12.5,
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Credit Given: ${fmt(statement.totalCreditGiven)}`,
      125,
      y + 6,
    );
    doc.text(`Collected: ${fmt(statement.totalCollected)}`, 125, y + 11);
    doc.setTextColor(13, 122, 95);
    doc.text(
      `Balance Due: ${fmt(statement.currentBalanceDue)}`,
      125,
      y + 16,
    );

    y += 24;
    // Table Header
    doc.setFillColor(15, 23, 42);
    doc.rect(left, y, right - left, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('Date', left + 2, y + 4.8);
    doc.text('Voucher', left + 26, y + 4.8);
    doc.text('Details / Description', left + 54, y + 4.8);
    doc.text('Debit (+)', 142, y + 4.8, { align: 'right' });
    doc.text('Credit (-)', 168, y + 4.8, { align: 'right' });
    doc.text('Balance', right - 2, y + 4.8, { align: 'right' });

    y += 7;
    const ensurePage = (needed: number) => {
      if (y + needed > 280) {
        doc.addPage();
        y = 16;
      }
    };

    for (const row of statement.rows) {
      ensurePage(12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(formatDateBySettings(row.createdAt, settings), left + 2, y + 4.5);
      doc.text(row.voucherNumber, left + 26, y + 4.5);
      doc.setFont('helvetica', 'bold');
      doc.text(row.title.slice(0, 34), left + 54, y + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.text(row.debit > 0 ? fmt(row.debit) : '-', 142, y + 4.5, {
        align: 'right',
      });
      doc.text(row.credit > 0 ? fmt(row.credit) : '-', 168, y + 4.5, {
        align: 'right',
      });
      doc.setFont('helvetica', 'bold');
      doc.text(fmt(row.runningBalance), right - 2, y + 4.5, { align: 'right' });

      y += 6;
      if (row.subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        doc.text(row.subtitle.slice(0, 75), left + 54, y + 2);
        y += 4;
      }
      if (row.editedAt && row.editReason) {
        ensurePage(5);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.0);
        doc.setTextColor(180, 83, 9);
        const editLine = `Revised (${formatDateBySettings(row.editedAt, settings)} by ${row.editedByName || row.editedBy || 'Staff'}): ${row.editReason}`;
        doc.text(editLine.slice(0, 82), left + 54, y + 2);
        y += 4;
      }

      if (row.sale && row.sale.items.length > 0) {
        for (const si of row.sale.items) {
          ensurePage(5);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.2);
          doc.setTextColor(51, 65, 85);
          doc.text(
            `• ${si.itemName} (${si.quantity} ${si.unit || 'Unit'} x ${fmt(si.unitPrice)}) = ${fmt(si.lineTotal)}`,
            left + 56,
            y + 2,
          );
          y += 4;
        }
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(left, y + 1, right, y + 1);
      y += 2;
    }

    const safeSlug = statement.party.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    doc.save(`khata-${safeSlug || 'customer'}.pdf`);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* To Collect / To Pay Ledger Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total To Collect (Customer Credit / Khata)
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-[#0D7A5F] dark:text-emerald-400">
            {formatMoney(totals.toCollect, settings)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Click any customer row or View Khata to inspect date-wise bills & collections
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total To Pay (Distributor Payables)
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-amber-700 dark:text-amber-400">
            {formatMoney(totals.toPay, settings)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Click any supplier row or View Bills to inspect bills, partial payments & payment history
          </p>
        </div>
      </div>

      {/* Filter & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setActiveType('customer')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                activeType === 'customer'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Customers (To Collect)
            </button>
            <button
              type="button"
              onClick={() => setActiveType('supplier')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                activeType === 'supplier'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Suppliers (To Pay)
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeType === 'customer' ? 'customer' : 'supplier'} or phone...`}
              className="w-56 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-64"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewType(activeType);
            setIsAddOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D]"
        >
          <Plus className="h-4 w-4" />
          <span>Add Party</span>
        </button>
      </div>

      {/* Party Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
            <tr>
              <th className="px-5 py-3">Party Name</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3 text-right">
                {activeType === 'customer' ? 'To Collect' : 'To Pay'}
              </th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400"
                >
                  No matching {activeType === 'customer' ? 'customers' : 'suppliers'} found.
                </td>
              </tr>
            ) : (
              filtered.map((party) => {
                const entryCount = entryCountsByParty.get(party.id) ?? 0;
                const supStats = supplierBillStatsByParty.get(party.id);
                const isCustomer = party.type === 'customer';
                return (
                  <tr
                    key={party.id}
                    onClick={() => {
                      if (isCustomer) {
                        openKhataModal(party);
                      } else {
                        openSupplierLedgerModal(party);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2.5">
                        <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <div className="flex flex-col">
                          <span className="hover:text-[#0D7A5F] dark:hover:text-emerald-400">
                            {party.name}
                          </span>
                          {isCustomer ? (
                            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                              {entryCount > 0
                                ? `${entryCount} khata entr${entryCount === 1 ? 'y' : 'ies'} · Click to view statement`
                                : 'Click to view khata statement'}
                            </span>
                          ) : (
                            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                              {supStats && supStats.totalBills > 0
                                ? `${supStats.totalBills} bill${supStats.totalBills === 1 ? '' : 's'}${
                                    supStats.partialCount > 0
                                      ? ` · ${supStats.partialCount} partial`
                                      : ''
                                  }${
                                    supStats.unpaidCount > 0
                                      ? ` · ${supStats.unpaidCount} unpaid`
                                      : ''
                                  } · Click to view bills & payments`
                                : 'Click to view supplier bills & payment history'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono-tabular text-slate-600 dark:text-slate-400">
                      {party.phone || '—'}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-mono-tabular font-semibold ${
                        party.balance > 0
                          ? activeType === 'customer'
                            ? 'text-[#0D7A5F] dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {formatMoney(party.balance, settings)}
                    </td>
                    <td
                      className="px-5 py-3.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-2">
                        {isCustomer ? (
                          <button
                            type="button"
                            onClick={() => openKhataModal(party)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-[#0D7A5F] whitespace-nowrap hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>View Khata</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openSupplierLedgerModal(party)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-xs font-semibold text-amber-800 whitespace-nowrap hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>View Bills</span>
                          </button>
                        )}
                        {party.balance > 0 ? (
                          <button
                            type="button"
                            onClick={() => openSettleModal(party)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            {activeType === 'customer'
                              ? 'Record Collection'
                              : 'Record Payment'}
                          </button>
                        ) : (
                          <span className="px-2 text-slate-400 dark:text-slate-500">
                            Settled
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Customer Date-Wise Khata Statement Modal */}
      {selectedKhataParty && statement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 dark:bg-black/75 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="khata-modal-title"
        >
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            {/* Modal Header */}
            <div className="no-print flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3
                    id="khata-modal-title"
                    className="text-lg font-bold text-slate-900 dark:text-slate-100"
                  >
                    {selectedKhataParty.name}
                  </h3>
                  <span
                    className={`rounded-md px-2 py-0.5 font-mono-tabular text-xs font-bold ${
                      selectedKhataParty.balance > 0
                        ? 'bg-emerald-100 text-[#0D7A5F] dark:bg-emerald-950/70 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Balance Due:{' '}
                    {formatMoney(selectedKhataParty.balance, settings)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Date-wise Khata Account Statement ·{' '}
                  {selectedKhataParty.phone || 'No phone saved'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedKhataParty.balance > 0 && (
                  <button
                    type="button"
                    onClick={() => openSettleModal(selectedKhataParty)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#0D7A5F] px-3 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D]"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span>Record Collection</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopyWhatsApp}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareStatement}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadStatementPdf}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKhataPartyId(null)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  aria-label="Close customer khata statement"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Share feedback banner */}
            {shareFeedback && (
              <div className="no-print flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                <span>{shareFeedback}</span>
              </div>
            )}

            {/* Statement Body */}
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {/* Summary Totals */}
              <div className="no-print grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total Credit Given
                  </p>
                  <p className="mt-1 font-mono-tabular text-xl font-bold text-slate-900 dark:text-slate-100">
                    {formatMoney(statement.totalCreditGiven, settings)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Credit purchases & opening charges in range
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total Collected
                  </p>
                  <p className="mt-1 font-mono-tabular text-xl font-bold text-emerald-700 dark:text-emerald-400">
                    {formatMoney(statement.totalCollected, settings)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Vasooli & payments received in range
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#0D7A5F] dark:text-emerald-400">
                    Current Balance Due
                  </p>
                  <p className="mt-1 font-mono-tabular text-xl font-bold text-[#0D7A5F] dark:text-emerald-300">
                    {formatMoney(statement.currentBalanceDue, settings)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                    Live net receivable balance
                  </p>
                </div>
              </div>

              {/* Date Range Filters & Expand All */}
              <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: 'all', label: 'All Time' },
                      { key: 'today', label: 'Today' },
                      { key: '7d', label: '7 Days' },
                      { key: '30d', label: '30 Days' },
                      { key: 'month', label: 'This Month' },
                    ] as { key: DatePresetKey; label: string }[]
                  ).map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => applyDatePreset(preset.key)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        activePreset === preset.key
                          ? 'bg-[#0D7A5F] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>From</span>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => {
                        setFromDate(e.target.value);
                        setActivePreset('all');
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span>To</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => {
                        setToDate(e.target.value);
                        setActivePreset('all');
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  {statement.rows.some((r) => r.sale && r.sale.items.length > 0) && (
                    <button
                      type="button"
                      onClick={handleToggleExpandAll}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {expandAllBills ? 'Collapse Bills' : 'Expand All Bills'}
                    </button>
                  )}
                </div>
              </div>

              {/* Opening Brought Forward Notice (when filtered by From Date) */}
              {fromDate && statement.openingBalanceBeforeRange !== 0 && (
                <div className="no-print flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/60">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Balance Brought Forward (before{' '}
                    {formatDateBySettings(`${fromDate}T00:00:00`, settings)})
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-900 dark:text-slate-100">
                    {formatMoney(statement.openingBalanceBeforeRange, settings)}
                  </span>
                </div>
              )}

              {/* Chronological Date-Wise Timeline */}
              {statement.rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No khata transactions found in this date range.
                </div>
              ) : (
                <div className="no-print overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {statement.rows.map((row) => {
                      const hasItems = Boolean(
                        row.sale && row.sale.items.length > 0,
                      );
                      const isExpanded = Boolean(expandedRowIds[row.id]);
                      const isCollection = row.entryType === 'collection';
                      const isCreditSale = row.entryType === 'credit_sale';

                      return (
                        <div
                          key={row.id}
                          className="bg-white transition-colors dark:bg-slate-900"
                        >
                          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                            {/* Left: Date, Voucher & Details */}
                            <div className="flex items-start gap-3">
                              {hasItems ? (
                                <button
                                  type="button"
                                  onClick={() => toggleRowExpanded(row.id)}
                                  className="mt-0.5 rounded-md border border-slate-200 bg-slate-50 p-1 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  aria-label={
                                    isExpanded
                                      ? 'Collapse itemized products'
                                      : 'Expand itemized products'
                                  }
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              ) : (
                                <div className="mt-1 h-6 w-6 shrink-0 rounded-md bg-slate-100 text-center text-[10px] font-bold leading-6 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  {isCollection ? 'CR' : 'DR'}
                                </div>
                              )}

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono-tabular text-xs font-semibold text-slate-700 dark:text-slate-200">
                                    {formatDateBySettings(
                                      row.createdAt,
                                      settings,
                                      { includeTime: isCreditSale },
                                    )}
                                  </span>
                                  <span className="font-mono-tabular rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {row.voucherNumber}
                                  </span>
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                      isCollection
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                        : isCreditSale
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                    }`}
                                  >
                                    {row.title}
                                  </span>
                                  {row.editedAt && (
                                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/70 dark:text-amber-300">
                                      <ShieldCheck className="h-3 w-3" />
                                      Edited
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                  {row.subtitle}
                                </p>

                                {row.editedAt && row.editReason && (
                                  <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                                    <span className="font-semibold">
                                      Edited by{' '}
                                      {row.editedByName ||
                                        row.editedBy ||
                                        'Staff'}
                                    </span>{' '}
                                    on{' '}
                                    {formatDateBySettings(
                                      row.editedAt,
                                      settings,
                                      { includeTime: true },
                                    )}{' '}
                                    · Reason: {row.editReason}
                                    {row.editSummary && (
                                      <span className="mt-0.5 block font-mono-tabular text-[10.5px] text-amber-800 dark:text-amber-300">
                                        {row.editSummary}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {(hasItems || isCreditSale) && row.sale && (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                                    {hasItems && (
                                      <button
                                        type="button"
                                        onClick={() => toggleRowExpanded(row.id)}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
                                      >
                                        <span>
                                          {isExpanded
                                            ? 'Hide Itemized Medicines'
                                            : `View ${row.sale.items.length} Medicine${row.sale.items.length === 1 ? '' : 's'} Bought`}
                                        </span>
                                      </button>
                                    )}
                                    {onOpenInvoiceModal && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onOpenInvoiceModal(row.sale!)
                                        }
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                                      >
                                        <Receipt className="h-3 w-3" />
                                        <span>Open Receipt</span>
                                      </button>
                                    )}
                                    {isCreditSale &&
                                      onRequestEditCreditReceipt &&
                                      (canEditCreditReceipt ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onRequestEditCreditReceipt(
                                              row.sale!,
                                            )
                                          }
                                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                        >
                                          <Edit3 className="h-3 w-3" />
                                          <span>Edit Receipt</span>
                                        </button>
                                      ) : (
                                        <span
                                          title="Only Admin or Manager roles can edit credit receipts"
                                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500"
                                        >
                                          <Lock className="h-3 w-3" />
                                          <span>Edit Locked (Admin/Mgr)</span>
                                        </span>
                                      ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Debit, Credit & Running Balance */}
                            <div className="flex items-center justify-between gap-6 pl-9 sm:justify-end sm:pl-0">
                              <div className="text-right">
                                <p className="text-[10px] uppercase text-slate-400">
                                  {row.debit > 0 ? 'Udhaar (+)' : 'Collected (-)'}
                                </p>
                                <p
                                  className={`font-mono-tabular text-xs font-bold ${
                                    row.debit > 0
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {row.debit > 0
                                    ? `+${formatMoney(row.debit, settings)}`
                                    : `-${formatMoney(row.credit, settings)}`}
                                </p>
                              </div>

                              <div className="min-w-[104px] text-right">
                                <p className="text-[10px] uppercase text-slate-400">
                                  Running Bal
                                </p>
                                <p className="font-mono-tabular text-xs font-bold text-slate-900 dark:text-slate-100">
                                  {formatMoney(row.runningBalance, settings)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Expandable Itemized Credit Purchase Medicines */}
                          {hasItems && isExpanded && row.sale && (
                            <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 pl-12 dark:border-slate-800 dark:bg-slate-950/50">
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-400">
                                    <tr>
                                      <th className="px-3 py-2 font-semibold">
                                        Medicine / Product
                                      </th>
                                      <th className="px-3 py-2 font-semibold">
                                        Batch
                                      </th>
                                      <th className="px-3 py-2 text-right font-semibold">
                                        Qty / Unit
                                      </th>
                                      <th className="px-3 py-2 text-right font-semibold">
                                        Rate
                                      </th>
                                      <th className="px-3 py-2 text-right font-semibold">
                                        Disc
                                      </th>
                                      <th className="px-3 py-2 text-right font-semibold">
                                        Line Total
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {row.sale.items.map((item) => (
                                      <tr key={item.id}>
                                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                                          {item.itemName}
                                        </td>
                                        <td className="px-3 py-2 font-mono-tabular text-slate-500 dark:text-slate-400">
                                          {item.batchNumber || '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                                          {item.quantity} {item.unit || 'Unit'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                                          {formatMoney(item.unitPrice, settings)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono-tabular text-slate-500 dark:text-slate-400">
                                          {item.itemDiscount > 0
                                            ? formatMoney(
                                                item.itemDiscount,
                                                settings,
                                              )
                                            : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                                          {formatMoney(item.lineTotal, settings)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  {row.sale.discountAmount > 0 && (
                                    <tfoot className="border-t border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
                                      <tr>
                                        <td
                                          colSpan={5}
                                          className="px-3 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:text-slate-400"
                                        >
                                          Bill Net Total (after{' '}
                                          {formatMoney(
                                            row.sale.discountAmount,
                                            settings,
                                          )}{' '}
                                          total discount):
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono-tabular font-bold text-slate-900 dark:text-slate-100">
                                          {formatMoney(
                                            row.sale.netPayable,
                                            settings,
                                          )}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  )}
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Clean Print-Only Statement View (always includes all itemized bills cleanly) */}
              <div id="khata-print-area" className="hidden p-4 text-slate-900">
                <div className="border-b-2 border-[#0D7A5F] pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h1 className="text-lg font-bold text-[#0D7A5F]">
                        {(
                          settings?.pharmacyName?.trim() ||
                          'Clinix Community Pharmacy'
                        ).toUpperCase()}
                      </h1>
                      <p className="text-xs text-slate-600">
                        {settings?.address?.trim() ||
                          '17 KM Ferozepur Road, Lahore'}
                        {settings?.phone?.trim()
                          ? ` · Tel: ${settings.phone.trim()}`
                          : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        CUSTOMER KHATA STATEMENT
                      </p>
                      <p className="text-xs text-slate-500">
                        Period: {fromDate || 'All Dates'} to{' '}
                        {toDate || 'Today'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">
                      {statement.party.name}
                    </p>
                    <p className="text-slate-600">
                      Phone: {statement.party.phone || 'N/A'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>
                      Total Credit Given:{' '}
                      <strong className="font-mono-tabular">
                        {formatMoney(statement.totalCreditGiven, settings)}
                      </strong>
                    </p>
                    <p>
                      Total Collected:{' '}
                      <strong className="font-mono-tabular">
                        {formatMoney(statement.totalCollected, settings)}
                      </strong>
                    </p>
                    <p className="text-sm">
                      Current Balance Due:{' '}
                      <strong className="font-mono-tabular text-[#0D7A5F]">
                        {formatMoney(statement.currentBalanceDue, settings)}
                      </strong>
                    </p>
                  </div>
                </div>

                <table className="mt-4 w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-300 bg-slate-100 text-slate-700">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Voucher</th>
                      <th className="px-2 py-2">Particulars & Items</th>
                      <th className="px-2 py-2 text-right">Debit (+)</th>
                      <th className="px-2 py-2 text-right">Credit (-)</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {statement.rows.map((row) => (
                      <tr key={`print-${row.id}`} className="align-top">
                        <td className="px-2 py-2 whitespace-nowrap font-mono-tabular">
                          {formatDateBySettings(row.createdAt, settings)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap font-mono-tabular">
                          {row.voucherNumber}
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-semibold">
                            {row.title}
                            {row.editedAt ? ' [Edited]' : ''}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {row.subtitle}
                          </div>
                          {row.editedAt && row.editReason && (
                            <div className="text-[10px] italic text-amber-800">
                              Revised by{' '}
                              {row.editedByName || row.editedBy || 'Staff'} on{' '}
                              {formatDateBySettings(row.editedAt, settings)} ·{' '}
                              {row.editReason}
                            </div>
                          )}
                          {row.sale && row.sale.items.length > 0 && (
                            <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-slate-700">
                              {row.sale.items.map((si) => (
                                <li key={`psi-${si.id}`}>
                                  • {si.itemName} ({si.quantity}{' '}
                                  {si.unit || 'Unit'} ×{' '}
                                  {formatMoney(si.unitPrice, settings)}) ={' '}
                                  {formatMoney(si.lineTotal, settings)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono-tabular">
                          {row.debit > 0
                            ? formatMoney(row.debit, settings)
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono-tabular">
                          {row.credit > 0
                            ? formatMoney(row.credit, settings)
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono-tabular font-bold">
                          {formatMoney(row.runningBalance, settings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Bills & Payment Ledger Modal */}
      {selectedSupplierParty && supplierStatement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 dark:bg-black/75 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="supplier-ledger-title"
        >
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            {/* Header */}
            <div className="no-print flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3
                    id="supplier-ledger-title"
                    className="text-lg font-bold text-slate-900 dark:text-slate-100"
                  >
                    {selectedSupplierParty.name}
                  </h3>
                  <span
                    className={`rounded-md px-2 py-0.5 font-mono-tabular text-xs font-bold ${
                      selectedSupplierParty.balance > 0
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                        : 'bg-emerald-100 text-[#0D7A5F] dark:bg-emerald-950/70 dark:text-emerald-300'
                    }`}
                  >
                    To Pay:{' '}
                    {formatMoney(selectedSupplierParty.balance, settings)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Bill-Wise Purchases & Supplier Payment Ledger ·{' '}
                  {selectedSupplierParty.phone || 'No phone saved'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(selectedSupplierParty.balance > 0 ||
                  supplierStatement.bills.some(
                    (b) => b.purchase.balanceDue > 0.005,
                  )) && (
                  <button
                    type="button"
                    onClick={() => openSettleModal(selectedSupplierParty)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#0D7A5F] px-3 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D]"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span>Record Payment</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopySupplierShare}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Summary</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareSupplierStatement}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSupplierPdf}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSupplierPartyId(null)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  aria-label="Close supplier ledger"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {supplierShareFeedback && (
              <div className="no-print flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                <span>{supplierShareFeedback}</span>
              </div>
            )}

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {/* Summary Totals */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total Purchased
                  </p>
                  <p className="mt-1 font-mono-tabular text-lg font-bold text-slate-900 dark:text-slate-100">
                    {formatMoney(supplierStatement.totalPurchased, settings)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Across {supplierStatement.bills.length} purchase bill
                    {supplierStatement.bills.length === 1 ? '' : 's'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total Paid
                  </p>
                  <p className="mt-1 font-mono-tabular text-lg font-bold text-[#0D7A5F] dark:text-emerald-400">
                    {formatMoney(
                      supplierStatement.totalPaymentsRecorded,
                      settings,
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {supplierStatement.payments.length} recorded payment
                    {supplierStatement.payments.length === 1 ? '' : 's'}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-amber-800 dark:text-amber-400">
                    Current To Pay
                  </p>
                  <p className="mt-1 font-mono-tabular text-lg font-bold text-amber-800 dark:text-amber-300">
                    {formatMoney(supplierStatement.currentBalanceDue, settings)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                    {Math.abs(supplierStatement.unallocatedOrOpeningBalance) >
                    0.01
                      ? supplierStatement.unallocatedOrOpeningBalance > 0
                        ? `Includes ${formatMoney(supplierStatement.unallocatedOrOpeningBalance, settings)} opening/prev bal`
                        : `Includes ${formatMoney(Math.abs(supplierStatement.unallocatedOrOpeningBalance), settings)} unallocated payments`
                      : 'Matches open bill balances'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Bill Status
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                      {supplierStatement.paidBillCount} Paid
                    </span>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                      {supplierStatement.partialBillCount} Partial
                    </span>
                    <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                      {supplierStatement.unpaidBillCount} Unpaid
                    </span>
                  </div>
                </div>
              </div>

              {/* Sub-Tabs */}
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setSupplierLedgerTab('bills')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      supplierLedgerTab === 'bills'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    Purchase Bills ({supplierStatement.bills.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSupplierLedgerTab('payments')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      supplierLedgerTab === 'payments'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    Payment History ({supplierStatement.payments.length})
                  </button>
                </div>
              </div>

              {supplierLedgerTab === 'bills' ? (
                supplierStatement.bills.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    No purchase bills recorded for this supplier yet. Record stock-in from Purchases & Suppliers.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {supplierStatement.bills.map((row) => {
                      const pur = row.purchase;
                      const isExpanded = Boolean(
                        expandedSupplierBillIds[pur.id],
                      );
                      const pctPaid =
                        pur.totalAmount > 0
                          ? Math.min(
                              100,
                              Math.round((pur.paidAmount / pur.totalAmount) * 100),
                            )
                          : 100;

                      return (
                        <div
                          key={pur.id}
                          className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSupplierBillIds((prev) => ({
                                    ...prev,
                                    [pur.id]: !prev[pur.id],
                                  }))
                                }
                                className="mt-0.5 rounded-md border border-slate-200 bg-slate-50 p-1 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                aria-label={
                                  isExpanded
                                    ? 'Collapse bill items'
                                    : 'Expand bill items'
                                }
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>

                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono-tabular text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {pur.purchaseNumber}
                                  </span>
                                  <span className="font-mono-tabular rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    Inv: {pur.supplierInvoiceNo}
                                  </span>
                                  <span
                                    className={`rounded px-2 py-0.5 text-[10.5px] font-bold ${
                                      row.status === 'Paid'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                        : row.status === 'Partially Paid'
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                                    }`}
                                  >
                                    {row.status}
                                  </span>
                                </div>
                                <p className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">
                                  {formatDateBySettings(pur.createdAt, settings, {
                                    includeTime: true,
                                  })}{' '}
                                  · {pur.items.length} line
                                  {pur.items.length === 1 ? '' : 's'} ·{' '}
                                  {row.status === 'Partially Paid'
                                    ? `Partial payment recorded (${pctPaid}% paid)`
                                    : row.status === 'Unpaid'
                                      ? 'No payment recorded yet'
                                      : 'Settled in full'}
                                </p>
                                {/* Progress bar for partial/unpaid clarity */}
                                <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                  <div
                                    className={`h-full rounded-full ${
                                      row.status === 'Paid'
                                        ? 'bg-[#0D7A5F]'
                                        : row.status === 'Partially Paid'
                                          ? 'bg-amber-500'
                                          : 'bg-rose-400'
                                    }`}
                                    style={{ width: `${pctPaid}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4 pl-9 sm:justify-end sm:pl-0">
                              <div className="grid grid-cols-3 gap-4 text-right text-xs">
                                <div>
                                  <p className="text-[10px] uppercase text-slate-400">
                                    Total
                                  </p>
                                  <p className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                                    {formatMoney(pur.totalAmount, settings)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase text-slate-400">
                                    Paid
                                  </p>
                                  <p className="font-mono-tabular font-semibold text-[#0D7A5F] dark:text-emerald-400">
                                    {formatMoney(pur.paidAmount, settings)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase text-slate-400">
                                    Remaining
                                  </p>
                                  <p
                                    className={`font-mono-tabular font-bold ${
                                      pur.balanceDue > 0.005
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    {formatMoney(pur.balanceDue, settings)}
                                  </p>
                                </div>
                              </div>

                              {pur.balanceDue > 0.005 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openSettleModal(selectedSupplierParty, pur)
                                  }
                                  className="rounded-lg bg-[#0D7A5F] px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D]"
                                >
                                  Pay Bill
                                </button>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="space-y-3 border-t border-slate-100 bg-slate-50/80 px-4 py-3 pl-12 dark:border-slate-800 dark:bg-slate-950/50">
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-400">
                                    <tr>
                                      <th className="px-3 py-2 font-semibold">
                                        Medicine Received
                                      </th>
                                      <th className="px-3 py-2 font-semibold">
                                        Batch / Expiry
                                      </th>
                                      <th className="px-3 py-2 text-right font-semibold">
                                        Qty
                                      </th>
                                      <th className="px-3 py-2 text-right font-semibold">
                                        Unit Cost
                                      </th>
                                      <th className="px-3 py-2 text-right font-semibold">
                                        Line Total
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {pur.items.map((line) => (
                                      <tr key={line.id}>
                                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                                          {line.itemName}
                                        </td>
                                        <td className="px-3 py-2 font-mono-tabular text-slate-500 dark:text-slate-400">
                                          {line.batchNumber || '—'} · Exp{' '}
                                          {line.expiryDate}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                                          {line.quantity}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                                          {formatMoney(line.unitCost, settings)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                                          {formatMoney(line.lineTotal, settings)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {row.allocatedPayments.length > 0 && (
                                <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                                  <p className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300">
                                    Payments Allocated to {pur.purchaseNumber}
                                  </p>
                                  <div className="mt-1.5 space-y-1 text-[11px]">
                                    {row.allocatedPayments.map((pay) => (
                                      <div
                                        key={pay.id}
                                        className="flex flex-wrap items-center justify-between gap-2 text-slate-700 dark:text-slate-300"
                                      >
                                        <span>
                                          {formatDateBySettings(
                                            pay.createdAt,
                                            settings,
                                          )}{' '}
                                          · {pay.paymentMode}
                                          {pay.reference
                                            ? ` · Ref: ${pay.reference}`
                                            : ''}
                                          {pay.notes ? ` · ${pay.notes}` : ''}
                                        </span>
                                        <span className="font-mono-tabular font-bold text-[#0D7A5F] dark:text-emerald-400">
                                          {formatMoney(pay.amount, settings)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : supplierStatement.payments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No payments recorded to this supplier yet.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Allocation</th>
                        <th className="px-4 py-3">Method & Reference</th>
                        <th className="px-4 py-3">Notes</th>
                        <th className="px-4 py-3 text-right">Amount Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {supplierStatement.payments.map((pay) => (
                        <tr key={pay.id}>
                          <td className="px-4 py-3 font-mono-tabular text-slate-700 dark:text-slate-300">
                            {formatDateBySettings(pay.createdAt, settings, {
                              includeTime: true,
                            })}
                          </td>
                          <td className="px-4 py-3">
                            {pay.purchaseNumber ? (
                              <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 font-mono-tabular text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                {pay.purchaseNumber}
                                {pay.supplierInvoiceNo
                                  ? ` (${pay.supplierInvoiceNo})`
                                  : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                General Payable
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            <span className="font-medium">{pay.paymentMode}</span>
                            {pay.reference && (
                              <span className="ml-1.5 font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                                · Ref: {pay.reference}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                            {pay.notes || '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#0D7A5F] dark:text-emerald-400">
                            {formatMoney(pay.amount, settings)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Party Modal */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/70"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleAddSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Add Customer or Supplier
              </h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Party Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as PartyType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="customer">Customer (To Collect)</option>
                  <option value="supplier">Supplier (To Pay)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Full Name / Clinic / Distributor
                </label>
                <input
                  required
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="03XX-XXXXXXX"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Opening Balance ({cur})
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A634D]"
              >
                Save Party
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settle Balance / Record Collection Modal */}
      {settleTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 p-4 dark:bg-black/75"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSettleSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {settleTarget.type === 'customer'
                    ? 'Record Collection (Vasooli)'
                    : 'Record Supplier Payment'}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {settleTarget.name} · Current Balance:{' '}
                  <span className="font-mono-tabular font-semibold text-slate-700 dark:text-slate-200">
                    {formatMoney(settleTarget.balance, settings)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettleTarget(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {settleError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {settleError}
                </div>
              )}

              {settleTarget.type === 'supplier' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Allocate to Purchase Bill (Optional)
                  </label>
                  <select
                    value={settlePurchaseId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setSettlePurchaseId('');
                        setSettleAmount(String(settleTarget.balance));
                        return;
                      }
                      const billId = Number(val);
                      setSettlePurchaseId(billId);
                      const bill = settleTargetOpenBills.find(
                        (b) => b.id === billId,
                      );
                      if (bill) {
                        setSettleAmount(String(bill.balanceDue));
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">
                      General Supplier Payable (Unallocated · Bal:{' '}
                      {formatMoney(settleTarget.balance, settings)})
                    </option>
                    {settleTargetOpenBills.map((bill) => {
                      const status = getPurchasePaymentStatus(bill);
                      return (
                        <option key={bill.id} value={bill.id}>
                          {bill.purchaseNumber} (Inv: {bill.supplierInvoiceNo}) ·{' '}
                          {status} · Due:{' '}
                          {formatMoney(bill.balanceDue, settings)}
                        </option>
                      );
                    })}
                  </select>
                  {selectedSettleBill && (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                      Bill Total:{' '}
                      {formatMoney(selectedSettleBill.totalAmount, settings)} ·
                      Already Paid:{' '}
                      {formatMoney(selectedSettleBill.paidAmount, settings)} ·
                      Remaining:{' '}
                      {formatMoney(selectedSettleBill.balanceDue, settings)}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Amount ({cur})
                  </label>
                  <input
                    required
                    type="number"
                    min={0.01}
                    max={
                      selectedSettleBill
                        ? selectedSettleBill.balanceDue
                        : settleTarget.balance
                    }
                    step="0.01"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {settleTarget.type === 'customer'
                      ? 'Collection Date'
                      : 'Payment Date'}
                  </label>
                  <input
                    required
                    type="date"
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Payment Method
                </label>
                <select
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="Cash">Cash</option>
                  <option value="JazzCash / EasyPaisa">
                    JazzCash / EasyPaisa
                  </option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Reference # (Optional)
                </label>
                <input
                  type="text"
                  value={settleReference}
                  onChange={(e) => setSettleReference(e.target.value)}
                  placeholder="Receipt / Transaction ID"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder={
                    settleTarget.type === 'customer'
                      ? 'e.g., Partial cash payment at counter'
                      : 'e.g., Partial payment against invoice'
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettleTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A634D]"
              >
                {settleTarget.type === 'customer'
                  ? 'Confirm Collection'
                  : 'Confirm Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
