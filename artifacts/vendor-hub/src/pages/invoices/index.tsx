import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useUser } from "@clerk/react";
import { useListVendors } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, FileText, DollarSign, CheckCircle2, AlertTriangle, Trash2,
  Send, Copy, MessageSquare, Eye, RefreshCw, Sparkles, X,
  ChevronRight, ChevronLeft, Clock, TrendingUp,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Animation config (mirrors dashboard.tsx) ──────────────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: 0.4 } },
};

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};

const cardStagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07, delayChildren: 0.25 } },
};

const slideIn = {
  hidden: { opacity: 0, x: -16 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE } },
};

// ── Animated counter (mirrors dashboard.tsx) ──────────────────────────────────
function useCountUp(target: number, duration = 1.2, delay = 0.3) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = (now - start) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        setCount(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay * 1000);
    return () => clearTimeout(timeout);
  }, [target, duration, delay]);
  return count;
}

// ── Aurora background ─────────────────────────────────────────────────────────
function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-violet-500/8 blur-[130px]"
        animate={{ x: [0, 50, 0], y: [0, 60, 0], scale: [1, 1.07, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[110px]"
        animate={{ x: [0, -60, 0], y: [0, -40, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut", delay: 5 }}
      />
      <motion.div
        className="absolute -bottom-16 left-1/3 w-[350px] h-[350px] rounded-full bg-emerald-500/5 blur-[90px]"
        animate={{ x: [0, 35, 0], y: [0, -35, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 9 }}
      />
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "cancelled";
type Invoice = {
  id: number; customerName: string; customerEmail?: string | null;
  customerPhone?: string | null; currency: string; totalAmount: string;
  status: InvoiceStatus; dueDate?: string | null; shareToken: string;
  sentAt?: string | null; createdAt: string;
};
type InvoiceSummary = { totalBilled: number; totalCollected: number; outstanding: number };
type LineItem = { description: string; quantity: number; unitPrice: number; type: "service" | "product" };

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS: Record<InvoiceStatus, { label: string; from: string; to: string; dot: string }> = {
  draft:          { label: "Draft",          from: "from-slate-500/20",   to: "to-slate-500/5",   dot: "bg-slate-400" },
  sent:           { label: "Sent",           from: "from-blue-500/20",    to: "to-blue-500/5",    dot: "bg-blue-400" },
  partially_paid: { label: "Partial",        from: "from-amber-500/20",   to: "to-amber-500/5",   dot: "bg-amber-400" },
  paid:           { label: "Paid",           from: "from-emerald-500/20", to: "to-emerald-500/5", dot: "bg-emerald-400" },
  overdue:        { label: "Overdue",        from: "from-red-500/20",     to: "to-red-500/5",     dot: "bg-red-400" },
  cancelled:      { label: "Cancelled",      from: "from-gray-500/20",    to: "to-gray-500/5",    dot: "bg-gray-500" },
};

function StatusPill({ status }: { status: InvoiceStatus }) {
  const s = STATUS[status] ?? STATUS.draft;
  return (
    <motion.span
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${s.from} ${s.to} border border-white/10`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
      {s.label}
    </motion.span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function SummaryCard({
  title, rawValue, prefix = "", suffix = "", icon: Icon, gradient, subtext, delay = 0,
}: {
  title: string; rawValue: number; prefix?: string; suffix?: string;
  icon: React.ComponentType<{ className?: string }>; gradient: string; subtext?: string; delay?: number;
}) {
  const count = useCountUp(rawValue, 1.15, delay + 0.3);
  return (
    <motion.div variants={fadeUp} className="group h-full" whileHover={{ y: -5, transition: { duration: 0.2 } }}>
      <div className="relative h-full rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden transition-all duration-300 group-hover:border-white/10 group-hover:shadow-2xl group-hover:shadow-black/30">
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${gradient} to-transparent`} />
        <motion.div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500 bg-gradient-to-br ${gradient}`} />
        <div className="relative p-5 h-full flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</p>
            <div className={`p-2 rounded-xl bg-gradient-to-br ${gradient} ring-1 ring-white/10 shadow-lg`}>
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
          </div>
          <div>
            <motion.div className="text-2xl font-black tabular-nums tracking-tight" key={count}>
              {prefix}{count.toLocaleString()}{suffix}
            </motion.div>
            {subtext && <p className="text-xs mt-1.5 text-muted-foreground/60">{subtext}</p>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Empty line item ────────────────────────────────────────────────────────────
const emptyItem = (): LineItem => ({ description: "", quantity: 1, unitPrice: 0, type: "service" });
function fmt(amount: string | number, currency: string) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const { user } = useUser();
  const { data: vendors, isLoading: vendorsLoading } = useListVendors();
  const { toast } = useToast();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary>({ totalBilled: 0, totalCollected: 0, outstanding: 0 });
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [aiDescText, setAiDescText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    customerName: "", customerEmail: "", customerPhone: "",
    currency: "USD", dueDate: "", notes: "", discountAmount: 0, taxAmount: 0, instalments: 1,
  });
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);

  const fetchInvoices = useCallback(async () => {
    if (!myVendor) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/invoices`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { invoices: Invoice[]; summary: InvoiceSummary };
      setInvoices(data.invoices);
      setSummary(data.summary);
    } catch {
      toast({ title: "Error loading invoices", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [myVendor, toast]);

  useEffect(() => { if (myVendor) fetchInvoices(); }, [myVendor?.id]);

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const total = Math.max(0, subtotal - form.discountAmount + form.taxAmount);
  const collectionRate = summary.totalBilled > 0 ? Math.round((summary.totalCollected / summary.totalBilled) * 100) : 0;

  const parseWithAi = useCallback(async () => {
    if (!aiDescText.trim()) return;
    setAiParsing(true);
    try {
      const r = await fetch(`${BASE_URL}/api/invoices/parse-description`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiDescText }),
      });
      if (!r.ok) throw new Error(await r.text());
      const { parsed } = await r.json() as { parsed: Partial<typeof form & { items: LineItem[] }> };
      setForm((f) => ({
        ...f,
        customerName: parsed.customerName ?? f.customerName,
        customerEmail: parsed.customerEmail ?? f.customerEmail,
        currency: parsed.currency ?? f.currency,
        dueDate: parsed.dueDate ?? f.dueDate,
        notes: parsed.notes ?? f.notes,
        discountAmount: parsed.discountAmount ?? f.discountAmount,
        taxAmount: parsed.taxAmount ?? f.taxAmount,
        instalments: parsed.instalments ?? f.instalments,
      }));
      if (parsed.items?.length) setItems(parsed.items);
      toast({ title: "Form filled ✓", description: "Review and adjust as needed." });
    } catch {
      toast({ title: "AI parse failed", description: "Fill the form manually.", variant: "destructive" });
    } finally {
      setAiParsing(false);
    }
  }, [aiDescText, toast]);

  const submitInvoice = useCallback(async (sendToCustomer: boolean) => {
    if (!form.customerName.trim()) { toast({ title: "Customer name required", variant: "destructive" }); return; }
    if (items.some((it) => !it.description.trim())) { toast({ title: "All items need a description", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${BASE_URL}/api/invoices`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items }),
      });
      if (!r.ok) throw new Error(await r.text());
      const invoice = await r.json() as Invoice;
      if (sendToCustomer && form.customerEmail) {
        await fetch(`${BASE_URL}/api/invoices/${invoice.id}/send`, { method: "POST" });
      }
      toast({ title: "Invoice created 🎉", description: sendToCustomer ? "Sent to customer." : "Saved as draft." });
      setShowCreate(false);
      resetForm();
      fetchInvoices();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [form, items, fetchInvoices, toast]);

  const resetForm = () => {
    setForm({ customerName: "", customerEmail: "", customerPhone: "", currency: "USD", dueDate: "", notes: "", discountAmount: 0, taxAmount: 0, instalments: 1 });
    setItems([emptyItem()]);
    setAiDescText("");
    setCreateStep(1);
  };

  const copyLink = (inv: Invoice) => {
    navigator.clipboard.writeText(`${window.location.origin}${BASE_URL}/invoice/${inv.shareToken}`);
    toast({ title: "Link copied ✓" });
  };

  const sendWhatsApp = (inv: Invoice) => {
    const url = `${window.location.origin}${BASE_URL}/invoice/${inv.shareToken}`;
    const msg = encodeURIComponent(`Hi ${inv.customerName}, here's your invoice #${inv.id} for ${fmt(inv.totalAmount, inv.currency)}: ${url}`);
    const phone = inv.customerPhone?.replace(/\D/g, "") ?? "";
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const sendInvoice = async (inv: Invoice) => {
    await fetch(`${BASE_URL}/api/invoices/${inv.id}/send`, { method: "POST" });
    toast({ title: "Invoice sent ✓" }); fetchInvoices();
  };

  const deleteInvoice = async (inv: Invoice) => {
    if (!confirm(`Delete invoice #${inv.id}?`)) return;
    await fetch(`${BASE_URL}/api/invoices/${inv.id}`, { method: "DELETE" });
    toast({ title: "Invoice removed" }); fetchInvoices();
  };

  const filtered = statusFilter === "all" ? invoices : invoices.filter((i) => i.status === statusFilter);

  if (vendorsLoading) return (
    <div className="flex h-[60vh] items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}>
        <RefreshCw className="w-6 h-6 text-primary" />
      </motion.div>
    </div>
  );
  if (!myVendor) return <div className="p-8 text-center text-muted-foreground">No vendor profile found.</div>;

  return (
    <div className="relative p-6 max-w-7xl mx-auto space-y-6 w-full overflow-hidden">
      <AuroraBackground />

      {/* ── Header ── */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Invoices
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Issue, track, and collect payments from clients.</p>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
          <Button
            onClick={() => { setShowCreate(true); setCreateStep(1); }}
            className="gap-2 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90 shadow-lg shadow-primary/25 border-0"
          >
            <Plus className="w-4 h-4" /> New Invoice
          </Button>
        </motion.div>
      </motion.div>

      {/* ── Summary cards ── */}
      <motion.div
        className="grid gap-4 md:grid-cols-4"
        variants={cardStagger}
        initial="hidden"
        animate="show"
      >
        <SummaryCard title="Total Billed" rawValue={Math.round(summary.totalBilled)} prefix="$" icon={FileText} gradient="from-violet-500/30 via-violet-500/10" subtext="All invoices issued" delay={0} />
        <SummaryCard title="Collected" rawValue={Math.round(summary.totalCollected)} prefix="$" icon={CheckCircle2} gradient="from-emerald-500/30 via-emerald-500/10" subtext="Payments received" delay={0.07} />
        <SummaryCard title="Outstanding" rawValue={Math.round(summary.outstanding)} prefix="$" icon={AlertTriangle} gradient="from-amber-500/30 via-amber-500/10" subtext="Still to collect" delay={0.14} />
        <motion.div variants={fadeUp} className="group h-full" whileHover={{ y: -5, transition: { duration: 0.2 } }}>
          <div className="relative h-full rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden transition-all duration-300 group-hover:border-white/10 group-hover:shadow-2xl group-hover:shadow-black/30 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Collection Rate</p>
              <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/30 via-cyan-500/10 ring-1 ring-white/10 shadow-lg">
                <TrendingUp className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black tabular-nums">{collectionRate}%</div>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${collectionRate}%` }}
                  transition={{ duration: 1.2, delay: 0.5, ease: EASE }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Tabs & table ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.3 }}>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="bg-card/50 border border-border/50 backdrop-blur-sm">
            <TabsTrigger value="all">All ({invoices.length})</TabsTrigger>
            {(["draft", "sent", "partially_paid", "paid", "overdue"] as InvoiceStatus[]).map((s) => {
              const count = invoices.filter((i) => i.status === s).length;
              return count > 0 ? (
                <TabsTrigger key={s} value={s}>
                  {STATUS[s].label} ({count})
                </TabsTrigger>
              ) : null;
            })}
          </TabsList>

          <TabsContent value={statusFilter} className="mt-4">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}>
                    <RefreshCw className="w-5 h-5 text-primary" />
                  </motion.div>
                  Loading invoices…
                </motion.div>
              ) : filtered.length === 0 ? (
                <motion.div key="empty" variants={fadeUp} initial="hidden" animate="show"
                  className="text-center py-20 flex flex-col items-center">
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <FileText className="w-14 h-14 mx-auto mb-4 text-muted-foreground/20" />
                  </motion.div>
                  <h3 className="font-bold text-lg mb-1">No invoices yet</h3>
                  <p className="text-sm text-muted-foreground mb-5">Create your first invoice to start collecting payments.</p>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                    <Button variant="outline" className="gap-2" onClick={() => { setShowCreate(true); setCreateStep(1); }}>
                      <Plus className="w-4 h-4" /> Create Invoice
                    </Button>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="table"
                  variants={fadeIn}
                  initial="hidden"
                  animate="show"
                  className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden"
                >
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/50 bg-muted/30">
                      <tr>
                        {["#", "Customer", "Amount", "Status", "Due", "Actions"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {filtered.map((inv, idx) => (
                          <motion.tr
                            key={inv.id}
                            variants={slideIn}
                            initial="hidden"
                            animate="show"
                            exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
                            transition={{ delay: idx * 0.04 }}
                            className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors group"
                            whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                          >
                            <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">#{inv.id}</td>
                            <td className="px-4 py-3.5">
                              <div className="font-semibold">{inv.customerName}</div>
                              {inv.customerEmail && <div className="text-xs text-muted-foreground">{inv.customerEmail}</div>}
                            </td>
                            <td className="px-4 py-3.5 font-bold">{fmt(inv.totalAmount, inv.currency)}</td>
                            <td className="px-4 py-3.5"><StatusPill status={inv.status} /></td>
                            <td className="px-4 py-3.5 text-muted-foreground text-xs">{inv.dueDate ?? "—"}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                                {[
                                  { title: "Copy link", icon: Copy, onClick: () => copyLink(inv), show: true },
                                  { title: "Send email", icon: Send, onClick: () => sendInvoice(inv), show: inv.status !== "paid" && inv.status !== "cancelled" && !!inv.customerEmail },
                                  { title: "WhatsApp", icon: MessageSquare, onClick: () => sendWhatsApp(inv), show: !!inv.customerPhone },
                                  { title: "View public", icon: Eye, onClick: () => window.open(`${BASE_URL}/invoice/${inv.shareToken}`, "_blank"), show: true },
                                  { title: "Delete", icon: Trash2, onClick: () => deleteInvoice(inv), show: inv.status === "draft" || inv.status === "cancelled", danger: true },
                                ].filter((a) => a.show).map((action) => (
                                  <motion.button
                                    key={action.title}
                                    title={action.title}
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={action.onClick}
                                    className={`p-1.5 rounded-lg transition-colors ${(action as any).danger ? "text-destructive/60 hover:text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                                  >
                                    <action.icon className="w-3.5 h-3.5" />
                                  </motion.button>
                                ))}
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ── Create Invoice Dialog ── */}
      <AnimatePresence>
        {showCreate && (
          <Dialog open={showCreate} onOpenChange={(o) => { if (!o) { setShowCreate(false); resetForm(); } }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/50 bg-card/95 backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  >
                    <FileText className="w-5 h-5 text-primary" />
                  </motion.div>
                  New Invoice — {createStep === 1 ? "Customer" : createStep === 2 ? "Line Items" : "Payment Terms"}
                </DialogTitle>
              </DialogHeader>

              {/* Step indicator */}
              <div className="flex items-center gap-2 py-1">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <motion.div
                      animate={{
                        background: createStep >= s ? "hsl(var(--primary))" : "hsl(var(--muted))",
                        scale: createStep === s ? 1.1 : 1,
                      }}
                      transition={{ duration: 0.3 }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    >{s}</motion.div>
                    {s < 3 && (
                      <motion.div
                        className="h-0.5 w-10 rounded-full"
                        animate={{ background: createStep > s ? "hsl(var(--primary))" : "hsl(var(--muted))" }}
                        transition={{ duration: 0.3 }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* AI Assist (step 1) */}
              <AnimatePresence>
                {createStep === 1 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="border border-primary/20 rounded-xl p-3 bg-primary/5 space-y-2"
                  >
                    <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <motion.span animate={{ rotate: [0, 20, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                        <Sparkles className="w-3.5 h-3.5" />
                      </motion.span>
                      AI Assist — describe it in plain language
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. Bill Amara ₦50k for 3 months website maintenance"
                        value={aiDescText}
                        onChange={(e) => setAiDescText(e.target.value)}
                        className="text-sm bg-background/50"
                        onKeyDown={(e) => { if (e.key === "Enter") parseWithAi(); }}
                      />
                      <Button size="sm" variant="secondary" onClick={parseWithAi} disabled={aiParsing || !aiDescText.trim()}>
                        {aiParsing ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}>
                            <RefreshCw className="w-4 h-4" />
                          </motion.div>
                        ) : "Fill"}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Step content */}
              <AnimatePresence mode="wait">
                {createStep === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Customer Name *</Label>
                        <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Amara Okafor" className="bg-background/50" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Currency</Label>
                        <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                          <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                          <SelectContent>{["USD", "NGN", "GBP", "EUR", "KES", "GHS", "ZAR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input type="email" value={form.customerEmail} onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))} placeholder="amara@example.com" className="bg-background/50" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Phone (WhatsApp)</Label>
                        <Input value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="+234801…" className="bg-background/50" />
                      </div>
                    </div>
                  </motion.div>
                )}

                {createStep === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-3">
                    <div className="grid grid-cols-[1fr_72px_96px_80px_32px] gap-2 text-xs font-semibold text-muted-foreground px-1">
                      <span>Description</span><span>Qty</span><span>Unit Price</span><span className="text-right">Total</span><span />
                    </div>
                    <AnimatePresence>
                      {items.map((item, idx) => (
                        <motion.div key={idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                          className="grid grid-cols-[1fr_72px_96px_80px_32px] gap-2 items-start">
                          <Input placeholder="Service or product" value={item.description} onChange={(e) => setItems((p) => p.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))} className="text-sm bg-background/50" />
                          <Input type="number" min={0.001} step={0.001} value={item.quantity} onChange={(e) => setItems((p) => p.map((it, i) => i === idx ? { ...it, quantity: parseFloat(e.target.value) || 1 } : it))} className="text-sm bg-background/50" />
                          <Input type="number" min={0} step={0.01} value={item.unitPrice} onChange={(e) => setItems((p) => p.map((it, i) => i === idx ? { ...it, unitPrice: parseFloat(e.target.value) || 0 } : it))} className="text-sm bg-background/50" />
                          <div className="text-sm font-semibold pt-2 text-right tabular-nums">{(item.quantity * item.unitPrice).toFixed(2)}</div>
                          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setItems((p) => p.length > 1 ? p.filter((_, i) => i !== idx) : p)} className="p-1 rounded text-destructive/60 hover:text-destructive transition-colors mt-1.5">
                            <Trash2 className="w-3.5 h-3.5" />
                          </motion.button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => setItems((p) => [...p, emptyItem()])}>
                        <Plus className="w-3.5 h-3.5" /> Add Line Item
                      </Button>
                    </motion.div>
                    <div className="border-t border-border/50 pt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{fmt(subtotal, form.currency)}</span></div>
                      {form.discountAmount > 0 && <div className="flex justify-between text-emerald-400"><span>Discount</span><span>-{fmt(form.discountAmount, form.currency)}</span></div>}
                      {form.taxAmount > 0 && <div className="flex justify-between"><span>Tax/VAT</span><span>{fmt(form.taxAmount, form.currency)}</span></div>}
                      <div className="flex justify-between font-black text-base border-t border-border/50 pt-1.5"><span>Total</span><span className="tabular-nums">{fmt(total, form.currency)}</span></div>
                    </div>
                  </motion.div>
                )}

                {createStep === 3 && (
                  <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Due Date</Label>
                        <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="bg-background/50" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Instalments</Label>
                        <Select value={String(form.instalments)} onValueChange={(v) => setForm((f) => ({ ...f, instalments: parseInt(v) }))}>
                          <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Pay in full</SelectItem>
                            {[2, 3, 4, 6, 12].map((n) => <SelectItem key={n} value={String(n)}>{n} instalments</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Discount</Label>
                        <Input type="number" min={0} step={0.01} value={form.discountAmount} onChange={(e) => setForm((f) => ({ ...f, discountAmount: parseFloat(e.target.value) || 0 }))} className="bg-background/50" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Tax / VAT</Label>
                        <Input type="number" min={0} step={0.01} value={form.taxAmount} onChange={(e) => setForm((f) => ({ ...f, taxAmount: parseFloat(e.target.value) || 0 }))} className="bg-background/50" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Payment instructions, bank details…" rows={3} className="bg-background/50 resize-none" />
                    </div>
                    {/* Preview card */}
                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2 text-sm">
                      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Preview</p>
                      {[
                        { k: "Customer", v: form.customerName || "—" },
                        { k: "Total", v: fmt(total, form.currency) },
                        { k: "Instalments", v: form.instalments === 1 ? "Single payment" : `${form.instalments} × ${fmt(total / form.instalments, form.currency)}` },
                        ...(form.dueDate ? [{ k: "Due", v: form.dueDate }] : []),
                      ].map(({ k, v }) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-semibold">{v}</span>
                        </div>
                      ))}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              <DialogFooter className="flex justify-between pt-2">
                <div>
                  {createStep > 1 && (
                    <Button variant="ghost" onClick={() => setCreateStep((s) => s - 1)} className="gap-1">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {createStep < 3 ? (
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button onClick={() => {
                        if (createStep === 1 && !form.customerName.trim()) {
                          toast({ title: "Customer name is required", variant: "destructive" }); return;
                        }
                        setCreateStep((s) => s + 1);
                      }} className="gap-1">
                        Next <ChevronRight className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => submitInvoice(false)} disabled={submitting}>Save Draft</Button>
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                        <Button
                          onClick={() => submitInvoice(true)}
                          disabled={submitting || !form.customerEmail}
                          className="gap-2 bg-gradient-to-r from-primary to-violet-600"
                        >
                          {submitting ? (
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}>
                              <RefreshCw className="w-4 h-4" />
                            </motion.div>
                          ) : <Send className="w-4 h-4" />}
                          Send to Customer
                        </Button>
                      </motion.div>
                    </>
                  )}
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
