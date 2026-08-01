/**
 * Admin Customers Panel — lists all registered platform customers with order stats.
 * Shown in the Admin panel under the "Customers" tab.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, ShoppingBag, TrendingUp, UserPlus } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  orderCount: number;
  vendorCount: number;
  totalSpend: number;
  firstOrderAt: string | null;
};

type CustomersPage = {
  customers: Customer[];
  total: number;
  limit: number;
  offset: number;
};

type UsersSummary = {
  vendors: number;
  customers: number;
  platformUsers: number;
  newVendors7d: number;
  newCustomers7d: number;
};

function fmt(n: number) {
  return n.toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminCustomersPanel() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const LIMIT = 50;

  // Debounce search
  function handleSearch(v: string) {
    setSearch(v);
    clearTimeout((window as unknown as Record<string, ReturnType<typeof setTimeout>>)._custSearchTimer);
    (window as unknown as Record<string, unknown>)._custSearchTimer = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(0);
    }, 350);
  }

  const { data: summary } = useQuery<UsersSummary>({
    queryKey: ["admin-users-summary"],
    queryFn: () => authFetch(`${BASE_URL}/api/admin/users-summary`, { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery<CustomersPage>({
    queryKey: ["admin-customers", debouncedSearch, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit:  String(LIMIT),
        offset: String(page * LIMIT),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      return authFetch(`${BASE_URL}/api/admin/customers?${params}`, { credentials: "include" }).then(r => r.json());
    },
    staleTime: 30_000,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Vendors</span>
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-bold">{fmt(summary?.vendors ?? 0)}</div>
            {summary?.newVendors7d != null && (
              <div className="text-xs text-emerald-600 mt-1">+{summary.newVendors7d} this week</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Customers</span>
              <UserPlus className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold">{fmt(summary?.customers ?? 0)}</div>
            {summary?.newCustomers7d != null && (
              <div className="text-xs text-emerald-600 mt-1">+{summary.newCustomers7d} this week</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Platform Users</span>
              <TrendingUp className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold">{fmt(summary?.platformUsers ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">All Clerk signups</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Avg Orders/Customer</span>
              <ShoppingBag className="w-4 h-4 text-violet-500" />
            </div>
            <div className="text-2xl font-bold">
              {summary?.customers
                ? ((data?.customers.reduce((s, c) => s + c.orderCount, 0) ?? 0) / (summary.customers || 1)).toFixed(1)
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>All Customers</CardTitle>
              <CardDescription>People who have registered customer accounts on the platform.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search name or email…"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                className="w-56 h-8 text-sm"
              />
              {data?.total != null && (
                <Badge variant="secondary" className="shrink-0">{fmt(data.total)} total</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground text-sm animate-pulse">Loading customers…</div>
          ) : !data?.customers.length ? (
            <div className="p-10 text-center text-muted-foreground">
              <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">{debouncedSearch ? "No customers match your search." : "No customers yet."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Vendors</TableHead>
                  <TableHead className="text-right">Total Spend</TableHead>
                  <TableHead>First Order</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{c.email}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={c.orderCount > 0 ? "default" : "outline"} className="text-xs">
                        {c.orderCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{c.vendorCount || "—"}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {c.totalSpend > 0 ? `₦${fmt(c.totalSpend)}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(c.firstOrderAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(c.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
              <span>Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => p - 1)} disabled={page === 0}>Prev</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
