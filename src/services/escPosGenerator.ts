import { SaleRecord, ThermalWidth } from '../types/pharmacy';

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

export interface EscPosOutput {
  previewLines: string[];
  bytes: Uint8Array;
  hexDump: string;
}

export function generateEscPosReceipt(
  sale: SaleRecord,
  width: ThermalWidth,
): EscPosOutput {
  const cols = width === '58mm' ? 32 : 48;
  const previewLines: string[] = [];
  const bytes: number[] = [];

  const pushTextLine = (line: string) => {
    previewLines.push(line);
    for (let i = 0; i < line.length; i++) {
      bytes.push(line.charCodeAt(i) & 0xff);
    }
    bytes.push(0x0a);
  };

  const centerText = (line: string) => {
    const pad = Math.max(0, Math.floor((cols - line.length) / 2));
    previewLines.push(`${' '.repeat(pad)}${line}`);
    for (let i = 0; i < line.length; i++) {
      bytes.push(line.charCodeAt(i) & 0xff);
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
  centerText('CLINIX COMMUNITY PHARMACY');
  bytes.push(0x1d, 0x21, 0x00, 0x1b, 0x45, 0x00);
  centerText('17 KM Ferozepur Road, Lahore');
  centerText('Offline POS & Dispensing Receipt');
  pushTextLine('='.repeat(cols));

  // Left Align metadata
  bytes.push(0x1b, 0x61, 0x00);
  pushTextLine(twoCol(`Inv: ${sale.invoiceNumber}`, sale.paymentMode, cols));
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
  pushTextLine(twoCol('Subtotal:', `PKR ${sale.subtotal.toFixed(2)}`, cols));
  if (sale.discountAmount > 0) {
    pushTextLine(
      twoCol('Total Discount:', `-PKR ${sale.discountAmount.toFixed(2)}`, cols),
    );
  }

  bytes.push(0x1b, 0x45, 0x01, 0x1d, 0x21, 0x01);
  pushTextLine(twoCol('NET PAYABLE:', `PKR ${sale.netPayable.toFixed(2)}`, cols));
  bytes.push(0x1d, 0x21, 0x00, 0x1b, 0x45, 0x00);
  pushTextLine('='.repeat(cols));

  bytes.push(0x1b, 0x61, 0x01);
  centerText('Exchange within 7 days with intact pack');
  centerText('Thank you for visiting Clinix Pharmacy!');

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
