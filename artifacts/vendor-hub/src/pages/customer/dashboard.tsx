import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import CustomerLayout from "./layout";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function CustomerDashboard() {
  const { user } = useUser();

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["customer-me"],
    queryFn: () => fetch(`${BASE}/api/customer/me`).then(r => r.json()),
  });

  const { data: ordersData } = useQuery({
    queryKey: ["customer-orders"],
    queryFn: () => fetch(`${BASE}/api/customer/orders?limit=5`).then(r => r.json()),
  });

  const { data: vendorsData } = useQuery({
    queryKey: ["customer-vendors"],
    queryFn: () => fetch(`${BASE}/api/customer/vendors`).then(r => r.json()),
  });

  const { data: notifsData } = useQuery({
    queryKey: ["customer-notifications-count"],
    queryFn: () => fetch(`${BASE}/api/customer/notifications`).then(r => r.json()),
  });

  // Not onboarded yet
  if (!meLoading && me?.code === "NOT_ONBOARDED") {
    return (
      <CustomerLayout>
        <CustomerOnboarding user={user} />
      </CustomerLayout>
    );
  }

  const recentOrders = ordersData?.orders?.slice(0, 4) ?? [];
  const vendors = vendorsData?.vendors ?? [];
  const unread = notifsData?.unreadCount ?? 0;
  const totalSpend = ordersData?.orders?.filter((o: { paymentStatus: string }) => o.paymentStatus === "paid")
    .reduce((s: number, o: { totalAmount: number }) => s + o.totalAmount, 0) ?? 0;

  return (
    <CustomerLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {me?.name?.split(" ")[0] ?? user?.firstName ?? "there"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">Here's a summary of your activity on Awa Biz Suite.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon="📦" label="Total Orders" value={ordersData?.orders?.length ?? 0} />
          <StatCard icon="🏪" label="Vendors Shopped" value={vendors.length} />
          <StatCard icon="📬" label="Unread Messages" value={unread} />
          <StatCard icon="💳" label="Total Spent"
            value={totalSpend ? `$${totalSpend.toFixed(2)}` : "—"}
            sub="paid orders" />
        </div>

        {/* Profile completion CTA */}
        {me && !me.profileCompleted && (
          <div className="mb-8 rounded-2xl p-5 border-2 border-dashed"
            style={{ borderColor: "#7F50FF40", background: "#7F50FF08" }}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-bold text-gray-900 mb-1">🤖 Unlock Awajimaa AI Dashboard</p>
                <p className="text-sm text-muted-foreground">Complete your profile (phone + location) to access AI content generation, business tools, and more.</p>
              </div>
              <Link href="/customer/profile">
                <button className="px-5 py-2.5 rounded-xl font-bold text-white text-sm whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                  Complete Profile →
                </button>
              </Link>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Recent Orders</h2>
              <Link href="/customer/orders" className="text-xs text-violet-600 hover:underline font-medium">View all →</Link>
            </div>
            {recentOrders.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-8">No orders yet. Start shopping!</p>
              : <div className="space-y-3">
                  {recentOrders.map((o: { id: number; vendorName: string; totalAmount: number; currency: string; paymentStatus: string; createdAt: string }) => (
                    <Link key={o.id} href={`/customer/orders/${o.id}`}>
                      <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg cursor-pointer">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{o.vendorName ?? "Unknown Vendor"}</p>
                          <p className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">{o.currency} {o.totalAmount.toFixed(2)}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            o.paymentStatus === "paid" ? "bg-green-100 text-green-700"
                            : o.paymentStatus === "failed" ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"}`}>{o.paymentStatus}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
            }
          </div>

          {/* My Vendors */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">My Vendors</h2>
              <Link href="/customer/vendors" className="text-xs text-violet-600 hover:underline font-medium">View all →</Link>
            </div>
            {vendors.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-8">No purchases yet.</p>
              : <div className="space-y-3">
                  {vendors.slice(0, 4).map((v: { vendorId: number; name: string; logoUrl?: string; latestOrderAt: string }) => (
                    <div key={v.vendorId} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="w-9 h-9 rounded-xl overflow-hidden bg-violet-50 flex items-center justify-center text-lg flex-shrink-0">
                        {v.logoUrl ? <img src={v.logoUrl} className="w-full h-full object-cover" /> : "🏪"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{v.name}</p>
                        <p className="text-xs text-muted-foreground">Last order: {new Date(v.latestOrderAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}

// ── Onboarding form (first-time visit) ────────────────────────────────────────

function CustomerOnboarding({ user }: { user: ReturnType<typeof useUser>["user"] }) {
  const [name, setName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress ?? "");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`${BASE}/api/customer/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    qc.invalidateQueries({ queryKey: ["customer-me"] });
    setSaving(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-violet-50 to-white">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-8 w-full max-w-md">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-6 mx-auto"
          style={{ background: "linear-gradient(135deg,#7F50FF18,#FF7F5018)" }}>🛒</div>
        <h2 className="text-xl font-bold text-center mb-1">Set Up Your Customer Account</h2>
        <p className="text-muted-foreground text-sm text-center mb-6">Just your name and email to get started.</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} required type="email"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-70"
            style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
            {saving ? "Creating account…" : "Create My Account →"}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
