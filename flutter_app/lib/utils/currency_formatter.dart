import 'package:intl/intl.dart';

import '../models/pharmacy_models.dart';

class CurrencyPreset {
  final String code;
  final String symbol;
  final String label;
  final String name;
  final int defaultDecimals;
  final String defaultPosition;
  final String defaultTimezone;

  const CurrencyPreset({
    required this.code,
    required this.symbol,
    required this.label,
    required this.name,
    this.defaultDecimals = 2,
    this.defaultPosition = 'prefix',
    this.defaultTimezone = 'Asia/Karachi',
  });
}

/// Centralized multi-currency & regional formatting helper for Clinix POS.
class CurrencyFormatter {
  CurrencyFormatter._();

  static const List<CurrencyPreset> presets = [
    CurrencyPreset(
      code: 'PKR',
      symbol: 'Rs',
      label: 'PKR',
      name: 'Pakistani Rupee',
      defaultTimezone: 'Asia/Karachi',
    ),
    CurrencyPreset(
      code: 'USD',
      symbol: r'$',
      label: r'USD ($)',
      name: 'US Dollar',
      defaultTimezone: 'America/New_York',
    ),
    CurrencyPreset(
      code: 'EUR',
      symbol: '€',
      label: 'EUR (€)',
      name: 'Euro',
      defaultTimezone: 'Europe/Berlin',
    ),
    CurrencyPreset(
      code: 'GBP',
      symbol: '£',
      label: 'GBP (£)',
      name: 'British Pound',
      defaultTimezone: 'Europe/London',
    ),
    CurrencyPreset(
      code: 'AED',
      symbol: 'AED',
      label: 'AED',
      name: 'UAE Dirham',
      defaultTimezone: 'Asia/Dubai',
    ),
    CurrencyPreset(
      code: 'SAR',
      symbol: 'SAR',
      label: 'SAR',
      name: 'Saudi Riyal',
      defaultTimezone: 'Asia/Riyadh',
    ),
    CurrencyPreset(
      code: 'INR',
      symbol: '₹',
      label: 'INR (₹)',
      name: 'Indian Rupee',
      defaultTimezone: 'Asia/Kolkata',
    ),
    CurrencyPreset(
      code: 'CAD',
      symbol: r'C$',
      label: r'CAD ($)',
      name: 'Canadian Dollar',
      defaultTimezone: 'America/Toronto',
    ),
    CurrencyPreset(
      code: 'AUD',
      symbol: r'A$',
      label: r'AUD ($)',
      name: 'Australian Dollar',
      defaultTimezone: 'Australia/Sydney',
    ),
  ];

  static const List<String> commonTimezones = [
    'Asia/Karachi',
    'Asia/Dubai',
    'Asia/Riyadh',
    'Asia/Kolkata',
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Chicago',
    'America/Toronto',
    'Australia/Sydney',
    'UTC',
  ];

  static String unitLabel(
    PharmacySettings? settings, {
    bool asciiOnly = false,
  }) {
    final cfg = settings ?? PharmacySettings.defaults();
    final code = cfg.currencyCode.trim().isEmpty
        ? 'PKR'
        : cfg.currencyCode.trim().toUpperCase();
    final symbol =
        cfg.currencySymbol.trim().isEmpty ? 'Rs' : cfg.currencySymbol.trim();

    if (cfg.useSymbolInsteadOfCode) {
      if (asciiOnly && _hasNonAscii(symbol)) {
        return code;
      }
      return symbol;
    }
    return code;
  }

  static String format(
    double amount,
    PharmacySettings? settings, {
    bool asciiOnly = false,
    bool grouping = true,
    int? overrideDecimals,
  }) {
    final cfg = settings ?? PharmacySettings.defaults();
    final double safe = amount.isFinite ? amount : 0.0;
    final bool isNegative = safe < 0;
    final double absVal = safe.abs();

    final int digits = _normalizeDecimals(
      overrideDecimals ?? cfg.decimalDigits,
    );

    final String numberPart;
    if (grouping) {
      final pattern = digits == 0
          ? '#,##0'
          : '#,##0.${'0' * digits}';
      numberPart = NumberFormat(pattern).format(absVal);
    } else {
      numberPart = absVal.toStringAsFixed(digits);
    }

    final String token = unitLabel(cfg, asciiOnly: asciiOnly);
    final bool isCompact = token.length == 1 ||
        token.endsWith(r'$') ||
        token.endsWith('€') ||
        token.endsWith('£') ||
        token.endsWith('₹') ||
        token.endsWith('¥');
    final String sep = isCompact ? '' : ' ';

    final String combined = cfg.symbolPosition == 'suffix'
        ? '$numberPart$sep$token'
        : '$token$sep$numberPart';

    return isNegative ? '-$combined' : combined;
  }

  static String formatDate(
    String isoOrDate,
    PharmacySettings? settings, {
    bool includeTime = false,
  }) {
    final parsed = DateTime.tryParse(isoOrDate.trim());
    if (parsed == null) {
      return isoOrDate.isEmpty ? 'N/A' : isoOrDate;
    }

    final cfg = settings ?? PharmacySettings.defaults();
    final DateTime displayDt = _applyTimezone(parsed, cfg.timezone);
    final String datePattern =
        cfg.dateFormat == 'MM/DD/YYYY' ? 'MM/dd/yyyy' : 'dd/MM/yyyy';
    final String fullPattern =
        includeTime ? '$datePattern hh:mm a' : datePattern;
    return DateFormat(fullPattern).format(displayDt);
  }

  static int _normalizeDecimals(int value) {
    if (value == 0 || value == 2 || value == 3) return value;
    return 2;
  }

  static bool _hasNonAscii(String text) {
    for (final unit in text.codeUnits) {
      if (unit < 0x20 || unit > 0x7E) return true;
    }
    return false;
  }

  static DateTime _applyTimezone(DateTime dt, String timezone) {
    final Duration? offset = _offsetForTimezone(timezone.trim());
    if (offset == null) {
      return dt.isUtc ? dt.toLocal() : dt;
    }
    return dt.toUtc().add(offset);
  }

  static Duration? _offsetForTimezone(String tz) {
    switch (tz) {
      case 'Asia/Karachi':
        return const Duration(hours: 5);
      case 'Asia/Dubai':
        return const Duration(hours: 4);
      case 'Asia/Riyadh':
        return const Duration(hours: 3);
      case 'Asia/Kolkata':
        return const Duration(hours: 5, minutes: 30);
      case 'Europe/London':
        return Duration.zero;
      case 'Europe/Berlin':
        return const Duration(hours: 1);
      case 'America/New_York':
      case 'America/Toronto':
        return const Duration(hours: -5);
      case 'America/Chicago':
        return const Duration(hours: -6);
      case 'Australia/Sydney':
        return const Duration(hours: 10);
      case 'UTC':
        return Duration.zero;
      default:
        return null;
    }
  }
}
