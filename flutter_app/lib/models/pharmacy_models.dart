/// Domain models for Clinix Community Pharmacy POS & Inventory System.
/// Covers items, parties (customers/suppliers), sales, sale_items, and active cart lines.

enum PartyType { customer, supplier }

enum PaymentMode { cash, creditLedger, mobileTransfer }

extension PaymentModeX on PaymentMode {
  String get dbValue {
    switch (this) {
      case PaymentMode.cash:
        return 'Cash';
      case PaymentMode.creditLedger:
        return 'Credit/Party Ledger';
      case PaymentMode.mobileTransfer:
        return 'Mobile Transfer';
    }
  }

  static PaymentMode fromDb(String value) {
    switch (value) {
      case 'Credit/Party Ledger':
        return PaymentMode.creditLedger;
      case 'Mobile Transfer':
        return PaymentMode.mobileTransfer;
      case 'Cash':
      default:
        return PaymentMode.cash;
    }
  }
}

class PharmacyItem {
  final int? id;
  final String name;
  final String barcode;
  final String category;
  final double costPrice;
  final double sellingPrice;
  final int stockQuantity;
  final String unit;
  final String batchNumber;
  final String expiryDate; // ISO yyyy-MM-dd

  const PharmacyItem({
    this.id,
    required this.name,
    required this.barcode,
    required this.category,
    required this.costPrice,
    required this.sellingPrice,
    required this.stockQuantity,
    required this.unit,
    required this.batchNumber,
    required this.expiryDate,
  });

  double get unitMargin => sellingPrice - costPrice;

  bool get isLowStock => stockQuantity <= 10;

  bool get isExpiringSoon {
    final parsed = DateTime.tryParse(expiryDate);
    if (parsed == null) return false;
    return parsed.difference(DateTime.now()).inDays <= 90;
  }

  PharmacyItem copyWith({
    int? id,
    String? name,
    String? barcode,
    String? category,
    double? costPrice,
    double? sellingPrice,
    int? stockQuantity,
    String? unit,
    String? batchNumber,
    String? expiryDate,
  }) {
    return PharmacyItem(
      id: id ?? this.id,
      name: name ?? this.name,
      barcode: barcode ?? this.barcode,
      category: category ?? this.category,
      costPrice: costPrice ?? this.costPrice,
      sellingPrice: sellingPrice ?? this.sellingPrice,
      stockQuantity: stockQuantity ?? this.stockQuantity,
      unit: unit ?? this.unit,
      batchNumber: batchNumber ?? this.batchNumber,
      expiryDate: expiryDate ?? this.expiryDate,
    );
  }

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'name': name,
        'barcode': barcode,
        'category': category,
        'cost_price': costPrice,
        'selling_price': sellingPrice,
        'stock_quantity': stockQuantity,
        'unit': unit,
        'batch_number': batchNumber,
        'expiry_date': expiryDate,
      };

  factory PharmacyItem.fromMap(Map<String, dynamic> map) => PharmacyItem(
        id: map['id'] as int?,
        name: map['name'] as String,
        barcode: (map['barcode'] ?? '') as String,
        category: (map['category'] ?? 'General') as String,
        costPrice: (map['cost_price'] as num).toDouble(),
        sellingPrice: (map['selling_price'] as num).toDouble(),
        stockQuantity: (map['stock_quantity'] as num).toInt(),
        unit: (map['unit'] ?? 'Pack') as String,
        batchNumber: (map['batch_number'] ?? '') as String,
        expiryDate: (map['expiry_date'] ?? '') as String,
      );
}

class Party {
  final int? id;
  final String name;
  final String phone;
  final PartyType type;

  /// Positive balance for customer = To Collect (Receivable).
  /// Positive balance for supplier = To Pay (Payable).
  final double balance;

  const Party({
    this.id,
    required this.name,
    required this.phone,
    required this.type,
    this.balance = 0.0,
  });

  String get balanceLabel =>
      type == PartyType.customer ? 'To Collect' : 'To Pay';

  Party copyWith({
    int? id,
    String? name,
    String? phone,
    PartyType? type,
    double? balance,
  }) {
    return Party(
      id: id ?? this.id,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      type: type ?? this.type,
      balance: balance ?? this.balance,
    );
  }

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'name': name,
        'phone': phone,
        'type': type.name,
        'balance': balance,
      };

  factory Party.fromMap(Map<String, dynamic> map) => Party(
        id: map['id'] as int?,
        name: map['name'] as String,
        phone: (map['phone'] ?? '') as String,
        type: (map['type'] == 'supplier')
            ? PartyType.supplier
            : PartyType.customer,
        balance: (map['balance'] as num?)?.toDouble() ?? 0.0,
      );
}

class CartLine {
  final PharmacyItem item;
  final int quantity;
  final double itemDiscount; // Flat PKR discount applied on this line

  const CartLine({
    required this.item,
    this.quantity = 1,
    this.itemDiscount = 0.0,
  });

  double get grossTotal => item.sellingPrice * quantity;
  double get clampedDiscount =>
      itemDiscount.clamp(0.0, grossTotal).toDouble();
  double get lineTotal => grossTotal - clampedDiscount;
  double get totalCost => item.costPrice * quantity;

  /// Profit before bill-level discount allocation.
  double get lineNetProfit => lineTotal - totalCost;

  CartLine copyWith({
    PharmacyItem? item,
    int? quantity,
    double? itemDiscount,
  }) {
    return CartLine(
      item: item ?? this.item,
      quantity: quantity ?? this.quantity,
      itemDiscount: itemDiscount ?? this.itemDiscount,
    );
  }
}

class SaleRecord {
  final int? id;
  final String invoiceNumber;
  final int? partyId;
  final String partyName;
  final double subtotal;
  final double discountAmount; // item discounts + bill discount
  final double netPayable;
  final double totalCost;
  final double netProfit; // netPayable - totalCost
  final PaymentMode paymentMode;
  final String createdAt;

  const SaleRecord({
    this.id,
    required this.invoiceNumber,
    this.partyId,
    this.partyName = 'Walk-in Customer',
    required this.subtotal,
    required this.discountAmount,
    required this.netPayable,
    required this.totalCost,
    required this.netProfit,
    required this.paymentMode,
    required this.createdAt,
  });

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'invoice_number': invoiceNumber,
        'party_id': partyId,
        'subtotal': subtotal,
        'discount_amount': discountAmount,
        'net_payable': netPayable,
        'total_cost': totalCost,
        'net_profit': netProfit,
        'payment_mode': paymentMode.dbValue,
        'created_at': createdAt,
      };

  factory SaleRecord.fromMap(Map<String, dynamic> map) => SaleRecord(
        id: map['id'] as int?,
        invoiceNumber: map['invoice_number'] as String,
        partyId: map['party_id'] as int?,
        partyName: (map['party_name'] ?? 'Walk-in Customer') as String,
        subtotal: (map['subtotal'] as num).toDouble(),
        discountAmount: (map['discount_amount'] as num).toDouble(),
        netPayable: (map['net_payable'] as num).toDouble(),
        totalCost: (map['total_cost'] as num?)?.toDouble() ?? 0.0,
        netProfit: (map['net_profit'] as num?)?.toDouble() ?? 0.0,
        paymentMode: PaymentModeX.fromDb(map['payment_mode'] as String),
        createdAt: map['created_at'] as String,
      );
}

class SaleItemRecord {
  final int? id;
  final int? saleId;
  final int itemId;
  final String itemName;
  final String batchNumber;
  final int quantity;
  final double unitPrice;
  final double costPrice;
  final double itemDiscount;
  final double lineTotal;

  const SaleItemRecord({
    this.id,
    this.saleId,
    required this.itemId,
    required this.itemName,
    this.batchNumber = '',
    required this.quantity,
    required this.unitPrice,
    required this.costPrice,
    required this.itemDiscount,
    required this.lineTotal,
  });

  Map<String, dynamic> toMap(int persistedSaleId) => {
        if (id != null) 'id': id,
        'sale_id': persistedSaleId,
        'item_id': itemId,
        'item_name': itemName,
        'batch_number': batchNumber,
        'quantity': quantity,
        'unit_price': unitPrice,
        'cost_price': costPrice,
        'item_discount': itemDiscount,
        'line_total': lineTotal,
      };

  factory SaleItemRecord.fromMap(Map<String, dynamic> map) => SaleItemRecord(
        id: map['id'] as int?,
        saleId: map['sale_id'] as int?,
        itemId: (map['item_id'] as num).toInt(),
        itemName: map['item_name'] as String,
        batchNumber: (map['batch_number'] ?? '') as String,
        quantity: (map['quantity'] as num).toInt(),
        unitPrice: (map['unit_price'] as num).toDouble(),
        costPrice: (map['cost_price'] as num).toDouble(),
        itemDiscount: (map['item_discount'] as num).toDouble(),
        lineTotal: (map['line_total'] as num).toDouble(),
      );
}

class PurchaseLine {
  final PharmacyItem item;
  final int quantity;
  final double unitCost;
  final double sellingPrice;
  final String batchNumber;
  final String expiryDate;

  const PurchaseLine({
    required this.item,
    required this.quantity,
    required this.unitCost,
    required this.sellingPrice,
    required this.batchNumber,
    required this.expiryDate,
  });

  double get lineTotal => unitCost * quantity;
}

class PurchaseRecord {
  final int? id;
  final String purchaseNumber;
  final String supplierInvoiceNo;
  final int supplierId;
  final String supplierName;
  final double totalAmount;
  final double paidAmount;
  final double balanceDue;
  final PaymentMode paymentMode;
  final String createdAt;

  const PurchaseRecord({
    this.id,
    required this.purchaseNumber,
    required this.supplierInvoiceNo,
    required this.supplierId,
    this.supplierName = '',
    required this.totalAmount,
    required this.paidAmount,
    required this.balanceDue,
    required this.paymentMode,
    required this.createdAt,
  });

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'purchase_number': purchaseNumber,
        'supplier_invoice_no': supplierInvoiceNo,
        'supplier_id': supplierId,
        'total_amount': totalAmount,
        'paid_amount': paidAmount,
        'balance_due': balanceDue,
        'payment_mode': paymentMode.dbValue,
        'created_at': createdAt,
      };

  factory PurchaseRecord.fromMap(Map<String, dynamic> map) => PurchaseRecord(
        id: map['id'] as int?,
        purchaseNumber: map['purchase_number'] as String,
        supplierInvoiceNo: (map['supplier_invoice_no'] ?? '') as String,
        supplierId: (map['supplier_id'] as num).toInt(),
        supplierName: (map['supplier_name'] ?? '') as String,
        totalAmount: (map['total_amount'] as num).toDouble(),
        paidAmount: (map['paid_amount'] as num).toDouble(),
        balanceDue: (map['balance_due'] as num).toDouble(),
        paymentMode: PaymentModeX.fromDb(map['payment_mode'] as String),
        createdAt: map['created_at'] as String,
      );
}

class PurchaseItemRecord {
  final int? id;
  final int? purchaseId;
  final int itemId;
  final String itemName;
  final String batchNumber;
  final String expiryDate;
  final int quantity;
  final double unitCost;
  final double lineTotal;

  const PurchaseItemRecord({
    this.id,
    this.purchaseId,
    required this.itemId,
    required this.itemName,
    required this.batchNumber,
    required this.expiryDate,
    required this.quantity,
    required this.unitCost,
    required this.lineTotal,
  });

  Map<String, dynamic> toMap(int persistedPurchaseId) => {
        if (id != null) 'id': id,
        'purchase_id': persistedPurchaseId,
        'item_id': itemId,
        'item_name': itemName,
        'batch_number': batchNumber,
        'expiry_date': expiryDate,
        'quantity': quantity,
        'unit_cost': unitCost,
        'line_total': lineTotal,
      };

  factory PurchaseItemRecord.fromMap(Map<String, dynamic> map) =>
      PurchaseItemRecord(
        id: map['id'] as int?,
        purchaseId: map['purchase_id'] as int?,
        itemId: (map['item_id'] as num).toInt(),
        itemName: map['item_name'] as String,
        batchNumber: (map['batch_number'] ?? '') as String,
        expiryDate: (map['expiry_date'] ?? '') as String,
        quantity: (map['quantity'] as num).toInt(),
        unitCost: (map['unit_cost'] as num).toDouble(),
        lineTotal: (map['line_total'] as num).toDouble(),
      );
}
