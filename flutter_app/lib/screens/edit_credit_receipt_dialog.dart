import 'package:flutter/material.dart';

import '../database/db_helper.dart';
import '../models/pharmacy_models.dart';
import '../utils/currency_formatter.dart';

class _DraftEditLine {
  final int itemId;
  final String itemName;
  final String unit;
  final String batchNumber;
  int quantity;
  double unitPrice;
  final double costPrice;
  double itemDiscount;
  final int unitsPerBox;

  _DraftEditLine({
    required this.itemId,
    required this.itemName,
    required this.unit,
    required this.batchNumber,
    required this.quantity,
    required this.unitPrice,
    required this.costPrice,
    required this.itemDiscount,
    required this.unitsPerBox,
  });

  double get grossTotal => unitPrice * quantity;
  double get clampedDiscount => itemDiscount.clamp(0.0, grossTotal).toDouble();
  double get lineTotal => grossTotal - clampedDiscount;
}

class EditCreditReceiptScreen extends StatefulWidget {
  final SaleRecord sale;
  final List<SaleItemRecord> initialSaleItems;
  final PharmacySettings settings;
  final PharmacyUser currentUser;

  const EditCreditReceiptScreen({
    super.key,
    required this.sale,
    required this.initialSaleItems,
    required this.settings,
    required this.currentUser,
  });

  @override
  State<EditCreditReceiptScreen> createState() =>
      _EditCreditReceiptScreenState();
}

class _EditCreditReceiptScreenState extends State<EditCreditReceiptScreen> {
  static const List<String> _reasonPresets = [
    'Accidental discount entry',
    'Quantity correction',
    'Price / unit rate adjustment',
    'Wrong item correction',
    'Credit balance adjustment',
  ];

  late final List<_DraftEditLine> _lines;
  late final Map<int, int> _originalQtyByItem;
  final TextEditingController _billDiscountCtrl = TextEditingController();
  final TextEditingController _refCtrl = TextEditingController();
  final TextEditingController _reasonCtrl = TextEditingController();

  List<PharmacyItem> _inventory = [];
  int? _selectedAddItemId;
  bool _loadingInventory = true;
  bool _saving = false;
  String? _errorMsg;

  bool get _canEdit => widget.currentUser.role.canViewProfitAndCost;

  String _fmt(double val) => CurrencyFormatter.format(val, widget.settings);
  String get _curUnit => CurrencyFormatter.unitLabel(widget.settings);

  @override
  void initState() {
    super.initState();
    _originalQtyByItem = <int, int>{};
    double itemDiscSum = 0.0;
    for (final l in widget.initialSaleItems) {
      _originalQtyByItem[l.itemId] =
          (_originalQtyByItem[l.itemId] ?? 0) + l.quantity;
      itemDiscSum += l.itemDiscount;
    }

    _lines = widget.initialSaleItems
        .map(
          (l) => _DraftEditLine(
            itemId: l.itemId,
            itemName: l.itemName,
            unit: l.unit,
            batchNumber: l.batchNumber,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            costPrice: l.costPrice,
            itemDiscount: l.itemDiscount,
            unitsPerBox: 1,
          ),
        )
        .toList();

    final initialBillDisc = (widget.sale.discountAmount - itemDiscSum)
        .clamp(0.0, widget.sale.subtotal)
        .toDouble();
    _billDiscountCtrl.text =
        initialBillDisc.toStringAsFixed(widget.settings.decimalDigits);
    _refCtrl.text = widget.sale.transactionReference ?? '';
    _loadInventory();
  }

  @override
  void dispose() {
    _billDiscountCtrl.dispose();
    _refCtrl.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadInventory() async {
    final items = await DatabaseHelper.instance.getItems();
    if (!mounted) return;
    setState(() {
      _inventory = items;
      _loadingInventory = false;
      for (int i = 0; i < _lines.length; i++) {
        final match = items.where((it) => it.id == _lines[i].itemId);
        if (match.isNotEmpty) {
          final inv = match.first;
          _lines[i] = _DraftEditLine(
            itemId: _lines[i].itemId,
            itemName: _lines[i].itemName,
            unit: _lines[i].unit.isEmpty ? inv.unit : _lines[i].unit,
            batchNumber: _lines[i].batchNumber.isEmpty
                ? inv.batchNumber
                : _lines[i].batchNumber,
            quantity: _lines[i].quantity,
            unitPrice: _lines[i].unitPrice,
            costPrice: _lines[i].costPrice,
            itemDiscount: _lines[i].itemDiscount,
            unitsPerBox: inv.unitsPerBox,
          );
        }
      }
    });
  }

  double _round2(double v) => double.parse(v.toStringAsFixed(2));

  double get _subtotal =>
      _round2(_lines.fold(0.0, (s, l) => s + l.grossTotal));

  double get _itemDiscountTotal =>
      _round2(_lines.fold(0.0, (s, l) => s + l.clampedDiscount));

  double get _afterItemDiscount =>
      (_subtotal - _itemDiscountTotal) < 0
          ? 0.0
          : _round2(_subtotal - _itemDiscountTotal);

  double get _safeBillDiscount {
    final raw = double.tryParse(_billDiscountCtrl.text.trim()) ?? 0.0;
    final nonNeg = raw < 0 ? 0.0 : raw;
    return _round2(nonNeg.clamp(0.0, _afterItemDiscount).toDouble());
  }

  double get _newNetPayable => _round2(_afterItemDiscount - _safeBillDiscount);

  double get _creditDelta => _round2(_newNetPayable - widget.sale.netPayable);

  List<({String name, int delta, String unit})> get _stockDeltas {
    final newQty = <int, int>{};
    for (final l in _lines) {
      newQty[l.itemId] = (newQty[l.itemId] ?? 0) + l.quantity;
    }
    final ids = <int>{..._originalQtyByItem.keys, ...newQty.keys};
    final out = <({String name, int delta, String unit})>[];
    for (final id in ids) {
      final diff = (newQty[id] ?? 0) - (_originalQtyByItem[id] ?? 0);
      if (diff == 0) continue;
      final inv = _inventory.where((i) => i.id == id);
      final orig = widget.initialSaleItems.where((i) => i.itemId == id);
      final name = inv.isNotEmpty
          ? inv.first.name
          : orig.isNotEmpty
              ? orig.first.itemName
              : 'Item #$id';
      final unit = inv.isNotEmpty
          ? inv.first.unit
          : orig.isNotEmpty
              ? orig.first.unit
              : 'Unit';
      out.add((name: name, delta: diff, unit: unit));
    }
    return out;
  }

  void _addSelectedMedicine() {
    final itemId = _selectedAddItemId;
    if (itemId == null) return;
    final matches = _inventory.where((i) => i.id == itemId);
    if (matches.isEmpty) return;
    final inv = matches.first;
    setState(() {
      _errorMsg = null;
      final existingIdx = _lines.indexWhere((l) => l.itemId == itemId);
      if (existingIdx >= 0) {
        _lines[existingIdx].quantity += 1;
      } else {
        _lines.add(
          _DraftEditLine(
            itemId: itemId,
            itemName: inv.name,
            unit: inv.unit,
            batchNumber: inv.batchNumber,
            quantity: 1,
            unitPrice: inv.sellingPrice,
            costPrice: inv.costPrice,
            itemDiscount: 0.0,
            unitsPerBox: inv.unitsPerBox,
          ),
        );
      }
      _selectedAddItemId = null;
    });
  }

  Future<void> _saveChanges() async {
    if (!_canEdit) {
      setState(() {
        _errorMsg =
            'Only an Admin or Manager account can authorize audited receipt edits.';
      });
      return;
    }
    if (widget.sale.id == null) {
      setState(() => _errorMsg = 'Missing receipt ID.');
      return;
    }
    if (_lines.isEmpty) {
      setState(
          () => _errorMsg = 'At least one medicine line must stay on the bill.');
      return;
    }
    final cleanReason = _reasonCtrl.text.trim();
    if (cleanReason.length < 3) {
      setState(() {
        _errorMsg =
            'Please enter an Audit / Correction Reason (at least 3 characters).';
      });
      return;
    }

    setState(() {
      _saving = true;
      _errorMsg = null;
    });

    try {
      final updatedSale = await DatabaseHelper.instance.editCreditSale(
        saleId: widget.sale.id!,
        editedLines: _lines
            .map(
              (l) => EditCreditReceiptLineInput(
                itemId: l.itemId,
                itemName: l.itemName,
                unit: l.unit,
                batchNumber: l.batchNumber,
                quantity: l.quantity < 1 ? 1 : l.quantity,
                unitPrice: l.unitPrice < 0 ? 0.0 : l.unitPrice,
                costPrice: l.costPrice < 0 ? 0.0 : l.costPrice,
                itemDiscount: l.itemDiscount < 0 ? 0.0 : l.itemDiscount,
              ),
            )
            .toList(),
        billDiscount: _safeBillDiscount,
        reason: cleanReason,
        editedBy: widget.currentUser.username,
        editedByName: widget.currentUser.name,
        editedByRole: widget.currentUser.role,
        transactionReference: _refCtrl.text.trim(),
        settings: widget.settings,
      );
      if (!mounted) return;
      Navigator.of(context).pop(updatedSale);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errorMsg = e.toString().replaceFirst('Bad state: ', '').replaceFirst('Invalid argument(s): ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final deltas = _stockDeltas;
    final dateText = CurrencyFormatter.formatDate(
      widget.sale.createdAt,
      widget.settings,
      includeTime: true,
    );

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Edit Credit Receipt · ${widget.sale.invoiceNumber}',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
            ),
            Text(
              '${widget.sale.partyName} · $dateText',
              style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: Colors.grey.shade200)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'New Credit Total: ${_fmt(_newNetPayable)}',
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0D7A5F),
                      ),
                    ),
                    Text(
                      'Adjustment: ${_creditDelta >= 0 ? '+' : ''}${_fmt(_creditDelta)}',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: _creditDelta == 0
                            ? Colors.grey.shade600
                            : const Color(0xFFB45309),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              FilledButton.icon(
                onPressed: (!_canEdit || _saving) ? null : _saveChanges,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF0D7A5F),
                ),
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.verified_user_outlined, size: 18),
                label: Text(_saving ? 'Reconciling...' : 'Save & Reconcile'),
              ),
            ],
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (!_canEdit)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.amber.shade300),
              ),
              child: Row(
                children: [
                  Icon(Icons.lock_outline, color: Colors.amber.shade900),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Editing Locked: Active role (${widget.currentUser.role.label}) cannot modify credit receipts. Sign in as Admin or Manager.',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: Colors.amber.shade900,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          if (_errorMsg != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.red.shade300),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline, color: Colors.red.shade700),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _errorMsg!,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: Colors.red.shade800,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Add Medicine Line
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
                  const Text(
                    'Add Medicine Line (Optional)',
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  if (_loadingInventory)
                    const LinearProgressIndicator()
                  else
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            value: _selectedAddItemId,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              hintText: 'Select medicine from catalog',
                              border: OutlineInputBorder(),
                              isDense: true,
                            ),
                            items: _inventory
                                .where((it) => it.id != null)
                                .map(
                                  (it) => DropdownMenuItem<int>(
                                    value: it.id,
                                    child: Text(
                                      '${it.name} (Stock: ${it.stockQuantity} · ${_fmt(it.sellingPrice)})',
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12.5),
                                    ),
                                  ),
                                )
                                .toList(),
                            onChanged: (v) =>
                                setState(() => _selectedAddItemId = v),
                          ),
                        ),
                        const SizedBox(width: 8),
                        FilledButton.icon(
                          onPressed: _selectedAddItemId == null
                              ? null
                              : _addSelectedMedicine,
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF0D7A5F),
                          ),
                          icon: const Icon(Icons.add, size: 18),
                          label: const Text('Add'),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Line Items
          const Text(
            'Billed Medicine Lines',
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          ...List.generate(_lines.length, (idx) {
            final line = _lines[idx];
            final invMatch = _inventory.where((i) => i.id == line.itemId);
            final currentStock =
                invMatch.isNotEmpty ? invMatch.first.stockQuantity : 0;
            final origQty = _originalQtyByItem[line.itemId] ?? 0;
            final maxQty = currentStock + origQty;

            return Card(
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 10),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: Colors.grey.shade200),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                line.itemName,
                                style: const TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(
                                'Batch ${line.batchNumber.isEmpty ? 'N/A' : line.batchNumber} · Max editable qty: $maxQty ${line.unit}',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'Remove line',
                          icon: Icon(
                            Icons.delete_outline,
                            color: _lines.length <= 1
                                ? Colors.grey.shade400
                                : Colors.red.shade600,
                          ),
                          onPressed: _lines.length <= 1
                              ? null
                              : () {
                                  setState(() {
                                    _lines.removeAt(idx);
                                    _errorMsg = null;
                                  });
                                },
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        // Qty stepper
                        Container(
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade300),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                visualDensity: VisualDensity.compact,
                                icon: const Icon(Icons.remove, size: 17),
                                onPressed: line.quantity <= 1
                                    ? null
                                    : () => setState(() {
                                          line.quantity -= 1;
                                          _errorMsg = null;
                                        }),
                              ),
                              Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 6),
                                child: Text(
                                  '${line.quantity}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13.5,
                                  ),
                                ),
                              ),
                              IconButton(
                                visualDensity: VisualDensity.compact,
                                icon: const Icon(Icons.add, size: 17),
                                onPressed: (maxQty > 0 && line.quantity >= maxQty)
                                    ? null
                                    : () => setState(() {
                                          line.quantity += 1;
                                          _errorMsg = null;
                                        }),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextFormField(
                            key: ValueKey('rate-${line.itemId}-$idx'),
                            initialValue: line.unitPrice
                                .toStringAsFixed(widget.settings.decimalDigits),
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true),
                            decoration: InputDecoration(
                              labelText: 'Rate ($_curUnit)',
                              border: const OutlineInputBorder(),
                              isDense: true,
                            ),
                            onChanged: (v) {
                              setState(() {
                                final parsed = double.tryParse(v.trim());
                                if (parsed != null && parsed >= 0) {
                                  line.unitPrice = parsed;
                                }
                              });
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextFormField(
                            key: ValueKey('disc-${line.itemId}-$idx'),
                            initialValue: line.itemDiscount
                                .toStringAsFixed(widget.settings.decimalDigits),
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true),
                            decoration: InputDecoration(
                              labelText: 'Disc ($_curUnit)',
                              border: const OutlineInputBorder(),
                              isDense: true,
                            ),
                            onChanged: (v) {
                              setState(() {
                                final parsed = double.tryParse(v.trim()) ?? 0.0;
                                line.itemDiscount = parsed < 0 ? 0.0 : parsed;
                              });
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        'Line Total: ${_fmt(line.lineTotal)}',
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0D7A5F),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),

          const SizedBox(height: 8),

          // Bill-Level Discount & Reference
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _billDiscountCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Bill Discount ($_curUnit)',
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: _refCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Reference Note (Optional)',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Reconciliation & Stock Delta Preview
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF0D7A5F).withOpacity(0.06),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: const Color(0xFF0D7A5F).withOpacity(0.25),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Khata & Inventory Reconciliation Preview',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0D7A5F),
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Previous Net Credit:',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                    ),
                    Text(
                      _fmt(widget.sale.netPayable),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'New Net Credit:',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                    ),
                    Text(
                      _fmt(_newNetPayable),
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0D7A5F),
                      ),
                    ),
                  ],
                ),
                if (deltas.isNotEmpty) ...[
                  const Divider(height: 14),
                  const Text(
                    'Inventory Stock Auto-Adjustments:',
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  ...deltas.map(
                    (d) => Text(
                      d.delta > 0
                          ? '• ${d.name}: -${d.delta} ${d.unit} deducted'
                          : '• ${d.name}: +${d.delta.abs()} ${d.unit} restored',
                      style: TextStyle(
                        fontSize: 11.5,
                        color: d.delta > 0
                            ? const Color(0xFFB45309)
                            : const Color(0xFF0D7A5F),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Mandatory Audit / Correction Reason
          const Text(
            'Audit / Correction Reason *',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _reasonPresets
                .map(
                  (preset) => ActionChip(
                    label: Text(preset, style: const TextStyle(fontSize: 11.5)),
                    onPressed: () {
                      setState(() {
                        _reasonCtrl.text = preset;
                        _errorMsg = null;
                      });
                    },
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _reasonCtrl,
            maxLines: 2,
            decoration: const InputDecoration(
              hintText:
                  'Explain why this credit receipt is being corrected (required for audit log)...',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) {
              if (_errorMsg != null) setState(() => _errorMsg = null);
            },
          ),

          if (widget.sale.auditLogs.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Text(
              'Previous Audit History',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            ...widget.sale.auditLogs.map(
              (log) => Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${log.editedByName} (${log.editedByRole}) · ${CurrencyFormatter.formatDate(log.editedAt, widget.settings, includeTime: true)}',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'Reason: ${log.reason}',
                      style: const TextStyle(fontSize: 11.5),
                    ),
                    Text(
                      log.summary,
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
