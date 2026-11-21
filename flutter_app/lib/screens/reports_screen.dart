import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../services/pdf_invoice_service.dart';
import '../utils/currency_formatter.dart';

enum _DateRangePreset {
  all,
  today,
  last7Days,
  last30Days,
  thisMonth,
  lastMonth,
  custom,
}

class ReportsScreen extends StatefulWidget {
  final PharmacySettings settings;
  final VoidCallback? onOpenDrawer;

  const ReportsScreen({
    super.key,
    required this.settings,
    this.onOpenDrawer,
  });

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen>
    with SingleTickerProviderStateMixin {
  static const List<String> _expenseCategories = [
    'Rent',
    'Utilities & Electricity',
    'Staff Salaries',
    'Supplies & Packaging',
    'Maintenance',
    'Delivery & Misc',
  ];

  late final TabController _tabController;
  DateTime? _fromDate;
  DateTime? _toDate;
  _DateRangePreset _activePreset = _DateRangePreset.all;

  bool _loading = true;
  ReportSummaryBundle? _bundle;
  String _receiptSearch = '';
  int? _expandedSaleId;
  List<SaleItemRecord> _expandedSaleItems = const [];
  String _expenseCategoryFilter = 'All';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this)
      ..addListener(() {
        if (mounted) setState(() {});
      });
    _loadReport();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadReport() async {
    setState(() => _loading = true);
    try {
      final data = await DatabaseHelper.instance.getFinancialReportBundle(
        fromDate: _fromDate,
        toDate: _toDate,
      );
      if (!mounted) return;
      setState(() {
        _bundle = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load report: $e')),
      );
    }
  }

  void _applyPreset(_DateRangePreset preset) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    setState(() {
      _activePreset = preset;
      switch (preset) {
        case _DateRangePreset.all:
          _fromDate = null;
          _toDate = null;
          break;
        case _DateRangePreset.today:
          _fromDate = today;
          _toDate = today;
          break;
        case _DateRangePreset.last7Days:
          _fromDate = today.subtract(const Duration(days: 6));
          _toDate = today;
          break;
        case _DateRangePreset.last30Days:
          _fromDate = today.subtract(const Duration(days: 29));
          _toDate = today;
          break;
        case _DateRangePreset.thisMonth:
          _fromDate = DateTime(now.year, now.month, 1);
          _toDate = today;
          break;
        case _DateRangePreset.lastMonth:
          final firstPrev = DateTime(now.year, now.month - 1, 1);
          final lastPrev = DateTime(now.year, now.month, 0);
          _fromDate = firstPrev;
          _toDate = lastPrev;
          break;
        case _DateRangePreset.custom:
          break;
      }
    });
    _loadReport();
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final initial = isFrom
        ? (_fromDate ?? _toDate ?? DateTime.now())
        : (_toDate ?? _fromDate ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
    );
    if (picked == null) return;
    setState(() {
      _activePreset = _DateRangePreset.custom;
      if (isFrom) {
        _fromDate = picked;
        if (_toDate != null && picked.isAfter(_toDate!)) {
          _fromDate = _toDate;
          _toDate = picked;
        }
      } else {
        _toDate = picked;
        if (_fromDate != null && picked.isBefore(_fromDate!)) {
          _toDate = _fromDate;
          _fromDate = picked;
        }
      }
    });
    _loadReport();
  }

  String _rangeLabel() {
    if (_fromDate == null && _toDate == null) return 'All Recorded Dates';
    String fmt(DateTime d) => CurrencyFormatter.formatDate(
          DateFormat('yyyy-MM-dd').format(d),
          widget.settings,
        );
    if (_fromDate != null && _toDate != null) {
      if (_fromDate!.year == _toDate!.year &&
          _fromDate!.month == _toDate!.month &&
          _fromDate!.day == _toDate!.day) {
        return fmt(_fromDate!);
      }
      return '${fmt(_fromDate!)} – ${fmt(_toDate!)}';
    }
    if (_fromDate != null) return 'From ${fmt(_fromDate!)}';
    return 'Up to ${fmt(_toDate!)}';
  }

  String _fmt(double amount) =>
      CurrencyFormatter.format(amount, widget.settings);

  Future<void> _copyPeriodSummary() async {
    final b = _bundle;
    if (b == null) return;
    final t = b.totals;
    final lines = [
      '${widget.settings.pharmacyName} — Financial Report',
      'Date Scope: ${_rangeLabel()}',
      'Receipts: ${t.receiptCount} · Expenses: ${t.expenseCount}',
      'Gross Sales (Subtotal): ${_fmt(t.grossSales)}',
      'Total Discounts: ${_fmt(t.discounts)}',
      'Net Sales: ${_fmt(t.netSales)}',
      'Total Cost (COGS): ${_fmt(t.totalCost)}',
      'Gross Profit: ${_fmt(t.grossProfit)} (${t.grossMarginPct.toStringAsFixed(1)}%)',
      'Operating Expenses: ${_fmt(t.totalExpenses)}',
      'True Net Profit: ${_fmt(t.trueNetProfit)} (${t.netMarginPct.toStringAsFixed(1)}%)',
    ];
    await Clipboard.setData(ClipboardData(text: lines.join('\n')));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Period totals copied to clipboard.')),
    );
  }

  Future<void> _toggleReceiptExpand(SaleRecord sale) async {
    if (sale.id == null) return;
    if (_expandedSaleId == sale.id) {
      setState(() {
        _expandedSaleId = null;
        _expandedSaleItems = const [];
      });
      return;
    }
    final items = await DatabaseHelper.instance.getSaleItems(sale.id!);
    if (!mounted) return;
    setState(() {
      _expandedSaleId = sale.id;
      _expandedSaleItems = items;
    });
  }

  Future<void> _openAddExpenseSheet() async {
    final titleCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    String category = 'Utilities & Electricity';
    String payMode = 'Cash';
    DateTime pickedDate = DateTime.now();

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Record Operating Expense',
                      style:
                          TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: titleCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Expense Title *',
                        hintText: 'e.g. LESCO Electricity Bill',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: category,
                      decoration: const InputDecoration(
                        labelText: 'Category',
                        border: OutlineInputBorder(),
                      ),
                      items: _expenseCategories
                          .map(
                            (c) => DropdownMenuItem(value: c, child: Text(c)),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v != null) setSheetState(() => category = v);
                      },
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: amountCtrl,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            decoration: InputDecoration(
                              labelText:
                                  'Amount (${CurrencyFormatter.unitLabel(widget.settings)}) *',
                              border: const OutlineInputBorder(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            value: payMode,
                            decoration: const InputDecoration(
                              labelText: 'Payment Mode',
                              border: OutlineInputBorder(),
                            ),
                            items: const [
                              DropdownMenuItem(
                                  value: 'Cash', child: Text('Cash')),
                              DropdownMenuItem(
                                value: 'Mobile Transfer',
                                child: Text('Mobile Transfer'),
                              ),
                              DropdownMenuItem(
                                value: 'Bank Transfer',
                                child: Text('Bank Transfer'),
                              ),
                            ],
                            onChanged: (v) {
                              if (v != null) setSheetState(() => payMode = v);
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: () async {
                        final chosen = await showDatePicker(
                          context: ctx,
                          initialDate: pickedDate,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2035),
                        );
                        if (chosen != null) {
                          setSheetState(() => pickedDate = chosen);
                        }
                      },
                      icon: const Icon(Icons.calendar_today, size: 16),
                      label: Text(
                        'Expense Date: ${CurrencyFormatter.formatDate(DateFormat('yyyy-MM-dd').format(pickedDate), widget.settings)}',
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: notesCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Notes (Optional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: () async {
                        final title = titleCtrl.text.trim();
                        final amt = double.tryParse(amountCtrl.text.trim()) ?? 0;
                        if (title.isEmpty || amt <= 0) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            const SnackBar(
                              content: Text(
                                  'Enter an expense title and positive amount.'),
                            ),
                          );
                          return;
                        }
                        await DatabaseHelper.instance.insertExpense(
                          ExpenseRecord(
                            title: title,
                            category: category,
                            amount: amt,
                            date: DateFormat('yyyy-MM-dd').format(pickedDate),
                            paymentMode: payMode,
                            notes: notesCtrl.text.trim(),
                            createdAt: DateTime.now().toIso8601String(),
                          ),
                        );
                        if (ctx.mounted) Navigator.of(ctx).pop(true);
                      },
                      child: const Text('Save Expense'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (saved == true) {
      _loadReport();
    }
  }

  Future<void> _deleteExpense(ExpenseRecord exp) async {
    if (exp.id == null) return;
    await DatabaseHelper.instance.deleteExpense(exp.id!);
    _loadReport();
  }

  FinancialReportTabType _currentReportTabType() {
    switch (_tabController.index) {
      case 0:
        return FinancialReportTabType.daily;
      case 1:
        return FinancialReportTabType.monthly;
      case 2:
        return FinancialReportTabType.receipts;
      case 3:
      default:
        return FinancialReportTabType.expenses;
    }
  }

  List<SaleRecord> _activeFilteredReceipts() {
    final all = _bundle?.receipts ?? const [];
    final q = _receiptSearch.trim().toLowerCase();
    if (q.isEmpty) return all;
    return all.where((s) {
      return s.invoiceNumber.toLowerCase().contains(q) ||
          s.partyName.toLowerCase().contains(q) ||
          s.paymentMode.dbValue.toLowerCase().contains(q);
    }).toList();
  }

  List<ExpenseRecord> _activeFilteredExpenses() {
    final all = _bundle?.expenses ?? const [];
    if (_expenseCategoryFilter == 'All') return all;
    return all.where((e) => e.category == _expenseCategoryFilter).toList();
  }

  bool _hasActiveReportRows() {
    final b = _bundle;
    if (b == null) return false;
    switch (_currentReportTabType()) {
      case FinancialReportTabType.daily:
        return b.dailyRows.isNotEmpty;
      case FinancialReportTabType.monthly:
        return b.monthlyRows.isNotEmpty;
      case FinancialReportTabType.receipts:
        return _activeFilteredReceipts().isNotEmpty;
      case FinancialReportTabType.expenses:
        return _activeFilteredExpenses().isNotEmpty;
    }
  }

  String? _activeSearchOrFilterNote() {
    final tab = _currentReportTabType();
    if (tab == FinancialReportTabType.receipts &&
        _receiptSearch.trim().isNotEmpty) {
      return 'Search: "${_receiptSearch.trim()}"';
    }
    if (tab == FinancialReportTabType.expenses &&
        _expenseCategoryFilter != 'All') {
      return 'Category: $_expenseCategoryFilter';
    }
    return null;
  }

  Future<void> _downloadPdfReport({bool share = false}) async {
    final b = _bundle;
    if (b == null) return;
    final tab = _currentReportTabType();
    final filteredReceipts = _activeFilteredReceipts();
    final filteredExpenses = _activeFilteredExpenses();
    final note = _activeSearchOrFilterNote();
    final scope = _rangeLabel();
    try {
      if (share) {
        await PdfInvoiceService.instance.shareFinancialReportPdf(
          reportTab: tab,
          bundle: b,
          filteredReceipts: filteredReceipts,
          filteredExpenses: filteredExpenses,
          dateScopeLabel: scope,
          searchOrFilterNote: note,
          settings: widget.settings,
        );
      } else {
        await PdfInvoiceService.instance.printFinancialReportPdf(
          reportTab: tab,
          bundle: b,
          filteredReceipts: filteredReceipts,
          filteredExpenses: filteredExpenses,
          dateScopeLabel: scope,
          searchOrFilterNote: note,
          settings: widget.settings,
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to generate PDF report: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _bundle?.totals;

    return Scaffold(
      appBar: AppBar(
        leading: widget.onOpenDrawer != null
            ? IconButton(
                icon: const Icon(Icons.menu),
                onPressed: widget.onOpenDrawer,
              )
            : null,
        title: const Text('Financial Reports & Profit'),
        actions: [
          IconButton(
            tooltip: 'Download PDF Report',
            onPressed:
                _hasActiveReportRows() ? () => _downloadPdfReport() : null,
            icon: const Icon(Icons.picture_as_pdf_outlined),
          ),
          IconButton(
            tooltip: 'Share PDF Report',
            onPressed: _hasActiveReportRows()
                ? () => _downloadPdfReport(share: true)
                : null,
            icon: const Icon(Icons.share_outlined),
          ),
          IconButton(
            tooltip: 'Copy Period Summary',
            onPressed: _bundle == null ? null : _copyPeriodSummary,
            icon: const Icon(Icons.copy_all_outlined),
          ),
          IconButton(
            tooltip: 'Add Expense',
            onPressed: _openAddExpenseSheet,
            icon: const Icon(Icons.add_card_outlined),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: const [
            Tab(text: 'Daily Report'),
            Tab(text: 'Monthly Report'),
            Tab(text: 'Receipt Profit'),
            Tab(text: 'Expenses'),
          ],
        ),
      ),
      body: Column(
        children: [
          _buildDateRangeFilterBar(),
          if (t != null) _buildPeriodTotalsStrip(t),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(
                    controller: _tabController,
                    children: [
                      _buildDailyTab(),
                      _buildMonthlyTab(),
                      _buildReceiptsTab(),
                      _buildExpensesTab(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildDateRangeFilterBar() {
    final presets = <(_DateRangePreset, String)>[
      (_DateRangePreset.all, 'All Dates'),
      (_DateRangePreset.today, 'Today'),
      (_DateRangePreset.last7Days, 'Last 7D'),
      (_DateRangePreset.last30Days, 'Last 30D'),
      (_DateRangePreset.thisMonth, 'This Month'),
      (_DateRangePreset.lastMonth, 'Last Month'),
    ];

    String fmtPicker(DateTime? d, String fallback) {
      if (d == null) return fallback;
      return CurrencyFormatter.formatDate(
        DateFormat('yyyy-MM-dd').format(d),
        widget.settings,
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.date_range, size: 17, color: Color(0xFF0D7A5F)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Scope: ${_rangeLabel()}',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (_fromDate != null || _toDate != null)
                TextButton(
                  onPressed: () => _applyPreset(_DateRangePreset.all),
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                  child: const Text('Clear'),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickDate(isFrom: true),
                  icon: const Icon(Icons.calendar_today, size: 14),
                  label: Text(
                    'From: ${fmtPicker(_fromDate, 'Any')}',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickDate(isFrom: false),
                  icon: const Icon(Icons.event, size: 14),
                  label: Text(
                    'To: ${fmtPicker(_toDate, 'Any')}',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: presets.map((p) {
                final selected = _activePreset == p.$1;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(p.$2, style: const TextStyle(fontSize: 11.5)),
                    selected: selected,
                    visualDensity: VisualDensity.compact,
                    onSelected: (_) => _applyPreset(p.$1),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _hasActiveReportRows()
                      ? () => _downloadPdfReport()
                      : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF0D7A5F),
                    visualDensity: VisualDensity.compact,
                  ),
                  icon: const Icon(Icons.picture_as_pdf_outlined, size: 16),
                  label: const Text(
                    'Download PDF Report',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: _hasActiveReportRows()
                    ? () => _downloadPdfReport(share: true)
                    : null,
                style: OutlinedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                ),
                icon: const Icon(Icons.share_outlined, size: 15),
                label: const Text('Share', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPeriodTotalsStrip(ReportPeriodTotals t) {
    final cards = [
      (
        'Net Sales',
        _fmt(t.netSales),
        '${t.receiptCount} receipts · Disc ${_fmt(t.discounts)}',
        const Color(0xFF0F766E),
      ),
      (
        'Total Cost (COGS)',
        _fmt(t.totalCost),
        'Gross ${_fmt(t.grossSales)}',
        const Color(0xFF374151),
      ),
      (
        'Gross Profit',
        _fmt(t.grossProfit),
        '${t.grossMarginPct.toStringAsFixed(1)}% margin',
        const Color(0xFF047857),
      ),
      (
        'Expenses',
        _fmt(t.totalExpenses),
        '${t.expenseCount} entries',
        const Color(0xFFB45309),
      ),
      (
        'True Net Profit',
        _fmt(t.trueNetProfit),
        '${t.netMarginPct.toStringAsFixed(1)}% net margin',
        t.trueNetProfit >= 0
            ? const Color(0xFF0D7A5F)
            : const Color(0xFFB91C1C),
      ),
    ];

    return Container(
      height: 86,
      padding: const EdgeInsets.symmetric(vertical: 8),
      color: const Color(0xFFF3F4F6),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: cards.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, idx) {
          final c = cards[idx];
          return Container(
            width: 170,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  c.$1,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  c.$2,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: c.$4,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  c.$3,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildGrandTotalCard({
    required String title,
    required String subtitle,
    required int receiptCount,
    required double grossSales,
    required double discounts,
    required double netSales,
    required double totalCost,
    required double grossProfit,
    required double expenses,
    required double trueNetProfit,
    required double netMarginPct,
  }) {
    return Card(
      color: const Color(0xFFE6F4F1),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFF0D7A5F), width: 1.2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF064E3B),
                        ),
                      ),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  '$receiptCount receipts',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0D7A5F),
                  ),
                ),
              ],
            ),
            const Divider(height: 16),
            Wrap(
              spacing: 14,
              runSpacing: 8,
              children: [
                _metricCell('Gross Sales', _fmt(grossSales)),
                _metricCell('Discounts', '-${_fmt(discounts)}',
                    color: const Color(0xFFB45309)),
                _metricCell('Net Sales', _fmt(netSales),
                    color: const Color(0xFF0F766E)),
                _metricCell('Total Cost (COGS)', _fmt(totalCost)),
                _metricCell('Gross Profit', _fmt(grossProfit),
                    color: const Color(0xFF047857)),
                _metricCell('Expenses', _fmt(expenses),
                    color: const Color(0xFFB45309)),
                _metricCell(
                  'True Net Profit',
                  '${_fmt(trueNetProfit)} (${netMarginPct.toStringAsFixed(1)}%)',
                  color: trueNetProfit >= 0
                      ? const Color(0xFF0D7A5F)
                      : const Color(0xFFB91C1C),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _metricCell(String label, String value, {Color? color}) {
    return SizedBox(
      width: 148,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 10.5, color: Colors.grey.shade700),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: color ?? const Color(0xFF111827),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDailyTab() {
    final rows = _bundle?.dailyRows ?? const [];
    final totals = _bundle?.totals;
    if (rows.isEmpty || totals == null) {
      return const Center(
        child: Text('No daily activity in the selected date range.'),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        ...rows.map((day) {
          final parsed = DateTime.tryParse(day.dateKey);
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: parsed == null
                  ? null
                  : () {
                      setState(() {
                        _fromDate = parsed;
                        _toDate = parsed;
                        _activePreset = _DateRangePreset.custom;
                      });
                      _tabController.animateTo(2);
                      _loadReport();
                    },
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          CurrencyFormatter.formatDate(
                            day.dateKey,
                            widget.settings,
                          ),
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '${day.receiptCount} receipts · ${day.expenseCount} exp',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 14,
                      runSpacing: 6,
                      children: [
                        _metricCell('Gross', _fmt(day.grossSales)),
                        _metricCell('Disc', _fmt(day.discounts)),
                        _metricCell('Net Sales', _fmt(day.netSales),
                            color: const Color(0xFF0F766E)),
                        _metricCell('Cost', _fmt(day.totalCost)),
                        _metricCell('Gross Profit', _fmt(day.grossProfit),
                            color: const Color(0xFF047857)),
                        _metricCell('Expenses', _fmt(day.expenses),
                            color: const Color(0xFFB45309)),
                        _metricCell(
                          'Net Profit',
                          '${_fmt(day.trueNetProfit)} (${day.netMarginPct.toStringAsFixed(1)}%)',
                          color: day.trueNetProfit >= 0
                              ? const Color(0xFF0D7A5F)
                              : const Color(0xFFB91C1C),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
        const SizedBox(height: 4),
        _buildGrandTotalCard(
          title: 'GRAND TOTAL (${rows.length} Days)',
          subtitle: _rangeLabel(),
          receiptCount: totals.receiptCount,
          grossSales: totals.grossSales,
          discounts: totals.discounts,
          netSales: totals.netSales,
          totalCost: totals.totalCost,
          grossProfit: totals.grossProfit,
          expenses: totals.totalExpenses,
          trueNetProfit: totals.trueNetProfit,
          netMarginPct: totals.netMarginPct,
        ),
      ],
    );
  }

  Widget _buildMonthlyTab() {
    final rows = _bundle?.monthlyRows ?? const [];
    final totals = _bundle?.totals;
    if (rows.isEmpty || totals == null) {
      return const Center(
        child: Text('No monthly activity in the selected date range.'),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        ...rows.map((m) {
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () {
                final parts = m.monthKey.split('-');
                if (parts.length == 2) {
                  final yr = int.tryParse(parts[0]);
                  final mo = int.tryParse(parts[1]);
                  if (yr != null && mo != null) {
                    setState(() {
                      _fromDate = DateTime(yr, mo, 1);
                      _toDate = DateTime(yr, mo + 1, 0);
                      _activePreset = _DateRangePreset.custom;
                    });
                    _tabController.animateTo(0);
                    _loadReport();
                  }
                }
              },
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          m.label,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '${m.receiptCount} receipts · Tap for daily view',
                          style: const TextStyle(
                            fontSize: 11,
                            color: Color(0xFF0D7A5F),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 14,
                      runSpacing: 6,
                      children: [
                        _metricCell('Gross Sales', _fmt(m.grossSales)),
                        _metricCell('Discounts', _fmt(m.discounts)),
                        _metricCell('Net Sales', _fmt(m.netSales),
                            color: const Color(0xFF0F766E)),
                        _metricCell('Total Cost', _fmt(m.totalCost)),
                        _metricCell('Gross Profit', _fmt(m.grossProfit),
                            color: const Color(0xFF047857)),
                        _metricCell('Expenses', _fmt(m.expenses),
                            color: const Color(0xFFB45309)),
                        _metricCell(
                          'True Net Profit',
                          '${_fmt(m.trueNetProfit)} (${m.netMarginPct.toStringAsFixed(1)}%)',
                          color: m.trueNetProfit >= 0
                              ? const Color(0xFF0D7A5F)
                              : const Color(0xFFB91C1C),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
        const SizedBox(height: 4),
        _buildGrandTotalCard(
          title: 'GRAND TOTAL (${rows.length} Months)',
          subtitle: _rangeLabel(),
          receiptCount: totals.receiptCount,
          grossSales: totals.grossSales,
          discounts: totals.discounts,
          netSales: totals.netSales,
          totalCost: totals.totalCost,
          grossProfit: totals.grossProfit,
          expenses: totals.totalExpenses,
          trueNetProfit: totals.trueNetProfit,
          netMarginPct: totals.netMarginPct,
        ),
      ],
    );
  }

  Widget _buildReceiptsTab() {
    final allReceipts = _bundle?.receipts ?? const [];
    final q = _receiptSearch.trim().toLowerCase();
    final filtered = q.isEmpty
        ? allReceipts
        : allReceipts.where((s) {
            return s.invoiceNumber.toLowerCase().contains(q) ||
                s.partyName.toLowerCase().contains(q) ||
                s.paymentMode.dbValue.toLowerCase().contains(q);
          }).toList();

    final grossSum = filtered.fold(0.0, (s, r) => s + r.subtotal);
    final discSum = filtered.fold(0.0, (s, r) => s + r.discountAmount);
    final netSum = filtered.fold(0.0, (s, r) => s + r.netPayable);
    final costSum = filtered.fold(0.0, (s, r) => s + r.totalCost);
    final profitSum = filtered.fold(0.0, (s, r) => s + r.netProfit);
    final expTotal = _bundle?.totals.totalExpenses ?? 0.0;
    final afterExp = profitSum - expTotal;
    final margin = netSum > 0 ? (profitSum / netSum) * 100 : 0.0;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: TextField(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search, size: 18),
              hintText: 'Search invoice #, customer, or payment mode...',
              isDense: true,
              border: OutlineInputBorder(),
            ),
            onChanged: (v) => setState(() => _receiptSearch = v),
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? const Center(
                  child: Text('No receipts match the selected date range.'),
                )
              : ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    ...filtered.map((s) {
                      final expanded = s.id != null && _expandedSaleId == s.id;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: Column(
                          children: [
                            ListTile(
                              onTap: () => _toggleReceiptExpand(s),
                              title: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    s.invoiceNumber,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13.5,
                                    ),
                                  ),
                                  Text(
                                    _fmt(s.netPayable),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13.5,
                                      color: Color(0xFF0F766E),
                                    ),
                                  ),
                                ],
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${s.partyName} · ${s.paymentMode.dbValue} · ${CurrencyFormatter.formatDate(s.createdAt, widget.settings, includeTime: true)}',
                                    style: const TextStyle(fontSize: 11.5),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    'Gross ${_fmt(s.subtotal)} · Disc ${_fmt(s.discountAmount)} · Cost ${_fmt(s.totalCost)} · Profit ${_fmt(s.netProfit)}',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: s.netProfit >= 0
                                          ? const Color(0xFF047857)
                                          : const Color(0xFFB91C1C),
                                    ),
                                  ),
                                ],
                              ),
                              trailing: Icon(
                                expanded
                                    ? Icons.expand_less
                                    : Icons.expand_more,
                              ),
                            ),
                            if (expanded)
                              Container(
                                width: double.infinity,
                                padding:
                                    const EdgeInsets.fromLTRB(16, 4, 16, 12),
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade50,
                                  border: Border(
                                    top: BorderSide(color: Colors.grey.shade200),
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: _expandedSaleItems.map((it) {
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 3,
                                      ),
                                      child: Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          Expanded(
                                            child: Text(
                                              '${it.itemName} (${it.quantity} ${it.unit})',
                                              style: const TextStyle(
                                                fontSize: 12,
                                              ),
                                            ),
                                          ),
                                          Text(
                                            _fmt(it.lineTotal),
                                            style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ),
                          ],
                        ),
                      );
                    }),
                    const SizedBox(height: 4),
                    _buildGrandTotalCard(
                      title: 'TOTALS (${filtered.length} Receipts)',
                      subtitle: q.isEmpty
                          ? _rangeLabel()
                          : '${_rangeLabel()} · Filtered by "$q"',
                      receiptCount: filtered.length,
                      grossSales: grossSum,
                      discounts: discSum,
                      netSales: netSum,
                      totalCost: costSum,
                      grossProfit: profitSum,
                      expenses: expTotal,
                      trueNetProfit: afterExp,
                      netMarginPct: margin,
                    ),
                  ],
                ),
        ),
      ],
    );
  }

  Widget _buildExpensesTab() {
    final allExp = _bundle?.expenses ?? const [];
    final filtered = _expenseCategoryFilter == 'All'
        ? allExp
        : allExp.where((e) => e.category == _expenseCategoryFilter).toList();
    final totalExp = filtered.fold(0.0, (s, e) => s + e.amount);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _expenseCategoryFilter,
                  isDense: true,
                  decoration: const InputDecoration(
                    labelText: 'Category Filter',
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    const DropdownMenuItem(
                        value: 'All', child: Text('All Categories')),
                    ..._expenseCategories.map(
                      (c) => DropdownMenuItem(value: c, child: Text(c)),
                    ),
                  ],
                  onChanged: (v) {
                    if (v != null) setState(() => _expenseCategoryFilter = v);
                  },
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: _openAddExpenseSheet,
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add'),
              ),
            ],
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? const Center(
                  child: Text('No expenses recorded in this date scope.'),
                )
              : ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    ...filtered.map((exp) {
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          title: Text(
                            exp.title,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13.5,
                            ),
                          ),
                          subtitle: Text(
                            '${exp.category} · ${CurrencyFormatter.formatDate(exp.date, widget.settings)} · ${exp.paymentMode}${exp.notes.isNotEmpty ? ' · ${exp.notes}' : ''}',
                            style: const TextStyle(fontSize: 11.5),
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _fmt(exp.amount),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFFB45309),
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline,
                                    size: 18, color: Color(0xFFB91C1C)),
                                onPressed: () => _deleteExpense(exp),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                    Card(
                      color: const Color(0xFFFEF3C7),
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: const BorderSide(color: Color(0xFFD97706)),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'TOTAL EXPENSES (${filtered.length} entries)',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 13,
                                    color: Color(0xFF92400E),
                                  ),
                                ),
                                Text(
                                  _rangeLabel(),
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.grey.shade800,
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              _fmt(totalExp),
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFFB45309),
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
    );
  }
}
