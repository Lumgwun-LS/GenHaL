import { useQuery } from "@tanstack/react-query";
import CustomerLayout from "./layout";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function CustomerVendors() {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-vendors"],
    queryFn: () => fetch(`${BASE}/api/customer/vendors`).then(r => r.json()),
  });

  const vendors = data?.vendors ?? [];

  return (
    <CustomerLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">My Vendors</h1>
        <p className="text-muted-foreground text-sm mb-6">Businesses you've shopped with on Awa Biz Suite.</p>

        {isLoading && <div className="text-center py-16 text-muted-foreground animate-pulse">Loading vendors…</div>}

        {!isLoading && vendors.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏪</div>
            <p className="font-bold text-gray-800 mb-2">No vendors yet</p>
            <p className="text-muted-foreground text-sm">When you shop from a vendor, they'll appear here.</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {vendors.map((v: {
            vendorId: number; name: string; logoUrl?: string;
            email?: string; phone?: string; address?: string; latestOrderAt: string;
          }) => (
            <div key={v.vendorId} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-violet-50 flex items-center justify-center text-2xl flex-shrink-0">
                  {v.logoUrl ? <img src={v.logoUrl} className="w-full h-full object-cover" /> : "🏪"}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{v.name}</p>
                  <p className="text-xs text-muted-foreground">Last order: {new Date(v.latestOrderAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {v.email    && <div className="flex items-center gap-1.5"><span>✉️</span>{v.email}</div>}
                {v.phone    && <div className="flex items-center gap-1.5"><span>📞</span>{v.phone}</div>}
                {v.address  && <div className="flex items-center gap-1.5"><span>📍</span>{v.address}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </CustomerLayout>
  );
}
