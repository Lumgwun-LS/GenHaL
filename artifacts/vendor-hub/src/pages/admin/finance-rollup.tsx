import { useState } from "react";
import { useGetAdminFinanceRollupAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Wallet, PiggyBank, Download } from "lucide-react";
import { toast } from "sonner";

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

const PIE_COLORS = ["hsl(217 91% 60%)", "hsl(24 95% 62%)", "hsl(142 71% 45%)", "hsl(0 84% 60%)", "hsl(271 81% 56%)", "hsl(48 96% 53%)", "hsl(199 89% 48%)", "hsl(340 82% 52%)", "hsl(160 84% 39%)", "hsl(280 65% 60%)"];

export default function AdminFinanceRollupPanel() {
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [exporting, setExporting] = useState(false);

  const params = {
    period,
    ...(period === "custom" && from ? { from: new Date(from).toISOString() } : {}),
    ...(period === "custom" && to ? { to: new Date(to).toISOString() } : {}),
    ...(showBreakdown ? { breakdown: "true" } : {}),
  };
  const { data, isLoading } = useGetAdminFinanceRollupAnalytics(params);

  async function handleExport() {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ period });
      if (period === "custom" && from) qs.set("from", new Date(from).toISOString());
      if (period === "custom" && to) qs.set("to", new Date(to).toISOString());
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              data-testid="btn-finance-rollup-export"
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
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
                <CardDescription>Revenue, expenses, and investment performance for each vendor over the selected period.</CardDescription>
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byVendor.map((v) => (
                          <TableRow key={v.vendorId} data-testid={`row-finance-rollup-vendor-${v.vendorId}`}>
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
