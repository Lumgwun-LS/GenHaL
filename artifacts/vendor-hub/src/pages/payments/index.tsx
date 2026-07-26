import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { DollarSign, CreditCard, TrendingUp, AlertCircle, RotateCcw, Webhook, CheckCircle2, Copy, XCircle, Clock, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Payment = {
  id: number;
  orderId: number | null;
  vendorId: number;
  provider: string;
  providerReference: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentsSummary = {
  total: number;
  paid: number;
  totalRevenue: number;
  revenueByProvider: { stripe: number; paystack: number };
};

type PaymentsResponse = {
  payments: Payment[];
  summary: PaymentsSummary;
};

type WebhookEvent = {
  id: number;
  provider: string;
  eventType: string;
  eventId: string;
  reference: string | null;
  processedAt: string | null;
  errorMessage: string | null;
  receivedAt: string;
  retryCount: number;
  lastRetriedAt: string | null;
};

type WebhookEventsResponse = {
  events: WebhookEvent[];
  total: number;
};

async function fetchWebhookEvents(provider?: string): Promise<WebhookEventsResponse> {
  const qs = new URLSearchParams({ limit: "200" });
  if (provider && provider !== "all") qs.set("provider", provider);
  const res = await fetch(`${BASE_URL}/api/payments/webhook-events?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch webhook events");
  return res.json();
}

async function fetchPayments(params: { vendorId?: string; provider?: string; status?: string }): Promise<PaymentsResponse> {
  const qs = new URLSearchParams();
  if (params.vendorId) qs.set("vendorId", params.vendorId);
  if (params.provider && params.provider !== "all") qs.set("provider", params.provider);
  if (params.status && params.status !== "all") qs.set("status", params.status);

  const res = await fetch(`${BASE_URL}/api/payments?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch payments");
  return res.json();
}

function statusColor(status: string) {
  switch (status) {
    case "paid": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "pending": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
    case "refunded": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function providerBadge(provider: string) {
  if (provider === "stripe") return "bg-violet-500/10 text-violet-400 border-violet-500/20";
  if (provider === "paystack") return "bg-teal-500/10 text-teal-400 border-teal-500/20";
  return "bg-muted text-muted-foreground";
}

async function retryWebhookEvent(id: number): Promise<{ warning?: string }> {
  const res = await fetch(`${BASE_URL}/api/payments/webhook-events/${id}/retry`, {
    method: "POST",
    credentials: "include",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? "Retry failed");
  }
  return body as { warning?: string };
}

async function refundPayment(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/payments/${id}/refund`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Refund failed");
  }
}

export default function Payments() {
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Manual payment state
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState("");
  const [manualProvider, setManualProvider] = useState("manual");
  const [manualRef, setManualRef] = useState("");
  const [manualCurrency, setManualCurrency] = useState("USD");
  const [manualStatus, setManualStatus] = useState("paid");
  const [manualOrderId, setManualOrderId] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  async function handleManualPayment() {
    if (!manualAmount) return;
    setManualSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/payments/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: manualAmount,
          provider: manualProvider,
          providerReference: manualRef || undefined,
          currency: manualCurrency,
          status: manualStatus,
          orderId: manualOrderId || undefined,
          notes: manualNotes || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to record payment");
      }
      toast.success("Payment recorded");
      setManualOpen(false);
      setManualAmount(""); setManualProvider("manual"); setManualRef(""); setManualCurrency("USD");
      setManualStatus("paid"); setManualOrderId(""); setManualNotes("");
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to record payment");
    } finally {
      setManualSaving(false);
    }
  }
  const [webhookProviderFilter, setWebhookProviderFilter] = useState<string>("all");
  const [webhookSearch, setWebhookSearch] = useState<string>("");
  const [webhookDuplicatesOnly, setWebhookDuplicatesOnly] = useState<boolean>(false);
  const [webhookDayFilter, setWebhookDayFilter] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const highlightId = Number(new URLSearchParams(window.location.search).get("highlight")) || null;
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const scrolledRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ["payments", providerFilter, statusFilter],
    queryFn: () => fetchPayments({ provider: providerFilter, status: statusFilter }),
  });

  useEffect(() => {
    if (!scrolledRef.current && highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      scrolledRef.current = true;
    }
  }, [highlightId, data]);

  const { data: webhookData, isLoading: webhookLoading } = useQuery({
    queryKey: ["webhook-events", webhookProviderFilter],
    queryFn: () => fetchWebhookEvents(webhookProviderFilter),
  });

  const refundMutation = useMutation({
    mutationFn: refundPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: retryWebhookEvent,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["webhook-events"] });
      if (result.warning) {
        toast.warning("Retry ran, but nothing was updated", { description: result.warning, duration: 10000 });
      } else {
        toast.success("Webhook event retried successfully");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Retry failed");
    },
  });

  // Build chart data: revenue by day
  const chartData = (() => {
    if (!data?.payments) return [];
    const dayMap: Record<string, { stripe: number; paystack: number }> = {};
    for (const p of data.payments.filter((p) => p.status === "paid")) {
      const day = new Date(p.createdAt).toISOString().split("T")[0]!;
      if (!dayMap[day]) dayMap[day] = { stripe: 0, paystack: 0 };
      if (p.provider === "stripe") dayMap[day]!.stripe += p.amount;
      else dayMap[day]!.paystack += p.amount;
    }
    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([day, vals]) => ({
        day: format(new Date(day), "MMM d"),
        Stripe: parseFloat(vals.stripe.toFixed(2)),
        Paystack: parseFloat(vals.paystack.toFixed(2)),
      }));
  })();

  // Build chart data: webhook event volume by day (processed vs duplicate/unprocessed)
  const webhookChartData = (() => {
    if (!webhookData?.events) return [];
    const dayMap: Record<string, { processed: number; duplicate: number }> = {};
    for (const e of webhookData.events) {
      const day = new Date(e.receivedAt).toISOString().split("T")[0]!;
      if (!dayMap[day]) dayMap[day] = { processed: 0, duplicate: 0 };
      if (e.processedAt) dayMap[day]!.processed += 1;
      else dayMap[day]!.duplicate += 1;
    }
    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([day, vals]) => ({
        day: format(new Date(day), "MMM d"),
        dayKey: day,
        Processed: vals.processed,
        Duplicate: vals.duplicate,
      }));
  })();

  const summary = data?.summary;

  const filteredWebhookEvents = (webhookData?.events ?? []).filter((e) => {
    if (webhookDayFilter && new Date(e.receivedAt).toISOString().split("T")[0] !== webhookDayFilter) return false;
    if (webhookDuplicatesOnly && (e.processedAt || e.errorMessage)) return false;
    if (webhookSearch.trim()) {
      const q = webhookSearch.trim().toLowerCase();
      const matches =
        e.eventType.toLowerCase().includes(q) ||
        (e.reference ?? "").toLowerCase().includes(q) ||
        e.eventId.toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">Track all transactions across Stripe and Paystack.</p>
        </div>
        <Button onClick={() => setManualOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Record Payment
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-primary">
              ${(summary?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{summary?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{summary?.paid ?? 0} paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Stripe Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-violet-400">
              ${(summary?.revenueByProvider.stripe ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Paystack Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-teal-400">
              ${(summary?.revenueByProvider.paystack ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Revenue by Day (Last 14 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="Stripe" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Paystack" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Webhook volume chart */}
      {webhookChartData.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">Webhook Event Volume (Last 14 Days)</CardTitle>
            <div className="flex items-center gap-2">
              {webhookDayFilter && (
                <span className="text-xs text-muted-foreground">
                  Showing {format(new Date(webhookDayFilter), "MMM d, yyyy")}
                </span>
              )}
              {webhookDayFilter && (
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setWebhookDayFilter(null)}>
                  <XCircle className="w-3 h-3" /> Clear day filter
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={webhookChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="Processed"
                  stackId="webhooks"
                  fill="#10b981"
                  radius={[0, 0, 0, 0]}
                  cursor="pointer"
                  onClick={(d: any) => setWebhookDayFilter((prev) => (prev === d.dayKey ? null : d.dayKey))}
                />
                <Bar
                  dataKey="Duplicate"
                  stackId="webhooks"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(d: any) => setWebhookDayFilter((prev) => (prev === d.dayKey ? null : d.dayKey))}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filters + table */}
      <Card>
        <div className="p-4 border-b flex gap-3 items-center flex-wrap">
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="stripe">Stripe</SelectItem>
              <SelectItem value="paystack">Paystack</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">Loading payments...</TableCell>
              </TableRow>
            ) : data?.payments?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <AlertCircle className="w-8 h-8" />
                    <span>No payments yet.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.payments?.map((p) => (
                <TableRow
                  key={p.id}
                  ref={p.id === highlightId ? highlightRef : undefined}
                  className={p.id === highlightId ? "ring-2 ring-primary bg-primary/5" : undefined}
                >
                  <TableCell className="font-mono text-xs">#{p.id}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={providerBadge(p.provider)}>
                      {p.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.orderId ? `#${p.orderId}` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[140px] truncate" title={p.providerReference}>
                    {p.providerReference}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(p.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColor(p.status)}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {p.currency} {p.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.status === "paid" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                        disabled={refundMutation.isPending && refundMutation.variables === p.id}
                        onClick={() => {
                          if (window.confirm(`Refund payment #${p.id} (${p.currency} ${p.amount.toFixed(2)})? This cannot be undone.`)) {
                            refundMutation.mutate(p.id);
                          }
                        }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        {refundMutation.isPending && refundMutation.variables === p.id ? "Refunding…" : "Refund"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      {/* Webhook Events */}
      <Card>
        <div className="p-4 border-b flex gap-3 items-center justify-between flex-wrap">
          <div className="flex items-center gap-2">
            <Webhook className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-base">Webhook Events</span>
            {webhookData && (
              <span className="text-xs text-muted-foreground">({filteredWebhookEvents.length} of {webhookData.total} shown)</span>
            )}
            {webhookDayFilter && (
              <Badge variant="outline" className="gap-1 text-xs">
                {format(new Date(webhookDayFilter), "MMM d, yyyy")}
                <button
                  type="button"
                  onClick={() => setWebhookDayFilter(null)}
                  className="ml-1 hover:text-foreground"
                  aria-label="Clear day filter"
                >
                  <XCircle className="w-3 h-3" />
                </button>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={webhookSearch}
              onChange={(e) => setWebhookSearch(e.target.value)}
              placeholder="Search event type or reference…"
              className="w-56"
            />
            <Button
              type="button"
              size="sm"
              variant={webhookDuplicatesOnly ? "default" : "outline"}
              className="text-xs gap-1"
              onClick={() => setWebhookDuplicatesOnly((v) => !v)}
            >
              <Copy className="w-3 h-3" />
              {webhookDuplicatesOnly ? "Showing skipped/unprocessed" : "Only skipped/unprocessed"}
            </Button>
            <Select value={webhookProviderFilter} onValueChange={setWebhookProviderFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="paystack">Paystack</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhookLoading ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8">Loading webhook events…</TableCell>
              </TableRow>
            ) : filteredWebhookEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Webhook className="w-8 h-8" />
                    <span>
                      {webhookData?.events?.length ? "No webhook events match your filters." : "No webhook events recorded yet."}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredWebhookEvents.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Badge variant="outline" className={providerBadge(e.provider)}>
                      {e.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.eventType}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[160px] truncate" title={e.reference ?? undefined}>
                    {e.reference ? (
                      <span className="flex items-center gap-1">
                        <Copy className="w-3 h-3 text-muted-foreground shrink-0" />
                        {e.reference}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(e.receivedAt), "MMM d, yyyy HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    {e.processedAt ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Processed
                      </Badge>
                    ) : e.errorMessage ? (
                      <span title={e.errorMessage}>
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 gap-1 cursor-help">
                          <XCircle className="w-3 h-3" /> Failed
                        </Badge>
                      </span>
                    ) : (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1">
                        <Clock className="w-3 h-3" /> Pending
                      </Badge>
                    )}
                    {e.retryCount > 0 && (
                      <div
                        className="text-xs text-muted-foreground mt-1"
                        title={e.lastRetriedAt ? `Last retried at ${format(new Date(e.lastRetriedAt), "MMM d, yyyy HH:mm:ss")}` : undefined}
                      >
                        Retried {e.retryCount}x
                        {e.lastRetriedAt && `, last at ${format(new Date(e.lastRetriedAt), "MMM d, HH:mm")}`}
                      </div>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {!e.processedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          disabled={retryMutation.isPending && retryMutation.variables === e.id}
                          onClick={() => retryMutation.mutate(e.id)}
                        >
                          <RotateCcw className="w-3 h-3" />
                          {retryMutation.isPending && retryMutation.variables === e.id ? "Retrying…" : "Retry"}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Manual Payment Dialog */}
      <Dialog open={manualOpen} onOpenChange={v => { if (!v) { setManualAmount(""); setManualProvider("manual"); setManualRef(""); setManualCurrency("USD"); setManualStatus("paid"); setManualOrderId(""); setManualNotes(""); } setManualOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Manual Payment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={manualCurrency} onValueChange={setManualCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="NGN">NGN</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={manualProvider} onValueChange={setManualProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="paystack">Paystack</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={manualStatus} onValueChange={setManualStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reference (optional)</Label>
              <Input value={manualRef} onChange={e => setManualRef(e.target.value)} placeholder="Auto-generated if blank" />
            </div>
            <div className="space-y-1.5">
              <Label>Order ID (optional)</Label>
              <Input type="number" value={manualOrderId} onChange={e => setManualOrderId(e.target.value)} placeholder="Link to an existing order" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={manualNotes} onChange={e => setManualNotes(e.target.value)} rows={2} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button onClick={handleManualPayment} disabled={manualSaving || !manualAmount}>
              {manualSaving ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
