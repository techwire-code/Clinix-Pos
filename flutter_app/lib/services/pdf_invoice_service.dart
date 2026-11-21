import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../utils/currency_formatter.dart';

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
    final curUnit = CurrencyFormatter.unitLabel(cfg);
    final doc = pw.Document(
      title: 'Invoice ${sale.invoiceNumber} - ${cfg.pharmacyName}',
      author: cfg.pharmacyName,
    );

    final formattedDate =
        CurrencyFormatter.formatDate(sale.createdAt, cfg, includeTime: true);
    String fmtMoney(double val) => CurrencyFormatter.format(val, cfg);
    final int dec = cfg.decimalDigits;

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
                          cfg.address,
                          style: const pw.TextStyle(
                            fontSize: 8.5,
                            color: inkColor,
                          ),
                        ),
                        pw.Text(
                          [
                            if (cfg.phone.trim().isNotEmpty)
                              'Tel: ${cfg.phone.trim()}',
                            if (cfg.licenseNumber.trim().isNotEmpty)
                              'Lic: ${cfg.licenseNumber.trim()}',
                          ].join(' · '),
                          style: const pw.TextStyle(
                            fontSize: 7.5,
                            color: mutedColor,
                          ),
                        ),
                        if (cfg.showWebsiteOnReceipt &&
                            cfg.websiteUrl.trim().isNotEmpty)
                          pw.Text(
                            cfg.websiteUrl.trim(),
                            style: const pw.TextStyle(
                              fontSize: 7.5,
                              color: primaryColor,
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
                        if (sale.editedAt != null)
                          pw.Text(
                            'REVISED RECEIPT',
                            style: pw.TextStyle(
                              fontSize: 7,
                              fontWeight: pw.FontWeight.bold,
                              color: const PdfColor.fromInt(0xFFB45309),
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
                headers: [
                  'Item / Batch',
                  'Qty',
                  'Rate ($curUnit)',
                  'Disc',
                  'Amount ($curUnit)',
                ],
                data: items.map((line) {
                  final title = line.batchNumber.isNotEmpty
                      ? '${line.itemName}\nBatch: ${line.batchNumber}'
                      : line.itemName;
                  return [
                    title,
                    '${line.quantity}',
                    line.unitPrice.toStringAsFixed(dec),
                    line.itemDiscount > 0
                        ? '-${line.itemDiscount.toStringAsFixed(dec)}'
                        : 0.0.toStringAsFixed(dec),
                    line.lineTotal.toStringAsFixed(dec),
                  ];
                }).toList(),
              ),

              pw.SizedBox(height: 12),

              // Financial Totals Box
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.end,
                children: [
                  pw.Container(
                    width: 185,
                    padding: const pw.EdgeInsets.all(8),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: borderColor, width: 0.8),
                      borderRadius: pw.BorderRadius.circular(4),
                    ),
                    child: pw.Column(
                      children: [
                        _summaryRow('Subtotal', fmtMoney(sale.subtotal)),
                        pw.SizedBox(height: 3),
                        _summaryRow(
                          'Total Discount',
                          '-${fmtMoney(sale.discountAmount)}',
                          valueColor: const PdfColor.fromInt(0xFFB45309),
                        ),
                        pw.Divider(color: borderColor, height: 8),
                        _summaryRow(
                          'Net Payable',
                          fmtMoney(sale.netPayable),
                          isBold: true,
                          valueColor: primaryColor,
                        ),
                        if (sale.cashReceived != null) ...[
                          pw.SizedBox(height: 3),
                          _summaryRow(
                            'Cash Received',
                            fmtMoney(sale.cashReceived!),
                          ),
                          _summaryRow(
                            'Change',
                            fmtMoney(
                              sale.changeReturned ??
                                  (sale.cashReceived! - sale.netPayable),
                            ),
                          ),
                        ],
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
                    if (sale.editedAt != null &&
                        sale.editReason != null &&
                        sale.editReason!.trim().isNotEmpty) ...[
                      pw.Text(
                        'Revised on ${CurrencyFormatter.formatDate(sale.editedAt!, cfg, includeTime: true)} by ${sale.editedByName ?? sale.editedBy ?? 'Staff'} — Reason: ${sale.editReason!.trim()}',
                        textAlign: pw.TextAlign.center,
                        style: pw.TextStyle(
                          fontSize: 6.5,
                          fontWeight: pw.FontWeight.bold,
                          color: const PdfColor.fromInt(0xFFB45309),
                        ),
                      ),
                      pw.SizedBox(height: 3),
                    ],
                    if (cfg.receiptFooter.trim().isNotEmpty)
                      pw.Text(
                        cfg.receiptFooter.trim(),
                        textAlign: pw.TextAlign.center,
                        style: const pw.TextStyle(
                          fontSize: 6.5,
                          color: mutedColor,
                        ),
                      ),
                    pw.SizedBox(height: 3),
                    pw.Text(
                      [
                        cfg.pharmacyName,
                        cfg.address,
                        if (cfg.showWebsiteOnReceipt &&
                            cfg.websiteUrl.trim().isNotEmpty)
                          cfg.websiteUrl.trim(),
                      ].join(' · '),
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
    final bytes = await generateA5InvoiceBytes(
      sale: sale,
      items: items,
      settings: activeSettings,
    );
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/${sale.invoiceNumber}_Invoice.pdf');
    await file.writeAsBytes(bytes, flush: true);

    final revisedSuffix = (sale.editedAt != null &&
            sale.editReason != null &&
            sale.editReason!.trim().isNotEmpty)
        ? ' (REVISED - Audit Note: ${sale.editReason!.trim()})'
        : '';

    await Share.shareXFiles(
      [XFile(file.path, mimeType: 'application/pdf')],
      subject:
          '${activeSettings.pharmacyName} Invoice ${sale.invoiceNumber}${sale.editedAt != null ? ' (REVISED)' : ''}',
      text:
          'Assalam-o-Alaikum, please find attached your invoice (${sale.invoiceNumber})$revisedSuffix from ${activeSettings.pharmacyName}, ${activeSettings.address}. Net Payable: ${CurrencyFormatter.format(sale.netPayable, activeSettings)}.',
    );
  }

  /// Generates a clean plain-text Khata summary suitable for WhatsApp or SMS.
  String buildKhataShareText({
    required CustomerKhataStatement statement,
    required PharmacySettings settings,
    DateTime? fromDate,
    DateTime? toDate,
  }) {
    String fmt(double v) => CurrencyFormatter.format(v, settings);
    String fmtDate(DateTime d) =>
        CurrencyFormatter.formatDate(d.toIso8601String(), settings);

    final periodStr =
        '${fromDate != null ? fmtDate(fromDate) : 'Start'} to ${toDate != null ? fmtDate(toDate) : 'Today'}';

    final lines = <String>[
      '*${settings.pharmacyName.toUpperCase()}*',
      'Customer Khata Statement',
      if (settings.phone.trim().isNotEmpty) 'Tel: ${settings.phone.trim()}',
      '--------------------------------',
      'Customer: ${statement.party.name}',
      if (statement.party.phone.trim().isNotEmpty)
        'Phone: ${statement.party.phone.trim()}',
      'Period: $periodStr',
      '--------------------------------',
      'Total Credit Given: ${fmt(statement.totalCreditGiven)}',
      'Total Collected: ${fmt(statement.totalCollected)}',
      '*Current Balance Due: ${fmt(statement.currentBalanceDue)}*',
      '--------------------------------',
    ];

    if (fromDate != null && statement.openingBalanceBeforeRange != 0) {
      lines.add(
        'Opening Bal (Before ${fmtDate(fromDate)}): ${fmt(statement.openingBalanceBeforeRange)}',
      );
    }

    if (statement.rows.isEmpty) {
      lines.add('No transactions in the selected period.');
    } else {
      for (final row in statement.rows) {
        final dateStr =
            CurrencyFormatter.formatDate(row.entry.createdAt, settings);
        final amtStr = row.debit > 0
            ? '+${fmt(row.debit)} (Credit)'
            : '-${fmt(row.credit)} (Collected)';
        lines.add(
          '$dateStr | ${row.voucherNumber} | ${row.title}${row.entry.editedAt != null ? ' [Edited]' : ''}: $amtStr | Bal: ${fmt(row.runningBalance)}',
        );
        if (row.entry.editedAt != null &&
            row.entry.editReason != null &&
            row.entry.editReason!.trim().isNotEmpty) {
          lines.add(
            '   [Audit: Edited by ${row.entry.editedByName ?? row.entry.editedBy ?? 'Staff'} - ${row.entry.editReason!.trim()}]',
          );
        }
        if (row.items.isNotEmpty) {
          for (final item in row.items) {
            lines.add(
              '   • ${item.itemName} (${item.quantity} ${item.unit} x ${fmt(item.unitPrice)}) = ${fmt(item.lineTotal)}',
            );
          }
        } else if (row.subtitle.isNotEmpty) {
          lines.add('   • ${row.subtitle}');
        }
      }
    }

    lines.add('--------------------------------');
    lines.add('Thank you for your continued trust!');
    return lines.join('\n');
  }

  Future<void> shareKhataStatementText({
    required CustomerKhataStatement statement,
    required PharmacySettings settings,
    DateTime? fromDate,
    DateTime? toDate,
  }) async {
    final text = buildKhataShareText(
      statement: statement,
      settings: settings,
      fromDate: fromDate,
      toDate: toDate,
    );
    await Share.share(
      text,
      subject: 'Khata Statement - ${statement.party.name}',
    );
  }

  /// Generates a multi-page A4 PDF Customer Khata Statement including
  /// chronological running balances and itemized credit purchases.
  Future<Uint8List> generateKhataStatementPdfBytes({
    required CustomerKhataStatement statement,
    PharmacySettings? settings,
    DateTime? fromDate,
    DateTime? toDate,
  }) async {
    final cfg = settings ?? PharmacySettings.defaults();
    String fmtMoney(double val) => CurrencyFormatter.format(val, cfg);
    String fmtDate(String iso, {bool includeTime = false}) =>
        CurrencyFormatter.formatDate(iso, cfg, includeTime: includeTime);

    final doc = pw.Document(
      title: 'Khata Statement - ${statement.party.name}',
      author: cfg.pharmacyName,
    );

    const primaryColor = PdfColor.fromInt(0xFF0D7A5F);
    const inkColor = PdfColor.fromInt(0xFF0F172A);
    const mutedColor = PdfColor.fromInt(0xFF475569);
    const borderColor = PdfColor.fromInt(0xFFE2E8F0);
    const surfaceColor = PdfColor.fromInt(0xFFF8FAFC);

    final periodLabel =
        '${fromDate != null ? fmtDate(fromDate.toIso8601String()) : 'All Dates'} to ${toDate != null ? fmtDate(toDate.toIso8601String()) : 'Today'}';

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(24),
        build: (context) => [
          // Header
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
                        fontSize: 14,
                        fontWeight: pw.FontWeight.bold,
                        color: primaryColor,
                      ),
                    ),
                    pw.SizedBox(height: 2),
                    pw.Text(
                      cfg.address,
                      style: const pw.TextStyle(fontSize: 8.5, color: inkColor),
                    ),
                    if (cfg.phone.trim().isNotEmpty)
                      pw.Text(
                        'Tel: ${cfg.phone.trim()}',
                        style: const pw.TextStyle(
                          fontSize: 8,
                          color: mutedColor,
                        ),
                      ),
                  ],
                ),
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    pw.Text(
                      'CUSTOMER KHATA STATEMENT',
                      style: pw.TextStyle(
                        fontSize: 10,
                        fontWeight: pw.FontWeight.bold,
                        color: inkColor,
                      ),
                    ),
                    pw.SizedBox(height: 2),
                    pw.Text(
                      'Period: $periodLabel',
                      style: const pw.TextStyle(
                        fontSize: 8,
                        color: mutedColor,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 12),

          // Customer & Summary Box
          pw.Container(
            padding: const pw.EdgeInsets.all(10),
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
                      statement.party.name,
                      style: pw.TextStyle(
                        fontSize: 11,
                        fontWeight: pw.FontWeight.bold,
                        color: inkColor,
                      ),
                    ),
                    pw.SizedBox(height: 2),
                    pw.Text(
                      'Phone: ${statement.party.phone.isEmpty ? 'N/A' : statement.party.phone}',
                      style: const pw.TextStyle(
                        fontSize: 8.5,
                        color: mutedColor,
                      ),
                    ),
                  ],
                ),
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    pw.Text(
                      'Total Credit Given: ${fmtMoney(statement.totalCreditGiven)}',
                      style: const pw.TextStyle(fontSize: 8.5, color: inkColor),
                    ),
                    pw.Text(
                      'Total Collected: ${fmtMoney(statement.totalCollected)}',
                      style: const pw.TextStyle(fontSize: 8.5, color: inkColor),
                    ),
                    pw.SizedBox(height: 2),
                    pw.Text(
                      'Current Balance Due: ${fmtMoney(statement.currentBalanceDue)}',
                      style: pw.TextStyle(
                        fontSize: 9.5,
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

          // Timeline Rows
          if (statement.rows.isEmpty)
            pw.Padding(
              padding: const pw.EdgeInsets.symmetric(vertical: 20),
              child: pw.Center(
                child: pw.Text(
                  'No khata transactions recorded in this date range.',
                  style: const pw.TextStyle(fontSize: 9, color: mutedColor),
                ),
              ),
            )
          else
            ...statement.rows.map(
              (row) => pw.Container(
                padding: const pw.EdgeInsets.symmetric(
                  vertical: 6,
                  horizontal: 4,
                ),
                decoration: const pw.BoxDecoration(
                  border: pw.Border(
                    bottom: pw.BorderSide(color: borderColor, width: 0.6),
                  ),
                ),
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Row(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.SizedBox(
                          width: 68,
                          child: pw.Text(
                            fmtDate(row.entry.createdAt),
                            style: const pw.TextStyle(
                              fontSize: 8,
                              color: inkColor,
                            ),
                          ),
                        ),
                        pw.SizedBox(
                          width: 78,
                          child: pw.Text(
                            row.voucherNumber,
                            style: pw.TextStyle(
                              fontSize: 8,
                              fontWeight: pw.FontWeight.bold,
                              color: inkColor,
                            ),
                          ),
                        ),
                        pw.Expanded(
                          child: pw.Column(
                            crossAxisAlignment: pw.CrossAxisAlignment.start,
                            children: [
                              pw.Text(
                                '${row.title}${row.entry.editedAt != null ? ' [Edited]' : ''}',
                                style: pw.TextStyle(
                                  fontSize: 8.5,
                                  fontWeight: pw.FontWeight.bold,
                                  color: inkColor,
                                ),
                              ),
                              if (row.subtitle.isNotEmpty)
                                pw.Text(
                                  row.subtitle,
                                  style: const pw.TextStyle(
                                    fontSize: 7.5,
                                    color: mutedColor,
                                  ),
                                ),
                              if (row.entry.editedAt != null &&
                                  row.entry.editReason != null &&
                                  row.entry.editReason!.trim().isNotEmpty)
                                pw.Text(
                                  'Revised (${fmtDate(row.entry.editedAt!)}) by ${row.entry.editedByName ?? row.entry.editedBy ?? 'Staff'}: ${row.entry.editReason!.trim()}',
                                  style: const pw.TextStyle(
                                    fontSize: 7.0,
                                    color: PdfColor.fromInt(0xFFB45309),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        pw.SizedBox(
                          width: 68,
                          child: pw.Text(
                            row.debit > 0 ? '+${fmtMoney(row.debit)}' : '-',
                            textAlign: pw.TextAlign.right,
                            style: const pw.TextStyle(
                              fontSize: 8,
                              color: inkColor,
                            ),
                          ),
                        ),
                        pw.SizedBox(
                          width: 68,
                          child: pw.Text(
                            row.credit > 0 ? '-${fmtMoney(row.credit)}' : '-',
                            textAlign: pw.TextAlign.right,
                            style: const pw.TextStyle(
                              fontSize: 8,
                              color: primaryColor,
                            ),
                          ),
                        ),
                        pw.SizedBox(
                          width: 72,
                          child: pw.Text(
                            fmtMoney(row.runningBalance),
                            textAlign: pw.TextAlign.right,
                            style: pw.TextStyle(
                              fontSize: 8,
                              fontWeight: pw.FontWeight.bold,
                              color: inkColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (row.items.isNotEmpty)
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(left: 146, top: 4),
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: row.items
                              .map(
                                (it) => pw.Text(
                                  '• ${it.itemName} (${it.quantity} ${it.unit} x ${fmtMoney(it.unitPrice)}) = ${fmtMoney(it.lineTotal)}',
                                  style: const pw.TextStyle(
                                    fontSize: 7.2,
                                    color: mutedColor,
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );

    return doc.save();
  }

  Future<void> printKhataStatementPdf({
    required CustomerKhataStatement statement,
    PharmacySettings? settings,
    DateTime? fromDate,
    DateTime? toDate,
  }) async {
    final activeSettings =
        settings ?? await DatabaseHelper.instance.getSettings();
    final bytes = await generateKhataStatementPdfBytes(
      statement: statement,
      settings: activeSettings,
      fromDate: fromDate,
      toDate: toDate,
    );
    final safeName = statement.party.name
        .replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '_')
        .replaceAll(RegExp(r'^_+|_+$'), '');
    await Printing.layoutPdf(
      name: 'Khata_${safeName.isEmpty ? 'Statement' : safeName}.pdf',
      format: PdfPageFormat.a4,
      onLayout: (_) async => bytes,
    );
  }
}
