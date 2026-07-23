import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Users, Globe, CreditCard,
  Loader2, Save, RefreshCw, BarChart3,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Period = "week" | "month" | "year";

interface Summary {
  totalSubscriptionRevenue: number;
  totalOverageRevenue: number;
  totalGrossRevenue: number;
  totalCosts: number;
  netProfit: number;
  profitMarginPct: number;
  mrrUsd: number;
  arrUsd: number;
  totalVendors: number;
  payingVendors: number;
  freeVendors: number;
  replitMonthlyCostUsd: number;
  otherMonthlyCostUsd: number;
  platformCostNotes: string;
}

interface RevenueData {
  range: { from: string; to: string; period: string };
  summary: Summary;
  byGateway: { gateway: string; revenue: number; count: number }[];
  byTier: { tier: string; revenue: number; count: number; priceUsd: number; priceNgn: number }[];
  byCountry: { country: string; revenue: number; count: number; vendorCount: number }[];
  byCurrency: { currency: string; revenue: number }[];
  tierDistribution: { tier: string; count: number; priceUsd: number; priceNgn: number }[];
  trend: { date: string; revenue: number }[];
  weeklyTotals: { label: string; revenue: number }[];
  monthlyTotals: { label: string; revenue: number }[];
  yearlyTotals: { label: string; revenue: number }[];
  plans: { tier: string; name: string; priceUsd: number; priceNgn: number }[];
}

const TIER_COLORS: Record<string, string> = {
  free: "#6b7280",
  starter: "#3b82f6",
  pro: "#8b5cf6",
  enterprise: "#f59e0b",
  unknown: "#d1d5db",
};

const GATEWAY_COLORS: Record<string, string> = {
  stripe: "#635bff",
  paystack: "#00c3f7",
  paypal: "#003087",
  unknown: "#6b7280",
};

const PIE_COLORS = ["#7F50FF", "#FF7F50", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtUsd(n: number) {
  return `$${fmt(n)}`;
}
function fmtPct(n: number) {
  return `${fmt(n, 1)}%`;
}

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  trend,
  color = "text-foreground",
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
  color?: string;
}) {
  return (
    <Card>
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

export default function RevenueIntelligencePanel() {
  const [period, setPeriod] = useState<Period>("month");
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<RevenueData>({
    queryKey: ["admin-revenue-intelligence", period],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/admin/analytics/revenue-intelligence?period=${period}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  // Cost editor state
  const [editingCosts, setEditingCosts] = useState(false);
  const [replitCost, setReplitCost] = useState("");
  const [otherCost, setOtherCost] = useState("");
  const [costNotes, setCostNotes] = useState("");
  const [savingCosts, setSavingCosts] = useState(false);

  function openCostEditor() {
    if (!data) return;
    setReplitCost(String(data.summary.replitMonthlyCostUsd));
    setOtherCost(String(data.summary.otherMonthlyCostUsd));
    setCostNotes(data.summary.platformCostNotes ?? "");
    setEditingCosts(true);
  }

  async function saveCosts() {
    setSavingCosts(true);
    try {
      const r = await fetch(`${BASE_URL}/api/admin/site-content/admin.platformCosts`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replitMonthlyCostUsd: parseFloat(replitCost) || 0,
          otherMonthlyCostUsd: parseFloat(otherCost) || 0,
          notes: costNotes,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast.success("Platform costs updated");
      setEditingCosts(false);
      qc.invalidateQueries({ queryKey: ["admin-revenue-intelligence"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingCosts(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6 text-center text-sm text-red-400">
        Failed to load revenue data. {error instanceof Error ? error.message : ""}
      </div>
    );
  }

  const { summary, byGateway, byTier, byCountry, tierDistribution, trend, weeklyTotals, monthlyTotals, yearlyTotals, plans } = data;

  // Choose trend data based on period
  const trendData = period === "week" ? trend : period === "month" ? weeklyTotals : monthlyTotals;
  const trendLabel = period === "week" ? "Day" : period === "month" ? "Week" : "Month";

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Revenue & Pricing Intelligence
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(data.range.from).toLocaleDateString()} – {new Date(data.range.to).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-revenue-intelligence"] })}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Gross Revenue" value={fmtUsd(summary.totalGrossRevenue)} sub={`Subscriptions + Overage`} icon={DollarSign} trend="up" color="text-emerald-400" />
        <KpiCard title="Net Profit" value={fmtUsd(summary.netProfit)} sub={`Margin: ${fmtPct(summary.profitMarginPct)}`} icon={TrendingUp} trend={summary.netProfit >= 0 ? "up" : "down"} color={summary.netProfit >= 0 ? "text-emerald-400" : "text-red-400"} />
        <KpiCard title="MRR (Current)" value={fmtUsd(summary.mrrUsd)} sub={`ARR: ${fmtUsd(summary.arrUsd)}`} icon={TrendingUp} />
        <KpiCard title="Paying Vendors" value={String(summary.payingVendors)} sub={`${summary.freeVendors} on free tier`} icon={Users} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Subscription Revenue" value={fmtUsd(summary.totalSubscriptionRevenue)} sub="From plan payments" icon={CreditCard} />
        <KpiCard title="Overage Revenue" value={fmtUsd(summary.totalOverageRevenue)} sub="Pay-as-you-go usage" icon={DollarSign} />
        <KpiCard title="Platform Costs" value={fmtUsd(summary.totalCosts)} sub={`Replit: $${fmt(summary.replitMonthlyCostUsd)}/mo + Other: $${fmt(summary.otherMonthlyCostUsd)}/mo`} icon={TrendingDown} color="text-red-400" />
        <KpiCard title="Total Vendors" value={String(summary.totalVendors)} sub={`${summary.payingVendors} paying`} icon={Users} />
      </div>

      {/* ── Revenue Trend ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Revenue Trend ({trendLabel} by {trendLabel})</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No revenue data in this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7F50FF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7F50FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#374151" />
                <YAxis tick={{ fontSize: 10 }} stroke="#374151" tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [`$${fmt(v)}`, "Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke="#7F50FF" fill="url(#revenueGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Gateway + Country side by side ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Revenue by Gateway */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><CreditCard className="w-4 h-4" /> Revenue by Payment Gateway</CardTitle>
          </CardHeader>
          <CardContent>
            {byGateway.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No payments yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={byGateway} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} stroke="#374151" />
                  <YAxis type="category" dataKey="gateway" tick={{ fontSize: 11 }} stroke="#374151" width={68} />
                  <Tooltip formatter={(v: number) => [`$${fmt(v)}`, "Revenue"]} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {byGateway.map((entry) => (
                      <Cell key={entry.gateway} fill={GATEWAY_COLORS[entry.gateway] ?? "#7F50FF"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="mt-3 space-y-1">
              {byGateway.map((g) => (
                <div key={g.gateway} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: GATEWAY_COLORS[g.gateway] ?? "#7F50FF" }} />
                    <span className="capitalize font-medium">{g.gateway}</span>
                    <span className="text-muted-foreground">({g.count} payments)</span>
                  </div>
                  <span className="font-mono">{fmtUsd(g.revenue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Country */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4" /> Revenue by Country (Top 15)</CardTitle>
          </CardHeader>
          <CardContent>
            {byCountry.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No country data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.min(byCountry.length * 28 + 20, 340)}>
                <BarChart data={byCountry} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} stroke="#374151" />
                  <YAxis type="category" dataKey="country" tick={{ fontSize: 10 }} stroke="#374151" width={80} />
                  <Tooltip formatter={(v: number) => [`$${fmt(v)}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="#FF7F50" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Tier distribution + Revenue by tier ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Vendor Tier Distribution (all time) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Vendor Tier Distribution (All Time)</CardTitle>
            <CardDescription className="text-xs">How many vendors are on each plan right now</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={tierDistribution} dataKey="count" nameKey="tier" innerRadius={45} outerRadius={72} paddingAngle={3}>
                  {tierDistribution.map((entry, i) => (
                    <Cell key={entry.tier} fill={TIER_COLORS[entry.tier] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, name: string) => [v, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1 min-w-0">
              {tierDistribution.map((t) => (
                <div key={t.tier} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TIER_COLORS[t.tier] ?? "#7F50FF" }} />
                    <span className="text-sm capitalize font-medium truncate">{t.tier}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold">{t.count}</span>
                    <span className="text-xs text-muted-foreground ml-1">vendors</span>
                    {t.priceUsd > 0 && <span className="text-xs text-muted-foreground ml-1">(${t.priceUsd}/mo)</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Revenue breakdown by tier in period */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue by Tier (This {period === "week" ? "Week" : period === "month" ? "Month" : "Year"})</CardTitle>
          </CardHeader>
          <CardContent>
            {byTier.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No revenue in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={byTier} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="tier" tick={{ fontSize: 11 }} stroke="#374151" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} stroke="#374151" />
                  <Tooltip formatter={(v: number) => [`$${fmt(v)}`, "Revenue"]} />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {byTier.map((entry) => (
                      <Cell key={entry.tier} fill={TIER_COLORS[entry.tier] ?? "#7F50FF"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Yearly rollup ───────────────────────────────────────────── */}
      {yearlyTotals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Annual Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={yearlyTotals} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#374151" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} stroke="#374151" />
                <Tooltip formatter={(v: number) => [`$${fmt(v)}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="#7F50FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Our Plan Pricing Table ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="w-4 h-4" /> What We Charge Customers</CardTitle>
          <CardDescription className="text-xs">Current subscription plan prices. Edit via Plans tab.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Plan</th>
                  <th className="text-right py-2 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">USD/mo</th>
                  <th className="text-right py-2 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">NGN/mo</th>
                  <th className="text-right py-2 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Current Vendors</th>
                  <th className="text-right py-2 pl-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Est. MRR</th>
                </tr>
              </thead>
              <tbody>
                {[{ tier: "free", name: "Free", priceUsd: 0, priceNgn: 0 }, ...plans].map((plan) => {
                  const dist = tierDistribution.find((t) => t.tier === plan.tier);
                  const count = dist?.count ?? 0;
                  const mrrContrib = plan.priceUsd * count;
                  return (
                    <tr key={plan.tier} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: TIER_COLORS[plan.tier] ?? "#7F50FF" }} />
                          <span className="font-medium capitalize">{plan.name ?? plan.tier}</span>
                        </div>
                      </td>
                      <td className="text-right py-2.5 px-4 font-mono">
                        {plan.priceUsd === 0 ? <span className="text-muted-foreground">Free</span> : `$${fmt(plan.priceUsd)}`}
                      </td>
                      <td className="text-right py-2.5 px-4 font-mono text-muted-foreground">
                        {plan.priceNgn === 0 ? "—" : `₦${fmt(plan.priceNgn, 0)}`}
                      </td>
                      <td className="text-right py-2.5 px-4">
                        <Badge variant="secondary">{count}</Badge>
                      </td>
                      <td className="text-right py-2.5 pl-4 font-mono text-emerald-400">
                        {mrrContrib > 0 ? fmtUsd(mrrContrib) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/20 font-semibold">
                  <td className="py-2.5 pr-4 text-xs uppercase tracking-wide text-muted-foreground">Total MRR</td>
                  <td colSpan={3} />
                  <td className="text-right py-2.5 pl-4 font-mono text-emerald-400">{fmtUsd(summary.mrrUsd)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Platform Costs (Replit + other) ────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-400" /> Platform Operating Costs</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Replit hosting and other monthly costs used to compute net profit
            </CardDescription>
          </div>
          {!editingCosts && (
            <Button size="sm" variant="outline" onClick={openCostEditor}>Edit</Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {editingCosts ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Replit Monthly Cost (USD)</Label>
                  <Input value={replitCost} onChange={(e) => setReplitCost(e.target.value)} placeholder="e.g. 25" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Other Monthly Costs (USD)</Label>
                  <Input value={otherCost} onChange={(e) => setOtherCost(e.target.value)} placeholder="e.g. 0" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea value={costNotes} onChange={(e) => setCostNotes(e.target.value)} placeholder="e.g. Replit Core $25/mo, ElevenLabs $5/mo" rows={2} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveCosts} disabled={savingCosts}>
                  {savingCosts ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingCosts(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Replit Hosting</p>
                <p className="text-lg font-bold mt-0.5">${fmt(summary.replitMonthlyCostUsd)}<span className="text-xs text-muted-foreground font-normal">/mo</span></p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Other Costs</p>
                <p className="text-lg font-bold mt-0.5">${fmt(summary.otherMonthlyCostUsd)}<span className="text-xs text-muted-foreground font-normal">/mo</span></p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Total This Period</p>
                <p className="text-lg font-bold mt-0.5 text-red-400">${fmt(summary.totalCosts)}</p>
              </div>
              {summary.platformCostNotes && (
                <div className="col-span-full text-xs text-muted-foreground bg-muted/20 rounded p-2">
                  {summary.platformCostNotes}
                </div>
              )}
            </div>
          )}

          {/* Profit summary */}
          <div className="border-t border-border pt-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Gross Revenue</p>
              <p className="text-base font-bold text-emerald-400 mt-0.5">{fmtUsd(summary.totalGrossRevenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">– Total Costs</p>
              <p className="text-base font-bold text-red-400 mt-0.5">{fmtUsd(summary.totalCosts)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">= Net Profit</p>
              <p className={`text-base font-bold mt-0.5 ${summary.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtUsd(summary.netProfit)}
                <span className="text-xs text-muted-foreground font-normal ml-1">({fmtPct(summary.profitMarginPct)} margin)</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
