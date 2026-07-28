/**
 * Vendor Wallet & Virtual Accounts
 * Shows all assigned Squad/Interswitch virtual accounts and lets vendors
 * request new ones, verify bank accounts, transfer funds, and check balances.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { toast } from "sonner";
import { Copy, RefreshCw, Plus, ArrowUpRight, BadgeCheck, Landmark } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type VirtualAccount = {
  id: number; gateway: string; accountNumber: string; bankName?: string;
  accountName?: string; currency: string; type: string; referenceCode?: string;
  createdAt: string;
};

const GATEWAY_LOGO: Record<string, string> = {
  squad:       "https://squadco.com/favicon.ico",
  interswitch: "https://interswitchgroup.com/favicon.ico",
};

function AccountCard({ acc, onDeactivate }: { acc: VirtualAccount; onDeactivate: (id: number) => void }) {
  const [copied, setCopied] = useState(false);
  function copyAcct() {
    navigator.clipboard.writeText(acc.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={GATEWAY_LOGO[acc.gateway]} className="w-5 h-5 rounded-sm" onError={e => (e.currentTarget.style.display="none")} alt="" />
          <span className="text-xs font-bold uppercase text-muted-foreground tracking-wide">{acc.gateway}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${acc.currency === "USD" ? "bg-green-100 text-green-700" : "bg-violet-100 text-violet-700"}`}>{acc.currency}</span>
          {acc.type === "dedicated" && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">Dedicated</span>}
        </div>
        <button onClick={() => onDeactivate(acc.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
      </div>

      <div>
        <p className="text-2xl font-extrabold tracking-widest text-gray-900 dark:text-white">{acc.accountNumber}</p>
        {acc.bankName && <p className="text-sm text-muted-foreground mt-0.5">{acc.bankName}{acc.accountName ? ` · ${acc.accountName}` : ""}</p>}
      </div>

      <button onClick={copyAcct} className="flex items-center gap-2 text-sm text-violet-600 font-semibold hover:underline w-fit">
        <Copy className="w-3.5 h-3.5" />
        {copied ? "Copied!" : "Copy account number"}
      </button>
    </div>
  );
}

// ── Create account dialog ─────────────────────────────────────────────────────

type NewAcctForm = { type: "squad-ngn" | "squad-usd" | "interswitch"; firstName: string; lastName: string; phone: string; email: string; bvn: string; dob: string; address: string; gender: "1" | "2" };

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<NewAcctForm>({ type: "squad-ngn", firstName: "", lastName: "", phone: "", email: "", bvn: "", dob: "", address: "", gender: "1" });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      let url = "";
      let body: Record<string, string> = {};
      if (form.type === "squad-ngn") {
        url = `${BASE}/api/vendor-virtual-accounts/squad-dedicated`;
        body = { firstName: form.firstName, lastName: form.lastName, mobileNumber: form.phone, email: form.email, bvn: form.bvn, dob: form.dob, address: form.address, gender: form.gender };
      } else if (form.type === "squad-usd") {
        url = `${BASE}/api/vendor-virtual-accounts/squad-usd`;
        body = { firstName: form.firstName, lastName: form.lastName, mobileNumber: form.phone, email: form.email };
      } else {
        url = `${BASE}/api/vendor-virtual-accounts/interswitch`;
        body = { phoneNumber: form.phone, lastName: form.lastName, otherNames: form.firstName, email: form.email, bvn: form.bvn };
      }
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Virtual account created!");
      onCreated(); onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  const f = (k: keyof NewAcctForm, v: string) => setForm(p => ({ ...p, [k]: v }));
  const needsBVN = form.type !== "squad-usd";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Add Virtual Account</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1.5">Account Type</label>
            <select value={form.type} onChange={e => f("type", e.target.value as NewAcctForm["type"])} className="w-full px-3 py-2.5 rounded-xl border text-sm bg-background">
              <option value="squad-ngn">Squad — NGN Dedicated Account</option>
              <option value="squad-usd">Squad — USD Virtual Account</option>
              <option value="interswitch">Interswitch — NGN Dedicated Account</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">First Name *</label>
              <input value={form.firstName} onChange={e => f("firstName", e.target.value)} required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Last Name *</label>
              <input value={form.lastName} onChange={e => f("lastName", e.target.value)} required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Phone Number *</label>
            <input value={form.phone} onChange={e => f("phone", e.target.value)} required placeholder="08012345678" className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Email *</label>
            <input value={form.email} onChange={e => f("email", e.target.value)} type="email" required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
          </div>
          {needsBVN && (
            <>
              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">BVN *</label>
                <input value={form.bvn} onChange={e => f("bvn", e.target.value)} required maxLength={11} placeholder="12345678901" className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
              </div>
              {form.type === "squad-ngn" && (
                <>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground block mb-1">Date of Birth *</label>
                    <input value={form.dob} onChange={e => f("dob", e.target.value)} type="date" required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground block mb-1">Address *</label>
                    <input value={form.address} onChange={e => f("address", e.target.value)} required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground block mb-1">Gender *</label>
                    <select value={form.gender} onChange={e => f("gender", e.target.value as "1" | "2")} className="w-full px-3 py-2 rounded-xl border text-sm bg-background">
                      <option value="1">Male</option>
                      <option value="2">Female</option>
                    </select>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-60" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
            {loading ? "Creating…" : "Create Account"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Account Verification ──────────────────────────────────────────────────────

function VerifyAccountPanel() {
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [gateway, setGateway] = useState<"squad" | "interswitch">("squad");
  const [result, setResult] = useState<{ accountName: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${BASE}/api/payments/verify-account`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway, bankCode, accountNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setResult(data);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <BadgeCheck className="w-4 h-4 text-violet-500" />
        <h3 className="font-bold text-sm">Verify Bank Account</h3>
      </div>
      <form onSubmit={verify} className="space-y-3">
        <select value={gateway} onChange={e => setGateway(e.target.value as "squad" | "interswitch")} className="w-full px-3 py-2 rounded-xl border text-sm bg-background">
          <option value="squad">via Squad</option>
          <option value="interswitch">via Interswitch</option>
        </select>
        <input value={bankCode} onChange={e => setBankCode(e.target.value)} placeholder="Bank code (e.g. 058)" required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
        <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Account number" required maxLength={10} className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
        <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-60" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
          {loading ? "Verifying…" : "Verify Account"}
        </button>
        {result && (
          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl">
            <BadgeCheck className="w-4 h-4 text-green-600" />
            <p className="text-sm font-bold text-green-700">{result.accountName}</p>
          </div>
        )}
      </form>
    </div>
  );
}

// ── Transfer panel ────────────────────────────────────────────────────────────

function TransferPanel() {
  const [gateway, setGateway] = useState<"squad" | "interswitch">("squad");
  const [form, setForm] = useState({ amount: "", bankCode: "", accountNumber: "", accountName: "", narration: "" });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const url = gateway === "squad" ? `${BASE}/api/payments/squad/transfer` : `${BASE}/api/payments/interswitch/transfer`;
      const body = gateway === "squad"
        ? { amount: parseFloat(form.amount), bankCode: form.bankCode, accountNumber: form.accountNumber, accountName: form.accountName, remark: form.narration }
        : { amount: parseFloat(form.amount), beneficiaryAccount: form.accountNumber, beneficiaryBankCode: form.bankCode, beneficiaryName: form.accountName, narration: form.narration };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Transfer failed");
      toast.success("Transfer initiated successfully!");
      setForm({ amount: "", bankCode: "", accountNumber: "", accountName: "", narration: "" });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Transfer failed"); }
    finally { setLoading(false); }
  }

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <ArrowUpRight className="w-4 h-4 text-violet-500" />
        <h3 className="font-bold text-sm">Send Money</h3>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <select value={gateway} onChange={e => setGateway(e.target.value as "squad" | "interswitch")} className="w-full px-3 py-2 rounded-xl border text-sm bg-background">
          <option value="squad">via Squad</option>
          <option value="interswitch">via Interswitch</option>
        </select>
        <input value={form.amount} onChange={e => f("amount", e.target.value)} type="number" step="0.01" min="1" placeholder="Amount (NGN)" required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
        <input value={form.bankCode} onChange={e => f("bankCode", e.target.value)} placeholder="Bank code" required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
        <input value={form.accountNumber} onChange={e => f("accountNumber", e.target.value)} placeholder="Account number" required maxLength={10} className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
        <input value={form.accountName} onChange={e => f("accountName", e.target.value)} placeholder="Account name" required className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
        <input value={form.narration} onChange={e => f("narration", e.target.value)} placeholder="Narration (optional)" className="w-full px-3 py-2 rounded-xl border text-sm bg-background" />
        <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-60" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
          {loading ? "Sending…" : "Send Transfer"}
        </button>
      </form>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<"accounts" | "verify" | "transfer">("accounts");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vendor-virtual-accounts"],
    queryFn: () => fetch(`${BASE}/api/vendor-virtual-accounts`).then(r => r.json()),
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/vendor-virtual-accounts/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor-virtual-accounts"] }); toast.success("Account removed"); },
  });

  const accounts: VirtualAccount[] = data?.accounts ?? [];

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2"><Landmark className="w-6 h-6 text-violet-500" /> Wallet & Virtual Accounts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your Squad and Interswitch dedicated bank accounts</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="p-2 rounded-xl border hover:bg-muted/50"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-sm" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
              <Plus className="w-4 h-4" /> Add Account
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted/30 rounded-xl w-fit mb-6">
          {(["accounts","verify","transfer"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? "bg-white dark:bg-gray-800 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "accounts" ? "My Accounts" : t === "verify" ? "Verify Account" : "Send Money"}
            </button>
          ))}
        </div>

        {/* Accounts tab */}
        {tab === "accounts" && (
          <div>
            {isLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1,2].map(i => <div key={i} className="h-40 bg-muted/30 rounded-2xl animate-pulse" />)}
              </div>
            )}
            {!isLoading && accounts.length === 0 && (
              <div className="text-center py-20 border-2 border-dashed rounded-2xl">
                <Landmark className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-bold text-gray-800 dark:text-gray-200 mb-1">No virtual accounts yet</p>
                <p className="text-sm text-muted-foreground mb-4">Get a dedicated bank account number from Squad (NGN or USD) or Interswitch.</p>
                <button onClick={() => setShowCreate(true)} className="px-6 py-2.5 rounded-xl text-white font-bold text-sm" style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                  + Add Account
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map(acc => (
                <AccountCard key={acc.id} acc={acc} onDeactivate={id => deactivate.mutate(id)} />
              ))}
            </div>
          </div>
        )}

        {tab === "verify"   && <VerifyAccountPanel />}
        {tab === "transfer" && <TransferPanel />}
      </div>

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["vendor-virtual-accounts"] })} />}
    </Layout>
  );
}
