import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../utils/currency_formatter.dart';

class SupplierLedgerScreen extends StatefulWidget {
  final Party supplier;
  final PharmacySettings settings;

  const SupplierLedgerScreen({
    super.key,
    required this.supplier,
    required this.settings,
  });

  @override
  State<SupplierLedgerScreen> createState() => _SupplierLedgerScreenState();
}

class _SupplierLedgerScreenState extends State<SupplierLedgerScreen> {
  SupplierLedgerStatement? _statement;
  bool _loading = true;
  final Set<int> _expandedBillIds = <int>{};
  bool _didMutate = false;

  @override
  void initState() {
    super.initState();
    _loadStatement();
  }

  String _fmt(double amount) =>
      CurrencyFormatter.format(amount, widget.settings);

  String _fmtDate(String iso, {bool includeTime = false}) =>
      CurrencyFormatter.formatDate(
        iso,
        widget.settings,
        includeTime: includeTime,
      );

  Future<void> _loadStatement() async {
    setState(() => _loading = true);
    final stmt =
        await DatabaseHelper.instance.getSupplierLedgerStatement(widget.supplier);
    if (!mounted) return;
    setState(() {
      _statement = stmt;
      _loading = false;
      if (_expandedBillIds.isEmpty &&
          stmt.bills.isNotEmpty &&
          stmt.bills.first.purchase.id != null) {
        _expandedBillIds.add(stmt.bills.first.purchase.id!);
      }
    });
  }

  Future<void> _copySummary() async {
    final stmt = _statement;
    if (stmt == null) return;
    final buf = StringBuffer()
      ..writeln(widget.settings.pharmacyName)
      ..writeln('Supplier Bills & Payment Statement')
      ..writeln('Supplier: ${stmt.party.name}')
      ..writeln(
        'Phone: ${stmt.party.phone.isEmpty ? 'N/A' : stmt.party.phone}',
      )
      ..writeln('Total Purchased: ${_fmt(stmt.totalPurchased)}')
      ..writeln('Total Paid: ${_fmt(stmt.totalPaymentsRecorded)}')
      ..writeln('Current To Pay: ${_fmt(stmt.currentBalanceDue)}')
      ..writeln(
        'Bills: ${stmt.paidBillCount} Paid, ${stmt.partialBillCount} Partially Paid, ${stmt.unpaidBillCount} Unpaid',
      )
      ..writeln('--- Purchase Bills ---');

    if (stmt.bills.isEmpty) {
      buf.writeln('No purchase bills recorded.');
    } else {
      for (final row in stmt.bills) {
        final p = row.purchase;
        buf.writeln(
          '${p.purchaseNumber} (Inv: ${p.supplierInvoiceNo}) | ${_fmtDate(p.createdAt)} | ${row.status.label} | Total: ${_fmt(p.totalAmount)} | Paid: ${_fmt(p.paidAmount)} | Due: ${_fmt(p.balanceDue)}',
        );
      }
    }

    await Clipboard.setData(ClipboardData(text: buf.toString()));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Supplier statement copied to clipboard.'),
        backgroundColor: Color(0xFF0D7A5F),
      ),
    );
  }

  Future<void> _openPaymentDialog({int? preselectedPurchaseId}) async {
    final stmt = _statement;
    if (stmt == null || stmt.party.id == null || stmt.currentBalanceDue <= 0) {
      return;
    }

    final openBills = stmt.bills
        .where((b) => b.purchase.balanceDue > 0.005 && b.purchase.id != null)
        .map((b) => b.purchase)
        .toList();

    int? selectedBillId = preselectedPurchaseId;
    if (selectedBillId != null &&
        !openBills.any((b) => b.id == selectedBillId)) {
      selectedBillId = null;
    }

    double initialAmount = stmt.currentBalanceDue;
    if (selectedBillId != null) {
      final found = openBills.firstWhere((b) => b.id == selectedBillId);
      initialAmount = found.balanceDue;
    }

    final amountCtrl = TextEditingController(
      text: initialAmount.toStringAsFixed(widget.settings.decimalDigits),
    );
    final refCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    String selectedMethod = 'Cash';
    DateTime selectedDate = DateTime.now();
    String? errorMsg;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Record Supplier Payment'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${stmt.party.name}\nCurrent To Pay: ${_fmt(stmt.currentBalanceDue)}',
                  style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
                ),
                if (errorMsg != null) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(
                      errorMsg!,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.red.shade800,
                      ),
                    ),
                  ),
                ],
                if (openBills.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int?>(
                    value: selectedBillId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Allocate to Purchase Bill (Optional)',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: [
                      DropdownMenuItem<int?>(
                        value: null,
                        child: Text(
                          'General Supplier Payable (${_fmt(stmt.currentBalanceDue)})',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      ...openBills.map(
                        (b) => DropdownMenuItem<int?>(
                          value: b.id,
                          child: Text(
                            '${b.purchaseNumber} (${b.supplierInvoiceNo}) · Due ${_fmt(b.balanceDue)}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: (val) {
                      setDialogState(() {
                        selectedBillId = val;
                        errorMsg = null;
                        if (val == null) {
                          amountCtrl.text = stmt.currentBalanceDue
                              .toStringAsFixed(widget.settings.decimalDigits);
                        } else {
                          final bill = openBills.firstWhere((b) => b.id == val);
                          amountCtrl.text = bill.balanceDue
                              .toStringAsFixed(widget.settings.decimalDigits);
                        }
                      });
                    },
                  ),
                ],
                const SizedBox(height: 10),
                TextField(
                  controller: amountCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) {
                    if (errorMsg != null) {
                      setDialogState(() => errorMsg = null);
                    }
                  },
                  decoration: InputDecoration(
                    labelText:
                        'Payment Amount (${CurrencyFormatter.unitLabel(widget.settings)})',
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
                      value: 'Bank Transfer',
                      child: Text('Bank Transfer'),
                    ),
                    DropdownMenuItem(
                      value: 'JazzCash / EasyPaisa',
                      child: Text('JazzCash / EasyPaisa'),
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
                      labelText: 'Payment Date',
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
              onPressed: () {
                final amt = double.tryParse(amountCtrl.text.trim()) ?? 0.0;
                if (amt <= 0) {
                  setDialogState(() {
                    errorMsg = 'Enter a payment amount greater than zero.';
                  });
                  return;
                }
                final maxAllowed = selectedBillId != null
                    ? openBills
                        .firstWhere((b) => b.id == selectedBillId)
                        .balanceDue
                    : stmt.currentBalanceDue;
                if (amt > maxAllowed + 0.01) {
                  setDialogState(() {
                    errorMsg = 'Amount cannot exceed ${_fmt(maxAllowed)}.';
                  });
                  return;
                }
                Navigator.of(ctx).pop(true);
              },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0D7A5F),
              ),
              child: const Text('Confirm Payment'),
            ),
          ],
        ),
      ),
    );

    if (confirmed == true) {
      final amt = double.tryParse(amountCtrl.text.trim()) ?? 0.0;
      if (amt > 0) {
        try {
          await DatabaseHelper.instance.recordSupplierPayment(
            partyId: stmt.party.id!,
            amount: amt,
            purchaseId: selectedBillId,
            paymentMode: selectedMethod,
            reference: refCtrl.text.trim(),
            notes: notesCtrl.text.trim(),
            paidAt: selectedDate,
          );
          _didMutate = true;
          await _loadStatement();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Recorded supplier payment of ${_fmt(amt)}.'),
                backgroundColor: const Color(0xFF0D7A5F),
              ),
            );
          }
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Payment error: $e')),
            );
          }
        }
      }
    }

    amountCtrl.dispose();
    refCtrl.dispose();
    notesCtrl.dispose();
  }

  Color _statusBg(PurchasePaymentStatus status) {
    switch (status) {
      case PurchasePaymentStatus.paid:
        return const Color(0xFF0D7A5F).withOpacity(0.12);
      case PurchasePaymentStatus.partiallyPaid:
        return const Color(0xFFD97706).withOpacity(0.14);
      case PurchasePaymentStatus.unpaid:
        return const Color(0xFFDC2626).withOpacity(0.12);
    }
  }

  Color _statusFg(PurchasePaymentStatus status) {
    switch (status) {
      case PurchasePaymentStatus.paid:
        return const Color(0xFF0D7A5F);
      case PurchasePaymentStatus.partiallyPaid:
        return const Color(0xFFB45309);
      case PurchasePaymentStatus.unpaid:
        return const Color(0xFFB91C1C);
    }
  }

  @override
  Widget build(BuildContext context) {
    final stmt = _statement;
    return WillPopScope(
      onWillPop: () async {
        Navigator.of(context).pop(_didMutate);
        return false;
      },
      child: DefaultTabController(
        length: 2,
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
                  stmt?.party.name ?? widget.supplier.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  'Supplier Bills & Payment History',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: Colors.grey.shade600,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
            actions: [
              IconButton(
                tooltip: 'Copy Summary',
                icon: const Icon(Icons.copy_outlined),
                onPressed: stmt == null ? null : _copySummary,
              ),
              if (stmt != null && stmt.currentBalanceDue > 0)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilledButton.icon(
                    onPressed: () => _openPaymentDialog(),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF0D7A5F),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                    ),
                    icon: const Icon(Icons.payments_outlined, size: 16),
                    label: const Text('Pay'),
                  ),
                ),
            ],
          ),
          body: _loading || stmt == null
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: _SummaryCard(
                                  label: 'Total Purchased',
                                  value: _fmt(stmt.totalPurchased),
                                  subtitle: '${stmt.bills.length} bill(s)',
                                  accent: const Color(0xFF0F172A),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _SummaryCard(
                                  label: 'Total Paid',
                                  value: _fmt(stmt.totalPaymentsRecorded),
                                  subtitle:
                                      '${stmt.payments.length} payment(s)',
                                  accent: const Color(0xFF0D7A5F),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: _SummaryCard(
                                  label: 'Current To Pay',
                                  value: _fmt(stmt.currentBalanceDue),
                                  subtitle:
                                      'Bill due: ${_fmt(stmt.totalBillRemaining)}',
                                  accent: const Color(0xFFB45309),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _SummaryCard(
                                  label: 'Bill Status Breakdown',
                                  value:
                                      '${stmt.paidBillCount} Paid · ${stmt.partialBillCount} Partial',
                                  subtitle: '${stmt.unpaidBillCount} Unpaid',
                                  accent: const Color(0xFF1D4ED8),
                                ),
                              ),
                            ],
                          ),
                          if (stmt.unallocatedOrOpeningBalance.abs() > 0.01) ...[
                            const SizedBox(height: 8),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEF3C7),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: const Color(0xFFFCD34D),
                                ),
                              ),
                              child: Text(
                                stmt.unallocatedOrOpeningBalance > 0
                                    ? 'Includes ${_fmt(stmt.unallocatedOrOpeningBalance)} opening/unlinked balance not tied to a bill.'
                                    : 'General unallocated payments exceed itemized bill remaining by ${_fmt(stmt.unallocatedOrOpeningBalance.abs())}.',
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  color: Color(0xFF92400E),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    TabBar(
                      labelColor: const Color(0xFF0D7A5F),
                      unselectedLabelColor: Colors.grey.shade600,
                      indicatorColor: const Color(0xFF0D7A5F),
                      tabs: [
                        Tab(text: 'Purchase Bills (${stmt.bills.length})'),
                        Tab(text: 'Payment History (${stmt.payments.length})'),
                      ],
                    ),
                    Expanded(
                      child: TabBarView(
                        children: [
                          _buildBillsTab(stmt),
                          _buildPaymentsTab(stmt),
                        ],
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildBillsTab(SupplierLedgerStatement stmt) {
    if (stmt.bills.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'No purchase bills recorded for ${stmt.party.name} yet.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade600),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadStatement,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: stmt.bills.length,
        itemBuilder: (ctx, idx) {
          final row = stmt.bills[idx];
          final pur = row.purchase;
          final billId = pur.id ?? -(idx + 1);
          final isExpanded = _expandedBillIds.contains(billId);
          final double progress = pur.totalAmount > 0
              ? (pur.paidAmount / pur.totalAmount).clamp(0.0, 1.0)
              : 0.0;
          final statusSub = row.status == PurchasePaymentStatus.partiallyPaid
              ? 'Partial payment recorded — balance still due'
              : row.status == PurchasePaymentStatus.unpaid
                  ? 'No payment recorded yet'
                  : 'Paid in full';

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
                  onTap: () {
                    setState(() {
                      if (isExpanded) {
                        _expandedBillIds.remove(billId);
                      } else {
                        _expandedBillIds.add(billId);
                      }
                    });
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        pur.purchaseNumber,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 14,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 7,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          color: _statusBg(row.status),
                                          borderRadius:
                                              BorderRadius.circular(6),
                                        ),
                                        child: Text(
                                          row.status.label,
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w700,
                                            color: _statusFg(row.status),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    'Inv: ${pur.supplierInvoiceNo} · ${_fmtDate(pur.createdAt)}',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    statusSub,
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: _statusFg(row.status),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  _fmt(pur.totalAmount),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 14,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Paid: ${_fmt(pur.paidAmount)}',
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    color: Color(0xFF0D7A5F),
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  pur.balanceDue > 0.005
                                      ? 'Due: ${_fmt(pur.balanceDue)}'
                                      : 'Settled',
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w700,
                                    color: pur.balanceDue > 0.005
                                        ? const Color(0xFFB45309)
                                        : const Color(0xFF0D7A5F),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: progress,
                            minHeight: 6,
                            backgroundColor: Colors.grey.shade200,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              _statusFg(row.status),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              isExpanded
                                  ? 'Hide medicines & payments'
                                  : 'View ${row.items.length} medicine(s) & ${row.allocatedPayments.length} payment(s)',
                              style: const TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF0D7A5F),
                              ),
                            ),
                            if (pur.balanceDue > 0.005 && pur.id != null)
                              FilledButton(
                                onPressed: () => _openPaymentDialog(
                                  preselectedPurchaseId: pur.id,
                                ),
                                style: FilledButton.styleFrom(
                                  backgroundColor: const Color(0xFF0D7A5F),
                                  visualDensity: VisualDensity.compact,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 4,
                                  ),
                                ),
                                child: const Text(
                                  'Pay Bill',
                                  style: TextStyle(fontSize: 11.5),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                if (isExpanded)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: const BorderRadius.vertical(
                        bottom: Radius.circular(12),
                      ),
                      border: Border(
                        top: BorderSide(color: Colors.grey.shade200),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Itemized Medicines',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        if (row.items.isEmpty)
                          Text(
                            'No line items stored for this bill.',
                            style: TextStyle(
                              fontSize: 11.5,
                              color: Colors.grey.shade600,
                            ),
                          )
                        else
                          ...row.items.map(
                            (it) => Padding(
                              padding: const EdgeInsets.only(bottom: 5),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          it.itemName,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        Text(
                                          'Batch ${it.batchNumber.isEmpty ? 'N/A' : it.batchNumber} · Exp ${it.expiryDate.isEmpty ? 'N/A' : it.expiryDate}',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.grey.shade600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    '${it.quantity} × ${_fmt(it.unitCost)} = ${_fmt(it.lineTotal)}',
                                    style: const TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        const Divider(height: 18),
                        const Text(
                          'Payments Allocated to This Bill',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        if (row.allocatedPayments.isEmpty)
                          Text(
                            'No payment has been recorded against this bill yet.',
                            style: TextStyle(
                              fontSize: 11.5,
                              color: Colors.grey.shade600,
                            ),
                          )
                        else
                          ...row.allocatedPayments.map(
                            (pay) => Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${_fmtDate(pay.createdAt)} · ${pay.paymentMode}${pay.reference != null && pay.reference!.isNotEmpty ? ' · Ref: ${pay.reference}' : ''}',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        color: Colors.grey.shade700,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    _fmt(pay.amount),
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xFF0D7A5F),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildPaymentsTab(SupplierLedgerStatement stmt) {
    if (stmt.payments.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'No supplier payments recorded for ${stmt.party.name} yet.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade600),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadStatement,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: stmt.payments.length,
        itemBuilder: (ctx, idx) {
          final pay = stmt.payments[idx];
          final targetLabel = (pay.purchaseNumber ?? '').isNotEmpty
              ? '${pay.purchaseNumber}${(pay.supplierInvoiceNo ?? '').isNotEmpty ? ' (Inv: ${pay.supplierInvoiceNo})' : ''}'
              : 'General Payable';

          return Card(
            elevation: 0,
            margin: const EdgeInsets.only(bottom: 8),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: Colors.grey.shade200),
            ),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 6,
              ),
              leading: CircleAvatar(
                backgroundColor: const Color(0xFF0D7A5F).withOpacity(0.12),
                foregroundColor: const Color(0xFF0D7A5F),
                child: const Icon(Icons.payments_outlined, size: 18),
              ),
              title: Row(
                children: [
                  Expanded(
                    child: Text(
                      pay.paymentMode,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13.5,
                      ),
                    ),
                  ),
                  Text(
                    _fmt(pay.amount),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      color: Color(0xFF0D7A5F),
                    ),
                  ),
                ],
              ),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 3),
                  Text(
                    '${_fmtDate(pay.createdAt, includeTime: true)} · $targetLabel',
                    style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
                  ),
                  if ((pay.reference ?? '').isNotEmpty ||
                      (pay.notes ?? '').isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        [
                          if ((pay.reference ?? '').isNotEmpty)
                            'Ref: ${pay.reference}',
                          if ((pay.notes ?? '').isNotEmpty) pay.notes!,
                        ].join(' · '),
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final String subtitle;
  final Color accent;

  const _SummaryCard({
    required this.label,
    required this.value,
    required this.subtitle,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 3),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w800,
                color: accent,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: TextStyle(fontSize: 10.5, color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }
}
