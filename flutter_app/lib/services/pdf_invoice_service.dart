import 'dart:io';
import 'dart:typed_data';

import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';

/// Professional A5 PDF Invoice Generator & One-Tap Share Service
/// using `pdf`, `printing`, and `share_plus` for WhatsApp & Email dispatch.
class PdfInvoiceService {
  PdfInvoiceService._internal();
  static final PdfInvoiceService instance = PdfInvoiceService._internal();

  /// Generates an A5 PDF document (148mm x 210mm) formatted cleanly for
  /// Clinix Community Pharmacy, 17 KM Ferozepur Road, Lahore.
  Future<Uint8List> generateA5InvoiceBytes({
    required SaleRecord sale,
    required List<SaleItemRecord> items,
    PharmacySettings? settings,
  }) async {
    final cfg = settings ?? PharmacySettings.defaults();
    final cur =
        cfg.currencyLabel.trim().isEmpty ? 'PKR' : cfg.currencyLabel.trim();
    final doc = pw.Document(
      title: 'Invoice ${sale.invoiceNumber} - ${cfg.pharmacyName}',
      author: cfg.pharmacyName,
    );

    final currency = NumberFormat('#,##0.00');
    final parsedDate = DateTime.tryParse(sale.createdAt) ?? DateTime.now();
    final formattedDate = DateFormat('dd MMM yyyy, hh:mm a').format(parsedDate);

    const primaryColor = PdfColor.fromInt(0xFF0D7A5F);
    const inkColor = PdfColor.fromInt(0xFF0F172A);
    const mutedColor = PdfColor.fromInt(0xFF475569);
    const borderColor = PdfColor.fromInt(0xFFE2E8F0);
    const surfaceColor = PdfColor.fromInt(0xFFF8FAFC);

    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a5,
        margin: const pw.EdgeInsets.all(20),
        build: (context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              // Pharmacy Brand Header
              pw.Container(
                padding: const pw.EdgeInsets.only(bottom: 10),
                decoration: const pw.BoxDecoration(
                  border: pw.Border(
                    bottom: pw.BorderSide(color: primaryColor, width: 1.5),
                  ),
                ),
                child: pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.Text(
                          cfg.pharmacyName.toUpperCase(),
                          style: pw.TextStyle(
                            fontSize: 13,
                            fontWeight: pw.FontWeight.bold,
                            color: primaryColor,
                          ),
                        ),
                        pw.SizedBox(height: 2),
                        pw.Text(
                          cfg.branchAddress,
                          style: const pw.TextStyle(
                            fontSize: 8.5,
                            color: inkColor,
                          ),
                        ),
                        pw.Text(
                          [
                            if (cfg.phoneNumber.trim().isNotEmpty)
                              'Tel: ${cfg.phoneNumber.trim()}',
                            if (cfg.licenseNumber.trim().isNotEmpty)
                              'Lic: ${cfg.licenseNumber.trim()}',
                          ].join(' · '),
                          style: const pw.TextStyle(
                            fontSize: 7.5,
                            color: mutedColor,
                          ),
                        ),
                      ],
                    ),
                    pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.end,
                      children: [
                        pw.Text(
                          'TAX / SALES INVOICE',
                          style: pw.TextStyle(
                            fontSize: 9,
                            fontWeight: pw.FontWeight.bold,
                            color: inkColor,
                          ),
                        ),
                        pw.SizedBox(height: 2),
                        pw.Text(
                          sale.invoiceNumber,
                          style: pw.TextStyle(
                            fontSize: 9,
                            fontWeight: pw.FontWeight.bold,
                            color: primaryColor,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              pw.SizedBox(height: 10),

              // Customer & Payment Metadata Box
              pw.Container(
                padding: const pw.EdgeInsets.all(8),
                decoration: pw.BoxDecoration(
                  color: surfaceColor,
                  border: pw.Border.all(color: borderColor, width: 0.8),
                  borderRadius: pw.BorderRadius.circular(4),
                ),
                child: pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  children: [
                    pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.Text(
                          'Customer / Party',
                          style: const pw.TextStyle(
                            fontSize: 7,
                            color: mutedColor,
                          ),
                        ),
                        pw.Text(
                          sale.partyName,
                          style: pw.TextStyle(
                            fontSize: 8.5,
                            fontWeight: pw.FontWeight.bold,
                            color: inkColor,
                          ),
                        ),
                      ],
                    ),
                    pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.end,
                      children: [
                        pw.Text(
                          'Date: $formattedDate',
                          style: const pw.TextStyle(
                            fontSize: 7.5,
                            color: inkColor,
                          ),
                        ),
                        pw.SizedBox(height: 2),
                        pw.Text(
                          sale.transactionReference != null &&
                                  sale.transactionReference!.isNotEmpty
                              ? 'Mode: ${sale.paymentMode.dbValue} (${sale.transactionReference})'
                              : 'Mode: ${sale.paymentMode.dbValue}',
                          style: pw.TextStyle(
                            fontSize: 7.5,
                            fontWeight: pw.FontWeight.bold,
                            color: primaryColor,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              pw.SizedBox(height: 12),

              // Itemized Table
              pw.TableHelper.fromTextArray(
                border: pw.TableBorder.symmetric(
                  inside: const pw.BorderSide(color: borderColor, width: 0.5),
                  outside: const pw.BorderSide(color: borderColor, width: 0.8),
                ),
                headerStyle: pw.TextStyle(
                  fontSize: 7.5,
                  fontWeight: pw.FontWeight.bold,
                  color: PdfColors.white,
                ),
                headerDecoration: const pw.BoxDecoration(color: inkColor),
                cellStyle: const pw.TextStyle(fontSize: 7.5, color: inkColor),
                cellPadding:
                    const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 4),
                columnWidths: {
                  0: const pw.FlexColumnWidth(3.2),
                  1: const pw.FlexColumnWidth(0.9),
                  2: const pw.FlexColumnWidth(1.3),
                  3: const pw.FlexColumnWidth(1.1),
                  4: const pw.FlexColumnWidth(1.5),
                },
                cellAlignments: {
                  0: pw.Alignment.centerLeft,
                  1: pw.Alignment.centerRight,
                  2: pw.Alignment.centerRight,
                  3: pw.Alignment.centerRight,
                  4: pw.Alignment.centerRight,
                },
                headers: ['Item / Batch', 'Qty', 'Rate', 'Disc', 'Amount'],
                data: items.map((line) {
                  final title = line.batchNumber.isNotEmpty
                      ? '${line.itemName}\nBatch: ${line.batchNumber}'
                      : line.itemName;
                  return [
                    title,
                    '${line.quantity}',
                    currency.format(line.unitPrice),
                    line.itemDiscount > 0
                        ? '-${currency.format(line.itemDiscount)}'
                        : '0.00',
                    currency.format(line.lineTotal),
                  ];
                }).toList(),
              ),

              pw.SizedBox(height: 12),

              // Financial Totals Box
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.end,
                children: [
                  pw.Container(
                    width: 175,
                    padding: const pw.EdgeInsets.all(8),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: borderColor, width: 0.8),
                      borderRadius: pw.BorderRadius.circular(4),
                    ),
                    child: pw.Column(
                      children: [
                        _summaryRow(
                            'Subtotal', '$cur ${currency.format(sale.subtotal)}'),
                        pw.SizedBox(height: 3),
                        _summaryRow(
                          'Total Discount',
                          '-$cur ${currency.format(sale.discountAmount)}',
                          valueColor: const PdfColor.fromInt(0xFFB45309),
                        ),
                        pw.Divider(color: borderColor, height: 8),
                        _summaryRow(
                          'Net Payable',
                          '$cur ${currency.format(sale.netPayable)}',
                          isBold: true,
                          valueColor: primaryColor,
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              pw.Spacer(),

              // Footer Terms
              pw.Container(
                padding: const pw.EdgeInsets.only(top: 8),
                decoration: const pw.BoxDecoration(
                  border: pw.Border(
                    top: pw.BorderSide(color: borderColor, width: 0.6),
                  ),
                ),
                child: pw.Column(
                  children: [
                    if (cfg.receiptFooterNote.trim().isNotEmpty)
                      pw.Text(
                        cfg.receiptFooterNote.trim(),
                        textAlign: pw.TextAlign.center,
                        style: const pw.TextStyle(
                          fontSize: 6.5,
                          color: mutedColor,
                        ),
                      ),
                    pw.SizedBox(height: 3),
                    pw.Text(
                      '${cfg.pharmacyName} · ${cfg.branchAddress}',
                      style: pw.TextStyle(
                        fontSize: 7,
                        fontWeight: pw.FontWeight.bold,
                        color: inkColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );

    return doc.save();
  }

  pw.Widget _summaryRow(
    String label,
    String value, {
    bool isBold = false,
    PdfColor valueColor = const PdfColor.fromInt(0xFF0F172A),
  }) {
    return pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text(
          label,
          style: pw.TextStyle(
            fontSize: isBold ? 8.5 : 7.5,
            fontWeight: isBold ? pw.FontWeight.bold : pw.FontWeight.normal,
          ),
        ),
        pw.Text(
          value,
          style: pw.TextStyle(
            fontSize: isBold ? 9 : 7.5,
            fontWeight: isBold ? pw.FontWeight.bold : pw.FontWeight.normal,
            color: valueColor,
          ),
        ),
      ],
    );
  }

  /// Opens native print preview / AirPrint / Android PDF printer dialog.
  Future<void> printA5Pdf({
    required SaleRecord sale,
    required List<SaleItemRecord> items,
    PharmacySettings? settings,
  }) async {
    final activeSettings =
        settings ?? await DatabaseHelper.instance.getSettings();
    final bytes = await generateA5InvoiceBytes(
      sale: sale,
      items: items,
      settings: activeSettings,
    );
    await Printing.layoutPdf(
      name: '${sale.invoiceNumber}_Invoice.pdf',
      format: PdfPageFormat.a5,
      onLayout: (_) async => bytes,
    );
  }

  /// Writes A5 PDF to temporary storage and invokes the OS share sheet
  /// for instant 1-tap WhatsApp or Email sharing.
  Future<void> shareInvoicePdf({
    required SaleRecord sale,
    required List<SaleItemRecord> items,
    PharmacySettings? settings,
  }) async {
    final activeSettings =
        settings ?? await DatabaseHelper.instance.getSettings();
    final cur = activeSettings.currencyLabel.trim().isEmpty
        ? 'PKR'
        : activeSettings.currencyLabel.trim();
    final bytes = await generateA5InvoiceBytes(
      sale: sale,
      items: items,
      settings: activeSettings,
    );
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/${sale.invoiceNumber}_Invoice.pdf');
    await file.writeAsBytes(bytes, flush: true);

    await Share.shareXFiles(
      [XFile(file.path, mimeType: 'application/pdf')],
      subject: '${activeSettings.pharmacyName} Invoice ${sale.invoiceNumber}',
      text:
          'Assalam-o-Alaikum, please find attached your invoice (${sale.invoiceNumber}) from ${activeSettings.pharmacyName}, ${activeSettings.branchAddress}. Net Payable: $cur ${sale.netPayable.toStringAsFixed(2)}.',
    );
  }
}
