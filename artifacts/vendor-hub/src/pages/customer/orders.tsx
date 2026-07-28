import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import CustomerLayout from "./layout";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const STATUS_STYLE: Record<string, string> = {
  paid:     "bg-green-100 text-green-700",
  unpaid:   "bg-yellow-100 text-yellow-700",
  failed:   "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-600",
};

export default function CustomerOrders() {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-orders-all"],
    queryFn: () => fetch(`${BASE}/api/customer/orders?limit=50`).then(r => r.json()),
  });

  const orders = data?.orders ?? [];

  return (
    <CustomerLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">My Orders</h1>
        <p className="text-muted-foreground text-sm mb-6">All purchases you've made through Awa Biz Suite stores.</p>

        {isLoading && <div className="text-center py-16 text-muted-foreground animate-pulse">Loading orders…</div>}

        {!isLoading && orders.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📦</div>
            <p className="font-bold text-gray-800 mb-2">No orders yet</p>
            <p className="text-muted-foreground text-sm">Your orders from any Awa Biz Suite vendor will appear here.</p>
          </div>
        )}

        <div className="space-y-3">
          {orders.map((o: {
            id: number; vendorName: string; vendorLogoUrl?: string;
            totalAmount: number; currency: string; paymentStatus: string;
            status: string; createdAt: string; source?: string;
          }) => (
            <Link key={o.id} href={`/customer/orders/${o.id}`}>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-violet-50 flex items-center justify-center text-xl flex-shrink-0">
                  {o.vendorLogoUrl ? <img src={o.vendorLogoUrl} className="w-full h-full object-cover" /> : "🏪"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{o.vendorName ?? "Vendor"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Order #{o.id} · {new Date(o.createdAt).toLocaleDateString()}
                    {o.source === "site" ? " · Website" : o.source === "embed" ? " · Widget" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900">{o.currency} {o.totalAmount.toFixed(2)}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${STATUS_STYLE[o.paymentStatus] ?? "bg-gray-100 text-gray-600"}`}>
                    {o.paymentStatus}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </CustomerLayout>
  );
}
