import { useState } from "react";
import { useGetAdminDemographicsAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, DollarSign, Eye, Globe, MonitorSmartphone, Code2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

const PERIODS = [
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
  { value: "custom", label: "Custom range" },
];

const PLATFORM_LABELS: Record<string, string> = {
  "vendor-hub": "Biz Suite Web",
  "app-store": "App Store",
  "mobile": "Mobile App",
};

function StatCard({ title, value, icon: Icon, color = "text-primary" }: { title: string; value: string | number; icon: React.ComponentType<any>; color?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function DemographicBreakdown({ title, users, revenue }: { title: string; users: { key: string; count: number }[]; revenue: { key: string; total: number; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
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

export default function AdminAnalyticsPanel() {
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useGetAdminDemographicsAnalytics({
    period,
    ...(period === "custom" && from ? { from: new Date(from).toISOString() } : {}),
    ...(period === "custom" && to ? { to: new Date(to).toISOString() } : {}),
  });

  // Cast to include new visitor fields not yet in generated types
  const d = data as any;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Platform-wide analytics: visitors, signups, and revenue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
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
      ) : !d ? (
        <div className="p-8 text-center text-muted-foreground">No data available.</div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard title="Page views" value={(d.totalPageViews ?? 0).toLocaleString()} icon={Eye} />
            <StatCard title="Unique sessions" value={(d.uniqueSessions ?? 0).toLocaleString()} icon={Globe} />
            <StatCard title="Vendor sign-ups" value={d.totalUsers} icon={Users} color="text-primary" />
            <StatCard title="Developer sign-ups" value={(d.totalDeveloperSignups ?? 0).toLocaleString()} icon={Code2} color="text-violet-500" />
            <StatCard title="Revenue" value={`$${(d.totalRevenue ?? 0).toLocaleString()}`} icon={DollarSign} color="text-emerald-500" />
            <StatCard title="Platforms tracked" value={(d.pageViewsByPlatform ?? []).length} icon={MonitorSmartphone} color="text-amber-500" />
          </div>

          {/* Visitors over time */}
          {d.visitorsOverTime?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Visitors over time</CardTitle>
                <CardDescription>Page views and unique sessions per day across all platforms.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={d.visitorsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="views" name="Page views" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="uniqueSessions" name="Unique sessions" stroke="hsl(142 72% 45%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Page views by platform */}
          {d.pageViewsByPlatform?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Traffic by platform</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {(d.pageViewsByPlatform as { key: string; count: number }[]).map((p) => (
                    <div key={p.key} className="flex-1 min-w-[120px] rounded-lg border p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{PLATFORM_LABELS[p.key] ?? p.key}</p>
                      <p className="text-2xl font-bold">{p.count.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">views</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Signups & revenue over time */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Signups &amp; revenue over time</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Signups per day</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={d.signupsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Revenue per day</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={d.revenueOverTime}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                    <Line type="monotone" dataKey="amount" stroke="hsl(24 95% 62%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <DemographicBreakdown title="By gender" users={d.usersByGender} revenue={d.paymentsByGender} />
          <DemographicBreakdown title="By country" users={d.usersByCountry} revenue={d.paymentsByCountry} />
          <DemographicBreakdown title="By state" users={d.usersByState} revenue={d.paymentsByState} />
          <DemographicBreakdown title="By city" users={d.usersByCity} revenue={d.paymentsByCity} />
        </>
      )}
    </div>
  );
}
