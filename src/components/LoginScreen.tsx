import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Moon,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { UserRole } from '../types/pharmacy';
import { ThemeMode } from '../services/themeService';

export interface StaffSession {
  username: string;
  displayName: string;
  role: 'Admin' | 'Manager' | 'User (Limited Access)';
  roleKey: UserRole;
  loggedInAt: string;
}

export function isManagerOrAdminRole(roleKey?: UserRole): boolean {
  return roleKey === 'admin' || roleKey === 'manager';
}

interface StaffCredential {
  username: string;
  aliases?: string[];
  pin: string;
  displayName: string;
  role: 'Admin' | 'Manager' | 'User (Limited Access)';
  roleKey: UserRole;
  scopeSummary: string;
}

const STAFF_ACCOUNTS: StaffCredential[] = [
  {
    username: 'admin',
    pin: '1234',
    displayName: 'Dr. Khalid Minhas',
    role: 'Admin',
    roleKey: 'admin',
    scopeSummary: 'Full access: POS, Profit view, Inventory edit, Accounts & Settings',
  },
  {
    username: 'manager',
    pin: '2222',
    displayName: 'Bilal Ahmad (Manager)',
    role: 'Manager',
    roleKey: 'manager',
    scopeSummary: 'Manager access: POS, Cost/Net Profit, Khata Ledger & Reports',
  },
  {
    username: 'user',
    aliases: ['cashier', 'sales'],
    pin: '1111',
    displayName: 'Counter User (Cashier)',
    role: 'User (Limited Access)',
    roleKey: 'user',
    scopeSummary: 'Cashier / Sales Staff: POS Billing, Read-only Stock & Own Receipts',
  },
];

interface LoginScreenProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onLoginSuccess: (session: StaffSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  theme,
  onToggleTheme,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('user');
  const [pin, setPin] = useState('1111');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (!cleanUser || !cleanPin) {
      setError('Enter both Staff ID and PIN / Password to sign in.');
      return;
    }

    const matched = STAFF_ACCOUNTS.find(
      (acc) =>
        (acc.username.toLowerCase() === cleanUser ||
          acc.aliases?.includes(cleanUser)) &&
        acc.pin === cleanPin,
    );

    if (!matched) {
      setError(
        'Invalid Staff ID or PIN. Use user / 1111 (Limited) or admin / 1234 (Admin).',
      );
      return;
    }

    setError(null);
    onLoginSuccess({
      username: matched.username,
      displayName: matched.displayName,
      role: matched.role,
      roleKey: matched.roleKey,
      loggedInAt: new Date().toISOString(),
    });
  };

  const handleQuickFill = (account: StaffCredential) => {
    setUsername(account.username);
    setPin(account.pin);
    setError(null);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-10 text-[#0F172A] transition-colors duration-150 dark:bg-[#0B1120] dark:text-[#F1F5F9]">
      {/* Night-Shift Theme Toggle */}
      <button
        type="button"
        onClick={onToggleTheme}
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:right-6 sm:top-6"
      >
        {theme === 'dark' ? (
          <>
            <Sun className="h-3.5 w-3.5 text-amber-400" />
            <span>Day Mode</span>
          </>
        ) : (
          <>
            <Moon className="h-3.5 w-3.5 text-slate-600" />
            <span>Night Shift Mode</span>
          </>
        )}
      </button>

      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {/* Pharmacy Header */}
        <div className="border-b border-slate-200 pb-5 dark:border-slate-800">
          <div className="flex items-center gap-2.5 text-[#0D7A5F] dark:text-emerald-400">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Offline Pharmacy POS Terminal
            </span>
          </div>
          <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Clinix Community Pharmacy
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            17 KM Ferozepur Road, Lahore · Staff Authentication
          </p>
        </div>

        {/* Sign-In Form */}
        <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-800/80 dark:bg-red-950/50 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="login-staff-id"
              className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Staff ID / Username
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="login-staff-id"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="user or admin"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-pin"
              className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              PIN / Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="login-pin"
                type={showPin ? 'text' : 'password'}
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter staff PIN"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-10 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPin((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showPin ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D7A5F] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0A634D]"
          >
            <LogIn className="h-4 w-4" />
            <span>Sign In to Dashboard</span>
          </button>
        </form>

        {/* Staff Account Presets */}
        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Select Role Profile
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {STAFF_ACCOUNTS.map((acc) => {
              const selected =
                (username.trim().toLowerCase() === acc.username ||
                  Boolean(
                    acc.aliases?.includes(username.trim().toLowerCase()),
                  )) &&
                pin.trim() === acc.pin;
              return (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => handleQuickFill(acc)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? 'border-[#0D7A5F] bg-[#0D7A5F]/[0.05] dark:border-emerald-500 dark:bg-emerald-950/40'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:hover:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {acc.displayName} · {acc.role}
                    </p>
                    <span className="font-mono-tabular text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {acc.username} / {acc.pin}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {acc.scopeSummary}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
