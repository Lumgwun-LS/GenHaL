import { useState } from "react";
import { useGetFinanceOverviewAnalytics, getGetFinanceOverviewAnalyticsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp, TrendingDown, Wallet, PiggyBank } from "lucide-react";
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

const PIE_COLORS = ["hsl(217 91% 60%)", "hsl(24 95% 62%)", "hsl(142 71% 45%)", "hsl(0 84% 60%)", "hsl(271 81% 56%)", "hsl(48 96% 53%)", "hsl(199 89% 48%)", "hsl(340 82% 52%)", "hsl(160 84% 39%)", "hsl(280 65% 60%)"];

interface VendorFinanceOverviewProps {
  vendorId: number;
  vendorName?: string;
}

export function VendorFinanceOverview({ vendorId, vendorName }: VendorFinanceOverviewProps) {
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = {
    vendorId,
    period,
    ...(period === "custom" && from ? { from: new Date(from).toISOString() } : {}),
    ...(period === "custom" && to ? { to: new Date(to).toISOString() } : {}),
  };
  const { data, isLoading } = useGetFinanceOverviewAnalytics(params, {
    query: { enabled: Boolean(vendorId), queryKey: getGetFinanceOverviewAnalyticsQueryKey(params) },
  });

  const netProfit = data?.profitAndLoss.netProfit ?? 0;
  const stats = [
    { title: "Total Revenue", value: `$${(data?.profitAndLoss.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-emerald-500" },
    { title: "Total Expenses", value: `$${(data?.profitAndLoss.totalExpenses ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Wallet, color: "text-destructive" },
    { title: "Net Profit", value: `$${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: netProfit >= 0 ? TrendingUp : TrendingDown, color: netProfit >= 0 ? "text-emerald-500" : "text-destructive" },
    { title: "Investment ROI", value: `${(data?.investmentRoi.overallRoiPercent ?? 0).toFixed(1)}%`, icon: PiggyBank, color: (data?.investmentRoi.overallRoiPercent ?? 0) >= 0 ? "text-emerald-500" : "text-destructive" },
  ];

  return (
    <div className="space-y-4">
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
          {vendorName && (
            <div className="ml-auto pb-1.5">
              <span className="text-sm text-muted-foreground">Viewing: <span className="font-medium text-foreground">{vendorName}</span></span>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading finance data…</div>
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
                <CardDescription>Daily revenue over the selected period.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data?.revenueTrend ?? []}>
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
                <CardDescription>Revenue vs. expenses by day.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data?.profitAndLoss.byPeriod ?? []}>
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
                <CardDescription>Spend by category.</CardDescription>
              </CardHeader>
              <CardContent>
                {!data?.expenseByCategory.length ? (
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
                <CardDescription>Historical net cash flow, projected forward using the average daily net.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data?.cashFlowForecast ?? []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                    <Line type="monotone" dataKey="projectedNet" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2">Forecasted days extend past the selected range's end date.</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Investment ROI</CardTitle>
              <CardDescription>Return on owner capital, loans, equity, and external assets.</CardDescription>
            </CardHeader>
            <CardContent>
              {!data?.investmentRoi.byInvestment.length ? (
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
        </>
      )}
    </div>
  );
}
