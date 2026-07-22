import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  useGetAnalyticsOverview,
  useGetSalesAnalytics,
  useGetSocialAnalytics,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, Users, ShoppingCart, Target, Share2, Package,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { format } from "date-fns";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const PERIODS = [
  { value: "week",  label: "Past 7 days" },
  { value: "month", label: "Past 30 days" },
  { value: "year",  label: "Past year" },
];

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "#1DA1F2",
  x: "#000",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  instagram: "#E1306C",
  tiktok: "#010101",
};

function platformColor(name: string) {
  return PLATFORM_COLORS[name.toLowerCase()] ?? "hsl(217 91% 60%)";
}

/* ── animation variants ─────────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: import("framer-motion").Variants = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

const stagger: import("framer-motion").Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const cardStagger: import("framer-motion").Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06, delayChildren: 0.25 } },
};

/* ── StatCard ────────────────────────────────────────────────────────────── */

function StatCard({
  title, value, icon: Icon, color, subtext, trend,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  subtext?: string;
  trend?: "up" | "down" | "flat";
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up" ? "text-emerald-500" : trend === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <motion.div variants={fadeUp} className="h-full">
      <Card className="h-full transition-shadow hover:shadow-lg hover:shadow-primary/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className={`rounded-lg p-1.5 bg-background ${color} ring-1 ring-inset ring-white/5`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          {subtext && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${trend ? trendColor : "text-muted-foreground"}`}>
              {trend && <TrendIcon className="h-3 w-3" />}
              {subtext}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ── loading skeleton ────────────────────────────────────────────────────── */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-7">
        <Skeleton className="md:col-span-4 h-72" />
        <Skeleton className="md:col-span-3 h-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <div className="space-y-4">
          <Skeleton className="h-[180px]" />
          <Skeleton className="h-[140px]" />
        </div>
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */

export default function Dashboard() {
  const [period, setPeriod] = useState("month");

  const { data: analytics, isLoading: overviewLoading } = useGetAnalyticsOverview();
  const { data: salesData, isLoading: salesLoading }   = useGetSalesAnalytics({ period } as any);
  const { data: socialData, isLoading: socialLoading } = useGetSocialAnalytics({ period } as any);

  const isLoading = overviewLoading || salesLoading || socialLoading;

  const revenueByDay: { date: string; revenue: number }[] = useMemo(() => {
    const raw = (salesData as any)?.revenueByDay ?? [];
    return raw.map((r: any) => ({
      date:    format(new Date(r.date), "MMM d"),
      revenue: typeof r.revenue === "number" ? r.revenue : parseFloat(r.revenue ?? "0"),
    }));
  }, [salesData]);

  const topProducts: { name: string; revenue: number; units: number }[] = useMemo(
    () => ((salesData as any)?.topProducts ?? []).slice(0, 6),
    [salesData],
  );

  const socialByPlatform: { platform: string; count: number }[] = useMemo(
    () => (socialData as any)?.postsByPlatform ?? [],
    [socialData],
  );

  const socialByStatus: { status: string; count: number }[] = useMemo(
    () => (socialData as any)?.postsByStatus ?? [],
    [socialData],
  );

  const avgRevenue = useMemo(() => {
    if (!revenueByDay.length) return null;
    const mid    = Math.floor(revenueByDay.length / 2);
    const first  = revenueByDay.slice(0, mid).reduce((s, d) => s + d.revenue, 0);
    const second = revenueByDay.slice(mid).reduce((s, d)  => s + d.revenue, 0);
    return first === 0 ? null : second > first ? "up" : second < first ? "down" : "flat";
  }, [revenueByDay]) as "up" | "down" | "flat" | null;

  if (isLoading) return <DashboardSkeleton />;

  const totalRevenue     = (analytics?.totalRevenue ?? 0) as number;
  const totalSales       = (salesData as any)?.totalRevenue ?? 0;
  const conversionRate   = (salesData as any)?.conversionRate ?? 0;

  return (
    <motion.div
      className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 w-full"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Overview
          </h1>
          <p className="text-muted-foreground mt-0.5">Your Awa Biz Suite command centre.</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* ── KPI cards ──────────────────────────────────────────────── */}
      <motion.div
        variants={cardStagger}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard
          title="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          icon={DollarSign}
          color="text-emerald-500"
          subtext={`$${(typeof totalSales === "number" ? totalSales : parseFloat(totalSales)).toLocaleString()} this period`}
          trend={avgRevenue ?? undefined}
        />
        <StatCard
          title="Pending Orders"
          value={analytics?.pendingOrders ?? 0}
          icon={ShoppingCart}
          color="text-amber-500"
          subtext="Needs fulfilment"
        />
        <StatCard
          title="Total Leads"
          value={analytics?.totalLeads ?? 0}
          icon={Target}
          color="text-blue-500"
        />
        <StatCard
          title="Total Vendors"
          value={analytics?.totalVendors ?? 0}
          icon={Users}
          color="text-primary"
        />
        <StatCard
          title="Low Stock"
          value={analytics?.lowStockAlerts ?? 0}
          icon={Package}
          color="text-destructive"
          subtext={analytics?.lowStockAlerts ? "Items need restocking" : "All stocked"}
          trend={analytics?.lowStockAlerts ? "down" : undefined}
        />
        <StatCard
          title="Social Posts"
          value={analytics?.totalPosts ?? 0}
          icon={Share2}
          color="text-purple-500"
          subtext={`${(conversionRate * 100).toFixed(1)}% conversion`}
        />
      </motion.div>

      {/* ── Revenue trend + recent activity ────────────────────────── */}
      <motion.div variants={fadeUp} className="grid gap-4 md:grid-cols-7">
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
            <CardDescription>Daily revenue in the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueByDay.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No revenue data for this period yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toLocaleString()}`} width={60} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(142 72% 45%)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics?.recentActivity?.length ? (
                analytics.recentActivity.slice(0, 6).map((activity: any, i: number) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.06, duration: 0.35, ease: "easeOut" }}
                  >
                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 ring-2 ring-primary/20" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug truncate">{activity.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(activity.timestamp), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-10">No recent activity</div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Top products + Social breakdown ────────────────────────── */}
      <motion.div variants={fadeUp} className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>By revenue in the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                No product sales in this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Posts by platform</CardTitle>
            </CardHeader>
            <CardContent>
              {socialByPlatform.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No posts yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={socialByPlatform}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="platform" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="hsl(270 70% 60%)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Post status</CardTitle>
            </CardHeader>
            <CardContent>
              {socialByStatus.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No posts yet.</div>
              ) : (
                <div className="space-y-2">
                  {socialByStatus.map((s: any, i: number) => {
                    const total = socialByStatus.reduce((sum: number, x: any) => sum + x.count, 0);
                    const pct   = total > 0 ? Math.round((s.count / total) * 100) : 0;
                    const statusColor: Record<string, string> = {
                      published: "bg-emerald-500",
                      scheduled: "bg-blue-500",
                      draft:     "bg-muted-foreground",
                      failed:    "bg-destructive",
                    };
                    return (
                      <div key={s.status} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="capitalize">{s.status}</span>
                          <span className="text-muted-foreground">{s.count} · {pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${statusColor[s.status] ?? "bg-primary"}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ delay: 0.7 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </motion.div>
  );
}
