import { jsPDF } from 'jspdf';
import { SaleRecord } from '../types/pharmacy';

export function buildA5InvoicePdf(sale: SaleRecord): jsPDF {
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
  doc.text('CLINIX COMMUNITY PHARMACY', left, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('SALES INVOICE', right, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('17 KM Ferozepur Road, Lahore', left, y);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 122, 95);
  doc.text(sale.invoiceNumber, right, y, { align: 'right' });

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

  const formattedDate = new Date(sale.createdAt).toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${formattedDate} · ${sale.paymentMode}`, right - 3, y + 10, {
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
    doc.text(line.unitPrice.toFixed(2), 100, y + 4.5, { align: 'right' });
    doc.text(
      line.itemDiscount > 0 ? `-${line.itemDiscount.toFixed(0)}` : '0',
      117,
      y + 4.5,
      { align: 'right' },
    );
    doc.text(line.lineTotal.toFixed(2), right - 2, y + 4.5, { align: 'right' });

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
  const boxX = 78;
  doc.setDrawColor(226, 232, 240);
  doc.rect(boxX, y, right - boxX, 24, 'S');

  doc.setFontSize(8);
  doc.text('Subtotal:', boxX + 3, y + 5.5);
  doc.text(`PKR ${sale.subtotal.toFixed(2)}`, right - 3, y + 5.5, {
    align: 'right',
  });

  doc.text('Total Discount:', boxX + 3, y + 11);
  doc.setTextColor(180, 83, 9);
  doc.text(`-PKR ${sale.discountAmount.toFixed(2)}`, right - 3, y + 11, {
    align: 'right',
  });

  doc.setDrawColor(226, 232, 240);
  doc.line(boxX + 2, y + 14.5, right - 2, y + 14.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(13, 122, 95);
  doc.text('Net Payable:', boxX + 3, y + 20.5);
  doc.text(`PKR ${sale.netPayable.toFixed(2)}`, right - 3, y + 20.5, {
    align: 'right',
  });

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Unopened medicines with original invoice may be exchanged within 7 days.',
    74,
    196,
    { align: 'center' },
  );
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Clinix Community Pharmacy · 17 KM Ferozepur Road, Lahore', 74, 201, {
    align: 'center',
  });

  return doc;
}

export function downloadA5InvoicePdf(sale: SaleRecord): void {
  const doc = buildA5InvoicePdf(sale);
  doc.save(`${sale.invoiceNumber}_Clinix_Pharmacy_A5.pdf`);
}

export async function shareInvoiceSummary(sale: SaleRecord): Promise<'shared' | 'copied'> {
  const summaryText = [
    `CLINIX COMMUNITY PHARMACY (17 KM Ferozepur Road, Lahore)`,
    `Invoice: ${sale.invoiceNumber}`,
    `Party: ${sale.partyName}`,
    `Payment Mode: ${sale.paymentMode}`,
    `Subtotal: PKR ${sale.subtotal.toFixed(2)}`,
    `Discount: -PKR ${sale.discountAmount.toFixed(2)}`,
    `Net Payable: PKR ${sale.netPayable.toFixed(2)}`,
  ].join('\n');

  const doc = buildA5InvoicePdf(sale);
  const blob = doc.output('blob');
  const file = new File([blob], `${sale.invoiceNumber}_Clinix_Pharmacy.pdf`, {
    type: 'application/pdf',
  });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      title: `Clinix Pharmacy Invoice ${sale.invoiceNumber}`,
      text: summaryText,
      files: [file],
    });
    return 'shared';
  }

  await navigator.clipboard.writeText(summaryText);
  return 'copied';
}
