import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../services/pdf_invoice_service.dart';
import '../services/printer_service.dart';
import '../utils/currency_formatter.dart';
import 'edit_credit_receipt_dialog.dart';

/// Point of Sale & Real-time Cart Management Screen for Clinix Community Pharmacy.
/// Strictly tuned for Mobile (< 600: 2-tab Catalog / Cart + Sticky Checkout Bar)
/// and Tablet (>= 600: 60% / 40% Split View with sticky Complete & Print).
class PosScreen extends StatefulWidget {
  final PharmacySettings settings;
  final UserRole? currentUserRole;
  final PharmacyUser? currentUser;
  final VoidCallback? onOpenDrawer;
  final VoidCallback? onInspectDartSource;
  final VoidCallback? onOpenBarcodeCamera;

  const PosScreen({
    super.key,
    this.settings = const PharmacySettings(),
    this.currentUserRole,
    this.currentUser,
    this.onOpenDrawer,
    this.onInspectDartSource,
    this.onOpenBarcodeCamera,
  });

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen>
    with SingleTickerProviderStateMixin {
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _billDiscountController =
      TextEditingController(text: '0');
  final TextEditingController _cashReceivedController = TextEditingController();
  final TextEditingController _transactionRefController =
      TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();

  late final TabController _mobileTabController;

  static const List<String> _orderedCategories = [
    'All',
    'Analgesics',
    'Antibiotics',
    'Gastro',
    'Diabetes Care',
    'Cardiac',
    'Allergy',
    'Supplements',
  ];

  List<PharmacyItem> _items = [];
  List<Party> _customers = [];
  final List<CartLine> _cart = [];

  String _selectedCategory = 'All';
  PaymentMode _paymentMode = PaymentMode.cash;
  Party? _selectedParty;
  double _billDiscount = 0.0;
  bool _isLoading = true;
  bool _isCheckingOut = false;

  String _fmt(double amount) =>
      CurrencyFormatter.format(amount, widget.settings);

  String get _curUnit => CurrencyFormatter.unitLabel(widget.settings);

  UserRole get _effectiveRole =>
      widget.currentUser?.role ??
      widget.currentUserRole ??
      widget.settings.activeUserRole;

  PharmacyUser get _effectiveUser =>
      widget.currentUser ??
      PharmacyUser(
        name: _effectiveRole.label,
        username: _effectiveRole.name,
        role: _effectiveRole,
        pinOrPassword: '',
        createdAt: '',
      );

  bool get _isManagerOrAdmin => _effectiveRole.canViewProfitAndCost;

  bool get _canViewCostAndProfit {
    if (widget.currentUserRole != null &&
        !widget.currentUserRole!.canViewProfitAndCost) {
      return false;
    }
    return _isManagerOrAdmin || widget.settings.showProfitToStaff;
  }

  @override
  void initState() {
    super.initState();
    _mobileTabController = TabController(length: 2, vsync: this);
    _mobileTabController.addListener(() {
      if (mounted) setState(() {});
    });
    _loadData();
    if (widget.settings.preferUsbScannerFocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _searchFocusNode.requestFocus();
      });
    }
  }

  @override
  void didUpdateWidget(covariant PosScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.settings.preferUsbScannerFocus &&
        widget.settings.preferUsbScannerFocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _searchFocusNode.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _mobileTabController.dispose();
    _searchFocusNode.dispose();
    _searchController.dispose();
    _billDiscountController.dispose();
    _cashReceivedController.dispose();
    _transactionRefController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final items =
          await DatabaseHelper.instance.getItems(query: _searchController.text);
      final customers =
          await DatabaseHelper.instance.getParties(type: PartyType.customer);
      if (!mounted) return;
      setState(() {
        _items = items;
        _customers = customers;
        if (customers.isEmpty) {
          _selectedParty = null;
        } else if (_selectedParty == null) {
          _selectedParty = customers.first;
        } else {
          final matchIdx =
              customers.indexWhere((c) => c.id == _selectedParty!.id);
          _selectedParty =
              matchIdx >= 0 ? customers[matchIdx] : customers.first;
        }
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      _showSnack('Database load failed: $e', isError: true);
    }
  }

  Future<void> _handleBarcodeSubmit(String raw) async {
    final code = raw.trim();
    if (code.isEmpty) return;

    final exactMatch = await DatabaseHelper.instance.findByBarcode(code);
    if (exactMatch != null) {
      _addToCart(exactMatch);
      _searchController.clear();
      await _loadData();
    } else {
      await _loadData();
    }
    if (mounted && widget.settings.preferUsbScannerFocus) {
      _searchFocusNode.requestFocus();
    }
  }

  void _addToCart(PharmacyItem item, {int qty = 1}) {
    if (item.stockQuantity <= 0) {
      _showSnack('${item.name} is out of stock.', isError: true);
      return;
    }

    final idx = _cart.indexWhere((line) => line.item.id == item.id);
    int addedTotal = qty;
    setState(() {
      if (idx >= 0) {
        final current = _cart[idx];
        final nextQty = current.quantity + qty;
        if (nextQty > item.stockQuantity) {
          _showSnack('Maximum available stock (${item.stockQuantity}) reached.',
              isError: true);
          return;
        }
        addedTotal = nextQty;
        _cart[idx] = current.copyWith(quantity: nextQty);
      } else {
        _cart.add(CartLine(item: item, quantity: qty));
      }
    });
    _showSnack('Added ${item.name} ($addedTotal in cart)');
  }

  void _updateQuantity(int index, int delta) {
    final current = _cart[index];
    final nextQty = current.quantity + delta;
    setState(() {
      if (nextQty <= 0) {
        _cart.removeAt(index);
      } else if (nextQty > current.item.stockQuantity) {
        _showSnack(
            'Only ${current.item.stockQuantity} units available in stock.',
            isError: true);
      } else {
        _cart[index] = current.copyWith(quantity: nextQty);
      }
    });
  }

  void _updateItemDiscount(int index, double discountAmount) {
    final line = _cart[index];
    final safe = discountAmount.clamp(0.0, line.grossTotal).toDouble();
    setState(() {
      _cart[index] = line.copyWith(itemDiscount: safe);
    });
  }

  // ==================== FINANCIAL & PROFIT CALCULATIONS ====================

  double get _subtotal =>
      _cart.fold(0.0, (sum, line) => sum + line.grossTotal);

  double get _itemDiscountTotal =>
      _cart.fold(0.0, (sum, line) => sum + line.clampedDiscount);

  double get _afterItemDiscount => _subtotal - _itemDiscountTotal;

  double get _effectiveBillDiscount =>
      _billDiscount.clamp(0.0, _afterItemDiscount).toDouble();

  double get _totalDiscount => _itemDiscountTotal + _effectiveBillDiscount;

  double get _netPayable => _afterItemDiscount - _effectiveBillDiscount;

  double get _totalCost =>
      _cart.fold(0.0, (sum, line) => sum + line.totalCost);

  /// Accurately subtracts BOTH item-level and bill-level discounts from net profit.
  double get _netProfit => _netPayable - _totalCost;

  int get _totalUnits => _cart.fold(0, (sum, line) => sum + line.quantity);

  double? get _parsedCashReceived {
    final text = _cashReceivedController.text.trim();
    if (text.isEmpty) return null;
    return double.tryParse(text);
  }

  String _formatExpiryMmYy(String raw) {
    final parsed = DateTime.tryParse(raw);
    if (parsed != null) {
      return DateFormat('MM/yy').format(parsed);
    }
    return raw.isEmpty ? 'N/A' : raw;
  }

  Future<void> _completeCheckout() async {
    if (_cart.isEmpty) {
      _showSnack('Add at least one medicine to the cart.', isError: true);
      return;
    }

    final effectiveMode =
        (!_isManagerOrAdmin && _paymentMode.isCreditKhata)
            ? PaymentMode.cash
            : _paymentMode;

    if (effectiveMode.isCreditKhata &&
        (_selectedParty == null ||
            _selectedParty!.name == 'Walk-in Customer')) {
      _showSnack('Select a customer account for Credit / Khata.',
          isError: true);
      return;
    }

    final cashIn = _parsedCashReceived;
    if (effectiveMode == PaymentMode.cash &&
        cashIn != null &&
        cashIn + 0.001 < _netPayable) {
      _showSnack('Cash received is less than Net Payable.', isError: true);
      return;
    }

    setState(() => _isCheckingOut = true);
    try {
      final completedSale = await DatabaseHelper.instance.completeSale(
        cartLines: List<CartLine>.from(_cart),
        billDiscount: _effectiveBillDiscount,
        paymentMode: effectiveMode,
        party: _isManagerOrAdmin ? _selectedParty : null,
        transactionReference: effectiveMode.requiresReference
            ? _transactionRefController.text
            : null,
        cashReceived:
            effectiveMode == PaymentMode.cash ? (cashIn ?? _netPayable) : null,
      );

      final saleItems =
          await DatabaseHelper.instance.getSaleItems(completedSale.id!);

      if (!mounted) return;
      setState(() {
        _cart.clear();
        _billDiscount = 0.0;
        _billDiscountController.text = '0';
        _cashReceivedController.clear();
        _transactionRefController.clear();
        _isCheckingOut = false;
      });

      await _loadData();
      if (!mounted) return;

      if (widget.settings.autoPrintReceipt) {
        final hasPrinter = widget.settings.savedPrinterMac != null &&
            widget.settings.savedPrinterMac!.isNotEmpty;
        try {
          if (hasPrinter) {
            await PrinterService.instance.printReceipt(
              sale: completedSale,
              items: saleItems,
              settings: widget.settings,
            );
            _showSnack('Receipt auto-printed to thermal printer.');
          } else {
            await PdfInvoiceService.instance.printA5Pdf(
              sale: completedSale,
              items: saleItems,
              settings: widget.settings,
            );
          }
        } catch (e) {
          _showSnack('Auto-print fallback: $e', isError: true);
        }
      }

      if (!mounted) return;
      await _showPostSaleSheet(completedSale, saleItems);
      if (mounted && widget.settings.preferUsbScannerFocus) {
        _searchFocusNode.requestFocus();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _isCheckingOut = false);
      _showSnack('Checkout failed: $e', isError: true);
    }
  }

  Future<void> _showPostSaleSheet(
    SaleRecord sale,
    List<SaleItemRecord> items,
  ) async {
    var activeSale = sale;
    var activeItems = items;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Row(
            children: [
              Expanded(
                child: Text(
                  'Sale Completed · ${activeSale.invoiceNumber}',
                  style: const TextStyle(fontSize: 16),
                ),
              ),
              if (activeSale.editedAt != null)
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
                Text('Party: ${activeSale.partyName}'),
                Text('Payment Mode: ${activeSale.paymentMode.dbValue}'),
                if (activeSale.transactionReference != null &&
                    activeSale.transactionReference!.isNotEmpty)
                  Text('Reference: ${activeSale.transactionReference}'),
                Text('Subtotal: ${_fmt(activeSale.subtotal)}'),
                if (activeSale.discountAmount > 0)
                  Text(
                    'Discount: -${_fmt(activeSale.discountAmount)}',
                    style: TextStyle(color: Colors.amber[800]),
                  ),
                const SizedBox(height: 6),
                Text(
                  'Net Payable: ${_fmt(activeSale.netPayable)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                if (activeSale.cashReceived != null) ...[
                  Text('Cash Received: ${_fmt(activeSale.cashReceived!)}'),
                  Text(
                    'Balance / Change: ${_fmt(activeSale.changeReturned ?? (activeSale.cashReceived! - activeSale.netPayable))}',
                  ),
                ],
                if (activeSale.editedAt != null &&
                    activeSale.editReason != null) ...[
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
                          'Edited by ${activeSale.editedByName ?? activeSale.editedBy ?? 'Staff'}',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          'Reason: ${activeSale.editReason}',
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
            if (activeSale.paymentMode.isCreditKhata && _isManagerOrAdmin)
              OutlinedButton.icon(
                onPressed: () async {
                  final updated = await Navigator.of(context).push<SaleRecord?>(
                    MaterialPageRoute(
                      builder: (_) => EditCreditReceiptScreen(
                        sale: activeSale,
                        initialSaleItems: activeItems,
                        settings: widget.settings,
                        currentUser: _effectiveUser,
                      ),
                    ),
                  );
                  if (updated != null && updated.id != null) {
                    final freshItems = await DatabaseHelper.instance
                        .getSaleItems(updated.id!);
                    await _loadData();
                    if (ctx.mounted) {
                      setDialogState(() {
                        activeSale = updated;
                        activeItems = freshItems;
                      });
                    }
                    _showSnack(
                      'Receipt ${updated.invoiceNumber} corrected & Khata reconciled.',
                    );
                  }
                },
                icon: const Icon(Icons.edit_outlined, size: 17),
                label: const Text('Edit Receipt'),
              ),
            OutlinedButton.icon(
              onPressed: () async {
                try {
                  await PdfInvoiceService.instance.shareInvoicePdf(
                    sale: activeSale,
                    items: activeItems,
                    settings: widget.settings,
                  );
                } catch (e) {
                  _showSnack('PDF share error: $e', isError: true);
                }
              },
              icon: const Icon(Icons.share),
              label: const Text('Share A5 PDF'),
            ),
            FilledButton.icon(
              onPressed: () async {
                try {
                  await PrinterService.instance.printReceipt(
                    sale: activeSale,
                    items: activeItems,
                    settings: widget.settings,
                  );
                  _showSnack('Thermal receipt sent to Bluetooth printer.');
                } catch (e) {
                  _showSnack('Print error: $e', isError: true);
                }
              },
              icon: const Icon(Icons.print),
              label: const Text('Print Thermal'),
            ),
          ],
        ),
      ),
    );
  }

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(milliseconds: 1800),
          content: Text(message),
          backgroundColor:
              isError ? Colors.red.shade700 : const Color(0xFF0D7A5F),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final extraCats = _items
        .map((e) => e.category)
        .where((c) => !_orderedCategories.contains(c))
        .toSet()
        .toList();
    final categories = [..._orderedCategories, ...extraCats];
    final filteredItems = _selectedCategory == 'All'
        ? _items
        : _items.where((i) => i.category == _selectedCategory).toList();

    final screenWidth = MediaQuery.of(context).size.width;
    final isTablet = screenWidth >= 600;

    return Scaffold(
      appBar: AppBar(
        leading: widget.onOpenDrawer != null
            ? IconButton(
                icon: const Icon(Icons.menu),
                onPressed: widget.onOpenDrawer,
              )
            : null,
        title: const Text(
          'POS Billing',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
        actions: [
          if (kDebugMode && widget.onInspectDartSource != null)
            IconButton(
              icon: const Icon(Icons.code),
              tooltip: 'Inspect Dart Source',
              onPressed: widget.onInspectDartSource,
            ),
        ],
      ),
      body: Column(
        children: [
          _buildPinnedHeader(categories),
          Expanded(
            child: isTablet
                ? Row(
                    children: [
                      Expanded(
                        flex: 6,
                        child: _buildCatalogList(filteredItems),
                      ),
                      const VerticalDivider(width: 1),
                      Expanded(
                        flex: 4,
                        child: _buildTabletCartPanel(),
                      ),
                    ],
                  )
                : _buildMobileTwoTabBody(filteredItems),
          ),
        ],
      ),
    );
  }

  Widget _buildPinnedHeader(List<String> categories) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      elevation: 0,
      child: Container(
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: Theme.of(context).dividerColor),
          ),
        ),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    focusNode: _searchFocusNode,
                    autofocus: widget.settings.preferUsbScannerFocus,
                    onChanged: (_) => _loadData(),
                    onSubmitted: _handleBarcodeSubmit,
                    decoration: InputDecoration(
                      hintText: 'Search medicine, generic, batch or barcode...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 18),
                              onPressed: () {
                                _searchController.clear();
                                _loadData();
                                if (widget.settings.preferUsbScannerFocus) {
                                  _searchFocusNode.requestFocus();
                                }
                              },
                            )
                          : null,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 44,
                  width: 44,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF0D7A5F),
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onPressed: widget.onOpenBarcodeCamera ??
                        () => _showSnack('Camera scanner ready'),
                    child: const Icon(Icons.qr_code_scanner, size: 22),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: categories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, idx) {
                  final cat = categories[idx];
                  final selected = cat == _selectedCategory;
                  return ChoiceChip(
                    label: Text(cat, style: const TextStyle(fontSize: 12)),
                    selected: selected,
                    visualDensity: VisualDensity.compact,
                    onSelected: (_) => setState(() => _selectedCategory = cat),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMobileTwoTabBody(List<PharmacyItem> filteredItems) {
    return Column(
      children: [
        TabBar(
          controller: _mobileTabController,
          labelColor: const Color(0xFF0D7A5F),
          indicatorColor: const Color(0xFF0D7A5F),
          tabs: [
            const Tab(text: 'Catalog'),
            Tab(text: 'Cart (${_cart.length})'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _mobileTabController,
            children: [
              _buildCatalogList(filteredItems),
              _buildCartScrollableBody(),
            ],
          ),
        ),
        _buildMobileStickyCheckoutBar(),
      ],
    );
  }

  Widget _buildCatalogList(List<PharmacyItem> filteredItems) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (filteredItems.isEmpty) {
      return const Center(child: Text('No matching medicines found.'));
    }

    return ListView.separated(
      padding: const EdgeInsets.all(10),
      itemCount: filteredItems.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, idx) {
        final item = filteredItems[idx];
        final isLowOrOut =
            item.isLowStockWithThreshold(widget.settings.lowStockThreshold);
        final isNearExp =
            item.isExpiringWithinDays(widget.settings.expiryAlertDays);
        return Card(
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(color: Colors.grey.shade300),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => _addToCart(item),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        if (item.genericName.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Builder(
                            builder: (context) {
                              final isGenericActive =
                                  _searchController.text.trim().toLowerCase() ==
                                      item.genericName.trim().toLowerCase();
                              return InkWell(
                                borderRadius: BorderRadius.circular(6),
                                onTap: () {
                                  if (isGenericActive) {
                                    _searchController.clear();
                                  } else {
                                    _selectedCategory = 'All';
                                    _searchController.text = item.genericName;
                                  }
                                  _loadData();
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 7,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isGenericActive
                                        ? const Color(0xFF0D7A5F)
                                        : const Color(0xFF0D7A5F)
                                            .withOpacity(0.08),
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(
                                      color: isGenericActive
                                          ? const Color(0xFF0D7A5F)
                                          : const Color(0xFF0D7A5F)
                                              .withOpacity(0.25),
                                    ),
                                  ),
                                  child: Text(
                                    item.genericName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: isGenericActive
                                          ? Colors.white
                                          : const Color(0xFF0D7A5F),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ],
                        const SizedBox(height: 4),
                        Text(
                          '${item.category} • ${item.batchNumber} • Exp: ${_formatExpiryMmYy(item.expiryDate)} • Stock: ${item.stockQuantity}',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: (isLowOrOut || isNearExp)
                                ? Colors.amber.shade800
                                : Colors.grey.shade600,
                            fontWeight: (isLowOrOut || isNearExp)
                                ? FontWeight.w600
                                : FontWeight.normal,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        _fmt(item.sellingPrice),
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0D7A5F),
                        ),
                      ),
                      Text(
                        'per ${item.unit}',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                        ),
                        onPressed: () => _addToCart(item),
                        icon: const Icon(Icons.add, size: 15),
                        label: const Text('Add', style: TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildCartScrollableBody() {
    final availableModes = PaymentMode.values
        .where((m) => _isManagerOrAdmin || !m.isCreditKhata)
        .toList();
    final cashIn = _parsedCashReceived;
    final change = cashIn != null ? cashIn - _netPayable : 0.0;

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        if (_isManagerOrAdmin)
          DropdownButtonFormField<Party>(
            value: _selectedParty,
            decoration: const InputDecoration(
              labelText: 'Customer / Khata Account',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: _customers
                .map((p) => DropdownMenuItem(
                      value: p,
                      child: Text(
                        '${p.name} (Bal: ${_fmt(p.balance)})',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ))
                .toList(),
            onChanged: (val) => setState(() => _selectedParty = val),
          )
        else
          const Chip(
            avatar: Icon(Icons.person, size: 16),
            label: Text('Walk-in Customer'),
          ),
        const SizedBox(height: 10),
        if (_cart.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 28),
            child: Center(
              child: Text('Cart is empty. Tap an item in Catalog to add.'),
            ),
          )
        else
          ...List.generate(_cart.length, (idx) {
            final line = _cart[idx];
            return Card(
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
                side: BorderSide(color: Colors.grey.shade300),
              ),
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            line.item.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, size: 18),
                          onPressed: () =>
                              setState(() => _cart.removeAt(idx)),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                              minWidth: 32, minHeight: 32),
                          icon: const Icon(Icons.remove_circle_outline,
                              size: 20),
                          onPressed: () => _updateQuantity(idx, -1),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: Text(
                            '${line.quantity}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                              minWidth: 32, minHeight: 32),
                          icon:
                              const Icon(Icons.add_circle_outline, size: 20),
                          onPressed: () => _updateQuantity(idx, 1),
                        ),
                        if (line.item.unitsPerBox > 1)
                          TextButton(
                            style: TextButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 6),
                              minimumSize: Size.zero,
                            ),
                            onPressed: () => _addToCart(
                              line.item,
                              qty: line.item.unitsPerBox,
                            ),
                            child: Text('+${line.item.unitsPerBox} Box'),
                          ),
                        const Spacer(),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                              minWidth: 32, minHeight: 32),
                          icon: const Icon(Icons.discount_outlined, size: 17),
                          tooltip: 'Item Discount',
                          onPressed: () => _promptItemDiscount(idx),
                        ),
                        Flexible(
                          child: Text(
                            _fmt(line.lineTotal),
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          }),
        const SizedBox(height: 8),
        TextField(
          controller: _billDiscountController,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Bill Discount ($_curUnit)',
            border: const OutlineInputBorder(),
            isDense: true,
          ),
          onChanged: (val) =>
              setState(() => _billDiscount = double.tryParse(val) ?? 0.0),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<PaymentMode>(
          value: availableModes.contains(_paymentMode)
              ? _paymentMode
              : PaymentMode.cash,
          decoration: const InputDecoration(
            labelText: 'Payment Mode',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          items: availableModes
              .map((m) => DropdownMenuItem(
                    value: m,
                    child: Text(m.dbValue),
                  ))
              .toList(),
          onChanged: (m) {
            if (m != null) setState(() => _paymentMode = m);
          },
        ),
        if (_paymentMode.requiresReference) ...[
          const SizedBox(height: 10),
          TextField(
            controller: _transactionRefController,
            decoration: InputDecoration(
              labelText: 'Transaction Reference (${_paymentMode.dbValue})',
              border: const OutlineInputBorder(),
              isDense: true,
            ),
          ),
        ],
        if (_paymentMode == PaymentMode.cash) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _cashReceivedController,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Cash Received ($_curUnit)',
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text('Balance / Change',
                      style: TextStyle(fontSize: 11)),
                  Text(
                    _fmt(change),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: change >= 0
                          ? const Color(0xFF0D7A5F)
                          : Colors.red.shade700,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
        const SizedBox(height: 12),
        _metricRow('Subtotal', _fmt(_subtotal)),
        _metricRow('Total Discounts', '-${_fmt(_totalDiscount)}'),
        if (_canViewCostAndProfit) ...[
          _metricRow('Total Cost', _fmt(_totalCost)),
          _metricRow(
            'Net Profit',
            _fmt(_netProfit),
            valueColor:
                _netProfit >= 0 ? Colors.green.shade700 : Colors.red.shade700,
          ),
        ],
        const Divider(),
        _metricRow(
          'Net Payable',
          _fmt(_netPayable),
          isBold: true,
        ),
      ],
    );
  }

  Widget _buildTabletCartPanel() {
    return Column(
      children: [
        Expanded(child: _buildCartScrollableBody()),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(color: Theme.of(context).dividerColor),
            ),
          ),
          child: SizedBox(
            width: double.infinity,
            height: 46,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0D7A5F),
              ),
              onPressed: (_cart.isEmpty || _isCheckingOut)
                  ? null
                  : _completeCheckout,
              icon: const Icon(Icons.print),
              label: Text(_isCheckingOut
                  ? 'Processing...'
                  : 'Complete & Print · ${_fmt(_netPayable)}'),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMobileStickyCheckoutBar() {
    final isCatalogTab = _mobileTabController.index == 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${_cart.length} items · $_totalUnits units',
                style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
              ),
              Text(
                'Net Payable: ${_fmt(_netPayable)}',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF0D7A5F),
            ),
            onPressed: isCatalogTab
                ? () => _mobileTabController.animateTo(1)
                : (_cart.isEmpty || _isCheckingOut)
                    ? null
                    : _completeCheckout,
            child: Text(isCatalogTab ? 'Review Cart →' : 'Complete & Print'),
          ),
        ],
      ),
    );
  }

  Future<void> _promptItemDiscount(int index) async {
    final line = _cart[index];
    final controller = TextEditingController(
      text: line.clampedDiscount.toStringAsFixed(widget.settings.decimalDigits),
    );
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Discount · ${line.item.name}'),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Flat Discount (Max ${_fmt(line.grossTotal)})',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final val = double.tryParse(controller.text) ?? 0.0;
              _updateItemDiscount(index, val);
              Navigator.of(ctx).pop();
            },
            child: const Text('Apply'),
          ),
        ],
      ),
    );
  }

  Widget _metricRow(String label, String value,
      {bool isBold = false, Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: isBold ? 14 : 12,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: isBold ? 15 : 12,
              fontWeight: isBold ? FontWeight.bold : FontWeight.w600,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }
}
