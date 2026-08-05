import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, User, ShoppingCart, FileText, TicketCheck,
  MessageSquare, CreditCard, ExternalLink, Send, CheckCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderItem = { id: number; orderId: number; productName: string; quantity: number; unitPrice: string; totalPrice: string };
type Order     = { id: number; status: string; paymentStatus: string; currency: string; totalAmount: string; createdAt: string; updatedAt: string; notes: string | null; items: OrderItem[] };
type Invoice   = { id: number; invoiceNumber: string; status: string; currency: string; totalAmount: string; dueDate: string | null; createdAt: string };
type Ticket    = { id: number; ticketRef: string; subject: string; category: string; status: string; priority: string; createdAt: string; updatedAt: string };
type Message   = { id: number; direction: "vendor_to_customer" | "customer_to_vendor"; subject: string | null; body: string; read: boolean; createdAt: string };
type Payment   = { id: number; provider: string; providerReference: string; amount: string; currency: string; status: string; orderId: number; createdAt: string };

type Profile = {
  email: string;
  displayName: string;
  platformAccount: { id: number; name: string; phone: string | null; avatarUrl: string | null; city: string | null; country: string | null; bio: string | null; profileCompleted: boolean; createdAt: string } | null;
  orders: Order[];
  invoices: Invoice[];
  tickets: Ticket[];
  messages: Message[];
  payments: Payment[];
};

type Tab = "overview" | "orders" | "invoices" | "tickets" | "messages" | "payments";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-800", pending: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800", refunded: "bg-purple-100 text-purple-800",
  open: "bg-blue-100 text-blue-800", closed: "bg-gray-100 text-gray-700",
  resolved: "bg-green-100 text-green-800", draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-800", overdue: "bg-red-100 text-red-800",
  cancelled: "bg-red-100 text-red-800", active: "bg-green-100 text-green-800",
};
function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  if (avatarUrl) return <img src={avatarUrl} alt={name} className="w-16 h-16 rounded-full object-cover" />;
  return (
    <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-white text-2xl" style={{ background: "hsl(var(--primary))" }}>
      {initials || "?"}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CustomerDetail() {
  const { email: rawEmail } = useParams<{ email: string }>();
  const email = decodeURIComponent(rawEmail ?? "");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [msgBody, setMsgBody] = useState("");
  const [msgSubject, setMsgSubject] = useState("");
  const [sendNotify, setSendNotify] = useState(true);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<Profile>({
    queryKey: ["vendor-customer-profile", email],
    queryFn: async () => {
      const r = await fetch(`/api/vendor-customers/profile?email=${encodeURIComponent(email)}`);
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    enabled: !!email,
    staleTime: 30_000,
  });

  const sendMsg = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/vendor-messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: email,
          customerName:  data?.displayName,
          subject:       msgSubject.trim() || undefined,
          body:          msgBody.trim(),
          sendEmailNotification: sendNotify,
        }),
      });
      if (!r.ok) throw new Error("Send failed");
      return r.json();
    },
    onSuccess: () => {
      setMsgBody(""); setMsgSubject("");
      qc.invalidateQueries({ queryKey: ["vendor-customer-profile", email] });
    },
  });

  if (isLoading) return <Layout><div className="p-10 text-center text-muted-foreground">Loading customer profile…</div></Layout>;
  if (error || !data)  return <Layout><div className="p-10 text-center text-muted-foreground">Customer not found.</div></Layout>;

  const { displayName, platformAccount, orders, invoices, tickets, messages, payments } = data;
  const totalSpent = orders.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + parseFloat(o.totalAmount), 0);
  const currency   = orders[0]?.currency ?? "USD";
  const unread     = messages.filter(m => m.direction === "customer_to_vendor" && !m.read).length;

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: "overview",  label: "Overview",  icon: User },
    { id: "orders",    label: "Orders",    icon: ShoppingCart, count: orders.length },
    { id: "invoices",  label: "Invoices",  icon: FileText,     count: invoices.length },
    { id: "tickets",   label: "Tickets",   icon: TicketCheck,  count: tickets.length },
    { id: "messages",  label: "Messages",  icon: MessageSquare, count: unread || messages.length },
    { id: "payments",  label: "Payments",  icon: CreditCard,   count: payments.length },
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Back */}
        <button onClick={() => navigate("/customers")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> All Customers
        </button>

        {/* Profile header */}
        <div className="bg-card border rounded-xl p-6 flex items-start gap-5 flex-wrap">
          <Avatar name={displayName} avatarUrl={platformAccount?.avatarUrl ?? null} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold">{displayName}</h1>
              {platformAccount && <Badge variant="secondary" className="text-xs">Platform account</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{email}</p>
            {platformAccount?.phone && <p className="text-sm mt-0.5">{platformAccount.phone}</p>}
            {(platformAccount?.city || platformAccount?.country) && (
              <p className="text-sm text-muted-foreground mt-0.5">📍 {[platformAccount.city, platformAccount.country].filter(Boolean).join(", ")}</p>
            )}
            {platformAccount?.bio && <p className="text-sm text-muted-foreground mt-1 italic">"{platformAccount.bio}"</p>}
          </div>
          {/* Summary stats */}
          <div className="flex gap-6 shrink-0 flex-wrap">
            <div className="text-center">
              <p className="text-2xl font-bold">{orders.length}</p>
              <p className="text-xs text-muted-foreground">Orders</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{currency} {totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">Lifetime value</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{tickets.filter(t => ["open", "pending"].includes(t.status)).length}</p>
              <p className="text-xs text-muted-foreground">Open tickets</p>
            </div>
            {unread > 0 && (
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{unread}</p>
                <p className="text-xs text-muted-foreground">Unread msgs</p>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b pb-0 -mb-px">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`ml-1 px-1.5 py-0 rounded-full text-xs font-bold ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card border rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Contact Info</h2>
              <div className="space-y-1.5 text-sm">
                <div className="flex gap-2"><span className="text-muted-foreground w-20">Email</span><span className="font-medium">{email}</span></div>
                {platformAccount?.phone && <div className="flex gap-2"><span className="text-muted-foreground w-20">Phone</span><span className="font-medium">{platformAccount.phone}</span></div>}
                {platformAccount?.city && <div className="flex gap-2"><span className="text-muted-foreground w-20">City</span><span className="font-medium">{platformAccount.city}</span></div>}
                {platformAccount?.country && <div className="flex gap-2"><span className="text-muted-foreground w-20">Country</span><span className="font-medium">{platformAccount.country}</span></div>}
                {platformAccount?.createdAt && <div className="flex gap-2"><span className="text-muted-foreground w-20">Joined</span><span className="font-medium">{fmt(platformAccount.createdAt)}</span></div>}
              </div>
            </div>

            <div className="bg-card border rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Activity Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total orders</span><span className="font-semibold">{orders.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Paid orders</span><span className="font-semibold">{orders.filter(o => o.paymentStatus === "paid").length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Lifetime spend</span><span className="font-semibold text-green-600">{currency} {totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Invoices</span><span className="font-semibold">{invoices.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Support tickets</span><span className="font-semibold">{tickets.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Messages</span><span className="font-semibold">{messages.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payments</span><span className="font-semibold">{payments.length}</span></div>
              </div>
            </div>

            {/* Recent orders */}
            {orders.length > 0 && (
              <div className="md:col-span-2 bg-card border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Recent Orders</h2>
                  <button onClick={() => setTab("orders")} className="text-xs text-primary hover:underline">See all →</button>
                </div>
                <div className="space-y-2">
                  {orders.slice(0, 3).map(o => (
                    <div key={o.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={o.paymentStatus} />
                        <span className="text-muted-foreground">#{o.id}</span>
                        <span>{o.items.map(i => i.productName).join(", ").slice(0, 50)}</span>
                      </div>
                      <span className="font-semibold shrink-0">{o.currency} {parseFloat(o.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent messages */}
            {messages.length > 0 && (
              <div className="md:col-span-2 bg-card border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Recent Messages</h2>
                  <button onClick={() => setTab("messages")} className="text-xs text-primary hover:underline">Open thread →</button>
                </div>
                <div className="space-y-2">
                  {messages.slice(-3).map(m => (
                    <div key={m.id} className={`text-sm flex gap-2 ${m.direction === "customer_to_vendor" ? "" : "justify-end"}`}>
                      <span className={`px-3 py-1.5 rounded-lg max-w-xs ${m.direction === "customer_to_vendor" ? "bg-muted" : "bg-primary/10 text-primary"}`}>
                        {m.body.slice(0, 100)}{m.body.length > 100 ? "…" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Orders ── */}
        {tab === "orders" && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No orders yet.</div>
            ) : orders.map(o => (
              <div key={o.id} className="bg-card border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm">Order #{o.id}</span>
                    <StatusBadge status={o.status} />
                    <StatusBadge status={o.paymentStatus} />
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold">{o.currency} {parseFloat(o.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span className="text-xs text-muted-foreground">{fmt(o.createdAt)}</span>
                    <a href={`/orders/${o.id}`} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                {o.items.length > 0 && (
                  <div className="border-t divide-y">
                    {o.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span>{item.productName}</span>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <span>× {item.quantity}</span>
                          <span className="font-medium text-foreground">{o.currency} {parseFloat(item.totalPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {o.notes && <p className="text-xs text-muted-foreground px-4 pb-3">Note: {o.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {/* ── Invoices ── */}
        {tab === "invoices" && (
          <div className="space-y-3">
            {invoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No invoices yet.</div>
            ) : invoices.map(inv => (
              <div key={inv.id} className="bg-card border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">#{inv.invoiceNumber}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Issued {fmt(inv.createdAt)}{inv.dueDate ? ` · Due ${inv.dueDate}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold">{inv.currency} {parseFloat(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <a href={`/invoices`} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tickets ── */}
        {tab === "tickets" && (
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No support tickets yet.</div>
            ) : tickets.map(t => (
              <div key={t.id} className="bg-card border rounded-xl p-4 flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{t.subject}</span>
                    <StatusBadge status={t.status} />
                    <StatusBadge status={t.priority} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.category} · Ref {t.ticketRef} · {fmt(t.createdAt)}
                  </p>
                </div>
                <a href={`/support/${t.id}`} className="text-xs text-primary hover:underline flex items-center gap-0.5 shrink-0">
                  View <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        )}

        {/* ── Messages ── */}
        {tab === "messages" && (
          <div className="space-y-4">
            {/* Thread */}
            <div className="bg-card border rounded-xl p-4 space-y-3 max-h-[480px] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No messages yet — start the conversation below.</div>
              ) : messages.map(m => {
                const isCustomer = m.direction === "customer_to_vendor";
                return (
                  <div key={m.id} className={`flex flex-col ${isCustomer ? "items-start" : "items-end"}`}>
                    {m.subject && <p className="text-xs font-semibold text-muted-foreground mb-0.5 px-1">{m.subject}</p>}
                    <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap ${isCustomer ? "bg-muted rounded-tl-none" : "bg-primary text-primary-foreground rounded-tr-none"}`}>
                      {m.body}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 px-1">
                      <span className="text-xs text-muted-foreground">{isCustomer ? displayName : "You"} · {fmtTime(m.createdAt)}</span>
                      {!isCustomer && m.read && <CheckCheck className="h-3 w-3 text-blue-500" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Compose */}
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold">Reply to {displayName}</h3>
              <Input
                placeholder="Subject (optional)"
                value={msgSubject}
                onChange={e => setMsgSubject(e.target.value)}
              />
              <Textarea
                placeholder={`Write a message to ${displayName}…`}
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                rows={4}
              />
              <div className="flex items-center justify-between flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={sendNotify} onChange={e => setSendNotify(e.target.checked)} className="rounded" />
                  Also send by email
                </label>
                <Button
                  onClick={() => sendMsg.mutate()}
                  disabled={!msgBody.trim() || sendMsg.isPending}
                  size="sm"
                  className="flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendMsg.isPending ? "Sending…" : "Send Message"}
                </Button>
              </div>
              {sendMsg.isError && <p className="text-xs text-destructive">Failed to send — please try again.</p>}
              {sendMsg.isSuccess && <p className="text-xs text-green-600">Message sent ✓</p>}
            </div>
          </div>
        )}

        {/* ── Payments ── */}
        {tab === "payments" && (
          <div className="space-y-3">
            {payments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No payment records yet.</div>
            ) : payments.map(p => (
              <div key={p.id} className="bg-card border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm capitalize">{p.provider}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{p.providerReference}</p>
                  <p className="text-xs text-muted-foreground">Order #{p.orderId} · {fmt(p.createdAt)}</p>
                </div>
                <span className="font-bold">{p.currency} {parseFloat(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
