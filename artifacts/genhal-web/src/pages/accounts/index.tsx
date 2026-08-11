/**
 * Secret Accounts tab — dedicated virtual bank accounts for a kingdom or family.
 * NGN via Paystack · USD via Squad.
 * Account numbers are hidden by default with a reveal toggle.
 */
import { useState, useEffect } from "react";
import {
  Eye, EyeOff, Plus, Loader2, Copy, Check, Trash2,
  Building2, DollarSign, AlertCircle, RefreshCw, Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/api";

export interface SecretAccountsProps {
  unitType: "kingdom" | "family";
  unitId: number;
  unitName?: string;
}

interface SecretAccount {
  id: number;
  currency: "NGN" | "USD";
  provider: "paystack" | "squad";
  accountNumber: string;
  accountName: string;
  bankName?: string;
  bankCode?: string;
  routingNumber?: string;
  isActive: boolean;
  createdAt: string;
}

const PAYSTACK_BANKS = [
  { value: "wema-bank",       label: "Wema Bank (ALAT)" },
  { value: "titan-paystack",  label: "Titan Trust Bank" },
  { value: "sterling-bank",   label: "Sterling Bank" },
];

function mask(acctNo: string): string {
  if (acctNo.length <= 4) return "••••••••••";
  return "•".repeat(acctNo.length - 4) + acctNo.slice(-4);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function AccountCard({ account, onDeactivate }: { account: SecretAccount; onDeactivate: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const isNGN = account.currency === "NGN";

  return (
    <Card className={`border-2 ${isNGN ? "border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/40" : "border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50/40"}`}>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl text-white shadow-sm ${isNGN ? "bg-green-600" : "bg-blue-600"}`}>
              {isNGN ? <Landmark className="h-5 w-5" /> : <DollarSign className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-bold text-base">{isNGN ? "NGN Account" : "USD Account"}</p>
              <p className="text-xs text-muted-foreground capitalize">{account.provider} · {account.bankName ?? "Virtual Bank"}</p>
            </div>
          </div>
          <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${isNGN ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
            {account.currency}
          </div>
        </div>

        {/* Account Name */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Account Name</p>
          <p className="font-semibold text-sm">{account.accountName}</p>
        </div>

        {/* Account Number — with reveal toggle */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Account Number</p>
          <div className={`flex items-center gap-2 p-3 rounded-xl border ${isNGN ? "border-green-200 bg-green-50/50" : "border-blue-200 bg-blue-50/50"}`}>
            <code className="flex-1 text-sm font-mono font-bold tracking-widest select-all">
              {revealed ? account.accountNumber : mask(account.accountNumber)}
            </code>
            {revealed && <CopyButton text={account.accountNumber} />}
            <button
              onClick={() => setRevealed(v => !v)}
              className={`p-1.5 rounded-lg transition-colors ${isNGN ? "hover:bg-green-100 text-green-700" : "hover:bg-blue-100 text-blue-700"}`}
              title={revealed ? "Hide account number" : "Reveal account number"}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {!revealed && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Click the eye icon to reveal the full account number
            </p>
          )}
        </div>

        {/* USD routing number */}
        {!isNGN && account.routingNumber && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Routing Number (ABA)</p>
            <div className="flex items-center gap-2 p-3 rounded-xl border border-blue-200 bg-blue-50/50">
              <code className="flex-1 text-sm font-mono font-bold tracking-widest">
                {revealed ? account.routingNumber : mask(account.routingNumber)}
              </code>
              {revealed && <CopyButton text={account.routingNumber} />}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-muted/40">
          <p className="text-[11px] text-muted-foreground">
            Created {new Date(account.createdAt).toLocaleDateString()}
          </p>
          <button
            onClick={onDeactivate}
            className="text-[11px] text-destructive/70 hover:text-destructive flex items-center gap-1 hover:underline"
          >
            <Trash2 className="h-3 w-3" /> Deactivate
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProvisionDialog({
  open, currency, onClose, unitType, unitId, onSuccess,
}: {
  open: boolean;
  currency: "NGN" | "USD";
  onClose: () => void;
  unitType: "kingdom" | "family";
  unitId: number;
  onSuccess: () => void;
}) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const isNGN = currency === "NGN";
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", preferredBank: "wema-bank",
  });

  const provision = async () => {
    if (!form.firstName || !form.lastName || !form.email) {
      toast({ variant: "destructive", title: "First name, last name, and email are required" });
      return;
    }
    setSaving(true);
    try {
      const endpoint = isNGN
        ? `${base}/genhal/accounts/${unitType}/${unitId}/ngn`
        : `${base}/genhal/accounts/${unitType}/${unitId}/usd`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      toast({ title: `${currency} account provisioned!` });
      onSuccess();
      onClose();
      setForm({ firstName: "", lastName: "", email: "", phone: "", preferredBank: "wema-bank" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ variant: "destructive", title: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={`p-2.5 rounded-xl text-white ${isNGN ? "bg-green-600" : "bg-blue-600"}`}>
              {isNGN ? <Landmark className="h-5 w-5" /> : <DollarSign className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="font-serif text-xl">
                Set Up {currency} Account
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isNGN ? "Powered by Paystack · Nigerian bank" : "Powered by Squad · USD virtual account"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className={`p-3 rounded-xl text-sm ${isNGN ? "bg-green-50 border border-green-200 text-green-800" : "bg-blue-50 border border-blue-200 text-blue-800"}`}>
            {isNGN
              ? "A permanent dedicated NGN bank account will be created for this unit. Payments sent to this account are tracked automatically."
              : "A USD virtual account (US bank account details) will be provisioned via Squad. Funds can be received from international senders."}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">First name *</Label>
              <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Last name *</Label>
              <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className="rounded-lg" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Email address *</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="rounded-lg" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Phone number</Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+234…" className="rounded-lg" />
          </div>

          {isNGN && (
            <div className="space-y-1.5">
              <Label className="text-xs">Preferred bank</Label>
              <div className="grid grid-cols-1 gap-2">
                {PAYSTACK_BANKS.map(b => (
                  <button
                    key={b.value}
                    onClick={() => setForm(f => ({ ...f, preferredBank: b.value }))}
                    className={`p-3 rounded-xl border text-sm text-left transition-all font-medium ${form.preferredBank === b.value ? "border-green-500 bg-green-50 text-green-800" : "border-border hover:border-green-300"}`}
                  >
                    <Building2 className="h-3.5 w-3.5 inline mr-2 opacity-60" />
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            className={`w-full rounded-full text-white ${isNGN ? "bg-green-600 hover:bg-green-500" : "bg-blue-600 hover:bg-blue-500"}`}
            onClick={provision}
            disabled={saving || !form.firstName || !form.lastName || !form.email}
          >
            {saving
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Provisioning…</>
              : <><Plus className="mr-2 h-4 w-4" />Create {currency} Account</>}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center">
            {isNGN
              ? "Account details are stored securely. Account numbers are hidden until revealed."
              : "Squad USD accounts are backed by US banking rails. Fees may apply."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SecretAccountsTab({ unitType, unitId, unitName }: SecretAccountsProps) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SecretAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<"NGN" | "USD" | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/accounts/${unitType}/${unitId}`).then(r => r.json());
      setAccounts(Array.isArray(data) ? data : []);
    } catch {
      toast({ variant: "destructive", title: "Failed to load accounts" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [unitType, unitId]);

  const deactivate = async (acc: SecretAccount) => {
    if (!confirm(`Deactivate this ${acc.currency} account? This cannot be undone.`)) return;
    await fetch(`${base}/genhal/accounts/${unitType}/${unitId}/${acc.id}`, { method: "DELETE" });
    toast({ title: "Account deactivated" });
    load();
  };

  const ngnAccount = accounts.find(a => a.currency === "NGN");
  const usdAccount = accounts.find(a => a.currency === "USD");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-serif text-2xl font-bold">Secret Accounts</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          Dedicated virtual bank accounts for receiving payments — NGN via Paystack, USD via Squad. Account numbers are hidden until revealed.
        </p>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold mb-0.5">These are confidential account details</p>
          <p className="text-xs">Account numbers are masked by default. Only authorised members with the right role should reveal or share these details.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {/* NGN column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <h3 className="font-semibold text-sm">Nigerian Naira (NGN)</h3>
              </div>
              {!ngnAccount && (
                <Button size="sm" className="rounded-full h-7 text-xs bg-green-600 hover:bg-green-500 text-white"
                  onClick={() => setDlg("NGN")}>
                  <Plus className="mr-1 h-3 w-3" /> Set Up
                </Button>
              )}
              {ngnAccount && (
                <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              )}
            </div>

            {ngnAccount ? (
              <AccountCard account={ngnAccount} onDeactivate={() => deactivate(ngnAccount)} />
            ) : (
              <div
                className="border-2 border-dashed border-green-200 rounded-2xl p-8 text-center space-y-3 cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors"
                onClick={() => setDlg("NGN")}
              >
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <Landmark className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">No NGN account yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a dedicated Naira account via Paystack to receive NGN payments</p>
                </div>
                <span className="inline-block text-xs text-green-700 font-medium border border-green-300 bg-green-50 px-3 py-1 rounded-full">
                  + Set Up NGN Account
                </span>
              </div>
            )}
          </div>

          {/* USD column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <h3 className="font-semibold text-sm">US Dollar (USD)</h3>
              </div>
              {!usdAccount && (
                <Button size="sm" className="rounded-full h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white"
                  onClick={() => setDlg("USD")}>
                  <Plus className="mr-1 h-3 w-3" /> Set Up
                </Button>
              )}
              {usdAccount && (
                <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              )}
            </div>

            {usdAccount ? (
              <AccountCard account={usdAccount} onDeactivate={() => deactivate(usdAccount)} />
            ) : (
              <div
                className="border-2 border-dashed border-blue-200 rounded-2xl p-8 text-center space-y-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
                onClick={() => setDlg("USD")}
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <DollarSign className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">No USD account yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a US virtual bank account via Squad to receive international USD payments</p>
                </div>
                <span className="inline-block text-xs text-blue-700 font-medium border border-blue-300 bg-blue-50 px-3 py-1 rounded-full">
                  + Set Up USD Account
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Provision dialogs */}
      {dlg && (
        <ProvisionDialog
          open
          currency={dlg}
          onClose={() => setDlg(null)}
          unitType={unitType}
          unitId={unitId}
          onSuccess={load}
        />
      )}
    </div>
  );
}
