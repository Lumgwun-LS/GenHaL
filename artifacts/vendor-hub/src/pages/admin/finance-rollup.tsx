import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { useGetAdminFinanceRollupAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Wallet, PiggyBank, Download, ArrowLeft, ChevronRight, ShoppingCart, CreditCard, BarChart2 } from "lucide-react";
import { toast } from "sonner";
import { VendorFinanceOverview } from "@/components/VendorFinanceOverview";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const PERIODS = [
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
  { value: "custom", label: "Custom range" },
];

const TIERS = ["free", "starter", "pro", "enterprise"] as const;
const ANY = "__any__";

const PIE_COLORS = ["hsl(217 91% 60%)", "hsl(24 95% 62%)", "hsl(142 71% 45%)", "hsl(0 84% 60%)", "hsl(271 81% 56%)", "hsl(48 96% 53%)", "hsl(199 89% 48%)", "hsl(340 82% 52%)", "hsl(160 84% 39%)", "hsl(280 65% 60%)"];

type DrilldownView = "finance" | "orders" | "payments";

interface DrilldownVendor {
  vendorId: number;
  vendorName: string;
  /** Period context inherited from the rollup filters */
  period: string;
  from: string;
  to: string;
}

// ─── Inline order / payment row types ────────────────────────────────────────

interface OrderRow {
  id: number;
  customerName: string;
  customerEmail: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

interface PaymentRow {
  id: number;
  orderId: number | null;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
}

// ─── Small helper: resolve the ISO date bounds for a period string ─────────────
function periodToDateRange(period: string, from: string, to: string): { from: string; to: string } {
  if (period === "custom") {
    return {
      from: from ? new Date(from).toISOString() : "",
      to: to ? new Date(to).toISOString() : "",
    };
  }
  const now = new Date();
  const end = now.toISOString();
  if (period === "week") return { from: new Date(now.getTime() - 7 * 86400_000).toISOString(), to: end };
  if (period === "year") return { from: new Date(now.getTime() - 365 * 86400_000).toISOString(), to: end };
  // default: month
  return { from: new Date(now.getTime() - 30 * 86400_000).toISOString(), to: end };
}

// ─── Vendor orders sub-panel ──────────────────────────────────────────────────
function VendorOrdersView({ vendorId, period, from, to }: { vendorId: number; period: string; from: string; to: string }) {
  const { from: isoFrom, to: isoTo } = periodToDateRange(period, from, to);
  const qs = new URLSearchParams({ vendorId: String(vendorId) });
  if (isoFrom) qs.set("from", isoFrom);
  if (isoTo) qs.set("to", isoTo);

  const { data, isLoading, isError } = useQuery<OrderRow[]>({
    queryKey: ["admin-vendor-orders", vendorId, isoFrom, isoTo],
    queryFn: async () => {
      const res = await authFetch(`${BASE_URL}/api/orders?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json() as Promise<OrderRow[]>;
    },
  });

  const STATUS_COLORS: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    pending: "bg-yellow-100 text-yellow-700",
    cancelled: "bg-red-100 text-red-700",
    processing: "bg-blue-100 text-blue-700",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Orders</CardTitle>
        <CardDescription>Orders placed with this vendor in the selected period.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading orders…</div>
        ) : isError ? (
          <div className="py-8 text-center text-destructive">Failed to load orders.</div>
        ) : !data?.length ? (
          <div className="py-8 text-center text-muted-foreground text-sm">No orders in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="table-drilldown-orders">
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">#{o.id}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{o.customerName}</div>
                      <div className="text-xs text-muted-foreground">{o.customerEmail}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] ?? "bg-muted text-foreground"}`}>
                        {o.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${(o.totalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 text-xs text-muted-foreground">{data.length} order{data.length !== 1 ? "s" : ""} in period</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Vendor payments sub-panel ────────────────────────────────────────────────
function VendorPaymentsView({ vendorId, period, from, to }: { vendorId: number; period: string; from: string; to: string }) {
  const { from: isoFrom, to: isoTo } = periodToDateRange(period, from, to);
  const qs = new URLSearchParams({ vendorId: String(vendorId) });
  if (isoFrom) qs.set("from", isoFrom);
  if (isoTo) qs.set("to", isoTo);

  const { data, isLoading, isError } = useQuery<{ payments: PaymentRow[]; summary: { total: number; paid: number; totalRevenue: number } }>({
    queryKey: ["admin-vendor-payments", vendorId, isoFrom, isoTo],
    queryFn: async () => {
      const res = await authFetch(`${BASE_URL}/api/payments?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json() as Promise<{ payments: PaymentRow[]; summary: { total: number; paid: number; totalRevenue: number } }>;
    },
  });

  const STATUS_COLORS: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700",
    pending: "bg-yellow-100 text-yellow-700",
    failed: "bg-red-100 text-red-700",
    refunded: "bg-purple-100 text-purple-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payments</CardTitle>
        <CardDescription>Payment transactions for this vendor in the selected period.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading payments…</div>
        ) : isError ? (
          <div className="py-8 text-center text-destructive">Failed to load payments.</div>
        ) : !data?.payments.length ? (
          <div className="py-8 text-center text-muted-foreground text-sm">No payments in this period.</div>
        ) : (
          <>
            <div className="flex gap-4 mb-4 flex-wrap">
              <div className="rounded-lg border px-4 py-2 text-center">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-lg font-bold">{data.summary.total}</div>
              </div>
              <div className="rounded-lg border px-4 py-2 text-center">
                <div className="text-xs text-muted-foreground">Paid</div>
                <div className="text-lg font-bold text-emerald-600">{data.summary.paid}</div>
              </div>
              <div className="rounded-lg border px-4 py-2 text-center">
                <div className="text-xs text-muted-foreground">Revenue</div>
                <div className="text-lg font-bold text-emerald-600">
                  ${data.summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table data-testid="table-drilldown-payments">
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">#{p.id}{p.orderId ? ` / Order #${p.orderId}` : ""}</TableCell>
                      <TableCell className="capitalize text-sm">{p.provider}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] ?? "bg-muted text-foreground"}`}>
                          {p.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {p.currency?.toUpperCase() ?? "$"} {(p.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface ExportFilters {
  tier: string;
  industry: string;
}

const EMPTY_EXPORT_FILTERS: ExportFilters = { tier: ANY, industry: "" };

export default function AdminFinanceRollupPanel() {
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPopoverOpen, setExportPopoverOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState<ExportFilters>(EMPTY_EXPORT_FILTERS);
  const [drilldown, setDrilldown] = useState<DrilldownVendor | null>(null);
  const [drilldownView, setDrilldownView] = useState<DrilldownView>("finance");

  const params = {
    period,
    ...(period === "custom" && from ? { from: new Date(from).toISOString() } : {}),
    ...(period === "custom" && to ? { to: new Date(to).toISOString() } : {}),
    ...(showBreakdown ? { breakdown: "true" } : {}),
  };
  const { data, isLoading } = useGetAdminFinanceRollupAnalytics(params);

  async function handleExport(filters: ExportFilters) {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ period });
      if (period === "custom" && from) qs.set("from", new Date(from).toISOString());
      if (period === "custom" && to) qs.set("to", new Date(to).toISOString());
      if (filters.tier !== ANY) qs.set("tier", filters.tier);
      if (filters.industry.trim()) qs.set("industry", filters.industry.trim());
      const url = `${BASE_URL}/api/admin/analytics/finance-rollup/export?${qs.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Exports are paused for this account. Ask another admin to review.");
        return;
      }
      if (!res.ok) {
        toast.error("Export failed.");
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `finance-rollup-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success("CSV download started");
    } catch {
      toast.error("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  // Drill-down view: show a single vendor's finance overview, orders, or payments
  if (drilldown) {
    return (
      <div className="space-y-6">
        {/* Breadcrumb + back button */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDrilldown(null); setDrilldownView("finance"); }}
            className="gap-1.5"
            data-testid="btn-finance-drilldown-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to rollup
          </Button>
          <div className="text-sm text-muted-foreground">
            Finance Rollup
            <ChevronRight className="inline h-3.5 w-3.5 mx-1" />
            <span className="font-medium text-foreground">{drilldown.vendorName}</span>
            {drilldownView !== "finance" && (
              <>
                <ChevronRight className="inline h-3.5 w-3.5 mx-1" />
                <span className="font-medium text-foreground capitalize">{drilldownView}</span>
              </>
            )}
          </div>
        </div>

        {/* Sub-view switcher */}
        <div className="flex gap-2" data-testid="drilldown-view-switcher">
          <Button
            variant={drilldownView === "finance" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setDrilldownView("finance")}
            data-testid="btn-drilldown-finance"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Finance Overview
          </Button>
          <Button
            variant={drilldownView === "orders" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setDrilldownView("orders")}
            data-testid="btn-drilldown-orders"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Orders
          </Button>
          <Button
            variant={drilldownView === "payments" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setDrilldownView("payments")}
            data-testid="btn-drilldown-payments"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Payments
          </Button>
        </div>

        {/* Sub-view content */}
        {drilldownView === "finance" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{drilldown.vendorName} — Finance Overview</CardTitle>
              <CardDescription>Full revenue, P&amp;L, expenses, and investment performance for this vendor.</CardDescription>
            </CardHeader>
            <CardContent>
              <VendorFinanceOverview vendorId={drilldown.vendorId} vendorName={drilldown.vendorName} />
            </CardContent>
          </Card>
        )}

        {drilldownView === "orders" && (
          <VendorOrdersView
            vendorId={drilldown.vendorId}
            period={drilldown.period}
            from={drilldown.from}
            to={drilldown.to}
          />
        )}

        {drilldownView === "payments" && (
          <VendorPaymentsView
            vendorId={drilldown.vendorId}
            period={drilldown.period}
            from={drilldown.from}
            to={drilldown.to}
          />
        )}
      </div>
    );
  }

  const netProfit = data?.profitAndLoss.netProfit ?? 0;
  const stats = [
    { title: "Platform Revenue", value: `$${(data?.profitAndLoss.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-emerald-500" },
    { title: "Platform Expenses", value: `$${(data?.profitAndLoss.totalExpenses ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Wallet, color: "text-destructive" },
    { title: "Net Profit", value: `$${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: netProfit >= 0 ? TrendingUp : TrendingDown, color: netProfit >= 0 ? "text-emerald-500" : "text-destructive" },
    { title: "Investment ROI", value: `${(data?.investmentRoi.overallRoiPercent ?? 0).toFixed(1)}%`, icon: PiggyBank, color: (data?.investmentRoi.overallRoiPercent ?? 0) >= 0 ? "text-emerald-500" : "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Aggregate revenue, expenses, and investment performance across every vendor on the platform.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40" data-testid="select-finance-rollup-period"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-finance-rollup-from" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-finance-rollup-to" />
              </div>
            </>
          )}
          <div className="flex items-center gap-2 pb-1.5">
            <Checkbox
              id="finance-rollup-breakdown"
              checked={showBreakdown}
              onCheckedChange={(checked) => setShowBreakdown(checked === true)}
              data-testid="checkbox-finance-rollup-breakdown"
            />
            <Label htmlFor="finance-rollup-breakdown" className="text-xs cursor-pointer">Show per-vendor breakdown</Label>
          </div>
          <div className="pb-1.5 ml-auto">
            <Popover open={exportPopoverOpen} onOpenChange={setExportPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting}
                  data-testid="btn-finance-rollup-export"
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exporting ? "Exporting…" : "Export CSV"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-4">
                <div className="text-xs font-medium text-muted-foreground">Export filters (optional)</div>
                <div className="space-y-1">
                  <Label className="text-xs">Subscription Tier</Label>
                  <Select
                    value={exportFilters.tier}
                    onValueChange={(v) => setExportFilters((f) => ({ ...f, tier: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-finance-rollup-export-tier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY} className="text-xs">Any tier</SelectItem>
                      {TIERS.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Industry</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="e.g. Retail"
                    value={exportFilters.industry}
                    onChange={(e) => setExportFilters((f) => ({ ...f, industry: e.target.value }))}
                    data-testid="input-finance-rollup-export-industry"
                  />
                </div>
                <div className="flex justify-between gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setExportFilters(EMPTY_EXPORT_FILTERS)}
                    data-testid="btn-finance-rollup-export-clear"
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs"
                    disabled={exporting}
                    data-testid="btn-finance-rollup-export-confirm"
                    onClick={() => {
                      setExportPopoverOpen(false);
                      void handleExport(exportFilters);
                    }}
                  >
                    {exporting ? "Exporting…" : "Export CSV"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading platform finance data…</div>
      ) : !data ? (
        <div className="p-8 text-center text-muted-foreground">No data available.</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{stat.value}</div></CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Trend</CardTitle>
                <CardDescription>Daily revenue across all vendors over the selected period.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profit &amp; Loss</CardTitle>
                <CardDescription>Platform-wide revenue vs. expenses by day.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.profitAndLoss.byPeriod}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} name="Revenue" />
                    <Bar dataKey="expenses" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} name="Expenses" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Expense Breakdown</CardTitle>
                <CardDescription>Platform-wide spend by category.</CardDescription>
              </CardHeader>
              <CardContent>
                {!data.expenseByCategory.length ? (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">No expenses in this period.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={data.expenseByCategory} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={(entry) => entry.category}>
                        {data.expenseByCategory.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cash Flow Forecast</CardTitle>
                <CardDescription>Historical net cash flow across all vendors, projected forward using the average daily net.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.cashFlowForecast}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                    <Line type="monotone" dataKey="projectedNet" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Investment ROI</CardTitle>
              <CardDescription>Return across every vendor's owner capital, loans, equity, and external assets.</CardDescription>
            </CardHeader>
            <CardContent>
              {!data.investmentRoi.byInvestment.length ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No investments recorded yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.investmentRoi.byInvestment} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                    <Bar dataKey="roiPercent" radius={[0, 4, 4, 0]}>
                      {data.investmentRoi.byInvestment.map((inv, idx) => (
                        <Cell key={idx} fill={inv.roiPercent >= 0 ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {showBreakdown && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-vendor breakdown</CardTitle>
                <CardDescription>
                  Revenue, expenses, and investment performance for each vendor over the selected period.{" "}
                  <span className="text-muted-foreground">Click a row to see that vendor's full finance charts.</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!data.byVendor?.length ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">No vendor activity in this period.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table data-testid="table-finance-rollup-by-vendor">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendor</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Expenses</TableHead>
                          <TableHead className="text-right">Net Profit</TableHead>
                          <TableHead className="text-right">Invested</TableHead>
                          <TableHead className="text-right">Current Value</TableHead>
                          <TableHead className="text-right">ROI</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byVendor.map((v) => (
                          <TableRow
                            key={v.vendorId}
                            data-testid={`row-finance-rollup-vendor-${v.vendorId}`}
                            className="cursor-pointer hover:bg-muted/60 transition-colors"
                            onClick={() => { setDrilldown({ vendorId: v.vendorId, vendorName: v.vendorName, period, from, to }); setDrilldownView("finance"); }}
                          >
                            <TableCell className="font-medium">{v.vendorName}</TableCell>
                            <TableCell className="text-right">${v.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right">${v.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className={`text-right ${v.netProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                              ${v.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right">${v.totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right">${v.totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className={`text-right ${v.overallRoiPercent >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                              {v.overallRoiPercent.toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-right">
                              <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
