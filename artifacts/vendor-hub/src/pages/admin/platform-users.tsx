import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface PlatformUser {
  id: number;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  imageUrl: string | null;
  onboardingCompleted: boolean;
  vendorId: number | null;
  vendorTier: string | null;
  vendorStatus: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  orderCount: number;
  pageViewCount: number;
}

interface UserDetail {
  user: PlatformUser;
  vendor: {
    id: number;
    name: string;
    subscriptionTier: string;
    verificationLevel: string;
    status: string;
    country: string;
    industry: string;
    createdAt: string;
  } | null;
  orders: {
    id: number;
    status: string;
    totalAmountKobo: number;
    currency: string;
    customerName: string;
    notes: string | null;
    createdAt: string;
  }[];
  pageViews: {
    id: number;
    platform: string;
    path: string;
    device: string | null;
    country: string | null;
    trafficSource: string | null;
    createdAt: string;
  }[];
}

function formatRelative(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)  return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function formatAmount(kobo: number, currency: string): string {
  const major = kobo / 100;
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(major);
}

function TierBadge({ tier }: { tier: string | null }) {
  const map: Record<string, string> = { free: "secondary", starter: "outline", pro: "default", enterprise: "destructive" };
  return <Badge variant={(map[tier ?? "free"] as any) ?? "secondary"}>{tier ?? "free"}</Badge>;
}

function StatusBadge({ completed }: { completed: boolean }) {
  return completed
    ? <Badge className="bg-green-100 text-green-800 border-green-200">✅ Onboarded</Badge>
    : <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50">⏳ Incomplete</Badge>;
}

function UserAvatar({ user }: { user: PlatformUser }) {
  const initials = (user.name ?? user.email ?? "?").slice(0, 2).toUpperCase();
  return user.imageUrl
    ? <img src={user.imageUrl} alt={initials} className="w-8 h-8 rounded-full object-cover" />
    : <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{initials}</div>;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function UserDetailDialog({ clerkUserId, onClose }: { clerkUserId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"orders" | "activity">("orders");

  useEffect(() => {
    authFetch(`${BASE_URL}/api/admin/platform-users/${clerkUserId}`)
      .then(r => r.json())
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clerkUserId]);

  const u = detail?.user;
  const v = detail?.vendor;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {u && <UserAvatar user={u} />}
            <span>{u?.name ?? u?.email ?? "User"}</span>
            {u && <StatusBadge completed={u.onboardingCompleted} />}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : !detail ? (
          <p className="text-muted-foreground text-sm">Could not load user details.</p>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Profile summary */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Email</span><div className="font-medium">{u?.email ?? "—"}</div></div>
              <div><span className="text-muted-foreground">Phone</span><div className="font-medium">{u?.phone ?? "—"}</div></div>
              <div><span className="text-muted-foreground">First seen</span><div className="font-medium">{u ? new Date(u.firstSeenAt).toLocaleDateString() : "—"}</div></div>
              <div><span className="text-muted-foreground">Last seen</span><div className="font-medium">{u ? formatRelative(u.lastSeenAt) : "—"}</div></div>
              <div><span className="text-muted-foreground">Orders</span><div className="font-bold text-primary">{detail.orders.length}</div></div>
              <div><span className="text-muted-foreground">Page views</span><div className="font-bold text-primary">{u?.pageViewCount ?? 0}</div></div>
            </div>

            {/* Vendor row (if onboarded) */}
            {v && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="font-semibold mb-1">Vendor profile</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Business name</span><div>{v.name}</div></div>
                  <div><span className="text-muted-foreground">Plan</span><div><TierBadge tier={v.subscriptionTier} /></div></div>
                  <div><span className="text-muted-foreground">Country</span><div>{v.country}</div></div>
                  <div><span className="text-muted-foreground">Industry</span><div>{v.industry}</div></div>
                  <div><span className="text-muted-foreground">Status</span><div>{v.status}</div></div>
                  <div><span className="text-muted-foreground">Onboarded</span><div>{new Date(v.createdAt).toLocaleDateString()}</div></div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b">
              {(["orders", "activity"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {t === "orders" ? `🛒 Orders (${detail.orders.length})` : `📊 Activity (${detail.pageViews.length})`}
                </button>
              ))}
            </div>

            {/* Orders */}
            {tab === "orders" && (
              detail.orders.length === 0
                ? <p className="text-muted-foreground text-sm py-4 text-center">No orders found for this user's email.</p>
                : (
                  <div className="space-y-2">
                    {/* Interest summary */}
                    <div className="text-xs text-muted-foreground mb-2">
                      Interests inferred from orders: {(() => {
                        const statusCounts = detail.orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
                        return Object.entries(statusCounts).map(([s, n]) => `${n} ${s}`).join(", ") || "—";
                      })()}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.orders.map(o => (
                          <TableRow key={o.id}>
                            <TableCell className="font-medium">#{o.id}</TableCell>
                            <TableCell>{formatAmount(o.totalAmountKobo, o.currency)}</TableCell>
                            <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                            <TableCell className="text-muted-foreground text-xs">{new Date(o.createdAt).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
            )}

            {/* Activity / page views */}
            {tab === "activity" && (
              detail.pageViews.length === 0
                ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    {u?.onboardingCompleted
                      ? "No dashboard page views recorded yet."
                      : "No activity recorded — user hasn't completed onboarding yet."}
                  </div>
                )
                : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Page</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.pageViews.map(pv => (
                        <TableRow key={pv.id}>
                          <TableCell className="font-mono text-xs max-w-[200px] truncate">{pv.path}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{pv.device ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{pv.country ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{pv.trafficSource ?? "Direct"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatRelative(pv.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PlatformUsersPanel() {
  const [users, setUsers]     = useState<PlatformUser[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState("");
  const [status, setStatus]   = useState("all");
  const [offset, setOffset]   = useState(0);
  const [detail, setDetail]   = useState<string | null>(null); // clerkUserId

  const LIMIT = 50;

  const load = useCallback((search: string, st: string, off: number) => {
    setLoading(true);
    const params = new URLSearchParams({ q: search, status: st, limit: String(LIMIT), offset: String(off) });
    authFetch(`${BASE_URL}/api/admin/platform-users?${params}`)
      .then(r => r.json())
      .then((d: { total: number; users: PlatformUser[] }) => { setUsers(d.users); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(q, status, offset); }, []); // eslint-disable-line

  function search() { setOffset(0); load(q, status, 0); }
  function handleStatus(val: string) { setStatus(val); setOffset(0); load(q, val, 0); }
  function prev() { const o = Math.max(0, offset - LIMIT); setOffset(o); load(q, status, o); }
  function next() { const o = offset + LIMIT; setOffset(o); load(q, status, o); }

  // Derived stats from loaded page
  const completed   = users.filter(u => u.onboardingCompleted).length;
  const pending     = users.filter(u => !u.onboardingCompleted).length;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeRecently = users.filter(u => new Date(u.lastSeenAt).getTime() > sevenDaysAgo).length;

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total signed up"      value={total}           sub="all time" />
        <StatCard label="Onboarding complete"  value={completed}       sub="on this page" />
        <StatCard label="Not yet onboarded"    value={pending}         sub="on this page" />
        <StatCard label="Active (7 days)"      value={activeRecently}  sub="on this page" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search name, email or phone…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={handleStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="completed">Onboarded</SelectItem>
            <SelectItem value="pending">Not yet onboarded</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={search} variant="outline" size="sm">Search</Button>
        <Button onClick={() => { setOffset(0); load(q, status, 0); }} variant="ghost" size="sm">↻ Refresh</Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Users</CardTitle>
          <CardDescription>
            Everyone who has signed up — including users who haven't completed vendor onboarding.
            Click a row to see their full profile, orders, and activity.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <div className="text-3xl mb-3">👥</div>
              <div className="font-medium">No users found</div>
              <div className="text-sm mt-1">Users appear here as soon as they sign in to the platform.</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Page views</TableHead>
                  <TableHead>Signed up</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow
                    key={u.clerkUserId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDetail(u.clerkUserId)}
                  >
                    <TableCell><UserAvatar user={u} /></TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{u.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email ?? "no email"}</div>
                      {u.phone && <div className="text-xs text-muted-foreground">{u.phone}</div>}
                    </TableCell>
                    <TableCell><StatusBadge completed={u.onboardingCompleted} /></TableCell>
                    <TableCell>{u.vendorTier ? <TierBadge tier={u.vendorTier} /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell className="text-right font-bold">{u.orderCount > 0 ? u.orderCount : <span className="text-muted-foreground">0</span>}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{u.pageViewCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(u.firstSeenAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatRelative(u.lastSeenAt)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-xs">View →</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={prev} disabled={offset === 0}>← Prev</Button>
            <Button variant="outline" size="sm" onClick={next} disabled={offset + LIMIT >= total}>Next →</Button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      {detail && <UserDetailDialog clerkUserId={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
