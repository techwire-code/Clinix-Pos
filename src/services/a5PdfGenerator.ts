import { jsPDF } from 'jspdf';
import { PharmacySettings, SaleRecord } from '../types/pharmacy';
import { formatDateBySettings, formatMoney } from './localDb';

export function buildA5InvoicePdf(
  sale: SaleRecord,
  settings?: Partial<PharmacySettings>,
): jsPDF {
  const pharmacyName =
    settings?.pharmacyName?.trim() || 'Clinix Community Pharmacy';
  const address =
    settings?.address?.trim() || '17 KM Ferozepur Road, Lahore';
  const phone = settings?.phone?.trim() || '';
  const licenseNumber = settings?.licenseNumber?.trim() || '';
  const websiteUrl =
    settings?.showWebsiteOnReceipt && settings?.websiteUrl?.trim()
      ? settings.websiteUrl.trim()
      : '';
  const footerNote =
    settings?.receiptFooter?.trim() ||
    'Unopened medicines with original invoice may be exchanged within 7 days.';
  const digits = settings?.decimalDigits ?? 2;

  const fmt = (val: number) =>
    formatMoney(val, settings, { asciiOnly: true });

  // A5 dimensions in mm: 148 x 210
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });

  const left = 10;
  const right = 138;
  let y = 14;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(13, 122, 95);
  doc.text(pharmacyName.toUpperCase(), left, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('SALES INVOICE', right, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(address, left, y);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 122, 95);
  doc.text(sale.invoiceNumber, right, y, { align: 'right' });

  const contactBits = [
    phone ? `Tel: ${phone}` : '',
    licenseNumber ? `Lic: ${licenseNumber}` : '',
    websiteUrl || '',
  ].filter(Boolean);

  if (contactBits.length > 0) {
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(contactBits.join(' · '), left, y);
  }

  y += 4;
  doc.setDrawColor(13, 122, 95);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);

  // Party & Date box
  y += 5;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(left, y, right - left, 14, 'FD');

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Customer / Party', left + 3, y + 4.5);
  doc.text('Date & Payment Mode', right - 3, y + 4.5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(sale.partyName, left + 3, y + 10);

  const formattedDate = formatDateBySettings(sale.createdAt, settings, {
    includeTime: true,
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const modeLabel = sale.transactionReference
    ? `${sale.paymentMode} (${sale.transactionReference})`
    : sale.paymentMode;
  doc.text(`${formattedDate} · ${modeLabel}`, right - 3, y + 10, {
    align: 'right',
  });

  // Table Header
  y += 20;
  doc.setFillColor(15, 23, 42);
  doc.rect(left, y, right - left, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Medicine / Batch', left + 2, y + 4.8);
  doc.text('Qty', 82, y + 4.8, { align: 'right' });
  doc.text('Rate', 100, y + 4.8, { align: 'right' });
  doc.text('Disc', 117, y + 4.8, { align: 'right' });
  doc.text('Amount', right - 2, y + 4.8, { align: 'right' });

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  for (const line of sale.items) {
    if (y > 168) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(8);
    doc.text(line.itemName.slice(0, 34), left + 2, y + 4.5);
    doc.text(String(line.quantity), 82, y + 4.5, { align: 'right' });
    doc.text(line.unitPrice.toFixed(digits), 100, y + 4.5, { align: 'right' });
    doc.text(
      line.itemDiscount > 0 ? `-${line.itemDiscount.toFixed(0)}` : '0',
      117,
      y + 4.5,
      { align: 'right' },
    );
    doc.text(line.lineTotal.toFixed(digits), right - 2, y + 4.5, {
      align: 'right',
    });

    if (line.batchNumber) {
      y += 4;
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Batch: ${line.batchNumber}`, left + 2, y + 3.5);
      doc.setTextColor(15, 23, 42);
    }

    y += 6.5;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(left, y, right, y);
  }

  // Totals Box
  y += 8;
  const boxX = 76;
  const hasCashDetails = sale.cashReceived !== undefined;
  doc.setDrawColor(226, 232, 240);
  doc.rect(boxX, y, right - boxX, hasCashDetails ? 35 : 24, 'S');

  doc.setFontSize(8);
  doc.text('Subtotal:', boxX + 3, y + 5.5);
  doc.text(fmt(sale.subtotal), right - 3, y + 5.5, {
    align: 'right',
  });

  doc.text('Total Discount:', boxX + 3, y + 11);
  doc.setTextColor(180, 83, 9);
  doc.text(`-${fmt(sale.discountAmount)}`, right - 3, y + 11, {
    align: 'right',
  });

  doc.setDrawColor(226, 232, 240);
  doc.line(boxX + 2, y + 14.5, right - 2, y + 14.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(13, 122, 95);
  doc.text('Net Payable:', boxX + 3, y + 20.5);
  doc.text(fmt(sale.netPayable), right - 3, y + 20.5, {
    align: 'right',
  });

  if (hasCashDetails && sale.cashReceived !== undefined) {
    const bal = sale.changeReturned ?? sale.cashReceived - sale.netPayable;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Cash Received:', boxX + 3, y + 26.5);
    doc.text(fmt(sale.cashReceived), right - 3, y + 26.5, {
      align: 'right',
    });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Balance / Change:', boxX + 3, y + 32);
    doc.text(fmt(bal), right - 3, y + 32, {
      align: 'right',
    });
  }

  if (sale.editedAt && sale.editReason) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    doc.setTextColor(180, 83, 9);
    doc.text(
      `Edited ${formatDateBySettings(sale.editedAt, settings, { includeTime: true })} by ${sale.editedByName || sale.editedBy || 'Manager'} (${sale.editReason})`,
      left,
      190,
      { maxWidth: right - left },
    );
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(footerNote, 74, 196, { align: 'center', maxWidth: 124 });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${pharmacyName} · ${address}`, 74, 202, {
    align: 'center',
  });

  return doc;
}

export function downloadA5InvoicePdf(
  sale: SaleRecord,
  settings?: Partial<PharmacySettings>,
): void {
  const doc = buildA5InvoicePdf(sale, settings);
  doc.save(`${sale.invoiceNumber}_Pharmacy_A5.pdf`);
}

export async function shareInvoiceSummary(
  sale: SaleRecord,
  settings?: Partial<PharmacySettings>,
): Promise<'shared' | 'copied'> {
  const pharmacyName =
    settings?.pharmacyName?.trim() || 'Clinix Community Pharmacy';
  const address =
    settings?.address?.trim() || '17 KM Ferozepur Road, Lahore';
  const websiteLine =
    settings?.showWebsiteOnReceipt && settings?.websiteUrl?.trim()
      ? `Website: ${settings.websiteUrl.trim()}`
      : null;

  const summaryText = [
    `${pharmacyName.toUpperCase()} (${address})`,
    ...(websiteLine ? [websiteLine] : []),
    `Invoice: ${sale.invoiceNumber}${sale.editedAt ? ' (REVISED)' : ''}`,
    `Date: ${formatDateBySettings(sale.createdAt, settings, { includeTime: true })}`,
    `Party: ${sale.partyName}`,
    `Payment Mode: ${sale.paymentMode}${sale.transactionReference ? ` (Ref: ${sale.transactionReference})` : ''}`,
    `Subtotal: ${formatMoney(sale.subtotal, settings)}`,
    `Discount: -${formatMoney(sale.discountAmount, settings)}`,
    `Net Payable: ${formatMoney(sale.netPayable, settings)}`,
    ...(sale.editedAt && sale.editReason
      ? [`Audit Note: Edited by ${sale.editedByName || 'Manager'} (${sale.editReason})`]
      : []),
  ].join('\n');

  const doc = buildA5InvoicePdf(sale, settings);
  const blob = doc.output('blob');
  const file = new File([blob], `${sale.invoiceNumber}_Pharmacy.pdf`, {
    type: 'application/pdf',
  });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      title: `${pharmacyName} Invoice ${sale.invoiceNumber}`,
      text: summaryText,
      files: [file],
    });
    return 'shared';
  }

  await navigator.clipboard.writeText(summaryText);
  return 'copied';
}
