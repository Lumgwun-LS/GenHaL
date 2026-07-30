import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Globe, Instagram, Facebook, Twitter, ShoppingBag,
  FileText, MousePointer2, Link2, MessageSquare,
  Phone, Mail, Building2, MapPin, BarChart3,
  Plus, Clock, RefreshCw, CreditCard, BookOpen,
  CheckCircle2, XCircle, AlertCircle, Trash2, Loader2,
  Receipt, ExternalLink, Send, Ban,
} from "lucide-react";
import {
  useUpdateLead, useListPersonActivities, useCreatePersonActivity,
  getListPersonActivitiesQueryKey,
} from "@workspace/api-client-react";
import type { Lead } from "@workspace/api-zod";

type PersonActivity = { id: number; vendorId: number; personId: number; type: string; data?: Record<string, unknown> | null; createdAt: string };

type Order = {
  id: number;
  customerName: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
  currency: string;
  totalAmount: string;
  createdAt: string;
};

type BlogComment = {
  id: number;
  postId: number;
  commenterName: string;
  commenterEmail: string;
  commenterPhone: string | null;
  body: string;
  createdAt: string;
  postTitle?: string;
  postSlug?: string;
};

type InvoiceItem = { description: string; quantity: number; unitPrice: number };

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const STATUSES = ["new", "contacted", "qualified", "converted", "lost"];

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  website:     <Globe       className="w-3.5 h-3.5" />,
  instagram:   <Instagram   className="w-3.5 h-3.5" />,
  facebook:    <Facebook    className="w-3.5 h-3.5" />,
  twitter:     <Twitter     className="w-3.5 h-3.5" />,
  x:           <Twitter     className="w-3.5 h-3.5" />,
  linkedin:    <BarChart3   className="w-3.5 h-3.5" />,
  google_ads:  <BarChart3   className="w-3.5 h-3.5" />,
  utm_link:    <Link2       className="w-3.5 h-3.5" />,
  form:        <FileText    className="w-3.5 h-3.5" />,
  order:       <ShoppingBag className="w-3.5 h-3.5" />,
  blog:        <BookOpen    className="w-3.5 h-3.5" />,
  manual:      <Plus        className="w-3.5 h-3.5" />,
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  page_view:    <Globe         className="w-3.5 h-3.5 text-blue-500" />,
  form_submit:  <FileText      className="w-3.5 h-3.5 text-violet-500" />,
  social_click: <MousePointer2 className="w-3.5 h-3.5 text-pink-500" />,
  utm_click:    <Link2         className="w-3.5 h-3.5 text-amber-500" />,
  order_placed: <ShoppingBag   className="w-3.5 h-3.5 text-emerald-500" />,
  blog_comment: <BookOpen      className="w-3.5 h-3.5 text-sky-500" />,
  manual_note:  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />,
  status_change:<RefreshCw     className="w-3.5 h-3.5 text-muted-foreground" />,
};

const STATUS_COLORS: Record<string, string> = {
  converted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  qualified:  "bg-violet-500/10 text-violet-600 border-violet-500/20",
  new:        "bg-blue-500/10 text-blue-600 border-blue-500/20",
  contacted:  "bg-amber-500/10 text-amber-600 border-amber-500/20",
  lost:       "bg-destructive/10 text-destructive border-destructive/20",
};

const PAYMENT_STATUS_ICON: Record<string, React.ReactNode> = {
  paid:     <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  unpaid:   <AlertCircle  className="w-3.5 h-3.5 text-amber-500" />,
  failed:   <XCircle      className="w-3.5 h-3.5 text-destructive" />,
  refunded: <RefreshCw    className="w-3.5 h-3.5 text-sky-500" />,
};

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  paid:     "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  unpaid:   "bg-amber-500/10 text-amber-600 border-amber-500/20",
  failed:   "bg-destructive/10 text-destructive border-destructive/20",
  refunded: "bg-sky-500/10 text-sky-600 border-sky-500/20",
};

function activityLabel(a: PersonActivity): string {
  const d = a.data as Record<string, unknown> | null;
  switch (a.type) {
    case "page_view":    return `Visited ${d?.page ?? "a page"}`;
    case "form_submit":  return `Submitted form "${d?.formName ?? ""}"`;
    case "social_click": return `Clicked from ${d?.platform ?? "social media"}`;
    case "utm_click":    return `Clicked link "${d?.linkName ?? ""}" (${d?.utmSource ?? ""})`;
    case "order_placed": return `Placed an order (₦${Number(d?.totalAmount ?? 0).toLocaleString()})`;
    case "blog_comment": return `Left a comment on "${d?.postTitle ?? "a blog post"}"`;
    case "manual_note":  return String(d?.note ?? "");
    case "status_change":return `Status → ${d?.newStatus ?? ""}`;
    default: return a.type.replace(/_/g, " ");
  }
}

async function fetchTransactions(personId: number): Promise<Order[]> {
  const res = await fetch(`${BASE_URL}/api/leads/${personId}/transactions`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load transactions");
  return res.json() as Promise<Order[]>;
}

async function fetchComments(personId: number): Promise<BlogComment[]> {
  const res = await fetch(`${BASE_URL}/api/leads/${personId}/blog-comments`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load comments");
  return res.json() as Promise<BlogComment[]>;
}

// ─── Comments tab with ban button ────────────────────────────────────────────
function CommentsTab({
  person,
  comments,
  loadingComments,
}: {
  person: Lead;
  comments: BlogComment[];
  loadingComments: boolean;
}) {
  const [banning, setBanning] = useState<string | null>(null);
  const [banned, setBanned] = useState<Set<string>>(() => new Set());

  async function handleBan(email: string) {
    setBanning(email);
    try {
      const res = await fetch(`${BASE_URL}/api/blog/commenter-bans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      setBanned((prev) => new Set([...prev, email.toLowerCase()]));
      toast.success(`${email} has been banned from commenting`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to ban commenter");
    }
    setBanning(null);
  }

  async function handleUnban(email: string) {
    setBanning(email);
    try {
      const res = await fetch(`${BASE_URL}/api/blog/commenter-bans/${encodeURIComponent(email)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      setBanned((prev) => { const s = new Set(prev); s.delete(email.toLowerCase()); return s; });
      toast.success(`${email} can comment again`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to unban commenter");
    }
    setBanning(null);
  }

  const commenterEmail = person.email?.toLowerCase() ?? "";
  const isBanned = banned.has(commenterEmail);

  if (loadingComments) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ban / unban toggle for this commenter */}
      {commenterEmail && (
        <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${isBanned ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30"}`}>
          <div className="text-xs">
            {isBanned ? (
              <span className="text-destructive font-medium flex items-center gap-1"><Ban className="w-3 h-3" /> Banned from commenting</span>
            ) : (
              <span className="text-muted-foreground">Commenter access</span>
            )}
            <div className="text-muted-foreground/70 mt-0.5">{commenterEmail}</div>
          </div>
          <Button
            size="sm" variant="outline"
            className={`text-xs h-7 shrink-0 ${isBanned ? "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10" : "border-destructive/50 text-destructive hover:bg-destructive/10"}`}
            onClick={() => isBanned ? handleUnban(commenterEmail) : handleBan(commenterEmail)}
            disabled={banning === commenterEmail}
          >
            {banning === commenterEmail ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : isBanned ? (
              <CheckCircle2 className="w-3 h-3 mr-1" />
            ) : (
              <Ban className="w-3 h-3 mr-1" />
            )}
            {isBanned ? "Unban" : "Ban commenter"}
          </Button>
        </div>
      )}

      {comments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <BookOpen className="w-8 h-8 text-muted-foreground/40" />
          <div className="text-sm font-medium text-muted-foreground">No blog comments yet</div>
          <div className="text-xs text-muted-foreground/60">Comments on your blog posts will appear here.</div>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {comments.length} comment{comments.length !== 1 ? "s" : ""}
          </div>
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card/50 p-3 space-y-2">
              {c.postTitle && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BookOpen className="w-3 h-3 shrink-0" />
                  <span className="font-medium truncate">{c.postTitle}</span>
                  {c.postSlug && (
                    <a href={`/public-blog/${c.postSlug}`} target="_blank" rel="noopener noreferrer"
                      className="ml-auto shrink-0 hover:text-primary">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
              <p className="text-sm leading-relaxed">{c.body}</p>
              <div className="text-xs text-muted-foreground">
                {format(new Date(c.createdAt), "MMM d, yyyy · h:mm a")}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Invoice mini-form ────────────────────────────────────────────────────────
function InvoiceTab({ person }: { person: Lead }) {
  const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  function updateItem(i: number, field: keyof InvoiceItem, val: string | number) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  }
  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }]);
  }
  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);

  async function handleCreate(send: boolean) {
    const validItems = items.filter((it) => it.description.trim() && it.unitPrice > 0);
    if (!validItems.length) { toast.error("Add at least one item with a description and price"); return; }
    setSending(true);
    try {
      const body = {
        customerName: person.name,
        customerEmail: person.email ?? undefined,
        customerPhone: person.phone ?? undefined,
        items: validItems.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
        dueDate: dueDate || undefined,
        notes: notes || undefined,
      };
      const res = await fetch(`${BASE_URL}/api/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      const invoice = await res.json() as { id: number };

      if (send && invoice.id) {
        const sendRes = await fetch(`${BASE_URL}/api/invoices/${invoice.id}/send`, {
          method: "POST", credentials: "include",
        });
        if (!sendRes.ok) toast.warning("Invoice created but email send failed");
        else toast.success("Invoice created and sent to " + (person.email ?? person.name));
      } else {
        toast.success("Invoice created as draft");
      }
      // Reset
      setItems([{ description: "", quantity: 1, unitPrice: 0 }]);
      setDueDate("");
      setNotes("");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create invoice");
    }
    setSending(false);
  }

  return (
    <div className="space-y-4 py-2">
      {/* Customer preview */}
      <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm space-y-1">
        <div className="font-semibold">{person.name}</div>
        {person.email && <div className="text-muted-foreground text-xs">{person.email}</div>}
        {person.phone && <div className="text-muted-foreground text-xs">{person.phone}</div>}
      </div>

      {/* Line items */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Line Items</div>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_56px_72px_28px] gap-1.5 items-center">
              <Input
                placeholder="Description"
                value={it.description}
                onChange={(e) => updateItem(i, "description", e.target.value)}
                className="text-xs h-8"
              />
              <Input
                type="number"
                min={1}
                placeholder="Qty"
                value={it.quantity}
                onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                className="text-xs h-8 text-center"
              />
              <Input
                type="number"
                min={0}
                placeholder="Price"
                value={it.unitPrice || ""}
                onChange={(e) => updateItem(i, "unitPrice", Number(e.target.value))}
                className="text-xs h-8"
              />
              <Button
                variant="ghost" size="icon"
                className="h-8 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(i)}
                disabled={items.length === 1}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2 text-xs h-7" onClick={addItem}>
          <Plus className="w-3 h-3 mr-1" /> Add line
        </Button>
      </div>

      {/* Subtotal */}
      <div className="flex justify-between text-sm font-semibold border-t pt-2">
        <span className="text-muted-foreground">Subtotal</span>
        <span>${subtotal.toFixed(2)}</span>
      </div>

      {/* Due date + notes */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Due Date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-xs h-8 mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="text-xs h-8 mt-1" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleCreate(false)} disabled={sending}>
          {sending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Receipt className="w-3 h-3 mr-1" />}
          Save Draft
        </Button>
        {person.email && (
          <Button size="sm" className="flex-1 text-xs" onClick={() => handleCreate(true)} disabled={sending}>
            {sending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
            Create & Send
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────
interface Props {
  person: Lead | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function PersonDrawer({ person, open, onClose, onUpdated }: Props) {
  const qc = useQueryClient();
  const updateLead = useUpdateLead();
  const createActivity = useCreatePersonActivity();
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const { data: activities = [], isLoading: loadingActivities } = useListPersonActivities(
    person?.id ?? 0,
    { query: { enabled: open && !!person?.id, queryKey: getListPersonActivitiesQueryKey(person?.id ?? 0) } },
  );

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ["lead-transactions", person?.id],
    queryFn: () => fetchTransactions(person!.id),
    enabled: open && !!person?.id,
  });

  const { data: comments = [], isLoading: loadingComments } = useQuery({
    queryKey: ["lead-comments", person?.id],
    queryFn: () => fetchComments(person!.id),
    enabled: open && !!person?.id,
  });

  async function handleStatusChange(status: string) {
    if (!person) return;
    try {
      await updateLead.mutateAsync({ id: person.id, data: { status } });
      onUpdated();
      toast.success("Status updated");
    } catch { toast.error("Failed to update status"); }
  }

  async function handleAddNote() {
    if (!person || !note.trim()) return;
    setSavingNote(true);
    try {
      await createActivity.mutateAsync({ id: person.id, data: { note: note.trim() } });
      setNote("");
      qc.invalidateQueries({ queryKey: getListPersonActivitiesQueryKey(person.id) });
      toast.success("Note added");
    } catch { toast.error("Failed to add note"); }
    setSavingNote(false);
  }

  if (!person) return null;

  const channel = person.channel ?? person.source ?? "manual";

  // Determine primary social source from activities
  const socialActivity = activities.find((a) => a.type === "social_click");
  const socialPlatform = socialActivity
    ? ((socialActivity.data as Record<string, unknown> | null)?.platform as string | undefined)
    : undefined;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-hidden p-0">
        {/* Fixed header */}
        <div className="px-6 pt-6 pb-4 shrink-0 border-b border-border/50">
          <SheetHeader className="pb-0">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                {person.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg">{person.name}</SheetTitle>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge variant="outline" className={STATUS_COLORS[person.status] ?? ""}>
                    {person.status}
                  </Badge>
                  <Badge variant="outline" className="gap-1 text-xs">
                    {CHANNEL_ICONS[channel] ?? <Globe className="w-3.5 h-3.5" />}
                    {channel.replace(/_/g, " ")}
                  </Badge>
                  {socialPlatform && socialPlatform !== channel && (
                    <Badge variant="outline" className="gap-1 text-xs bg-pink-500/10 text-pink-600 border-pink-500/20">
                      {CHANNEL_ICONS[socialPlatform.toLowerCase()] ?? <MousePointer2 className="w-3.5 h-3.5" />}
                      via {socialPlatform}
                    </Badge>
                  )}
                </div>
                {/* Quick contact links */}
                <div className="flex items-center gap-3 mt-2">
                  {person.email && (
                    <a href={`mailto:${person.email}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                      <Mail className="w-3 h-3" /> {person.email}
                    </a>
                  )}
                  {person.phone && (
                    <a href={`tel:${person.phone}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                      <Phone className="w-3 h-3" /> {person.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </SheetHeader>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="shrink-0 mx-6 mt-3 grid grid-cols-4 h-8">
            <TabsTrigger value="overview"  className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs">
              Transactions
              {transactions.length > 0 && (
                <span className="ml-1 text-[10px] font-bold bg-primary/15 text-primary rounded-full px-1.5">{transactions.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="comments"  className="text-xs">
              Comments
              {comments.length > 0 && (
                <span className="ml-1 text-[10px] font-bold bg-primary/15 text-primary rounded-full px-1.5">{comments.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="invoice"   className="text-xs">Invoice</TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4 space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xl font-bold">{person.pageViews ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Page Views</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xs font-semibold">{person.firstSeenAt ? format(new Date(person.firstSeenAt), "MMM d") : "—"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">First Seen</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xs font-semibold">{person.lastSeenAt ? format(new Date(person.lastSeenAt), "MMM d") : "—"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Last Seen</div>
              </div>
            </div>

            {/* Contact details */}
            <div className="space-y-2 text-sm">
              {person.company && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-4 h-4 shrink-0" /><span>{person.company}</span>
                </div>
              )}
              {person.location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" /><span>{person.location}</span>
                </div>
              )}
            </div>

            {/* Attribution / social source */}
            {(person.utmSource || person.utmCampaign || socialPlatform || channel !== "manual") && (
              <div className="rounded-lg bg-muted/30 border px-3 py-2.5 text-xs space-y-1.5">
                <div className="font-bold text-muted-foreground uppercase tracking-wide text-[10px]">Attribution</div>
                {socialPlatform && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-1">
                      {CHANNEL_ICONS[socialPlatform.toLowerCase()] ?? <MousePointer2 className="w-3 h-3" />} Social Platform
                    </span>
                    <span className="font-semibold capitalize">{socialPlatform}</span>
                  </div>
                )}
                {channel && channel !== "manual" && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel</span>
                    <span className="font-semibold capitalize">{channel.replace(/_/g, " ")}</span>
                  </div>
                )}
                {person.utmSource && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UTM Source</span>
                    <span className="font-semibold">{person.utmSource}</span>
                  </div>
                )}
                {person.utmMedium && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Medium</span>
                    <span className="font-semibold">{person.utmMedium}</span>
                  </div>
                )}
                {person.utmCampaign && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Campaign</span>
                    <span className="font-semibold">{person.utmCampaign}</span>
                  </div>
                )}
                {person.landingPage && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-muted-foreground shrink-0">Landing</span>
                    <span className="font-semibold truncate max-w-[160px] text-right">{person.landingPage}</span>
                  </div>
                )}
              </div>
            )}

            {/* Pipeline stage */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pipeline Stage</div>
              <Select value={person.status} onValueChange={handleStatusChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            {person.notes && (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</div>
                  <p className="text-sm whitespace-pre-wrap">{person.notes}</p>
                </div>
              </>
            )}

            {/* Add note */}
            <Separator />
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Add Note</div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write a note about this person…"
                rows={2}
                className="text-sm"
              />
              <Button size="sm" className="mt-2" onClick={handleAddNote} disabled={savingNote || !note.trim()}>
                {savingNote ? "Saving…" : "Add Note"}
              </Button>
            </div>

            <Separator />

            {/* Activity timeline */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Activity Timeline</div>
              {loadingActivities ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : activities.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No activity yet.</div>
              ) : (
                <div className="relative">
                  <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-3">
                    {activities.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 pl-1">
                        <div className="w-6 h-6 rounded-full bg-background border flex items-center justify-center shrink-0 relative z-10">
                          {ACTIVITY_ICONS[a.type] ?? <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-sm leading-snug">{activityLabel(a)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(a.createdAt), "MMM d, yyyy · h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── TRANSACTIONS ──────────────────────────────────────────────────── */}
          <TabsContent value="transactions" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            {loadingTx ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <CreditCard className="w-8 h-8 text-muted-foreground/40" />
                <div className="text-sm font-medium text-muted-foreground">No transactions yet</div>
                <div className="text-xs text-muted-foreground/60">Orders placed by this person will appear here.</div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground mb-1">
                  {transactions.length} order{transactions.length !== 1 ? "s" : ""} found
                </div>
                {transactions.map((tx) => (
                  <div key={tx.id} className="rounded-lg border bg-card/50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">Order #{tx.id}</div>
                      <Badge variant="outline" className={`text-xs gap-1 ${PAYMENT_STATUS_COLOR[tx.paymentStatus] ?? ""}`}>
                        {PAYMENT_STATUS_ICON[tx.paymentStatus]}
                        {tx.paymentStatus}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground text-xs">{tx.status}</span>
                      <span className="font-bold">
                        {tx.currency === "USD" ? "$" : "₦"}{Number(tx.totalAmount).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(tx.createdAt), "MMM d, yyyy · h:mm a")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── COMMENTS ──────────────────────────────────────────────────────── */}
          <TabsContent value="comments" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            <CommentsTab person={person} comments={comments} loadingComments={loadingComments} />
          </TabsContent>

          {/* ── INVOICE ───────────────────────────────────────────────────────── */}
          <TabsContent value="invoice" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            <InvoiceTab person={person} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
