import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../services/pdf_invoice_service.dart';
import '../services/printer_service.dart';

/// Point of Sale & Real-time Cart Management Screen for Clinix Community Pharmacy.
/// Responsive across mobile (bottom cart sheet / tab) and tablet/desktop (split catalog + cart).
class PosScreen extends StatefulWidget {
  const PosScreen({super.key});

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _billDiscountController =
      TextEditingController(text: '0');

  List<PharmacyItem> _items = [];
  List<Party> _customers = [];
  final List<CartLine> _cart = [];

  String _selectedCategory = 'All';
  PaymentMode _paymentMode = PaymentMode.cash;
  Party? _selectedParty;
  double _billDiscount = 0.0;
  bool _isLoading = true;
  bool _isCheckingOut = false;

  final _currency = NumberFormat('#,##0.00');

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _billDiscountController.dispose();
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
        _selectedParty ??= customers.isNotEmpty ? customers.first : null;
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
  }

  void _addToCart(PharmacyItem item) {
    if (item.stockQuantity <= 0) {
      _showSnack('${item.name} is out of stock.', isError: true);
      return;
    }

    final idx = _cart.indexWhere((line) => line.item.id == item.id);
    setState(() {
      if (idx >= 0) {
        final current = _cart[idx];
        if (current.quantity >= item.stockQuantity) {
          _showSnack('Maximum available stock (${item.stockQuantity}) reached.',
              isError: true);
          return;
        }
        _cart[idx] = current.copyWith(quantity: current.quantity + 1);
      } else {
        _cart.add(CartLine(item: item, quantity: 1));
      }
    });
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

  Future<void> _completeCheckout() async {
    if (_cart.isEmpty) {
      _showSnack('Add at least one medicine to the cart.', isError: true);
      return;
    }

    setState(() => _isCheckingOut = true);
    try {
      final completedSale = await DatabaseHelper.instance.completeSale(
        cartLines: List<CartLine>.from(_cart),
        billDiscount: _effectiveBillDiscount,
        paymentMode: _paymentMode,
        party: _selectedParty,
      );

      final saleItems =
          await DatabaseHelper.instance.getSaleItems(completedSale.id!);

      if (!mounted) return;
      setState(() {
        _cart.clear();
        _billDiscount = 0.0;
        _billDiscountController.text = '0';
        _isCheckingOut = false;
      });

      await _loadData();
      if (!mounted) return;
      await _showPostSaleSheet(completedSale, saleItems);
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
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Sale Completed · ${sale.invoiceNumber}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Party: ${sale.partyName}'),
            Text('Payment Mode: ${sale.paymentMode.dbValue}'),
            Text('Subtotal: PKR ${_currency.format(sale.subtotal)}'),
            if (sale.discountAmount > 0)
              Text(
                'Discount: -PKR ${_currency.format(sale.discountAmount)}',
                style: TextStyle(color: Colors.amber[800]),
              ),
            const SizedBox(height: 6),
            Text(
              'Net Payable: PKR ${_currency.format(sale.netPayable)}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close'),
          ),
          OutlinedButton.icon(
            onPressed: () async {
              try {
                await PdfInvoiceService.instance
                    .shareInvoicePdf(sale: sale, items: items);
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
                await PrinterService.instance
                    .printReceipt(sale: sale, items: items);
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
    );
  }

  void _showSnack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red.shade700 : const Color(0xFF0D7A5F),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final categories = <String>{'All', ..._items.map((e) => e.category)}.toList();
    final filteredItems = _selectedCategory == 'All'
        ? _items
        : _items.where((i) => i.category == _selectedCategory).toList();

    final isWide = MediaQuery.of(context).size.width >= 900;

    return Scaffold(
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Clinix Community Pharmacy',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            Text('17 KM Ferozepur Road, Lahore · POS Billing',
                style: TextStyle(fontSize: 11, color: Colors.black54)),
          ],
        ),
      ),
      body: isWide
          ? Row(
              children: [
                Expanded(
                  flex: 6,
                  child: _buildCatalogPane(categories, filteredItems),
                ),
                const VerticalDivider(width: 1),
                Expanded(
                  flex: 4,
                  child: _buildCartPane(),
                ),
              ],
            )
          : Column(
              children: [
                Expanded(child: _buildCatalogPane(categories, filteredItems)),
                _buildMobileCartBar(),
              ],
            ),
    );
  }

  Widget _buildCatalogPane(
      List<String> categories, List<PharmacyItem> filteredItems) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchController,
            onChanged: (_) => _loadData(),
            onSubmitted: _handleBarcodeSubmit,
            decoration: InputDecoration(
              hintText: 'Scan barcode or search medicine name...',
              prefixIcon: const Icon(Icons.qr_code_scanner),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        _loadData();
                      },
                    )
                  : null,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              isDense: true,
            ),
          ),
        ),
        SizedBox(
          height: 40,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: categories.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, idx) {
              final cat = categories[idx];
              final selected = cat == _selectedCategory;
              return ChoiceChip(
                label: Text(cat),
                selected: selected,
                onSelected: (_) => setState(() => _selectedCategory = cat),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : filteredItems.isEmpty
                  ? const Center(child: Text('No matching medicines found.'))
                  : GridView.builder(
                      padding: const EdgeInsets.all(12),
                      gridDelegate:
                          const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 230,
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 1.18,
                      ),
                      itemCount: filteredItems.length,
                      itemBuilder: (_, idx) {
                        final item = filteredItems[idx];
                        return Card(
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                            side: BorderSide(color: Colors.grey.shade300),
                          ),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(10),
                            onTap: () => _addToCart(item),
                            child: Padding(
                              padding: const EdgeInsets.all(10),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.name,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 13),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${item.category} · ${item.batchNumber}',
                                    style: TextStyle(
                                        fontSize: 11,
                                        color: Colors.grey.shade600),
                                  ),
                                  const Spacer(),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        'PKR ${_currency.format(item.sellingPrice)}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF0D7A5F),
                                        ),
                                      ),
                                      Text(
                                        '${item.stockQuantity} ${item.unit}',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: item.isLowStock
                                              ? Colors.red.shade700
                                              : Colors.grey.shade700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
        ),
      ],
    );
  }

  Widget _buildCartPane() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: DropdownButtonFormField<Party>(
            value: _selectedParty,
            decoration: const InputDecoration(
              labelText: 'Customer / Party',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: _customers
                .map((p) => DropdownMenuItem(
                      value: p,
                      child: Text('${p.name} (Bal: ${p.balance.toStringAsFixed(0)})'),
                    ))
                .toList(),
            onChanged: (val) => setState(() => _selectedParty = val),
          ),
        ),
        Expanded(
          child: _cart.isEmpty
              ? const Center(child: Text('Cart is empty. Tap an item to bill.'))
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemCount: _cart.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, idx) {
                    final line = _cart[idx];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(line.item.name,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        'Rate: ${line.item.sellingPrice.toStringAsFixed(0)} · Disc: -${line.clampedDiscount.toStringAsFixed(0)}',
                        style: const TextStyle(fontSize: 11),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.percent, size: 18),
                            tooltip: 'Item Discount',
                            onPressed: () => _promptItemDiscount(idx),
                          ),
                          IconButton(
                            icon: const Icon(Icons.remove_circle_outline, size: 20),
                            onPressed: () => _updateQuantity(idx, -1),
                          ),
                          Text('${line.quantity}',
                              style: const TextStyle(fontWeight: FontWeight.bold)),
                          IconButton(
                            icon: const Icon(Icons.add_circle_outline, size: 20),
                            onPressed: () => _updateQuantity(idx, 1),
                          ),
                          SizedBox(
                            width: 68,
                            child: Text(
                              _currency.format(line.lineTotal),
                              textAlign: TextAlign.right,
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.grey.shade50,
            border: Border(top: BorderSide(color: Colors.grey.shade300)),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _billDiscountController,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Bill Discount (PKR)',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      onChanged: (val) {
                        setState(() {
                          _billDiscount = double.tryParse(val) ?? 0.0;
                        });
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<PaymentMode>(
                      value: _paymentMode,
                      decoration: const InputDecoration(
                        labelText: 'Payment Mode',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      items: PaymentMode.values
                          .map((m) => DropdownMenuItem(
                                value: m,
                                child: Text(m.dbValue, style: const TextStyle(fontSize: 12)),
                              ))
                          .toList(),
                      onChanged: (m) {
                        if (m != null) setState(() => _paymentMode = m);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _metricRow('Subtotal', 'PKR ${_currency.format(_subtotal)}'),
              _metricRow('Total Discounts', '-PKR ${_currency.format(_totalDiscount)}'),
              _metricRow(
                'Net Profit (after discounts)',
                'PKR ${_currency.format(_netProfit)}',
                valueColor: _netProfit >= 0 ? Colors.green.shade700 : Colors.red.shade700,
              ),
              const Divider(),
              _metricRow(
                'Net Payable',
                'PKR ${_currency.format(_netPayable)}',
                isBold: true,
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                height: 46,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF0D7A5F),
                  ),
                  onPressed: _isCheckingOut ? null : _completeCheckout,
                  child: _isCheckingOut
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text('Complete Sale & Generate Bill'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildMobileCartBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey.shade300)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${_cart.length} items · Profit PKR ${_currency.format(_netProfit)}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade700)),
              Text('PKR ${_currency.format(_netPayable)}',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ],
          ),
          FilledButton(
            onPressed: _cart.isEmpty
                ? null
                : () {
                    showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => SizedBox(
                        height: MediaQuery.of(context).size.height * 0.82,
                        child: _buildCartPane(),
                      ),
                    );
                  },
            child: const Text('Review Cart'),
          ),
        ],
      ),
    );
  }

  Future<void> _promptItemDiscount(int index) async {
    final line = _cart[index];
    final controller =
        TextEditingController(text: line.clampedDiscount.toStringAsFixed(0));
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Discount · ${line.item.name}'),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Flat Discount (Max PKR ${line.grossTotal.toStringAsFixed(0)})',
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
              fontSize: isBold ? 15 : 12,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: isBold ? 16 : 12,
              fontWeight: isBold ? FontWeight.bold : FontWeight.w600,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }
}
