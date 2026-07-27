import { useState } from "react";
import { useGetAdminDemographicsAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Users, DollarSign, Eye, Globe, MonitorSmartphone, Code2,
  MousePointer, Smartphone, Monitor, Tablet, MapPin, Clock,
  BarChart2, TrendingUp, Navigation,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell,
  ComposedChart, Area,
} from "recharts";
import { useQuery } from "@tanstack/react-query";

const BASE_URL = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const PERIODS = [
  { value: "week",   label: "Past week" },
  { value: "month",  label: "Past month" },
  { value: "year",   label: "Past year" },
  { value: "custom", label: "Custom range" },
];

const PLATFORM_LABELS: Record<string, string> = {
  "vendor-hub": "Biz Suite Web",
  "app-store":  "App Store",
  "mobile":     "Mobile App",
};

const COLORS = [
  "#7F50FF", "#FF7F50", "#22c55e", "#3b82f6", "#f59e0b",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#8b5cf6",
];

// ── Reusable chart helpers ────────────────────────────────────────────────────
function StatCard({ title, value, icon: Icon, color = "text-primary", sub }: {
  title: string; value: string | number; icon: React.ComponentType<any>; color?: string; sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MiniDonut({ data, title }: { data: { name: string; value: number }[]; title: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="flex gap-4 items-center">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} innerRadius={28}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => [`${v} (${total > 0 ? ((v / total) * 100).toFixed(0) : 0}%)`, ""]} />
          </PieChart>
        </ResponsiveContainer>
        <ul className="space-y-1 text-xs flex-1 min-w-0">
          {data.slice(0, 6).map((d, i) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="truncate text-muted-foreground">{d.name}</span>
              <span className="ml-auto font-medium tabular-nums">{d.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DemographicBreakdown({ title, users, revenue }: {
  title: string;
  users: { key: string; count: number }[];
  revenue: { key: string; total: number; count: number }[];
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Signups</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={users}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="key" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Revenue</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="key" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
              <Bar dataKey="total" fill="hsl(24 95% 62%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Visitor intelligence fetcher ──────────────────────────────────────────────
function useVisitorIntelligence(period: string, from: string, to: string) {
  return useQuery({
    queryKey: ["visitor-intelligence", period, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (period === "custom" && from) params.set("from", new Date(from).toISOString());
      if (period === "custom" && to)   params.set("to",   new Date(to).toISOString());
      const res = await fetch(`${BASE_URL}/api/admin/analytics/visitor-intelligence?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<any>;
    },
    staleTime: 60_000,
  });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminAnalyticsPanel() {
  const [period, setPeriod] = useState("month");
  const [from, setFrom]     = useState("");
  const [to, setTo]         = useState("");

  const { data: demo, isLoading: demoLoading } = useGetAdminDemographicsAnalytics({
    period,
    ...(period === "custom" && from ? { from: new Date(from).toISOString() } : {}),
    ...(period === "custom" && to   ? { to:   new Date(to).toISOString()   } : {}),
  });
  const { data: vi, isLoading: viLoading } = useVisitorIntelligence(period, from, to);

  const d = demo as any;

  const isLoading = demoLoading || viLoading;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Platform-wide analytics: visitors, signups, revenue, and behaviour.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
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
        <div className="p-8 text-center text-muted-foreground">Loading analytics…</div>
      ) : (
        <Tabs defaultValue="visitors">
          <TabsList className="flex flex-wrap gap-1 h-auto mb-4">
            <TabsTrigger value="visitors" className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Visitors</TabsTrigger>
            <TabsTrigger value="sources"  className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Traffic Sources</TabsTrigger>
            <TabsTrigger value="geo"      className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Geography</TabsTrigger>
            <TabsTrigger value="tech"     className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" />Technology</TabsTrigger>
            <TabsTrigger value="time"     className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Time Patterns</TabsTrigger>
            <TabsTrigger value="pages"    className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" />Pages & Menus</TabsTrigger>
            <TabsTrigger value="signups"  className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Signups</TabsTrigger>
          </TabsList>

          {/* ── VISITORS tab ─────────────────────────────────────────────────── */}
          <TabsContent value="visitors" className="space-y-6">
            {/* KPI row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard title="Page views"       value={(vi?.kpis?.totalViews ?? d?.totalPageViews ?? 0).toLocaleString()}     icon={Eye} />
              <StatCard title="Unique sessions"  value={(vi?.kpis?.uniqueSessions ?? d?.uniqueSessions ?? 0).toLocaleString()} icon={Globe} />
              <StatCard title="Signed-in visits" value={(vi?.kpis?.authenticatedSessions ?? 0).toLocaleString()} icon={Users}     color="text-primary" sub="sessions with auth" />
              <StatCard title="Anonymous visits" value={(vi?.kpis?.anonymousSessions ?? 0).toLocaleString()}    icon={Eye}       color="text-muted-foreground" />
              <StatCard title="Conversion rate"  value={`${vi?.kpis?.signupConversionRate ?? 0}%`}             icon={TrendingUp} color="text-emerald-500" sub="anon → signed-in" />
              <StatCard title="Menu clicks"      value={(vi?.kpis?.totalMenuEvents ?? 0).toLocaleString()}      icon={Navigation} color="text-amber-500" />
            </div>

            {/* Visitors over time */}
            {vi?.visitorsOverTime?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Visitors over time</CardTitle>
                  <CardDescription>Page views and unique sessions per day.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={vi.visitorsOverTime}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="views" name="Page views" fill="#7F50FF22" stroke="#7F50FF" strokeWidth={2} />
                      <Line type="monotone" dataKey="uniqueSessions" name="Unique sessions" stroke="#FF7F50" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Platform breakdown */}
            {vi?.byPlatform?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Traffic by platform</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    {(vi.byPlatform as { platform: string; count: number }[]).map((p) => (
                      <div key={p.platform} className="flex-1 min-w-[120px] rounded-lg border p-4 text-center">
                        <p className="text-xs text-muted-foreground mb-1">{PLATFORM_LABELS[p.platform] ?? p.platform}</p>
                        <p className="text-2xl font-bold">{p.count.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">views</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── TRAFFIC SOURCES tab ──────────────────────────────────────────── */}
          <TabsContent value="sources" className="space-y-6">
            {vi?.trafficSources?.length > 0 ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Traffic sources</CardTitle>
                    <CardDescription>Where visitors come from — referrer + UTM parsed.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={vi.trafficSources} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="source" width={120} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Visits" radius={[0, 4, 4, 0]}>
                          {vi.trafficSources.map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <MiniDonut
                  title="Source distribution"
                  data={vi.trafficSources.map((s: any) => ({ name: s.source, value: s.count }))}
                />

                {/* UTM campaigns */}
                {vi.utmCampaigns?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">UTM Campaigns</CardTitle>
                      <CardDescription>Tracked marketing campaigns (utm_source / utm_medium / utm_campaign).</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left py-2 font-medium">Campaign</th>
                            <th className="text-right py-2 font-medium">Visits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vi.utmCampaigns.map((c: any) => (
                            <tr key={c.campaign} className="border-b hover:bg-muted/30">
                              <td className="py-2 font-mono text-xs">{c.campaign}</td>
                              <td className="py-2 text-right font-medium">{c.count.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No traffic source data yet. Visitor data accumulates as pages are viewed.
              </div>
            )}
          </TabsContent>

          {/* ── GEOGRAPHY tab ────────────────────────────────────────────────── */}
          <TabsContent value="geo" className="space-y-6">
            {/* Countries from actual pageview data */}
            {vi?.countriesFromVisits?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Countries by visits</CardTitle>
                  <CardDescription>Based on actual visitor IP/locale detection (not just signups).</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(250, vi.countriesFromVisits.length * 28)}>
                    <BarChart data={vi.countriesFromVisits} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="country" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Visits" radius={[0, 4, 4, 0]}>
                        {vi.countriesFromVisits.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Vendor signup geography */}
            {d && (
              <>
                <DemographicBreakdown title="Signups by country" users={d.usersByCountry ?? []} revenue={d.paymentsByCountry ?? []} />
                <DemographicBreakdown title="Signups by state"   users={d.usersByState   ?? []} revenue={d.paymentsByState   ?? []} />
                <DemographicBreakdown title="Signups by city"    users={d.usersByCity    ?? []} revenue={d.paymentsByCity    ?? []} />
              </>
            )}
          </TabsContent>

          {/* ── TECHNOLOGY tab ───────────────────────────────────────────────── */}
          <TabsContent value="tech" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {vi?.byDevice?.length > 0 && (
                <MiniDonut
                  title="Device type"
                  data={vi.byDevice.map((d: any) => ({ name: d.name, value: d.count }))}
                />
              )}
              {vi?.byBrowser?.length > 0 && (
                <MiniDonut
                  title="Browser"
                  data={vi.byBrowser.map((d: any) => ({ name: d.name, value: d.count }))}
                />
              )}
              {vi?.byOS?.length > 0 && (
                <MiniDonut
                  title="Operating system"
                  data={vi.byOS.map((d: any) => ({ name: d.name, value: d.count }))}
                />
              )}
            </div>

            {/* Detail tables */}
            {[
              { label: "Device", data: vi?.byDevice },
              { label: "Browser", data: vi?.byBrowser },
              { label: "OS", data: vi?.byOS },
            ].filter((t) => t.data?.length > 0).map((t) => (
              <Card key={t.label}>
                <CardHeader><CardTitle className="text-sm">{t.label} breakdown</CardTitle></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-1.5 font-medium">{t.label}</th>
                        <th className="text-right py-1.5 font-medium">Visits</th>
                        <th className="text-right py-1.5 font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const total = t.data.reduce((s: number, r: any) => s + r.count, 0);
                        return t.data.map((r: any) => (
                          <tr key={r.name} className="border-b hover:bg-muted/30">
                            <td className="py-1.5">{r.name}</td>
                            <td className="py-1.5 text-right tabular-nums">{r.count.toLocaleString()}</td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                              {total > 0 ? ((r.count / total) * 100).toFixed(1) : 0}%
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── TIME PATTERNS tab ───────────────────────────────────────────── */}
          <TabsContent value="time" className="space-y-6">
            {vi?.byHour && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Visits by hour (UTC)</CardTitle>
                  <CardDescription>Which hours of day see the most traffic.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={vi.byHour}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}:00`} tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(h: number) => `${h}:00–${h}:59 UTC`} />
                      <Bar dataKey="count" name="Visits" fill="#7F50FF" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {vi?.byDayOfWeek && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Visits by day of week</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={vi.byDayOfWeek}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Visits" fill="#FF7F50" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── PAGES & MENUS tab ───────────────────────────────────────────── */}
          <TabsContent value="pages" className="space-y-6">
            {vi?.topPages?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top pages</CardTitle>
                  <CardDescription>Most visited paths across all platforms.</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2 font-medium">#</th>
                        <th className="text-left py-2 font-medium">Path</th>
                        <th className="text-right py-2 font-medium">Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vi.topPages.map((p: any, i: number) => (
                        <tr key={p.path} className="border-b hover:bg-muted/30">
                          <td className="py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                          <td className="py-2 font-mono text-xs">{p.path || "/"}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{p.count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {vi?.menuUsage?.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Menu item clicks</CardTitle>
                  <CardDescription>Which sidebar / nav items vendors click most.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(200, vi.menuUsage.length * 30)}>
                    <BarChart data={vi.menuUsage} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="menu" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Clicks" radius={[0, 4, 4, 0]}>
                        {vi.menuUsage.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No menu-click events recorded yet — they accumulate as signed-in vendors navigate.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── SIGNUPS tab ──────────────────────────────────────────────────── */}
          <TabsContent value="signups" className="space-y-6">
            {/* Funnel cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title="Total visitors"  value={(vi?.kpis?.uniqueSessions ?? 0).toLocaleString()} icon={Eye} />
              <StatCard
                title="Signed-in sessions"
                value={(vi?.kpis?.authenticatedSessions ?? 0).toLocaleString()}
                icon={Users}
                color="text-primary"
                sub={`${vi?.kpis?.signupConversionRate ?? 0}% conversion`}
              />
              <StatCard title="Vendor signups"    value={d?.totalUsers ?? 0}                              icon={Users}          color="text-emerald-500" />
              <StatCard title="Developer signups" value={(d?.totalDeveloperSignups ?? 0).toLocaleString()} icon={Code2}          color="text-violet-500" />
            </div>

            {/* Signups over time */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Signups &amp; revenue over time</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Signups per day</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={d?.signupsOverTime ?? []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#7F50FF" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Revenue per day</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={d?.revenueOverTime ?? []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                      <Line type="monotone" dataKey="amount" stroke="#FF7F50" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <DemographicBreakdown title="By gender" users={d?.usersByGender ?? []} revenue={d?.paymentsByGender ?? []} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
