/**
 * Vendor Wallet & Payouts
 *
 * Tabs:
 *   - Overview: NGN + USD balance cards, payout request, USD→NGN converter
 *   - Transactions: full credit/debit/payout ledger
 *   - Payouts: payout history
 *   - Bank Accounts: saved payout destinations
 *   - Virtual Accounts: Squad/IS dedicated accounts
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { toast } from "sonner";
import {
  Landmark, Copy, Plus, ArrowUpRight, BadgeCheck, Wallet,
  RefreshCw, CheckCircle, XCircle, Clock, Banknote, ChevronRight,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

type Balance = { ngnBalance: number; usdBalance: number; pendingNgnPayout: number; usdInNgn: number; totalNgn: number; usdToNgn: number };
type TxRow = { id: number; type: string; amount: number; currency: string; description: string; orderId?: number | null; createdAt: string };
type PayoutRow = { id: number; amountNgn: number; status: string; provider: string; requestedAt: string; processedAt?: string | null; failureReason?: string | null };
type BankAcct = { id: number; bankCode: string; bankName: string; accountNumber: string; accountName: string; provider: string; isDefault: boolean; paystackRecipientCode?: string | null };
type VirtualAcct = { id: number; gateway: string; accountNumber: string; bankName?: string; accountName?: string; currency: string; type: string; createdAt: string };

// ── Balance Cards ─────────────────────────────────────────────────────────────

function BalanceCard({ label, amount, currency, sub }: { label: string; amount: number; currency: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
        {currency === "NGN" ? "₦" : "$"}{amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ── Payout request modal ──────────────────────────────────────────────────────

function PayoutModal({ balance, bankAccounts, onClose, onDone }: { balance: Balance; bankAccounts: BankAcct[]; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState<"paystack"|"interswitch"|"squad">("paystack");
  const [bankAccountId, setBankAccountId] = useState<number | "">(bankAccounts.find(a => a.isDefault)?.id ?? "");
  const [convertUsd, setConvertUsd] = useState(false);
  const [loading, setLoading] = useState(false);

  const available = balance.ngnBalance - balance.pendingNgnPayout + (convertUsd ? balance.usdInNgn : 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bankAccountId) { toast.error("Please select a bank account"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/wallet/payout-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountNgn: parseFloat(amount), provider, bankAccountId, convertUsd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Payout request submitted. Awaiting admin approval.");
      onDone(); onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Request Payout</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Available balance</label>
            <p className="text-2xl font-extrabold text-violet-600">₦{available.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</p>
          </div>

          {balance.usdBalance > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={convertUsd} onChange={e => setConvertUsd(e.target.checked)} className="rounded" />
              <span className="text-sm">Convert USD balance (${balance.usdBalance.toFixed(2)} ≈ ₦{balance.usdInNgn.toLocaleString()})</span>
            </label>
          )}

          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Amount (NGN) *</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="1" max={available} required
              placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border text-sm bg-background" />
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Bank Account *</label>
            {bankAccounts.length === 0
              ? <p className="text-sm text-muted-foreground italic">No bank accounts saved. Add one in the Bank Accounts tab.</p>
              : <select value={bankAccountId} onChange={e => setBankAccountId(parseInt(e.target.value))} className="w-full px-3 py-2 rounded-xl border text-sm bg-background">
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName} — {a.accountNumber} ({a.accountName})</option>)}
                </select>
            }
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Payout Provider *</label>
            <select value={provider} onChange={e => setProvider(e.target.value as typeof provider)} className="w-full px-3 py-2 rounded-xl border text-sm bg-background">
              <option value="paystack">Paystack</option>
              <option value="squad">Squad</option>
              <option value="interswitch">Interswitch</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={loading || bankAccounts.length === 0} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-60" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
            {loading ? "Submitting…" : "Request Payout"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Add Bank Account modal ────────────────────────────────────────────────────

function AddBankAccountModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ bankCode: "", bankName: "", accountNumber: "", accountName: "", provider: "paystack" });
  const [loading, setLoading] = useState(false);
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/wallet/bank-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Account saved: ${data.bankAccount?.accountName}`);
      onAdded(); onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Add Bank Account</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Bank Code *</label>
              <input value={form.bankCode} onChange={e => f("bankCode", e.target.value)} required placeholder="058" className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Bank Name *</label>
              <input value={form.bankName} onChange={e => f("bankName", e.target.value)} required placeholder="GTBank" className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Account Number *</label>
            <input value={form.accountNumber} onChange={e => f("accountNumber", e.target.value)} required maxLength={10} placeholder="0123456789" className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Account Name (if known)</label>
            <input value={form.accountName} onChange={e => f("accountName", e.target.value)} placeholder="Auto-resolved via Paystack if blank" className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Preferred Payout Gateway</label>
            <select value={form.provider} onChange={e => f("provider", e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm bg-background">
              <option value="paystack">Paystack</option>
              <option value="squad">Squad</option>
              <option value="interswitch">Interswitch</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-60" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
            {loading ? "Saving…" : "Save Account"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Add Virtual Account modal ─────────────────────────────────────────────────

function AddVirtualAccountModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [type, setType] = useState<"squad-ngn"|"squad-usd"|"interswitch">("squad-ngn");
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", bvn: "", dob: "", address: "", gender: "1" });
  const [loading, setLoading] = useState(false);
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const url = type === "squad-ngn"
        ? `${BASE}/api/vendor-virtual-accounts/squad-dedicated`
        : type === "squad-usd"
        ? `${BASE}/api/vendor-virtual-accounts/squad-usd`
        : `${BASE}/api/vendor-virtual-accounts/interswitch`;
      const body = type === "interswitch"
        ? { phoneNumber: form.phone, lastName: form.lastName, otherNames: form.firstName, email: form.email, bvn: form.bvn }
        : { firstName: form.firstName, lastName: form.lastName, mobileNumber: form.phone, email: form.email, bvn: form.bvn, dob: form.dob, address: form.address, gender: form.gender };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Virtual account created!");
      onAdded(); onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Add Virtual Account</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Account Type</label>
            <select value={type} onChange={e => setType(e.target.value as typeof type)} className="w-full px-3 py-2 rounded-xl border text-sm bg-background">
              <option value="squad-ngn">Squad — NGN Dedicated</option>
              <option value="squad-usd">Squad — USD Virtual</option>
              <option value="interswitch">Interswitch — NGN</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-bold text-muted-foreground block mb-1">First Name *</label><input value={form.firstName} onChange={e => f("firstName", e.target.value)} required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" /></div>
            <div><label className="text-xs font-bold text-muted-foreground block mb-1">Last Name *</label><input value={form.lastName} onChange={e => f("lastName", e.target.value)} required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" /></div>
          </div>
          <div><label className="text-xs font-bold text-muted-foreground block mb-1">Phone *</label><input value={form.phone} onChange={e => f("phone", e.target.value)} required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" /></div>
          <div><label className="text-xs font-bold text-muted-foreground block mb-1">Email *</label><input value={form.email} onChange={e => f("email", e.target.value)} type="email" required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" /></div>
          {type !== "squad-usd" && (<>
            <div><label className="text-xs font-bold text-muted-foreground block mb-1">BVN *</label><input value={form.bvn} onChange={e => f("bvn", e.target.value)} required maxLength={11} className="w-full px-3 py-2 rounded-xl border text-sm bg-background" /></div>
          </>)}
          {type === "squad-ngn" && (<>
            <div><label className="text-xs font-bold text-muted-foreground block mb-1">Date of Birth *</label><input value={form.dob} onChange={e => f("dob", e.target.value)} type="date" required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" /></div>
            <div><label className="text-xs font-bold text-muted-foreground block mb-1">Address *</label><input value={form.address} onChange={e => f("address", e.target.value)} required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" /></div>
            <div><label className="text-xs font-bold text-muted-foreground block mb-1">Gender *</label>
              <select value={form.gender} onChange={e => f("gender", e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm bg-background">
                <option value="1">Male</option><option value="2">Female</option>
              </select>
            </div>
          </>)}
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-60" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Virtual account card (extracted to avoid hook-in-map) ────────────────────

function VirtualAccountCard({ acc, onRemove }: { acc: VirtualAcct; onRemove: (id: number) => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(acc.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase text-muted-foreground tracking-wide">{acc.gateway}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${acc.currency === "USD" ? "bg-green-100 text-green-700" : "bg-violet-100 text-violet-700"}`}>{acc.currency}</span>
        </div>
        <button onClick={() => onRemove(acc.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
      </div>
      <p className="text-2xl font-extrabold tracking-widest text-gray-900 dark:text-white">{acc.accountNumber}</p>
      {acc.bankName && <p className="text-sm text-muted-foreground">{acc.bankName}{acc.accountName ? ` · ${acc.accountName}` : ""}</p>}
      <button onClick={copy} className="flex items-center gap-2 text-sm text-violet-600 font-semibold hover:underline w-fit">
        <Copy className="w-3.5 h-3.5" />{copied ? "Copied!" : "Copy account number"}
      </button>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    completed: { color: "bg-green-100 text-green-700",  icon: <CheckCircle className="w-3 h-3" /> },
    processing:{ color: "bg-blue-100 text-blue-700",    icon: <Clock className="w-3 h-3" /> },
    pending:   { color: "bg-amber-100 text-amber-700",  icon: <Clock className="w-3 h-3" /> },
    failed:    { color: "bg-red-100 text-red-700",      icon: <XCircle className="w-3 h-3" /> },
    credit:    { color: "bg-green-100 text-green-700",  icon: <ArrowUpRight className="w-3 h-3 rotate-180" /> },
    debit:     { color: "bg-red-100 text-red-700",      icon: <ArrowUpRight className="w-3 h-3" /> },
    payout:    { color: "bg-violet-100 text-violet-700",icon: <Banknote className="w-3 h-3" /> },
  };
  const s = map[status] ?? { color: "bg-gray-100 text-gray-600", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold capitalize ${s.color}`}>
      {s.icon}{status}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview"|"transactions"|"payouts"|"bank-accounts"|"virtual-accounts">("overview");
  const [showPayout, setShowPayout] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const [showAddVirtual, setShowAddVirtual] = useState(false);

  const { data: balData, isLoading: balLoading, refetch: refetchBal } = useQuery<{ ngnBalance: number; usdBalance: number; pendingNgnPayout: number; usdInNgn: number; totalNgn: number; usdToNgn: number }>({
    queryKey: ["wallet-balance"],
    queryFn: () => fetch(`${BASE}/api/wallet/balance`).then(r => r.json()),
  });
  const { data: txData, isLoading: txLoading } = useQuery<{ transactions: TxRow[] }>({
    queryKey: ["wallet-transactions"],
    queryFn: () => fetch(`${BASE}/api/wallet/transactions?limit=100`).then(r => r.json()),
    enabled: tab === "transactions",
  });
  const { data: payoutData, isLoading: payoutLoading } = useQuery<{ payouts: PayoutRow[] }>({
    queryKey: ["wallet-payouts"],
    queryFn: () => fetch(`${BASE}/api/wallet/payouts`).then(r => r.json()),
    enabled: tab === "payouts",
  });
  const { data: bankData, isLoading: bankLoading, refetch: refetchBanks } = useQuery<{ bankAccounts: BankAcct[] }>({
    queryKey: ["wallet-bank-accounts"],
    queryFn: () => fetch(`${BASE}/api/wallet/bank-accounts`).then(r => r.json()),
  });
  const { data: vaData, isLoading: vaLoading, refetch: refetchVA } = useQuery<{ accounts: VirtualAcct[] }>({
    queryKey: ["vendor-virtual-accounts"],
    queryFn: () => fetch(`${BASE}/api/vendor-virtual-accounts`).then(r => r.json()),
    enabled: tab === "virtual-accounts",
  });

  const balance = balData ?? { ngnBalance: 0, usdBalance: 0, pendingNgnPayout: 0, usdInNgn: 0, totalNgn: 0, usdToNgn: 1650 };
  const bankAccounts = bankData?.bankAccounts ?? [];

  const setDefaultBank = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/wallet/bank-accounts/${id}/default`, { method: "PUT" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wallet-bank-accounts"] }); toast.success("Default account updated"); },
  });
  const removeBank = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/wallet/bank-accounts/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wallet-bank-accounts"] }); toast.success("Account removed"); },
  });
  const removeVA = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/vendor-virtual-accounts/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor-virtual-accounts"] }); toast.success("Account deactivated"); },
  });

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "transactions" as const, label: "Transactions" },
    { id: "payouts" as const, label: "Payouts" },
    { id: "bank-accounts" as const, label: "Bank Accounts" },
    { id: "virtual-accounts" as const, label: "Virtual Accounts" },
  ];

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              <Wallet className="w-6 h-6 text-violet-500" /> Wallet & Payouts
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage balances, request payouts, and track transactions</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { qc.invalidateQueries({ queryKey: ["wallet-balance"] }); refetchBal(); }} className="p-2 rounded-xl border hover:bg-muted/50"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={() => setShowPayout(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-sm" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
              <Banknote className="w-4 h-4" /> Request Payout
            </button>
          </div>
        </div>

        {/* Balance summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {balLoading
            ? [1,2,3].map(i => <div key={i} className="h-28 bg-muted/30 rounded-2xl animate-pulse" />)
            : (<>
              <BalanceCard label="NGN Balance" amount={balance.ngnBalance} currency="NGN"
                sub={balance.pendingNgnPayout > 0 ? `₦${balance.pendingNgnPayout.toLocaleString()} pending payout` : undefined} />
              <BalanceCard label="USD Balance" amount={balance.usdBalance} currency="USD"
                sub={`≈ ₦${balance.usdInNgn.toLocaleString()} @ ₦${balance.usdToNgn}/USD`} />
              <BalanceCard label="Total (NGN equiv.)" amount={balance.totalNgn} currency="NGN"
                sub="NGN + USD converted" />
            </>)
          }
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted/30 rounded-xl w-full mb-6 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${tab === t.id ? "bg-white dark:bg-gray-800 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Transactions ── */}
        {tab === "transactions" && (
          <div>
            {txLoading && <div className="h-64 bg-muted/30 rounded-2xl animate-pulse" />}
            {!txLoading && (txData?.transactions ?? []).length === 0 && (
              <div className="text-center py-16 border-2 border-dashed rounded-2xl">
                <p className="text-muted-foreground">No transactions yet. Transactions appear when payments are received.</p>
              </div>
            )}
            <div className="space-y-2">
              {(txData?.transactions ?? []).map(tx => (
                <div key={tx.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: tx.type === "credit" ? "#dcfce7" : tx.type === "payout" ? "#ede9fe" : "#fee2e2" }}>
                    {tx.type === "credit" ? <ArrowUpRight className="w-4 h-4 text-green-600 rotate-180" /> :
                     tx.type === "payout" ? <Banknote className="w-4 h-4 text-violet-600" /> :
                     <ArrowUpRight className="w-4 h-4 text-red-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-base font-extrabold ${tx.type === "credit" ? "text-green-600" : "text-red-600"}`}>
                      {tx.type === "credit" ? "+" : "-"}{tx.currency === "NGN" ? "₦" : "$"}{tx.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                    </p>
                    <StatusBadge status={tx.type} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Payouts ── */}
        {tab === "payouts" && (
          <div>
            {payoutLoading && <div className="h-64 bg-muted/30 rounded-2xl animate-pulse" />}
            {!payoutLoading && (payoutData?.payouts ?? []).length === 0 && (
              <div className="text-center py-16 border-2 border-dashed rounded-2xl">
                <p className="text-muted-foreground mb-3">No payout requests yet.</p>
                <button onClick={() => setShowPayout(true)} className="px-5 py-2.5 rounded-xl text-white font-bold text-sm" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>Request Payout</button>
              </div>
            )}
            <div className="space-y-3">
              {(payoutData?.payouts ?? []).map(p => (
                <div key={p.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold">₦{p.amountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">via {p.provider} · Requested {new Date(p.requestedAt).toLocaleDateString("en-NG")}</p>
                  {p.failureReason && <p className="text-xs text-red-500 mt-1">{p.failureReason}</p>}
                  {p.processedAt && <p className="text-xs text-muted-foreground">Processed {new Date(p.processedAt).toLocaleDateString("en-NG")}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bank Accounts ── */}
        {tab === "bank-accounts" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowAddBank(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-sm" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                <Plus className="w-4 h-4" /> Add Account
              </button>
            </div>
            {bankLoading && <div className="h-32 bg-muted/30 rounded-2xl animate-pulse" />}
            {!bankLoading && bankAccounts.length === 0 && (
              <div className="text-center py-16 border-2 border-dashed rounded-2xl">
                <Landmark className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-bold text-gray-800 dark:text-gray-200 mb-1">No bank accounts saved</p>
                <p className="text-sm text-muted-foreground mb-4">Add a bank account to enable payouts.</p>
                <button onClick={() => setShowAddBank(true)} className="px-5 py-2.5 rounded-xl text-white font-bold text-sm" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>+ Add Account</button>
              </div>
            )}
            <div className="space-y-3">
              {bankAccounts.map(a => (
                <div key={a.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm">{a.bankName}</p>
                      {a.isDefault && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-violet-100 text-violet-700">Default</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{a.accountNumber} · {a.accountName}</p>
                    <p className="text-xs text-muted-foreground">via {a.provider}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!a.isDefault && (
                      <button onClick={() => setDefaultBank.mutate(a.id)} className="text-xs text-violet-500 font-semibold hover:underline">Set default</button>
                    )}
                    <button onClick={() => removeBank.mutate(a.id)} className="text-xs text-red-400 hover:text-red-600 font-semibold">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Virtual Accounts ── */}
        {tab === "virtual-accounts" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowAddVirtual(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-sm" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                <Plus className="w-4 h-4" /> Add Virtual Account
              </button>
            </div>
            {vaLoading && <div className="h-32 bg-muted/30 rounded-2xl animate-pulse" />}
            {!vaLoading && (vaData?.accounts ?? []).length === 0 && (
              <div className="text-center py-16 border-2 border-dashed rounded-2xl">
                <Landmark className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-bold text-gray-800 dark:text-gray-200 mb-1">No virtual accounts yet</p>
                <p className="text-sm text-muted-foreground mb-4">Get a dedicated bank account from Squad (NGN or USD) or Interswitch.</p>
                <button onClick={() => setShowAddVirtual(true)} className="px-5 py-2.5 rounded-xl text-white font-bold text-sm" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>+ Add Account</button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(vaData?.accounts ?? []).map(acc => (
                <VirtualAccountCard key={acc.id} acc={acc} onRemove={(id) => removeVA.mutate(id)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <h3 className="font-bold text-sm mb-3">USD → NGN Converter</h3>
              <p className="text-sm text-muted-foreground">Current rate: <strong>₦{balance.usdToNgn.toLocaleString()}</strong> per USD</p>
              {balance.usdBalance > 0 && (
                <p className="text-sm mt-1">Your <strong>${balance.usdBalance.toFixed(2)}</strong> USD = <strong>₦{balance.usdInNgn.toLocaleString()}</strong> NGN at this rate</p>
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <h3 className="font-bold text-sm mb-3">Quick Links</h3>
              <div className="space-y-2">
                {[
                  { label: "View transaction history", sub: "All credits, debits, and payouts", tab: "transactions" as const },
                  { label: "Payout history", sub: "Track your payout requests", tab: "payouts" as const },
                  { label: "Manage bank accounts", sub: "Save payout destinations", tab: "bank-accounts" as const },
                  { label: "Virtual accounts", sub: "Squad & Interswitch dedicated accounts", tab: "virtual-accounts" as const },
                ].map(item => (
                  <button key={item.tab} onClick={() => setTab(item.tab)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted/30 transition-colors text-left">
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.sub}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {showPayout && (
        <PayoutModal balance={balance} bankAccounts={bankAccounts}
          onClose={() => setShowPayout(false)}
          onDone={() => { qc.invalidateQueries({ queryKey: ["wallet-balance"] }); qc.invalidateQueries({ queryKey: ["wallet-payouts"] }); }} />
      )}
      {showAddBank && (
        <AddBankAccountModal onClose={() => setShowAddBank(false)} onAdded={() => refetchBanks()} />
      )}
      {showAddVirtual && (
        <AddVirtualAccountModal onClose={() => setShowAddVirtual(false)} onAdded={() => refetchVA()} />
      )}
    </Layout>
  );
}
