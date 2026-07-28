/**
 * Interswitch — full vendor-facing feature hub.
 *
 * Tabs:
 *  • Overview        — dedicated/virtual account details + quick-action cards
 *  • Transfers       — send money to any Nigerian bank account
 *  • Bills Payment   — pay airtime, DSTV, electricity, data, water, etc.
 *  • Verify          — account name lookup & BVN verification
 *  • Refunds         — refund a previous Interswitch transaction
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2, Wallet, ArrowRightLeft, Receipt, ShieldCheck, RotateCcw,
  Copy, Check, Loader2, AlertCircle, CheckCircle2, CreditCard, Zap,
  Tv2, Droplets, Phone, Wifi, Plus, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

type VirtualAccount = {
  id: number;
  gateway: string;
  accountNumber: string;
  accountName: string | null;
  bankName: string | null;
  bankCode: string | null;
  type: string;
  walletId: string | null;
  isActive: boolean;
  createdAt: string;
};

type Biller = {
  id: string;
  name: string;
  shortName: string;
  categoryId: string;
  categoryName: string;
};

type BillerItem = {
  id: string;
  name: string;
  paymentCode: string;
  amount: string;
  isAmountFixed: boolean;
  currencyCode: string;
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data;
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const qc = useQueryClient();
  const { data: accounts, isLoading } = useQuery<VirtualAccount[]>({
    queryKey: ["vendor-virtual-accounts"],
    queryFn: () => apiFetch("/api/vendor-virtual-accounts").then((d: any) => d.accounts ?? []),
  });

  const isVirtuals = accounts?.filter(a => a.gateway === "interswitch" && a.isActive) ?? [];

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ phone: "", lastName: "", otherNames: "", email: "", bvn: "" });

  async function createDedicatedAccount() {
    if (!form.phone || !form.lastName || !form.otherNames) {
      toast.error("Phone, last name and other names are required"); return;
    }
    setCreating(true);
    try {
      await apiFetch("/api/vendor-virtual-accounts/interswitch", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast.success("Dedicated account created!");
      qc.invalidateQueries({ queryKey: ["vendor-virtual-accounts"] });
      setForm({ phone: "", lastName: "", otherNames: "", email: "", bvn: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Feature summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: <Wallet className="w-5 h-5" />, title: "Dedicated Account", desc: "Receive payments directly to a unique bank account number", color: "text-orange-500" },
          { icon: <ArrowRightLeft className="w-5 h-5" />, title: "Bank Transfers", desc: "Send money to any Nigerian bank account instantly", color: "text-violet-500" },
          { icon: <Receipt className="w-5 h-5" />, title: "Bills Payment", desc: "Pay airtime, DSTV, electricity, data and more", color: "text-teal-500" },
          { icon: <ShieldCheck className="w-5 h-5" />, title: "Verification", desc: "Verify bank account names and BVN in real time", color: "text-blue-500" },
        ].map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <Card className="h-full border-border/50 bg-card/60 backdrop-blur-sm">
              <CardContent className="pt-5 space-y-2">
                <div className={`${c.color}`}>{c.icon}</div>
                <p className="font-semibold text-sm">{c.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.desc}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Active dedicated accounts */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-orange-500" /> Dedicated Accounts
              </CardTitle>
              <CardDescription>Receive payments without a checkout link — customers pay directly to your account number.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["vendor-virtual-accounts"] })}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : isVirtuals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Interswitch dedicated accounts yet. Create one below.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {isVirtuals.map(acc => (
                <div key={acc.id} className="rounded-lg border bg-muted/30 p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{acc.bankName ?? "Interswitch Bank"}</span>
                    <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10 text-xs">Active</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-mono font-bold tracking-widest">{acc.accountNumber}</span>
                    <CopyBtn text={acc.accountNumber} />
                  </div>
                  {acc.accountName && <p className="text-sm text-muted-foreground">{acc.accountName}</p>}
                  {acc.walletId && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>Wallet ID:</span>
                      <span className="font-mono">{acc.walletId}</span>
                      <CopyBtn text={acc.walletId} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <Separator />

          <div>
            <p className="text-sm font-medium mb-3">Create new dedicated account</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone number *</Label>
                <Input placeholder="08012345678" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last name *</Label>
                <Input placeholder="Doe" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Other names *</Label>
                <Input placeholder="John" value={form.otherNames} onChange={e => setForm(f => ({ ...f, otherNames: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email (optional)</Label>
                <Input type="email" placeholder="john@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">BVN (optional — required for higher limits)</Label>
                <Input placeholder="22234567890" value={form.bvn} onChange={e => setForm(f => ({ ...f, bvn: e.target.value }))} />
              </div>
            </div>
            <Button className="mt-3 gap-2" onClick={createDedicatedAccount} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {creating ? "Creating…" : "Create dedicated account"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Transfers Tab ─────────────────────────────────────────────────────────────

const BANKS = [
  { code: "011", name: "First Bank" }, { code: "033", name: "United Bank for Africa" },
  { code: "044", name: "Access Bank" }, { code: "050", name: "EcoBank" },
  { code: "058", name: "GTBank" }, { code: "063", name: "Diamond Bank" },
  { code: "070", name: "Fidelity Bank" }, { code: "076", name: "Skye Bank" },
  { code: "082", name: "Keystone Bank" }, { code: "100", name: "SunTrust Bank" },
  { code: "214", name: "FCMB" }, { code: "215", name: "Unity Bank" },
  { code: "221", name: "Stanbic IBTC" }, { code: "232", name: "Sterling Bank" },
  { code: "301", name: "Jaiz Bank" }, { code: "315", name: "Rubies Bank" },
  { code: "326", name: "Spring Bank" }, { code: "401", name: "Rand Merchant Bank" },
  { code: "044", name: "Zenith Bank" }, { code: "057", name: "Zenith Bank" },
];

function TransfersTab() {
  const [form, setForm] = useState({
    beneficiaryAccount: "", beneficiaryBankCode: "", beneficiaryName: "",
    amount: "", narration: "",
  });
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ ref: string; desc: string } | null>(null);

  async function verifyAccount() {
    if (!form.beneficiaryAccount || !form.beneficiaryBankCode) {
      toast.error("Enter account number and select a bank first"); return;
    }
    setVerifying(true); setVerified(null);
    try {
      const r = await apiFetch<{ accountName: string }>("/api/payments/interswitch/verify-account", {
        method: "POST",
        body: JSON.stringify({ accountNumber: form.beneficiaryAccount, bankCode: form.beneficiaryBankCode }),
      });
      setVerified(r.accountName);
      setForm(f => ({ ...f, beneficiaryName: r.accountName }));
      toast.success(`Account verified: ${r.accountName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally { setVerifying(false); }
  }

  async function sendMoney() {
    if (!form.beneficiaryAccount || !form.beneficiaryBankCode || !form.beneficiaryName || !form.amount) {
      toast.error("Fill all required fields"); return;
    }
    setSending(true); setLastResult(null);
    try {
      const r = await apiFetch<{ requestRef: string; responseDescription: string }>("/api/payments/interswitch/transfer", {
        method: "POST",
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          beneficiaryAccount: form.beneficiaryAccount,
          beneficiaryBankCode: form.beneficiaryBankCode,
          beneficiaryName: form.beneficiaryName,
          narration: form.narration || undefined,
        }),
      });
      setLastResult({ ref: r.requestRef, desc: r.responseDescription });
      toast.success("Transfer initiated successfully!");
      setForm({ beneficiaryAccount: "", beneficiaryBankCode: "", beneficiaryName: "", amount: "", narration: "" });
      setVerified(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally { setSending(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-violet-500" /> Send Money
        </CardTitle>
        <CardDescription>Transfer funds to any Nigerian bank account via Interswitch Quickteller.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastResult && (
          <Alert className="border-emerald-500/30 bg-emerald-500/10">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <AlertDescription className="text-xs space-y-1">
              <p className="font-medium text-emerald-700">Transfer sent successfully</p>
              <p className="text-muted-foreground">Reference: <span className="font-mono">{lastResult.ref}</span></p>
              <p className="text-muted-foreground">{lastResult.desc}</p>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Bank *</Label>
            <Select value={form.beneficiaryBankCode} onValueChange={v => { setForm(f => ({ ...f, beneficiaryBankCode: v })); setVerified(null); }}>
              <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
              <SelectContent>
                {BANKS.map(b => <SelectItem key={b.code + b.name} value={b.code}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Account number *</Label>
            <div className="flex gap-2">
              <Input
                placeholder="0123456789"
                value={form.beneficiaryAccount}
                onChange={e => { setForm(f => ({ ...f, beneficiaryAccount: e.target.value })); setVerified(null); }}
              />
              <Button variant="outline" size="sm" onClick={verifyAccount} disabled={verifying} className="shrink-0">
                {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verify"}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Account name *</Label>
            <Input
              placeholder={verified ?? "Verify account to auto-fill"}
              value={form.beneficiaryName}
              onChange={e => setForm(f => ({ ...f, beneficiaryName: e.target.value }))}
              className={verified ? "border-emerald-500/50 bg-emerald-500/5" : ""}
            />
            {verified && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verified</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Amount (NGN) *</Label>
            <Input type="number" min="1" placeholder="5000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Narration (optional)</Label>
            <Input placeholder="Payment for services" value={form.narration} onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} />
          </div>
        </div>

        <Button className="gap-2" onClick={sendMoney} disabled={sending}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
          {sending ? "Sending…" : "Send money"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Bills Tab ─────────────────────────────────────────────────────────────────

const BILL_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  airtime: <Phone className="w-4 h-4" />,
  data: <Wifi className="w-4 h-4" />,
  cable: <Tv2 className="w-4 h-4" />,
  electricity: <Zap className="w-4 h-4" />,
  water: <Droplets className="w-4 h-4" />,
};

function BillsTab() {
  const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
  const [selectedItem, setSelectedItem] = useState<BillerItem | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [paying, setPaying] = useState(false);
  const [lastResult, setLastResult] = useState<{ ref: string; transRef: string } | null>(null);
  const [search, setSearch] = useState("");

  const { data: billersData, isLoading: loadingBillers } = useQuery<{ billers: Biller[] }>({
    queryKey: ["is-billers"],
    queryFn: () => apiFetch("/api/payments/interswitch/bills/billers"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: itemsData, isLoading: loadingItems } = useQuery<{ paymentItems: BillerItem[] }>({
    queryKey: ["is-biller-items", selectedBiller?.id],
    queryFn: () => apiFetch(`/api/payments/interswitch/bills/billers/${selectedBiller!.id}/items`),
    enabled: !!selectedBiller,
  });

  const billers = billersData?.billers ?? [];
  const items = itemsData?.paymentItems ?? [];

  const filteredBillers = billers.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.categoryName.toLowerCase().includes(search.toLowerCase())
  );

  // Group billers by category
  const grouped = filteredBillers.reduce<Record<string, Biller[]>>((acc, b) => {
    const cat = b.categoryName || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(b);
    return acc;
  }, {});

  async function validateBill() {
    if (!selectedItem || !customerId) { toast.error("Select a service and enter your account/meter/card number"); return; }
    setValidating(true); setValidated(false);
    try {
      const r = await apiFetch<{ customerName: string; amount: string }>("/api/payments/interswitch/bills/validate", {
        method: "POST",
        body: JSON.stringify({ paymentCode: selectedItem.paymentCode, customerId }),
      });
      setCustomerName(r.customerName ?? "");
      if (selectedItem.isAmountFixed && r.amount && r.amount !== "0") setAmount((parseFloat(r.amount) / 100).toFixed(2));
      setValidated(true);
      toast.success(`Customer confirmed: ${r.customerName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
    } finally { setValidating(false); }
  }

  async function payBill() {
    if (!selectedItem || !customerId || !amount) { toast.error("Fill all required fields"); return; }
    setPaying(true); setLastResult(null);
    try {
      const r = await apiFetch<{ requestRef: string; transactionRef: string }>("/api/payments/interswitch/bills/pay", {
        method: "POST",
        body: JSON.stringify({
          paymentCode: selectedItem.paymentCode,
          customerId,
          amount: parseFloat(amount),
          customerName: customerName || undefined,
          customerEmail: customerEmail || undefined,
        }),
      });
      setLastResult({ ref: r.requestRef, transRef: r.transactionRef });
      toast.success("Bill paid successfully!");
      setCustomerId(""); setAmount(""); setCustomerName(""); setCustomerEmail(""); setValidated(false);
      setSelectedItem(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally { setPaying(false); }
  }

  return (
    <div className="space-y-6">
      {lastResult && (
        <Alert className="border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <AlertDescription className="text-xs space-y-1">
            <p className="font-medium text-emerald-700">Bill payment successful</p>
            <div className="text-muted-foreground space-y-0.5">
              <p>Reference: <span className="font-mono">{lastResult.ref}</span></p>
              <p>Transaction ref: <span className="font-mono">{lastResult.transRef}</span></p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Biller selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">1. Select a service</CardTitle>
            <Input
              placeholder="Search billers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </CardHeader>
          <CardContent className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {loadingBillers ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading billers…</div>
            ) : Object.keys(grouped).length === 0 ? (
              <p className="text-sm text-muted-foreground">No billers found.</p>
            ) : (
              Object.entries(grouped).map(([cat, catBillers]) => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    {BILL_CATEGORY_ICONS[cat.toLowerCase().split(" ")[0]!] ?? <Receipt className="w-3.5 h-3.5" />}
                    {cat}
                  </p>
                  <div className="space-y-1">
                    {catBillers.map(b => (
                      <button
                        key={b.id}
                        onClick={() => { setSelectedBiller(b); setSelectedItem(null); setValidated(false); }}
                        className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors ${
                          selectedBiller?.id === b.id
                            ? "bg-orange-500/15 text-orange-700 border border-orange-500/30"
                            : "hover:bg-muted/60 border border-transparent"
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Payment form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">2. Fill payment details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedBiller ? (
              <p className="text-sm text-muted-foreground">Select a biller on the left to continue.</p>
            ) : loadingItems ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading packages…</div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Package / amount *</Label>
                  <Select value={selectedItem?.paymentCode ?? ""} onValueChange={v => {
                    const item = items.find(i => i.paymentCode === v) ?? null;
                    setSelectedItem(item);
                    if (item?.isAmountFixed && item.amount !== "0") setAmount((parseFloat(item.amount) / 100).toFixed(2));
                    setValidated(false);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                    <SelectContent>
                      {items.map(i => (
                        <SelectItem key={i.paymentCode} value={i.paymentCode}>
                          {i.name} {i.amount !== "0" ? `— ${i.currencySymbol ?? "₦"}${(parseFloat(i.amount) / 100).toLocaleString()}` : "(variable)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Account / meter / smart-card / phone *</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Customer ID"
                      value={customerId}
                      onChange={e => { setCustomerId(e.target.value); setValidated(false); }}
                    />
                    <Button variant="outline" size="sm" onClick={validateBill} disabled={validating || !selectedItem} className="shrink-0">
                      {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Validate"}
                    </Button>
                  </div>
                  {validated && customerName && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {customerName}</p>
                  )}
                </div>

                {selectedItem && !selectedItem.isAmountFixed && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount (NGN) *</Label>
                    <Input type="number" min="1" placeholder="500" value={amount} onChange={e => setAmount(e.target.value)} />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Customer email (optional)</Label>
                  <Input type="email" placeholder="customer@example.com" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
                </div>

                <Button className="w-full gap-2" onClick={payBill} disabled={paying || !selectedItem || !customerId || !amount}>
                  {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  {paying ? "Processing…" : `Pay ₦${amount ? parseFloat(amount).toLocaleString() : "—"}`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Verify Tab ────────────────────────────────────────────────────────────────

function VerifyTab() {
  const [accForm, setAccForm] = useState({ bankCode: "", accountNumber: "" });
  const [accResult, setAccResult] = useState<{ accountName: string; bankCode: string } | null>(null);
  const [accLoading, setAccLoading] = useState(false);

  const [bvnValue, setBvnValue] = useState("");
  const [bvnResult, setBvnResult] = useState<{ firstName: string; lastName: string; dateOfBirth: string; phoneNumber: string; gender: string } | null>(null);
  const [bvnLoading, setBvnLoading] = useState(false);

  async function verifyAccount() {
    if (!accForm.bankCode || !accForm.accountNumber) { toast.error("Select a bank and enter an account number"); return; }
    setAccLoading(true); setAccResult(null);
    try {
      const r = await apiFetch<{ accountName: string; bankCode: string }>("/api/payments/interswitch/verify-account", {
        method: "POST",
        body: JSON.stringify({ bankCode: accForm.bankCode, accountNumber: accForm.accountNumber }),
      });
      setAccResult(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verification failed"); }
    finally { setAccLoading(false); }
  }

  async function verifyBVN() {
    if (!bvnValue || bvnValue.length !== 11) { toast.error("BVN must be 11 digits"); return; }
    setBvnLoading(true); setBvnResult(null);
    try {
      const r = await apiFetch<typeof bvnResult>("/api/payments/interswitch/verify-bvn", {
        method: "POST",
        body: JSON.stringify({ bvn: bvnValue }),
      });
      setBvnResult(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "BVN verification failed"); }
    finally { setBvnLoading(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Account name verification */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" /> Account name lookup
          </CardTitle>
          <CardDescription>Confirm a bank account belongs to the right person before sending money.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Bank</Label>
            <Select value={accForm.bankCode} onValueChange={v => setAccForm(f => ({ ...f, bankCode: v }))}>
              <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
              <SelectContent>{BANKS.map(b => <SelectItem key={b.code + b.name} value={b.code}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Account number</Label>
            <Input placeholder="0123456789" value={accForm.accountNumber} onChange={e => setAccForm(f => ({ ...f, accountNumber: e.target.value }))} />
          </div>
          <Button onClick={verifyAccount} disabled={accLoading} className="gap-2">
            {accLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {accLoading ? "Verifying…" : "Lookup account name"}
          </Button>
          {accResult && (
            <div className="rounded-lg border bg-blue-500/10 border-blue-500/30 p-3 space-y-1 text-sm">
              <p className="font-semibold text-blue-700">{accResult.accountName}</p>
              <p className="text-xs text-muted-foreground">Bank code: {accResult.bankCode}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BVN verification */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-violet-500" /> BVN verification
          </CardTitle>
          <CardDescription>Verify a Bank Verification Number and retrieve basic KYC details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">BVN (11 digits)</Label>
            <Input placeholder="22234567890" value={bvnValue} onChange={e => setBvnValue(e.target.value.replace(/\D/g, "").slice(0, 11))} />
          </div>
          <Button onClick={verifyBVN} disabled={bvnLoading} className="gap-2">
            {bvnLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {bvnLoading ? "Verifying…" : "Verify BVN"}
          </Button>
          {bvnResult && (
            <div className="rounded-lg border bg-violet-500/10 border-violet-500/30 p-3 space-y-1 text-sm">
              <p className="font-semibold">{bvnResult.firstName} {bvnResult.lastName}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                <span>DOB: {bvnResult.dateOfBirth}</span>
                <span>Phone: {bvnResult.phoneNumber}</span>
                <span>Gender: {bvnResult.gender}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Refunds Tab ───────────────────────────────────────────────────────────────

function RefundsTab() {
  const [transactionRef, setTransactionRef] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ responseCode: string; responseDescription: string } | null>(null);

  async function submit() {
    if (!transactionRef || !amount) { toast.error("Transaction reference and amount are required"); return; }
    setLoading(true); setResult(null);
    try {
      const r = await apiFetch<typeof result>("/api/payments/interswitch/refund", {
        method: "POST",
        body: JSON.stringify({ transactionRef, amount: parseFloat(amount), reason: reason || undefined }),
      });
      setResult(r);
      if (r?.responseCode === "00") {
        toast.success("Refund processed successfully");
        setTransactionRef(""); setAmount(""); setReason("");
      } else {
        toast.warning(`Refund response: ${r?.responseDescription}`);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Refund failed"); }
    finally { setLoading(false); }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-blue-500" /> Process a refund
        </CardTitle>
        <CardDescription>Refund a customer's Interswitch payment back to their original account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result && (
          <Alert className={result.responseCode === "00" ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}>
            {result.responseCode === "00"
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              : <AlertCircle className="w-4 h-4 text-amber-500" />
            }
            <AlertDescription className="text-xs">{result.responseDescription}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Transaction reference *</Label>
          <Input placeholder="IS-123-1720000000000" value={transactionRef} onChange={e => setTransactionRef(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Refund amount (NGN) *</Label>
          <Input type="number" min="1" placeholder="5000" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Reason (optional)</Label>
          <Input placeholder="Customer returned item" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <Button onClick={submit} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          {loading ? "Processing…" : "Process refund"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InterswitchPage() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="relative p-6 max-w-7xl mx-auto space-y-6 w-full overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -top-20 -right-20 w-[400px] h-[400px] rounded-full bg-orange-500/6 blur-[100px]"
          animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-[350px] h-[350px] rounded-full bg-violet-500/5 blur-[90px]"
          animate={{ x: [0, 25, 0], y: [0, -20, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        />
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Interswitch</h1>
            <p className="text-muted-foreground text-sm">Payments, transfers, bills, verification — powered by Quickteller</p>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="overview" className="gap-1.5"><Wallet className="w-3.5 h-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="transfers" className="gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5" /> Transfers</TabsTrigger>
          <TabsTrigger value="bills" className="gap-1.5"><Receipt className="w-3.5 h-3.5" /> Bills</TabsTrigger>
          <TabsTrigger value="verify" className="gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Verify</TabsTrigger>
          <TabsTrigger value="refunds" className="gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Refunds</TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <TabsContent value="overview" forceMount hidden={tab !== "overview"}><OverviewTab /></TabsContent>
            <TabsContent value="transfers" forceMount hidden={tab !== "transfers"}><TransfersTab /></TabsContent>
            <TabsContent value="bills" forceMount hidden={tab !== "bills"}><BillsTab /></TabsContent>
            <TabsContent value="verify" forceMount hidden={tab !== "verify"}><VerifyTab /></TabsContent>
            <TabsContent value="refunds" forceMount hidden={tab !== "refunds"}><RefundsTab /></TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
