/**
 * Public receipt confirmation page — no login required.
 * Customer reaches this via a link in the delivery notification email.
 * Route: /confirm-receipt/:token
 */
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle, Package, Truck, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type OrderInfo = {
  id: number;
  customerName: string;
  deliveryStatus: string;
  deliveryStatusLabel: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  totalAmount: number;
  currency: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  customerConfirmedAt: string | null;
  refundNote: string | null;
};

export default function ConfirmReceiptPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{ order: OrderInfo; vendor: { name: string }; items: { productName: string; quantity: number; totalPrice: number }[]; alreadyConfirmed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE_URL}/api/public/orders/confirm/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? "Not found"); }))
      .then(d => { setInfo(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [token]);

  async function handleConfirm() {
    setConfirming(true);
    try {
      const r = await fetch(`${BASE_URL}/api/public/orders/confirm/${token}`, { method: "POST" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed"); }
      setConfirmed(true);
    } catch (e: any) {
      setError(e.message ?? "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <Loader2 className="w-8 h-8 animate-spin text-white" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold">Link Not Found</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
        </CardContent>
      </Card>
    </div>
  );

  if (!info) return null;

  const { order, vendor, items, alreadyConfirmed } = info;
  const isConfirmed = confirmed || alreadyConfirmed || !!order.customerConfirmedAt;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="max-w-md w-full space-y-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Order #{order.id}</h1>
          <p className="text-slate-300">from <span className="font-semibold text-white">{vendor.name}</span></p>
        </div>

        {/* Status card */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Delivery status */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <Truck className="w-5 h-5 text-violet-600" />
              <div>
                <div className="text-xs text-muted-foreground">Delivery Status</div>
                <div className="font-semibold">{order.deliveryStatusLabel}</div>
              </div>
            </div>

            {/* Tracking */}
            {order.trackingNumber && (
              <div className="flex items-center justify-between text-sm border rounded-lg p-3">
                <div>
                  <div className="text-muted-foreground text-xs">Tracking</div>
                  <div className="font-mono font-medium">{order.trackingNumber}</div>
                </div>
                {order.trackingUrl && (
                  <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Track
                    </Button>
                  </a>
                )}
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Items Ordered</div>
              {items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{item.productName} × {item.quantity}</span>
                  <span className="font-medium">{order.currency} {item.totalPrice.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold pt-2 border-t">
                <span>Total</span>
                <span>{order.currency} {order.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Refund note */}
            {order.refundNote && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <div className="font-medium mb-1">Note from {vendor.name}:</div>
                <div>{order.refundNote}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Confirmation action */}
        <Card>
          <CardContent className="pt-6">
            {isConfirmed ? (
              <div className="text-center space-y-3 py-2">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                <h2 className="font-bold text-lg">Receipt Confirmed!</h2>
                <p className="text-muted-foreground text-sm">
                  {alreadyConfirmed && !confirmed
                    ? "You already confirmed receipt of this order."
                    : `You've confirmed you received your order. Thank you, ${order.customerName}!`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Did you receive your order? Confirm so {vendor.name} knows it arrived safely.
                </p>
                <Button
                  className="w-full gap-2 bg-green-600 hover:bg-green-700"
                  onClick={handleConfirm}
                  disabled={confirming}
                >
                  {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {confirming ? "Confirming..." : "✅ Yes, I received my order"}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  If you haven't received your order, contact {vendor.name} directly.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
