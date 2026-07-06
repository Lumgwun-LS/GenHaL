import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { DollarSign, CreditCard, TrendingUp, AlertCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Payment = {
  id: number;
  orderId: number | null;
  vendorId: number;
  provider: string;
  providerReference: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentsSummary = {
  total: number;
  paid: number;
  totalRevenue: number;
  revenueByProvider: { stripe: number; paystack: number };
};

type PaymentsResponse = {
  payments: Payment[];
  summary: PaymentsSummary;
};

async function fetchPayments(params: { vendorId?: string; provider?: string; status?: string }): Promise<PaymentsResponse> {
  const qs = new URLSearchParams();
  if (params.vendorId) qs.set("vendorId", params.vendorId);
  if (params.provider && params.provider !== "all") qs.set("provider", params.provider);
  if (params.status && params.status !== "all") qs.set("status", params.status);

  const res = await fetch(`${BASE_URL}/api/payments?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch payments");
  return res.json();
}

function statusColor(status: string) {
  switch (status) {
    case "paid": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "pending": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
    case "refunded": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function providerBadge(provider: string) {
  if (provider === "stripe") return "bg-violet-500/10 text-violet-400 border-violet-500/20";
  if (provider === "paystack") return "bg-teal-500/10 text-teal-400 border-teal-500/20";
  return "bg-muted text-muted-foreground";
}

export default function Payments() {
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["payments", providerFilter, statusFilter],
    queryFn: () => fetchPayments({ provider: providerFilter, status: statusFilter }),
  });

  // Build chart data: revenue by day
  const chartData = (() => {
    if (!data?.payments) return [];
    const dayMap: Record<string, { stripe: number; paystack: number }> = {};
    for (const p of data.payments.filter((p) => p.status === "paid")) {
      const day = new Date(p.createdAt).toISOString().split("T")[0]!;
      if (!dayMap[day]) dayMap[day] = { stripe: 0, paystack: 0 };
      if (p.provider === "stripe") dayMap[day]!.stripe += p.amount;
      else dayMap[day]!.paystack += p.amount;
    }
    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([day, vals]) => ({
        day: format(new Date(day), "MMM d"),
        Stripe: parseFloat(vals.stripe.toFixed(2)),
        Paystack: parseFloat(vals.paystack.toFixed(2)),
      }));
  })();

  const summary = data?.summary;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground">Track all transactions across Stripe and Paystack.</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-primary">
              ${(summary?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{summary?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{summary?.paid ?? 0} paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Stripe Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-violet-400">
              ${(summary?.revenueByProvider.stripe ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Paystack Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-teal-400">
              ${(summary?.revenueByProvider.paystack ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Revenue by Day (Last 14 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="Stripe" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Paystack" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filters + table */}
      <Card>
        <div className="p-4 border-b flex gap-3 items-center flex-wrap">
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="stripe">Stripe</SelectItem>
              <SelectItem value="paystack">Paystack</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">Loading payments...</TableCell>
              </TableRow>
            ) : data?.payments?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <AlertCircle className="w-8 h-8" />
                    <span>No payments yet.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.payments?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">#{p.id}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={providerBadge(p.provider)}>
                      {p.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.orderId ? `#${p.orderId}` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[140px] truncate" title={p.providerReference}>
                    {p.providerReference}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(p.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColor(p.status)}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {p.currency} {p.amount.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// Import useState at the top (hoisted here for clarity)
import { useState } from "react";
