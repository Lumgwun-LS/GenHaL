/**
 * Platform Financials Dashboard
 *
 * Unified view of Replit/infrastructure charges vs platform revenue,
 * with filters: period preset, custom date range, country, resource type, year.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line,
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown, Server, Globe, CreditCard,
  Zap, Loader2, RefreshCw, Filter, Calendar, BarChart3, ArrowUpRight,
  Users, Bot, Phone, Mail, MessageSquare, Music, Wifi, Database,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Summary {
  totalInfrastructureCosts: number;
  totalExternalApiCosts: number;
  totalCosts: number;
  totalSubscriptionRevenue: number;
  totalOverageRevenue: number;
  totalGrossRevenue: number;
  netProfit: number;
  profitMarginPct: number;
  mrrUsd: number;
  arrUsd: number;
  totalVendors: number;
  payingVendors: number;
  freeVendors: number;
  replitInfraBreakdown: {
    fixedVm: number; workspace: number; database: number;
    objectStorage: number; egress: number;
  };
}
interface ResourceCost {
  resource: string; label: string; units: number;
  costUsd: number; overageRevenueUsd: number; costPerUnit: number;
}
interface TimePoint { date: string; revenue: number; resourceCostUsd: number; infraCostUsd: number; totalCostUsd: number; }
interface RollupPoint { label: string; revenue: number; costUsd: number; }
interface CountryRow { country: string; revenue: number; count: number; vendorCount: number; }
interface GatewayRow { gateway: string; revenue: number; count: number; }
interface TierRow { tier: string; revenue: number; count: number; }
interface FinancialsData {
  range: { from: string; to: string; period: string };
  filters: { country: string | null; resource: string | null };
  summary: Summary;
  resourceCosts: ResourceCost[];
  revenueByCountry: CountryRow[];
  revenueByGateway: GatewayRow[];
  revenueByTier: TierRow[];
  timeSeries: TimePoint[];
  weeklyTotals: RollupPoint[];
  monthlyTotals: RollupPoint[];
  yearlyTotals: RollupPoint[];
  allCountries: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
type PeriodPreset = "today" | "7d" | "30d" | "90d" | "ytd" | "year" | "custom";

const RESOURCE_OPTIONS = [
  { value: "", label: "All Resources" },
  { value: "aiImages", label: "AI Images" },
  { value: "aiVideos", label: "AI Videos" },
  { value: "aiCaptions", label: "AI Captions" },
  { value: "voiceMinutes", label: "Voice Minutes" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
];

const RESOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  aiImages: Bot, aiVideos: Music, aiCaptions: Bot,
  voiceMinutes: Phone, sms: MessageSquare, email: Mail,
};

const TIER_COLORS: Record<string, string> = {
  free: "#6b7280", starter: "#3b82f6", pro: "#8b5cf6", enterprise: "#f59e0b", unknown: "#d1d5db",
};
const GATEWAY_COLORS: Record<string, string> = {
  stripe: "#635bff", paystack: "#00c3f7", paypal: "#003087",
  nomba: "#10b981", remita: "#f59e0b", unknown: "#6b7280",
};
const PIE_COLORS = ["#7F50FF", "#FF7F50", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, d = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtUsd(n: number) { return `$${fmt(n)}`; }
function fmtPct(n: number) { return `${fmt(n, 1)}%`; }
function fmtShort(n: number) {
  if (n >= 1_000_000) return `$${fmt(n / 1_000_000, 1)}M`;
  if (n >= 1_000) return `$${fmt(n / 1_000, 1)}K`;
  return fmtUsd(n);
}

function presetToRange(preset: PeriodPreset, customFrom: string, customTo: string, selectedYear: number): { from: string; to: string; period: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().split("T")[0]!;
  const today = iso(now);
  if (preset === "today") return { from: today, to: today, period: "custom" };
  if (preset === "7d") { const f = new Date(now.getTime() - 7 * 864e5); return { from: iso(f), to: today, period: "week" }; }
  if (preset === "30d") { const f = new Date(now.getTime() - 30 * 864e5); return { from: iso(f), to: today, period: "month" }; }
  if (preset === "90d") { const f = new Date(now.getTime() - 90 * 864e5); return { from: iso(f), to: today, period: "custom" }; }
  if (preset === "ytd") { return { from: `${now.getFullYear()}-01-01`, to: today, period: "custom" }; }
  if (preset === "year") { return { from: `${selectedYear}-01-01`, to: `${selectedYear}-12-31`, period: "custom" }; }
  return { from: customFrom || iso(new Date(now.getTime() - 30 * 864e5)), to: customTo || today, period: "custom" };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, trend, color = "text-foreground", highlight }: {
  title: string; value: string; sub?: string; icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral"; color?: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-violet-500/40 bg-violet-500/5" : ""}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Icon className="w-5 h-5 text-muted-foreground" />
            {trend === "up" && <TrendingUp className="w-4 h-4 text-emerald-500" />}
            {trend === "down" && <TrendingDown className="w-4 h-4 text-red-500" />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 text-sm shadow-md">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center justify-between gap-4">
          <span>{p.name}</span><span className="font-medium">{fmtUsd(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function PlatformFinancialsPanel() {
  const [preset, setPreset] = useState<PeriodPreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [countryFilter, setCountryFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [chartView, setChartView] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");

  const { from, to, period } = presetToRange(preset, customFrom, customTo, selectedYear);

  const params = new URLSearchParams({ period, from, to });
  if (countryFilter) params.set("country", countryFilter);
  if (resourceFilter) params.set("resource", resourceFilter);

  const queryKey = ["admin-platform-financials", from, to, period, countryFilter, resourceFilter];

  const { data, isLoading, error, refetch } = useQuery<FinancialsData>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/admin/analytics/platform-financials?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    if (chartView === "weekly") return data.weeklyTotals.map(r => ({ label: r.label, Revenue: r.revenue, "Platform Cost": r.costUsd }));
    if (chartView === "monthly") return data.monthlyTotals.map(r => ({ label: r.label, Revenue: r.revenue, "Platform Cost": r.costUsd }));
    if (chartView === "yearly") return data.yearlyTotals.map(r => ({ label: r.label, Revenue: r.revenue, "Platform Cost": r.costUsd }));
    return data.timeSeries.map(r => ({ label: r.date, Revenue: r.revenue, "Platform Cost": r.totalCostUsd }));
  }, [data, chartView]);

  const countryChartData = useMemo(() => {
    if (!data) return [];
    return data.revenueByCountry.slice(0, 10).map(r => ({ country: r.country, Revenue: r.revenue, Vendors: r.vendorCount }));
  }, [data]);

  const infraBreakdownData = useMemo(() => {
    if (!data?.summary.replitInfraBreakdown) return [];
    const b = data.summary.replitInfraBreakdown;
    return [
      { name: "Fixed VMs", value: b.fixedVm },
      { name: "Workspace", value: b.workspace },
      { name: "Database", value: b.database },
      { name: "Object Storage", value: b.objectStorage },
      { name: "Egress", value: b.egress },
      { name: "External APIs", value: data.summary.totalExternalApiCosts },
    ].filter(d => d.value > 0);
  }, [data]);

  const presets: { key: PeriodPreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d", label: "7D" },
    { key: "30d", label: "30D" },
    { key: "90d", label: "90D" },
    { key: "ytd", label: "YTD" },
    { key: "year", label: "Year" },
    { key: "custom", label: "Custom" },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground text-sm">Loading platform financials…</span>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-red-400 mb-3">Failed to load platform financials.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry</Button>
      </div>
    );
  }

  const { summary, resourceCosts, revenueByCountry, revenueByGateway, revenueByTier, allCountries } = data;
  const netProfitColor = summary.netProfit >= 0 ? "text-emerald-500" : "text-red-500";

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-400" />
            Platform Financials
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Replit infrastructure charges vs platform revenue — filtered, comparable, exportable.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Period presets */}
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground font-medium">Period</p>
              <div className="flex gap-1 flex-wrap">
                {presets.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPreset(p.key)}
                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                      preset === p.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Year selector (only relevant for "year" preset) */}
            {preset === "year" && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground font-medium">Year</p>
                <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEAR_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Custom date range */}
            {preset === "custom" && (
              <div className="flex gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground font-medium">From</p>
                  <Input type="date" className="h-8 text-xs w-36" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground font-medium">To</p>
                  <Input type="date" className="h-8 text-xs w-36" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                </div>
              </div>
            )}

            <div className="h-px w-px" />

            {/* Country filter */}
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Globe className="w-3 h-3" /> Country</p>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="All Countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Countries</SelectItem>
                  {allCountries.map(c => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Resource filter */}
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Zap className="w-3 h-3" /> Resource</p>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="All Resources" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {(countryFilter || resourceFilter) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs self-end" onClick={() => { setCountryFilter(""); setResourceFilter(""); }}>
                <Filter className="w-3 h-3 mr-1" /> Clear filters
              </Button>
            )}

            <div className="ml-auto text-xs text-muted-foreground self-end">
              <Calendar className="w-3 h-3 inline mr-1" />
              {new Date(from).toLocaleDateString()} – {new Date(to).toLocaleDateString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Replit Costs" value={fmtShort(summary.totalCosts)} sub="Infrastructure + APIs"
          icon={Server} color="text-red-400" trend="down" />
        <KpiCard title="Subscription Revenue" value={fmtShort(summary.totalSubscriptionRevenue)} sub="Paid subscriptions"
          icon={CreditCard} trend="up" color="text-emerald-400" />
        <KpiCard title="Overage Revenue" value={fmtShort(summary.totalOverageRevenue)} sub="Pay-as-you-go"
          icon={TrendingUp} color="text-amber-400" />
        <KpiCard title="Net Profit" value={fmtShort(summary.netProfit)} sub={`${fmtPct(summary.profitMarginPct)} margin`}
          icon={DollarSign} color={netProfitColor} trend={summary.netProfit >= 0 ? "up" : "down"} highlight />
        <KpiCard title="MRR" value={fmtShort(summary.mrrUsd)} sub={`ARR ${fmtShort(summary.arrUsd)}`}
          icon={ArrowUpRight} color="text-violet-400" />
        <KpiCard title="Paying Vendors" value={String(summary.payingVendors)}
          sub={`${summary.totalVendors} total · ${summary.freeVendors} free`}
          icon={Users} />
      </div>

      {/* ── Replit Cost Breakdown cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Fixed VMs", value: summary.replitInfraBreakdown.fixedVm, icon: Server },
          { label: "Replit Workspace", value: summary.replitInfraBreakdown.workspace, icon: Database },
          { label: "PostgreSQL DB", value: summary.replitInfraBreakdown.database, icon: Database },
          { label: "Object Storage", value: summary.replitInfraBreakdown.objectStorage, icon: Database },
          { label: "Egress", value: summary.replitInfraBreakdown.egress, icon: Wifi },
          { label: "External APIs", value: summary.totalExternalApiCosts, icon: Bot },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-dashed">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
              </div>
              <p className="text-sm font-bold text-red-400">{fmtUsd(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Revenue vs Costs Chart ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Revenue vs Platform Costs</CardTitle>
              <CardDescription>Gross revenue collected vs total Replit charges over time</CardDescription>
            </div>
            <div className="flex gap-1">
              {(["daily", "weekly", "monthly", "yearly"] as const).map(v => (
                <button key={v} onClick={() => setChartView(v)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors capitalize ${
                    chartView === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"
                  }`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7F50FF" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#7F50FF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="Revenue" stroke="#7F50FF" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                <Area type="monotone" dataKey="Platform Cost" stroke="#ef4444" strokeWidth={2} fill="url(#costGrad)" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Two-column: Cost breakdown + Revenue by gateway ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost breakdown donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Server className="w-4 h-4 text-red-400" /> Cost Breakdown</CardTitle>
            <CardDescription>Replit infra + external API charges</CardDescription>
          </CardHeader>
          <CardContent>
            {infraBreakdownData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No cost data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={infraBreakdownData} dataKey="value" nameKey="name" cx="40%" cy="50%"
                    outerRadius={80} innerRadius={50}>
                    {infraBreakdownData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]!} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtUsd(v)} />
                  <Legend layout="vertical" align="right" verticalAlign="middle"
                    formatter={(v: string) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Revenue by gateway donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-violet-400" /> Revenue by Gateway</CardTitle>
            <CardDescription>Subscription payments per payment provider</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueByGateway.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No payment data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={revenueByGateway} dataKey="revenue" nameKey="gateway" cx="40%" cy="50%"
                    outerRadius={80} innerRadius={50}>
                    {revenueByGateway.map((r, i) => <Cell key={i} fill={GATEWAY_COLORS[r.gateway] ?? PIE_COLORS[i % PIE_COLORS.length]!} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [fmtUsd(v), n.charAt(0).toUpperCase() + n.slice(1)]} />
                  <Legend layout="vertical" align="right" verticalAlign="middle"
                    formatter={(v: string) => <span className="text-xs capitalize">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Revenue by Country bar chart ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-400" /> Revenue by Country</CardTitle>
          <CardDescription>Top 10 countries by subscription revenue collected</CardDescription>
        </CardHeader>
        <CardContent>
          {countryChartData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No country data — vendors may not have location set</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, countryChartData.length * 36)}>
              <BarChart data={countryChartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="country" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={90} />
                <Tooltip formatter={(v: number, n: string) => [n === "Revenue" ? fmtUsd(v) : v, n]} />
                <Bar dataKey="Revenue" fill="#7F50FF" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Resource Cost Table ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Resource Cost Breakdown</CardTitle>
          <CardDescription>Units consumed, provider cost, and overage revenue collected per resource type</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead className="text-right">Units Used</TableHead>
                <TableHead className="text-right">Cost / Unit</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Overage Revenue</TableHead>
                <TableHead className="text-right">Net on API</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resourceCosts.map(rc => {
                const Icon = RESOURCE_ICONS[rc.resource] ?? Bot;
                const netOnApi = rc.overageRevenueUsd - rc.costUsd;
                return (
                  <TableRow key={rc.resource}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{rc.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(rc.units, rc.units < 1 ? 4 : 0)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${rc.costPerUnit.toFixed(4)}</TableCell>
                    <TableCell className="text-right text-red-400 font-medium">{rc.costUsd > 0 ? fmtUsd(rc.costUsd) : "—"}</TableCell>
                    <TableCell className="text-right text-emerald-400">{rc.overageRevenueUsd > 0 ? fmtUsd(rc.overageRevenueUsd) : "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${netOnApi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {rc.costUsd > 0 || rc.overageRevenueUsd > 0 ? fmtUsd(netOnApi) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Totals row */}
              <TableRow className="font-semibold bg-muted/30">
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right text-red-400">{fmtUsd(summary.totalExternalApiCosts)}</TableCell>
                <TableCell className="text-right text-emerald-400">{fmtUsd(summary.totalOverageRevenue)}</TableCell>
                <TableCell className={`text-right ${summary.totalOverageRevenue - summary.totalExternalApiCosts >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtUsd(summary.totalOverageRevenue - summary.totalExternalApiCosts)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Revenue by Country Table ────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-400" /> Country Revenue Detail</CardTitle>
          <CardDescription>Subscription payments, transaction count, and vendor base per country</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Vendors</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Avg / Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenueByCountry.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No payment data for selected filters</TableCell></TableRow>
              ) : (
                revenueByCountry.map(r => (
                  <TableRow key={r.country}>
                    <TableCell className="font-medium">{r.country}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.vendorCount}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.count}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-medium">{fmtUsd(r.revenue)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.count > 0 ? fmtUsd(r.revenue / r.count) : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Revenue by Tier Table ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-violet-400" /> Revenue by Plan Tier</CardTitle>
          <CardDescription>How much revenue each subscription tier contributed in the selected period</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenueByTier.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No tier data for selected filters</TableCell></TableRow>
              ) : (
                revenueByTier.map(r => (
                  <TableRow key={r.tier}>
                    <TableCell>
                      <Badge style={{ backgroundColor: TIER_COLORS[r.tier] ?? "#6b7280" }} className="text-white capitalize text-[10px]">
                        {r.tier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.count}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-400">{fmtUsd(r.revenue)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {summary.totalSubscriptionRevenue > 0 ? fmtPct((r.revenue / summary.totalSubscriptionRevenue) * 100) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Period summary footer ───────────────────────────────────── */}
      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><span className="font-medium text-foreground">Period</span><br />{new Date(from).toLocaleDateString()} – {new Date(to).toLocaleDateString()}</div>
        <div><span className="font-medium text-foreground">Total Revenue</span><br />{fmtUsd(summary.totalGrossRevenue)}</div>
        <div><span className="font-medium text-foreground">Total Costs</span><br />{fmtUsd(summary.totalCosts)}</div>
        <div><span className="font-medium text-foreground">Net Profit</span><br /><span className={netProfitColor}>{fmtUsd(summary.netProfit)} ({fmtPct(summary.profitMarginPct)} margin)</span></div>
      </div>
    </div>
  );
}
