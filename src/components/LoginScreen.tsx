import React, { useState } from 'react';
import { Eye, EyeOff, Lock, LogIn, ShieldCheck, User } from 'lucide-react';

export interface StaffSession {
  username: string;
  displayName: string;
  role: 'Chief Pharmacist' | 'POS Cashier';
  loggedInAt: string;
}

interface StaffCredential {
  username: string;
  pin: string;
  displayName: string;
  role: 'Chief Pharmacist' | 'POS Cashier';
}

const STAFF_ACCOUNTS: StaffCredential[] = [
  {
    username: 'admin',
    pin: '1234',
    displayName: 'Dr. Khalid Minhas',
    role: 'Chief Pharmacist',
  },
  {
    username: 'cashier',
    pin: '1111',
    displayName: 'Counter Cashier (Shift A)',
    role: 'POS Cashier',
  },
];

interface LoginScreenProps {
  onLoginSuccess: (session: StaffSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('admin');
  const [pin, setPin] = useState('1234');
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
      (acc) => acc.username.toLowerCase() === cleanUser && acc.pin === cleanPin,
    );

    if (!matched) {
      setError(
        'Invalid Staff ID or PIN. Use admin / 1234 or cashier / 1111.',
      );
      return;
    }

    setError(null);
    onLoginSuccess({
      username: matched.username,
      displayName: matched.displayName,
      role: matched.role,
      loggedInAt: new Date().toISOString(),
    });
  };

  const handleQuickFill = (account: StaffCredential) => {
    setUsername(account.username);
    setPin(account.pin);
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-10 text-[#0F172A]">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 sm:p-8">
        {/* Pharmacy Header */}
        <div className="border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2.5 text-[#0D7A5F]">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Offline Pharmacy POS Terminal
            </span>
          </div>
          <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-slate-900">
            Clinix Community Pharmacy
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            17 KM Ferozepur Road, Lahore · Staff Authentication
          </p>
        </div>

        {/* Sign-In Form */}
        <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="login-staff-id"
              className="mb-1.5 block text-xs font-medium text-slate-700"
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
                placeholder="admin or cashier"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-pin"
              className="mb-1.5 block text-xs font-medium text-slate-700"
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
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-10 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]/20"
              />
              <button
                type="button"
                onClick={() => setShowPin((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-[11px] font-medium text-slate-500">
            Quick Staff Sign-In Profiles
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STAFF_ACCOUNTS.map((acc) => {
              const selected =
                username.trim().toLowerCase() === acc.username &&
                pin.trim() === acc.pin;
              return (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => handleQuickFill(acc)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'border-[#0D7A5F] bg-[#0D7A5F]/[0.04]'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-900">
                    {acc.displayName}
                  </p>
                  <p className="mt-0.5 font-mono-tabular text-[11px] text-slate-500">
                    {acc.role} · {acc.username} / {acc.pin}
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
