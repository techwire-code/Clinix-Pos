import { PharmacySettings, SaleRecord, ThermalWidth } from '../types/pharmacy';

function padRight(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width, ' ');
}

function padLeft(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text.padStart(width, ' ');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}.`;
}

function twoCol(left: string, right: string, cols: number): string {
  const space = cols - left.length - right.length;
  if (space <= 1) return `${left} ${right}`;
  return `${left}${' '.repeat(space)}${right}`;
}

function sanitizeAscii(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, ' ').trim();
}

export interface EscPosOutput {
  previewLines: string[];
  bytes: Uint8Array;
  hexDump: string;
}

export function generateEscPosReceipt(
  sale: SaleRecord,
  width: ThermalWidth,
  settings?: Partial<PharmacySettings>,
): EscPosOutput {
  const cols = width === '58mm' ? 32 : 48;
  const pharmacyName = sanitizeAscii(
    settings?.pharmacyName?.trim() || 'CLINIX COMMUNITY PHARMACY',
  ).toUpperCase();
  const branchAddress = sanitizeAscii(
    settings?.branchAddress?.trim() || '17 KM Ferozepur Road, Lahore',
  );
  const phoneNumber = sanitizeAscii(settings?.phoneNumber?.trim() || '');
  const licenseNumber = sanitizeAscii(settings?.licenseNumber?.trim() || '');
  const footerNote = sanitizeAscii(
    settings?.receiptFooterNote?.trim() ||
      'Exchange within 7 days with intact pack',
  );
  const cur = sanitizeAscii(settings?.currencyLabel?.trim() || 'PKR').toUpperCase();

  const previewLines: string[] = [];
  const bytes: number[] = [];

  const pushTextLine = (line: string) => {
    const clean = sanitizeAscii(line);
    previewLines.push(clean);
    for (let i = 0; i < clean.length; i++) {
      bytes.push(clean.charCodeAt(i) & 0xff);
    }
    bytes.push(0x0a);
  };

  const centerText = (line: string) => {
    const clean = sanitizeAscii(line);
    const pad = Math.max(0, Math.floor((cols - clean.length) / 2));
    previewLines.push(`${' '.repeat(pad)}${clean}`);
    for (let i = 0; i < clean.length; i++) {
      bytes.push(clean.charCodeAt(i) & 0xff);
    }
    bytes.push(0x0a);
  };

  const dateFormatted = new Date(sale.createdAt).toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // ESC @ (Initialize) + ESC t 0 (PC437)
  bytes.push(0x1b, 0x40, 0x1b, 0x74, 0x00);

  // Center + Bold + Double Size
  bytes.push(0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01, 0x1d, 0x21, 0x11);
  centerText(pharmacyName);
  bytes.push(0x1d, 0x21, 0x00, 0x1b, 0x45, 0x00);
  centerText(branchAddress);
  if (phoneNumber) {
    centerText(`Tel: ${phoneNumber}`);
  }
  if (licenseNumber) {
    centerText(`Lic: ${licenseNumber}`);
  }
  pushTextLine('='.repeat(cols));

  // Left Align metadata
  bytes.push(0x1b, 0x61, 0x00);
  pushTextLine(twoCol(`Inv: ${sale.invoiceNumber}`, sale.paymentMode, cols));
  if (sale.transactionReference) {
    pushTextLine(`Ref: ${sale.transactionReference}`);
  }
  pushTextLine(`Date: ${dateFormatted}`);
  pushTextLine(`Party: ${sale.partyName}`);
  pushTextLine('-'.repeat(cols));

  bytes.push(0x1b, 0x45, 0x01);
  if (cols >= 48) {
    pushTextLine(
      `${padRight('Item', 22)}${padLeft('Qty', 5)}${padLeft('Disc', 9)}${padLeft('Total', 12)}`,
    );
  } else {
    pushTextLine(
      `${padRight('Item', 15)}${padLeft('Qty', 4)}${padLeft('Total', 13)}`,
    );
  }
  bytes.push(0x1b, 0x45, 0x00);
  pushTextLine('-'.repeat(cols));

  for (const item of sale.items) {
    const totalStr = item.lineTotal.toFixed(2);
    if (cols >= 48) {
      const discStr = item.itemDiscount > 0 ? `-${item.itemDiscount.toFixed(0)}` : '0';
      pushTextLine(
        `${padRight(truncate(item.itemName, 21), 22)}${padLeft(String(item.quantity), 5)}${padLeft(discStr, 9)}${padLeft(totalStr, 12)}`,
      );
      if (item.batchNumber) {
        pushTextLine(`  Batch: ${item.batchNumber} @ ${item.unitPrice.toFixed(2)}`);
      }
    } else {
      pushTextLine(
        `${padRight(truncate(item.itemName, 14), 15)}${padLeft(String(item.quantity), 4)}${padLeft(totalStr, 13)}`,
      );
      if (item.itemDiscount > 0) {
        pushTextLine(
          `  Rate:${item.unitPrice.toFixed(0)} Disc:-${item.itemDiscount.toFixed(0)}`,
        );
      }
    }
  }

  pushTextLine('-'.repeat(cols));
  pushTextLine(twoCol('Subtotal:', `${cur} ${sale.subtotal.toFixed(2)}`, cols));
  if (sale.discountAmount > 0) {
    pushTextLine(
      twoCol('Total Discount:', `-${cur} ${sale.discountAmount.toFixed(2)}`, cols),
    );
  }

  bytes.push(0x1b, 0x45, 0x01, 0x1d, 0x21, 0x01);
  pushTextLine(twoCol('NET PAYABLE:', `${cur} ${sale.netPayable.toFixed(2)}`, cols));
  bytes.push(0x1d, 0x21, 0x00, 0x1b, 0x45, 0x00);
  if (sale.cashReceived !== undefined) {
    pushTextLine(
      twoCol('Cash Received:', `${cur} ${sale.cashReceived.toFixed(2)}`, cols),
    );
    const bal = sale.changeReturned ?? sale.cashReceived - sale.netPayable;
    pushTextLine(twoCol('Balance / Change:', `${cur} ${bal.toFixed(2)}`, cols));
  }
  pushTextLine('='.repeat(cols));

  bytes.push(0x1b, 0x61, 0x01);
  if (footerNote) {
    centerText(footerNote);
  }
  centerText(`Thank you for visiting ${pharmacyName}!`);

  // Feed 4 lines + Paper Cut (GS V 66 0)
  bytes.push(0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00);

  const hexDump = bytes
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');

  return {
    previewLines,
    bytes: new Uint8Array(bytes),
    hexDump,
  };
}

export function generateTestEscPosReceipt(
  settings: PharmacySettings,
): EscPosOutput {
  const sampleSale: SaleRecord = {
    id: 0,
    invoiceNumber: 'TEST-PRINT-001',
    partyId: null,
    partyName: 'Counter Printer Calibration',
    subtotal: 350,
    discountAmount: 0,
    netPayable: 350,
    totalCost: 280,
    netProfit: 70,
    paymentMode: 'Cash',
    cashReceived: 500,
    changeReturned: 150,
    createdAt: new Date().toISOString(),
    items: [
      {
        id: 1,
        saleId: 0,
        itemId: 1,
        itemName: 'Panadol 500mg Box Test',
        batchNumber: 'TEST-01',
        quantity: 1,
        unitPrice: 350,
        costPrice: 280,
        itemDiscount: 0,
        lineTotal: 350,
      },
    ],
  };
  return generateEscPosReceipt(sampleSale, settings.paperWidth, settings);
}
