import { useState, useMemo, useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, AnimatePresence, useInView } from "framer-motion";
import { useUser } from "@clerk/react";
import {
  useGetAnalyticsOverview,
  useGetSalesAnalytics,
  useGetSocialAnalytics,
} from "@workspace/api-client-react";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, Users, ShoppingCart, Target, Share2, Package,
  TrendingUp, TrendingDown, Minus, Zap, ArrowRight, Activity, Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, AreaChart, Area,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const PERIODS = [
  { value: "week",  label: "Past 7 days" },
  { value: "month", label: "Past 30 days" },
  { value: "year",  label: "Past year" },
];

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "#1DA1F2",
  x: "#60a5fa",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  instagram: "#E1306C",
  tiktok: "#010101",
};

function platformColor(name: string) {
  return PLATFORM_COLORS[name.toLowerCase()] ?? "hsl(217 91% 60%)";
}

/* ── animation config ───────────────────────────────────────────────────────── */
const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const cardStagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07, delayChildren: 0.3 } },
};

/* ── animated counter ────────────────────────────────────────────────────── */
function useCountUp(target: number, duration = 1.2, delay = 0.3) {
  const [count, setCount] = useState(0);
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = (now - start) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        // ease out expo
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

/* ── aurora background ───────────────────────────────────────────────────── */
function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-primary/8 blur-[140px]"
        animate={{ x: [0, 60, 0], y: [0, 80, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-60 w-[600px] h-[600px] rounded-full bg-violet-500/6 blur-[120px]"
        animate={{ x: [0, -70, 0], y: [0, -50, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />
      <motion.div
        className="absolute -bottom-20 left-1/4 w-[400px] h-[400px] rounded-full bg-cyan-500/5 blur-[100px]"
        animate={{ x: [0, 40, 0], y: [0, -40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 8 }}
      />
    </div>
  );
}

/* ── floating particles ──────────────────────────────────────────────────── */
function Particles() {
  const items = Array.from({ length: 14 }, (_, i) => ({ id: i, x: Math.random() * 100, delay: Math.random() * 8 }));
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {items.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-1 h-1 rounded-full bg-primary/25"
          style={{ left: `${p.x}%`, top: `${10 + Math.random() * 80}%` }}
          animate={{ y: [0, -40, 0], opacity: [0, 0.7, 0] }}
          transition={{ duration: 5 + Math.random() * 4, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/* ── custom chart tooltip ────────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label, prefix = "$" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm px-3 py-2 shadow-xl shadow-black/20 text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      <p className="font-bold text-foreground">
        {prefix}{typeof payload[0]?.value === "number" ? payload[0].value.toLocaleString() : payload[0]?.value}
      </p>
    </div>
  );
}

/* ── stat card ───────────────────────────────────────────────────────────── */
function StatCard({
  title, value, rawValue, icon: Icon, gradient, subtext, trend, delay = 0,
}: {
  title: string;
  value: string;
  rawValue: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  subtext?: string;
  trend?: "up" | "down" | "flat";
  delay?: number;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground";
  const count = useCountUp(rawValue, 1.1, delay + 0.4);
  const displayValue = value.startsWith("$") ? `$${count.toLocaleString()}` : String(count);

  return (
    <motion.div
      variants={fadeUp}
      className="group h-full"
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <div className="relative h-full rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden transition-all duration-300 group-hover:border-white/10 group-hover:shadow-2xl group-hover:shadow-black/30">
        {/* gradient shimmer on hover */}
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${gradient} to-transparent`} />

        {/* glowing orb behind icon */}
        <motion.div
          className={`absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500 bg-gradient-to-br ${gradient}`}
        />

        <div className="relative p-5 h-full flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</p>
            <div className={`p-2 rounded-xl bg-gradient-to-br ${gradient} ring-1 ring-white/10 shadow-lg`}>
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
          </div>

          <div>
            <motion.div
              className="text-2xl font-black tabular-nums tracking-tight"
              key={count}
            >
              {displayValue}
            </motion.div>

            {subtext && (
              <p className={`text-xs mt-1.5 flex items-center gap-1 ${trend ? trendColor : "text-muted-foreground/60"}`}>
                {trend && <TrendIcon className="h-3 w-3" />}
                {subtext}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── activity item ───────────────────────────────────────────────────────── */
function ActivityItem({ activity, index }: { activity: any; index: number }) {
  const colors = ["bg-primary", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-cyan-500", "bg-rose-500"];
  const color = colors[index % colors.length];

  return (
    <motion.div
      className="flex items-start gap-3 group"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5 + index * 0.07, duration: 0.4, ease: "easeOut" }}
    >
      {/* timeline dot */}
      <div className="relative mt-1.5 flex-shrink-0">
        <motion.div
          className={`w-2 h-2 rounded-full ${color}`}
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
        />
        <div className={`absolute inset-0 rounded-full ${color} opacity-30 animate-ping`} style={{ animationDelay: `${index * 0.3}s` }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug truncate group-hover:text-foreground transition-colors">{activity.description}</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {format(new Date(activity.timestamp), "MMM d, h:mm a")}
        </p>
      </div>
    </motion.div>
  );
}

/* ── loading skeleton ────────────────────────────────────────────────────── */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`relative overflow-hidden rounded-xl bg-muted/40 ${className}`}>
    <motion.div
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
      animate={{ x: ["-100%", "100%"] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
    />
  </div>;
}

function DashboardSkeleton() {
  return (
    <div className="relative p-6 md:p-8 max-w-7xl mx-auto space-y-8 w-full">
      <AuroraBackground />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2"><Skeleton className="h-10 w-52" /><Skeleton className="h-4 w-64" /></div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-7">
        <Skeleton className="md:col-span-4 h-80" />
        <Skeleton className="md:col-span-3 h-80" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <div className="space-y-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */
export default function Dashboard() {
  const [period, setPeriod] = useState("month");
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";

  const { data: analytics, isLoading: overviewLoading } = useGetAnalyticsOverview();
  const { data: salesData,  isLoading: salesLoading }   = useGetSalesAnalytics({ period } as any);
  const { data: socialData, isLoading: socialLoading }  = useGetSocialAnalytics({ period } as any);

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

  const { vendor } = useCurrentVendor();

  // Feature trial banner data
  const featureTrialTier = (vendor as any)?.featureTrialTier as string | null | undefined;
  const featureTrialExpiresAt = (vendor as any)?.featureTrialExpiresAt as string | null | undefined;
  const trialActive = featureTrialTier && featureTrialExpiresAt && new Date(featureTrialExpiresAt) > new Date();
  const trialDaysLeft = trialActive
    ? Math.ceil((new Date(featureTrialExpiresAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  if (isLoading) return <DashboardSkeleton />;

  const totalRevenue   = (analytics?.totalRevenue ?? 0) as number;
  const totalSales     = (salesData as any)?.totalRevenue ?? 0;
  const conversionRate = (salesData as any)?.conversionRate ?? 0;
  const totalSalesNum  = typeof totalSales === "number" ? totalSales : parseFloat(totalSales ?? "0");

  const STAT_CARDS = [
    {
      title: "Total Revenue",
      value: `$${totalRevenue.toLocaleString()}`,
      rawValue: totalRevenue,
      icon: DollarSign,
      gradient: "from-emerald-500/30 via-emerald-500/10",
      subtext: `$${totalSalesNum.toLocaleString()} this period`,
      trend: avgRevenue ?? undefined,
    },
    {
      title: "Pending Orders",
      value: String(analytics?.pendingOrders ?? 0),
      rawValue: analytics?.pendingOrders ?? 0,
      icon: ShoppingCart,
      gradient: "from-amber-500/30 via-amber-500/10",
      subtext: "Needs fulfilment",
    },
    {
      title: "Total Leads",
      value: String(analytics?.totalLeads ?? 0),
      rawValue: analytics?.totalLeads ?? 0,
      icon: Target,
      gradient: "from-blue-500/30 via-blue-500/10",
    },
    {
      title: "Total Vendors",
      value: String(analytics?.totalVendors ?? 0),
      rawValue: analytics?.totalVendors ?? 0,
      icon: Users,
      gradient: "from-violet-500/30 via-violet-500/10",
    },
    {
      title: "Low Stock",
      value: String(analytics?.lowStockAlerts ?? 0),
      rawValue: analytics?.lowStockAlerts ?? 0,
      icon: Package,
      gradient: "from-rose-500/30 via-rose-500/10",
      subtext: analytics?.lowStockAlerts ? "Items need restocking" : "All stocked",
      trend: (analytics?.lowStockAlerts ? "down" : undefined) as "down" | undefined,
    },
    {
      title: "Social Posts",
      value: String(analytics?.totalPosts ?? 0),
      rawValue: analytics?.totalPosts ?? 0,
      icon: Share2,
      gradient: "from-purple-500/30 via-purple-500/10",
      subtext: `${(conversionRate * 100).toFixed(1)}% conversion`,
    },
  ] as const;

  return (
    <div className="relative w-full">
      <AuroraBackground />
      <Particles />

      <motion.div
        className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 w-full"
        variants={stagger}
        initial="hidden"
        animate="show"
      >

        {/* ── Feature Trial Banner ─────────────────────────────────────── */}
        {trialActive && (
          <motion.div variants={fadeUp}>
            <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 p-4 flex items-center gap-4">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-violet-300">
                  {featureTrialTier!.charAt(0).toUpperCase() + featureTrialTier!.slice(1)} Plan — Free Trial Active
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You have full access to design features (AI Content Studio, Website Builder, Media Editor) for{" "}
                  <span className="font-medium text-violet-400">{trialDaysLeft} more {trialDaysLeft === 1 ? "day" : "days"}</span>.
                  Upgrade your plan to keep access after your trial ends.
                </p>
              </div>
              <a
                href="/pricing"
                className="shrink-0 text-xs font-semibold text-violet-300 hover:text-violet-200 border border-violet-500/40 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
              >
                Upgrade →
              </a>
            </div>
          </motion.div>
        )}

        {/* ── Header ───────────────────────────────────────────────────── */}
        <motion.div
          variants={fadeUp}
          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
        >
          <div>
            {/* live indicator */}
            <div className="flex items-center gap-2 mb-3">
              <motion.div
                className="w-2 h-2 rounded-full bg-emerald-500"
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-xs font-semibold text-emerald-500/80 uppercase tracking-widest">Live</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none">
              <span className="bg-gradient-to-br from-foreground via-foreground/90 to-foreground/60 bg-clip-text text-transparent">
                Hey, {firstName} 👋
              </span>
            </h1>
            <p className="text-muted-foreground mt-2 text-base">
              Here's how your business is performing — your command centre.
            </p>

            {/* period badge */}
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="outline" className="text-xs border-primary/30 text-primary/80 bg-primary/5">
                <Activity className="w-3 h-3 mr-1" />
                {PERIODS.find(p => p.value === period)?.label}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40 border-border/50 bg-card/50 backdrop-blur-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* quick actions */}
            <div className="flex gap-2">
              {[
                { label: "New post", href: "/social/create" },
                { label: "Add product", href: "/products" },
              ].map((a) => (
                <motion.a
                  key={a.label}
                  href={a.href}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {a.label}
                  <ArrowRight className="w-3 h-3" />
                </motion.a>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── KPI Cards ────────────────────────────────────────────────── */}
        <motion.div
          variants={cardStagger}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        >
          {STAT_CARDS.map((card, i) => (
            <StatCard key={card.title} {...card} delay={i * 0.06} />
          ))}
        </motion.div>

        {/* ── Revenue trend + Activity ──────────────────────────────────── */}
        <motion.div variants={fadeUp} className="grid gap-4 md:grid-cols-7">

          {/* Revenue area chart */}
          <div className="md:col-span-4 group relative rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-white/10 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/3 via-transparent to-cyan-500/3 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-base">Revenue Trend</h3>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Daily revenue in the selected period</p>
                </div>
                {avgRevenue && (
                  <Badge variant="outline" className={`text-xs ${avgRevenue === "up" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5" : avgRevenue === "down" ? "border-red-500/30 text-red-400 bg-red-500/5" : "border-border/50"}`}>
                    {avgRevenue === "up" ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {avgRevenue === "up" ? "Trending up" : "Trending down"}
                  </Badge>
                )}
              </div>
              {revenueByDay.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 gap-3">
                  <Zap className="w-8 h-8 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground/50 text-center">No revenue data for this period yet.<br/>Start selling to see your trend.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={revenueByDay}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(142 72% 45%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(142 72% 45%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.3)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} axisLine={false} tickLine={false} width={55} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(142 72% 45%)"
                      strokeWidth={2.5}
                      fill="url(#revenueGrad)"
                      dot={false}
                      activeDot={{ r: 5, fill: "hsl(142 72% 45%)", strokeWidth: 2, stroke: "hsl(var(--background))" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className="md:col-span-3 group relative rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-white/10 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-purple-500/3 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-base">Recent Activity</h3>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Latest business events</p>
                </div>
                <motion.div
                  className="w-2 h-2 rounded-full bg-primary"
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                />
              </div>

              <div className="flex-1 space-y-4 overflow-hidden">
                {analytics?.recentActivity?.length ? (
                  analytics.recentActivity.slice(0, 6).map((activity: any, i: number) => (
                    <ActivityItem key={i} activity={activity} index={i} />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 gap-3">
                    <Activity className="w-8 h-8 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground/50 text-center">No recent activity.<br/>Events will appear here as things happen.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Top Products + Social ────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="grid gap-4 md:grid-cols-2">

          {/* Top products */}
          <div className="group relative rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-white/10 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/3 via-transparent to-indigo-500/3 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-6">
              <h3 className="font-bold text-base">Top Products</h3>
              <p className="text-xs text-muted-foreground/60 mt-0.5 mb-6">By revenue in the selected period</p>
              {topProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <Package className="w-8 h-8 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground/50 text-center">No product sales yet.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topProducts} layout="vertical">
                    <defs>
                      <linearGradient id="productGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor="hsl(217 91% 60%)" />
                        <stop offset="100%" stopColor="hsl(270 70% 60%)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border)/0.3)" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="revenue" fill="url(#productGrad)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Social breakdown */}
          <div className="space-y-4">
            {/* Posts by platform */}
            <div className="group relative rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-white/10 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/3 via-transparent to-pink-500/3 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-6">
                <h3 className="font-bold text-sm mb-4">Posts by Platform</h3>
                {socialByPlatform.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-sm text-muted-foreground/50">No posts yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={socialByPlatform}>
                      <defs>
                        {socialByPlatform.map((s, i) => (
                          <linearGradient key={s.platform} id={`plat-${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor={platformColor(s.platform)} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={platformColor(s.platform)} stopOpacity={0.4} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.3)" />
                      <XAxis dataKey="platform" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip prefix="" />} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(270 70% 60%)" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Post status */}
            <div className="group relative rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-white/10 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/3 via-transparent to-teal-500/3 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-6">
                <h3 className="font-bold text-sm mb-4">Post Status</h3>
                {socialByStatus.length === 0 ? (
                  <div className="flex items-center justify-center h-20 text-sm text-muted-foreground/50">No posts yet.</div>
                ) : (
                  <div className="space-y-3">
                    {socialByStatus.map((s: any, i: number) => {
                      const total = socialByStatus.reduce((sum: number, x: any) => sum + x.count, 0);
                      const pct   = total > 0 ? Math.round((s.count / total) * 100) : 0;
                      const cfg: Record<string, { bar: string; text: string }> = {
                        published: { bar: "bg-gradient-to-r from-emerald-500 to-emerald-400", text: "text-emerald-400" },
                        scheduled: { bar: "bg-gradient-to-r from-blue-500 to-blue-400",    text: "text-blue-400" },
                        draft:     { bar: "bg-gradient-to-r from-muted-foreground/50 to-muted-foreground/30", text: "text-muted-foreground" },
                        failed:    { bar: "bg-gradient-to-r from-red-500 to-rose-400",     text: "text-red-400" },
                      };
                      const c = cfg[s.status] ?? { bar: "bg-primary", text: "text-primary" };
                      return (
                        <div key={s.status} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className={`capitalize font-medium ${c.text}`}>{s.status}</span>
                            <span className="text-muted-foreground/60 tabular-nums">{s.count} · {pct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${c.bar}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ delay: 0.8 + i * 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── bottom padding ───────────────────────────────────────────── */}
        <div className="h-4" />
      </motion.div>
    </div>
  );
}
