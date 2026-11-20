import React, { useMemo, useState } from 'react';
import { Plus, Users, X } from 'lucide-react';
import { Party, PartyType, PharmacySettings } from '../types/pharmacy';
import { formatMoney, getCurrencyLabel } from '../services/localDb';

interface PartiesWorkspaceProps {
  parties: Party[];
  settings?: PharmacySettings;
  onAddParty: (party: Omit<Party, 'id'>) => void;
  onSettleBalance: (partyId: number, amount: number) => void;
}

export const PartiesWorkspace: React.FC<PartiesWorkspaceProps> = ({
  parties,
  settings,
  onAddParty,
  onSettleBalance,
}) => {
  const cur = getCurrencyLabel(settings);
  const [activeType, setActiveType] = useState<PartyType>('customer');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<Party | null>(null);
  const [settleAmount, setSettleAmount] = useState('');

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newType, setNewType] = useState<PartyType>('customer');
  const [newBalance, setNewBalance] = useState('0');

  const totals = useMemo(() => {
    const toCollect = parties
      .filter((p) => p.type === 'customer')
      .reduce((s, p) => s + p.balance, 0);
    const toPay = parties
      .filter((p) => p.type === 'supplier')
      .reduce((s, p) => s + p.balance, 0);
    return { toCollect, toPay };
  }, [parties]);

  const filtered = useMemo(
    () => parties.filter((p) => p.type === activeType),
    [parties, activeType],
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddParty({
      name: newName.trim(),
      phone: newPhone.trim(),
      type: newType,
      balance: Math.max(0, Number(newBalance) || 0),
    });
    setNewName('');
    setNewPhone('');
    setNewBalance('0');
    setIsAddOpen(false);
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTarget) return;
    const amt = Math.max(0, Number(settleAmount) || 0);
    if (amt > 0) {
      onSettleBalance(settleTarget.id, amt);
    }
    setSettleTarget(null);
    setSettleAmount('');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* To Collect / To Pay Ledger Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total To Collect (Customer Credit)
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-[#0D7A5F] dark:text-emerald-400">
            {formatMoney(totals.toCollect, settings)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Receivable from local clinic & credit patients
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total To Pay (Distributor Payables)
          </p>
          <p className="mt-1 font-mono-tabular text-2xl font-bold text-amber-700 dark:text-amber-400">
            {formatMoney(totals.toPay, settings)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Outstanding balance to wholesale pharmaceutical suppliers
          </p>
        </div>
      </div>

      {/* Filter & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveType('customer')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              activeType === 'customer'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Customers (To Collect)
          </button>
          <button
            type="button"
            onClick={() => setActiveType('supplier')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              activeType === 'supplier'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Suppliers (To Pay)
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewType(activeType);
            setIsAddOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D]"
        >
          <Plus className="h-4 w-4" />
          <span>Add Party</span>
        </button>
      </div>

      {/* Party Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
            <tr>
              <th className="px-5 py-3">Party Name</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3 text-right">
                {activeType === 'customer' ? 'To Collect' : 'To Pay'}
              </th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {filtered.map((party) => (
              <tr
                key={party.id}
                className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
              >
                <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    <span>{party.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 font-mono-tabular text-slate-600 dark:text-slate-400">
                  {party.phone || '—'}
                </td>
                <td
                  className={`px-5 py-3.5 text-right font-mono-tabular font-semibold ${
                    party.balance > 0
                      ? activeType === 'customer'
                        ? 'text-[#0D7A5F] dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {formatMoney(party.balance, settings)}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {party.balance > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSettleTarget(party);
                        setSettleAmount(String(party.balance));
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {activeType === 'customer'
                        ? 'Record Collection'
                        : 'Record Payment'}
                    </button>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">
                      Settled
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Party Modal */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/70"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleAddSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Add Customer or Supplier
              </h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Party Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as PartyType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="customer">Customer (To Collect)</option>
                  <option value="supplier">Supplier (To Pay)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Full Name / Clinic / Distributor
                </label>
                <input
                  required
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="03XX-XXXXXXX"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Opening Balance ({cur})
                </label>
                <input
                  type="number"
                  min={0}
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A634D]"
              >
                Save Party
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settle Balance Modal */}
      {settleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/70"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSettleSubmit}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {settleTarget.type === 'customer'
                ? 'Record Collection'
                : 'Record Supplier Payment'}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {settleTarget.name} · Current Balance:{' '}
              <span className="font-mono-tabular font-semibold text-slate-700 dark:text-slate-200">
                {formatMoney(settleTarget.balance, settings)}
              </span>
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Amount ({cur})
              </label>
              <input
                required
                type="number"
                min={1}
                max={settleTarget.balance}
                step="0.01"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-tabular text-sm text-slate-900 focus:border-[#0D7A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettleTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D7A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A634D]"
              >
                Confirm Settlement
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
