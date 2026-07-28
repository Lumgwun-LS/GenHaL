import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import CustomerLayout from "./layout";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const STATUS_STYLE: Record<string, string> = {
  paid:     "bg-green-100 text-green-700",
  unpaid:   "bg-yellow-100 text-yellow-700",
  failed:   "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-600",
};

export default function CustomerOrderDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: order, isLoading } = useQuery({
    queryKey: ["customer-order", id],
    queryFn: () => fetch(`${BASE}/api/customer/orders/${id}`).then(r => r.json()),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <CustomerLayout>
        <div className="p-6 text-muted-foreground animate-pulse">Loading order…</div>
      </CustomerLayout>
    );
  }

  if (!order || order.error) {
    return (
      <CustomerLayout>
        <div className="p-6 text-center py-20">
          <div className="text-5xl mb-4">🔍</div>
          <p className="font-bold text-gray-800">Order not found</p>
          <Link href="/customer/orders" className="text-violet-600 text-sm hover:underline mt-2 block">← Back to orders</Link>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <Link href="/customer/orders" className="text-xs text-violet-600 hover:underline font-medium flex items-center gap-1 mb-6">
          ← Back to orders
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Order #{order.id}</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {new Date(order.createdAt).toLocaleString()}
                {order.source === "site" ? " · Website Shop" : order.source === "embed" ? " · Widget" : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_STYLE[order.paymentStatus] ?? "bg-gray-100 text-gray-600"}`}>
                {order.paymentStatus}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{order.status}</span>
            </div>
          </div>

          {/* Vendor */}
          {order.vendor && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 mb-4">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white flex items-center justify-center text-xl border">
                {order.vendor.logoUrl ? <img src={order.vendor.logoUrl} className="w-full h-full object-cover" /> : "🏪"}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{order.vendor.name}</p>
                <p className="text-xs text-muted-foreground">Vendor</p>
              </div>
            </div>
          )}

          {/* Order items */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Items</p>
            <div className="space-y-2">
              {(order.items ?? []).map((item: { id: number; productName: string; quantity: number; unitPrice: number; totalPrice: number }) => (
                <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">× {item.quantity} @ {order.currency} {item.unitPrice.toFixed(2)}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{order.currency} {item.totalPrice.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="font-bold text-gray-700">Total</span>
            <span className="text-xl font-extrabold text-gray-900">{order.currency} {parseFloat(order.totalAmount).toFixed(2)}</span>
          </div>
        </div>

        {/* Delivery info */}
        {(order.customerPhone || order.shippingAddress) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Delivery Details</p>
            <div className="space-y-1.5 text-sm text-gray-700">
              <p><span className="font-medium">Name:</span> {order.customerName}</p>
              {order.customerEmail && <p><span className="font-medium">Email:</span> {order.customerEmail}</p>}
              {order.customerPhone && <p><span className="font-medium">Phone:</span> {order.customerPhone}</p>}
              {order.shippingAddress && <p><span className="font-medium">Address:</span> {order.shippingAddress}</p>}
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
