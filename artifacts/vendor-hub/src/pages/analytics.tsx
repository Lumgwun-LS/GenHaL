import { useState, useCallback } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { useListVendors, useGetVendorPerformanceAnalytics, getGetVendorPerformanceAnalyticsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, ShoppingCart, Users, TrendingUp, Sparkles, RefreshCw, Download,
  ChevronDown, ChevronUp, BarChart2, Shield, Zap, AlertTriangle, TrendingDown,
  ExternalLink, Clock, CheckCircle2,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ────────────────────────────────────────────────────────────────────
type ScoreDimension = { score: number; max: number; label: string };
type SwotPoint = { point: string; linkKey?: string; linkLabel?: string };
type SwotReport = {
  strengths: SwotPoint[];
  weaknesses: SwotPoint[];
  opportunities: SwotPoint[];
  threats: SwotPoint[];
};
type BusinessSnapshot = {
  vendorId: number;
  generatedAt: string;
  revenue30d: number;
  prevRevenue30d: number;
  revenueGrowthPct: number;
  expenses30d: number;
  expenseRatio: number;
  totalProducts: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  healthyStockProducts: number;
  orders30d: number;
  completedOrders30d: number;
  pendingOrders30d: number;
  orderCompletionRate: number;
  avgOrderValue30d: number;
  payments30d: number;
  paidPayments30d: number;
  paymentSuccessRate: number;
  totalLeads30d: number;
  qualifiedLeads30d: number;
  leadConversionRate: number;
  publishedPosts30d: number;
  scheduledPosts30d: number;
  platformBreakdown: Record<string, number>;
  topExpenseCategories: Array<{ category: string; amount: number }>;
};
type SwotHistoryItem = {
  id: number;
  healthScore: string;
  createdAt: string;
  swotReport: SwotReport;
  snapshotJson: BusinessSnapshot;
  scoreBreakdown: Record<string, ScoreDimension>;
};
type SwotGenerateResult = {
  id: number;
  healthScore: string;
  scoreBreakdown: Record<string, ScoreDimension>;
  swotReport: SwotReport;
  snapshotJson: BusinessSnapshot;
  createdAt: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const PERIODS = [
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
  { value: "custom", label: "Custom range" },
];

const LINK_MAP: Record<string, string> = {
  sales: "/sales",
  expenses: "/expenses",
  inventory: "/inventory",
  leads: "/leads",
  social: "/social",
  analytics: "/analytics",
  finance: "/finance-analytics",
  payments: "/payments",
  orders: "/orders",
  products: "/products",
};

const SWOT_CONFIG = [
  { key: "strengths" as const,     label: "Strengths",     icon: TrendingUp,    bg: "#f0fdf4", border: "#86efac", iconColor: "#16a34a", textColor: "#166534" },
  { key: "weaknesses" as const,    label: "Weaknesses",    icon: TrendingDown,  bg: "#fff7ed", border: "#fed7aa", iconColor: "#ea580c", textColor: "#9a3412" },
  { key: "opportunities" as const, label: "Opportunities", icon: Zap,           bg: "#eff6ff", border: "#93c5fd", iconColor: "#2563eb", textColor: "#1e40af" },
  { key: "threats" as const,       label: "Threats",       icon: AlertTriangle, bg: "#fdf4ff", border: "#e9d5ff", iconColor: "#9333ea", textColor: "#6b21a8" },
];

// ── Health score helpers ──────────────────────────────────────────────────────
function getScoreColor(score: number): string {
  return score >= 70 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626";
}

function getScoreLabel(score: number): string {
  return score >= 70 ? "Healthy" : score >= 40 ? "Needs Attention" : "At Risk";
}

function formatGrowth(pct: number): string {
  return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
}

function formatCurrency(n: number): string {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(0)}`;
}

// ── Health Score Donut ────────────────────────────────────────────────────────
function HealthScoreDonut({ score }: { score: number }) {
  const color = getScoreColor(score);
  const remaining = 100 - score;
  const data = [
    { value: score, fill: color },
    { value: remaining, fill: "#e5e7eb" },
  ];
  return (
    <div style={{ position: "relative", width: 160, height: 160 }}>
      <PieChart width={160} height={160}>
        <Pie data={data} cx={75} cy={75} innerRadius={52} outerRadius={72}
          startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
          {data.map((_, i) => <Cell key={i} fill={data[i]!.fill} />)}
        </Pie>
      </PieChart>
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "2rem", fontWeight: 900, lineHeight: 1, color }}>{score}</div>
        <div style={{ fontSize: "0.68rem", fontWeight: 600, color, opacity: 0.8, marginTop: 2 }}>{getScoreLabel(score)}</div>
      </div>
    </div>
  );
}

// ── SWOT Point ────────────────────────────────────────────────────────────────
function SwotPointRow({ point, linkKey, linkLabel, textColor }: SwotPoint & { textColor: string }) {
  const href = linkKey ? LINK_MAP[linkKey] : undefined;
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", padding: "0.6rem 0", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
      <span style={{ marginTop: 3, fontSize: "0.9rem" }}>•</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.6, color: "#374151" }}>{point}</p>
        {href && (
          <a href={`${basePath}${href}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "0.75rem", color: textColor, fontWeight: 600, textDecoration: "none", marginTop: 3, opacity: 0.85 }}>
            {linkLabel || "View"} <ExternalLink style={{ width: 11, height: 11 }} />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Report history row ────────────────────────────────────────────────────────
function HistoryRow({ report, onLoad, active }: { report: SwotHistoryItem; onLoad: () => void; active: boolean }) {
  const score = parseFloat(report.healthScore);
  const color = getScoreColor(score);
  return (
    <button onClick={onLoad} style={{
      display: "flex", alignItems: "center", gap: "1rem", width: "100%",
      padding: "0.75rem 1rem", borderRadius: 8, border: "none", cursor: "pointer",
      background: active ? `${color}12` : "transparent",
      borderLeft: active ? `3px solid ${color}` : "3px solid transparent",
      textAlign: "left", transition: "background 0.15s",
    }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontWeight: 900, fontSize: "0.9rem", color }}>{Math.round(score)}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#111827" }}>
          Health Score: {Math.round(score)} — {getScoreLabel(score)}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
          <Clock style={{ width: 11, height: 11 }} />
          {new Date(report.createdAt).toLocaleString()}
        </div>
      </div>
      {active && <CheckCircle2 style={{ width: 16, height: 16, color }} />}
    </button>
  );
}

// ── HTML escape helper (prevents XSS in generated report HTML) ───────────────
function escHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Print report helper ───────────────────────────────────────────────────────
function printReport(report: SwotGenerateResult | SwotHistoryItem) {
  const score = parseFloat(report.healthScore);
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const swot = report.swotReport;
  const snap = report.snapshotJson;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Business Intelligence Report — ${new Date(report.createdAt).toLocaleDateString()}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 900px; margin: 0 auto; padding: 40px; color: #111827; }
  h1 { font-size: 1.8rem; font-weight: 900; margin-bottom: 4px; }
  .subtitle { color: #6b7280; margin-bottom: 32px; }
  .score-section { display: flex; align-items: center; gap: 24px; padding: 24px; background: ${color}10; border-radius: 12px; margin-bottom: 32px; border: 1px solid ${color}30; }
  .score-num { font-size: 3.5rem; font-weight: 900; color: ${color}; line-height: 1; }
  .score-label { font-size: 1rem; color: ${color}; font-weight: 700; }
  .metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 32px; }
  .metric { padding: 14px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
  .metric-val { font-size: 1.3rem; font-weight: 800; color: #111827; }
  .metric-lbl { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }
  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
  .swot-card { padding: 16px; border-radius: 10px; border: 1px solid; }
  .swot-card h3 { font-size: 1rem; font-weight: 800; margin: 0 0 12px; }
  .swot-card ul { margin: 0; padding: 0 0 0 16px; }
  .swot-card li { font-size: 0.85rem; line-height: 1.7; color: #374151; margin-bottom: 4px; }
  .strengths { background: #f0fdf4; border-color: #86efac; }
  .strengths h3 { color: #166534; }
  .weaknesses { background: #fff7ed; border-color: #fed7aa; }
  .weaknesses h3 { color: #9a3412; }
  .opportunities { background: #eff6ff; border-color: #93c5fd; }
  .opportunities h3 { color: #1e40af; }
  .threats { background: #fdf4ff; border-color: #e9d5ff; }
  .threats h3 { color: #6b21a8; }
  .footer { font-size: 0.75rem; color: #9ca3af; text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>Business Intelligence Report</h1>
<p class="subtitle">Generated ${escHtml(new Date(report.createdAt).toLocaleString())} • Awa Biz Suite</p>

<div class="score-section">
  <div>
    <div class="score-num">${Math.round(score)}<span style="font-size:1.5rem">/100</span></div>
    <div class="score-label">${escHtml(label)}</div>
  </div>
  <div>
    <p style="margin:0;font-size:0.85rem;color:#374151;">Your business health score is a composite of revenue growth, expense efficiency, inventory health, lead conversion, payment success, social activity, and order completion.</p>
  </div>
</div>

<div class="metrics">
  <div class="metric"><div class="metric-val">${snap ? escHtml(formatCurrency(snap.revenue30d ?? 0)) : "—"}</div><div class="metric-lbl">Revenue (30d)</div></div>
  <div class="metric"><div class="metric-val">${snap ? escHtml(formatGrowth(snap.revenueGrowthPct ?? 0)) : "—"}</div><div class="metric-lbl">MoM Growth</div></div>
  <div class="metric"><div class="metric-val">${snap ? Math.round((snap.expenseRatio ?? 0) * 100) : "—"}%</div><div class="metric-lbl">Expense Ratio</div></div>
  <div class="metric"><div class="metric-val">${snap ? Number(snap.orders30d ?? 0) : "—"}</div><div class="metric-lbl">Orders (30d)</div></div>
  <div class="metric"><div class="metric-val">${snap ? Math.round((snap.paymentSuccessRate ?? 0) * 100) : "—"}%</div><div class="metric-lbl">Payment Success</div></div>
  <div class="metric"><div class="metric-val">${snap ? Number(snap.publishedPosts30d ?? 0) : "—"}</div><div class="metric-lbl">Posts Published</div></div>
</div>

<div class="swot-grid">
  <div class="swot-card strengths"><h3>💪 Strengths</h3><ul>${swot?.strengths?.map(p => `<li>${escHtml(p.point)}</li>`).join("") || "<li>—</li>"}</ul></div>
  <div class="swot-card weaknesses"><h3>⚠️ Weaknesses</h3><ul>${swot?.weaknesses?.map(p => `<li>${escHtml(p.point)}</li>`).join("") || "<li>—</li>"}</ul></div>
  <div class="swot-card opportunities"><h3>🚀 Opportunities</h3><ul>${swot?.opportunities?.map(p => `<li>${escHtml(p.point)}</li>`).join("") || "<li>—</li>"}</ul></div>
  <div class="swot-card threats"><h3>⚡ Threats</h3><ul>${swot?.threats?.map(p => `<li>${escHtml(p.point)}</li>`).join("") || "<li>—</li>"}</ul></div>
</div>

<div class="footer">Powered by Awa Biz Suite — awajimaaai.com</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Main Analytics page ───────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useUser();
  const { data: vendors, isLoading: vendorsLoading } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);

  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activeTab, setActiveTab] = useState("performance");

  // BI state
  const [snapshot, setSnapshot] = useState<BusinessSnapshot | null>(null);
  const [currentReport, setCurrentReport] = useState<SwotGenerateResult | null>(null);
  const [history, setHistory] = useState<SwotHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<number | null>(null);
  const [biError, setBiError] = useState<string | null>(null);

  // Performance analytics
  const performanceParams = {
    vendorId: myVendor?.id as number,
    period,
    ...(period === "custom" && from ? { from: new Date(from).toISOString() } : {}),
    ...(period === "custom" && to ? { to: new Date(to).toISOString() } : {}),
  };
  const { data, isLoading } = useGetVendorPerformanceAnalytics(performanceParams, {
    query: { enabled: Boolean(myVendor?.id), queryKey: getGetVendorPerformanceAnalyticsQueryKey(performanceParams) },
  });

  // Load business snapshot
  const loadSnapshot = useCallback(async () => {
    if (!myVendor) return;
    setLoadingSnapshot(true);
    setBiError(null);
    try {
      const r = await fetch(`${BASE_URL}/api/analytics/business-snapshot`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { snapshot: BusinessSnapshot };
      setSnapshot(data.snapshot);
    } catch (e) {
      setBiError("Failed to load business snapshot. Please try again.");
    } finally {
      setLoadingSnapshot(false);
    }
  }, [myVendor]);

  // Generate SWOT
  const generateSwot = useCallback(async () => {
    if (!myVendor) return;
    setGenerating(true);
    setBiError(null);
    try {
      const r = await fetch(`${BASE_URL}/api/analytics/swot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error(await r.text());
      const result = await r.json() as SwotGenerateResult;
      setCurrentReport(result);
      setSnapshot(result.snapshotJson);
      setActiveHistoryId(result.id);
      // Refresh history
      loadHistory();
    } catch (e) {
      setBiError("Failed to generate analysis. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [myVendor]);

  // Load history
  const loadHistory = useCallback(async () => {
    if (!myVendor) return;
    setLoadingHistory(true);
    try {
      const r = await fetch(`${BASE_URL}/api/analytics/swot/history`);
      if (!r.ok) return;
      const data = await r.json() as { reports: SwotHistoryItem[] };
      setHistory(data.reports ?? []);
    } finally {
      setLoadingHistory(false);
    }
  }, [myVendor]);

  // Handle tab switch — load snapshot when switching to BI
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "intelligence" && !snapshot && !loadingSnapshot) {
      loadSnapshot();
      loadHistory();
    }
  };

  if (vendorsLoading) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]">Loading analytics...</div>;
  }
  if (!myVendor) {
    return <div className="p-8 text-center text-muted-foreground">No vendor profile found for this account.</div>;
  }

  const stats = [
    { title: "Revenue", value: `$${(data?.totalRevenue ?? 0).toLocaleString()}`, icon: DollarSign, color: "text-emerald-500" },
    { title: "Orders", value: data?.totalOrders ?? 0, icon: ShoppingCart, color: "text-amber-500" },
    { title: "Unique Customers", value: data?.uniqueCustomers ?? 0, icon: Users, color: "text-blue-500" },
    { title: "Avg. Order Value", value: `$${(data?.averageOrderValue ?? 0).toFixed(2)}`, icon: TrendingUp, color: "text-primary" },
  ];

  const scoreBreakdown = currentReport?.scoreBreakdown ?? {};
  const healthScore = currentReport ? Math.round(parseFloat(currentReport.healthScore)) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 w-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Performance insights and AI-powered business intelligence.</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="performance" className="gap-2">
            <BarChart2 className="w-4 h-4" /> Performance
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="gap-2">
            <Sparkles className="w-4 h-4" /> Business Intelligence
          </TabsTrigger>
        </TabsList>

        {/* ── Performance tab ─────────────────────────────────────────────── */}
        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 pt-6">
              <div className="space-y-1.5">
                <Label className="text-xs">Period</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {period === "custom" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">From</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">To</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading performance data…</div>
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
                  <CardHeader><CardTitle className="text-base">Revenue over time</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={data?.revenueOverTime ?? []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                        <Line type="monotone" dataKey="amount" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Orders over time</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={data?.ordersOverTime ?? []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="hsl(24 95% 62%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Business Intelligence tab ────────────────────────────────────── */}
        <TabsContent value="intelligence" className="space-y-6">

          {/* Error banner */}
          {biError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {biError}
            </div>
          )}

          {/* Snapshot metrics strip */}
          {snapshot && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Revenue (30d)", value: formatCurrency(snapshot.revenue30d), sub: formatGrowth(snapshot.revenueGrowthPct) + " MoM", color: snapshot.revenueGrowthPct >= 0 ? "#16a34a" : "#dc2626" },
                { label: "Expense Ratio", value: Math.round(snapshot.expenseRatio * 100) + "%", sub: snapshot.expenseRatio <= 0.5 ? "Healthy" : snapshot.expenseRatio <= 0.7 ? "Moderate" : "High", color: snapshot.expenseRatio <= 0.5 ? "#16a34a" : snapshot.expenseRatio <= 0.7 ? "#d97706" : "#dc2626" },
                { label: "Inventory", value: snapshot.healthyStockProducts + "/" + snapshot.totalProducts, sub: snapshot.outOfStockProducts + " out of stock", color: snapshot.outOfStockProducts > 0 ? "#dc2626" : "#16a34a" },
                { label: "Orders (30d)", value: String(snapshot.orders30d), sub: Math.round(snapshot.orderCompletionRate * 100) + "% completed", color: "#2563eb" },
                { label: "Payment Rate", value: Math.round(snapshot.paymentSuccessRate * 100) + "%", sub: snapshot.paidPayments30d + " paid", color: snapshot.paymentSuccessRate >= 0.9 ? "#16a34a" : "#d97706" },
                { label: "Posts (30d)", value: String(snapshot.publishedPosts30d), sub: "published", color: snapshot.publishedPosts30d >= 8 ? "#16a34a" : snapshot.publishedPosts30d >= 3 ? "#d97706" : "#dc2626" },
              ].map((m, i) => (
                <Card key={i} className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                  <div className="text-lg font-bold">{m.value}</div>
                  <div style={{ color: m.color }} className="text-xs font-medium">{m.sub}</div>
                </Card>
              ))}
            </div>
          )}

          {/* Main BI card */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Health Score panel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Business Health Score
                </CardTitle>
                <CardDescription>Composite of 7 operational metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {healthScore !== null ? (
                  <>
                    <div className="flex justify-center">
                      <HealthScoreDonut score={healthScore} />
                    </div>
                    <div className="space-y-2">
                      {Object.values(scoreBreakdown).map((dim) => (
                        <div key={dim.label}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-muted-foreground">{dim.label}</span>
                            <span className="font-semibold">{dim.score}/{dim.max}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div style={{
                              width: `${(dim.score / dim.max) * 100}%`,
                              height: "100%", borderRadius: 999,
                              background: getScoreColor((dim.score / dim.max) * 100),
                              transition: "width 0.6s ease",
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Generate your first analysis to see your health score.</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    onClick={generateSwot}
                    disabled={generating || loadingSnapshot}
                    className="w-full gap-2"
                  >
                    {generating
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analysing… (30–60 sec)</>
                      : <><Sparkles className="w-4 h-4" /> {currentReport ? "Regenerate Analysis" : "Generate Analysis"}</>
                    }
                  </Button>
                  {currentReport && (
                    <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => printReport(currentReport)}>
                      <Download className="w-4 h-4" /> Download PDF Report
                    </Button>
                  )}
                </div>
                {generating && (
                  <p className="text-xs text-center text-muted-foreground">
                    AI is analysing your last 30 days of data across sales, inventory, social, payments, and leads…
                  </p>
                )}
              </CardContent>
            </Card>

            {/* SWOT grid — 2 cols inside the remaining 2/3 */}
            <div className="lg:col-span-2">
              {currentReport ? (
                <div className="grid sm:grid-cols-2 gap-4 h-full">
                  {SWOT_CONFIG.map(({ key, label, icon: Icon, bg, border, iconColor, textColor }) => {
                    const points = currentReport.swotReport[key] ?? [];
                    return (
                      <div key={key} style={{
                        background: bg, border: `1px solid ${border}`,
                        borderRadius: 14, padding: "1.25rem",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                          <Icon style={{ width: 18, height: 18, color: iconColor }} />
                          <h3 style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: iconColor }}>{label}</h3>
                          <Badge style={{ marginLeft: "auto", background: `${iconColor}15`, color: iconColor, border: "none" }}>
                            {points.length}
                          </Badge>
                        </div>
                        <div>
                          {points.map((p, i) => (
                            <SwotPointRow key={i} {...p} textColor={textColor} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Card className="h-full flex items-center justify-center min-h-[320px]">
                  <div className="text-center p-8 text-muted-foreground">
                    <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <h3 className="font-semibold mb-1">No Analysis Yet</h3>
                    <p className="text-sm max-w-xs">
                      Click "Generate Analysis" to get an AI-powered SWOT report based on your live business data.
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* Report history */}
          {history.length > 0 && (
            <Card>
              <button
                className="w-full"
                onClick={() => setHistoryOpen(o => !o)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Report History
                    <Badge variant="secondary">{history.length}</Badge>
                  </CardTitle>
                  {historyOpen
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </CardHeader>
              </button>
              {historyOpen && (
                <CardContent className="pt-0 space-y-1">
                  {history.map((report) => (
                    <HistoryRow
                      key={report.id}
                      report={report}
                      active={activeHistoryId === report.id}
                      onLoad={() => {
                        setCurrentReport(report as unknown as SwotGenerateResult);
                        setSnapshot(report.snapshotJson);
                        setActiveHistoryId(report.id);
                      }}
                    />
                  ))}
                </CardContent>
              )}
            </Card>
          )}

          {/* Empty state when loading */}
          {loadingSnapshot && !snapshot && (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading your business data…</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
