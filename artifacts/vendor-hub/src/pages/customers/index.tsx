import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users, ShoppingCart, MessageSquare, TicketCheck, TrendingUp } from "lucide-react";

type Customer = {
  email: string;
  name: string;
  avatarUrl: string | null;
  currency: string;
  orderCount: number;
  totalSpent: string;
  ticketCount: number;
  openTickets: number;
  unreadMessages: number;
  totalMessages: number;
  lastActivityAt: string | null;
  sources: string[];
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Avatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl: string | null; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: "hsl(var(--primary))" }}>
      {initials || "?"}
    </div>
  );
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<{ customers: Customer[] }>({
    queryKey: ["vendor-customers", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const r = await fetch(`/api/vendor-customers?${params}`);
      if (!r.ok) throw new Error("Failed to load customers");
      return r.json();
    },
    staleTime: 30_000,
  });

  const customers = data?.customers ?? [];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" /> Customers
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Everyone who has ordered from, messaged, or submitted a ticket to you.
            </p>
          </div>
          {!isLoading && (
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {customers.length} customer{customers.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading customers…</div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-semibold">No customers yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "No customers match your search." : "Customers will appear here once they place an order, send a message, or submit a ticket."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {customers.map(c => (
              <div
                key={c.email}
                onClick={() => navigate(`/customers/${encodeURIComponent(c.email)}`)}
                className="bg-card border rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <Avatar name={c.name} avatarUrl={c.avatarUrl} size={44} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{c.name}</span>
                    {c.openTickets > 0 && (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0">
                        {c.openTickets} open ticket{c.openTickets !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {c.unreadMessages > 0 && (
                      <Badge className="text-xs px-1.5 py-0 bg-blue-500 hover:bg-blue-500">
                        {c.unreadMessages} unread
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{c.email}</p>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-5 text-sm shrink-0">
                  {c.orderCount > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <ShoppingCart className="h-3.5 w-3.5" />
                      <span>{c.orderCount} order{c.orderCount !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                  {c.orderCount > 0 && parseFloat(c.totalSpent) > 0 && (
                    <div className="flex items-center gap-1 font-medium">
                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                      <span>{c.currency} {parseFloat(c.totalSpent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {c.totalMessages > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{c.totalMessages}</span>
                    </div>
                  )}
                  {c.ticketCount > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <TicketCheck className="h-3.5 w-3.5" />
                      <span>{c.ticketCount}</span>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(c.lastActivityAt)}
                  </span>
                </div>

                <span className="text-muted-foreground text-lg hidden sm:block">›</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
