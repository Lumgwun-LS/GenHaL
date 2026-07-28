import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DollarSign, ShoppingCart, Users, TrendingUp, Sparkles, RefreshCw, Download,
  ChevronDown, ChevronUp, BarChart2, Shield, Zap, AlertTriangle, TrendingDown,
  ExternalLink, Clock, CheckCircle2, Eye, Package, Search, X as XIcon,
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

type SummaryData = {
  revenue:   { value: number; prev: number; deltaPct: number };
  orders:    { value: number; prev: number; deltaPct: number };
  customers: { value: number; prev: number; deltaPct: number };
  visits:    { value: number; prev: number; deltaPct: number };
};

type VisitPoint = { date: string; count: number };
type TopProduct = { productId: number; name: string; revenue: number; orderCount: number; unitsSold: number };
type InventoryProduct = {
  id: number; name: string; sku: string; category: string;
  stockQuantity: number; lowStockThreshold: number; maxStock: number;
  active: boolean; stockStatus: "ok" | "low" | "critical" | "out";
};

// ── Constants ─────────────────────────────────────────────────────────────────
const PERIODS = [
  { value: "week",   label: "Past week" },
  { value: "month",  label: "Past month" },
  { value: "year",   label: "Past year" },
  { value: "custom", label: "Custom range" },
];

const VISIT_PERIODS = [
  { value: "7d",  label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "3m",  label: "3 months" },
  { value: "12m", label: "12 months" },
  { value: "custom", label: "Custom" },
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

const STOCK_STATUS_CONFIG = {
  ok:       { label: "In Stock",  className: "bg-emerald-500/15 text-emerald-700" },
  low:      { label: "Low",       className: "bg-amber-500/15 text-amber-700" },
  critical: { label: "Critical",  className: "bg-orange-500/15 text-orange-700" },
  out:      { label: "Out",       className: "bg-red-500/15 text-red-700" },
};

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
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(0)}`;
}
function deltaColor(pct: number) {
  return pct >= 0 ? "text-emerald-600" : "text-red-500";
}

// ── Summary banner card ───────────────────────────────────────────────────────
function SummaryCard({ title, value, deltaPct, icon: Icon, color }: {
  title: string; value: string; deltaPct: number; icon: React.ElementType; color: string;
}) {
  const isPos = deltaPct >= 0;
  return (
    <Card className="border-border/50 bg-card/70 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className={`text-xs mt-1 font-medium ${deltaColor(deltaPct)}`}>
          {isPos ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% vs prior 7 days
        </p>
      </CardContent>
    </Card>
  );
}

// ── Health Score Donut ────────────────────────────────────────────────────────
function HealthScoreDonut({ score }: { score: number }) {
  const color = getScoreColor(score);
  const data = [{ value: score, fill: color }, { value: 100 - score, fill: "#e5e7eb" }];
  return (
    <div style={{ position: "relative", width: 160, height: 160 }}>
      <PieChart width={160} height={160}>
        <Pie data={data} cx={75} cy={75} innerRadius={52} outerRadius={72}
          startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
          {data.map((_, i) => <Cell key={i} fill={data[i]!.fill} />)}
        </Pie>
      </PieChart>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
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

// ── HTML escape helper ────────────────────────────────────────────────────────
function escHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Print report helper ───────────────────────────────────────────────────────
function printReport(report: SwotGenerateResult | SwotHistoryItem) {
  const score = parseFloat(report.healthScore);
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const swot  = report.swotReport;
  const snap  = report.snapshotJson;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Business Intelligence Report — ${new Date(report.createdAt).toLocaleDateString()}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:900px;margin:0 auto;padding:40px;color:#111827}
  h1{font-size:1.8rem;font-weight:900;margin-bottom:4px}.subtitle{color:#6b7280;margin-bottom:32px}
  .score-section{display:flex;align-items:center;gap:24px;padding:24px;background:${color}10;border-radius:12px;margin-bottom:32px;border:1px solid ${color}30}
  .score-num{font-size:3.5rem;font-weight:900;color:${color};line-height:1}.score-label{font-size:1rem;color:${color};font-weight:700}
  .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:32px}
  .metric{padding:14px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb}
  .metric-val{font-size:1.3rem;font-weight:800;color:#111827}.metric-lbl{font-size:0.75rem;color:#6b7280;margin-top:2px}
  .swot-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px}
  .swot-card{padding:16px;border-radius:10px;border:1px solid}.swot-card h3{font-size:1rem;font-weight:800;margin:0 0 12px}
  .swot-card ul{margin:0;padding:0 0 0 16px}.swot-card li{font-size:0.85rem;line-height:1.7;color:#374151;margin-bottom:4px}
  .strengths{background:#f0fdf4;border-color:#86efac}.strengths h3{color:#166534}
  .weaknesses{background:#fff7ed;border-color:#fed7aa}.weaknesses h3{color:#9a3412}
  .opportunities{background:#eff6ff;border-color:#93c5fd}.opportunities h3{color:#1e40af}
  .threats{background:#fdf4ff;border-color:#e9d5ff}.threats h3{color:#6b21a8}
  .footer{font-size:0.75rem;color:#9ca3af;text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb}
  @media print{body{padding:20px}}
</style></head><body>
<h1>Business Intelligence Report</h1>
<p class="subtitle">Generated ${escHtml(new Date(report.createdAt).toLocaleString())} • Awa Biz Suite</p>
<div class="score-section">
  <div><div class="score-num">${Math.round(score)}<span style="font-size:1.5rem">/100</span></div><div class="score-label">${escHtml(label)}</div></div>
  <div><p style="margin:0;font-size:0.85rem;color:#374151;">Composite of revenue growth, expense efficiency, inventory health, lead conversion, payment success, social activity, and order completion.</p></div>
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
  <div class="swot-card strengths"><h3>💪 Strengths</h3><ul>${swot?.strengths?.map(p=>`<li>${escHtml(p.point)}</li>`).join("")||"<li>—</li>"}</ul></div>
  <div class="swot-card weaknesses"><h3>⚠️ Weaknesses</h3><ul>${swot?.weaknesses?.map(p=>`<li>${escHtml(p.point)}</li>`).join("")||"<li>—</li>"}</ul></div>
  <div class="swot-card opportunities"><h3>🚀 Opportunities</h3><ul>${swot?.opportunities?.map(p=>`<li>${escHtml(p.point)}</li>`).join("")||"<li>—</li>"}</ul></div>
  <div class="swot-card threats"><h3>⚡ Threats</h3><ul>${swot?.threats?.map(p=>`<li>${escHtml(p.point)}</li>`).join("")||"<li>—</li>"}</ul></div>
</div>
<div class="footer">Powered by Awa Biz Suite — awajimaaai.com</div>
<script>window.onload = () => window.print();</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Main Analytics page ───────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useUser();
  const { data: vendors, isLoading: vendorsLoading } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);
  const [adminVendorId, setAdminVendorId] = useState<number | undefined>(undefined);
  const effectiveVendor = myVendor ?? vendors?.find((v) => v.id === adminVendorId);

  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activeTab, setActiveTab] = useState("performance");

  // ── Summary banner state ──────────────────────────────────────────────────
  const [summary, setSummary] = useState<SummaryData | null>(null);

  // ── Visits chart state ────────────────────────────────────────────────────
  const [visitPeriod, setVisitPeriod] = useState("30d");
  const [visitFrom, setVisitFrom] = useState("");
  const [visitTo, setVisitTo]   = useState("");
  const [visitData, setVisitData] = useState<VisitPoint[]>([]);
  const [visitGroupBy, setVisitGroupBy] = useState("day");
  const [visitTotal, setVisitTotal] = useState(0);
  const [visitLoading, setVisitLoading] = useState(false);

  // ── Orders table filter state ─────────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo,   setFilterTo]   = useState("");
  const [quickFilter, setQuickFilter] = useState<"all" | "week" | "month" | "year">("all");
  const [ordersData, setOrdersData] = useState<Array<{ id: number; createdAt: string; customerName: string; customerEmail: string; status: string; paymentStatus: string; totalAmount: string; currency: string; source: string | null }>>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPages, setOrdersPages] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // ── Top products state ────────────────────────────────────────────────────
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topProductsLoading, setTopProductsLoading] = useState(false);

  // ── Inventory health state ────────────────────────────────────────────────
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [invSummary, setInvSummary] = useState<{ total: number; ok: number; low: number; critical: number; out: number } | null>(null);
  const [invLoading, setInvLoading] = useState(false);
  const [invSearch, setInvSearch] = useState("");

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

  const performanceParams = {
    vendorId: effectiveVendor?.id as number,
    period,
    ...(period === "custom" && from ? { from: new Date(from).toISOString() } : {}),
    ...(period === "custom" && to   ? { to:   new Date(to).toISOString()   } : {}),
  };
  const { data, isLoading } = useGetVendorPerformanceAnalytics(performanceParams, {
    query: { enabled: Boolean(effectiveVendor?.id), queryKey: getGetVendorPerformanceAnalyticsQueryKey(performanceParams) },
  });

  // ── Fetch summary banner ──────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    if (!effectiveVendor) return;
    try {
      const q = new URLSearchParams({ vendorId: String(effectiveVendor.id) });
      const r = await fetch(`${BASE_URL}/api/analytics/summary?${q}`);
      if (r.ok) setSummary(await r.json());
    } catch { /* non-critical */ }
  }, [effectiveVendor]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // ── Fetch visits ──────────────────────────────────────────────────────────
  const loadVisits = useCallback(async () => {
    if (!effectiveVendor) return;
    setVisitLoading(true);
    try {
      const q = new URLSearchParams({ vendorId: String(effectiveVendor.id), period: visitPeriod, groupBy: visitGroupBy });
      if (visitPeriod === "custom" && visitFrom) q.set("from", new Date(visitFrom).toISOString());
      if (visitPeriod === "custom" && visitTo)   q.set("to",   new Date(visitTo).toISOString());
      const r = await fetch(`${BASE_URL}/api/analytics/visits?${q}`);
      if (r.ok) {
        const d = await r.json() as { data: VisitPoint[]; total: number };
        setVisitData(d.data);
        setVisitTotal(d.total);
      }
    } finally { setVisitLoading(false); }
  }, [effectiveVendor, visitPeriod, visitGroupBy, visitFrom, visitTo]);

  useEffect(() => { if (activeTab === "performance") loadVisits(); }, [loadVisits, activeTab]);

  // ── Fetch top products ────────────────────────────────────────────────────
  const loadTopProducts = useCallback(async () => {
    if (!effectiveVendor) return;
    setTopProductsLoading(true);
    try {
      const q = new URLSearchParams({ vendorId: String(effectiveVendor.id) });
      const r = await fetch(`${BASE_URL}/api/analytics/top-products?${q}`);
      if (r.ok) setTopProducts((await r.json()).products);
    } finally { setTopProductsLoading(false); }
  }, [effectiveVendor]);

  useEffect(() => { if (activeTab === "performance") loadTopProducts(); }, [loadTopProducts, activeTab]);

  // ── Fetch inventory health ────────────────────────────────────────────────
  const loadInventory = useCallback(async () => {
    if (!effectiveVendor) return;
    setInvLoading(true);
    try {
      const q = new URLSearchParams({ vendorId: String(effectiveVendor.id) });
      const r = await fetch(`${BASE_URL}/api/analytics/inventory-health?${q}`);
      if (r.ok) {
        const d = await r.json();
        setInventory(d.products);
        setInvSummary(d.summary);
      }
    } finally { setInvLoading(false); }
  }, [effectiveVendor]);

  useEffect(() => { if (activeTab === "inventory") loadInventory(); }, [loadInventory, activeTab]);

  // ── Load business snapshot ────────────────────────────────────────────────
  const loadSnapshot = useCallback(async () => {
    if (!effectiveVendor) return;
    setLoadingSnapshot(true);
    setBiError(null);
    try {
      const r = await fetch(`${BASE_URL}/api/analytics/business-snapshot`);
      if (!r.ok) throw new Error(await r.text());
      setSnapshot((await r.json()).snapshot);
    } catch { setBiError("Failed to load business snapshot. Please try again."); }
    finally { setLoadingSnapshot(false); }
  }, [effectiveVendor]);

  const generateSwot = useCallback(async () => {
    if (!effectiveVendor) return;
    setGenerating(true);
    setBiError(null);
    try {
      const r = await fetch(`${BASE_URL}/api/analytics/swot`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!r.ok) throw new Error(await r.text());
      const result = await r.json() as SwotGenerateResult;
      setCurrentReport(result);
      setSnapshot(result.snapshotJson);
      setActiveHistoryId(result.id);
      loadHistory();
    } catch { setBiError("Failed to generate analysis. Please try again."); }
    finally { setGenerating(false); }
  }, [effectiveVendor]);

  const loadHistory = useCallback(async () => {
    if (!effectiveVendor) return;
    setLoadingHistory(true);
    try {
      const r = await fetch(`${BASE_URL}/api/analytics/swot/history`);
      if (r.ok) setHistory((await r.json()).reports ?? []);
    } finally { setLoadingHistory(false); }
  }, [effectiveVendor]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "intelligence" && !snapshot && !loadingSnapshot) { loadSnapshot(); loadHistory(); }
  };

  // ── Derive effective date range from quickFilter or explicit inputs ────────
  const effectiveDates = useMemo(() => {
    if (filterFrom || filterTo) {
      // Explicit date inputs take priority
      return {
        from: filterFrom ? new Date(filterFrom).toISOString() : undefined,
        to:   filterTo   ? new Date(filterTo).toISOString()   : undefined,
      };
    }
    if (quickFilter === "all") return { from: undefined, to: undefined };
    const now = new Date();
    const msMap = { week: 7, month: 30, year: 365 };
    const from = new Date(now.getTime() - msMap[quickFilter] * 86400_000).toISOString();
    return { from, to: now.toISOString() };
  }, [quickFilter, filterFrom, filterTo]);

  // ── Quick-filter date ranges ──────────────────────────────────────────────
  function applyQuickFilter(qf: "all" | "week" | "month" | "year") {
    setQuickFilter(qf);
    // Clear explicit date inputs so effectiveDates derives from the pill selection
    setFilterFrom("");
    setFilterTo("");
    setOrdersPage(1);
  }

  // ── Fetch orders from dedicated endpoint ──────────────────────────────────
  useEffect(() => {
    if (!effectiveVendor) return;
    let cancelled = false;
    const handler = setTimeout(async () => {
      setOrdersLoading(true);
      try {
        const q = new URLSearchParams({ vendorId: String(effectiveVendor.id), page: String(ordersPage), limit: "25" });
        if (effectiveDates.from) q.set("from", effectiveDates.from);
        if (effectiveDates.to)   q.set("to",   effectiveDates.to);
        if (customerSearch)      q.set("customerName", customerSearch);
        const r = await fetch(`${BASE_URL}/api/analytics/orders?${q}`, { credentials: "include" });
        if (!r.ok) throw new Error("fetch failed");
        const data = await r.json();
        if (!cancelled) {
          setOrdersData(data.orders ?? []);
          setOrdersTotal(data.total ?? 0);
          setOrdersPages(data.pages ?? 1);
        }
      } catch { /* silently ignore */ }
      finally { if (!cancelled) setOrdersLoading(false); }
    }, customerSearch ? 300 : 0); // debounce text search only
    return () => { cancelled = true; clearTimeout(handler); };
  }, [effectiveVendor, effectiveDates, customerSearch, ordersPage]);

  // ── CSV download helper ───────────────────────────────────────────────────
  function downloadCsv(path: string, filename: string) {
    if (!effectiveVendor) return;
    const q = new URLSearchParams({ vendorId: String(effectiveVendor.id) });
    if (effectiveDates.from) q.set("from", effectiveDates.from);
    if (effectiveDates.to)   q.set("to",   effectiveDates.to);
    if (customerSearch)      q.set("customerName", customerSearch);
    const url = `${BASE_URL}${path}?${q}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }

  // ── Filtered inventory list ───────────────────────────────────────────────
  const filteredInventory = useMemo(() => {
    if (!invSearch) return inventory;
    const q = invSearch.toLowerCase();
    return inventory.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [inventory, invSearch]);

  if (vendorsLoading) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]">Loading analytics...</div>;
  }
  if (!effectiveVendor) {
    if (vendors && vendors.length > 0) {
      return (
        <div className="p-8 max-w-xl mx-auto space-y-6">
          <h1 className="text-3xl font-black tracking-tight">Analytics</h1>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col gap-3">
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Admin mode — select a vendor to view analytics:</span>
            <Select value={adminVendorId ? String(adminVendorId) : ""} onValueChange={(v) => setAdminVendorId(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Select a vendor…" /></SelectTrigger>
              <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      );
    }
    return <div className="p-8 text-center text-muted-foreground">No vendor profile found for this account.</div>;
  }

  const scoreBreakdown = currentReport?.scoreBreakdown ?? {};
  const healthScore = currentReport ? Math.round(parseFloat(currentReport.healthScore)) : null;

  return (
    <div className="relative p-6 max-w-7xl mx-auto space-y-6 w-full overflow-hidden">
      {/* Aurora background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div className="absolute -top-40 -left-40 w-[550px] h-[550px] rounded-full bg-primary/7 blur-[120px]" animate={{ x:[0,50,0],y:[0,60,0],scale:[1,1.06,1] }} transition={{ duration:24,repeat:Infinity,ease:"easeInOut" }} />
        <motion.div className="absolute top-1/2 -right-40 w-[450px] h-[450px] rounded-full bg-violet-500/6 blur-[100px]" animate={{ x:[0,-50,0],y:[0,-40,0] }} transition={{ duration:30,repeat:Infinity,ease:"easeInOut",delay:6 }} />
        <motion.div className="absolute -bottom-20 left-1/3 w-[320px] h-[320px] rounded-full bg-cyan-500/5 blur-[80px]" animate={{ x:[0,35,0],y:[0,-35,0] }} transition={{ duration:20,repeat:Infinity,ease:"easeInOut",delay:10 }} />
      </div>

      <motion.div className="flex flex-col gap-1" initial={{ opacity:0,y:-18 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.5,ease:[0.22,1,0.36,1] }}>
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">Analytics</h1>
        <p className="text-muted-foreground">Performance insights, storefront visits, inventory health, and AI business intelligence.</p>
      </motion.div>

      {/* ── 7-day Summary Banner ─────────────────────────────────────────── */}
      {summary && (
        <motion.div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          initial="hidden" animate="show"
          variants={{ hidden:{}, show:{ transition:{ staggerChildren:0.06 } } }}>
          {[
            { title: "Revenue (7d)",  value: `$${summary.revenue.value.toLocaleString("en", { maximumFractionDigits: 0 })}`, deltaPct: summary.revenue.deltaPct,   icon: DollarSign,   color: "text-emerald-500" },
            { title: "Orders (7d)",   value: String(summary.orders.value),    deltaPct: summary.orders.deltaPct,    icon: ShoppingCart, color: "text-amber-500" },
            { title: "Customers (7d)",value: String(summary.customers.value), deltaPct: summary.customers.deltaPct, icon: Users,        color: "text-blue-500" },
            { title: "Visits (7d)",   value: String(summary.visits.value),    deltaPct: summary.visits.deltaPct,    icon: Eye,          color: "text-violet-500" },
          ].map((card, i) => (
            <motion.div key={i} variants={{ hidden:{ opacity:0, y:20 }, show:{ opacity:1, y:0, transition:{ duration:0.4, ease:[0.22,1,0.36,1] } } }}>
              <SummaryCard {...card} />
            </motion.div>
          ))}
        </motion.div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.4,delay:0.1 }}>
          <TabsList className="mb-4 bg-card/50 border border-border/50 backdrop-blur-sm">
            <TabsTrigger value="performance" className="gap-2"><BarChart2 className="w-4 h-4" /> Performance</TabsTrigger>
            <TabsTrigger value="inventory"   className="gap-2"><Package  className="w-4 h-4" /> Inventory</TabsTrigger>
            <TabsTrigger value="intelligence" className="gap-2"><Sparkles className="w-4 h-4" /> Business Intelligence</TabsTrigger>
          </TabsList>
        </motion.div>

        {/* ── Performance tab ─────────────────────────────────────────────── */}
        <TabsContent value="performance" className="space-y-6">
          {/* Period selector */}
          <motion.div initial={{ opacity:0,y:16 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.4,delay:0.15 }}>
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
              <CardContent className="flex flex-wrap items-end gap-4 pt-6">
                <div className="space-y-1.5">
                  <Label className="text-xs">Period</Label>
                  <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
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
          </motion.div>

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading performance data…</div>
          ) : (
            <>
              {/* KPI cards */}
              <motion.div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
                initial="hidden" animate="show"
                variants={{ hidden:{}, show:{ transition:{ staggerChildren:0.07, delayChildren:0.2 } } }}>
                {[
                  { title: "Revenue",          value: `$${(data?.totalRevenue ?? 0).toLocaleString()}`,    icon: DollarSign,   color: "text-emerald-500" },
                  { title: "Orders",            value: data?.totalOrders ?? 0,                             icon: ShoppingCart, color: "text-amber-500" },
                  { title: "Unique Customers",  value: data?.uniqueCustomers ?? 0,                         icon: Users,        color: "text-blue-500" },
                  { title: "Avg. Order Value",  value: `$${(data?.averageOrderValue ?? 0).toFixed(2)}`,    icon: TrendingUp,   color: "text-primary" },
                ].map((stat, i) => (
                  <motion.div key={i} variants={{ hidden:{ opacity:0, y:20 }, show:{ opacity:1, y:0, transition:{ duration:0.45, ease:[0.22,1,0.36,1] } } }}>
                    <Card className="group hover:shadow-lg hover:shadow-primary/10 transition-shadow duration-300 border-border/50 bg-card/70 backdrop-blur-sm overflow-hidden relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                        <stat.icon className={`h-4 w-4 ${stat.color}`} />
                      </CardHeader>
                      <CardContent><div className="text-2xl font-bold">{stat.value}</div></CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              {/* Revenue + Orders charts */}
              <div className="grid gap-4 lg:grid-cols-2">
                <motion.div initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.5, delay:0.35, ease:[0.22,1,0.36,1] }}>
                  <Card className="border-border/50 bg-card/70 backdrop-blur-sm">
                    <CardHeader><CardTitle className="text-base">Revenue over time</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={240}>
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
                </motion.div>
                <motion.div initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.5, delay:0.42, ease:[0.22,1,0.36,1] }}>
                  <Card className="border-border/50 bg-card/70 backdrop-blur-sm">
                    <CardHeader><CardTitle className="text-base">Orders over time</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={240}>
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
                </motion.div>
              </div>

              {/* ── Visits chart ──────────────────────────────────────────── */}
              <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5, delay:0.5 }}>
                <Card className="border-border/50 bg-card/70 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2"><Eye className="w-4 h-4 text-violet-500" /> Storefront Visits</CardTitle>
                        <CardDescription className="mt-0.5">{visitTotal.toLocaleString()} unique sessions in period</CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={visitGroupBy} onValueChange={setVisitGroupBy}>
                          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="day">By day</SelectItem>
                            <SelectItem value="week">By week</SelectItem>
                            <SelectItem value="month">By month</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={visitPeriod} onValueChange={setVisitPeriod}>
                          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{VISIT_PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                        </Select>
                        {visitPeriod === "custom" && (
                          <>
                            <Input type="date" value={visitFrom} onChange={e => setVisitFrom(e.target.value)} className="h-8 w-36 text-xs" />
                            <Input type="date" value={visitTo}   onChange={e => setVisitTo(e.target.value)}   className="h-8 w-36 text-xs" />
                          </>
                        )}
                        <Button size="sm" variant="outline" className="h-8" onClick={loadVisits} disabled={visitLoading}>
                          <RefreshCw className={`w-3.5 h-3.5 ${visitLoading ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {visitData.length === 0 ? (
                      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                        No visit data yet. Embed the widget on your website to start tracking.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={visitData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => [`${v} sessions`, "Visits"]} />
                          <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* ── Top Products bar chart ─────────────────────────────────── */}
              <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5, delay:0.55 }}>
                <Card className="border-border/50 bg-card/70 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Top Products by Revenue</CardTitle>
                      <Button size="sm" variant="ghost" onClick={loadTopProducts} disabled={topProductsLoading}>
                        <RefreshCw className={`w-3.5 h-3.5 ${topProductsLoading ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                    <CardDescription>Last 30 days · Click a bar to edit the product</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topProducts.length === 0 ? (
                      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No sales data yet for this period.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(220, topProducts.length * 36)}>
                        <BarChart data={topProducts} layout="vertical" margin={{ left: 12, right: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                          <Bar dataKey="revenue" fill="#7c3aed" radius={[0, 4, 4, 0]}
                            onClick={(d) => { window.location.href = `${BASE_URL}/products?edit=${d.productId}`; }}
                            style={{ cursor: "pointer" }} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* ── Sales table with filters ───────────────────────────────── */}
              <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5, delay:0.6 }}>
                <Card className="border-border/50 bg-card/70 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="text-base">Sales / Orders</CardTitle>
                      <Button size="sm" variant="outline" className="gap-1.5"
                        onClick={() => downloadCsv("/api/analytics/export/sales", "sales-export.csv")}>
                        <Download className="w-3.5 h-3.5" /> Export CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Filter row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search customer…"
                          value={customerSearch}
                          onChange={e => setCustomerSearch(e.target.value)}
                          className="pl-8 h-8 w-44 text-xs"
                        />
                        {customerSearch && <button onClick={() => setCustomerSearch("")} className="absolute right-2 top-2 text-muted-foreground"><XIcon className="w-3 h-3" /></button>}
                      </div>
                      <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 w-36 text-xs" />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input type="date" value={filterTo}   onChange={e => setFilterTo(e.target.value)}   className="h-8 w-36 text-xs" />
                      {/* Quick-select pills */}
                      {(["all","week","month","year"] as const).map(qf => (
                        <button key={qf}
                          onClick={() => applyQuickFilter(qf)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${quickFilter === qf ? "bg-violet-600 text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted/70"}`}>
                          {qf === "all" ? "All Time" : qf === "week" ? "This Week" : qf === "month" ? "This Month" : "This Year"}
                        </button>
                      ))}
                    </div>
                    {/* Orders table */}
                    {ordersLoading ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading orders…
                      </div>
                    ) : ordersData.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-6 text-center">No orders match the current filters.</p>
                    ) : (
                      <>
                        <div className="rounded-md border border-border/50 overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Date</TableHead>
                                <TableHead className="text-xs">Customer</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs">Payment</TableHead>
                                <TableHead className="text-xs text-right">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ordersData.map(o => (
                                <TableRow key={o.id}>
                                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                    {new Date(o.createdAt).toLocaleDateString()}
                                  </TableCell>
                                  <TableCell className="text-xs max-w-[140px] truncate">
                                    <span className="font-medium">{o.customerName || "—"}</span>
                                    {o.customerEmail && <span className="block text-muted-foreground truncate">{o.customerEmail}</span>}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${o.status === "completed" ? "border-emerald-500/50 text-emerald-600" : o.status === "cancelled" ? "border-red-500/50 text-red-600" : "border-amber-500/50 text-amber-600"}`}>
                                      {o.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${o.paymentStatus === "paid" ? "border-emerald-500/50 text-emerald-600" : o.paymentStatus === "failed" ? "border-red-500/50 text-red-600" : "border-amber-500/50 text-amber-600"}`}>
                                      {o.paymentStatus}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs font-semibold text-right whitespace-nowrap">
                                    {o.currency} {parseFloat(o.totalAmount).toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {/* Pagination */}
                        {ordersPages > 1 && (
                          <div className="flex items-center justify-between pt-2">
                            <p className="text-xs text-muted-foreground">{ordersTotal} total order{ordersTotal !== 1 ? "s" : ""}</p>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={ordersPage <= 1}
                                onClick={() => setOrdersPage(p => Math.max(1, p - 1))}>
                                ← Prev
                              </Button>
                              <span className="text-xs text-muted-foreground">{ordersPage} / {ordersPages}</span>
                              <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={ordersPage >= ordersPages}
                                onClick={() => setOrdersPage(p => Math.min(ordersPages, p + 1))}>
                                Next →
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}
        </TabsContent>

        {/* ── Inventory Health tab ─────────────────────────────────────────── */}
        <TabsContent value="inventory" className="space-y-6">
          {/* Summary pills */}
          {invSummary && (
            <motion.div className="flex flex-wrap gap-3" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.4 }}>
              {[
                { label: "Total",    value: invSummary.total,    color: "bg-muted/40 text-foreground" },
                { label: "In Stock", value: invSummary.ok,       color: "bg-emerald-500/15 text-emerald-700" },
                { label: "Low",      value: invSummary.low,      color: "bg-amber-500/15 text-amber-700" },
                { label: "Critical", value: invSummary.critical, color: "bg-orange-500/15 text-orange-700" },
                { label: "Out",      value: invSummary.out,      color: "bg-red-500/15 text-red-700" },
              ].map(p => (
                <span key={p.label} className={`px-3 py-1.5 rounded-full text-xs font-bold ${p.color}`}>
                  {p.label}: {p.value}
                </span>
              ))}
            </motion.div>
          )}

          <motion.div initial={{ opacity:0,y:16 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.4, delay:0.1 }}>
            <Card className="border-border/50 bg-card/70 backdrop-blur-sm">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4 text-violet-500" /> Inventory Health</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input placeholder="Search products…" value={invSearch} onChange={e => setInvSearch(e.target.value)} className="pl-8 h-8 w-44 text-xs" />
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 h-8"
                      onClick={() => downloadCsv("/api/analytics/export/inventory", "inventory-export.csv")}>
                      <Download className="w-3.5 h-3.5" /> Export CSV
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={loadInventory} disabled={invLoading}>
                      <RefreshCw className={`w-3.5 h-3.5 ${invLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {invLoading && <div className="h-32 bg-muted/30 rounded-xl animate-pulse m-4" />}
                {!invLoading && filteredInventory.length === 0 && (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    {inventory.length === 0 ? "No products found." : "No products match your search."}
                  </div>
                )}
                {filteredInventory.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-right">Stock</TableHead>
                          <TableHead className="text-xs text-right">Threshold</TableHead>
                          <TableHead className="text-xs"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInventory.map((p) => {
                          const cfg = STOCK_STATUS_CONFIG[p.stockStatus];
                          const rowBg = p.stockStatus === "out" ? "bg-red-500/5" : p.stockStatus === "critical" ? "bg-orange-500/5" : p.stockStatus === "low" ? "bg-amber-500/5" : "";
                          return (
                            <TableRow key={p.id} className={rowBg}>
                              <TableCell>
                                <div className="font-medium text-sm">{p.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground capitalize">{p.category}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.className}`}>{cfg.label}</span>
                              </TableCell>
                              <TableCell className="text-right text-sm font-bold">{p.stockQuantity}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{p.lowStockThreshold}</TableCell>
                              <TableCell>
                                <Link href={`/products?edit=${p.id}`}>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                                    Restock <ExternalLink className="w-3 h-3" />
                                  </Button>
                                </Link>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Business Intelligence tab ────────────────────────────────────── */}
        <TabsContent value="intelligence" className="space-y-6">
          {biError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{biError}</div>
          )}
          {snapshot && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Revenue (30d)", value: formatCurrency(snapshot.revenue30d), sub: formatGrowth(snapshot.revenueGrowthPct) + " MoM", color: snapshot.revenueGrowthPct >= 0 ? "#16a34a" : "#dc2626" },
                { label: "Expense Ratio", value: Math.round(snapshot.expenseRatio * 100) + "%", sub: snapshot.expenseRatio <= 0.5 ? "Healthy" : snapshot.expenseRatio <= 0.7 ? "Moderate" : "High", color: snapshot.expenseRatio <= 0.5 ? "#16a34a" : snapshot.expenseRatio <= 0.7 ? "#d97706" : "#dc2626" },
                { label: "Inventory",    value: snapshot.healthyStockProducts + "/" + snapshot.totalProducts, sub: snapshot.outOfStockProducts + " out of stock", color: snapshot.outOfStockProducts > 0 ? "#dc2626" : "#16a34a" },
                { label: "Orders (30d)", value: String(snapshot.orders30d), sub: Math.round(snapshot.orderCompletionRate * 100) + "% completed", color: "#2563eb" },
                { label: "Payment Rate", value: Math.round(snapshot.paymentSuccessRate * 100) + "%", sub: snapshot.paidPayments30d + " paid", color: snapshot.paymentSuccessRate >= 0.9 ? "#16a34a" : "#d97706" },
                { label: "Posts (30d)",  value: String(snapshot.publishedPosts30d), sub: "published", color: snapshot.publishedPosts30d >= 8 ? "#16a34a" : snapshot.publishedPosts30d >= 3 ? "#d97706" : "#dc2626" },
              ].map((m, i) => (
                <Card key={i} className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                  <div className="text-lg font-bold">{m.value}</div>
                  <div style={{ color: m.color }} className="text-xs font-medium">{m.sub}</div>
                </Card>
              ))}
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
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
                    <div className="flex justify-center"><HealthScoreDonut score={healthScore} /></div>
                    <div className="space-y-2">
                      {Object.values(scoreBreakdown).map((dim) => (
                        <div key={dim.label}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-muted-foreground">{dim.label}</span>
                            <span className="font-semibold">{dim.score}/{dim.max}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div style={{ width: `${(dim.score / dim.max) * 100}%`, height: "100%", borderRadius: 999, background: getScoreColor((dim.score / dim.max) * 100), transition: "width 0.6s ease" }} />
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
                  <Button onClick={generateSwot} disabled={generating || loadingSnapshot} className="w-full gap-2">
                    {generating
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analysing… (30–60 sec)</>
                      : <><Sparkles className="w-4 h-4" /> {currentReport ? "Regenerate Analysis" : "Generate Analysis"}</>}
                  </Button>
                  {currentReport && (
                    <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => printReport(currentReport)}>
                      <Download className="w-4 h-4" /> Download PDF Report
                    </Button>
                  )}
                </div>
                {generating && (
                  <p className="text-xs text-center text-muted-foreground">
                    AI is analysing your last 30 days across sales, inventory, social, payments, and leads…
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="lg:col-span-2">
              {currentReport ? (
                <div className="grid sm:grid-cols-2 gap-4 h-full">
                  {SWOT_CONFIG.map(({ key, label, icon: Icon, bg, border, iconColor, textColor }) => {
                    const points = currentReport.swotReport[key] ?? [];
                    return (
                      <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "1.25rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                          <Icon style={{ width: 18, height: 18, color: iconColor }} />
                          <h3 style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: iconColor }}>{label}</h3>
                          <Badge style={{ marginLeft: "auto", background: `${iconColor}15`, color: iconColor, border: "none" }}>{points.length}</Badge>
                        </div>
                        <div>{points.map((p, i) => <SwotPointRow key={i} {...p} textColor={textColor} />)}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Card className="h-full flex items-center justify-center min-h-[320px]">
                  <div className="text-center p-8 text-muted-foreground">
                    <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <h3 className="font-semibold mb-1">No Analysis Yet</h3>
                    <p className="text-sm max-w-xs">Click "Generate Analysis" to get an AI-powered SWOT report based on your live business data.</p>
                  </div>
                </Card>
              )}
            </div>
          </div>

          {history.length > 0 && (
            <Card>
              <button className="w-full" onClick={() => setHistoryOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Report History <Badge variant="secondary">{history.length}</Badge>
                  </CardTitle>
                  {historyOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </CardHeader>
              </button>
              {historyOpen && (
                <CardContent className="pt-0 space-y-1">
                  {history.map((report) => (
                    <HistoryRow key={report.id} report={report} active={activeHistoryId === report.id}
                      onLoad={() => { setCurrentReport(report as unknown as SwotGenerateResult); setSnapshot(report.snapshotJson); setActiveHistoryId(report.id); }} />
                  ))}
                </CardContent>
              )}
            </Card>
          )}
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
