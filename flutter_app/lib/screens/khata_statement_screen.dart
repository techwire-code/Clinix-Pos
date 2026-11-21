import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../services/pdf_invoice_service.dart';
import '../services/printer_service.dart';
import '../utils/currency_formatter.dart';
import 'edit_credit_receipt_dialog.dart';

class KhataStatementScreen extends StatefulWidget {
  final Party party;
  final PharmacySettings settings;
  final PharmacyUser? currentUser;

  const KhataStatementScreen({
    super.key,
    required this.party,
    required this.settings,
    this.currentUser,
  });

  @override
  State<KhataStatementScreen> createState() => _KhataStatementScreenState();
}

enum _DatePreset { all, today, days7, days30, thisMonth }

class _KhataStatementScreenState extends State<KhataStatementScreen> {
  CustomerKhataStatement? _statement;
  bool _loading = true;
  DateTime? _fromDate;
  DateTime? _toDate;
  _DatePreset _activePreset = _DatePreset.all;
  bool _expandAll = false;
  final Set<int> _expandedEntryIds = <int>{};
  bool _didMutate = false;

  @override
  void initState() {
    super.initState();
    _loadStatement();
  }

  PharmacyUser get _effectiveUser =>
      widget.currentUser ??
      PharmacyUser(
        name: widget.settings.activeUserRole.label,
        username: widget.settings.activeUserRole.name,
        role: widget.settings.activeUserRole,
        pinOrPassword: '',
        createdAt: '',
      );

  bool get _canEditCreditReceipt => _effectiveUser.role.canViewProfitAndCost;

  String _fmt(double val) => CurrencyFormatter.format(val, widget.settings);

  String _fmtDate(String iso, {bool includeTime = false}) =>
      CurrencyFormatter.formatDate(iso, widget.settings,
          includeTime: includeTime);

  Future<void> _openEditCreditReceipt(
    SaleRecord sale,
    List<SaleItemRecord> items,
  ) async {
    final updatedSale = await Navigator.of(context).push<SaleRecord?>(
      MaterialPageRoute(
        builder: (_) => EditCreditReceiptScreen(
          sale: sale,
          initialSaleItems: items,
          settings: widget.settings,
          currentUser: _effectiveUser,
        ),
      ),
    );
    if (updatedSale != null && mounted) {
      _didMutate = true;
      await _loadStatement();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Receipt ${updatedSale.invoiceNumber} updated & Khata reconciled.',
            ),
            backgroundColor: const Color(0xFF0D7A5F),
          ),
        );
      }
    }
  }

  Future<void> _showReceiptSheet(
    SaleRecord sale,
    List<SaleItemRecord> items,
  ) async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            Expanded(
              child: Text(
                'Receipt · ${sale.invoiceNumber}',
                style: const TextStyle(fontSize: 16),
              ),
            ),
            if (sale.editedAt != null)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.amber.shade100,
                  borderRadius: BorderRadius.circular(5),
                ),
                child: Text(
                  'Edited',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: Colors.amber.shade900,
                  ),
                ),
              ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Party: ${sale.partyName}'),
              Text('Date: ${_fmtDate(sale.createdAt, includeTime: true)}'),
              Text('Mode: ${sale.paymentMode.dbValue}'),
              Text('Subtotal: ${_fmt(sale.subtotal)}'),
              if (sale.discountAmount > 0)
                Text('Discount: -${_fmt(sale.discountAmount)}'),
              const SizedBox(height: 4),
              Text(
                'Net Payable: ${_fmt(sale.netPayable)}',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                  color: Color(0xFF0D7A5F),
                ),
              ),
              if (sale.editedAt != null && sale.editReason != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.amber.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Last Edited by ${sale.editedByName ?? sale.editedBy ?? 'Staff'} on ${_fmtDate(sale.editedAt!, includeTime: true)}',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        'Reason: ${sale.editReason}',
                        style: const TextStyle(fontSize: 11.5),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close'),
          ),
          if (_canEditCreditReceipt)
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(ctx).pop();
                _openEditCreditReceipt(sale, items);
              },
              icon: const Icon(Icons.edit_outlined, size: 16),
              label: const Text('Edit Receipt'),
            ),
          OutlinedButton.icon(
            onPressed: () async {
              await PdfInvoiceService.instance.shareInvoicePdf(
                sale: sale,
                items: items,
                settings: widget.settings,
              );
            },
            icon: const Icon(Icons.share_outlined, size: 16),
            label: const Text('A5 PDF'),
          ),
          FilledButton.icon(
            onPressed: () async {
              try {
                await PrinterService.instance.printReceipt(
                  sale: sale,
                  items: items,
                  settings: widget.settings,
                );
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Print error: $e')),
                  );
                }
              }
            },
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF0D7A5F),
            ),
            icon: const Icon(Icons.print_outlined, size: 16),
            label: const Text('Print'),
          ),
        ],
      ),
    );
  }

  Future<void> _loadStatement() async {
    setState(() => _loading = true);
    final stmt = await DatabaseHelper.instance.getCustomerKhataStatement(
      widget.party,
      fromDate: _fromDate,
      toDate: _toDate,
    );
    if (!mounted) return;
    setState(() {
      _statement = stmt;
      _loading = false;
      if (_expandAll) {
        _expandedEntryIds
          ..clear()
          ..addAll(
            stmt.rows
                .where((r) => r.items.isNotEmpty && r.entry.id != null)
                .map((r) => r.entry.id!),
          );
      }
    });
  }

  void _applyPreset(_DatePreset preset) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    setState(() {
      _activePreset = preset;
      switch (preset) {
        case _DatePreset.all:
          _fromDate = null;
          _toDate = null;
          break;
        case _DatePreset.today:
          _fromDate = today;
          _toDate = today;
          break;
        case _DatePreset.days7:
          _fromDate = today.subtract(const Duration(days: 6));
          _toDate = today;
          break;
        case _DatePreset.days30:
          _fromDate = today.subtract(const Duration(days: 29));
          _toDate = today;
          break;
        case _DatePreset.thisMonth:
          _fromDate = DateTime(now.year, now.month, 1);
          _toDate = today;
          break;
      }
    });
    _loadStatement();
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final initial = isFrom
        ? (_fromDate ?? DateTime.now())
        : (_toDate ?? _fromDate ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _activePreset = _DatePreset.all;
      if (isFrom) {
        _fromDate = picked;
      } else {
        _toDate = picked;
      }
    });
    _loadStatement();
  }

  Future<void> _openRecordCollectionDialog() async {
    final stmt = _statement;
    if (stmt == null || stmt.currentBalanceDue <= 0) return;

    final amountCtrl = TextEditingController(
      text: stmt.currentBalanceDue.toStringAsFixed(widget.settings.decimalDigits),
    );
    final refCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    String selectedMethod = 'Cash';
    DateTime selectedDate = DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Record Collection (Vasooli)'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${stmt.party.name}\nBalance Due: ${_fmt(stmt.currentBalanceDue)}',
                  style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText:
                        'Amount (${CurrencyFormatter.unitLabel(widget.settings)})',
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedMethod,
                  decoration: const InputDecoration(
                    labelText: 'Payment Method',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'Cash', child: Text('Cash')),
                    DropdownMenuItem(
                      value: 'JazzCash / EasyPaisa',
                      child: Text('JazzCash / EasyPaisa'),
                    ),
                    DropdownMenuItem(
                      value: 'Bank Transfer',
                      child: Text('Bank Transfer'),
                    ),
                    DropdownMenuItem(value: 'Card', child: Text('Card')),
                  ],
                  onChanged: (v) {
                    if (v != null) {
                      setDialogState(() => selectedMethod = v);
                    }
                  },
                ),
                const SizedBox(height: 10),
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: ctx,
                      initialDate: selectedDate,
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2035),
                    );
                    if (picked != null) {
                      setDialogState(() => selectedDate = picked);
                    }
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Collection Date',
                      border: OutlineInputBorder(),
                      isDense: true,
                      suffixIcon: Icon(Icons.calendar_today, size: 16),
                    ),
                    child: Text(
                      _fmtDate(selectedDate.toIso8601String()),
                      style: const TextStyle(fontSize: 13.5),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: refCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Reference # (Optional)',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: notesCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Notes (Optional)',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0D7A5F),
              ),
              child: const Text('Confirm'),
            ),
          ],
        ),
      ),
    );

    if (confirmed == true && stmt.party.id != null) {
      final parsedAmt = double.tryParse(amountCtrl.text.trim()) ?? 0.0;
      if (parsedAmt > 0) {
        await DatabaseHelper.instance.recordPartySettlement(
          partyId: stmt.party.id!,
          amountPaidOrCollected: parsedAmt,
          paymentMode: selectedMethod,
          reference: refCtrl.text.trim(),
          notes: notesCtrl.text.trim(),
          collectedAt: selectedDate,
        );
        _didMutate = true;
        await _loadStatement();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Recorded collection of ${_fmt(parsedAmt)}'),
              backgroundColor: const Color(0xFF0D7A5F),
            ),
          );
        }
      }
    }

    amountCtrl.dispose();
    refCtrl.dispose();
    notesCtrl.dispose();
  }

  Future<void> _copyWhatsAppSummary() async {
    final stmt = _statement;
    if (stmt == null) return;
    final text = PdfInvoiceService.instance.buildKhataShareText(
      statement: stmt,
      settings: widget.settings,
      fromDate: _fromDate,
      toDate: _toDate,
    );
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('WhatsApp Khata summary copied to clipboard'),
        backgroundColor: Color(0xFF0D7A5F),
      ),
    );
  }

  Future<void> _shareSummary() async {
    final stmt = _statement;
    if (stmt == null) return;
    await PdfInvoiceService.instance.shareKhataStatementText(
      statement: stmt,
      settings: widget.settings,
      fromDate: _fromDate,
      toDate: _toDate,
    );
  }

  Future<void> _printPdfStatement() async {
    final stmt = _statement;
    if (stmt == null) return;
    await PdfInvoiceService.instance.printKhataStatementPdf(
      statement: stmt,
      settings: widget.settings,
      fromDate: _fromDate,
      toDate: _toDate,
    );
  }

  @override
  Widget build(BuildContext context) {
    final stmt = _statement;
    final party = stmt?.party ?? widget.party;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          Navigator.of(context).pop(_didMutate);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).pop(_didMutate),
          ),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                party.name,
                style: const TextStyle(
                  fontSize: 15.5,
                  fontWeight: FontWeight.w700,
                ),
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                'Customer Khata · ${party.phone.isEmpty ? 'No phone' : party.phone}',
                style: TextStyle(
                  fontSize: 11.5,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
          actions: [
            IconButton(
              tooltip: 'Copy WhatsApp Summary',
              icon: const Icon(Icons.copy_outlined),
              onPressed: stmt == null ? null : _copyWhatsAppSummary,
            ),
            IconButton(
              tooltip: 'Share Statement',
              icon: const Icon(Icons.share_outlined),
              onPressed: stmt == null ? null : _shareSummary,
            ),
            IconButton(
              tooltip: 'Print / PDF Statement',
              icon: const Icon(Icons.print_outlined),
              onPressed: stmt == null ? null : _printPdfStatement,
            ),
          ],
        ),
        floatingActionButton: (stmt != null && stmt.currentBalanceDue > 0)
            ? FloatingActionButton.extended(
                onPressed: _openRecordCollectionDialog,
                backgroundColor: const Color(0xFF0D7A5F),
                foregroundColor: Colors.white,
                icon: const Icon(Icons.payments_outlined),
                label: const Text('Record Collection'),
              )
            : null,
        body: _loading || stmt == null
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _loadStatement,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                  children: [
                    // Summary Cards
                    Row(
                      children: [
                        Expanded(
                          child: _SummaryStatCard(
                            label: 'Credit Given',
                            value: _fmt(stmt.totalCreditGiven),
                            color: const Color(0xFFB45309),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _SummaryStatCard(
                            label: 'Collected',
                            value: _fmt(stmt.totalCollected),
                            color: const Color(0xFF0D7A5F),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _SummaryStatCard(
                            label: 'Balance Due',
                            value: _fmt(stmt.currentBalanceDue),
                            color: const Color(0xFF0F172A),
                            highlight: true,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Date Presets & Custom Range Pickers
                    Card(
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: Colors.grey.shade200),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                _presetChip('All Time', _DatePreset.all),
                                _presetChip('Today', _DatePreset.today),
                                _presetChip('7 Days', _DatePreset.days7),
                                _presetChip('30 Days', _DatePreset.days30),
                                _presetChip('Month', _DatePreset.thisMonth),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed: () => _pickDate(isFrom: true),
                                    icon: const Icon(Icons.date_range, size: 16),
                                    label: Text(
                                      _fromDate != null
                                          ? 'From: ${_fmtDate(_fromDate!.toIso8601String())}'
                                          : 'From Date',
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed: () => _pickDate(isFrom: false),
                                    icon: const Icon(Icons.date_range, size: 16),
                                    label: Text(
                                      _toDate != null
                                          ? 'To: ${_fmtDate(_toDate!.toIso8601String())}'
                                          : 'To Date',
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            if (stmt.rows.any((r) => r.items.isNotEmpty)) ...[
                              const SizedBox(height: 6),
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton.icon(
                                  onPressed: () {
                                    setState(() {
                                      _expandAll = !_expandAll;
                                      _expandedEntryIds.clear();
                                      if (_expandAll) {
                                        for (final r in stmt.rows) {
                                          if (r.items.isNotEmpty &&
                                              r.entry.id != null) {
                                            _expandedEntryIds.add(r.entry.id!);
                                          }
                                        }
                                      }
                                    });
                                  },
                                  icon: Icon(
                                    _expandAll
                                        ? Icons.unfold_less
                                        : Icons.unfold_more,
                                    size: 16,
                                  ),
                                  label: Text(
                                    _expandAll
                                        ? 'Collapse All Bills'
                                        : 'Expand All Bills',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),

                    if (_fromDate != null &&
                        stmt.openingBalanceBeforeRange != 0) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Brought Forward (before ${_fmtDate(_fromDate!.toIso8601String())})',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              _fmt(stmt.openingBalanceBeforeRange),
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),

                    if (stmt.rows.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 36),
                        child: Center(
                          child: Text(
                            'No khata transactions found in the selected period.',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ),
                      )
                    else
                      ...stmt.rows.map((row) => _buildTimelineCard(row)),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _presetChip(String label, _DatePreset preset) {
    final selected = _activePreset == preset &&
        (preset != _DatePreset.all || (_fromDate == null && _toDate == null));
    return ChoiceChip(
      label: Text(label, style: const TextStyle(fontSize: 11.5)),
      selected: selected,
      selectedColor: const Color(0xFF0D7A5F).withOpacity(0.15),
      onSelected: (_) => _applyPreset(preset),
    );
  }

  Widget _buildTimelineCard(CustomerKhataTimelineRow row) {
    final isCollection = row.entry.entryType == KhataEntryType.collection;
    final isCreditSale = row.entry.entryType == KhataEntryType.creditSale;
    final hasItems = row.items.isNotEmpty;
    final entryId = row.entry.id ?? -1;
    final isExpanded = _expandedEntryIds.contains(entryId);

    final Color badgeBg = isCollection
        ? const Color(0xFF0D7A5F).withOpacity(0.12)
        : isCreditSale
            ? const Color(0xFFD97706).withOpacity(0.12)
            : Colors.grey.shade200;
    final Color badgeText = isCollection
        ? const Color(0xFF0D7A5F)
        : isCreditSale
            ? const Color(0xFFB45309)
            : Colors.grey.shade800;

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: hasItems
                ? () {
                    setState(() {
                      if (isExpanded) {
                        _expandedEntryIds.remove(entryId);
                      } else {
                        _expandedEntryIds.add(entryId);
                      }
                    });
                  }
                : null,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        _fmtDate(row.entry.createdAt, includeTime: isCreditSale),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: Text(
                          row.voucherNumber,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const Spacer(),
                      if (row.entry.editedAt != null) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade100,
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: Text(
                            'Edited',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Colors.amber.shade900,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                      ],
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: badgeBg,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          isCollection
                              ? 'Collection'
                              : isCreditSale
                                  ? 'Credit Sale'
                                  : 'Opening',
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: badgeText,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              row.title,
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (row.subtitle.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                row.subtitle,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            row.debit > 0
                                ? '+${_fmt(row.debit)}'
                                : '-${_fmt(row.credit)}',
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              color: row.debit > 0
                                  ? const Color(0xFFB45309)
                                  : const Color(0xFF0D7A5F),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Bal: ${_fmt(row.runningBalance)}',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  if (row.entry.editedAt != null &&
                      row.entry.editReason != null &&
                      row.entry.editReason!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.amber.shade200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Edited by ${row.entry.editedByName ?? row.entry.editedBy ?? 'Staff'} on ${_fmtDate(row.entry.editedAt!, includeTime: true)} · Reason: ${row.entry.editReason}',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.amber.shade900,
                            ),
                          ),
                          if (row.entry.editSummary != null &&
                              row.entry.editSummary!.isNotEmpty)
                            Text(
                              row.entry.editSummary!,
                              style: TextStyle(
                                fontSize: 10.5,
                                color: Colors.amber.shade800,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                  if (hasItems || (isCreditSale && row.sale != null)) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 10,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (hasItems)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isExpanded
                                    ? Icons.keyboard_arrow_up
                                    : Icons.keyboard_arrow_down,
                                size: 16,
                                color: const Color(0xFF0D7A5F),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                isExpanded
                                    ? 'Hide ${row.items.length} itemized medicine(s)'
                                    : 'View ${row.items.length} itemized medicine(s)',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF0D7A5F),
                                ),
                              ),
                            ],
                          ),
                        if (isCreditSale && row.sale != null) ...[
                          InkWell(
                            onTap: () =>
                                _showReceiptSheet(row.sale!, row.items),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                                vertical: 2,
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.receipt_outlined,
                                    size: 14,
                                    color: Colors.grey.shade700,
                                  ),
                                  const SizedBox(width: 3),
                                  Text(
                                    'Open Receipt',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.grey.shade800,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          if (_canEditCreditReceipt)
                            InkWell(
                              onTap: () => _openEditCreditReceipt(
                                  row.sale!, row.items),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.amber.shade50,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: Colors.amber.shade300,
                                  ),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.edit_outlined,
                                      size: 13,
                                      color: Colors.amber.shade900,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      'Edit Receipt',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.amber.shade900,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          else
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.lock_outline,
                                  size: 13,
                                  color: Colors.grey.shade500,
                                ),
                                const SizedBox(width: 3),
                                Text(
                                  'Edit Locked',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.grey.shade500,
                                  ),
                                ),
                              ],
                            ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (hasItems && isExpanded)
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: const BorderRadius.vertical(
                  bottom: Radius.circular(12),
                ),
                border: Border(top: BorderSide(color: Colors.grey.shade200)),
              ),
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ...row.items.map(
                    (it) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  it.itemName,
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  '${it.quantity} ${it.unit} × ${_fmt(it.unitPrice)}'
                                  '${it.batchNumber.isNotEmpty ? ' · Batch ${it.batchNumber}' : ''}'
                                  '${it.itemDiscount > 0 ? ' · Disc ${_fmt(it.itemDiscount)}' : ''}',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            _fmt(it.lineTotal),
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (row.sale != null && row.sale!.discountAmount > 0) ...[
                    const Divider(height: 14),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Bill Net Total (after ${_fmt(row.sale!.discountAmount)} discount)',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: Colors.grey.shade700,
                          ),
                        ),
                        Text(
                          _fmt(row.sale!.netPayable),
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SummaryStatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final bool highlight;

  const _SummaryStatCard({
    required this.label,
    required this.value,
    required this.color,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: highlight
            ? const Color(0xFF0D7A5F).withOpacity(0.08)
            : Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: highlight
              ? const Color(0xFF0D7A5F).withOpacity(0.35)
              : Colors.grey.shade200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade600,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: highlight ? const Color(0xFF0D7A5F) : color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
