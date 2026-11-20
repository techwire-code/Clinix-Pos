import React, { useMemo, useRef, useState } from 'react';
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
import {
  PharmacyUser,
  PharmacyUserRole,
  UserRole,
} from '../types/pharmacy';
import { loadUsers, toUserRoleKey } from '../services/localDb';
import { ThemeMode } from '../services/themeService';

export interface StaffSession {
  userId?: number;
  username: string;
  displayName: string;
  role: PharmacyUserRole | 'User (Limited Access)';
  roleKey: UserRole;
  loggedInAt: string;
}

export function isManagerOrAdminRole(roleKey?: UserRole): boolean {
  return roleKey === 'admin' || roleKey === 'manager';
}

function getRoleScopeSummary(role: PharmacyUserRole): string {
  switch (role) {
    case 'Admin':
      return 'Full access: POS, Profit view, Users & Roles, Backups & Settings';
    case 'Manager':
      return 'Manager access: POS, Cost/Net Profit, Khata Ledger, Purchases & Reports';
    case 'Sales Staff':
      return 'Sales Staff: POS Billing, Read-only Stock & Own Receipts (Cost/Profit hidden)';
    case 'Cashier':
    default:
      return 'Cashier: POS Billing, Read-only Stock & Own Receipts (Cost/Profit hidden)';
  }
}

function isFactoryDefaultPin(user: PharmacyUser): boolean {
  const lower = user.username.toLowerCase();
  return (
    (lower === 'admin' && user.pinOrPassword === '1234') ||
    (lower === 'manager' && user.pinOrPassword === '2222') ||
    (lower === 'user' && user.pinOrPassword === '1111')
  );
}

interface LoginScreenProps {
  theme: ThemeMode;
  users?: PharmacyUser[];
  pharmacyName?: string;
  pharmacyAddress?: string;
  onToggleTheme: () => void;
  onLoginSuccess: (session: StaffSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  theme,
  users,
  pharmacyName = 'Clinix Community Pharmacy',
  pharmacyAddress = '17 KM Ferozepur Road, Lahore',
  onToggleTheme,
  onLoginSuccess,
}) => {
  const availableUsers = useMemo(
    () => (users && users.length > 0 ? users : loadUsers()),
    [users],
  );
  const activeUsers = useMemo(
    () => availableUsers.filter((u) => u.isActive),
    [availableUsers],
  );

  const [username, setUsername] = useState('user');
  const [pin, setPin] = useState('1111');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (!cleanUser || !cleanPin) {
      setError('Enter both Staff ID and PIN / Password to sign in.');
      return;
    }

    let matched = availableUsers.find(
      (u) => u.username.trim().toLowerCase() === cleanUser,
    );
    if (!matched && (cleanUser === 'cashier' || cleanUser === 'sales')) {
      matched = availableUsers.find(
        (u) => u.username.trim().toLowerCase() === 'user',
      );
    }

    if (!matched || matched.pinOrPassword !== cleanPin) {
      setError(
        'Invalid Staff ID or PIN / Password. Select a staff profile or check credentials.',
      );
      return;
    }

    if (!matched.isActive) {
      setError(
        `Account "${matched.username}" is currently disabled. Contact an Admin to re-enable access.`,
      );
      return;
    }

    setError(null);
    onLoginSuccess({
      userId: matched.id,
      username: matched.username,
      displayName: matched.name,
      role: matched.role,
      roleKey: toUserRoleKey(matched.role),
      loggedInAt: new Date().toISOString(),
    });
  };

  const handleQuickFill = (account: PharmacyUser) => {
    setUsername(account.username);
    if (isFactoryDefaultPin(account)) {
      setPin(account.pinOrPassword);
    } else {
      setPin('');
      window.setTimeout(() => pinInputRef.current?.focus(), 0);
    }
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
            {pharmacyName}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {pharmacyAddress} · Staff Authentication
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
                placeholder="Enter username (e.g. admin, manager, user)"
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
                ref={pinInputRef}
                id="login-pin"
                type={showPin ? 'text' : 'password'}
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter staff PIN / password"
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

        {/* Active Staff Accounts */}
        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Active Staff Accounts ({activeUsers.length})
            </p>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Tap to fill username
            </span>
          </div>
          <div className="mt-2 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-0.5">
            {activeUsers.map((acc) => {
              const selected =
                username.trim().toLowerCase() === acc.username.toLowerCase();
              const showDemoCred = isFactoryDefaultPin(acc);
              return (
                <button
                  key={acc.id}
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
                      {acc.name} · {acc.role}
                    </p>
                    <span className="font-mono-tabular text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {showDemoCred
                        ? `${acc.username} / ${acc.pinOrPassword}`
                        : `@${acc.username}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {getRoleScopeSummary(acc.role)}
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
