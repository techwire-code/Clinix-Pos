import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bluetooth,
  Building2,
  Check,
  Coins,
  DatabaseBackup,
  Globe2,
  Printer,
  RotateCcw,
  Save,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  CounterRole,
  DateFormatOption,
  DecimalDigits,
  PharmacySettings,
  SymbolPosition,
} from '../types/pharmacy';
import {
  COMMON_TIMEZONES,
  CURRENCY_PRESETS,
  formatDateBySettings,
  formatMoney,
} from '../services/localDb';
import { generateTestEscPosReceipt } from '../services/escPosGenerator';

interface SettingsWorkspaceProps {
  settings: PharmacySettings;
  onSaveSettings: (next: PharmacySettings) => void;
  onResetSettings: () => void;
  onExportBackup: () => string;
  itemCount: number;
  saleCount: number;
  partyCount: number;
}

const KNOWN_THERMAL_PRINTERS = [
  { name: 'Rongta RPP300 Bluetooth 80mm', mac: '00:11:22:33:44:55', width: 80 as const },
  { name: 'Xprinter XP-P300 Portable 58mm', mac: 'DC:0D:30:88:1A:42', width: 58 as const },
  { name: 'Bixolon SPP-R310 Plus', mac: '74:F0:7D:E2:19:08', width: 80 as const },
  { name: 'Epson TM-P80 Mobile Thermal', mac: '04:7F:0E:91:C2:10', width: 80 as const },
];

const ROLE_OPTIONS: {
  value: CounterRole;
  label: string;
  hint: string;
}[] = [
  {
    value: 'admin',
    label: 'Admin',
    hint: 'Full access · Cost & Net Profit visible on POS',
  },
  {
    value: 'manager',
    label: 'Manager',
    hint: 'Manager access · Cost & Net Profit visible on POS',
  },
  {
    value: 'cashier',
    label: 'Cashier',
    hint: 'Counter billing · Cost & Net Profit hidden unless allowed',
  },
  {
    value: 'sales',
    label: 'Sales Staff',
    hint: 'Counter billing · Cost & Net Profit hidden unless allowed',
  },
];

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({
  settings,
  onSaveSettings,
  onResetSettings,
  onExportBackup,
  itemCount,
  saleCount,
  partyCount,
}) => {
  const [draft, setDraft] = useState<PharmacySettings>(settings);
  const [lowStockInput, setLowStockInput] = useState(
    String(settings.lowStockThreshold),
  );
  const [expiryAlertInput, setExpiryAlertInput] = useState(
    String(settings.expiryAlertDays),
  );
  const [customTimezoneMode, setCustomTimezoneMode] = useState(
    !COMMON_TIMEZONES.includes(settings.timezone),
  );
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);
  const [testPrintLines, setTestPrintLines] = useState<string[] | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  useEffect(() => {
    setDraft(settings);
    setLowStockInput(String(settings.lowStockThreshold));
    setExpiryAlertInput(String(settings.expiryAlertDays));
    setCustomTimezoneMode(!COMMON_TIMEZONES.includes(settings.timezone));
  }, [settings]);

  const showNotice = (type: 'success' | 'info' | 'error', message: string) => {
    setStatusBanner({ type, message });
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const buildNormalizedDraft = (): PharmacySettings => {
    const parsedLow = Math.max(1, Math.floor(Number(lowStockInput) || 10));
    const parsedExp = Math.max(1, Math.floor(Number(expiryAlertInput) || 30));
    return {
      ...draft,
      pharmacyName:
        draft.pharmacyName.trim() || 'Clinix Community Pharmacy',
      address: draft.address.trim() || '17 KM Ferozepur Road, Lahore',
      phone: draft.phone.trim(),
      licenseNumber: draft.licenseNumber.trim(),
      websiteUrl: draft.websiteUrl.trim(),
      receiptFooter: draft.receiptFooter.trim(),
      savedPrinterName: draft.savedPrinterName.trim(),
      savedPrinterMac: draft.savedPrinterMac.trim(),
      currencyCode: (draft.currencyCode.trim() || 'PKR').toUpperCase(),
      currencySymbol: draft.currencySymbol.trim() || 'Rs',
      timezone: draft.timezone.trim() || 'Asia/Karachi',
      lowStockThreshold: parsedLow,
      expiryAlertDays: parsedExp,
    };
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const normalized = buildNormalizedDraft();
      onSaveSettings(normalized);
      showNotice(
        'success',
        'Settings saved locally and applied immediately across POS, Inventory, Purchases, Reports, receipts, and PDFs.',
      );
    } catch (err) {
      showNotice(
        'error',
        `Failed to save settings: ${err instanceof Error ? err.message : 'Unexpected storage error'}`,
      );
    }
  };

  const handleApplyCurrencyPreset = (presetCode: string) => {
    const preset = CURRENCY_PRESETS.find((p) => p.code === presetCode);
    if (!preset) return;
    setCustomTimezoneMode(!COMMON_TIMEZONES.includes(preset.defaultTimezone));
    setDraft((prev) => ({
      ...prev,
      currencyCode: preset.code,
      currencySymbol: preset.symbol,
      decimalDigits: preset.decimalDigits,
      symbolPosition: preset.symbolPosition,
      timezone: preset.defaultTimezone,
    }));
  };

  const handleSelectKnownPrinter = (
    name: string,
    mac: string,
    width: 58 | 80,
  ) => {
    setDraft((prev) => ({
      ...prev,
      savedPrinterName: name,
      savedPrinterMac: mac,
      thermalPaperWidth: width,
    }));
  };

  const handleTestPrint = () => {
    const normalized = buildNormalizedDraft();
    const esc = generateTestEscPosReceipt(normalized);
    setTestPrintLines(esc.previewLines);
    showNotice(
      'info',
      `Generated ${normalized.thermalPaperWidth}mm ESC/POS test receipt (${esc.bytes.length} bytes) for ${normalized.savedPrinterName || 'Thermal Printer'}.`,
    );
  };

  const handleExportDatabaseBackup = () => {
    try {
      const jsonContent = onExportBackup();
      const blob = new Blob([jsonContent], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = url;
      link.download = `clinix_pharmacy_backup_${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotice(
        'success',
        `Database backup downloaded (${itemCount} SKUs, ${saleCount} receipts, ${partyCount} parties).`,
      );
    } catch (err) {
      showNotice(
        'error',
        `Failed to export backup: ${err instanceof Error ? err.message : 'Unexpected export error'}`,
      );
    }
  };

  const handleConfirmResetSettings = () => {
    try {
      onResetSettings();
      setConfirmResetOpen(false);
      setTestPrintLines(null);
      showNotice(
        'success',
        'Settings reset to defaults. Sales, stock, purchases, and Khata balances were preserved.',
      );
    } catch (err) {
      showNotice(
        'error',
        `Failed to reset settings: ${err instanceof Error ? err.message : 'Unexpected error'}`,
      );
    }
  };

  const isRoleManagerOrAdmin =
    draft.activeRole === 'admin' || draft.activeRole === 'manager';

  const previewMoneyPositive = formatMoney(1250.5, draft);
  const previewMoneyZero = formatMoney(0, draft);
  const previewDate = formatDateBySettings(new Date(), draft, {
    includeTime: true,
  });

  return (
    <form onSubmit={handleSave} className="space-y-6 pb-8">
      {/* Top Action Header */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Pharmacy, Currency &amp; Counter Settings
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Configure multi-currency formatting, timezone/date rules, pharmacy identity, ESC/POS printer width, and counter alert thresholds.
          </p>
        </div>

        <button
          type="submit"
          className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0D7A5F] px-5 py-2.5 text-xs font-bold text-white whitespace-nowrap transition-colors hover:bg-[#0A634D]"
        >
          <Save className="h-4 w-4" />
          <span>Save Settings</span>
        </button>
      </div>

      {statusBanner && (
        <div
          role={statusBanner.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium ${
            statusBanner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
              : statusBanner.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200'
                : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200'
          }`}
        >
          {statusBanner.type === 'error' ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <Check className="h-4 w-4 shrink-0" />
          )}
          <span>{statusBanner.message}</span>
        </div>
      )}

      {/* 1. Multi-Currency & Regional Settings (Full-width feature card) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0D7A5F]/10 text-[#0D7A5F] dark:bg-emerald-950 dark:text-emerald-400">
              <Coins className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Currency &amp; Regional Settings
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Quick-select global currencies or customize code, symbol, decimals, timezone, and date format
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-right dark:border-slate-700 dark:bg-slate-800/70">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Live Format Preview
            </span>
            <span className="font-mono-tabular text-sm font-bold text-[#0D7A5F] dark:text-emerald-400">
              {previewMoneyPositive} · {previewMoneyZero}
            </span>
            <span className="block font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
              {previewDate} ({draft.timezone || 'Asia/Karachi'})
            </span>
          </div>
        </div>

        {/* Quick-select presets */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Quick Currency Presets
          </p>
          <div className="flex flex-wrap gap-2">
            {CURRENCY_PRESETS.map((preset) => {
              const isSelected =
                draft.currencyCode.toUpperCase() === preset.code &&
                draft.currencySymbol === preset.symbol;
              return (
                <button
                  key={preset.code}
                  type="button"
                  onClick={() => handleApplyCurrencyPreset(preset.code)}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'border-[#0D7A5F] bg-[#0D7A5F] text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{preset.label}</span>
                  <span
                    className={`text-[10px] font-normal ${
                      isSelected ? 'text-emerald-100' : 'text-slate-400'
                    }`}
                  >
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="settings-currency-code"
              className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Currency Code (ISO)
            </label>
            <input
              id="settings-currency-code"
              type="text"
              maxLength={8}
              value={draft.currencyCode}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  currencyCode: e.target.value.toUpperCase(),
                }))
              }
              placeholder="PKR"
              className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm font-semibold uppercase text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="settings-currency-symbol"
              className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Currency Symbol
            </label>
            <input
              id="settings-currency-symbol"
              type="text"
              maxLength={6}
              value={draft.currencySymbol}
              onChange={(e) =>
                setDraft((p) => ({ ...p, currencySymbol: e.target.value }))
              }
              placeholder="Rs"
              className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Decimal Digits
            </p>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {([0, 2, 3] as DecimalDigits[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, decimalDigits: d }))}
                  className={`min-h-[34px] rounded-md font-mono-tabular text-xs font-semibold transition-colors ${
                    draft.decimalDigits === d
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {d} dec
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Symbol / Code Position
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {(['prefix', 'suffix'] as SymbolPosition[]).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, symbolPosition: pos }))}
                  className={`min-h-[34px] rounded-md text-xs font-semibold capitalize transition-colors ${
                    draft.symbolPosition === pos
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {pos === 'prefix' ? 'Prefix (PKR 10)' : 'Suffix (10 PKR)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Use Symbol Instead of Code
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {draft.useSymbolInsteadOfCode
                  ? `Showing symbol (${draft.currencySymbol || 'Rs'}) on bills & screens`
                  : `Showing clean code (${draft.currencyCode || 'PKR'} 0.00)`}
              </p>
            </div>
            <input
              type="checkbox"
              checked={draft.useSymbolInsteadOfCode}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  useSymbolInsteadOfCode: e.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-[#0D7A5F] focus:ring-[#0D7A5F] dark:border-slate-600 dark:bg-slate-800"
            />
          </label>

          <div>
            <label
              htmlFor="settings-timezone"
              className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              <Globe2 className="h-3.5 w-3.5 text-[#0D7A5F] dark:text-emerald-400" />
              <span>Timezone</span>
            </label>
            {!customTimezoneMode ? (
              <div className="flex gap-1.5">
                <select
                  id="settings-timezone"
                  value={
                    COMMON_TIMEZONES.includes(draft.timezone)
                      ? draft.timezone
                      : 'Asia/Karachi'
                  }
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomTimezoneMode(true);
                    } else {
                      setDraft((p) => ({ ...p, timezone: e.target.value }));
                    }
                  }}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                  <option value="__custom__">Enter custom IANA timezone...</option>
                </select>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <input
                  id="settings-timezone"
                  type="text"
                  value={draft.timezone}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, timezone: e.target.value }))
                  }
                  placeholder="Asia/Karachi"
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-xs text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomTimezoneMode(false);
                    if (!COMMON_TIMEZONES.includes(draft.timezone)) {
                      setDraft((p) => ({ ...p, timezone: 'Asia/Karachi' }));
                    }
                  }}
                  className="rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  List
                </button>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Regional Date Format
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {(['DD/MM/YYYY', 'MM/DD/YYYY'] as DateFormatOption[]).map(
                (fmtOpt) => (
                  <button
                    key={fmtOpt}
                    type="button"
                    onClick={() =>
                      setDraft((p) => ({ ...p, dateFormat: fmtOpt }))
                    }
                    className={`min-h-[34px] rounded-md font-mono-tabular text-xs font-semibold transition-colors ${
                      draft.dateFormat === fmtOpt
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {fmtOpt}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* 2. Pharmacy & Receipt Details */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0D7A5F]/10 text-[#0D7A5F] dark:bg-emerald-950 dark:text-emerald-400">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Pharmacy Identity &amp; Receipt Details
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Printed on ESC/POS thermal slips and A5 PDF invoices
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label
                htmlFor="settings-pharmacy-name"
                className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Pharmacy Name
              </label>
              <input
                id="settings-pharmacy-name"
                type="text"
                value={draft.pharmacyName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, pharmacyName: e.target.value }))
                }
                placeholder="Clinix Community Pharmacy"
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="settings-address"
                className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Branch / Street Address
              </label>
              <input
                id="settings-address"
                type="text"
                value={draft.address}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, address: e.target.value }))
                }
                placeholder="17 KM Ferozepur Road, Lahore"
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="settings-phone"
                  className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Phone Number
                </label>
                <input
                  id="settings-phone"
                  type="text"
                  value={draft.phone}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="+92 42 35950011"
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="settings-license"
                  className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  License / Registration #
                </label>
                <input
                  id="settings-license"
                  type="text"
                  value={draft.licenseNumber}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, licenseNumber: e.target.value }))
                  }
                  placeholder="DL-LHR-04892"
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="settings-website-url"
                className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Website URL (Optional)
              </label>
              <input
                id="settings-website-url"
                type="url"
                value={draft.websiteUrl}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, websiteUrl: e.target.value }))
                }
                placeholder="https://clinixpharmacy.pk"
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Show Website on Printed Receipts &amp; A5 PDFs
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Include website URL in receipt header when configured above
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.showWebsiteOnReceipt}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    showWebsiteOnReceipt: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-[#0D7A5F] focus:ring-[#0D7A5F] dark:border-slate-600 dark:bg-slate-800"
              />
            </label>

            <div>
              <label
                htmlFor="settings-footer-note"
                className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Receipt Footer Note
              </label>
              <textarea
                id="settings-footer-note"
                rows={2}
                value={draft.receiptFooter}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, receiptFooter: e.target.value }))
                }
                placeholder="Thank you or exchange policy line..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Auto-trigger Receipt Generation After Sale
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Automatically prompt thermal / PDF receipt print right after checkout completes
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.autoPrintReceipt}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    autoPrintReceipt: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-[#0D7A5F] focus:ring-[#0D7A5F] dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
          </div>
        </section>

        {/* 3. Printer & Barcode Hardware Preferences */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0D7A5F]/10 text-[#0D7A5F] dark:bg-emerald-950 dark:text-emerald-400">
              <Printer className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Printer &amp; Barcode Hardware
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ESC/POS Bluetooth printer, thermal paper width (58mm / 80mm), and USB scanner focus
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="settings-printer-name"
                  className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Saved Bluetooth Printer Name
                </label>
                <input
                  id="settings-printer-name"
                  type="text"
                  value={draft.savedPrinterName}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, savedPrinterName: e.target.value }))
                  }
                  placeholder="Rongta RPP300 Bluetooth 80mm"
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="settings-printer-mac"
                  className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Printer MAC Address
                </label>
                <input
                  id="settings-printer-mac"
                  type="text"
                  value={draft.savedPrinterMac}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, savedPrinterMac: e.target.value }))
                  }
                  placeholder="00:11:22:33:44:55"
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Quick-Select Paired ESC/POS Device
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {KNOWN_THERMAL_PRINTERS.map((dev) => {
                  const selected = draft.savedPrinterMac === dev.mac;
                  return (
                    <button
                      key={dev.mac}
                      type="button"
                      onClick={() =>
                        handleSelectKnownPrinter(dev.name, dev.mac, dev.width)
                      }
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        selected
                          ? 'border-[#0D7A5F] bg-[#0D7A5F]/10 text-[#0D7A5F] dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{dev.name}</p>
                        <p className="font-mono-tabular text-[11px] opacity-80">
                          {dev.mac}
                        </p>
                      </div>
                      <Bluetooth className="h-4 w-4 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Thermal Paper Width
                </p>
                <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  {([58, 80] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() =>
                        setDraft((p) => ({ ...p, thermalPaperWidth: w }))
                      }
                      className={`rounded-md px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                        draft.thermalPaperWidth === w
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {w}mm ({w === 58 ? '32 cols' : '48 cols'})
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestPrint}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Printer className="h-4 w-4 text-[#0D7A5F] dark:text-emerald-400" />
                <span>Test Print</span>
              </button>
            </div>

            {testPrintLines && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    ESC/POS Test Print Output ({draft.thermalPaperWidth}mm)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="text-[11px] font-semibold text-[#0D7A5F] hover:underline dark:text-emerald-400"
                    >
                      Send to OS Print
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestPrintLines(null)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <pre
                  className={`mx-auto overflow-x-auto font-mono-tabular text-[11px] leading-relaxed text-slate-900 dark:text-slate-200 ${
                    draft.thermalPaperWidth === 58 ? 'w-[32ch]' : 'w-[48ch]'
                  }`}
                >
                  {testPrintLines.join('\n')}
                </pre>
              </div>
            )}

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Prefer USB Barcode Scanner Focus on POS Screen
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Keep search / barcode input focused after scans and completed checkouts
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.preferUsbScannerFocus}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    preferUsbScannerFocus: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-[#0D7A5F] focus:ring-[#0D7A5F] dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
          </div>
        </section>

        {/* 4. Counter Thresholds & Role Display Options */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0D7A5F]/10 text-[#0D7A5F] dark:bg-emerald-950 dark:text-emerald-400">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Counter Thresholds &amp; Role Permissions
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stock/expiry warning windows and staff profit/cost visibility
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="settings-low-stock"
                  className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Low-Stock Threshold (Units)
                </label>
                <input
                  id="settings-low-stock"
                  type="number"
                  min={1}
                  value={lowStockInput}
                  onChange={(e) => setLowStockInput(e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="settings-expiry-alert"
                  className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Expiry Alert Window (Days)
                </label>
                <input
                  id="settings-expiry-alert"
                  type="number"
                  min={1}
                  value={expiryAlertInput}
                  onChange={(e) => setExpiryAlertInput(e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Quick expiry alert window:
              </span>
              {[30, 60, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setExpiryAlertInput(String(days))}
                  className={`rounded-lg border px-2.5 py-1 font-mono-tabular text-xs font-semibold transition-colors ${
                    Number(expiryAlertInput) === days
                      ? 'border-[#0D7A5F] bg-[#0D7A5F] text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Show Cost &amp; Net Profit to Counter Staff
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Keep OFF (recommended) so purchase cost and margin remain visible only to Admin &amp; Manager
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.showProfitToStaff}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    showProfitToStaff: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-[#0D7A5F] focus:ring-[#0D7A5F] dark:border-slate-600 dark:bg-slate-800"
              />
            </label>

            <div>
              <label
                htmlFor="settings-active-role"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <Shield className="h-3.5 w-3.5 text-[#0D7A5F] dark:text-emerald-400" />
                <span>Active Counter Display Role (RBAC)</span>
              </label>
              <select
                id="settings-active-role"
                value={draft.activeRole}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    activeRole: e.target.value as CounterRole,
                  }))
                }
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.hint}
                  </option>
                ))}
              </select>

              <p
                className={`mt-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                  isRoleManagerOrAdmin || draft.showProfitToStaff
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                }`}
              >
                {isRoleManagerOrAdmin
                  ? 'Admin / Manager mode: Item Cost and Net Profit are visible on the POS checkout panel and Credit / Khata billing is enabled.'
                  : draft.showProfitToStaff
                    ? 'Counter Staff mode (Profit Override ON): Cost & Net Profit are displayed to staff, while Khata credit remains restricted.'
                    : 'Cashier / Sales Staff mode: Item Cost, Net Profit, and Khata credit ledger options are hidden on the POS billing screen.'}
              </p>
            </div>
          </div>
        </section>

        {/* 5. Data Backup & Reset Safety */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0D7A5F]/10 text-[#0D7A5F] dark:bg-emerald-950 dark:text-emerald-400">
                <DatabaseBackup className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Data Backup &amp; Safe Reset
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Export full pharmacy database JSON or reset settings safely
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <p className="font-mono-tabular text-base font-bold text-slate-900 dark:text-slate-100">
                  {itemCount}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Inventory SKUs
                </p>
              </div>
              <div>
                <p className="font-mono-tabular text-base font-bold text-slate-900 dark:text-slate-100">
                  {saleCount}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sales Receipts
                </p>
              </div>
              <div>
                <p className="font-mono-tabular text-base font-bold text-slate-900 dark:text-slate-100">
                  {partyCount}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Khata / Parties
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3.5 dark:border-slate-800 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Export Backup
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Downloads a complete backup of settings, medicines, sales, purchases, expenses, and Khata ledger
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportDatabaseBackup}
                  className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                >
                  <DatabaseBackup className="h-4 w-4" />
                  <span>Export Backup</span>
                </button>
              </div>

              <div className="flex flex-col justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/20 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-semibold text-amber-950 dark:text-amber-200">
                    Reset Settings to Defaults
                  </p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300/90">
                    Restores currency, pharmacy, printer, and counter preferences only. Never wipes products, sales, purchases, or parties.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(true)}
                  className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-900 whitespace-nowrap transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/60"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Reset Settings</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="submit"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#0D7A5F] px-5 py-2 text-xs font-bold text-white whitespace-nowrap transition-colors hover:bg-[#0A634D]"
            >
              <Save className="h-4 w-4" />
              <span>Save All Preferences</span>
            </button>
          </div>
        </section>
      </div>

      {/* Confirmation Modal for Safe Settings Reset */}
      {confirmResetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-settings-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h4
                  id="reset-settings-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  Reset Settings to Defaults?
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close confirmation dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              This will restore currency (PKR 0.00), timezone (Asia/Karachi), pharmacy details, thermal paper width (80mm), thresholds, and counter role back to defaults.
            </p>
            <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Safety guarantee: Your {itemCount} inventory medicines, {saleCount} sales receipts, and {partyCount} customer/supplier Khata balances will NOT be cleared or modified.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResetSettings}
                className="min-h-[40px] rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Yes, Reset Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};
