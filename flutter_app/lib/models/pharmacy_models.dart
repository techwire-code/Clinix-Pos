/// Domain models for Clinix Community Pharmacy POS & Inventory System.
/// Covers items, parties (customers/suppliers), sales, sale_items, and active cart lines.

enum PartyType { customer, supplier }

enum UserRole { admin, manager, cashier, salesStaff }

extension UserRoleX on UserRole {
  bool get canViewProfitAndCost =>
      this == UserRole.admin || this == UserRole.manager;

  String get label {
    switch (this) {
      case UserRole.admin:
        return 'Admin';
      case UserRole.manager:
        return 'Manager';
      case UserRole.cashier:
        return 'Cashier';
      case UserRole.salesStaff:
        return 'Sales Staff';
    }
  }

  String get dbValue => name;

  static UserRole fromDb(String? value) {
    final normalized = value?.trim().toLowerCase() ?? '';
    switch (normalized) {
      case 'manager':
        return UserRole.manager;
      case 'cashier':
        return UserRole.cashier;
      case 'salesstaff':
      case 'sales staff':
      case 'sales':
        return UserRole.salesStaff;
      case 'admin':
      default:
        return UserRole.admin;
    }
  }
}

enum PaymentMode {
  cash,
  card,
  jazzCashEasyPaisa,
  bankTransfer,
  creditKhata,
}

extension PaymentModeX on PaymentMode {
  String get dbValue {
    switch (this) {
      case PaymentMode.cash:
        return 'Cash';
      case PaymentMode.card:
        return 'Card';
      case PaymentMode.jazzCashEasyPaisa:
        return 'JazzCash / EasyPaisa';
      case PaymentMode.bankTransfer:
        return 'Bank Transfer';
      case PaymentMode.creditKhata:
        return 'Credit / Khata';
    }
  }

  bool get requiresReference =>
      this == PaymentMode.card ||
      this == PaymentMode.jazzCashEasyPaisa ||
      this == PaymentMode.bankTransfer;

  bool get isCreditKhata => this == PaymentMode.creditKhata;

  static PaymentMode fromDb(String value) {
    switch (value) {
      case 'Card':
        return PaymentMode.card;
      case 'JazzCash / EasyPaisa':
      case 'Mobile Transfer':
        return PaymentMode.jazzCashEasyPaisa;
      case 'Bank Transfer':
        return PaymentMode.bankTransfer;
      case 'Credit / Khata':
      case 'Credit/Party Ledger':
        return PaymentMode.creditKhata;
      case 'Cash':
      default:
        return PaymentMode.cash;
    }
  }
}

class PharmacyItem {
  final int? id;
  final String name;
  final String genericName;
  final String barcode;
  final String category;
  final int unitsPerBox;
  final double boxCostPrice;
  final double boxSellingPrice;
  final double costPrice;
  final double sellingPrice;
  final int stockQuantity;
  final String unit;
  final String batchNumber;
  final String expiryDate; // ISO yyyy-MM-dd

  const PharmacyItem({
    this.id,
    required this.name,
    this.genericName = '',
    required this.barcode,
    required this.category,
    this.unitsPerBox = 1,
    this.boxCostPrice = 0.0,
    this.boxSellingPrice = 0.0,
    required this.costPrice,
    required this.sellingPrice,
    required this.stockQuantity,
    required this.unit,
    required this.batchNumber,
    required this.expiryDate,
  });

  static double calculateUnitPrice(double boxPrice, int unitsPerBox) {
    final safeUnits = unitsPerBox < 1 ? 1 : unitsPerBox;
    final raw = (boxPrice < 0 ? 0.0 : boxPrice) / safeUnits;
    return (raw * 100).roundToDouble() / 100;
  }

  double get unitMargin => sellingPrice - costPrice;

  bool get isLowStock => stockQuantity <= 10;

  bool isLowStockWithThreshold(int threshold) =>
      stockQuantity < (threshold < 1 ? 1 : threshold);

  bool get isExpiringSoon => isExpiringWithinDays(90);

  bool isExpiringWithinDays(int windowDays) {
    final parsed = DateTime.tryParse(expiryDate);
    if (parsed == null) return false;
    final safeDays = windowDays < 1 ? 1 : windowDays;
    return parsed.difference(DateTime.now()).inDays <= safeDays;
  }

  PharmacyItem copyWith({
    int? id,
    String? name,
    String? genericName,
    String? barcode,
    String? category,
    int? unitsPerBox,
    double? boxCostPrice,
    double? boxSellingPrice,
    double? costPrice,
    double? sellingPrice,
    int? stockQuantity,
    String? unit,
    String? batchNumber,
    String? expiryDate,
  }) {
    final nextUnits = unitsPerBox ?? this.unitsPerBox;
    final nextBoxCost = boxCostPrice ?? this.boxCostPrice;
    final nextBoxSelling = boxSellingPrice ?? this.boxSellingPrice;
    return PharmacyItem(
      id: id ?? this.id,
      name: name ?? this.name,
      genericName: genericName ?? this.genericName,
      barcode: barcode ?? this.barcode,
      category: category ?? this.category,
      unitsPerBox: nextUnits,
      boxCostPrice: nextBoxCost,
      boxSellingPrice: nextBoxSelling,
      costPrice: costPrice ?? calculateUnitPrice(nextBoxCost, nextUnits),
      sellingPrice:
          sellingPrice ?? calculateUnitPrice(nextBoxSelling, nextUnits),
      stockQuantity: stockQuantity ?? this.stockQuantity,
      unit: unit ?? this.unit,
      batchNumber: batchNumber ?? this.batchNumber,
      expiryDate: expiryDate ?? this.expiryDate,
    );
  }

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'name': name,
        'generic_name': genericName,
        'barcode': barcode,
        'category': category,
        'units_per_box': unitsPerBox,
        'box_cost_price': boxCostPrice,
        'box_selling_price': boxSellingPrice,
        'cost_price': costPrice,
        'selling_price': sellingPrice,
        'stock_quantity': stockQuantity,
        'unit': unit,
        'batch_number': batchNumber,
        'expiry_date': expiryDate,
      };

  factory PharmacyItem.fromMap(Map<String, dynamic> map) {
    final units = ((map['units_per_box'] as num?)?.toInt() ?? 1);
    final safeUnits = units < 1 ? 1 : units;
    final unitCost = (map['cost_price'] as num).toDouble();
    final unitSelling = (map['selling_price'] as num).toDouble();
    final boxCost = (map['box_cost_price'] as num?)?.toDouble() ??
        (unitCost * safeUnits);
    final boxSelling = (map['box_selling_price'] as num?)?.toDouble() ??
        (unitSelling * safeUnits);

    return PharmacyItem(
      id: map['id'] as int?,
      name: map['name'] as String,
      genericName: (map['generic_name'] ?? '') as String,
      barcode: (map['barcode'] ?? '') as String,
      category: (map['category'] ?? 'General') as String,
      unitsPerBox: safeUnits,
      boxCostPrice: boxCost,
      boxSellingPrice: boxSelling,
      costPrice: calculateUnitPrice(boxCost, safeUnits),
      sellingPrice: calculateUnitPrice(boxSelling, safeUnits),
      stockQuantity: (map['stock_quantity'] as num).toInt(),
      unit: (map['unit'] ?? 'Unit') as String,
      batchNumber: (map['batch_number'] ?? '') as String,
      expiryDate: (map['expiry_date'] ?? '') as String,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is PharmacyItem &&
        (id != null && other.id != null
            ? id == other.id
            : name == other.name &&
                barcode == other.barcode &&
                batchNumber == other.batchNumber);
  }

  @override
  int get hashCode =>
      id != null ? id.hashCode : Object.hash(name, barcode, batchNumber);
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

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Party &&
        (id != null && other.id != null
            ? id == other.id
            : name == other.name && phone == other.phone && type == other.type);
  }

  @override
  int get hashCode =>
      id != null ? id.hashCode : Object.hash(name, phone, type);
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

class SaleAuditLogEntry {
  final int? id;
  final int saleId;
  final String editedAt;
  final String editedBy;
  final String editedByName;
  final String editedByRole;
  final String reason;
  final double previousNetPayable;
  final double newNetPayable;
  final double previousDiscountAmount;
  final double newDiscountAmount;
  final String summary;

  const SaleAuditLogEntry({
    this.id,
    required this.saleId,
    required this.editedAt,
    required this.editedBy,
    required this.editedByName,
    required this.editedByRole,
    required this.reason,
    required this.previousNetPayable,
    required this.newNetPayable,
    required this.previousDiscountAmount,
    required this.newDiscountAmount,
    required this.summary,
  });

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'sale_id': saleId,
        'edited_at': editedAt,
        'edited_by': editedBy,
        'edited_by_name': editedByName,
        'edited_by_role': editedByRole,
        'reason': reason,
        'previous_net_payable': previousNetPayable,
        'new_net_payable': newNetPayable,
        'previous_discount_amount': previousDiscountAmount,
        'new_discount_amount': newDiscountAmount,
        'summary': summary,
      };

  factory SaleAuditLogEntry.fromMap(Map<String, dynamic> map) =>
      SaleAuditLogEntry(
        id: (map['id'] as num?)?.toInt(),
        saleId: (map['sale_id'] as num).toInt(),
        editedAt: (map['edited_at'] as String?) ?? '',
        editedBy: (map['edited_by'] as String?) ?? '',
        editedByName: (map['edited_by_name'] as String?) ?? '',
        editedByRole: (map['edited_by_role'] as String?) ?? '',
        reason: (map['reason'] as String?) ?? '',
        previousNetPayable:
            (map['previous_net_payable'] as num?)?.toDouble() ?? 0.0,
        newNetPayable: (map['new_net_payable'] as num?)?.toDouble() ?? 0.0,
        previousDiscountAmount:
            (map['previous_discount_amount'] as num?)?.toDouble() ?? 0.0,
        newDiscountAmount:
            (map['new_discount_amount'] as num?)?.toDouble() ?? 0.0,
        summary: (map['summary'] as String?) ?? '',
      );
}

class EditCreditReceiptLineInput {
  final int itemId;
  final String itemName;
  final String unit;
  final String batchNumber;
  final int quantity;
  final double unitPrice;
  final double costPrice;
  final double itemDiscount;

  const EditCreditReceiptLineInput({
    required this.itemId,
    required this.itemName,
    this.unit = 'Unit',
    this.batchNumber = '',
    required this.quantity,
    required this.unitPrice,
    required this.costPrice,
    this.itemDiscount = 0.0,
  });
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
  final String? transactionReference;
  final double? cashReceived;
  final double? changeReturned;
  final String createdAt;
  final String? editedAt;
  final String? editedBy;
  final String? editedByName;
  final String? editReason;
  final List<SaleAuditLogEntry> auditLogs;

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
    this.transactionReference,
    this.cashReceived,
    this.changeReturned,
    required this.createdAt,
    this.editedAt,
    this.editedBy,
    this.editedByName,
    this.editReason,
    this.auditLogs = const [],
  });

  SaleRecord copyWith({
    int? id,
    String? invoiceNumber,
    int? partyId,
    String? partyName,
    double? subtotal,
    double? discountAmount,
    double? netPayable,
    double? totalCost,
    double? netProfit,
    PaymentMode? paymentMode,
    String? transactionReference,
    double? cashReceived,
    double? changeReturned,
    String? createdAt,
    String? editedAt,
    String? editedBy,
    String? editedByName,
    String? editReason,
    List<SaleAuditLogEntry>? auditLogs,
  }) {
    return SaleRecord(
      id: id ?? this.id,
      invoiceNumber: invoiceNumber ?? this.invoiceNumber,
      partyId: partyId ?? this.partyId,
      partyName: partyName ?? this.partyName,
      subtotal: subtotal ?? this.subtotal,
      discountAmount: discountAmount ?? this.discountAmount,
      netPayable: netPayable ?? this.netPayable,
      totalCost: totalCost ?? this.totalCost,
      netProfit: netProfit ?? this.netProfit,
      paymentMode: paymentMode ?? this.paymentMode,
      transactionReference: transactionReference ?? this.transactionReference,
      cashReceived: cashReceived ?? this.cashReceived,
      changeReturned: changeReturned ?? this.changeReturned,
      createdAt: createdAt ?? this.createdAt,
      editedAt: editedAt ?? this.editedAt,
      editedBy: editedBy ?? this.editedBy,
      editedByName: editedByName ?? this.editedByName,
      editReason: editReason ?? this.editReason,
      auditLogs: auditLogs ?? this.auditLogs,
    );
  }

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
        'transaction_reference': transactionReference,
        'cash_received': cashReceived,
        'change_returned': changeReturned,
        'created_at': createdAt,
        'edited_at': editedAt,
        'edited_by': editedBy,
        'edited_by_name': editedByName,
        'edit_reason': editReason,
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
        transactionReference: map['transaction_reference'] as String?,
        cashReceived: (map['cash_received'] as num?)?.toDouble(),
        changeReturned: (map['change_returned'] as num?)?.toDouble(),
        createdAt: map['created_at'] as String,
        editedAt: map['edited_at'] as String?,
        editedBy: map['edited_by'] as String?,
        editedByName: map['edited_by_name'] as String?,
        editReason: map['edit_reason'] as String?,
      );
}

class SaleItemRecord {
  final int? id;
  final int? saleId;
  final int itemId;
  final String itemName;
  final String unit;
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
    this.unit = 'Unit',
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
        unit: ((map['unit'] as String?) ?? '').trim().isEmpty
            ? 'Unit'
            : (map['unit'] as String).trim(),
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

enum PurchasePaymentStatus { unpaid, partiallyPaid, paid }

extension PurchasePaymentStatusX on PurchasePaymentStatus {
  String get label {
    switch (this) {
      case PurchasePaymentStatus.unpaid:
        return 'Unpaid';
      case PurchasePaymentStatus.partiallyPaid:
        return 'Partially Paid';
      case PurchasePaymentStatus.paid:
        return 'Paid';
    }
  }
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

  PurchasePaymentStatus get paymentStatus {
    if (balanceDue <= 0.005) return PurchasePaymentStatus.paid;
    if (paidAmount > 0.005) return PurchasePaymentStatus.partiallyPaid;
    return PurchasePaymentStatus.unpaid;
  }

  PurchaseRecord copyWith({
    int? id,
    String? purchaseNumber,
    String? supplierInvoiceNo,
    int? supplierId,
    String? supplierName,
    double? totalAmount,
    double? paidAmount,
    double? balanceDue,
    PaymentMode? paymentMode,
    String? createdAt,
  }) {
    return PurchaseRecord(
      id: id ?? this.id,
      purchaseNumber: purchaseNumber ?? this.purchaseNumber,
      supplierInvoiceNo: supplierInvoiceNo ?? this.supplierInvoiceNo,
      supplierId: supplierId ?? this.supplierId,
      supplierName: supplierName ?? this.supplierName,
      totalAmount: totalAmount ?? this.totalAmount,
      paidAmount: paidAmount ?? this.paidAmount,
      balanceDue: balanceDue ?? this.balanceDue,
      paymentMode: paymentMode ?? this.paymentMode,
      createdAt: createdAt ?? this.createdAt,
    );
  }

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

class PharmacySettings {
  final String pharmacyName;
  final String shopShortCode;
  final String address;
  final String phone;
  final String licenseNumber;
  final String websiteUrl;
  final String receiptFooter;
  final bool autoPrintReceipt;
  final String? savedPrinterName;
  final String? savedPrinterMac;
  final int thermalPaperWidth; // 58 or 80
  final bool showWebsiteOnReceipt;
  final bool preferUsbScannerFocus;

  // Currency & Regional Settings
  final String currencyCode;
  final String currencySymbol;
  final bool useSymbolInsteadOfCode;
  final int decimalDigits; // 0, 2, or 3
  final String symbolPosition; // 'prefix' or 'suffix'
  final String timezone;
  final String dateFormat; // 'DD/MM/YYYY' or 'MM/DD/YYYY'

  // Counter & Role Display Options
  final int lowStockThreshold;
  final int expiryAlertDays;
  final bool showProfitToStaff;
  final UserRole activeUserRole;

  const PharmacySettings({
    this.pharmacyName = 'Clinix Community Pharmacy',
    this.shopShortCode = 'CLX',
    this.address = '17 KM Ferozepur Road, Lahore',
    this.phone = '+92 42 35950011',
    this.licenseNumber = 'DL-LHR-04892',
    this.websiteUrl = '',
    this.receiptFooter =
        'Unopened medicines with original invoice may be exchanged within 7 days.',
    this.autoPrintReceipt = true,
    this.savedPrinterName,
    this.savedPrinterMac,
    this.thermalPaperWidth = 80,
    this.showWebsiteOnReceipt = false,
    this.preferUsbScannerFocus = true,
    this.currencyCode = 'PKR',
    this.currencySymbol = 'Rs',
    this.useSymbolInsteadOfCode = false,
    this.decimalDigits = 2,
    this.symbolPosition = 'prefix',
    this.timezone = 'Asia/Karachi',
    this.dateFormat = 'DD/MM/YYYY',
    this.lowStockThreshold = 10,
    this.expiryAlertDays = 30,
    this.showProfitToStaff = false,
    this.activeUserRole = UserRole.admin,
  });

  // Backward-compatibility getters for existing callers
  String get branchAddress => address;
  String get phoneNumber => phone;
  String get receiptFooterNote => receiptFooter;
  int get paperWidthMm => thermalPaperWidth;
  String get currencyLabel =>
      useSymbolInsteadOfCode ? currencySymbol : currencyCode;
  int get nearExpiryDays => expiryAlertDays;

  factory PharmacySettings.defaults() => const PharmacySettings();

  static String normalizeShortCode(String? raw) {
    final cleaned = (raw ?? '')
        .replaceAll(RegExp(r'[^a-zA-Z0-9]'), '')
        .toUpperCase();
    if (cleaned.isEmpty) return 'CLX';
    return cleaned.length > 8 ? cleaned.substring(0, 8) : cleaned;
  }

  PharmacySettings copyWith({
    String? pharmacyName,
    String? shopShortCode,
    String? address,
    String? phone,
    String? licenseNumber,
    String? websiteUrl,
    String? receiptFooter,
    bool? autoPrintReceipt,
    String? savedPrinterName,
    String? savedPrinterMac,
    bool clearSavedPrinter = false,
    int? thermalPaperWidth,
    bool? showWebsiteOnReceipt,
    bool? preferUsbScannerFocus,
    String? currencyCode,
    String? currencySymbol,
    bool? useSymbolInsteadOfCode,
    int? decimalDigits,
    String? symbolPosition,
    String? timezone,
    String? dateFormat,
    int? lowStockThreshold,
    int? expiryAlertDays,
    bool? showProfitToStaff,
    UserRole? activeUserRole,
  }) {
    return PharmacySettings(
      pharmacyName: pharmacyName ?? this.pharmacyName,
      shopShortCode: shopShortCode ?? this.shopShortCode,
      address: address ?? this.address,
      phone: phone ?? this.phone,
      licenseNumber: licenseNumber ?? this.licenseNumber,
      websiteUrl: websiteUrl ?? this.websiteUrl,
      receiptFooter: receiptFooter ?? this.receiptFooter,
      autoPrintReceipt: autoPrintReceipt ?? this.autoPrintReceipt,
      savedPrinterName: clearSavedPrinter
          ? null
          : (savedPrinterName ?? this.savedPrinterName),
      savedPrinterMac:
          clearSavedPrinter ? null : (savedPrinterMac ?? this.savedPrinterMac),
      thermalPaperWidth: thermalPaperWidth ?? this.thermalPaperWidth,
      showWebsiteOnReceipt: showWebsiteOnReceipt ?? this.showWebsiteOnReceipt,
      preferUsbScannerFocus:
          preferUsbScannerFocus ?? this.preferUsbScannerFocus,
      currencyCode: currencyCode ?? this.currencyCode,
      currencySymbol: currencySymbol ?? this.currencySymbol,
      useSymbolInsteadOfCode:
          useSymbolInsteadOfCode ?? this.useSymbolInsteadOfCode,
      decimalDigits: decimalDigits ?? this.decimalDigits,
      symbolPosition: symbolPosition ?? this.symbolPosition,
      timezone: timezone ?? this.timezone,
      dateFormat: dateFormat ?? this.dateFormat,
      lowStockThreshold: lowStockThreshold ?? this.lowStockThreshold,
      expiryAlertDays: expiryAlertDays ?? this.expiryAlertDays,
      showProfitToStaff: showProfitToStaff ?? this.showProfitToStaff,
      activeUserRole: activeUserRole ?? this.activeUserRole,
    );
  }

  Map<String, dynamic> toMap() {
    final cleanCode =
        currencyCode.trim().isEmpty ? 'PKR' : currencyCode.trim().toUpperCase();
    final cleanSymbol =
        currencySymbol.trim().isEmpty ? 'Rs' : currencySymbol.trim();
    final cleanDigits =
        (decimalDigits == 0 || decimalDigits == 2 || decimalDigits == 3)
            ? decimalDigits
            : 2;
    final cleanPos = symbolPosition == 'suffix' ? 'suffix' : 'prefix';
    final cleanDateFmt =
        dateFormat == 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY';
    final cleanWidth = thermalPaperWidth == 58 ? 58 : 80;
    final cleanLow = lowStockThreshold < 1 ? 1 : lowStockThreshold;
    final cleanExp = expiryAlertDays < 1 ? 1 : expiryAlertDays;

    return {
      'id': 1,
      'pharmacy_name': pharmacyName,
      'shop_short_code': normalizeShortCode(shopShortCode),
      // Keep both legacy and unified columns synchronized for seamless migrations
      'branch_address': address,
      'address': address,
      'phone_number': phone,
      'phone': phone,
      'license_number': licenseNumber,
      'website_url': websiteUrl,
      'receipt_footer_note': receiptFooter,
      'receipt_footer': receiptFooter,
      'auto_print_receipt': autoPrintReceipt ? 1 : 0,
      'saved_printer_name': savedPrinterName,
      'saved_printer_mac': savedPrinterMac,
      'paper_width_mm': cleanWidth,
      'thermal_paper_width': cleanWidth,
      'show_website_on_receipt': showWebsiteOnReceipt ? 1 : 0,
      'prefer_usb_scanner_focus': preferUsbScannerFocus ? 1 : 0,
      'currency_label': cleanCode,
      'currency_code': cleanCode,
      'currency_symbol': cleanSymbol,
      'use_symbol_instead_of_code': useSymbolInsteadOfCode ? 1 : 0,
      'decimal_digits': cleanDigits,
      'symbol_position': cleanPos,
      'timezone': timezone.trim().isEmpty ? 'Asia/Karachi' : timezone.trim(),
      'date_format': cleanDateFmt,
      'low_stock_threshold': cleanLow,
      'near_expiry_days': cleanExp,
      'expiry_alert_days': cleanExp,
      'show_profit_to_staff': showProfitToStaff ? 1 : 0,
      'active_user_role': activeUserRole.dbValue,
      'updated_at': DateTime.now().toIso8601String(),
    };
  }

  Map<String, dynamic> toJson() => {
        'pharmacyName': pharmacyName,
        'shopShortCode': normalizeShortCode(shopShortCode),
        'address': address,
        'phone': phone,
        'licenseNumber': licenseNumber,
        'websiteUrl': websiteUrl,
        'receiptFooter': receiptFooter,
        'autoPrintReceipt': autoPrintReceipt,
        'savedPrinterName': savedPrinterName,
        'savedPrinterMac': savedPrinterMac,
        'thermalPaperWidth': thermalPaperWidth == 58 ? 58 : 80,
        'showWebsiteOnReceipt': showWebsiteOnReceipt,
        'preferUsbScannerFocus': preferUsbScannerFocus,
        'currencyCode': currencyCode,
        'currencySymbol': currencySymbol,
        'useSymbolInsteadOfCode': useSymbolInsteadOfCode,
        'decimalDigits': decimalDigits,
        'symbolPosition': symbolPosition,
        'timezone': timezone,
        'dateFormat': dateFormat,
        'lowStockThreshold': lowStockThreshold,
        'expiryAlertDays': expiryAlertDays,
        'showProfitToStaff': showProfitToStaff,
        'activeUserRole': activeUserRole.dbValue,
      };

  static bool _parseBool(dynamic value, {required bool fallback}) {
    if (value is bool) return value;
    if (value is num) return value.toInt() == 1;
    if (value is String) {
      if (value == '1' || value.toLowerCase() == 'true') return true;
      if (value == '0' || value.toLowerCase() == 'false') return false;
    }
    return fallback;
  }

  factory PharmacySettings.fromMap(Map<String, dynamic> map) {
    final nameRaw = (map['pharmacy_name'] ?? map['pharmacyName']) as String?;
    final shortRaw =
        (map['shop_short_code'] ?? map['shopShortCode']) as String?;
    final addrRaw =
        (map['address'] ?? map['branch_address'] ?? map['branchAddress'])
            as String?;
    final phoneRaw =
        (map['phone'] ?? map['phone_number'] ?? map['phoneNumber']) as String?;
    final licRaw = (map['license_number'] ?? map['licenseNumber']) as String?;
    final webRaw = (map['website_url'] ?? map['websiteUrl']) as String?;
    final footerRaw =
        (map['receipt_footer'] ??
            map['receipt_footer_note'] ??
            map['receiptFooterNote']) as String?;

    final widthRaw = ((map['thermal_paper_width'] ??
                map['paper_width_mm'] ??
                map['paperWidthMm']) as num?)
            ?.toInt() ??
        80;
    final lowRaw =
        ((map['low_stock_threshold'] ?? map['lowStockThreshold']) as num?)
                ?.toInt() ??
            10;
    final expRaw = ((map['expiry_alert_days'] ??
                map['near_expiry_days'] ??
                map['expiryAlertDays']) as num?)
            ?.toInt() ??
        30;

    final codeRaw = ((map['currency_code'] ??
                map['currency_label'] ??
                map['currencyCode']) as String?)
            ?.trim();
    final symRaw =
        ((map['currency_symbol'] ?? map['currencySymbol']) as String?)?.trim();
    final digitsRaw =
        ((map['decimal_digits'] ?? map['decimalDigits']) as num?)?.toInt() ?? 2;
    final posRaw =
        (map['symbol_position'] ?? map['symbolPosition']) as String?;
    final tzRaw = (map['timezone'] as String?)?.trim();
    final dateFmtRaw = (map['date_format'] ?? map['dateFormat']) as String?;

    return PharmacySettings(
      pharmacyName: (nameRaw != null && nameRaw.trim().isNotEmpty)
          ? nameRaw.trim()
          : 'Clinix Community Pharmacy',
      shopShortCode: normalizeShortCode(shortRaw),
      address: (addrRaw != null && addrRaw.trim().isNotEmpty)
          ? addrRaw.trim()
          : '17 KM Ferozepur Road, Lahore',
      phone: phoneRaw?.trim() ?? '+92 42 35950011',
      licenseNumber: licRaw?.trim() ?? 'DL-LHR-04892',
      websiteUrl: webRaw?.trim() ?? '',
      receiptFooter: footerRaw ??
          'Unopened medicines with original invoice may be exchanged within 7 days.',
      autoPrintReceipt: _parseBool(
        map['auto_print_receipt'] ?? map['autoPrintReceipt'],
        fallback: true,
      ),
      savedPrinterName:
          (map['saved_printer_name'] ?? map['savedPrinterName']) as String?,
      savedPrinterMac:
          (map['saved_printer_mac'] ?? map['savedPrinterMac']) as String?,
      thermalPaperWidth: widthRaw == 58 ? 58 : 80,
      showWebsiteOnReceipt: _parseBool(
        map['show_website_on_receipt'] ?? map['showWebsiteOnReceipt'],
        fallback: false,
      ),
      preferUsbScannerFocus: _parseBool(
        map['prefer_usb_scanner_focus'] ?? map['preferUsbScannerFocus'],
        fallback: true,
      ),
      currencyCode: (codeRaw != null && codeRaw.isNotEmpty)
          ? codeRaw.toUpperCase()
          : 'PKR',
      currencySymbol:
          (symRaw != null && symRaw.isNotEmpty) ? symRaw : 'Rs',
      useSymbolInsteadOfCode: _parseBool(
        map['use_symbol_instead_of_code'] ?? map['useSymbolInsteadOfCode'],
        fallback: false,
      ),
      decimalDigits:
          (digitsRaw == 0 || digitsRaw == 2 || digitsRaw == 3) ? digitsRaw : 2,
      symbolPosition: posRaw == 'suffix' ? 'suffix' : 'prefix',
      timezone: (tzRaw != null && tzRaw.isNotEmpty) ? tzRaw : 'Asia/Karachi',
      dateFormat:
          dateFmtRaw == 'MM/DD/YYYY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY',
      lowStockThreshold: lowRaw < 1 ? 1 : lowRaw,
      expiryAlertDays: expRaw < 1 ? 1 : expRaw,
      showProfitToStaff: _parseBool(
        map['show_profit_to_staff'] ?? map['showProfitToStaff'],
        fallback: false,
      ),
      activeUserRole: UserRoleX.fromDb(
        (map['active_user_role'] ?? map['activeUserRole']) as String?,
      ),
    );
  }

  factory PharmacySettings.fromJson(Map<String, dynamic> json) =>
      PharmacySettings.fromMap(json);
}

class PharmacyUser {
  final int? id;
  final String name;
  final String username;
  final UserRole role;
  final String pinOrPassword;
  final bool isActive;
  final String createdAt;

  const PharmacyUser({
    this.id,
    required this.name,
    required this.username,
    required this.role,
    required this.pinOrPassword,
    this.isActive = true,
    required this.createdAt,
  });

  PharmacyUser copyWith({
    int? id,
    String? name,
    String? username,
    UserRole? role,
    String? pinOrPassword,
    bool? isActive,
    String? createdAt,
  }) {
    return PharmacyUser(
      id: id ?? this.id,
      name: name ?? this.name,
      username: username ?? this.username,
      role: role ?? this.role,
      pinOrPassword: pinOrPassword ?? this.pinOrPassword,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'name': name,
        'username': username,
        'role': role.label,
        'pin_or_password': pinOrPassword,
        'is_active': isActive ? 1 : 0,
        'created_at': createdAt,
      };

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'username': username,
        'role': role.label,
        'pinOrPassword': pinOrPassword,
        'isActive': isActive,
        'createdAt': createdAt,
      };

  factory PharmacyUser.fromMap(Map<String, dynamic> map) {
    final activeRaw = map['is_active'] ?? map['isActive'];
    final active = activeRaw is bool
        ? activeRaw
        : activeRaw is num
            ? activeRaw.toInt() == 1
            : activeRaw?.toString() == '1' ||
                activeRaw?.toString().toLowerCase() == 'true';

    return PharmacyUser(
      id: (map['id'] as num?)?.toInt(),
      name: (map['name'] as String? ?? '').trim(),
      username: (map['username'] as String? ?? '').trim(),
      role: UserRoleX.fromDb(map['role'] as String?),
      pinOrPassword:
          (map['pin_or_password'] ?? map['pinOrPassword']) as String? ?? '',
      isActive: activeRaw == null ? true : active,
      createdAt:
          (map['created_at'] ?? map['createdAt']) as String? ??
              DateTime.now().toIso8601String(),
    );
  }

  factory PharmacyUser.fromJson(Map<String, dynamic> json) =>
      PharmacyUser.fromMap(json);
}

enum KhataEntryType { openingBalance, creditSale, collection, adjustment }

extension KhataEntryTypeX on KhataEntryType {
  String get dbValue {
    switch (this) {
      case KhataEntryType.openingBalance:
        return 'opening_balance';
      case KhataEntryType.creditSale:
        return 'credit_sale';
      case KhataEntryType.collection:
        return 'collection';
      case KhataEntryType.adjustment:
        return 'adjustment';
    }
  }

  static KhataEntryType fromDb(String? raw) {
    switch ((raw ?? '').trim().toLowerCase()) {
      case 'opening_balance':
        return KhataEntryType.openingBalance;
      case 'credit_sale':
        return KhataEntryType.creditSale;
      case 'collection':
        return KhataEntryType.collection;
      case 'adjustment':
        return KhataEntryType.adjustment;
      default:
        return KhataEntryType.adjustment;
    }
  }
}

class KhataEntry {
  final int? id;
  final int partyId;
  final KhataEntryType entryType;
  final double amount;
  final int? saleId;
  final String? invoiceNumber;
  final String? paymentMode;
  final String? reference;
  final String? notes;
  final String createdAt;
  final String? editedAt;
  final String? editedBy;
  final String? editedByName;
  final String? editReason;
  final double? previousAmount;
  final String? editSummary;

  const KhataEntry({
    this.id,
    required this.partyId,
    required this.entryType,
    required this.amount,
    this.saleId,
    this.invoiceNumber,
    this.paymentMode,
    this.reference,
    this.notes,
    required this.createdAt,
    this.editedAt,
    this.editedBy,
    this.editedByName,
    this.editReason,
    this.previousAmount,
    this.editSummary,
  });

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'party_id': partyId,
        'entry_type': entryType.dbValue,
        'amount': amount,
        'sale_id': saleId,
        'invoice_number': invoiceNumber,
        'payment_mode': paymentMode,
        'reference': reference,
        'notes': notes,
        'created_at': createdAt,
        'edited_at': editedAt,
        'edited_by': editedBy,
        'edited_by_name': editedByName,
        'edit_reason': editReason,
        'previous_amount': previousAmount,
        'edit_summary': editSummary,
      };

  factory KhataEntry.fromMap(Map<String, dynamic> map) => KhataEntry(
        id: (map['id'] as num?)?.toInt(),
        partyId: (map['party_id'] as num).toInt(),
        entryType: KhataEntryTypeX.fromDb(map['entry_type'] as String?),
        amount: (map['amount'] as num?)?.toDouble() ?? 0.0,
        saleId: (map['sale_id'] as num?)?.toInt(),
        invoiceNumber: map['invoice_number'] as String?,
        paymentMode: map['payment_mode'] as String?,
        reference: map['reference'] as String?,
        notes: map['notes'] as String?,
        createdAt:
            (map['created_at'] as String?) ?? DateTime.now().toIso8601String(),
        editedAt: map['edited_at'] as String?,
        editedBy: map['edited_by'] as String?,
        editedByName: map['edited_by_name'] as String?,
        editReason: map['edit_reason'] as String?,
        previousAmount: (map['previous_amount'] as num?)?.toDouble(),
        editSummary: map['edit_summary'] as String?,
      );
}

class CustomerKhataTimelineRow {
  final KhataEntry entry;
  final String voucherNumber;
  final String title;
  final String subtitle;
  final double debit;
  final double credit;
  final double runningBalance;
  final SaleRecord? sale;
  final List<SaleItemRecord> items;

  const CustomerKhataTimelineRow({
    required this.entry,
    required this.voucherNumber,
    required this.title,
    required this.subtitle,
    required this.debit,
    required this.credit,
    required this.runningBalance,
    this.sale,
    this.items = const [],
  });
}

class CustomerKhataStatement {
  final Party party;
  final double openingBalanceBeforeRange;
  final List<CustomerKhataTimelineRow> rows;
  final double totalCreditGiven;
  final double totalCollected;
  final double closingBalanceInRange;
  final double currentBalanceDue;

  const CustomerKhataStatement({
    required this.party,
    required this.openingBalanceBeforeRange,
    required this.rows,
    required this.totalCreditGiven,
    required this.totalCollected,
    required this.closingBalanceInRange,
    required this.currentBalanceDue,
  });
}

class SupplierPaymentEntry {
  final int? id;
  final int partyId;
  final int? purchaseId;
  final String? purchaseNumber;
  final String? supplierInvoiceNo;
  final double amount;
  final String paymentMode;
  final String? reference;
  final String? notes;
  final String createdAt;

  const SupplierPaymentEntry({
    this.id,
    required this.partyId,
    this.purchaseId,
    this.purchaseNumber,
    this.supplierInvoiceNo,
    required this.amount,
    this.paymentMode = 'Cash',
    this.reference,
    this.notes,
    required this.createdAt,
  });

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'party_id': partyId,
        'purchase_id': purchaseId,
        'purchase_number': purchaseNumber,
        'supplier_invoice_no': supplierInvoiceNo,
        'amount': amount,
        'payment_mode': paymentMode,
        'reference': reference,
        'notes': notes,
        'created_at': createdAt,
      };

  factory SupplierPaymentEntry.fromMap(Map<String, dynamic> map) =>
      SupplierPaymentEntry(
        id: (map['id'] as num?)?.toInt(),
        partyId: (map['party_id'] as num).toInt(),
        purchaseId: (map['purchase_id'] as num?)?.toInt(),
        purchaseNumber: map['purchase_number'] as String?,
        supplierInvoiceNo: map['supplier_invoice_no'] as String?,
        amount: (map['amount'] as num?)?.toDouble() ?? 0.0,
        paymentMode: (map['payment_mode'] as String?) ?? 'Cash',
        reference: map['reference'] as String?,
        notes: map['notes'] as String?,
        createdAt:
            (map['created_at'] as String?) ?? DateTime.now().toIso8601String(),
      );
}

class SupplierBillLedgerRow {
  final PurchaseRecord purchase;
  final PurchasePaymentStatus status;
  final List<PurchaseItemRecord> items;
  final List<SupplierPaymentEntry> allocatedPayments;

  const SupplierBillLedgerRow({
    required this.purchase,
    required this.status,
    this.items = const [],
    this.allocatedPayments = const [],
  });
}

class SupplierLedgerStatement {
  final Party party;
  final List<SupplierBillLedgerRow> bills;
  final List<SupplierPaymentEntry> payments;
  final double totalPurchased;
  final double totalPaidOnBills;
  final double totalBillRemaining;
  final double totalPaymentsRecorded;
  final double unallocatedOrOpeningBalance;
  final int unpaidBillCount;
  final int partialBillCount;
  final int paidBillCount;
  final double currentBalanceDue;

  const SupplierLedgerStatement({
    required this.party,
    required this.bills,
    required this.payments,
    required this.totalPurchased,
    required this.totalPaidOnBills,
    required this.totalBillRemaining,
    required this.totalPaymentsRecorded,
    required this.unallocatedOrOpeningBalance,
    required this.unpaidBillCount,
    required this.partialBillCount,
    required this.paidBillCount,
    required this.currentBalanceDue,
  });
}

class ExpenseRecord {
  final int? id;
  final String title;
  final String category;
  final double amount;
  final String date; // yyyy-MM-dd
  final String paymentMode;
  final String notes;
  final String createdAt;

  const ExpenseRecord({
    this.id,
    required this.title,
    required this.category,
    required this.amount,
    required this.date,
    this.paymentMode = 'Cash',
    this.notes = '',
    required this.createdAt,
  });

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'title': title,
        'category': category,
        'amount': amount,
        'date': date,
        'payment_mode': paymentMode,
        'notes': notes,
        'created_at': createdAt,
      };

  factory ExpenseRecord.fromMap(Map<String, dynamic> map) => ExpenseRecord(
        id: (map['id'] as num?)?.toInt(),
        title: (map['title'] as String? ?? '').trim(),
        category: (map['category'] as String? ?? 'Delivery & Misc').trim(),
        amount: (map['amount'] as num?)?.toDouble() ?? 0.0,
        date: (map['date'] as String? ?? '').trim(),
        paymentMode: (map['payment_mode'] ?? map['paymentMode']) as String? ?? 'Cash',
        notes: (map['notes'] as String? ?? '').trim(),
        createdAt:
            (map['created_at'] ?? map['createdAt']) as String? ??
                DateTime.now().toIso8601String(),
      );
}

class ReportPeriodTotals {
  final int receiptCount;
  final int expenseCount;
  final double grossSales;
  final double discounts;
  final double netSales;
  final double totalCost;
  final double grossProfit;
  final double totalExpenses;
  final double trueNetProfit;
  final double grossMarginPct;
  final double netMarginPct;

  const ReportPeriodTotals({
    required this.receiptCount,
    required this.expenseCount,
    required this.grossSales,
    required this.discounts,
    required this.netSales,
    required this.totalCost,
    required this.grossProfit,
    required this.totalExpenses,
    required this.trueNetProfit,
    required this.grossMarginPct,
    required this.netMarginPct,
  });
}

class DailyReportRow {
  final String dateKey; // yyyy-MM-dd
  final int receiptCount;
  final int expenseCount;
  final double grossSales;
  final double discounts;
  final double netSales;
  final double totalCost;
  final double grossProfit;
  final double expenses;
  final double trueNetProfit;
  final double netMarginPct;

  const DailyReportRow({
    required this.dateKey,
    required this.receiptCount,
    required this.expenseCount,
    required this.grossSales,
    required this.discounts,
    required this.netSales,
    required this.totalCost,
    required this.grossProfit,
    required this.expenses,
    required this.trueNetProfit,
    required this.netMarginPct,
  });
}

class MonthlyReportRow {
  final String monthKey; // yyyy-MM
  final String label;
  final int receiptCount;
  final int expenseCount;
  final double grossSales;
  final double discounts;
  final double netSales;
  final double totalCost;
  final double grossProfit;
  final double expenses;
  final double trueNetProfit;
  final double netMarginPct;

  const MonthlyReportRow({
    required this.monthKey,
    required this.label,
    required this.receiptCount,
    required this.expenseCount,
    required this.grossSales,
    required this.discounts,
    required this.netSales,
    required this.totalCost,
    required this.grossProfit,
    required this.expenses,
    required this.trueNetProfit,
    required this.netMarginPct,
  });
}

class ReportSummaryBundle {
  final ReportPeriodTotals totals;
  final List<DailyReportRow> dailyRows;
  final List<MonthlyReportRow> monthlyRows;
  final List<SaleRecord> receipts;
  final List<ExpenseRecord> expenses;

  const ReportSummaryBundle({
    required this.totals,
    required this.dailyRows,
    required this.monthlyRows,
    required this.receipts,
    required this.expenses,
  });
}




